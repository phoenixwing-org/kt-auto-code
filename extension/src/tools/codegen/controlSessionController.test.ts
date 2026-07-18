import { describe, expect, it } from "vitest";
import { KtCodegenController } from "@phoenix-wing/kt-codegen";
import { KtcCodegenDocumentModel } from "./documentModel.js";
import { KtcCodegenControlSessionController } from "./controlSessionController.js";

const VALID_JSON = {
  type: "100106", version: "4.0", NamePrefix: "CAT", NameMiddle: "Demo",
  NameSpace: "Kt", AppendFunction: "push_back",
  headers: [
    "NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue",
    "CATAttrInOut", "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit",
    "Author", "CreateDate", "Notes",
  ],
  data: [["Base", 1, "First", "First", "int", "Integer", 0, "In", 0, 0, "", 0, 0, "", "", "", ""]],
};

function session(): KtcCodegenDocumentModel {
  const controller = new KtCodegenController();
  controller.readJson(VALID_JSON);
  return new KtcCodegenDocumentModel({
    uri: "file:///workspace/Demo.json", fsPath: "/workspace/Demo.json", fileName: "Demo.json",
  }, controller);
}

describe("KtcCodegenControlSessionController", () => {
  it("投影共享 catalog/full model，不引入第二份选择状态", () => {
    const model = session();
    const controls = new KtcCodegenControlSessionController();
    expect(controls.catalogModel(model)).toMatchObject({
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: model.identity.uri,
      selectedBlockKeys: model.selectedBlockKeys,
      showMissingTemplates: false,
      preflightAvailable: false,
    });
    expect(controls.catalogModel(model).blocks).toHaveLength(32);
    expect(controls.viewModel(model).preflight).toBeUndefined();
  });

  it("把当前预检投影为命中、未命中和未选择状态", () => {
    const model = session();
    model.setSelectedBlockKeys(["PARAM DECLARATION", "QT UPDATE DIALOG"]);
    model.setPreflight({
      plan: {
        markerRegions: [{ blockKey: "PARAM DECLARATION", classId: "CATDemoBase" }],
        artifacts: [{ blockKey: "PARAM DECLARATION", classId: "CATDemoBase" }],
        diagnostics: [],
      } as unknown as NonNullable<typeof model.preflight>["plan"],
      reused: false,
      createdAt: "2026-07-18T00:00:00.000Z",
      markerIndexRevision: 1,
      indexedFileCount: 1,
      candidateFileCount: 1,
      cachePath: "/workspace/.phoenix/cache/codegen/test.json",
    });

    const blocks = new KtcCodegenControlSessionController().catalogModel(model).blocks;
    expect(blocks.find((block) => block.key === "PARAM DECLARATION")).toMatchObject({
      status: "hit", hitCount: 1, artifactCount: 1,
    });
    expect(blocks.find((block) => block.key === "QT UPDATE DIALOG")).toMatchObject({
      status: "missing", hitCount: 0, artifactCount: 0,
    });
    expect(blocks.find((block) => block.key === "CATALOG PARAMS")).toMatchObject({
      status: "unselected", hitCount: 0, artifactCount: 0,
    });
  });

  it("选择和显示命令只修改会话并返回结构化 Host 动作", () => {
    const model = session();
    const controls = new KtcCodegenControlSessionController();
    const selected = controls.handle(model, {
      type: "codegenControlSelection",
      blockKeys: ["PARAM DECLARATION"], singleMode: true,
    });
    expect(selected).toMatchObject({ modelChanged: true, editorStatusMessage: expect.any(String) });
    expect(model.selectedBlockKeys).toEqual(["PARAM DECLARATION"]);
    expect(model.singleSelectionMode).toBe(true);
    expect(controls.catalogModel(model).selectedBlockKeys).toEqual(["PARAM DECLARATION"]);
    expect(controls.viewModel(model).selectedBlockKeys).toEqual(["PARAM DECLARATION"]);

    const display = controls.handle(model, {
      type: "codegenControlDisplay",
      showMissingTemplates: true,
    });
    expect(display).toMatchObject({ modelChanged: true, statusMessage: expect.stringContaining("显示") });
    expect(model.showMissingTemplates).toBe(true);
    expect(model.dirty).toBe(false);
  });

  it("日志命令返回文本而不直接依赖 Output Channel", () => {
    const model = session();
    const result = new KtcCodegenControlSessionController().handle(model, {
      type: "codegenControlOutput",
      scope: "block", blockKey: "PARAM DECLARATION",
    });
    expect(result.modelChanged).toBe(false);
    expect(result.logLines?.[0]).toContain("scope=block；blocks=1；classes=1；templates=1");
    expect(result.logLines?.join("\n")).toContain("CATDemoBase PARAM DECLARATION");
    expect(result.logLines?.join("\n")).toContain("int First;");
    expect(result.clipboardText).toContain("// clang-format off");
    expect(result.clipboardText).toContain("int First;");
    expect(result.clipboardText).toContain("// clang-format on");
    expect(result.clipboardText).not.toContain("[Codegen]");
    expect(result.statusMessage).toContain("1 组使用当前 JSON 真实生成内容");
  });

  it("当前筛选输出由 Host 校验、去重并恢复 legacy 顺序", () => {
    const model = session();
    const controls = new KtcCodegenControlSessionController();
    const result = controls.handle(model, {
      type: "codegenControlOutput",
      scope: "visible",
      blockKeys: [
        "QT UPDATE DIALOG",
        "invalid block" as "PARAM DECLARATION",
        "PARAM DECLARATION",
        "QT UPDATE DIALOG",
      ],
    });
    const log = result.logLines?.join("\n") ?? "";
    expect(result.logLines?.[0]).toContain("scope=visible；blocks=2；classes=1；templates=2");
    expect(log.indexOf("# 11 PARAM define · PARAM DECLARATION")).toBeLessThan(
      log.indexOf("# 17 Update QT Dialog · QT UPDATE DIALOG"),
    );
    expect(log).not.toContain("invalid block");

    const empty = controls.handle(model, {
      type: "codegenControlOutput",
      scope: "visible",
      blockKeys: ["invalid block" as "PARAM DECLARATION"],
    });
    expect(empty.clipboardText).toBeUndefined();
    expect(empty.logLines?.[0]).toContain("filter.empty");
  });
});
