import { describe, expect, it } from "vitest";
import rawSample from "../../ui-preview/fixtures/right-primary.sample.json";
import {
  PREVIEW_RIGHT_PRIMARY_SAMPLE,
  parsePreviewRightPrimarySample,
} from "../../ui-preview/src/previewRightPrimarySample.js";

describe("Primary UI preview Right migration sample", () => {
  it("用一份固定 JSON 驱动两个 companion 与正式 Codegen Primary 模型", () => {
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.companions.packageIncludes.facts.map(({ id }) => id))
      .toEqual(["target", "package", "ignore", "scan", "matches"]);
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.companions.packageIncludes.actions.map(({ actionId }) => actionId))
      .toEqual(["preview", "reveal", "openEnvironment"]);
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.companions.projectRename.actions.map(({ actionId }) => actionId))
      .toEqual(["chooseRoot", "reveal", "cancel", "openGitChanges"]);
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameHistory).toMatchObject({
      selectedId: "",
      items: [
        { group: "当前项目方案" },
        { group: "用户最近输入" },
      ],
    });
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameOverview.map(({ label, value }) => [label, value]))
      .toEqual([["项目", "18"], ["替换", "42"], ["低风险", "13"], ["中风险", "4"], ["高风险", "1"], ["分类", "3"]]);
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameRootSuggestion).toMatchObject({
      source: "/workspace/phoenix-open-issue",
      target: "/workspace/phoenix-issue",
      enabled: true,
    });
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameProfiles).toMatchObject({
      selectedId: "profile:phoenix-product",
      profileName: "Phoenix 产品改名",
      items: [{ id: "profile:phoenix-product" }],
    });
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.codegen).toMatchObject({
      kind: "kt.codegen.primary-ui-model",
      schemaVersion: 1,
      activeId: expect.stringContaining("PNXTemplateFeatureData.json"),
      running: false,
    });
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.codegen.documents[0]).toMatchObject({
      fileName: "PNXTemplateFeatureData.json",
      className: "PNXTemplateFeatureData",
      displayPath: "PNXTemplateFeatureData.json",
      itemCount: 7,
      active: true,
      open: true,
    });
    expect(PREVIEW_RIGHT_PRIMARY_SAMPLE.codegen.documents).toHaveLength(2);
  });

  it("拒绝损坏的根契约和 Codegen 列表", () => {
    expect(() => parsePreviewRightPrimarySample({ ...rawSample, schemaVersion: 2 }))
      .toThrow("schemaVersion must be 1");
    expect(() => parsePreviewRightPrimarySample({
      ...rawSample,
      codegen: { ...rawSample.codegen, documents: null },
    })).toThrow("model lists are invalid");
    expect(() => parsePreviewRightPrimarySample({
      ...rawSample,
      projectRenameHistory: { ...rawSample.projectRenameHistory, selectedId: "missing" },
    })).toThrow("selectedId is missing");
    expect(() => parsePreviewRightPrimarySample({
      ...rawSample,
      projectRenameOverview: null,
    })).toThrow("overview contract is invalid");
    expect(() => parsePreviewRightPrimarySample({
      ...rawSample,
      projectRenameRootSuggestion: { ...rawSample.projectRenameRootSuggestion, enabled: "yes" },
    })).toThrow("enabled must be a boolean");
    expect(() => parsePreviewRightPrimarySample({
      ...rawSample,
      projectRenameProfiles: { ...rawSample.projectRenameProfiles, selectedId: "missing" },
    })).toThrow("profiles selectedId is missing");
  });
});
