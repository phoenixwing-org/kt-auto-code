import type { KtCodegenTableData } from "@phoenix-wing/kt-codegen";
import type {
  KtcCodegenControlMessage,
  KtcCodegenEditorInboundMessage,
  KtcCodegenEditorModel,
} from "./editorContracts.js";

export type KtcCodegenEditorCommand =
  | { readonly kind: "ignore" }
  | { readonly kind: "control"; readonly message: KtcCodegenControlMessage }
  | { readonly kind: "dirty"; readonly itemCount: number }
  | { readonly kind: "exchange"; readonly action: "sync" | "save"; readonly model: KtcCodegenEditorModel }
  | { readonly kind: "ready" | "revert" | "cancelPreflight" }
  | { readonly kind: "preflight" | "apply"; readonly table?: KtCodegenTableData };

/** 把 Webview 传输消息收敛为文档会话命令；不读取 Host 或修改领域状态。 */
export function ktcRouteCodegenEditorMessage(
  sessionUri: string,
  message: KtcCodegenEditorInboundMessage,
): KtcCodegenEditorCommand {
  if (message.uri !== sessionUri) return { kind: "ignore" };
  if (message.type === "codegenEditorLayout") return { kind: "ignore" };
  if (message.type === "codegenControlOpen"
    || message.type === "codegenControlCopyEnd"
    || message.type === "codegenControlSelection"
    || message.type === "codegenControlDisplay"
    || message.type === "codegenControlOutput") {
    return { kind: "control", message };
  }
  if (message.type === "codegenEditorDirty") return { kind: "dirty", itemCount: message.itemCount };
  if (message.type === "codegenEditorExchange") {
    return { kind: "exchange", action: message.action, model: message.model };
  }
  if (message.action === "preflight" || message.action === "apply") {
    return { kind: message.action, table: message.table };
  }
  return { kind: message.action };
}
