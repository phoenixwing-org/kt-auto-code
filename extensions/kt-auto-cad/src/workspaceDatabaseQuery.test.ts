import { describe, expect, it, vi } from "vitest";
import {
  queryCadWorkspaceSummary,
  type KtcNodeSqliteLoader,
} from "./workspaceDatabaseQuery.js";

const DATABASE = "/workspace/.phoenix/phoenix-workspace.sqlite";

class FakeDatabaseSync {
  static instances: FakeDatabaseSync[] = [];
  readonly close = vi.fn();

  constructor(
    readonly databasePath: string,
    readonly options?: { readOnly?: boolean },
  ) {
    FakeDatabaseSync.instances.push(this);
  }

  exec(): void {}

  prepare(sql: string): {
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
    run: (...params: unknown[]) => { changes: number; lastInsertRowid: number };
  } {
    return {
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      get: () => {
        if (sql.includes("phoenix_meta")) return { value: "13" };
        if (sql.includes("COUNT(DISTINCT host_repo_rel_path)")) return { value: 2 };
        if (sql.includes("COUNT(DISTINCT target_repo_rel_path)")) return { value: 1 };
        if (sql.includes("COUNT(*)") && sql.includes("phoenix_cad_bom_line")) return { value: 3 };
        throw new Error(`unexpected get SQL: ${sql}`);
      },
      all: () => {
        if (sql.includes("AS host_filename")) return [{
          host_repo_rel_path: "cad/root.FCStd",
          host_filename: "root.FCStd",
          link_label: "Assembly",
          ref_kind: "xlink_file_attr",
        }];
        if (sql.includes("AS target_filename")) return [{
          target_repo_rel_path: "cad/part.FCStd",
          target_filename: "part.FCStd",
          link_label: null,
          target_part_number: "P-001",
        }];
        if (sql.includes("SELECT depth, part_rel")) return [{
          depth: 1,
          part_rel: "cad/part.FCStd",
          part_key: "P-001",
          quantity: 2,
          bom_path: "root/P-001",
        }];
        throw new Error(`unexpected all SQL: ${sql}`);
      },
    };
  }
}

const loader: KtcNodeSqliteLoader = async () => ({ DatabaseSync: FakeDatabaseSync });

describe("KT Auto CAD direct workspace database query", () => {
  it("opens node:sqlite read-only and closes it without a Desk provider", async () => {
    FakeDatabaseSync.instances = [];
    const summary = await queryCadWorkspaceSummary(DATABASE, "cad/assembly.FCStd", loader);
    expect(summary.counts).toEqual({ incoming: 2, outgoing: 1, flat_lines: 3 });
    expect(summary.incoming[0]?.host_filename).toBe("root.FCStd");
    expect(summary.outgoing[0]?.target_part_number).toBe("P-001");
    expect(summary.bom[0]?.quantity).toBe(2);
    expect(FakeDatabaseSync.instances).toHaveLength(1);
    expect(FakeDatabaseSync.instances[0]).toMatchObject({
      databasePath: DATABASE,
      options: { readOnly: true },
    });
    expect(FakeDatabaseSync.instances[0]?.close).toHaveBeenCalledOnce();
  });

  it("rejects an unsafe database or workspace path before returning data", async () => {
    await expect(queryCadWorkspaceSummary("workspace.sqlite", "cad/assembly.FCStd", loader))
      .rejects.toThrow(/绝对路径/);
    await expect(queryCadWorkspaceSummary(DATABASE, "../outside.FCStd", loader))
      .rejects.toThrow(/workspace-relative/);
  });

  it("keeps the rest of CAD usable when an older Extension Host lacks node:sqlite", async () => {
    await expect(queryCadWorkspaceSummary(
      DATABASE,
      "cad/assembly.FCStd",
      async () => { throw Object.assign(new Error("unknown builtin"), { code: "ERR_UNKNOWN_BUILTIN_MODULE" }); },
    )).rejects.toThrow(/升级 VS Code/);
  });
});
