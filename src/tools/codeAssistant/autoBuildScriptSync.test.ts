import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ktcInspectAutoBuildScriptSync,
  ktcResolveAutoBuildScriptSyncFiles,
  ktcSyncAutoBuildScripts,
} from "./autoBuildScriptSync.js";

const created: string[] = [];

async function fixture(): Promise<{ extensionRoot: string; root: string }> {
  const base = await mkdtemp(join(tmpdir(), "ktc-script-sync-"));
  created.push(base);
  const extensionRoot = join(base, "extension");
  const root = join(base, "root");
  await Promise.all([
    mkdir(join(extensionRoot, "scripts", "auto-build"), { recursive: true }),
    mkdir(join(extensionRoot, "scripts", "sample"), { recursive: true }),
    mkdir(root, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(extensionRoot, "scripts", "auto-build", "Invoke-AutoBuild.ps1"), "invoke"),
    writeFile(join(extensionRoot, "scripts", "auto-build", "Functions-Cleanup.ps1"), "functions"),
    writeFile(join(extensionRoot, "scripts", "sample", "cleanup.ps1"), "cleanup"),
    writeFile(join(extensionRoot, "scripts", "sample", "cleanup.yaml"), "delete: {}"),
  ]);
  return { extensionRoot, root };
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("AutoBuild script synchronization", () => {
  it("把共享实现同步到 ROOT/tools，把 cleanup 示例同步到 ROOT/sample", async () => {
    const { extensionRoot, root } = await fixture();
    const files = ktcResolveAutoBuildScriptSyncFiles(extensionRoot, root);
    expect(files.map(({ target }) => target)).toEqual([
      join(root, "tools", "Invoke-AutoBuild.ps1"),
      join(root, "tools", "Functions-Cleanup.ps1"),
      join(root, "sample", "cleanup.ps1"),
      join(root, "sample", "cleanup.yaml"),
    ]);
    await mkdir(join(root, "tools"), { recursive: true });
    await writeFile(files[0]!.target, "old");

    await expect(ktcInspectAutoBuildScriptSync(extensionRoot, root))
      .resolves.toMatchObject({ status: "missing" });
    const results = await ktcSyncAutoBuildScripts(extensionRoot, root);

    expect(results.map(({ operation }) => operation)).toEqual(["replace", "create", "create", "create"]);
    await expect(readFile(files[0]!.target, "utf8")).resolves.toBe("invoke");
    await expect(readFile(files[1]!.target, "utf8")).resolves.toBe("functions");
    await expect(readFile(files[2]!.target, "utf8")).resolves.toBe("cleanup");
    await expect(readFile(files[3]!.target, "utf8")).resolves.toBe("delete: {}");
    await expect(ktcInspectAutoBuildScriptSync(extensionRoot, root))
      .resolves.toMatchObject({ status: "same" });

    await writeFile(files[2]!.target, "changed");
    await expect(ktcInspectAutoBuildScriptSync(extensionRoot, root))
      .resolves.toMatchObject({ status: "different" });
    await expect(access(join(root, "README.md"))).rejects.toThrow();
  });
});
