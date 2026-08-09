import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlViewModel } from "./controlViewModel.js";
import type { KtcCodegenDocumentModel } from "./documentModel.js";
import type {
  KtcCodegenEditorModel,
  KtcCodegenEditorOutboundMessage,
} from "./editorContracts.js";

export interface KtcCodegenEditorSessionViewPort {
  readonly showEditor: (model: KtcCodegenEditorModel) => void;
  readonly setDocumentState: (
    uri: string,
    fileName: string,
    dirty: boolean,
    externalConflict: boolean,
  ) => void;
  readonly postEditor: (uri: string, message: KtcCodegenEditorOutboundMessage) => void;
  readonly publishProblems: (
    uri: string,
    fsPath: string,
    diagnostics: readonly KtCodegenDiagnostic[],
  ) => void;
}

export interface KtcCodegenEditorSessionProjectionPort {
  readonly viewModel: (session: KtcCodegenDocumentModel) => KtcCodegenControlViewModel;
}

/** 文档 session → JSON View / Problems 的单向 Presenter；不拥有领域状态或 Host 文件权限。 */
export class KtcCodegenEditorSessionPresenter {
  constructor(
    private readonly view: KtcCodegenEditorSessionViewPort,
    private readonly controls: KtcCodegenEditorSessionProjectionPort,
  ) {}

  show(session: KtcCodegenDocumentModel): void {
    this.view.showEditor(this.editorModel(session));
    this.view.setDocumentState(
      session.identity.uri,
      session.identity.fileName,
      session.dirty,
      session.hasExternalConflict,
    );
  }

  publishDocumentState(session: KtcCodegenDocumentModel): void {
    this.view.setDocumentState(
      session.identity.uri,
      session.identity.fileName,
      session.dirty,
      session.hasExternalConflict,
    );
    this.post(session, {
      type: "codegenDocumentState",
      dirty: session.dirty,
      externalConflict: session.hasExternalConflict,
      externalState: session.externalState,
    });
  }

  publishModel(session: KtcCodegenDocumentModel): void {
    this.post(session, { type: "codegenModel", model: this.editorModel(session) });
    this.publishProblems(session);
  }

  publishControls(session: KtcCodegenDocumentModel): void {
    this.post(session, { type: "codegenControlsModel", model: this.controls.viewModel(session) });
    this.publishProblems(session);
  }

  post(session: KtcCodegenDocumentModel, message: KtcCodegenEditorOutboundMessage): void {
    this.view.postEditor(session.identity.uri, message);
  }

  private editorModel(session: KtcCodegenDocumentModel): KtcCodegenEditorModel {
    return {
      uri: session.identity.uri,
      fileName: session.identity.fileName,
      table: session.getTableData(),
      controls: this.controls.viewModel(session),
      dirty: session.dirty,
      externalConflict: session.hasExternalConflict,
      externalState: session.externalState,
    };
  }

  private publishProblems(session: KtcCodegenDocumentModel): void {
    this.view.publishProblems(
      session.identity.uri,
      session.identity.fsPath,
      session.preflightSnapshot?.result.plan.diagnostics ?? [],
    );
  }
}
