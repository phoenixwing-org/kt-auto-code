import { describe, expect, it } from "vitest";
import type { KtCodegenPlan } from "@phoenix-wing/kt-codegen";
import {
  KTC_CODEGEN_GENERATOR_VERSION,
  ktcCanReuseCodegenMarkerEntry,
  ktcNextCodegenMarkerIndexRevision,
  ktcValidCodegenMarkerIndex,
  ktcValidCodegenPreflightCache,
  type KtcCodegenMarkerIndex,
  type KtcCodegenPreflightCache,
} from "./preflightCache.js";

const index: KtcCodegenMarkerIndex = {
  kind: "kt.codegen.marker-index",
  schemaVersion: 1,
  revision: 4,
  workspaceUri: "file:///workspace",
  scopeId: "workspace",
  ignoreFingerprint: "sha256:ignore",
  createdAt: "2026-07-16T00:00:00.000Z",
  files: [{ path: "src/Part.cpp", mtime: 1, size: 10, candidate: true }],
};

const cache: KtcCodegenPreflightCache = {
  kind: "kt.codegen.preflight-cache",
  schemaVersion: 1,
  createdAt: "2026-07-16T00:00:00.000Z",
  documentUri: "file:///workspace/PartParam.json",
  configFingerprint: "sha256:config",
  markerIndexRevision: 4,
  generatorVersion: KTC_CODEGEN_GENERATOR_VERSION,
  plan: { kind: "kt.codegen.plan" } as KtCodegenPlan,
};

describe("Codegen preflight cache data model", () => {
  it("Marker Index 同时绑定 workspace、scope 和 ignore 规则", () => {
    expect(ktcValidCodegenMarkerIndex(index, index.workspaceUri, index.scopeId, index.ignoreFingerprint)).toBe(true);
    expect(ktcValidCodegenMarkerIndex(index, "file:///other", index.scopeId, index.ignoreFingerprint)).toBe(false);
    expect(ktcValidCodegenMarkerIndex(index, index.workspaceUri, "workset:src", index.ignoreFingerprint)).toBe(false);
    expect(ktcValidCodegenMarkerIndex(index, index.workspaceUri, index.scopeId, "sha256:new-ignore")).toBe(false);
  });

  it("Preflight Cache 同时绑定文档、配置、索引 revision 和生成器版本", () => {
    expect(ktcValidCodegenPreflightCache(cache, cache.documentUri, cache.configFingerprint, 4)).toBe(true);
    expect(ktcValidCodegenPreflightCache({ ...cache, generatorVersion: "old" }, cache.documentUri, cache.configFingerprint, 4)).toBe(false);
    expect(ktcValidCodegenPreflightCache(cache, cache.documentUri, "sha256:changed", 4)).toBe(false);
    expect(ktcValidCodegenPreflightCache(cache, cache.documentUri, cache.configFingerprint, 5)).toBe(false);
  });

  it("0.3.3 拒绝 0.3.2 计划，以 Wing 0.4.3 重新 Analyze", () => {
    const oldMarkerPlan = { ...cache, generatorVersion: "0.3.2" };

    expect(KTC_CODEGEN_GENERATOR_VERSION).toBe("0.3.3");
    expect(ktcValidCodegenPreflightCache(
      oldMarkerPlan,
      oldMarkerPlan.documentUri,
      oldMarkerPlan.configFingerprint,
      oldMarkerPlan.markerIndexRevision,
    )).toBe(false);
  });

  it("即使版本标签相同，也拒绝旧扫描器写出的级联诊断计划", () => {
    for (const code of ["marker.nested-start", "marker.mismatched-end"] as const) {
      const mixedSourceCache = {
        ...cache,
        plan: {
          ...cache.plan,
          diagnostics: [{ code, severity: "error", message: "legacy cascade" }],
        } satisfies KtCodegenPlan,
      };

      expect(ktcValidCodegenPreflightCache(
        mixedSourceCache,
        mixedSourceCache.documentUri,
        mixedSourceCache.configFingerprint,
        mixedSourceCache.markerIndexRevision,
      )).toBe(false);
    }
  });

  it("索引内容不变保留 revision，任一文件状态变化才推进", () => {
    expect(ktcNextCodegenMarkerIndexRevision(index, [...index.files])).toBe(4);
    expect(ktcNextCodegenMarkerIndexRevision(index, [{ ...index.files[0]!, mtime: 2 }])).toBe(5);
    expect(ktcNextCodegenMarkerIndexRevision(undefined, [])).toBe(1);
  });

  it("stat 相同通常可复用，但 watcher 标脏后必须强制复读", () => {
    const entry = { mtime: 10, size: 20, candidate: false };
    expect(ktcCanReuseCodegenMarkerEntry(entry, { mtime: 10, size: 20 }, false)).toBe(true);
    expect(ktcCanReuseCodegenMarkerEntry(entry, { mtime: 10, size: 20 }, true)).toBe(false);
    expect(ktcCanReuseCodegenMarkerEntry(entry, { mtime: 11, size: 20 }, false)).toBe(false);
  });
});
