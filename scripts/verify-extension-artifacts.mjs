import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codePackage = readPackage(path.join(root, "extension", "package.json"));
const cadPackage = readPackage(path.join(root, "extensions", "kt-auto-cad", "package.json"));
const allArtifacts = [
  {
    kind: "code",
    file: path.join(root, "extension", `kt-auto-code-${codePackage.version}.vsix`),
    packagePath: "extension/package.json",
    bundlePath: "extension/dist/extension.js",
    expectedPackage: codePackage,
  },
  {
    kind: "cad",
    file: path.join(root, "extension", `kt-auto-cad-${cadPackage.version}.vsix`),
    packagePath: "extension/package.json",
    bundlePath: "extension/dist/extension.js",
    expectedPackage: cadPackage,
  },
];
const artifacts = process.argv.includes("--code-only")
  ? allArtifacts.filter((artifact) => artifact.kind === "code")
  : allArtifacts;

for (const artifact of artifacts) {
  const zip = readZip(artifact.file);
  const names = [...zip.keys()].sort();
  for (const name of names) {
    if (/(?:^|\/)(?:node_modules|src|target)(?:\/|$)/u.test(name)
        || /(?:^|\/)dist\/test(?:\/|$)/u.test(name)
        || /(?:^|\/)[^/]+\.local-wing\.json$/u.test(name)
        || /\.(?:map|rs|exe|dll|dylib|so|sqlite)$/iu.test(name)
        || /(?:^|\/)Cargo\.(?:toml|lock)$/u.test(name)) {
      throw new Error(`${artifact.kind} VSIX contains forbidden file: ${name}`);
    }
  }
  const manifest = JSON.parse(readText(zip, artifact.packagePath));
  const bundle = readText(zip, artifact.bundlePath);
  assertEqual(manifest.name, artifact.expectedPackage.name, `${artifact.kind} VSIX name`);
  assertEqual(manifest.version, artifact.expectedPackage.version, `${artifact.kind} VSIX version`);
  if (/element-plus|node-sqlite3-wasm|@phoenix-wing\/cad-rust-source/u.test(bundle)) {
    throw new Error(`${artifact.kind} VSIX bundle contains a forbidden Wing/UI/native dependency`);
  }
  if (artifact.kind === "code") {
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
    const tableBundle = readText(zip, "extension/dist/codegen-table.js");
    if (!tableBundle.includes("kt-codegen-table")) {
      throw new Error("Code VSIX is missing the KtCodegenTable custom element registration");
    }
    const controlCatalogBundle = readText(zip, "extension/dist/codegen-control-catalog.js");
    if (!controlCatalogBundle.includes("ktc-codegen-control-catalog")
        || !controlCatalogBundle.includes("ktc-codegen-control-panel")
        || !controlCatalogBundle.includes("ktc-codegen-control-selection-change")
        || !controlCatalogBundle.includes("ktc-codegen-control-split-change")
        || !controlCatalogBundle.includes('{ scope: "visible", blockKeys:')
        || !controlCatalogBundle.includes(".list { max-height: 290px; overflow-x: hidden; overflow-y: auto;")
        || !controlCatalogBundle.includes('setAttribute("role", "tree")')
        || !controlCatalogBundle.includes("group-check")
        || controlCatalogBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the UI-neutral shared Codegen control panel custom elements");
    }
    const primaryPanelBundle = readText(zip, "extension/dist/codegen-primary-panel.js");
    if (!primaryPanelBundle.includes("ktc-codegen-primary-panel")
        || !primaryPanelBundle.includes("ktc-codegen-primary-action")
        || primaryPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the UI-neutral Codegen Primary panel custom element");
    }
    const runPrimaryPanelBundle = readText(zip, "extension/dist/ktc-run-primary-panel.js");
    if (!runPrimaryPanelBundle.includes("ktc-run-primary-panel")
        || !runPrimaryPanelBundle.includes("ktc-run-primary-action")
        || runPrimaryPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the Host-neutral Run Primary panel custom element");
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
    const reorderMembersPanelBundle = readText(zip, "extension/dist/reorder-members-panel.js");
    if (!reorderMembersPanelBundle.includes("ktc-reorder-members-panel")
        || !reorderMembersPanelBundle.includes("ktc-reorder-members-action")
        || !reorderMembersPanelBundle.includes("reorderSelection")
        || reorderMembersPanelBundle.includes("acquireVsCodeApi")) {
      throw new Error("Code VSIX is missing the Host-neutral member-sort panel custom element");
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
    if (manifest.dependencies?.["phoenix-wing"] !== undefined) {
      throw new Error("Code VSIX must not depend on the Vue/UI aggregate phoenix-wing package");
    }
    const titleCommands = manifest.contributes?.menus?.["view/title"] ?? [];
    const codeShow = titleCommands.find((candidate) => candidate.command === "ktAutoCode.module.code.show");
    const codeHide = titleCommands.find((candidate) => candidate.command === "ktAutoCode.module.code.hide");
    if (!codeShow?.when?.includes("!ktAutoCode.module.code.visible")
        || !codeHide?.when?.includes("ktAutoCode.module.code.visible")) {
      throw new Error("Code VSIX is missing its visible checked/unchecked Header commands");
    }
    if (titleCommands.some((candidate) => typeof candidate.command === "string"
      && candidate.command.startsWith("ktAutoCad."))) {
      throw new Error("Code VSIX must not own CAD Header commands");
    }
    if (names.includes("extension/media/tools/cad-provider.svg")) {
      throw new Error("Code VSIX must not retain the removed standalone CAD provider icon");
    }
  } else {
    assertEqual(manifest.extensionDependencies?.[0], "kuntai.kt-auto-code", "CAD base extension dependency");
    assertEqual(manifest.icon, "media/cn.kt.doc.AutoCode.Color.128.png", "CAD Marketplace icon");
    if (!names.includes(`extension/${manifest.icon}`)) {
      throw new Error(`CAD VSIX is missing its Marketplace icon: ${manifest.icon}`);
    }
    if (manifest.contributes?.viewsContainers !== undefined) {
      throw new Error("CAD VSIX must not contribute another Activity Bar container");
    }
    if (manifest.contributes?.views !== undefined) {
      throw new Error("CAD VSIX must consume the Shell-owned Block container instead of contributing a View");
    }
    const moduleTools = manifest.ktAutoCodeModule?.id === "cad"
      ? manifest.ktAutoCodeModule.tools
      : undefined;
    if (!Array.isArray(moduleTools) || moduleTools.length !== 5) {
      throw new Error("CAD VSIX must publish five data-defined shared Ribbon tools");
    }
    if (moduleTools.some((tool) => tool.id === "cadProvider")) {
      throw new Error("CAD VSIX must not publish a standalone Desk Tools connection tool");
    }
    if (!moduleTools.every((tool) => tool.command.startsWith("ktAutoCad.block."))) {
      throw new Error("CAD Ribbon tools must open Blocks without directly running business actions");
    }
    assertEqual(manifest.ktAutoCodeModule?.title, "CAD", "CAD module title");
    assertEqual(manifest.ktAutoCodeModule?.order, 20, "CAD module order");
    assertEqual(manifest.ktAutoCodeModule?.commandPrefix, "ktAutoCad.", "CAD command prefix");
    const titleCommands = manifest.contributes?.menus?.["view/title"] ?? [];
    const cadShow = titleCommands.find((candidate) => candidate.command === "ktAutoCad.module.show");
    const cadHide = titleCommands.find((candidate) => candidate.command === "ktAutoCad.module.hide");
    if (!cadShow?.when?.includes("!ktAutoCode.module.cad.visible")
        || !cadHide?.when?.includes("ktAutoCode.module.cad.visible")) {
      throw new Error("CAD VSIX must own visible checked/unchecked Header commands");
    }
    const requirements = Object.fromEntries(moduleTools.map((tool) => [tool.id, tool.requirement]));
    assertEqual(requirements.cadFilename, "none", "CAD filename requirement");
    assertEqual(requirements.cadScan, "none", "CAD scan requirement");
    assertEqual(requirements.cadRead, "optional-desk-provider", "CAD native read requirement");
    assertEqual(requirements.cadQuery, "workspace-database", "CAD query requirement");
    const queryTool = moduleTools.find((tool) => tool.id === "cadQuery");
    if (!queryTool?.description?.includes("无需 Desk Tools")) {
      throw new Error("CAD database query must declare that it does not require Desk Tools");
    }
    if (!bundle.includes("node:sqlite") || bundle.includes("queryTool.binaryPath")) {
      throw new Error("CAD VSIX must query through built-in SQLite rather than the Desk provider binary");
    }
    if (!bundle.includes("registerModuleBlockProvider") || bundle.includes("registerWebviewViewProvider")) {
      throw new Error("CAD VSIX must inject UI through the Shell Block provider API");
    }
    if (names.length !== 9) throw new Error(`CAD VSIX must remain thin (expected 9 files, got ${names.length})`);
  }
  process.stdout.write(`[verify] ${artifact.kind} VSIX: ${names.length} files, ${fs.statSync(artifact.file).size} bytes passed\n`);
}

function readPackage(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function readZip(filename) {
  const archive = fs.readFileSync(filename);
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
