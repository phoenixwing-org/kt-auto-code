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
  });
});
