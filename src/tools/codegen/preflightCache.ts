import type { KtCodegenPlan } from "@phoenix-wing/kt-codegen";

export const KTC_CODEGEN_CACHE_SCHEMA_VERSION = 1 as const;
/**
 * 解析/渲染语义变化时递增，阻止复用旧 Plan。
 * 0.3.2：Marker 边界恢复语义变化，丢弃含旧 nested/mismatched 级联诊断的缓存并重新 Analyze。
 * 0.3.3：正式切换到 Wing 0.4.3，拒绝复用 Registry 0.4.2 生成的计划。
 * 缓存失效只负责重算计划；Apply 仍由新 Plan、指纹、dirty 与事务门禁共同决定。
 */
export const KTC_CODEGEN_GENERATOR_VERSION = "0.3.3";

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
  const containsLegacyMarkerCascade = Array.isArray(value?.plan?.diagnostics)
    && value.plan.diagnostics.some((diagnostic) =>
      diagnostic.code === "marker.nested-start"
      || diagnostic.code === "marker.mismatched-end");
  return value?.kind === "kt.codegen.preflight-cache"
    && value.schemaVersion === KTC_CODEGEN_CACHE_SCHEMA_VERSION
    && value.documentUri === documentUri
    && value.configFingerprint === configFingerprint
    && value.markerIndexRevision === markerIndexRevision
    && value.generatorVersion === KTC_CODEGEN_GENERATOR_VERSION
    && value.plan?.kind === "kt.codegen.plan"
    // 0.3.2 期间 Registry 0.4.2 与本地 Wing 曾使用相同版本；继续保留
    // 特征诊断兜底，防止外部或损坏缓存伪造为当前生成器版本。
    && !containsLegacyMarkerCascade;
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
