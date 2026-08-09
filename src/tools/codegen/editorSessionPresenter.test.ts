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
    kind: "kt.codegen.control-ui-model",
    schemaVersion: 1,
    documentId: model.identity.uri,
    uri: model.identity.uri,
    fileName: model.identity.fileName,
    blocks: [],
    unclosed: [],
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
      controls: expect.objectContaining({ kind: "kt.codegen.control-ui-model" }),
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
      type: "codegenDocumentState", dirty: false, externalConflict: false, externalState: "current",
    });
    expect(view.postEditor).toHaveBeenCalledWith(model.identity.uri, expect.objectContaining({
      type: "codegenModel",
      model: expect.objectContaining({ uri: model.identity.uri }),
    }));
    expect(view.publishProblems).toHaveBeenCalledWith(
      model.identity.uri, model.identity.fsPath, [],
    );
  });

  it("Apply 后向 JSON View 和 Problems 发布只读最近结果，不恢复可执行计划", () => {
    const model = session();
    model.setPreflight({
      plan: {
        markerRegions: [{ id: "region-1" }],
        artifacts: [{ id: "artifact-1" }],
        diagnostics: [{ code: "marker.missing-end", severity: "error", message: "未闭合" }],
      } as unknown as NonNullable<typeof model.preflight>["plan"],
      reused: false,
      createdAt: "2026-07-19T00:00:00.000Z",
      markerIndexRevision: 1,
      indexedFileCount: 1,
      candidateFileCount: 1,
      cachePath: "/workspace/.phoenix/cache/codegen/test.json",
    });
    model.markPreflightApplied();
    const { presenter, view, controls } = fixture();
    controls.viewModel.mockImplementation((sessionModel) => ({
      ...controlModel(sessionModel),
      preflightAvailable: true,
      preflight: {
        plan: sessionModel.preflightSnapshot!.result.plan,
        reused: false,
        createdAt: "2026-07-19T00:00:00.000Z",
        state: "applied",
        message: "已应用；再次 Apply 前需重新预检",
      },
    }));

    presenter.publishControls(model);

    expect(model.preflight).toBeUndefined();
    expect(view.postEditor).toHaveBeenCalledWith(model.identity.uri, expect.objectContaining({
      type: "codegenControlsModel",
      model: expect.objectContaining({ preflight: expect.objectContaining({ state: "applied" }) }),
    }));
    expect(view.publishProblems).toHaveBeenCalledWith(
      model.identity.uri,
      model.identity.fsPath,
      [expect.objectContaining({ code: "marker.missing-end" })],
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
