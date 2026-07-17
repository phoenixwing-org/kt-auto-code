import type { KtCodegenPlan } from "@phoenix-wing/kt-codegen";

export const KTC_CODEGEN_CACHE_SCHEMA_VERSION = 1 as const;
/** 解析/渲染语义变化时递增，阻止复用旧 Plan（0.3.1 修复通用 Kevin block 配对）。 */
export const KTC_CODEGEN_GENERATOR_VERSION = "0.3.1";

export interface KtcCodegenMarkerIndexEntry {
  readonly path: string;
  readonly mtime: number;
  readonly size: number;
  readonly candidate: boolean;
  readonly markerCount?: number;
  readonly fingerprint?: string;
  readonly encoding?: string;
  readonly eol?: "lf" | "crlf";
}

export interface KtcCodegenMarkerIndex {
  readonly kind: "kt.codegen.marker-index";
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly workspaceUri: string;
  readonly scopeId: string;
  readonly ignoreFingerprint: string;
  readonly createdAt: string;
  readonly files: readonly KtcCodegenMarkerIndexEntry[];
}

export interface KtcCodegenPreflightCache {
  readonly kind: "kt.codegen.preflight-cache";
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly documentUri: string;
  readonly configFingerprint: string;
  readonly markerIndexRevision: number;
  readonly generatorVersion: string;
  readonly plan: KtCodegenPlan;
}

export function ktcValidCodegenMarkerIndex(
  value: KtcCodegenMarkerIndex | undefined,
  workspaceUri: string,
  scopeId: string,
  ignoreFingerprint: string,
): value is KtcCodegenMarkerIndex {
  return value?.kind === "kt.codegen.marker-index"
    && value.schemaVersion === KTC_CODEGEN_CACHE_SCHEMA_VERSION
    && value.workspaceUri === workspaceUri
    && value.scopeId === scopeId
    && value.ignoreFingerprint === ignoreFingerprint
    && Array.isArray(value.files);
}

export function ktcValidCodegenPreflightCache(
  value: KtcCodegenPreflightCache | undefined,
  documentUri: string,
  configFingerprint: string,
  markerIndexRevision: number,
): value is KtcCodegenPreflightCache {
  return value?.kind === "kt.codegen.preflight-cache"
    && value.schemaVersion === KTC_CODEGEN_CACHE_SCHEMA_VERSION
    && value.documentUri === documentUri
    && value.configFingerprint === configFingerprint
    && value.markerIndexRevision === markerIndexRevision
    && value.generatorVersion === KTC_CODEGEN_GENERATOR_VERSION
    && value.plan?.kind === "kt.codegen.plan";
}

/** watcher 已报告源码变化时强制复读，不能只依赖可能同毫秒且同尺寸的 stat。 */
export function ktcCanReuseCodegenMarkerEntry(
  entry: Pick<KtcCodegenMarkerIndexEntry, "mtime" | "size"> | undefined,
  stat: { readonly mtime: number; readonly size: number },
  forceRefresh: boolean,
): entry is KtcCodegenMarkerIndexEntry {
  return !forceRefresh && !!entry && entry.mtime === stat.mtime && entry.size === stat.size;
}

/** 文件索引内容不变时保持 revision，变化时单调加一。 */
export function ktcNextCodegenMarkerIndexRevision(
  previous: KtcCodegenMarkerIndex | undefined,
  files: readonly KtcCodegenMarkerIndexEntry[],
): number {
  if (previous && JSON.stringify(previous.files) === JSON.stringify(files)) {
    return previous.revision;
  }
  return (previous?.revision ?? 0) + 1;
}
