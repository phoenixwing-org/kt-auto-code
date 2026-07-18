import type {
  KtCodegenBlockKey,
  KtCodegenTableData,
} from "@phoenix-wing/kt-codegen";
import type { KtcCodegenMetaField } from "./contracts.js";
import type {
  KtcCodegenControlViewModel,
} from "./controlViewModel.js";
import type { KtcCodegenEditorLayoutState } from "./editorLayoutState.js";

export interface KtcCodegenEditorModel {
  readonly uri: string;
  readonly fileName: string;
  readonly table: KtCodegenTableData;
  readonly controls: KtcCodegenControlViewModel;
  readonly dirty: boolean;
  readonly externalConflict: boolean;
}

export type KtcCodegenSidebarActionMessage = {
  readonly type: "codegenAction";
  readonly toolId: "codegen";
  readonly action: "refresh" | "openJson" | "importCsv" | "openDocument" | "updateMeta"
    | "scanCandidates" | "openCandidate" | "cancelOperation" | "copyDiagnostics";
  readonly uri?: string;
  readonly field?: KtcCodegenMetaField;
  readonly value?: string;
};

export type KtcCodegenControlMessage =
  | {
      readonly type: "codegenControlSelection";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly blockKeys: readonly KtCodegenBlockKey[];
      readonly singleMode: boolean;
    }
  | {
      readonly type: "codegenControlDisplay";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly showMissingTemplates: boolean;
    }
  | {
      readonly type: "codegenControlOutput";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly scope: "all";
    }
  | {
      readonly type: "codegenControlOutput";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly scope: "visible";
      readonly blockKeys: readonly KtCodegenBlockKey[];
    }
  | {
      readonly type: "codegenControlOutput";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly scope: "block";
      readonly blockKey?: KtCodegenBlockKey;
    }
  | {
      readonly type: "codegenControlOpen";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly path: string;
      readonly line: number;
    };

export type KtcCodegenEditorInboundMessage =
  | {
      readonly type: "codegenEditorLayout";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly layout: KtcCodegenEditorLayoutState;
    }
  | {
      readonly type: "codegenEditorAction";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly action: "ready" | "revert" | "preflight" | "cancelPreflight" | "apply";
      readonly table?: KtCodegenTableData;
    }
  | {
      readonly type: "codegenEditorDirty";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly itemCount: number;
    }
  | {
      readonly type: "codegenEditorExchange";
      readonly toolId: "codegen";
      readonly uri: string;
      readonly action: "sync" | "save";
      readonly model: KtcCodegenEditorModel;
    }
  | KtcCodegenControlMessage;

export type KtcCodegenInboundMessage = KtcCodegenSidebarActionMessage | KtcCodegenEditorInboundMessage;

/** Extension Host → Codegen 右侧编辑 Webview。 */
export type KtcCodegenEditorOutboundMessage =
  | { readonly type: "codegenModel"; readonly model: KtcCodegenEditorModel }
  | { readonly type: "codegenControlsModel"; readonly model: KtcCodegenControlViewModel }
  | { readonly type: "codegenDocumentState"; readonly dirty: boolean; readonly externalConflict: boolean }
  | { readonly type: "codegenPreflightState"; readonly running: boolean }
  | {
      readonly type: "codegenStatus";
      readonly status: "idle" | "saving" | "saved" | "error";
      readonly message: string;
      readonly documentRevision?: number;
    };
