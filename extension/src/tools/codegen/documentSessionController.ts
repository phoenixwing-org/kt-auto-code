import { KtCodegenController } from "@phoenix-wing/kt-codegen";
import {
  KtcCodegenDocumentModel,
  type KtcCodegenDocumentIdentity,
} from "./documentModel.js";
import {
  type KtcCodegenTextSnapshot,
} from "./contracts.js";
import { ktcCodegenDiagnosticsText } from "./diagnosticText.js";

export interface KtcCodegenDocumentSnapshotPort {
  readonly readSnapshot: (
    identity: KtcCodegenDocumentIdentity,
  ) => Promise<KtcCodegenTextSnapshot>;
  readonly isFileNotFoundError?: (error: unknown) => boolean;
}

export interface KtcCodegenDocumentOpenRequest {
  readonly identity: KtcCodegenDocumentIdentity;
  readonly preparedController?: KtCodegenController;
  readonly diagnosticCount?: number;
}

export type KtcCodegenDocumentOpenResult =
  | { readonly kind: "existing" | "opened"; readonly session: KtcCodegenDocumentModel }
  | { readonly kind: "error"; readonly message: string };

export type KtcCodegenDocumentReconcileResult =
  | { readonly kind: "current"; readonly conflictCleared: boolean }
  | { readonly kind: "reloaded" }
  | { readonly kind: "conflict" }
  | { readonly kind: "deleted" }
  | { readonly kind: "invalid" | "error"; readonly message: string };

/**
 * 单一 Extension Host 生命周期内的 Codegen 文档会话 Controller。
 *
 * 它拥有 session registry 与活动 URI，并把“读取快照 → Wing 解析 → 建立
 * Document Model”收敛为一个状态机；Host URI、编辑器视图、Problems 与日志
 * 仍由外层 Host adapter 负责。
 */
export class KtcCodegenDocumentSessionController {
  private readonly registry = new Map<string, KtcCodegenDocumentModel>();
  private currentActiveUri: string | undefined;

  constructor(private readonly snapshots: KtcCodegenDocumentSnapshotPort) {}

  get sessions(): ReadonlyMap<string, KtcCodegenDocumentModel> {
    return this.registry;
  }

  get activeUri(): string | undefined {
    return this.currentActiveUri;
  }

  get(uri: string): KtcCodegenDocumentModel | undefined {
    return this.registry.get(uri);
  }

  values(): IterableIterator<KtcCodegenDocumentModel> {
    return this.registry.values();
  }

  async open(request: KtcCodegenDocumentOpenRequest): Promise<KtcCodegenDocumentOpenResult> {
    const current = this.registry.get(request.identity.uri);
    if (current) return { kind: "existing", session: current };

    try {
      const controller = request.preparedController ?? new KtCodegenController();
      const snapshot = await this.snapshots.readSnapshot(request.identity);
      let diagnosticCount = request.diagnosticCount ?? 0;
      if (!request.preparedController) {
        const result = controller.readJson(snapshot.text);
        if (!result.ok || !result.value) {
          throw new Error(
            ktcCodegenDiagnosticsText(result.diagnostics) || "不是可用的 Codegen v4 JSON",
          );
        }
        diagnosticCount = result.diagnostics.length;
      }
      const session = new KtcCodegenDocumentModel(
        request.identity,
        controller,
        diagnosticCount,
        snapshot.fingerprint,
      );
      this.registry.set(request.identity.uri, session);
      return { kind: "opened", session };
    } catch (error) {
      return {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 把现有 session 与磁盘 checkpoint 对齐。watcher、显式重开和手动重新加载
   * 必须共用该状态机；读取的调度与 UI 投影仍由 Host 负责。
   */
  async reconcile(
    session: KtcCodegenDocumentModel,
    options: { readonly discardDirty?: boolean } = {},
  ): Promise<KtcCodegenDocumentReconcileResult> {
    if (this.registry.get(session.identity.uri) !== session) {
      return { kind: "error", message: "Codegen 文档会话已经释放" };
    }
    let snapshot: KtcCodegenTextSnapshot;
    try {
      snapshot = await this.snapshots.readSnapshot(session.identity);
    } catch (error) {
      if (this.snapshots.isFileNotFoundError?.(error)) {
        session.markExternalDeleted();
        return { kind: "deleted" };
      }
      session.markExternalChanged();
      return {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }

    const sameFingerprint = snapshot.fingerprint === session.diskFingerprint;
    if (sameFingerprint && !(options.discardDirty && session.dirty)) {
      const conflictCleared = session.hasExternalConflict;
      session.observeExternalFingerprint(snapshot.fingerprint);
      return { kind: "current", conflictCleared };
    }
    if (session.dirty && !options.discardDirty) {
      session.observeExternalFingerprint(snapshot.fingerprint);
      return { kind: "conflict" };
    }

    session.observeExternalFingerprint(snapshot.fingerprint);
    const result = session.reloadFromJson(snapshot.text, snapshot.fingerprint);
    if (!result.ok || !result.value) {
      return {
        kind: "invalid",
        message: ktcCodegenDiagnosticsText(result.diagnostics) || "磁盘 JSON 无法读取",
      };
    }
    return { kind: "reloaded" };
  }

  activate(session: KtcCodegenDocumentModel): boolean {
    if (this.registry.get(session.identity.uri) !== session) return false;
    this.currentActiveUri = session.identity.uri;
    return true;
  }

  deactivate(uri: string): boolean {
    if (this.currentActiveUri !== uri) return false;
    this.currentActiveUri = undefined;
    return true;
  }

  /** 释放不再由 View/用户持有的后台 session。调用方负责先检查 dirty/conflict。 */
  release(uri: string): boolean {
    if (this.currentActiveUri === uri) this.currentActiveUri = undefined;
    return this.registry.delete(uri);
  }

  clear(): void {
    this.registry.clear();
    this.currentActiveUri = undefined;
  }
}
