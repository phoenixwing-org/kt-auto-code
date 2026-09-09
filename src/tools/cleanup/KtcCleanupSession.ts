import { randomUUID } from "node:crypto";
import type { KtcCleanupDialogModel } from "../../core/cleanupContracts.js";

export interface KtcCleanupSessionToken {
  readonly sessionId: string;
  readonly revision: number;
}

export interface KtcCleanupPreviewResult<T> {
  readonly value: T;
  readonly items: readonly string[];
  readonly summary: string;
}

/** Host-side capability token and cooperative cancellation, independent of any tool or Webview. */
export class KtcCleanupSession<T> {
  sessionId = "";
  revision = 0;
  openRequestId = 0;
  busy = false;
  preview: KtcCleanupDialogModel["preview"] = { state: "idle", items: [] };
  private epoch = 0;
  private operationRevision = 0;
  private frozen?: { readonly token: string; readonly fingerprint: string; readonly value: T };

  constructor(private readonly changed: () => void, private readonly log: (message: string) => void) {}

  open(showDialog = true): void {
    if (this.busy) throw new Error("清理尚未停止，请等待当前操作结束后再打开。");
    this.sessionId = randomUUID();
    this.revision = 0;
    // Quick cleanup keeps all Host guards without granting a UI open request.
    this.openRequestId = showDialog ? this.openRequestId + 1 : 0;
    this.operationRevision = 0;
    this.epoch++;
    this.frozen = undefined;
    this.preview = { state: "idle", items: [] };
    this.publish();
  }

  accepts(token: KtcCleanupSessionToken, cancel = false): boolean {
    return !!this.sessionId && token.sessionId === this.sessionId
      && Number.isSafeInteger(token.revision) && token.revision >= 0
      && (cancel
        ? token.revision >= this.operationRevision && token.revision <= this.revision
        : token.revision === this.revision);
  }

  invalidate(message: string): void {
    this.epoch++;
    this.frozen = undefined;
    this.preview = { state: "idle", message, items: [] };
    if (this.sessionId) {
      this.log(message);
      this.publish();
    }
    // Keep the mutex until the in-flight provider unwinds; Cancel is not rollback.
  }

  cancel(token: KtcCleanupSessionToken): boolean {
    if (!this.accepts(token, true)) return false;
    this.invalidate("已取消清理；不再启动后续步骤，已执行的删除不会自动恢复。");
    return true;
  }

  async analyze(
    token: KtcCleanupSessionToken,
    fingerprint: string,
    canContinue: () => boolean,
    operation: (shouldContinue: () => boolean) => Promise<KtcCleanupPreviewResult<T>>,
  ): Promise<boolean> {
    if (!this.accepts(token) || this.busy) return false;
    return this.run(token, "loading", canContinue, async (shouldContinue) => {
      const result = await operation(shouldContinue);
      this.assertContinue(shouldContinue);
      const previewToken = randomUUID();
      this.frozen = { token: previewToken, fingerprint, value: result.value };
      this.preview = { state: "ready", token: previewToken, summary: result.summary, items: result.items };
      this.log(`预览完成：${result.summary}`);
    });
  }

  async execute(
    token: KtcCleanupSessionToken,
    previewToken: string,
    fingerprint: string,
    canContinue: () => boolean,
    operation: (value: T, shouldContinue: () => boolean) => Promise<readonly string[]>,
  ): Promise<boolean> {
    if (!this.accepts(token) || this.busy) return false;
    const accepted = this.frozen;
    if (!accepted || accepted.token !== previewToken || accepted.fingerprint !== fingerprint) {
      this.invalidate("清理预览已过期或目标已变化，请重新预览后确认。");
      return false;
    }
    return this.run(token, "executing", canContinue, async (shouldContinue) => {
      const items = await operation(accepted.value, shouldContinue);
      this.assertContinue(shouldContinue);
      this.preview = { state: "complete", summary: `清理完成：${items.length} 条结果`, items };
      this.log(this.preview.summary!);
    });
  }

  private async run(
    token: KtcCleanupSessionToken,
    state: "loading" | "executing",
    canContinue: () => boolean,
    operation: (shouldContinue: () => boolean) => Promise<void>,
  ): Promise<boolean> {
    this.busy = true;
    this.frozen = undefined;
    this.operationRevision = token.revision;
    const epoch = ++this.epoch;
    const shouldContinue = () => this.epoch === epoch && canContinue();
    this.preview = { state, message: state === "loading" ? "正在预览…" : "正在清理…", items: this.preview.items };
    this.publish();
    try {
      this.assertContinue(shouldContinue);
      await operation(shouldContinue);
    } catch (error) {
      this.frozen = undefined;
      const message = error instanceof Error ? error.message : String(error);
      this.log(message);
      this.preview = {
        state: shouldContinue() ? "error" : "idle",
        message: shouldContinue() ? message : `清理已停止；已完成的删除不回滚。${message}`,
        items: [],
      };
    } finally {
      this.busy = false;
      this.publish();
    }
    return true;
  }

  private assertContinue(shouldContinue: () => boolean): void {
    if (!shouldContinue()) throw new Error("清理已取消，或信任、工作目录、运行状态已变化；请重新预览。");
  }

  private publish(): void { this.revision++; this.changed(); }
}
