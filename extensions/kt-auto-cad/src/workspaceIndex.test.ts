import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildCadWorkspaceIndex, writeCadWorkspaceIndex } from "./workspaceIndex.js";

describe("KT Auto CAD TypeScript workspace index", () => {
  it("builds resolved references and a recursive basic BOM without Rust", () => {
    const plan = buildCadWorkspaceIndex([
      record("asm/100.001-H-Root.ASSY.FCStd", [
        { file: "../parts/200.001-S-Bracket.FCStd", label: "支架" },
      ]),
      record("parts/200.001-S-Bracket.FCStd", [
        { file: "300.001-S-Bolt.FCStd", label: "螺栓" },
      ]),
      record("parts/300.001-S-Bolt.FCStd", []),
    ]);

    expect(plan.assets).toHaveLength(3);
    expect(plan.references.map((row) => [row.hostRelativePath, row.targetRelativePath, row.status])).toEqual([
      ["asm/100.001-H-Root.ASSY.FCStd", "parts/200.001-S-Bracket.FCStd", "resolved"],
      ["parts/200.001-S-Bracket.FCStd", "parts/300.001-S-Bolt.FCStd", "resolved"],
    ]);
    expect(plan.bomLines.filter((row) => row.assemblyRelativePath === "asm/100.001-H-Root.ASSY.FCStd"))
      .toEqual([
        expect.objectContaining({ partKey: "200.001", depth: 1, cycleDetected: false }),
        expect.objectContaining({ partKey: "300.001", depth: 2, cycleDetected: false }),
      ]);
  });

  it("keeps unparsed files searchable and records unresolved lightweight BOM rows", () => {
    const plan = buildCadWorkspaceIndex([
      { ...record("asm/100.001-H-Root.ASSY.FCStd", [{ file: "missing.FCStd", label: "缺失" }]), parseError: "bad zip" },
    ]);
    expect(plan.parseFailures).toBe(1);
    expect(plan.references[0]).toMatchObject({ status: "missing", targetRelativePath: null });
    expect(plan.bomLines[0]).toMatchObject({ partRelativePath: "missing.FCStd", quantity: 1 });
  });

  it("refuses to relabel an existing incompatible database as Schema v13", async () => {
    const directory = mkdtempSync(join(tmpdir(), "kt-auto-cad-index-"));
    const databasePath = join(directory, "phoenix-workspace.sqlite");
    writeFileSync(databasePath, "existing database");
    const exec = vi.fn();
    const close = vi.fn();
    const database = {
      exec,
      close,
      prepare: (sql: string) => ({
        get: () => sql.includes("phoenix_meta") ? { value: "12" } : undefined,
        all: () => [],
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
      }),
    };
    try {
      await expect(writeCadWorkspaceIndex(
        databasePath,
        directory,
        buildCadWorkspaceIndex([]),
        async () => ({ DatabaseSync: class { constructor() { return database; } } as never }),
      )).rejects.toThrow(/不会自动迁移/);
      expect(exec).toHaveBeenCalledWith("PRAGMA foreign_keys = ON;");
      expect(exec.mock.calls.some(([sql]) => String(sql).includes("CREATE TABLE"))).toBe(false);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function record(relativePath: string, xlinks: readonly { file: string; label: string }[]) {
  return {
    relativePath,
    filename: relativePath.split("/").at(-1)!,
    documentKind: relativePath.toLowerCase().includes(".assy.") ? "Assembly" : "Part",
    sizeBytes: 1024,
    objectCount: 1,
    xlinks,
  };
}
