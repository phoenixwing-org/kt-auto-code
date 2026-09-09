import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { verifyLocalWingReceipt } from "./local-wing-artifact-receipt.mjs";
import { verifyRunCleanupBundleImplementations } from "./verify-local-wing-cleanup-runtime.mjs";
import { verifyCodegenTableBundleCheckpointRuntime } from "./verify-codegen-checkpoint-runtime.mjs";
import {
  createArtifactVerificationEvidence,
  readBuildProvenance,
  readVerifiedSha256Sidecar,
  serializeArtifactVerificationEvidence,
  sha256Bytes,
} from "./release-artifact-provenance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localWing = process.argv.slice(2).includes("--local-wing");
const codePackage = readPackage(path.join(root, "package.json"));
const artifacts = [
  {
    kind: "code",
    file: path.join(root, "dist", "vsix", `kt-auto-code-${codePackage.version}.vsix`),
    packagePath: "extension/package.json",
    bundlePath: "extension/dist/extension.js",
    expectedPackage: codePackage,
  },
];

for (const artifact of artifacts) {
  const archive = fs.readFileSync(artifact.file);
  const bytes = archive.byteLength;
  const sha256 = sha256Bytes(archive);
  const artifactPath = path.relative(root, artifact.file).split(path.sep).join("/");
  readVerifiedSha256Sidecar(artifact.file, sha256);
  const provenance = localWing ? verifyLocalWingReceipt(
    JSON.parse(fs.readFileSync(artifact.file.replace(/\.vsix$/u, ".local-wing.json"), "utf8")),
    { artifact: path.basename(artifact.file), version: artifact.expectedPackage.version, sha256, bytes },
  ) : readBuildProvenance(artifact.file, {
    artifact: artifactPath,
    version: artifact.expectedPackage.version,
    sha256,
    bytes,
  });
  const zip = readZip(archive, artifact.file);
  const names = [...zip.keys()].sort();
  const requiredAutoBuildScripts = [
    "extension/scripts/auto-build/Invoke-AutoBuild.ps1",
    "extension/scripts/auto-build/Functions-Cleanup.ps1",
    "extension/scripts/sample/cleanup.ps1",
    "extension/scripts/sample/cleanup.yaml",
  ];
  for (const name of requiredAutoBuildScripts) {
    if (!names.includes(name)) {
      throw new Error(`${artifact.kind} VSIX is missing required AutoBuild script: ${name}`);
    }
  }
  const forbiddenPreviewOnlyArtifacts = new Set([
    "extension/dist/ktc-system-output-block.js",
  ]);
  for (const name of names) {
    if (forbiddenPreviewOnlyArtifacts.has(name)
        || /(?:^|\/)ui-preview(?:\/|$)/u.test(name)
        || /(?:^|\/)(?:\.obsidian|node_modules|src|target)(?:\/|$)/u.test(name)
        || /(?:^|\/)dist\/test(?:\/|$)/u.test(name)
        || /(?:^|\/)[^/]+\.local-wing\.json$/u.test(name)
        || /\.(?:map|rs|exe|dll|dylib|so|sqlite)$/iu.test(name)
        || /(?:^|\/)Cargo\.(?:toml|lock)$/u.test(name)) {
      throw new Error(`${artifact.kind} VSIX contains forbidden file: ${name}`);
    }
  }
  const manifest = JSON.parse(readText(zip, artifact.packagePath));
  const bundle = readText(zip, artifact.bundlePath);
  verifyRunCleanupBundleImplementations(bundle, `${artifact.kind} VSIX`);
  if (localWing && !bundle.includes(JSON.stringify(provenance.wingRoot))) {
    throw new Error("Local Wing VSIX does not match the receipt's bundled Wing source");
  }
  assertEqual(manifest.name, artifact.expectedPackage.name, `${artifact.kind} VSIX name`);
  assertEqual(manifest.version, artifact.expectedPackage.version, `${artifact.kind} VSIX version`);
  if (/element-plus|node-sqlite3-wasm|@phoenix-wing\/cad-rust-source/u.test(bundle)) {
    throw new Error(`${artifact.kind} VSIX bundle contains a forbidden Wing/UI/native dependency`);
  }
  for (const wingPackage of ["code-core", "git-core", "git-node", "kt-codegen", "run-core", "run-node"]) {
      const dependency = `@phoenix-wing/${wingPackage}`;
      assertEqual(
        manifest.dependencies?.[dependency],
        codePackage.dependencies?.[dependency],
        `Code VSIX ${wingPackage} version`,
      );
  }
  if (/require\(["']@phoenix-wing\/(?:code-core|git-core|git-node|kt-codegen|run-core|run-node)["']\)/u.test(bundle)) {
      throw new Error("Code VSIX must bundle all Phoenix Wing Code/Git/Run dependencies");
    }
    if (!bundle.includes("GetComboSelectNotification()") || bundle.includes("GetComboModifyNotification()")) {
      throw new Error("Code VSIX CAA Combo generator must bind the selection notification, not the modify notification");
    }
    const tableBundle = readText(zip, "extension/dist/codegen-table.js");
    verifyCodegenTableBundleCheckpointRuntime(tableBundle, `${artifact.kind} VSIX Codegen table`);
    if (!tableBundle.includes("kt-codegen-table")) {
      throw new Error("Code VSIX is missing the KtCodegenTable custom element registration");
    }
    const controlCatalogBundle = readText(zip, "extension/dist/codegen-control-catalog.js");
    if (!controlCatalogBundle.includes("ktc-codegen-control-panel")
        || !controlCatalogBundle.includes("kt-codegen-control-split-change")
        || !controlCatalogBundle.includes("kt-codegen-control-open")
        || !controlCatalogBundle.includes("kt-codegen-control-copy-end")
        || controlCatalogBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the UI-neutral Codegen preflight control panel custom element");
    }
    const primaryPanelBundle = readText(zip, "extension/dist/codegen-primary-panel.js");
    if (!primaryPanelBundle.includes("ktc-codegen-primary-panel")
        || !primaryPanelBundle.includes("kt-codegen-primary-action")
        || !primaryPanelBundle.includes("kt-codegen-control-catalog")
        || !primaryPanelBundle.includes("kt-codegen-control-selection-change")
        || !primaryPanelBundle.includes("kt-codegen-control-output")
        || !primaryPanelBundle.includes('{ scope: "visible", blockKeys:')
        || !primaryPanelBundle.includes(".pnw-codegen-catalog-list { max-height: 290px; overflow-x: hidden; overflow-y: auto;")
        || !primaryPanelBundle.includes('setAttribute("role", "tree")')
        || !primaryPanelBundle.includes("pnw-codegen-group-check")
        || primaryPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the UI-neutral Codegen Primary panel and control catalog custom elements");
    }
    const runPrimaryPanelBundle = readText(zip, "extension/dist/ktc-run-primary-panel.js");
    if (!runPrimaryPanelBundle.includes("ktc-run-primary-panel")
        || !runPrimaryPanelBundle.includes("ktc-run-primary-action")
        || runPrimaryPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the Host-neutral Run Primary panel custom element");
    }
    const autoBuildPrimaryPanelBundle = readText(zip, "extension/dist/ktc-auto-build-primary-panel.js");
    if (!autoBuildPrimaryPanelBundle.includes("ktc-auto-build-primary-panel")
        || !autoBuildPrimaryPanelBundle.includes("ktc-auto-build-primary-action")
        || autoBuildPrimaryPanelBundle.includes("acquireVsCodeApi")
        || autoBuildPrimaryPanelBundle.includes("postMessage")
        || autoBuildPrimaryPanelBundle.includes("workspace.fs")) {
      throw new Error("Code VSIX is missing or contaminates the Host-neutral AutoBuild Primary panel custom element");
    }
    const legacyAutoBuildRightHtmlMarkers = [
      '<div class="toolbar"><button id="open"',
      '<label class="clean"><input id="clean"',
    ];
    if (legacyAutoBuildRightHtmlMarkers.some((marker) => bundle.includes(marker))) {
      throw new Error("Code VSIX still contains the legacy AutoBuild Right toolbar or automatic-clean control");
    }
    const autoBuildRightBundle = readText(zip, "extension/dist/auto-build-view.js");
    const legacyAutoBuildRightEntryMarkers = [
      "Root 编排脚本",
      "rootScriptStatus",
      "syncRootScript",
      ".toolbar[hidden]",
      ".clean[hidden]",
    ];
    if (legacyAutoBuildRightEntryMarkers.some((marker) => autoBuildRightBundle.includes(marker))) {
      throw new Error("Code VSIX AutoBuild Right bundle still creates or hides a migrated legacy control");
    }
    const caaRunner = readText(zip, "extension/resources/run/caa/pnw-caa-runner.cmd");
    if (!caaRunner.includes("stage=tck-init")
        || !caaRunner.includes("mkGetPreq.bat")
        || !caaRunner.includes("mkCreateRuntimeView.bat")
        || /\b(?:setx|runas|sudo|start\s+cmd)\b/iu.test(caaRunner)) {
      throw new Error("Code VSIX is missing the constrained CAA build/run resource");
    }
    const clangFormatRunner = readText(zip, "extension/resources/run/format/pnw-clang-format-runner.cjs");
    if (!clangFormatRunner.includes("KtcExcludedDirectories")
        || !clangFormatRunner.includes('spawnSync(program, ["-style=file", "-i", file]')
        || !clangFormatRunner.includes("entry.isSymbolicLink()")
        || /\b(?:setx|runas|sudo)\b/iu.test(clangFormatRunner)) {
      throw new Error("Code VSIX is missing the constrained Clang Format resource");
    }
    const gitPrimaryPanelBundle = readText(zip, "extension/dist/ktc-git-primary-panel.js");
    if (!gitPrimaryPanelBundle.includes("ktc-git-primary-panel")
        || !gitPrimaryPanelBundle.includes("ktc-git-primary-action")
        || gitPrimaryPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the Host-neutral Git Primary panel custom element");
    }
    const ignorePrimaryPanelBundle = readText(zip, "extension/dist/ktc-ignore-primary-panel.js");
    if (!ignorePrimaryPanelBundle.includes("ktc-ignore-primary-panel")
        || !ignorePrimaryPanelBundle.includes("ktc-ignore-primary-action")
        || ignorePrimaryPanelBundle.includes("acquireVsCodeApi")
        || ignorePrimaryPanelBundle.includes("postMessage")
        || ignorePrimaryPanelBundle.includes("workspace.fs")) {
      throw new Error("Code VSIX is missing the Host-neutral Ignore Primary panel custom element");
    }
    const reorderMembersPanelBundle = readText(zip, "extension/dist/reorder-members-panel.js");
    if (!reorderMembersPanelBundle.includes("ktc-reorder-members-panel")
        || !reorderMembersPanelBundle.includes("pnw-code-reorder-members-action")
        || !reorderMembersPanelBundle.includes("reorderSelection")
        || reorderMembersPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the Host-neutral member-sort panel custom element");
    }
    const uuidResultsPanelBundle = readText(zip, "extension/dist/uuid-results-panel.js");
    if (!uuidResultsPanelBundle.includes("ktc-uuid-results-panel")
        || !uuidResultsPanelBundle.includes("pnw-code-uuid-results-action")
        || !uuidResultsPanelBundle.includes("selection")
        || uuidResultsPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the Host-neutral UUID result panel custom element");
    }
    const renameResultsPanelBundle = readText(zip, "extension/dist/rename-results-panel.js");
    if (!renameResultsPanelBundle.includes("ktc-rename-results-panel")
        || !renameResultsPanelBundle.includes("pnw-code-rename-results-action")
        || renameResultsPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the Host-neutral rename result panel custom element");
    }
    const associatedRulePickerBundle = readText(zip, "extension/dist/associated-rule-picker.js");
    if (!associatedRulePickerBundle.includes("ktc-associated-rule-picker")
        || !associatedRulePickerBundle.includes("ktc-associated-rule-picker-action")
        || associatedRulePickerBundle.includes("acquireVsCodeApi")
        || associatedRulePickerBundle.includes("postMessage")
        || associatedRulePickerBundle.includes("clipboard")
        || associatedRulePickerBundle.includes("workspace.fs")
        || associatedRulePickerBundle.includes("primarySearch")
        || associatedRulePickerBundle.includes("existingRules")) {
      throw new Error("Code VSIX is missing the Host-neutral associated-rule picker custom element");
    }
    const toolNavigatorBundle = readText(zip, "extension/dist/ktc-tool-navigator.js");
    if (!toolNavigatorBundle.includes("ktc-tool-navigator")
        || !toolNavigatorBundle.includes("ktc-tool-navigator-action")
        || !toolNavigatorBundle.includes("container-type:inline-size")
        || toolNavigatorBundle.includes("acquireVsCodeApi")
        || toolNavigatorBundle.includes("postMessage")
        || toolNavigatorBundle.includes("workspace.fs")) {
      throw new Error("Code VSIX is missing the Host-neutral responsive Tool Navigator custom element");
    }
    const sharedUiBundles = [
      ["ktc-primary-shell.js", ["ktc-primary-shell"]],
      ["ktc-directory-bar.js", ["ktc-directory-bar", "ktc-directory-bar-action"]],
      ["ktc-toolbar-strip.js", ["ktc-toolbar-strip", "ktc-toolbar-strip-action"]],
      ["ktc-current-tool-region.js", ["ktc-current-tool-region", "ktc-current-tool-region-action"]],
      ["ktc-open-items-bar.js", ["ktc-open-items-bar", "ktc-open-items-bar-action"]],
      ["ktc-right-view-shell.js", ["ktc-right-view-shell"]],
      ["ktc-package-includes-primary.js", ["ktc-package-includes-primary", "ktc-package-includes-primary-action", "ktc-ignore-policy-block", "ktc-ignore-policy-action"]],
      ["pnw-combo.js", ["pnw-combo", "pnw-combo-action", "全部清空"]],
    ];
    for (const [file, markers] of sharedUiBundles) {
      const sharedBundle = readText(zip, `extension/dist/${file}`);
      // esbuild's default ASCII output may encode labels such as 全部清空 as Unicode escapes.
      const hasMarker = (marker) => sharedBundle.includes(marker) || sharedBundle.includes(
        marker.replace(/[^\x00-\x7f]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}`),
      ) || sharedBundle.includes(
        marker.replace(/[^\x00-\x7f]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`),
      );
      if (markers.some((marker) => !hasMarker(marker))
          || sharedBundle.includes("acquireVsCodeApi")
          || sharedBundle.includes("postMessage")
          || sharedBundle.includes("workspace.fs")) {
        throw new Error(`Code VSIX is missing or contaminates Host-neutral shared UI bundle: ${file}`);
      }
    }
    const packageIncludesRightViewMarkers = [
      "packageIncludesRightShell",
      "packageIncludesHeaderActions",
      "packageIncludesMain",
      "ktc-right-view-shell.js",
    ];
    if (packageIncludesRightViewMarkers.some((marker) => !bundle.includes(marker))) {
      throw new Error("Code VSIX Package Includes View is not wired to the shared Right View Shell");
    }
    const projectRenameAnalysisBundle = readText(zip, "extension/dist/project-rename-analysis.js");
    if (!projectRenameAnalysisBundle.includes("upper-snake")
        || !projectRenameAnalysisBundle.includes("loadMore")
        || !projectRenameAnalysisBundle.includes("previewFirstDiff")
        || !projectRenameAnalysisBundle.includes("previewDiff")
        || !projectRenameAnalysisBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the standalone project rename analysis Webview bundle");
    }
    const codegenCommand = manifest.contributes?.commands?.find(
      (candidate) => candidate.command === "ktAutoCode.codegen.open",
    );
    if (!codegenCommand) throw new Error("Code VSIX is missing the Codegen open command");
    const runCommand = manifest.contributes?.commands?.find(
      (candidate) => candidate.command === "ktAutoCode.run.open",
    );
    if (!runCommand) throw new Error("Code VSIX is missing the Run open command");
    const gitCommand = manifest.contributes?.commands?.find(
      (candidate) => candidate.command === "ktAutoCode.git.open",
    );
    if (!gitCommand) throw new Error("Code VSIX is missing the Git open command");
    const projectRenameCommand = manifest.contributes?.commands?.find(
      (candidate) => candidate.command === "ktAutoCode.projectRenameAnalysis.open",
    );
    if (!projectRenameCommand) throw new Error("Code VSIX is missing the project rename analysis command");
    if (manifest.dependencies?.["phoenix-wing"] !== undefined) {
      throw new Error("Code VSIX must not depend on the Vue/UI aggregate phoenix-wing package");
    }
    const titleCommands = manifest.contributes?.menus?.["view/title"] ?? [];
    const expectedTitleCommands = [
      ["ktAutoCode.directory.hide", "navigation@5"],
      ["ktAutoCode.directory.show", "navigation@5"],
      ["ktAutoCode.ignore.openAdvanced", "navigation@10"],
      ["ktAutoCode.environment.open", "navigation@20"],
    ];
    const actualTitleCommands = titleCommands.map((candidate) => [candidate.command, candidate.group]);
    if (JSON.stringify(actualTitleCommands) !== JSON.stringify(expectedTitleCommands)) {
      throw new Error("Code VSIX View Header must contain exactly Directory visibility, Ignore, then Settings");
    }
    if (titleCommands.some((candidate) => [
      "ktAutoCode.module.code.show",
      "ktAutoCode.module.code.hide",
      "ktAutoCode.sidebar.toggleStyle",
      "ktAutoCode.ribbon.customize",
    ].includes(candidate.command))) {
      throw new Error("Code VSIX must keep Ribbon module/layout controls out of the View Header");
    }
    if (titleCommands.some((candidate) => typeof candidate.command === "string"
      && candidate.command.startsWith("ktAutoCad."))) {
      throw new Error("Code VSIX must not own CAD Header commands");
    }
  if (names.includes("extension/media/tools/cad-provider.svg")) {
    throw new Error("Code VSIX must not retain the removed standalone CAD provider icon");
  }
  const evidence = localWing ? {
    kind: "kt.auto-code.local-wing-artifact-verification", publishable: false,
    artifact: artifactPath, version: artifact.expectedPackage.version, bytes, sha256, fileCount: names.length,
  } : createArtifactVerificationEvidence({
    artifactKind: artifact.kind,
    artifact: artifactPath,
    version: artifact.expectedPackage.version,
    fileCount: names.length,
    bytes,
    sha256,
    provenance,
  });
  process.stdout.write(`[verify] ${artifact.kind} VSIX: ${names.length} files, ${bytes} bytes passed\n`);
  process.stdout.write(localWing ? `${JSON.stringify(evidence, null, 2)}\n` : serializeArtifactVerificationEvidence(evidence));
}

function readPackage(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function readZip(archive, filename) {
  const eocd = findEndOfCentralDirectory(archive);
  const count = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error(`invalid ZIP central directory: ${filename}`);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : undefined;
    if (!data) throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("invalid ZIP: end of central directory not found");
}

function readText(entries, name) {
  const value = entries.get(name);
  if (!value) throw new Error(`VSIX is missing ${name}`);
  return value.toString("utf8");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} must equal ${expected}, got ${String(actual)}`);
}
