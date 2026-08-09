export type KtcCodegenWorkspaceOperationKind = "discovery" | "candidates";

/** CancellationTokenSource 的最小宿主无关端口，便于纯单测运行协调。 */
export interface KtcCodegenWorkspaceCancellation {
  readonly token: { readonly isCancellationRequested: boolean };
  cancel(): void;
  dispose(): void;
}

/**
 * 串行协调工作区级扫描。
 *
 * 用户显式开始的操作可以替换当前操作；watcher 触发使用 request() 合并排队，
 * 避免 JSON/CSV 与源码文件事件互相取消 discovery/candidates 扫描。
 */
export class KtcCodegenWorkspaceOperationCoordinator<
  TCancellation extends KtcCodegenWorkspaceCancellation,
> {
  private active: {
    readonly kind: KtcCodegenWorkspaceOperationKind;
    readonly cancellation: TCancellation;
  } | undefined;
  private readonly queued = new Set<KtcCodegenWorkspaceOperationKind>();

  get kind(): KtcCodegenWorkspaceOperationKind | undefined {
    return this.active?.kind;
  }

  get cancellation(): TCancellation | undefined {
    return this.active?.cancellation;
  }

  get pendingKinds(): readonly KtcCodegenWorkspaceOperationKind[] {
    return [...this.queued];
  }

  /** 显式开始操作；替换当前操作，并消费同类排队请求。 */
  begin(kind: KtcCodegenWorkspaceOperationKind, cancellation: TCancellation): TCancellation {
    this.active?.cancellation.cancel();
    this.queued.delete(kind);
    this.active = { kind, cancellation };
    return cancellation;
  }

  /** watcher 请求；空闲时返回 true 让调用方立刻开始，否则合并到队列。 */
  request(kind: KtcCodegenWorkspaceOperationKind): boolean {
    if (!this.active) return true;
    this.queued.add(kind);
    return false;
  }

  /** 只有当前操作拥有者可以完成并释放运行槽。 */
  finish(cancellation: TCancellation): boolean {
    if (this.active?.cancellation !== cancellation) return false;
    this.active = undefined;
    return true;
  }

  isCurrent(cancellation: TCancellation): boolean {
    return this.active?.cancellation === cancellation;
  }

  cancelCurrent(): void {
    this.active?.cancellation.cancel();
  }

  /** 取出最早合并的 watcher 请求；Set 同时保证同类请求只排一次。 */
  takeNext(): KtcCodegenWorkspaceOperationKind | undefined {
    const next = this.queued.values().next().value as KtcCodegenWorkspaceOperationKind | undefined;
    if (next) this.queued.delete(next);
    return next;
  }

  /** 工作区切换或销毁时清空状态；异步 finally 仍可安全重复 dispose。 */
  reset(disposeActive = false): void {
    const cancellation = this.active?.cancellation;
    this.active = undefined;
    this.queued.clear();
    cancellation?.cancel();
    if (disposeActive) cancellation?.dispose();
  }
}
