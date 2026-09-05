#!/usr/bin/env node
/**
 * 启动同时加载 KT Auto Code 与 KT Auto CAD 的 Extension Development Host。
 * 窗口为空时，在 Host 里点「最近」或 文件→打开文件夹 即可。
 *
 * 用法: pnpm ext:launch
 *       pnpm ext:launch:code
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  writeCodegenFixtureBaseline,
  writeCodegenFixtureQaReport,
} from "./codegen-fixture-qa.mjs";
import {
  isLocalWingExtensionHostEnvironment,
  LOCAL_EXTENSION_SNAPSHOT_PREVIEW_ROOT,
  snapshotExtensionPaths,
} from "./extension-host-snapshot.mjs";
import { resolveCadSiblingRoot } from "./cad-sibling-resolution.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codeExtensionPath = repoRoot;
const codeExtensionVersion = String(JSON.parse(
  readFileSync(resolve(codeExtensionPath, "package.json"), "utf8"),
).version ?? "unknown");
const codeOnly = process.argv.includes("--code-only");
const cadRootArgument = process.argv
  .find((argument) => argument.startsWith("--cad-root="))
  ?.slice("--cad-root=".length);
const cadExtensionPath = codeOnly
  ? undefined
  : resolveCadSiblingRoot({ repoRoot, cadRoot: cadRootArgument });
const dryRun = process.argv.includes("--dry-run");
const codegenFixture = process.argv.includes("--codegen-fixture");
const prepareOnly = process.argv.includes("--prepare-only");
const localWingDevelopment = isLocalWingExtensionHostEnvironment();
const CODEGEN_BULK_SOURCE_COUNT = 1200;
const sourceExtensions = codeOnly
  ? [{ id: "kt-auto-code", path: codeExtensionPath }]
  : [
      { id: "kt-auto-code", path: codeExtensionPath },
      { id: "kt-auto-cad", path: cadExtensionPath },
    ];

if (prepareOnly && !codegenFixture) {
  console.error("--prepare-only 只能和 --codegen-fixture 一起使用");
  process.exit(1);
}

if (!dryRun && !prepareOnly) {
  for (const extension of sourceExtensions) {
    if (!existsSync(resolve(extension.path, "dist/extension.js"))) {
      const buildCommand = codeOnly ? "pnpm ext:build" : "pnpm dev";
      console.error(`未找到 ${resolve(extension.path, "dist/extension.js")}，请先执行: ${buildCommand}`);
      process.exit(1);
    }
  }
}

let extensionPaths = sourceExtensions.map((extension) => extension.path);
let extensionSnapshotRoot;
if (localWingDevelopment && !prepareOnly) {
  if (dryRun) {
    extensionPaths = sourceExtensions.map((extension) =>
      join(LOCAL_EXTENSION_SNAPSHOT_PREVIEW_ROOT, extension.id));
  } else {
    const snapshot = snapshotExtensionPaths(sourceExtensions);
    extensionPaths = snapshot.paths;
    extensionSnapshotRoot = snapshot.snapshotRoot;
  }
}

const fixtureTemplatePath = resolve(repoRoot, "tests/fixtures/codegen-manual-workspace");
let workspacePath;
if (codegenFixture) {
  if (!existsSync(fixtureTemplatePath)) {
    console.error(`未找到 Codegen 手测模板: ${fixtureTemplatePath}`);
    process.exit(1);
  }
  if (!dryRun) {
    workspacePath = mkdtempSync(join(tmpdir(), "kt-auto-code-codegen-qa-"));
    cpSync(fixtureTemplatePath, workspacePath, { recursive: true });
    const bulkSourcePath = join(workspacePath, "bulk-source");
    mkdirSync(bulkSourcePath);
    for (let index = 0; index < CODEGEN_BULK_SOURCE_COUNT; index += 1) {
      const suffix = String(index).padStart(4, "0");
      writeFileSync(
        join(bulkSourcePath, `NoCodegenMarker${suffix}.cpp`),
        `namespace manual_qa { constexpr int value_${suffix} = ${index}; }\n`,
      );
    }
    writeCodegenFixtureBaseline(workspacePath);
    writeCodegenFixtureQaReport(workspacePath, codeExtensionVersion);
  }
}

const args = [
  ...(localWingDevelopment ? ["--new-window"] : []),
  ...extensionPaths.map((extensionPath) => `--extensionDevelopmentPath=${extensionPath}`),
];
if (workspacePath) args.push(workspacePath);
const macCode = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
const windowsCodeCandidates = process.platform === "win32"
  ? [
      process.env.VSCODE_EXECUTABLE_PATH,
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
      process.env.ProgramFiles && join(process.env.ProgramFiles, "Microsoft VS Code", "Code.exe"),
      process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "Microsoft VS Code", "Code.exe"),
    ].filter(Boolean)
  : [];
const windowsCode = windowsCodeCandidates.find((candidate) => existsSync(candidate));
const command = process.platform === "win32"
  ? windowsCode
  : process.platform === "darwin" && existsSync(macCode)
    ? macCode
    : "code";

if (!command) {
  console.error(
    "未找到 VS Code Code.exe。请安装 VS Code，或通过 VSCODE_EXECUTABLE_PATH 指定 Code.exe 的完整路径。",
  );
  process.exit(1);
}

console.log(prepareOnly ? "准备 Codegen 手工验收工作区 …" : "启动 VS Code Extension Development Host …");
for (const extensionPath of extensionPaths) console.log(`  插件: ${extensionPath}`);
if (localWingDevelopment && !prepareOnly) {
  console.log(dryRun
    ? `  本地快照: ${LOCAL_EXTENSION_SNAPSHOT_PREVIEW_ROOT}（dry-run，启动时创建）`
    : `  本地快照: ${extensionSnapshotRoot}（与仓库后续构建隔离）`);
  console.log("  窗口: --new-window（会新建 Host；旧 Development Host 不会自动关闭，请只在刚打开的窗口测试）");
  console.log("  更新: 快照不会随仓库重新构建而变化；修改代码后请关闭旧 Host，并重新执行 pnpm dev");
} else {
  console.warn(
    "[extension-host] 当前只加载已有 dist；它可能来自 npm Registry 构建。"
    + "如需测试并列 phoenix-wing，请停止并改用 pnpm dev。",
  );
}
console.log(codegenFixture
  ? `  工作区: ${workspacePath ?? `${fixtureTemplatePath}（运行时复制到临时目录）`}`
  : "  工作区: 空窗口（请选择「最近」或自行打开文件夹）");
if (codegenFixture) console.log("  模式: Codegen 手工验收；临时副本可自由保存、删除和制造冲突");
if (codegenFixture) console.log(`  压测: 运行时生成 ${CODEGEN_BULK_SOURCE_COUNT} 个小源码文件，用于观察/取消首次候选扫描`);
if (workspacePath) console.log(`  验收: pnpm ext:verify:codegen -- ${workspacePath}`);
if (workspacePath) console.log(`  报告: ${join(workspacePath, ".phoenix", "codegen-qa-report.json")}`);
if (workspacePath) console.log(`  进度: pnpm ext:report:codegen -- ${workspacePath}`);
console.log("");
if (prepareOnly) {
  console.log(`CODEGEN_FIXTURE_PATH=${workspacePath}`);
  process.exit(0);
}
console.log("提示: 标题须含 [Extension Development Host]。");

if (dryRun) {
  const dryRunArgs = codegenFixture ? [...args, "<fresh-codegen-fixture-copy>"] : args;
  console.log(`[dry-run] ${command} ${dryRunArgs.join(" ")}`);
  process.exit(0);
}

const child = spawn(command, args, { detached: true, stdio: "ignore" });
child.on("error", (err) => {
  console.error("启动失败:", err.message);
  process.exit(1);
});
child.unref();
