import { describe, expect, it } from "vitest";
import { KtCodegenController, type KtCodegenPlan } from "@phoenix-wing/kt-codegen";
import { KtcCodegenDocumentModel } from "./documentModel.js";
import {
  ktcFindCodegenControlLocation,
  ktcFindCodegenControlRegion,
  ktcFindCodegenSessionControlLocation,
} from "./controlNavigation.js";

const region = {
  id: "region-1",
  path: "/workspace/src/PNXWidget.cpp",
  blockKey: "PARAM DECLARATION",
  classId: "PNXWidgetItem",
  nameSuffix: "Item",
  start: { line: 8 },
  end: { line: 10 },
} as unknown as KtCodegenPlan["markerRegions"][number];

const plan = {
  kind: "kt.codegen.plan",
  markerRegions: [region],
  diagnostics: [{
    code: "marker.missing-end",
    severity: "warning",
    message: "missing",
    path: { source: "source", file: "/workspace/src/Other.cpp", row: 21, column: 3 },
  }],
} as unknown as KtCodegenPlan;

describe("Codegen control navigation boundary", () => {
  it("Apply 后只读快照可查看源码但不能再次 Apply；过期后拒绝旧导航", () => {
    const session = new KtcCodegenDocumentModel({
      uri: "file:///workspace/example.json", fsPath: "/workspace/example.json", fileName: "example.json",
    }, new KtCodegenController());
    session.setPreflight({
      plan, reused: false, createdAt: "2026-09-09", markerIndexRevision: 1,
      indexedFileCount: 1, candidateFileCount: 1, cachePath: "/cache",
    });
    session.markPreflightApplied();
    expect(session.preflight).toBeUndefined();
    expect(ktcFindCodegenSessionControlLocation(session, region.path, 8)?.region).toBe(region);
    expect(ktcFindCodegenSessionControlLocation(session, "/private/other.cpp", 8)).toBeUndefined();
    expect(session.preflight).toBeUndefined();
    session.markExternalChanged();
    expect(ktcFindCodegenSessionControlLocation(session, region.path, 8)).toBeUndefined();
  });
  it("只接受当前 Plan 中 path/start line 完全匹配的区域", () => {
    expect(ktcFindCodegenControlRegion(plan, region.path, 8)).toBe(region);
    expect(ktcFindCodegenControlRegion(plan, region.path, 9)).toBeUndefined();
    expect(ktcFindCodegenControlRegion(plan, "/private/other.cpp", 8)).toBeUndefined();
    expect(ktcFindCodegenControlRegion(undefined, region.path, 8)).toBeUndefined();
    expect(ktcFindCodegenControlRegion(plan, region.path, -1)).toBeUndefined();
  });

  it("诊断和 region 共用受 Plan 约束的定位接口", () => {
    expect(ktcFindCodegenControlLocation(plan, region.path, 8)).toMatchObject({
      path: region.path,
      line: 8,
      region,
    });
    expect(ktcFindCodegenControlLocation(plan, "/workspace/src/Other.cpp", 21)).toEqual({
      path: "/workspace/src/Other.cpp",
      line: 21,
      column: 3,
    });
    expect(ktcFindCodegenControlLocation(plan, "/workspace/src/Other.cpp", 20)).toBeUndefined();
  });
});
