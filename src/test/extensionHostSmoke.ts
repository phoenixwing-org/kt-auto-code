import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { KtcGitTool } from "../tools/git/KtcGitTool.js";
import { KtcProjectRenameHost } from "../projectRenameHost.js";
import type {
  KtcProjectRenameAnalysisReport,
  KtcProjectRenameViewInboundMessage,
  KtcProjectRenameViewState,
} from "../tools/projectRename/contracts.js";
import { KtcProjectRenameViewController } from "../tools/projectRename/viewController.js";
import type { ToolUiState } from "../tools/types.js";

interface ExtensionApi {
  readonly version: number;
  getModuleState(): { readonly installed: readonly string[]; readonly visible: readonly string[] };
  activateModule(moduleId: string): Promise<boolean>;
  showModuleTool(moduleId: string, toolId: string): Promise<boolean>;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

interface KtcProjectRenameSmokeDriver {
  state: KtcProjectRenameViewState;
  abortController?: AbortController;
  report?: KtcProjectRenameAnalysisReport;
  handleMessage(message: KtcProjectRenameViewInboundMessage): Promise<void>;
}

interface KtcProjectRenameCancelEvidence {
  readonly scannedFilesBeforeCancel: number;
  readonly signalAborted: boolean;
  readonly cancelledWithoutReport: boolean;
  readonly restartReportId: number;
  readonly fixtureFileCount: number;
  readonly fixtureUnchanged: boolean;
}

async function ktcProjectRenameFixtureFingerprint(root: vscode.Uri): Promise<{
  readonly fileCount: number;
  readonly sha256: string;
}> {
  const entries = (await vscode.workspace.fs.readDirectory(root))
    .sort(([left], [right]) => left.localeCompare(right));
  const hash = createHash("sha256");
  for (const [name, type] of entries) {
    hash.update(name, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(type), "utf8");
    hash.update("\0", "utf8");
    if (type === vscode.FileType.File) {
      hash.update(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, name)));
    }
    hash.update("\0", "utf8");
  }
  return { fileCount: entries.length, sha256: hash.digest("hex") };
}

async function ktcWaitFor(
  predicate: () => boolean,
  failureMessage: () => string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(failureMessage());
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function ktcWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ktcRunProjectRenameCancelSmoke(
  workspace: vscode.WorkspaceFolder,
  extensionUri: vscode.Uri,
): Promise<KtcProjectRenameCancelEvidence> {
  const fixture = vscode.Uri.joinPath(workspace.uri, "project-rename-cancel-probe");
  await vscode.workspace.fs.createDirectory(fixture);
  const payload = encoder.encode("export const OldProject = 'OldProject';\n".repeat(32));
  const fileCount = 360;
  const writeBatchSize = 36;
  for (let offset = 0; offset < fileCount; offset += writeBatchSize) {
    await Promise.all(Array.from({ length: Math.min(writeBatchSize, fileCount - offset) }, async (_value, index) => {
      const ordinal = String(offset + index).padStart(4, "0");
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(fixture, `OldProject-${ordinal}.ts`),
        payload,
      );
    }));
  }
  const fixtureBefore = await ktcProjectRenameFixtureFingerprint(fixture);
  const controller = new KtcProjectRenameViewController(extensionUri, new KtcProjectRenameHost());
  // VS Code exposes no Extension Test API for injecting a click into a
  // WebviewPanel. This structural cast is confined to the excluded test bundle
  // and drives the same Controller branch reached after the Webview parser.
  const driver = controller as unknown as KtcProjectRenameSmokeDriver;
  const request: KtcProjectRenameViewInboundMessage = {
    type: "analyze",
    sourceName: "OldProject",
    targetName: "NewProject",
    sourcePrefix: "",
    targetPrefix: "",
    rules: [{
      id: "display",
      style: "display",
      search: "OldProject",
      replace: "NewProject",
      enabled: true,
    }],
  };

  try {
    controller.show(fixture.fsPath);
    const firstAnalysis = driver.handleMessage(request);
    await ktcWaitFor(
      () => driver.state.status === "running" && (driver.state.progress?.scannedFiles ?? 0) > 0,
      () => `项目改名取消烟测未进入可取消扫描阶段：${driver.state.status}/${driver.state.progress?.scannedFiles ?? 0}`,
    );
    const scannedFilesBeforeCancel = driver.state.progress?.scannedFiles ?? 0;
    const firstSignal = driver.abortController?.signal;
    assert.ok(firstSignal, "project rename analysis must own an AbortSignal before cancellation");

    // Start the replacement without awaiting cancellation. This proves that the
    // task slot is released immediately and a late first result cannot win.
    const cancellation = driver.handleMessage({ type: "cancel" });
    assert.equal(firstSignal.aborted, true);
    assert.equal(driver.state.status, "cancelled");
    assert.equal(driver.report, undefined);
    assert.equal(driver.state.report, undefined);
    const cancelledWithoutReport = driver.state.status === "cancelled"
      && driver.report === undefined
      && driver.state.report === undefined;

    const secondAnalysis = driver.handleMessage(request);
    assert.equal(driver.state.status, "running", "cancelled task slot must be reusable immediately");
    await ktcWithTimeout(
      Promise.all([firstAnalysis, cancellation, secondAnalysis]),
      30_000,
      "项目改名取消后的分析任务未在 30 秒内收口",
    );
    assert.equal(driver.state.status, "done");
    // Read through closures so TypeScript does not retain the intentional
    // pre-restart `undefined` narrowing across the asynchronous Controller run.
    const restartReport = ((): KtcProjectRenameAnalysisReport | undefined => driver.report)();
    const restartViewReport = ((): KtcProjectRenameViewState["report"] => driver.state.report)();
    assert.ok(restartReport, "replacement analysis must publish a report");
    assert.equal(restartReport.reportId, 2, "the cancelled report must not overwrite the replacement report");
    assert.equal(restartViewReport?.reportId, 2);
    const fixtureAfter = await ktcProjectRenameFixtureFingerprint(fixture);
    assert.deepEqual(fixtureAfter, fixtureBefore, "read-only cancellation smoke must not change fixture names or bytes");

    return {
      scannedFilesBeforeCancel,
      signalAborted: firstSignal.aborted,
      cancelledWithoutReport,
      restartReportId: restartReport.reportId,
      fixtureFileCount: fixtureAfter.fileCount,
      fixtureUnchanged: true,
    };
  } finally {
    controller.dispose();
  }
}

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
  assert.equal(await api.showModuleTool("code", "git"), true);
  assert.equal(await api.showModuleTool("code", "run"), true);
  assert.equal(await api.showModuleTool("code", "codegen"), true);

  const cadSmoke = process.env.KTC_CAD_EXTENSION_HOST_SMOKE === "1";
  let cadEvidence: { id: string; version: string; active: boolean } | undefined;
  if (cadSmoke) {
    const cadExtension = vscode.extensions.getExtension("kuntai.kt-auto-cad");
    assert.ok(cadExtension, "KT Auto CAD sibling development extension was not discovered");
    await cadExtension.activate();
    assert.equal(cadExtension.isActive, true);
    assert.ok(api.getModuleState().installed.includes("cad"));
    assert.equal(await api.showModuleTool("cad", "cadFilename"), true);
    cadEvidence = {
      id: cadExtension.id,
      version: cadExtension.packageJSON.version as string,
      active: cadExtension.isActive,
    };
  }

  let fixtureHasGitDirectory = true;
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspace.uri, ".git"));
  } catch {
    fixtureHasGitDirectory = false;
  }
  assert.equal(fixtureHasGitDirectory, false, "Git empty-state fixture must not contain .git");
  const gitStates: ToolUiState[] = [];
  const gitLogs: string[] = [];
  await KtcGitTool.runAction("refresh", {
    workspaceRoot: workspace.uri.fsPath,
    workspaceLabel: workspace.name,
    workspaceFileScopeId: "workspace",
    pluginIgnoreEnabled: true,
    postState: (state) => gitStates.push(state),
    log: (line) => gitLogs.push(line),
  });
  const finalGitState = gitStates.at(-1);
  assert.ok(finalGitState?.git, "Git refresh must always publish a renderable view model");
  assert.equal(finalGitState.status, "done");
  assert.equal(finalGitState.git.projects.length, 0);
  assert.equal(finalGitState.git.workspaceRepositoryCount, 0);
  assert.equal(finalGitState.git.statusText, "当前工作区未发现 Git 仓库。");
  assert.ok(
    gitLogs.some((line) => line.includes("posting empty repository state")),
    "Git refresh must reach the final empty repository state",
  );

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    "ktAutoCode.codegen.open",
    "ktAutoCode.codegen.importCsv",
    "ktAutoCode.codegen.applyAll",
    "ktAutoCode.codegen.refresh",
    "ktAutoCode.codegen.scanCandidates",
    "ktAutoCode.codegen.diagnostics",
    "ktAutoCode.module.activate",
    "ktAutoCode.uuidReplace.scan",
    "ktAutoCode.projectRenameAnalysis.open",
    "ktAutoCode.ignore.openAdvanced",
    "ktAutoCode.environment.open",
    "ktAutoCode.git.open",
    "ktAutoCode.run.open",
  ]) {
    assert.ok(commands.includes(command), `real Extension Host did not register ${command}`);
  }
  if (cadSmoke) {
    for (const command of [
      "ktAutoCad.module.show",
      "ktAutoCad.module.hide",
      "ktAutoCad.block.filename",
      "ktAutoCad.block.scan",
      "ktAutoCad.block.read",
      "ktAutoCad.block.query",
      "ktAutoCad.block.diagnostics",
    ]) {
      assert.ok(commands.includes(command), `real Extension Host did not register ${command}`);
    }
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
  const changedItem = current.controller.param.items[0];
  assert.ok(changedItem, "Codegen fixture must contain an item that can force a real Apply change");
  changedItem.paramString = "Q2WidgetName";
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

  const projectRenameCancel = await ktcRunProjectRenameCancelSmoke(
    workspace,
    vscode.Uri.file(extension.extensionPath),
  );

  // Exercise the real command and Webview construction. The second call carries a
  // different root but must only reveal the already-open single-task View.
  await vscode.commands.executeCommand("ktAutoCode.projectRenameAnalysis.open", workspace.uri.fsPath);
  await vscode.commands.executeCommand("ktAutoCode.projectRenameAnalysis.open", `${workspace.uri.fsPath}-ignored`);

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
    cadExtension: cadEvidence,
    flows: {
      open: true,
      preview: true,
      conflict: true,
      apply: true,
      saveReload: true,
      rollback: true,
      gitBlock: true,
      gitEmptyState: true,
      runBlock: true,
      projectRenameAnalysis: true,
      projectRenameCancel: true,
    },
    evidence: {
      candidateFileCount: preflight.candidateFileCount,
      markerRegionCount: preflight.plan.markerRegions.length,
      changedFileCount: applyWrites.length,
      projectRenameCancel,
      commands: [
        "ktAutoCode.codegen.open",
        "ktAutoCode.module.activate",
        "ktAutoCode.uuidReplace.scan",
        "ktAutoCode.projectRenameAnalysis.open",
        "ktAutoCode.git.open",
        "ktAutoCode.run.open",
      ],
    },
  };
  const receiptUri = vscode.Uri.joinPath(workspace.uri, ".phoenix", "extension-host-smoke-v1.json");
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspace.uri, ".phoenix"));
  await vscode.workspace.fs.writeFile(receiptUri, encoder.encode(`${JSON.stringify(receipt, null, 2)}\n`));
  process.stdout.write(`[q2] ${extension.id}@${extension.packageJSON.version} on VS Code ${vscode.version} passed\n`);
}
