import type { KtCodegenTableData } from "@phoenix-wing/kt-codegen";
import type {
  KtcCodegenControlMessage,
  KtcCodegenEditorOutboundMessage,
} from "./editorContracts.js";
import type { KtcCodegenDocumentModel } from "./documentModel.js";
import type { KtcCodegenEditorCommand } from "./editorMessageRouter.js";
import type { KtcCodegenOperationTimer } from "./operationTimer.js";

type KtcCodegenEditorStatusMessage = Extract<
  KtcCodegenEditorOutboundMessage,
  { readonly type: "codegenStatus" }
>;

/**
 * Editor 语义命令的 Host 端口。
 *
 * Controller 只决定会话状态与动作顺序；VS Code、文件系统、Presenter、
 * Preflight/Apply 实现和 Output Channel 均由调用方适配。
 */
export interface KtcCodegenEditorCommandActions {
  startTimer(): KtcCodegenOperationTimer;
  handleControl(message: KtcCodegenControlMessage): Promise<void>;
  didMutate(message?: string): void;
  postStatus(message: KtcCodegenEditorStatusMessage): void;
  publishModel(): void;
  publish(message: string): void;
  log(line: string): void;
  save(): Promise<void>;
  revert(): Promise<void>;
  cancelPreflight(uri: string): void;
  runPreflight(timer?: KtcCodegenOperationTimer): Promise<void>;
  apply(timer: KtcCodegenOperationTimer): Promise<void>;
}

function acceptActionTable(
  session: KtcCodegenDocumentModel,
  table: KtCodegenTableData,
  actions: KtcCodegenEditorCommandActions,
): boolean {
  const acceptance = session.acceptTable(table);
  if (acceptance === "stale") {
    actions.postStatus({
      type: "codegenStatus",
      status: "error",
      message: "表格 revision 已过期，请先还原或重新打开。",
    });
    return false;
  }
  if (acceptance === "accepted") {
    actions.didMutate(`已接收 ${session.identity.fileName} 的最新整表草稿。`);
  }
  return true;
}

/** 执行 Router 已收敛的单份 Editor session 语义命令。 */
export async function ktcExecuteCodegenEditorCommand(
  session: KtcCodegenDocumentModel,
  command: KtcCodegenEditorCommand,
  actions: KtcCodegenEditorCommandActions,
): Promise<void> {
  if (command.kind === "ignore") return;
  if (command.kind === "control") {
    await actions.handleControl(command.message);
    return;
  }
  if (command.kind === "dirty") {
    session.markTableDirty(command.itemCount);
    actions.didMutate(`正在编辑 ${session.identity.fileName}；尚未写盘。`);
    return;
  }
  if (command.kind === "exchange") {
    const acceptance = session.acceptTable(command.model.table);
    if (acceptance === "stale") {
      actions.postStatus({
        type: "codegenStatus",
        status: "error",
        message: "文档已在其他界面更新，请先还原或重新打开后再保存。",
      });
      return;
    }
    if (acceptance === "accepted") actions.didMutate();
    if (command.action === "save") await actions.save();
    else actions.publish(`已接收 ${session.identity.fileName} 的整表草稿。`);
    return;
  }
  if (command.kind === "ready") {
    actions.publishModel();
    return;
  }
  if (command.kind === "revert") {
    await actions.revert();
    return;
  }
  if (command.kind === "cancelPreflight") {
    actions.cancelPreflight(session.identity.uri);
    return;
  }
  if (command.kind === "preflight") {
    const timer = actions.startTimer();
    if (command.table && !acceptActionTable(session, command.table, actions)) return;
    await actions.runPreflight(timer);
    return;
  }
  if (command.kind !== "apply") return;

  const timer = actions.startTimer();
  if (command.table && !acceptActionTable(session, command.table, actions)) return;
  // 不传 Apply timer：Host 的 runPreflight 默认参数会建立独立的预检计时器，
  // 而本 timer 继续覆盖从用户点击到 Apply 完成的总耗时。
  if (!session.preflight) await actions.runPreflight();
  if (!session.preflight) {
    actions.log(
      `[Codegen][Apply] 自动预检未产生可用计划，Apply 已停止；耗时 ${timer.elapsedText()}。`,
    );
    return;
  }
  await actions.apply(timer);
}
