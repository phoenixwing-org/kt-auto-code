import { describe, expect, it } from "vitest";
import { KtCodegenController } from "@phoenix-wing/kt-codegen";
import { KtcCodegenDocumentModel } from "./documentModel.js";

const VALID_JSON = {
  type: "100106",
  version: "4.0",
  NamePrefix: "PNX",
  NameMiddle: "Part",
  NameSpace: "Kt",
  AppendFunction: "push_back",
  headers: [
    "NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue",
    "CATAttrInOut", "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit",
    "Author", "CreateDate", "Notes",
  ],
  data: [["Part", 1, "First", "First", "int", "Integer", 0, "In", 0, 0, "", 0, 0, "", "", "", ""]],
};

function createModel(): KtcCodegenDocumentModel {
  const controller = new KtCodegenController();
  controller.readJson(VALID_JSON);
  return new KtcCodegenDocumentModel({
    uri: "file:///workspace/example.json",
    fsPath: "/workspace/example.json",
    fileName: "example.json",
  }, controller, 0, "sha256:original");
}

describe("KtcCodegenDocumentModel", () => {
  it("集中维护整表交换、dirty 与 revision 门禁", () => {
    const model = createModel();
    const draft = model.getTableData();
    draft.items[0]!.name = "Changed";

    expect(model.acceptTable(draft)).toBe("accepted");
    expect(model.dirty).toBe(true);
    expect(model.controller.param.items[0]!.name).toBe("Changed");

    model.markSaved(2);
    expect(model.dirty).toBe(false);
    expect(model.revision).toBe(1);
    expect(model.getTableData().documentRevision).toBe(1);

    draft.items[0]!.name = "Stale";
    expect(model.acceptTable(draft)).toBe("stale");
    expect(model.controller.param.items[0]!.name).toBe("Changed");
  });

  it("属性、控制符和表格修改都会使旧预检失效", () => {
    const model = createModel();
    model.setPreflight({
      plan: { kind: "kt.codegen.plan" } as NonNullable<typeof model.preflight>["plan"],
      reused: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      markerIndexRevision: 1,
      indexedFileCount: 1,
      candidateFileCount: 1,
      cachePath: "/workspace/.phoenix/cache/codegen/test.json",
    });
    expect(model.updateMeta("nameMiddle", "Assembly")).toBe(true);
    expect(model.preflight).toBeUndefined();
    expect(model.dirty).toBe(true);

    model.setSelectedBlockKeys(["PARAM DECLARATION"]);
    expect(model.selectedBlockKeys).toEqual(["PARAM DECLARATION"]);
    expect(model.preflight).toBeUndefined();
  });

  it("控制符单选模式属于会话状态，单独切换模式不使预检失效", () => {
    const model = createModel();
    const preflight = {
      plan: { kind: "kt.codegen.plan" } as NonNullable<typeof model.preflight>["plan"],
      reused: true,
      createdAt: "2026-07-16T00:00:00.000Z",
      markerIndexRevision: 1,
      indexedFileCount: 1,
      candidateFileCount: 1,
      cachePath: "/workspace/.phoenix/cache/codegen/test.json",
    };
    model.setPreflight(preflight);

    const modeOnly = model.setSelectedBlockKeys(model.selectedBlockKeys, true);
    expect(modeOnly).toEqual({ selectionChanged: false, modeChanged: true });
    expect(model.singleSelectionMode).toBe(true);
    expect(model.preflight).toBe(preflight);

    const selection = model.setSelectedBlockKeys(["PARAM DECLARATION"], true);
    expect(selection).toEqual({ selectionChanged: true, modeChanged: false });
    expect(model.preflight).toBeUndefined();
  });

  it("缺失模板显示开关只属于会话，不使文档变脏或预检失效", () => {
    const model = createModel();
    const preflight = {
      plan: { kind: "kt.codegen.plan" } as NonNullable<typeof model.preflight>["plan"],
      reused: true,
      createdAt: "2026-07-18T00:00:00.000Z",
      markerIndexRevision: 1,
      indexedFileCount: 1,
      candidateFileCount: 1,
      cachePath: "/workspace/.phoenix/cache/codegen/test.json",
    };
    model.setPreflight(preflight);

    expect(model.setShowMissingTemplates(true)).toBe(true);
    expect(model.showMissingTemplates).toBe(true);
    expect(model.dirty).toBe(false);
    expect(model.preflight).toBe(preflight);
    expect(model.setShowMissingTemplates(true)).toBe(false);
  });

  it("磁盘还原原地更新共享 Param 并建立新 checkpoint", () => {
    const model = createModel();
    model.updateMeta("nameMiddle", "Draft");
    const disk = new KtCodegenController();
    disk.readJson({ ...VALID_JSON, NameMiddle: "Disk" });
    const json = disk.writeJson().value!;

    const result = model.reloadFromJson(json, "sha256:disk");
    expect(result.ok).toBe(true);
    expect(model.controller.param.nameMiddle).toBe("Disk");
    expect(model.tableCore.param).toBe(model.controller.param);
    expect(model.dirty).toBe(false);
    expect(model.revision).toBe(1);
    expect(model.diskFingerprint).toBe("sha256:disk");
    expect(model.externalState).toBe("current");
  });

  it("把外部修改和删除建模为显式冲突，并在 checkpoint 后清除", () => {
    const model = createModel();
    model.setPreflight({
      plan: { kind: "kt.codegen.plan" } as NonNullable<typeof model.preflight>["plan"],
      reused: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      markerIndexRevision: 1,
      indexedFileCount: 1,
      candidateFileCount: 1,
      cachePath: "/workspace/.phoenix/cache/codegen/test.json",
    });

    expect(model.observeExternalFingerprint("sha256:original")).toBe("unchanged");
    expect(model.hasExternalConflict).toBe(false);
    expect(model.observeExternalFingerprint("sha256:external")).toBe("changed");
    expect(model.externalState).toBe("changed");
    expect(model.hasExternalConflict).toBe(true);
    expect(model.preflight).toBeUndefined();

    model.markExternalDeleted();
    expect(model.externalState).toBe("deleted");
    model.markSaved(0, "sha256:saved");
    expect(model.externalState).toBe("current");
    expect(model.diskFingerprint).toBe("sha256:saved");
  });

  it("外部 JSON 失效时保留最后一次有效 Param 和显式冲突", () => {
    const model = createModel();
    const originalParam = model.controller.param;
    const originalItem = originalParam.items[0];
    model.observeExternalFingerprint("sha256:invalid-json");

    const result = model.reloadFromJson("{ invalid json", "sha256:invalid-json");

    expect(result.ok).toBe(false);
    expect(model.controller.param).toBe(originalParam);
    expect(model.controller.param.items[0]).toBe(originalItem);
    expect(model.controller.param.nameMiddle).toBe("Part");
    expect(model.externalState).toBe("changed");
    expect(model.diskFingerprint).toBe("sha256:original");
    expect(model.revision).toBe(0);
  });

  it("外部文件无法读取时可直接标记 changed 并使预检失效", () => {
    const model = createModel();
    model.setPreflight({
      plan: { kind: "kt.codegen.plan" } as NonNullable<typeof model.preflight>["plan"],
      reused: false,
      createdAt: "2026-07-17T00:00:00.000Z",
      markerIndexRevision: 1,
      indexedFileCount: 1,
      candidateFileCount: 1,
      cachePath: "/workspace/.phoenix/cache/codegen/test.json",
    });

    model.markExternalChanged();

    expect(model.externalState).toBe("changed");
    expect(model.hasExternalConflict).toBe(true);
    expect(model.preflight).toBeUndefined();
    expect(model.controller.param.nameMiddle).toBe("Part");
  });

  it("左侧属性和右侧整表草稿可在同一 revision 合并后一起写出", () => {
    const model = createModel();
    const table = model.getTableData();
    table.items[0]!.name = "TableDraft";

    expect(model.updateMeta("nameSpace", "BlockDraft")).toBe(true);
    expect(model.acceptTable(table)).toBe("accepted");
    const written = model.controller.writeJson();

    expect(written.ok).toBe(true);
    expect(written.value).toContain('"NameSpace": "BlockDraft"');
    expect(written.value).toContain("TableDraft");
  });
});
