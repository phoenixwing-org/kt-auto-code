import * as vscode from "vscode";
import { createHash } from "node:crypto";
import { relative } from "node:path";
import {
  KT_CODEGEN_LEGACY_BLOCKS,
  type KtCodegenBlockKey,
  type KtCodegenController,
  type KtCodegenSourceFileSnapshot,
} from "@phoenix-wing/kt-codegen";
import type { KtcCodegenPreflightResult } from "./contracts.js";
import { isIgnoredPath } from "../../core/dotIgnore.js";
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import {
  ktcFileInWorkspaceScope,
  ktcResolveWorkspaceFileScope,
} from "../../worksets.js";
import {
  KTC_CODEGEN_GENERATOR_VERSION,
  ktcCanReuseCodegenMarkerEntry,
  ktcNextCodegenMarkerIndexRevision,
  ktcValidCodegenMarkerIndex,
  ktcValidCodegenPreflightCache,
  type KtcCodegenMarkerIndex,
  type KtcCodegenMarkerIndexEntry,
  type KtcCodegenPreflightCache,
} from "./preflightCache.js";
import { ktcDecodeCodegenSource } from "./sourceCodec.js";
import {
  ktcAssertCodegenSourceScanComplete,
} from "./sourceScanPolicy.js";

const SOURCE_GLOB = "**/*.{h,hpp,hh,hxx,c,cc,cpp,cxx}";
const SOURCE_EXCLUDE = "**/{.git,.phoenix,node_modules,dist,build,out,target}/**";
const MARKER_TEXT = "KEVIN CAA WIZARD SECTION";

function throwIfCancelled(token?: vscode.CancellationToken): void {
  if (token?.isCancellationRequested) throw new vscode.CancellationError();
}

function hash(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizePath(root: string, uri: vscode.Uri): string {
  return relative(root, uri.fsPath).replaceAll("\\", "/");
}

async function readJson<T>(uri: vscode.Uri): Promise<T | undefined> {
  try {
    return JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))) as T;
  } catch {
    return undefined;
  }
}

async function writeJsonAtomic(uri: vscode.Uri, value: unknown): Promise<void> {
  const slash = uri.path.lastIndexOf("/");
  const parent = uri.with({ path: slash > 0 ? uri.path.slice(0, slash) : "/" });
  await vscode.workspace.fs.createDirectory(parent);
  const temp = uri.with({ path: `${uri.path}.${Date.now()}.tmp` });
  await vscode.workspace.fs.writeFile(
    temp,
    new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`),
  );
  try {
    await vscode.workspace.fs.rename(temp, uri, { overwrite: true });
  } catch (error) {
    try {
      await vscode.workspace.fs.delete(temp, { useTrash: false });
    } catch {
      // 原始异常更有价值。
    }
    throw error;
  }
}

async function buildMarkerIndex(
  workspaceRoot: string,
  scopeId: string,
  indexUri: vscode.Uri,
  forceRefresh = false,
  cancellationToken?: vscode.CancellationToken,
  reportProgress?: (message: string) => void,
): Promise<KtcCodegenMarkerIndex> {
  throwIfCancelled(cancellationToken);
  const root = vscode.Uri.file(workspaceRoot);
  const scope = await ktcResolveWorkspaceFileScope(root, scopeId);
  const resolvedScopeId = scope.kind === "workset" ? scope.worksetId ?? scopeId : "workspace";
  const ignorePatterns = resolveWorkspaceIgnorePatterns(workspaceRoot);
  const ignoreFingerprint = hash(JSON.stringify(ignorePatterns));
  const previousValue = await readJson<KtcCodegenMarkerIndex>(indexUri);
  const previous = ktcValidCodegenMarkerIndex(
    previousValue,
    root.toString(),
    resolvedScopeId,
    ignoreFingerprint,
  ) ? previousValue : undefined;
  const previousByPath = new Map(previous?.files.map((file) => [file.path, file]));
  const uris = (await vscode.workspace.findFiles(
    new vscode.RelativePattern(root, SOURCE_GLOB),
    SOURCE_EXCLUDE,
    undefined,
    cancellationToken,
  ));
  const scopedUris = uris
    .filter((uri) => ktcFileInWorkspaceScope(uri, scope))
    .filter((uri) => !isIgnoredPath(normalizePath(workspaceRoot, uri), ignorePatterns));
  ktcAssertCodegenSourceScanComplete(scopedUris.length);
  throwIfCancelled(cancellationToken);
  reportProgress?.(`已定位 ${scopedUris.length} 个源码文件，正在更新控制符索引…`);

  const files: KtcCodegenMarkerIndexEntry[] = [];
  for (const [position, uri] of scopedUris.entries()) {
    throwIfCancelled(cancellationToken);
    if (position > 0 && position % 100 === 0) {
      reportProgress?.(`正在更新控制符索引：${position} / ${scopedUris.length}`);
    }
    const path = normalizePath(workspaceRoot, uri);
    const stat = await vscode.workspace.fs.stat(uri);
    const old = previousByPath.get(path);
    if (ktcCanReuseCodegenMarkerEntry(old, stat, forceRefresh)) {
      files.push(old);
      continue;
    }
    const decoded = ktcDecodeCodegenSource(await vscode.workspace.fs.readFile(uri));
    if (!decoded) {
      files.push({ path, mtime: stat.mtime, size: stat.size, candidate: false });
      continue;
    }
    const candidate = decoded.text.includes(MARKER_TEXT);
    const markerCount = candidate ? decoded.text.split(MARKER_TEXT).length - 1 : 0;
    files.push({
      path,
      mtime: stat.mtime,
      size: stat.size,
      candidate,
      ...(candidate ? {
        markerCount,
        fingerprint: decoded.fingerprint,
        encoding: decoded.encoding,
        eol: decoded.eol,
      } : {}),
    });
  }
  reportProgress?.(`控制符索引已更新：${files.length} / ${scopedUris.length}`);
  files.sort((left, right) => left.path.localeCompare(right.path));

  const revision = ktcNextCodegenMarkerIndexRevision(previous, files);
  const index: KtcCodegenMarkerIndex = {
    kind: "kt.codegen.marker-index",
    schemaVersion: 1,
    revision,
    workspaceUri: root.toString(),
    scopeId: resolvedScopeId,
    ignoreFingerprint,
    createdAt: new Date().toISOString(),
    files,
  };
  if (!previous || revision !== previous.revision) await writeJsonAtomic(indexUri, index);
  return index;
}

export interface KtcCodegenCandidateScanResult {
  readonly revision: number;
  readonly indexedFileCount: number;
  readonly createdAt: string;
  readonly indexPath: string;
  readonly candidates: readonly {
    readonly uri: string;
    readonly displayPath: string;
    readonly markerCount: number;
    readonly encoding: string;
    readonly eol: "lf" | "crlf";
  }[];
}

/**
 * 工作区级候选扫描。只建立控制标记索引，不需要也不读取任何 Codegen JSON。
 */
export async function ktcScanCodegenCandidates(options: {
  readonly workspaceRoot: string;
  readonly scopeId: string;
  readonly forceRefresh?: boolean;
  readonly cancellationToken?: vscode.CancellationToken;
  readonly reportProgress?: (message: string) => void;
}): Promise<KtcCodegenCandidateScanResult> {
  const cacheRoot = vscode.Uri.joinPath(
    vscode.Uri.file(options.workspaceRoot),
    ".phoenix",
    "cache",
    "codegen",
  );
  const indexUri = vscode.Uri.joinPath(cacheRoot, "marker-index-v1.json");
  const index = await buildMarkerIndex(
    options.workspaceRoot,
    options.scopeId,
    indexUri,
    options.forceRefresh,
    options.cancellationToken,
    options.reportProgress,
  );
  throwIfCancelled(options.cancellationToken);
  const root = vscode.Uri.file(options.workspaceRoot);
  return {
    revision: index.revision,
    indexedFileCount: index.files.length,
    createdAt: index.createdAt,
    indexPath: indexUri.fsPath,
    candidates: index.files
      .filter((file) => file.candidate)
      .map((file) => ({
        uri: vscode.Uri.joinPath(root, ...file.path.split("/")).toString(),
        displayPath: file.path,
        markerCount: file.markerCount ?? 1,
        encoding: file.encoding ?? "unknown",
        eol: file.eol ?? "lf",
      })),
  };
}

async function sourceSnapshots(
  workspaceRoot: string,
  entries: readonly KtcCodegenMarkerIndexEntry[],
  cancellationToken?: vscode.CancellationToken,
  reportProgress?: (message: string) => void,
): Promise<KtCodegenSourceFileSnapshot[]> {
  const snapshots: KtCodegenSourceFileSnapshot[] = [];
  const candidateCount = entries.filter((entry) => entry.candidate).length;
  let processed = 0;
  for (const entry of entries) {
    throwIfCancelled(cancellationToken);
    if (!entry.candidate) continue;
    processed += 1;
    const uri = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), ...entry.path.split("/"));
    const decoded = ktcDecodeCodegenSource(await vscode.workspace.fs.readFile(uri));
    if (decoded) {
      snapshots.push({
        path: uri.fsPath,
        text: decoded.text,
        fingerprint: decoded.fingerprint,
        encoding: decoded.encoding,
        eol: decoded.eol,
      });
    }
    if (processed === candidateCount || processed % 25 === 0) {
      reportProgress?.(`正在读取候选源码：${processed} / ${candidateCount}`);
    }
  }
  return snapshots;
}

/** 建立/复用 Marker Index 和当前 JSON 的 Wing Analyze Plan。 */
export async function ktcRunCodegenPreflight(options: {
  readonly workspaceRoot: string;
  readonly scopeId: string;
  readonly documentUri: vscode.Uri;
  readonly controller: KtCodegenController;
  readonly blockKeys: readonly KtCodegenBlockKey[];
  readonly forceRefresh?: boolean;
  readonly cancellationToken?: vscode.CancellationToken;
  readonly reportProgress?: (message: string) => void;
}): Promise<KtcCodegenPreflightResult> {
  const cacheRoot = vscode.Uri.joinPath(
    vscode.Uri.file(options.workspaceRoot),
    ".phoenix",
    "cache",
    "codegen",
  );
  const indexUri = vscode.Uri.joinPath(cacheRoot, "marker-index-v1.json");
  const documentKey = createHash("sha256")
    .update(options.documentUri.toString())
    .digest("hex")
    .slice(0, 24);
  const cacheUri = vscode.Uri.joinPath(cacheRoot, "preflight-v1", `${documentKey}.json`);
  const index = await buildMarkerIndex(
    options.workspaceRoot,
    options.scopeId,
    indexUri,
    options.forceRefresh,
    options.cancellationToken,
    options.reportProgress,
  );
  throwIfCancelled(options.cancellationToken);
  const normalized = options.controller.writeJson();
  if (!normalized.ok || normalized.value === null) {
    throw new Error("当前 Codegen JSON 无法通过预检输入校验");
  }
  const configFingerprint = hash(JSON.stringify({
    param: normalized.value,
    blockKeys: options.blockKeys,
    scopeId: index.scopeId,
    ignoreFingerprint: index.ignoreFingerprint,
  }));
  const oldCache = await readJson<KtcCodegenPreflightCache>(cacheUri);
  throwIfCancelled(options.cancellationToken);
  if (ktcValidCodegenPreflightCache(
    oldCache,
    options.documentUri.toString(),
    configFingerprint,
    index.revision,
  )) {
    return {
      plan: oldCache.plan,
      reused: true,
      createdAt: oldCache.createdAt,
      markerIndexRevision: index.revision,
      indexedFileCount: index.files.length,
      candidateFileCount: index.files.filter((file) => file.candidate).length,
      cachePath: cacheUri.fsPath,
    };
  }

  const targets = [...new Set(options.blockKeys.map((key) =>
    KT_CODEGEN_LEGACY_BLOCKS.find((block) => block.key === key)?.target,
  ).filter((target): target is NonNullable<typeof target> => Boolean(target)))];
  const snapshots = await sourceSnapshots(
    options.workspaceRoot,
    index.files,
    options.cancellationToken,
    options.reportProgress,
  );
  throwIfCancelled(options.cancellationToken);
  const plan = options.controller.analyze({
    targets,
    blockKeys: options.blockKeys,
    snapshot: { files: snapshots },
  });
  throwIfCancelled(options.cancellationToken);
  const createdAt = new Date().toISOString();
  await writeJsonAtomic(cacheUri, {
    kind: "kt.codegen.preflight-cache",
    schemaVersion: 1,
    createdAt,
    documentUri: options.documentUri.toString(),
    configFingerprint,
    markerIndexRevision: index.revision,
    generatorVersion: KTC_CODEGEN_GENERATOR_VERSION,
    plan,
  } satisfies KtcCodegenPreflightCache);
  throwIfCancelled(options.cancellationToken);
  return {
    plan,
    reused: false,
    createdAt,
    markerIndexRevision: index.revision,
    indexedFileCount: index.files.length,
    candidateFileCount: index.files.filter((file) => file.candidate).length,
    cachePath: cacheUri.fsPath,
  };
}

export type { KtcCodegenPreflightResult } from "./contracts.js";
