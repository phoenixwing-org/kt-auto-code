import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codePackage = readPackage(path.join(root, "extension", "package.json"));
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
  verifySha256Sidecar(artifact.file);
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
  process.stdout.write(`[verify] ${artifact.kind} VSIX: ${names.length} files, ${fs.statSync(artifact.file).size} bytes passed\n`);
}

function verifySha256Sidecar(file) {
  const sidecar = `${file}.sha256`;
  const content = fs.readFileSync(sidecar, "utf8").trim();
  const match = /^([0-9a-f]{64})  ([^\r\n]+)$/u.exec(content);
  if (!match) throw new Error(`Invalid SHA-256 sidecar format: ${sidecar}`);
  assertEqual(match[2], path.basename(file), "SHA-256 sidecar artifact name");
  const actual = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assertEqual(match[1], actual, "VSIX SHA-256");
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
