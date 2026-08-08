import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDefaultCadSiblingRoot,
  resolveCadSiblingRoot,
} from "../scripts/cad-sibling-resolution.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("KT Auto CAD 并列仓库解析", () => {
  it("Auto 仓库不再保留 CAD 源码副本", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    expect(existsSync(resolve(repoRoot, "extensions", "kt-auto-cad"))).toBe(false);
  });

  it("固定解析 Auto 同级 kt-auto-cad", () => {
    expect(getDefaultCadSiblingRoot("/workspace/kt-auto-code")).toBe("/workspace/kt-auto-cad");
  });

  it("验证并列仓库 manifest 身份", () => {
    const root = mkdtempSync(resolve(tmpdir(), "kt-auto-cad-sibling-"));
    temporaryRoots.push(root);
    const autoRoot = resolve(root, "kt-auto-code");
    const cadRoot = resolve(root, "kt-auto-cad");
    mkdirSync(autoRoot);
    mkdirSync(cadRoot);
    writeFileSync(resolve(cadRoot, "package.json"), JSON.stringify({ name: "kt-auto-cad" }));
    expect(resolveCadSiblingRoot({ repoRoot: autoRoot })).toBe(cadRoot);
  });

  it("缺失时提示 Code-only 命令", () => {
    const root = mkdtempSync(resolve(tmpdir(), "kt-auto-cad-missing-"));
    temporaryRoots.push(root);
    expect(() => resolveCadSiblingRoot({ repoRoot: resolve(root, "kt-auto-code") }))
      .toThrow(/pnpm ext:dev:code/u);
  });
});
