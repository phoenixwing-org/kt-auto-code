import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("vscode", () => ({ workspace: { textDocuments: [] } }));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readdir: vi.fn(actual.readdir), readFile: vi.fn(actual.readFile) };
});
import { ktcPreviewPackageIncludes, ktcApplyPackageIncludes } from "./packageIncludeService.js";
import { resolveWorkspaceIgnorePatterns, ktcUseBuiltInIgnore, type KtcWorkspaceIgnoreSourceOptions } from "../../ignoreConfig.js";

const temporaryRoots: string[] = [];
afterEach(async () => { for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ktc-include-pruning-")); temporaryRoots.push(root);
  const include = join(root, "include"), target = join(root, "target");
  await mkdir(join(include, "KtCore", "source"), { recursive: true }); await mkdir(target);
  await writeFile(join(include, "KtCore", "source", "Live.h"), "#pragma once\n");
  await writeFile(join(target, "Live.cpp"), '#include "Live.h"\n');
  return { include, target };
}
it.each(["builtIn", "git", "custom"] as const)("%s 在双根进入前剪枝；500 个被忽略头文件/源文件不被枚举或读取", async (source) => {
  const { include, target } = await fixture();
  const coreName = source === "builtIn" ? "build" : "ignored-source";
  const targetName = source === "builtIn" ? "objects" : "ignored-target";
  const excluded = [join(include, coreName), join(target, targetName)];
  for (const base of excluded) {
    await mkdir(join(base, "deep"), { recursive: true });
    await Promise.all(Array.from({ length: 250 }, (_, i) => writeFile(join(base, "deep", `${i}.h`), '#include "Live.h"\n')));
  }
  const policy: KtcWorkspaceIgnoreSourceOptions = { ignoreEnabled: true, builtInIgnoreEnabled: source === "builtIn", gitIgnoreEnabled: source === "git", customIgnoreEnabled: source === "custom" };
  if (source !== "builtIn") {
    for (const [base, rule] of [[include, coreName], [target, targetName]]) {
      await mkdir(join(base!, source === "git" ? ".git" : ".phoenix"));
      await writeFile(join(base!, source === "git" ? ".gitignore" : ".phoenix/.ignore"), `${rule}/\n`);
    }
    // The Package rule must not leak into the independent target root.
    await mkdir(join(target, coreName)); await writeFile(join(target, coreName, "Keep.cpp"), '#include "Live.h"\n');
  }
  vi.mocked(readdir).mockClear(); vi.mocked(readFile).mockClear();
  const start = performance.now();
  const result = await ktcPreviewPackageIncludes({ coreIncludeDirectory: include, targetDirectory: target,
    coreIgnorePatterns: resolveWorkspaceIgnorePatterns(include, policy), targetIgnorePatterns: resolveWorkspaceIgnorePatterns(target, policy), useBuiltInIgnore: ktcUseBuiltInIgnore(policy) });
  const visited = vi.mocked(readdir).mock.calls.map(([path]) => String(path));
  const reads = vi.mocked(readFile).mock.calls.map(([path]) => String(path));
  for (const ignored of excluded) {
    expect(visited.some((path) => path === ignored || path.startsWith(ignored + "/"))).toBe(false);
    expect(reads.some((path) => path.startsWith(ignored + "/"))).toBe(false);
  }
  expect(result.preview.headerCount).toBe(1);
  expect(result.preview.scannedFileCount).toBe(source === "builtIn" ? 1 : 2);
  expect(result.preview.rows).toHaveLength(result.preview.scannedFileCount);
  console.info(`[Package 剪枝:${source}] ${visited.length} 次目录读取，${reads.length} 次源文件读取，500 个排除文件未遍历；${(performance.now() - start).toFixed(1)}ms（临时样例，非性能基线）`);
});
it("预览后 Package 新增同名头文件使映射失效，目标文件保持不变", async () => {
  const { include, target } = await fixture();
  const preview = await ktcPreviewPackageIncludes({ coreIncludeDirectory: include, targetDirectory: target });
  await mkdir(join(include, "Other", "source"), { recursive: true }); await writeFile(join(include, "Other", "source", "Live.h"), "#pragma once\n");
  await expect(ktcApplyPackageIncludes(preview)).rejects.toThrow("Package 头文件映射输入已改变");
  expect(await readFile(join(target, "Live.cpp"), "utf8")).toBe('#include "Live.h"\n');
});
