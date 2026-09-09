import assert from "node:assert/strict";
import { isAbsolute, relative, sep } from "node:path";
import * as vscode from "vscode";
import { KtCodegenController, type KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";
import { KtcCodegenDocumentService, ktcCodegenIsFileNotFoundError } from "../tools/codegen/documentService.js";
import { ktcRunCodegenPreflight } from "../tools/codegen/preflight.js";
import { ktcProjectCodegenApply } from "../tools/codegen/sourceApply.js";
import { ktcDecodeCodegenSource, ktcEncodeCodegenSource } from "../tools/codegen/sourceCodec.js";

export interface KtcCodegenPersistenceEvidence {
  readonly cacheReused: boolean;
  readonly cachePathIsolated: boolean;
  readonly staleGeneratorRejected: boolean;
  readonly corruptCacheRebuilt: boolean;
  readonly sourceChangeRejected: boolean;
  readonly sourceDeletionRejected: boolean;
  readonly indexAdvancedAfterChange: boolean;
  readonly sourceRestored: boolean;
  readonly missingSaveRejected: boolean;
  readonly recreated: boolean;
  readonly reappearedFilePreserved: boolean;
}

/** Real VS Code filesystem coverage, confined to the launcher's disposable fixture. */
export async function ktcRunCodegenPersistenceSmoke(options: {
  readonly workspace: vscode.WorkspaceFolder;
  readonly documentUri: vscode.Uri;
  readonly controller: KtCodegenController;
  readonly blockKeys: readonly KtCodegenBlockKey[];
}): Promise<KtcCodegenPersistenceEvidence> {
  assert.equal(process.env.KTC_EXTENSION_HOST_SMOKE, "1");
  const { workspace, documentUri, controller, blockKeys } = options;
  const fs = vscode.workspace.fs;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const service = new KtcCodegenDocumentService(fs);
  const json = controller.writeJson();
  assert.ok(json.ok && json.value, "persistence smoke requires a normalized Codegen document");

  const freshController = (): KtCodegenController => {
    const next = new KtCodegenController();
    assert.equal(next.readJson(json.value!).ok, true);
    return next;
  };
  const preflight = (uri = documentUri, forceRefresh = false) => ktcRunCodegenPreflight({
    workspaceRoot: workspace.uri.fsPath,
    scopeId: "workspace",
    documentUri: uri,
    controller: freshController(),
    blockKeys,
    forceRefresh,
  });

  const initial = await preflight(documentUri, true);
  const cached = await preflight();
  assert.equal(cached.reused, true, "a fresh Controller must restore the persisted plan");
  assert.deepEqual(cached.plan, initial.plan);
  assert.equal(cached.markerIndexRevision, initial.markerIndexRevision);
  const cacheUri = vscode.Uri.file(cached.cachePath);
  const persisted = JSON.parse(decoder.decode(await fs.readFile(cacheUri))) as Record<string, unknown>;
  assert.equal(persisted.kind, "kt.codegen.preflight-cache");
  assert.equal(persisted.documentUri, documentUri.toString());

  const probeRoot = vscode.Uri.joinPath(workspace.uri, ".phoenix", "persistence-smoke");
  await fs.createDirectory(probeRoot);
  const probeJson = vscode.Uri.joinPath(probeRoot, "SeparateParam.json");
  await fs.writeFile(probeJson, encoder.encode(json.value));
  const separate = await preflight(probeJson);
  assert.notEqual(separate.cachePath, cached.cachePath, "different document URIs must not share a plan cache");
  const separatePersisted = JSON.parse(decoder.decode(await fs.readFile(vscode.Uri.file(separate.cachePath)))) as Record<string, unknown>;
  assert.equal(separatePersisted.documentUri, probeJson.toString());
  assert.equal((await preflight()).reused, true, "another document must not evict the first document cache");

  await fs.writeFile(cacheUri, encoder.encode(JSON.stringify({ ...persisted, generatorVersion: "obsolete-smoke-generator" })));
  const stale = await preflight();
  assert.equal(stale.reused, false, "an obsolete persisted generator version must be recomputed");
  assert.deepEqual(stale.plan, initial.plan);
  await fs.writeFile(cacheUri, encoder.encode("{ incomplete cache"));
  const rebuilt = await preflight();
  assert.equal(rebuilt.reused, false, "a corrupt persisted plan must be rebuilt, not returned");
  assert.equal((JSON.parse(decoder.decode(await fs.readFile(cacheUri))) as Record<string, unknown>).kind, "kt.codegen.preflight-cache");

  const sources = await Promise.all([...new Set(rebuilt.plan.markerRegions.map(region => region.path))].map(async path => {
    const raw = await fs.readFile(vscode.Uri.file(path));
    const decoded = ktcDecodeCodegenSource(raw);
    assert.ok(decoded, `source cannot be decoded: ${path}`);
    return { path, raw, ...decoded };
  }));
  const target = sources[0];
  assert.ok(target, "persistence smoke needs a real marker source");
  const relativeTarget = relative(workspace.uri.fsPath, target.path);
  assert.ok(relativeTarget && !isAbsolute(relativeTarget) && relativeTarget !== ".." && !relativeTarget.startsWith(`..${sep}`),
    "only a source inside the disposable fixture may be changed or deleted");
  const sourceUri = vscode.Uri.file(target.path);
  try {
    const edited = ktcEncodeCodegenSource(`${target.text}\n// external change after preflight\n`, target.encoding);
    await fs.writeFile(sourceUri, edited);
    const observed = ktcDecodeCodegenSource(await fs.readFile(sourceUri));
    assert.ok(observed);
    const staleProjection = ktcProjectCodegenApply(rebuilt.plan, sources.map(source => source.path === target.path
      ? { path: source.path, ...observed }
      : source));
    assert.deepEqual(staleProjection.changes, []);
    assert.ok(staleProjection.diagnostics.some(diagnostic => diagnostic.code === "apply.source-changed"));
    assert.deepEqual(await fs.readFile(sourceUri), edited, "rejecting an old plan must preserve the external bytes");

    const refreshed = await preflight(documentUri, true);
    assert.equal(refreshed.reused, false);
    assert.ok(refreshed.markerIndexRevision > rebuilt.markerIndexRevision);
    assert.ok(refreshed.plan.markerRegions.some(region => region.path === target.path
      && region.sourceFingerprint === observed.fingerprint));

    await fs.delete(sourceUri, { useTrash: false });
    const missing = ktcProjectCodegenApply(refreshed.plan, sources.filter(source => source.path !== target.path));
    assert.deepEqual(missing.changes, []);
    assert.ok(missing.diagnostics.some(diagnostic => diagnostic.code === "apply.source-missing"));
    const deletedPreflight = await preflight(documentUri, true);
    assert.ok(deletedPreflight.markerIndexRevision > refreshed.markerIndexRevision);
    assert.equal(deletedPreflight.plan.markerRegions.some(region => region.path === target.path), false);
  } finally {
    await fs.writeFile(sourceUri, target.raw);
  }
  assert.deepEqual(await fs.readFile(sourceUri), target.raw);
  // Restore the persisted index as well, so later smoke flows do not consume the deleted fixture state.
  const restored = await preflight(documentUri, true);
  assert.ok(restored.plan.markerRegions.some(region => region.path === target.path));

  const checkpoint = await service.readSnapshot(probeJson);
  await fs.delete(probeJson, { useTrash: false });
  await assert.rejects(service.writeValidatedJson(probeJson, json.value, {
    expectedFingerprint: checkpoint.fingerprint,
  }), /再次变化|阻止覆盖/u);
  await assert.rejects(async () => fs.stat(probeJson), ktcCodegenIsFileNotFoundError);
  const recreated = await service.writeValidatedJson(probeJson, json.value, { requireMissing: true });
  assert.equal(recreated.text, json.value);

  const reappearedController = freshController();
  reappearedController.param.nameSpace = "ExternalRecreatedBeforeSave";
  const reappeared = reappearedController.writeJson();
  assert.ok(reappeared.ok && reappeared.value);
  await fs.writeFile(probeJson, encoder.encode(reappeared.value));
  await assert.rejects(service.writeValidatedJson(probeJson, json.value, { requireMissing: true }), /重新出现|阻止覆盖/u);
  assert.equal(await service.readText(probeJson), reappeared.value);
  assert.equal((await fs.readDirectory(probeRoot)).some(([name]) => name.includes(".kt-codegen-save-")), false,
    "rejected saves must remove their temporary files");

  return {
    cacheReused: true,
    cachePathIsolated: true,
    staleGeneratorRejected: true,
    corruptCacheRebuilt: true,
    sourceChangeRejected: true,
    sourceDeletionRejected: true,
    indexAdvancedAfterChange: true,
    sourceRestored: true,
    missingSaveRejected: true,
    recreated: true,
    reappearedFilePreserved: true,
  };
}
