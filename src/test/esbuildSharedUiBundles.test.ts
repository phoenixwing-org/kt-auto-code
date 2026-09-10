import { readFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";
import { localWingBuildContextFromEnvironment } from "../../scripts/local-wing-resolution.mjs";

const localWing = localWingBuildContextFromEnvironment();

const SHARED_UI_BUNDLES = Object.freeze([
  ["src/ui/KtcPrimaryShellEntry.ts", "dist/ktc-primary-shell.js"],
  ["src/ui/KtcDirectoryBarEntry.ts", "dist/ktc-directory-bar.js"],
  ["src/ui/KtcToolbarStripEntry.ts", "dist/ktc-toolbar-strip.js"],
  ["src/ui/KtcCurrentToolRegionEntry.ts", "dist/ktc-current-tool-region.js"],
  ["src/ui/KtcOpenItemsBarEntry.ts", "dist/ktc-open-items-bar.js"],
  ["src/ui/KtcRightViewShellEntry.ts", "dist/ktc-right-view-shell.js"],
  ["src/ui/PnwComboEntry.ts", "dist/pnw-combo.js"],
] as const);

const EXISTING_TOOL_NAVIGATOR_BUNDLE = Object.freeze([
  "src/ui/KtcToolNavigatorEntry.ts",
  "dist/ktc-tool-navigator.js",
] as const);

describe("esbuild shared Web Component bundles", () => {
  it("锁定七个正式共享 Entry 的独立输出名，且不重复已有 ToolNavigator Entry", async () => {
    const source = await readFile(path.resolve("esbuild.mjs"), "utf8");

    for (const [entryPoint, outfile] of SHARED_UI_BUNDLES) {
      expect(source).toContain(`{ entryPoint: "${entryPoint}", outfile: "${outfile}" }`);
      expect(occurrences(source, entryPoint)).toBe(1);
      expect(occurrences(source, outfile)).toBe(1);
    }

    for (const value of EXISTING_TOOL_NAVIGATOR_BUNDLE) {
      expect(occurrences(source, value)).toBe(1);
    }
    expect(source).not.toContain("KtcSystemOutputBlockEntry.ts");
    expect(source).toContain('const previewOnlyLegacyBundleOutputs = ["dist/ktc-system-output-block.js"]');
    expect(source).toContain("previewOnlyLegacyBundleOutputs.flatMap");
  });

  it("非 watch 与 watch 构建都消费同一份共享组件配置", async () => {
    const source = await readFile(path.resolve("esbuild.mjs"), "utf8");

    expect(source).toContain("...sharedUiComponentOptions,");
    expect(source).toContain("buildOptions.map((options) => esbuild.build(options))");
    expect(source).toContain("sharedUiComponentOptions.map((options) => esbuild.context(options))");
    expect(source).toContain("...sharedUiComponentContexts.map((context) => context.watch()),");
  });

  it("所有共享组件 Entry 都能作为独立 browser IIFE 编译", async () => {
    const entryPoints = [
      ...SHARED_UI_BUNDLES.map(([entryPoint]) => entryPoint),
      EXISTING_TOOL_NAVIGATOR_BUNDLE[0],
    ];

    await Promise.all(entryPoints.map(async (entryPoint) => {
      const result = await esbuild.build({
        absWorkingDir: path.resolve("."),
        entryPoints: [entryPoint],
        bundle: true,
        plugins: (localWing?.plugins ?? []) as esbuild.Plugin[],
        metafile: true,
        write: false,
        outfile: "out.js",
        platform: "browser",
        format: "iife",
        target: "es2022",
        logLevel: "silent",
      });
      expect(result.outputFiles).toHaveLength(1);
      expect(result.outputFiles?.[0]?.text.length).toBeGreaterThan(0);
      if (localWing) {
        expect(Object.keys(result.metafile?.inputs ?? {}).filter((input) => /node_modules\/.*@phoenix-wing/u.test(normalizePath(input)))).toEqual([]);
      }
    }));
  });

  it("Extension Host 主入口图不包含 Preview 或浏览器注册 Entry", async () => {
    const result = await esbuild.build({
      absWorkingDir: path.resolve("."),
      entryPoints: ["src/extension.ts"],
      bundle: true,
      write: false,
      metafile: true,
      external: ["vscode"],
      packages: "external",
      platform: "node",
      format: "cjs",
      target: "node18",
      logLevel: "silent",
      define: {
        __KTC_WING_BUILD_MODE__: JSON.stringify("registry"),
        __KTC_WING_BUILD_ROOT__: JSON.stringify(""),
      },
    });
    const inputs = Object.keys(result.metafile?.inputs ?? {}).map(normalizePath);

    expect(inputs.filter((input) => input.includes("ui-preview/"))).toEqual([]);
    for (const [entryPoint] of SHARED_UI_BUNDLES) {
      expect(inputs).not.toContain(entryPoint);
    }
    expect(inputs).not.toContain(EXISTING_TOOL_NAVIGATOR_BUNDLE[0]);
  });

  it("发布制品门禁要求七个正式共享组件 bundle 且禁止 Host 能力渗入", async () => {
    const verifier = await readFile(path.resolve("scripts/verify-extension-artifacts.mjs"), "utf8");

    for (const [, outfile] of SHARED_UI_BUNDLES) {
      expect(verifier).toContain(`["${outfile.slice("dist/".length)}"`);
    }
    expect(verifier).toContain('sharedBundle.includes("acquireVsCodeApi")');
    expect(verifier).toContain('sharedBundle.includes("postMessage")');
    expect(verifier).toContain('sharedBundle.includes("workspace.fs")');
    expect(verifier).toContain('"extension/dist/ktc-system-output-block.js"');
    expect(verifier).toContain("forbiddenPreviewOnlyArtifacts.has(name)");
    expect(verifier).toContain('/(?:^|\\/)ui-preview(?:\\/|$)/u.test(name)');
    expect(verifier).toContain('"extension/dist/auto-build-view.js"');
    expect(verifier).toContain("legacyAutoBuildRightHtmlMarkers.some");
    expect(verifier).toContain("legacyAutoBuildRightEntryMarkers.some");
    for (const requiredScript of [
      "extension/scripts/auto-build/Invoke-AutoBuild.ps1",
      "extension/scripts/auto-build/Functions-Cleanup.ps1",
      "extension/scripts/sample/cleanup.ps1",
      "extension/scripts/sample/cleanup.yaml",
    ]) {
      expect(verifier).toContain(requiredScript);
    }
    for (const marker of ['<div class="toolbar"><button id="open"', '<label class="clean"><input id="clean"', "Root 编排脚本", "rootScriptStatus", "syncRootScript", ".toolbar[hidden]", ".clean[hidden]"]) {
      expect(verifier).toContain(marker);
    }
  });

  it("发布制品门禁锁定 Directory 显隐、Ignore、Settings 的 Header 顺序", async () => {
    const verifier = await readFile(path.resolve("scripts/verify-extension-artifacts.mjs"), "utf8");

    expect(verifier).toContain('["ktAutoCode.directory.hide", "navigation@5"]');
    expect(verifier).toContain('["ktAutoCode.directory.show", "navigation@5"]');
    expect(verifier).toContain('["ktAutoCode.ignore.openAdvanced", "navigation@10"]');
    expect(verifier).toContain('["ktAutoCode.environment.open", "navigation@20"]');
  });
});

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}
