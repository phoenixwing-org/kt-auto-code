import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  KTC_CODEGEN_GENERATOR_VERSION,
  ktcValidCodegenMarkerIndex,
  ktcValidCodegenPreflightCache,
  type KtcCodegenMarkerIndex,
  type KtcCodegenPreflightCache,
} from "./preflightCache.js";
import {
  ktcValidCodegenApplyReceipt,
  type KtcCodegenApplyReceipt,
} from "./applyReceipt.js";

function example<T>(name: string): T {
  return JSON.parse(readFileSync(
    new URL(`../../../../doc/codegen-plan/${name}`, import.meta.url),
    "utf8",
  )) as T;
}

describe("Codegen documentation data examples", () => {
  it("Marker Index 样例可被当前运行时 schema 直接接受", () => {
    const index = example<KtcCodegenMarkerIndex>("KtCodegenMarkerIndex.example.json");
    expect(ktcValidCodegenMarkerIndex(
      index,
      index.workspaceUri,
      index.scopeId,
      index.ignoreFingerprint,
    )).toBe(true);
    expect(index.files.some((file) => file.candidate)).toBe(true);
  });

  it("Preflight Cache 样例可被当前运行时 schema 直接接受", () => {
    const cache = example<KtcCodegenPreflightCache>("KtCodegenPreflightCache.example.json");
    expect(cache.generatorVersion).toBe(KTC_CODEGEN_GENERATOR_VERSION);
    expect(ktcValidCodegenPreflightCache(
      cache,
      cache.documentUri,
      cache.configFingerprint,
      cache.markerIndexRevision,
    )).toBe(true);
  });

  it("Apply Receipt 样例可被当前运行时 schema 直接接受", () => {
    const receipt = example<KtcCodegenApplyReceipt>("KtCodegenApplyReceipt.example.json");
    expect(ktcValidCodegenApplyReceipt(receipt)).toBe(true);
  });

  it("UI/诊断整表样例保持不同 kind 与统一 schemaVersion", () => {
    const names = [
      "KtCodegenControlViewModel.example.json",
      "KtCodegenQaBaseline.example.json",
      "KtCodegenRuntimeDiagnostics.example.json",
      "KtCodegenTableData.example.json",
    ];
    const values = names.map((name) => example<{ kind: string; schemaVersion: number }>(name));
    expect(new Set(values.map((value) => value.kind)).size).toBe(names.length);
    expect(values.every((value) => value.schemaVersion === 1)).toBe(true);
  });
});
