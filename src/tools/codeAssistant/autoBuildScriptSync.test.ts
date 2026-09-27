import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
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
  await mkdir(root, { recursive: true });
  const files = ktcResolveAutoBuildScriptSyncFiles(extensionRoot, root);
  await Promise.all(files.map(async (file, index) => {
    await mkdir(dirname(file.source), { recursive: true });
    await writeFile(file.source, `source-${index}`);
  }));
  return { extensionRoot, root };
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("AutoBuild script synchronization", () => {
  it("完整清单的源文件真实存在，保留 TOML 配置且不恢复旧 YAML 样例", async () => {
    const extensionRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const files = ktcResolveAutoBuildScriptSyncFiles(extensionRoot, "/unused-root");
    expect(new Set(files.map(({ target }) => target)).size).toBe(files.length);
    expect(files.map(({ source }) => source)).toContain(join(extensionRoot, "scripts", "sample", "cleanup.toml"));
    expect(files.map(({ source }) => source)).not.toContain(join(extensionRoot, "scripts", "sample", "cleanup.yaml"));
    await Promise.all(files.map(({ source }) => access(source)));
  });

  it("把共享实现同步到 ROOT/tools，把 cleanup 示例同步到 ROOT/sample", async () => {
    const { extensionRoot, root } = await fixture();
    const files = ktcResolveAutoBuildScriptSyncFiles(extensionRoot, root);
    expect(files).toHaveLength(54);
    expect(files.map(({ target }) => target)).toEqual(expect.arrayContaining([
      join(root, "tools", "Invoke-AutoBuild.ps1"),
      join(root, "tools", "Functions-Cleanup.ps1"),
      join(root, "sample", "cleanup.ps1"),
      join(root, "sample", "cleanup.toml"),
      join(root, "tools", "caaAll.ps1"),
      join(root, "tools", "linkCAA.ps1"),
      join(root, "tools", "linkWinb64.ps1"),
      join(root, "tools", "clang-format", ".clang-format"),
      join(root, "sample", "linkOut.ps1"),
    ]));
    await mkdir(join(root, "tools"), { recursive: true });
    await writeFile(files[0]!.target, "old");

    await expect(ktcInspectAutoBuildScriptSync(extensionRoot, root))
      .resolves.toMatchObject({ status: "missing" });
    const results = await ktcSyncAutoBuildScripts(extensionRoot, root);

    expect(results[0]?.operation).toBe("replace");
    expect(results.slice(1).every(({ operation }) => operation === "create")).toBe(true);
    await expect(readFile(files[0]!.target, "utf8")).resolves.toBe("source-0");
    await expect(readFile(files.at(-1)!.target, "utf8")).resolves.toBe(`source-${files.length - 1}`);
    await expect(ktcInspectAutoBuildScriptSync(extensionRoot, root))
      .resolves.toMatchObject({ status: "same" });

    await writeFile(files[2]!.target, "changed");
    await expect(ktcInspectAutoBuildScriptSync(extensionRoot, root))
      .resolves.toMatchObject({ status: "different" });
    await expect(access(join(root, "README.md"))).rejects.toThrow();
  });
});
