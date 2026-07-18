import { describe, expect, it, vi } from "vitest";
import { KtCodegenController } from "@phoenix-wing/kt-codegen";
import { KtcCodegenDocumentModel } from "./documentModel.js";
import { KtcCodegenEditorSessionPresenter } from "./editorSessionPresenter.js";
import type { KtcCodegenControlViewModel } from "./controlViewModel.js";

function session(): KtcCodegenDocumentModel {
  const controller = new KtCodegenController();
  controller.readJson({
    type: "100106", version: "4.0", NamePrefix: "CAT", NameMiddle: "Demo",
    NameSpace: "Kt", AppendFunction: "push_back",
    headers: [
      "NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue",
      "CATAttrInOut", "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit",
      "Author", "CreateDate", "Notes",
    ],
    data: [["Base", 1, "First", "First", "int", "Integer", 0, "In", 0, 0, "", 0, 0, "", "", "", ""]],
  });
  return new KtcCodegenDocumentModel({
    uri: "file:///workspace/Demo.json",
    fsPath: "/workspace/Demo.json",
    fileName: "Demo.json",
  }, controller);
}

function controlModel(model: KtcCodegenDocumentModel): KtcCodegenControlViewModel {
  return {
    kind: "kt.codegen.control-view-model",
    schemaVersion: 1,
    uri: model.identity.uri,
    fileName: model.identity.fileName,
    blocks: [],
    selectedBlockKeys: [],
    singleSelectionMode: false,
    showMissingTemplates: false,
    preflightAvailable: false,
    missingTemplates: [],
    presets: { all: [], none: [], cppOnly: [], fieldCode: [] },
  };
}

function fixture() {
  const view = {
    showEditor: vi.fn(),
    setDocumentState: vi.fn(),
    postEditor: vi.fn(),
    publishProblems: vi.fn(),
  };
  const controls = { viewModel: vi.fn(controlModel) };
  return { view, controls, presenter: new KtcCodegenEditorSessionPresenter(view, controls) };
}

describe("Codegen editor session presenter", () => {
  it("建立 Editor Model 并同步标签状态，不持有第二份文档状态", () => {
    const model = session();
    const { presenter, view } = fixture();
    model.markTableDirty(1);
    presenter.show(model);
    expect(view.showEditor).toHaveBeenCalledWith(expect.objectContaining({
      uri: model.identity.uri,
      fileName: "Demo.json",
      dirty: true,
      controls: expect.objectContaining({ kind: "kt.codegen.control-view-model" }),
    }));
    expect(view.setDocumentState).toHaveBeenCalledWith(
      model.identity.uri, "Demo.json", true, false,
    );
  });

  it("统一发布文档状态、完整 Model 与 Problems 投影", () => {
    const model = session();
    const { presenter, view } = fixture();
    presenter.publishDocumentState(model);
    presenter.publishModel(model);
    expect(view.postEditor).toHaveBeenCalledWith(model.identity.uri, {
      type: "codegenDocumentState", dirty: false, externalConflict: false,
    });
    expect(view.postEditor).toHaveBeenCalledWith(model.identity.uri, expect.objectContaining({
      type: "codegenModel",
      model: expect.objectContaining({ uri: model.identity.uri }),
    }));
    expect(view.publishProblems).toHaveBeenCalledWith(
      model.identity.uri, model.identity.fsPath, [],
    );
  });

  it("控制符快照与普通 Editor 消息都只经注入端口输出", () => {
    const model = session();
    const { presenter, view, controls } = fixture();
    presenter.publishControls(model);
    presenter.post(model, { type: "codegenPreflightState", running: true });
    expect(controls.viewModel).toHaveBeenCalledWith(model);
    expect(view.postEditor).toHaveBeenNthCalledWith(1, model.identity.uri, expect.objectContaining({
      type: "codegenControlsModel",
    }));
    expect(view.postEditor).toHaveBeenNthCalledWith(2, model.identity.uri, {
      type: "codegenPreflightState", running: true,
    });
  });
});
