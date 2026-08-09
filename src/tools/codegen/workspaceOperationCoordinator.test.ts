import { describe, expect, it, vi } from "vitest";
import { KtcCodegenWorkspaceOperationCoordinator } from "./workspaceOperationCoordinator.js";

class Cancellation {
  readonly cancel = vi.fn(() => { this.cancelled = true; });
  readonly dispose = vi.fn();
  cancelled = false;
  readonly token: { readonly isCancellationRequested: boolean };

  constructor() {
    const owner = this;
    this.token = {
      get isCancellationRequested() { return owner.cancelled; },
    };
  }
}

describe("Codegen workspace operation coordinator", () => {
  it("合并 watcher 请求并保持 discovery/candidates 的到达顺序", () => {
    const coordinator = new KtcCodegenWorkspaceOperationCoordinator<Cancellation>();
    const running = coordinator.begin("candidates", new Cancellation());

    expect(coordinator.request("discovery")).toBe(false);
    expect(coordinator.request("candidates")).toBe(false);
    expect(coordinator.request("discovery")).toBe(false);
    expect(coordinator.pendingKinds).toEqual(["discovery", "candidates"]);
    expect(running.cancel).not.toHaveBeenCalled();

    expect(coordinator.finish(running)).toBe(true);
    expect(coordinator.takeNext()).toBe("discovery");
    expect(coordinator.takeNext()).toBe("candidates");
    expect(coordinator.takeNext()).toBeUndefined();
  });

  it("显式操作替换当前操作，旧操作不能完成新操作", () => {
    const coordinator = new KtcCodegenWorkspaceOperationCoordinator<Cancellation>();
    const old = coordinator.begin("discovery", new Cancellation());
    coordinator.request("candidates");
    const current = coordinator.begin("candidates", new Cancellation());

    expect(old.cancel).toHaveBeenCalledOnce();
    expect(coordinator.kind).toBe("candidates");
    expect(coordinator.pendingKinds).toEqual([]);
    expect(coordinator.finish(old)).toBe(false);
    expect(coordinator.finish(current)).toBe(true);
  });

  it("reset 取消运行项、清空队列，并可在销毁时释放资源", () => {
    const coordinator = new KtcCodegenWorkspaceOperationCoordinator<Cancellation>();
    const running = coordinator.begin("discovery", new Cancellation());
    coordinator.request("candidates");

    coordinator.reset(true);

    expect(running.cancel).toHaveBeenCalledOnce();
    expect(running.dispose).toHaveBeenCalledOnce();
    expect(coordinator.kind).toBeUndefined();
    expect(coordinator.pendingKinds).toEqual([]);
  });
});
