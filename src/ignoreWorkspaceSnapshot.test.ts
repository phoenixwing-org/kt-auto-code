import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ktcCollectIgnoreWorkspaceSnapshot } from "./ignoreWorkspaceSnapshot.js";

const tempDirectories: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "kt-ignore-analysis-"));
  tempDirectories.push(root);
  return root;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ignoreWorkspaceSnapshot", () => {
  it("收集 CAA/CMake/Web 特征并合并现有 Ignore", () => {
    const root = tempRoot();
    mkdirSync(join(root, "PNXDemo", "IdentityCard"), { recursive: true });
    mkdirSync(join(root, "PNXDemo", "DemoMod.m"), { recursive: true });
    mkdirSync(join(root, "win_b64", "large-output"), { recursive: true });
    mkdirSync(join(root, ".phoenix"), { recursive: true });
    writeFileSync(join(root, "PNXDemo", "DemoMod.m", "Imakefile.mk"), "");
    writeFileSync(join(root, "CMakeLists.txt"), "");
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, ".gitignore"), "build/\nnode_modules/\n");
    writeFileSync(join(root, ".phoenix", ".ignore"), "build/\nwin_b64/\n");

    const snapshot = ktcCollectIgnoreWorkspaceSnapshot(root);
    expect(snapshot.paths).toEqual(expect.arrayContaining([
      "PNXDemo/IdentityCard/", "PNXDemo/DemoMod.m/", "PNXDemo/DemoMod.m/Imakefile.mk",
      "win_b64/", "CMakeLists.txt", "package.json",
    ]));
    expect(snapshot.paths).not.toContain("win_b64/large-output/");
    expect(snapshot.existingPatterns).toEqual(["build/", "node_modules/", "win_b64/"]);
    expect(snapshot.truncated).toBe(false);

    const dirtyDocumentSnapshot = ktcCollectIgnoreWorkspaceSnapshot(root, {
      phoenixIgnorePatterns: ["Objects/"],
    });
    expect(dirtyDocumentSnapshot.existingPatterns)
      .toEqual(["build/", "node_modules/", "Objects/"]);
  });

  it("达到条目上限时标记截断", () => {
    const root = tempRoot();
    for (let index = 0; index < 120; index++) writeFileSync(join(root, `file-${index}.txt`), "");
    const snapshot = ktcCollectIgnoreWorkspaceSnapshot(root, { maxEntries: 100 });
    expect(snapshot.paths).toHaveLength(100);
    expect(snapshot.truncated).toBe(true);
  });
});
