import { describe, expect, it, vi } from "vitest";
import { KtcCodegenFileEventQueue } from "./fileEventQueue.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("KtcCodegenFileEventQueue", () => {
  it("同一 JSON 串行执行并在任务结束后清理", async () => {
    const queue = new KtcCodegenFileEventQueue();
    const gate = deferred();
    const calls: string[] = [];
    const first = queue.enqueue("one.json", async () => {
      calls.push("first:start");
      await gate.promise;
      calls.push("first:end");
    });
    const second = queue.enqueue("one.json", async () => { calls.push("second"); });

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["first:start"]);
    expect(queue.pendingResourceCount).toBe(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first:start", "first:end", "second"]);
    await Promise.resolve();
    expect(queue.pendingResourceCount).toBe(0);
  });

  it("一个文件失败不阻塞后续事件，其他文件可并行", async () => {
    const queue = new KtcCodegenFileEventQueue();
    const afterFailure = vi.fn();
    const other = vi.fn();
    const failed = queue.enqueue("one.json", () => Promise.reject(new Error("read failed")));
    const recovered = queue.enqueue("one.json", async () => { afterFailure(); });
    const parallel = queue.enqueue("two.json", async () => { other(); });

    await expect(failed).rejects.toThrow("read failed");
    await Promise.all([recovered, parallel]);
    expect(afterFailure).toHaveBeenCalledOnce();
    expect(other).toHaveBeenCalledOnce();
  });
});
