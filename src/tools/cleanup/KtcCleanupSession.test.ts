import { describe, expect, it, vi } from "vitest";
import { KtcCleanupSession, type KtcCleanupPreviewResult, type KtcCleanupSessionToken } from "./KtcCleanupSession.js";

interface FrozenPlan {
  readonly root: string;
  readonly entries: readonly string[];
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function currentToken(session: KtcCleanupSession<FrozenPlan>): KtcCleanupSessionToken {
  return { sessionId: session.sessionId, revision: session.revision };
}

function createSession() {
  const changed = vi.fn();
  const messages: string[] = [];
  const session = new KtcCleanupSession<FrozenPlan>(changed, (message) => messages.push(message));
  session.open();
  return { session, changed, messages };
}

async function createReadyPreview(session: KtcCleanupSession<FrozenPlan>, fingerprint = "request:v1") {
  const value: FrozenPlan = { root: "/workspace/project", entries: ["build", "objects"] };
  expect(await session.analyze(currentToken(session), fingerprint, () => true, async () => ({
    value,
    items: ["build", "objects"],
    summary: "2 个待清理项",
  }))).toBe(true);
  expect(session.preview.state).toBe("ready");
  expect(session.preview.token).toBeTypeOf("string");
  return { value, previewToken: session.preview.token! };
}

describe("KtcCleanupSession", () => {
  it("冻结成功预览，并只把冻结值交给对应指纹的执行操作", async () => {
    const { session, changed, messages } = createSession();
    const { value, previewToken } = await createReadyPreview(session);
    const execute = vi.fn(async (accepted: FrozenPlan, shouldContinue: () => boolean) => {
      expect(accepted).toBe(value);
      expect(shouldContinue()).toBe(true);
      return ["删除 build", "删除 objects"];
    });

    expect(await session.execute(
      currentToken(session), previewToken, "request:v1", () => true, execute,
    )).toBe(true);

    expect(execute).toHaveBeenCalledOnce();
    expect(session.busy).toBe(false);
    expect(session.preview).toEqual({
      state: "complete",
      summary: "清理完成：2 条结果",
      items: ["删除 build", "删除 objects"],
    });
    expect(messages).toEqual(["预览完成：2 个待清理项", "清理完成：2 条结果"]);
    expect(changed).toHaveBeenCalledTimes(5);
  });

  it("拒绝旧 revision、旧 session、旧预览 token 和变化后的请求指纹", async () => {
    const { session, messages } = createSession();
    const firstSessionId = session.sessionId;
    const staleRequest = { sessionId: firstSessionId, revision: 0 };
    const operation = vi.fn(async (): Promise<KtcCleanupPreviewResult<FrozenPlan>> => ({
      value: { root: "/workspace/project", entries: [] }, items: [], summary: "空",
    }));

    expect(await session.analyze(staleRequest, "request:v1", () => true, operation)).toBe(false);
    expect(operation).not.toHaveBeenCalled();

    const first = await createReadyPreview(session);
    const firstPreviewToken = first.previewToken;
    await createReadyPreview(session, "request:v2");
    expect(await session.execute(
      currentToken(session), firstPreviewToken, "request:v1", () => true, async () => [],
    )).toBe(false);
    expect(session.preview).toMatchObject({
      state: "idle",
      message: "清理预览已过期或目标已变化，请重新预览后确认。",
    });

    const current = await createReadyPreview(session, "request:v3");
    expect(await session.execute(
      currentToken(session), current.previewToken, "request:changed", () => true, async () => [],
    )).toBe(false);
    expect(messages.filter((message) => message.includes("预览已过期"))).toHaveLength(2);

    const oldSessionToken = currentToken(session);
    session.open();
    expect(session.sessionId).not.toBe(firstSessionId);
    expect(await session.analyze(oldSessionToken, "request:v4", () => true, operation)).toBe(false);
    expect(operation).not.toHaveBeenCalled();
  });

  it("取消预览后，即使延迟 provider 完成也不会复活 ready 状态", async () => {
    const { session, messages } = createSession();
    const gate = deferred<KtcCleanupPreviewResult<FrozenPlan>>();
    const analyzing = session.analyze(currentToken(session), "request:v1", () => true, async () => gate.promise);

    expect(session.busy).toBe(true);
    expect(session.preview.state).toBe("loading");
    expect(session.cancel(currentToken(session))).toBe(true);
    expect(session.busy).toBe(true);
    expect(session.preview.state).toBe("idle");

    gate.resolve({
      value: { root: "/workspace/project", entries: ["late"] },
      items: ["late"],
      summary: "延迟预览",
    });
    expect(await analyzing).toBe(true);

    expect(session.busy).toBe(false);
    expect(session.preview.state).toBe("idle");
    expect(session.preview.token).toBeUndefined();
    expect(session.preview.message).toContain("清理已停止");
    expect(messages).not.toContain("预览完成：延迟预览");
  });

  it("执行取消后继续占用 mutex，直到 provider 真正结束", async () => {
    const { session } = createSession();
    const { previewToken } = await createReadyPreview(session);
    const gate = deferred<readonly string[]>();
    const executing = session.execute(
      currentToken(session), previewToken, "request:v1", () => true, async () => gate.promise,
    );

    expect(session.preview.state).toBe("executing");
    expect(session.cancel(currentToken(session))).toBe(true);
    expect(session.busy).toBe(true);
    expect(() => session.open()).toThrow("清理尚未停止");
    const analyze = vi.fn(async () => ({
      value: { root: "/workspace/project", entries: [] }, items: [], summary: "不应执行",
    }));
    expect(await session.analyze(currentToken(session), "request:v2", () => true, analyze)).toBe(false);
    expect(analyze).not.toHaveBeenCalled();

    gate.resolve(["provider 已收尾"]);
    expect(await executing).toBe(true);
    expect(session.busy).toBe(false);
    expect(session.preview.state).toBe("idle");
    expect(session.preview.message).toContain("清理已停止");
  });

  it("拒绝旧 analyze revision 取消新 execute，同时接受 execute 发起 revision 的快速取消", async () => {
    const { session } = createSession();
    const analyzeRequest = currentToken(session);
    const { previewToken } = await createReadyPreview(session);
    const executeRequest = currentToken(session);
    const gate = deferred<readonly string[]>();
    const executing = session.execute(
      executeRequest, previewToken, "request:v1", () => true, async () => gate.promise,
    );

    expect(session.revision).toBeGreaterThan(executeRequest.revision);
    expect(session.cancel(analyzeRequest)).toBe(false);
    expect(session.busy).toBe(true);
    // executing 投影可能尚未到达 UI；发起 execute 的 revision 仍必须拥有取消能力。
    expect(session.cancel(executeRequest)).toBe(true);

    gate.resolve([]);
    await executing;
    expect(session.preview.state).toBe("idle");
  });

  it("信任初始失效或目录 guard 在 provider 中途变化时均 fail closed", async () => {
    const { session, messages } = createSession();
    const previewOperation = vi.fn(async () => ({
      value: { root: "/workspace/project", entries: ["build"] }, items: ["build"], summary: "1 项",
    }));

    expect(await session.analyze(currentToken(session), "request:v1", () => false, previewOperation)).toBe(true);
    expect(previewOperation).not.toHaveBeenCalled();
    expect(session.preview.state).toBe("idle");
    expect(session.preview.token).toBeUndefined();

    session.open();
    const { previewToken } = await createReadyPreview(session);
    let directoryStillValid = true;
    expect(await session.execute(
      currentToken(session),
      previewToken,
      "request:v1",
      () => directoryStillValid,
      async (_value, shouldContinue) => {
        expect(shouldContinue()).toBe(true);
        directoryStillValid = false;
        return ["provider 声称已完成"];
      },
    )).toBe(true);
    expect(session.preview.state).toBe("idle");
    expect(session.preview.summary).toBeUndefined();
    expect(session.preview.message).toContain("信任、工作目录、运行状态已变化");
    expect(messages.filter((message) => message.includes("请重新预览"))).toHaveLength(2);
  });

  it("provider 阶段错误进入 error 状态并原样保留到日志", async () => {
    const { session, messages } = createSession();

    expect(await session.analyze(
      currentToken(session),
      "request:v1",
      () => true,
      async () => { throw new Error("Git 预检阶段失败：exit 128"); },
    )).toBe(true);

    expect(session.preview).toEqual({
      state: "error",
      message: "Git 预检阶段失败：exit 128",
      items: [],
    });
    expect(messages).toContain("Git 预检阶段失败：exit 128");
  });

  it("取消后 provider 抛出的阶段错误仍写入日志，且不能覆盖取消状态", async () => {
    const { session, messages } = createSession();
    const { previewToken } = await createReadyPreview(session);
    const gate = deferred<never>();
    const executing = session.execute(
      currentToken(session), previewToken, "request:v1", () => true, async () => gate.promise,
    );

    expect(session.cancel(currentToken(session))).toBe(true);
    gate.reject(new Error("删除阶段失败：EPERM"));
    await executing;

    expect(messages).toContain("删除阶段失败：EPERM");
    expect(session.preview.state).toBe("idle");
    expect(session.preview.message).toContain("删除阶段失败：EPERM");
  });
});
