import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOCAL_WING_ALL_PACKAGES,
  discoverLocalWingPackages,
  getDefaultLocalWingRoot,
  localWingBuildContextFromEnvironment,
  resolveLocalWingImport,
  resolveLocalWingRoot,
  validateRequiredLocalWingPackages,
  verifyLocalWingBuildResults,
} from "../scripts/local-wing-resolution.mjs";

function createWingPackage(root: string, name: string) {
  const folder = name.slice("@phoenix-wing/".length);
  const packageRoot = resolve(root, "packages", folder);
  mkdirSync(resolve(packageRoot, "dist", "table"), { recursive: true });
  mkdirSync(resolve(packageRoot, "tests", "fixtures", "contracts"), { recursive: true });
  writeFileSync(resolve(packageRoot, "package.json"), JSON.stringify({
    name,
    scripts: { build: "tsc" },
    exports: {
      ".": { import: "./dist/index.js" },
      "./table": { import: "./dist/table/index.js" },
      "./fixtures/*": "./tests/fixtures/contracts/*",
    },
  }));
  writeFileSync(resolve(packageRoot, "dist", "index.js"), "export {};\n");
  writeFileSync(resolve(packageRoot, "dist", "table", "index.js"), "export {};\n");
  writeFileSync(resolve(packageRoot, "tests", "fixtures", "contracts", "sample.json"), "{}\n");
}

function createFakeWing() {
  const root = mkdtempSync(resolve(tmpdir(), "kt-auto-local-wing-"));
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ name: "phoenix-wing", private: true }));
  mkdirSync(resolve(root, "packages"));
  for (const packageName of LOCAL_WING_ALL_PACKAGES) createWingPackage(root, packageName);
  return root;
}

describe("本地 Wing 并列开发解析", () => {
  it("缺省固定解析 Auto 同级 phoenix-wing", () => {
    expect(getDefaultLocalWingRoot("/workspace/kt-auto-code")).toBe("/workspace/phoenix-wing");
  });

  it("显式根目录有效时发现全部 Code 与 CAD 包", () => {
    const root = createFakeWing();
    const resolved = resolveLocalWingRoot({
      repoRoot: "/unused/kt-auto-code",
      environment: { PHOENIX_WING_ROOT: root },
    });
    expect(resolved).toBe(root);
    expect([...validateRequiredLocalWingPackages(root).keys()]).toEqual(
      expect.arrayContaining([...LOCAL_WING_ALL_PACKAGES]),
    );
  });

  it("解析主入口、子入口与 fixtures 通配导出到本地仓库", () => {
    const root = createFakeWing();
    const packages = discoverLocalWingPackages(root);
    expect(resolveLocalWingImport("@phoenix-wing/kt-codegen", packages)).toBe(
      resolve(root, "packages/kt-codegen/dist/index.js"),
    );
    expect(resolveLocalWingImport("@phoenix-wing/kt-codegen/table", packages)).toBe(
      resolve(root, "packages/kt-codegen/dist/table/index.js"),
    );
    expect(resolveLocalWingImport("@phoenix-wing/kt-codegen/fixtures/sample.json", packages)).toBe(
      resolve(root, "packages/kt-codegen/tests/fixtures/contracts/sample.json"),
    );
  });

  it("要求显式受控模式，避免正式 build 泄漏本地环境变量", () => {
    const root = createFakeWing();
    expect(() => localWingBuildContextFromEnvironment({
      repoRoot: "/unused/kt-auto-code",
      environment: { PHOENIX_WING_ROOT: root },
    })).toThrow(/受控本地开发模式/u);
  });

  it("metafile 门禁确认五包来自本地且拒绝 consumer node_modules", () => {
    const root = createFakeWing();
    const localInputs = LOCAL_WING_ALL_PACKAGES.reduce<Record<string, unknown>>((inputs, packageName) => {
      const folder = packageName.slice("@phoenix-wing/".length);
      inputs[resolve(root, "packages", folder, "dist/index.js")] = {};
      return inputs;
    }, {});
    expect(() => verifyLocalWingBuildResults({
      results: [{ metafile: { inputs: localInputs } }],
      wingRoot: root,
      expectedPackages: LOCAL_WING_ALL_PACKAGES,
    })).not.toThrow();
    expect(() => verifyLocalWingBuildResults({
      results: [{ metafile: { inputs: {
        ...localInputs,
        "/consumer/node_modules/.pnpm/@phoenix-wing+code-core@0.4.3/node_modules/@phoenix-wing/code-core/dist/index.js": {},
      } } }],
      wingRoot: root,
      expectedPackages: LOCAL_WING_ALL_PACKAGES,
    })).toThrow(/consumer node_modules/u);
  });

  it("本地仓库缺失时提示 Registry 对照命令", () => {
    expect(() => resolveLocalWingRoot({
      repoRoot: "/missing/kt-auto-code",
      environment: {},
    })).toThrow(/pnpm dev:registry/u);
  });

  it("根命令、并列 CAD 接线和 Registry 清理脚本保持显式", () => {
    const root = resolve(import.meta.dirname, "..");
    const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const codeBuild = readFileSync(resolve(root, "esbuild.mjs"), "utf8");
    const cadSiblingResolution = readFileSync(resolve(root, "scripts/cad-sibling-resolution.mjs"), "utf8");
    const registryLauncher = readFileSync(resolve(root, "scripts/develop-registry-wing.mjs"), "utf8");
    const localLauncher = readFileSync(resolve(root, "scripts/develop-local-wing.mjs"), "utf8");
    const markerRuntimeCheck = readFileSync(
      resolve(root, "scripts/verify-local-wing-marker-runtime.mjs"),
      "utf8",
    );
    expect(manifest.scripts.dev).toBe("pnpm ext:dev");
    expect(manifest.scripts["dev:registry"]).toBe("pnpm ext:dev:registry");
    expect(manifest.scripts["ext:dev:code:prepare"]).toContain("--code-only --prepare-only");
    expect(manifest.scripts["ext:dev:registry:prepare"]).toContain("--prepare-only");
    expect(codeBuild).toContain("verifyLocalWingBuildResults");
    expect(codeBuild).toContain("__KTC_WING_BUILD_MODE__");
    expect(codeBuild).toContain("__KTC_WING_BUILD_ROOT__");
    expect(codeBuild).toContain('localWing ? "local" : "registry"');
    expect(cadSiblingResolution).toContain('resolve(repoRoot, "..", "kt-auto-cad")');
    expect(localLauncher).toContain('run(pnpm, ["--dir", cadRoot, "dev:prepare"]');
    expect(localLauncher).toContain("verify-local-wing-marker-runtime.mjs");
    expect(localLauncher.indexOf("verify-local-wing-marker-runtime.mjs")).toBeLessThan(
      localLauncher.indexOf("const localEnvironment"),
    );
    expect(markerRuntimeCheck).toContain("bom-analysis-two-missing-ends.cpp");
    expect(markerRuntimeCheck).toContain('code === "marker.missing-end"');
    expect(markerRuntimeCheck).toContain('code === "marker.nested-start"');
    expect(markerRuntimeCheck).toContain('code === "marker.mismatched-end"');
    expect(registryLauncher).toContain("delete environment[LOCAL_WING_ENV]");
    expect(registryLauncher).toContain("delete environment[LOCAL_WING_MODE_ENV]");
  });
});
