import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  KtCodegenController,
  type KtCodegenBlockKey,
} from "@phoenix-wing/kt-codegen";
import { KtcCodegenDocumentService } from "../tools/codegen/documentService.js";
import { ktcRunCodegenPreflight } from "../tools/codegen/preflight.js";
import { ktcProjectCodegenApply } from "../tools/codegen/sourceApply.js";
import { ktcCommitCodegenApplyWrites } from "../tools/codegen/sourceApplyTransaction.js";
import { ktcDecodeCodegenSource, ktcEncodeCodegenSource } from "../tools/codegen/sourceCodec.js";

interface ExtensionApi {
  readonly version: number;
  getModuleState(): { readonly installed: readonly string[]; readonly visible: readonly string[] };
  activateModule(moduleId: string): Promise<boolean>;
  showModuleTool(moduleId: string, toolId: string): Promise<boolean>;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export async function run(): Promise<void> {
  assert.equal(process.env.KTC_EXTENSION_HOST_SMOKE, "1", "smoke must run through the isolated launcher");
  const workspace = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspace, "real Extension Host must open the fixture workspace");

  const extension = vscode.extensions.getExtension<ExtensionApi>("kuntai.kt-auto-code");
  assert.ok(extension, "KT Auto Code development extension was not discovered");
  const api = await extension.activate();
  assert.equal(extension.isActive, true);
  assert.equal(api.version, 2);
  assert.ok(api.getModuleState().installed.includes("code"));
  assert.equal(await api.activateModule("code"), true);
  assert.equal(await api.showModuleTool("code", "codegen"), true);

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    "ktAutoCode.codegen.open",
    "ktAutoCode.module.activate",
    "ktAutoCode.uuidReplace.scan",
  ]) {
    assert.ok(commands.includes(command), `real Extension Host did not register ${command}`);
  }

  const documentUri = vscode.Uri.joinPath(workspace.uri, "PNXWidgetParam.json");
  const service = new KtcCodegenDocumentService(vscode.workspace.fs);
  const opened = await service.readController(documentUri);
  assert.ok(opened, "Codegen JSON did not open through the VS Code filesystem adapter");
  const initial = await service.readSnapshot(documentUri);

  opened.controller.param.nameSpace = "Q2ExtensionHostSaved";
  const savedJson = opened.controller.writeJson();
  assert.equal(savedJson.ok, true);
  assert.ok(savedJson.value);
  const saved = await service.writeValidatedJson(documentUri, savedJson.value, {
    expectedFingerprint: initial.fingerprint,
  });
  assert.match(saved.text, /Q2ExtensionHostSaved/u);

  const reloaded = await service.readController(documentUri);
  assert.ok(reloaded);
  assert.equal(reloaded.controller.param.nameSpace, "Q2ExtensionHostSaved");

  const externalController = new KtCodegenController();
  assert.equal(externalController.readJson(saved.text).ok, true);
  externalController.param.nameSpace = "Q2ExternalChange";
  const externalJson = externalController.writeJson();
  assert.ok(externalJson.value);
  await vscode.workspace.fs.writeFile(documentUri, encoder.encode(externalJson.value));

  const staleController = new KtCodegenController();
  assert.equal(staleController.readJson(saved.text).ok, true);
  staleController.param.nameSpace = "Q2MustNotOverwrite";
  const staleJson = staleController.writeJson();
  assert.ok(staleJson.value);
  await assert.rejects(
    service.writeValidatedJson(documentUri, staleJson.value, { expectedFingerprint: saved.fingerprint }),
    /再次变化|阻止覆盖/u,
  );
  assert.match(await service.readText(documentUri), /Q2ExternalChange/u);

  const current = await service.readController(documentUri);
  assert.ok(current);
  const blockKeys: readonly KtCodegenBlockKey[] = ["PARAM DECLARATION", "QT UPDATE DIALOG"];
  const preflight = await ktcRunCodegenPreflight({
    workspaceRoot: workspace.uri.fsPath,
    scopeId: "workspace",
    documentUri,
    controller: current.controller,
    blockKeys,
    forceRefresh: true,
  });
  assert.equal(preflight.plan.kind, "kt.codegen.plan");
  assert.equal(preflight.plan.schemaVersion, 1);
  assert.ok(preflight.candidateFileCount >= 2);
  assert.ok(preflight.plan.markerRegions.length >= 2);

  const candidatePaths = [...new Set(preflight.plan.markerRegions.map((region) => region.path))];
  const sources = await Promise.all(candidatePaths.map(async (path) => {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
    const decoded = ktcDecodeCodegenSource(raw);
    assert.ok(decoded, `candidate source is not decodable: ${path}`);
    return { path, raw, decoded };
  }));
  const projection = ktcProjectCodegenApply(preflight.plan, sources.map(({ path, decoded }) => ({
    path,
    text: decoded.text,
    fingerprint: decoded.fingerprint,
  })));
  assert.deepEqual(projection.diagnostics, []);
  assert.ok(projection.changes.length >= 1);

  const sourceByPath = new Map(sources.map((source) => [source.path, source]));
  const applyWrites = projection.changes.map((change) => {
    const source = sourceByPath.get(change.path);
    assert.ok(source);
    return {
      target: change.path,
      before: source.raw,
      after: ktcEncodeCodegenSource(change.after, source.decoded.encoding),
    };
  });
  const apply = await ktcCommitCodegenApplyWrites({
    readFile: (path: string) => vscode.workspace.fs.readFile(vscode.Uri.file(path)),
    writeFile: (path: string, content: Uint8Array) =>
      vscode.workspace.fs.writeFile(vscode.Uri.file(path), content),
  }, applyWrites);
  assert.deepEqual(apply, { ok: true });
  for (const write of applyWrites) {
    const after = await vscode.workspace.fs.readFile(vscode.Uri.file(write.target));
    assert.notEqual(decoder.decode(after), decoder.decode(write.before));
  }

  const rollbackA = vscode.Uri.joinPath(workspace.uri, ".phoenix", "q2-rollback-a.txt");
  const rollbackB = vscode.Uri.joinPath(workspace.uri, ".phoenix", "q2-rollback-b.txt");
  const beforeA = encoder.encode("before-a");
  const beforeB = encoder.encode("before-b");
  await vscode.workspace.fs.writeFile(rollbackA, beforeA);
  await vscode.workspace.fs.writeFile(rollbackB, beforeB);
  let failedForward = false;
  const rollback = await ktcCommitCodegenApplyWrites({
    readFile: (uri: vscode.Uri) => vscode.workspace.fs.readFile(uri),
    writeFile: async (uri: vscode.Uri, content: Uint8Array) => {
      await vscode.workspace.fs.writeFile(uri, content);
      if (!failedForward && uri.toString() === rollbackB.toString() && decoder.decode(content) === "after-b") {
        failedForward = true;
        throw new Error("q2 injected second-write failure");
      }
    },
  }, [
    { target: rollbackA, before: beforeA, after: encoder.encode("after-a") },
    { target: rollbackB, before: beforeB, after: encoder.encode("after-b") },
  ]);
  assert.equal(rollback.ok, false);
  assert.deepEqual(rollback.ok ? [] : rollback.rollbackFailures, []);
  assert.equal(decoder.decode(await vscode.workspace.fs.readFile(rollbackA)), "before-a");
  assert.equal(decoder.decode(await vscode.workspace.fs.readFile(rollbackB)), "before-b");

  const receipt = {
    kind: "kt.auto-code.extension-host-smoke",
    schemaVersion: 1,
    vscodeVersion: vscode.version,
    extension: {
      id: extension.id,
      version: extension.packageJSON.version as string,
      active: extension.isActive,
      apiVersion: api.version,
    },
    flows: {
      open: true,
      preview: true,
      conflict: true,
      apply: true,
      saveReload: true,
      rollback: true,
    },
    evidence: {
      candidateFileCount: preflight.candidateFileCount,
      markerRegionCount: preflight.plan.markerRegions.length,
      changedFileCount: applyWrites.length,
      commands: [
        "ktAutoCode.codegen.open",
        "ktAutoCode.module.activate",
        "ktAutoCode.uuidReplace.scan",
      ],
    },
  };
  const receiptUri = vscode.Uri.joinPath(workspace.uri, ".phoenix", "extension-host-smoke-v1.json");
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspace.uri, ".phoenix"));
  await vscode.workspace.fs.writeFile(receiptUri, encoder.encode(`${JSON.stringify(receipt, null, 2)}\n`));
  process.stdout.write(`[q2] ${extension.id}@${extension.packageJSON.version} on VS Code ${vscode.version} passed\n`);
}
