import { describe, expect, it, vi } from "vitest";
import { KtCodegenController } from "@phoenix-wing/kt-codegen";
import {
  KtcCodegenDocumentSessionController,
  type KtcCodegenDocumentOpenRequest,
} from "./documentSessionController.js";

const IDENTITY = {
  uri: "file:///workspace/PNXDemoParam.json",
  fsPath: "/workspace/PNXDemoParam.json",
  fileName: "PNXDemoParam.json",
};

const JSON_TEXT = JSON.stringify({
  type: "100106",
  version: "4.0",
  NamePrefix: "PNX",
  NameMiddle: "Demo",
  NameSpace: "Kt",
  AppendFunction: "push_back",
  headers: [
    "NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue",
    "CATAttrInOut", "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit",
    "Author", "CreateDate", "Notes",
  ],
  data: [["Base", 1, "First", "First", "int", "Integer", 0, "In", 0, 0, "", 0, 0, "", "", "", ""]],
});

function request(overrides: Partial<KtcCodegenDocumentOpenRequest> = {}): KtcCodegenDocumentOpenRequest {
  return { identity: IDENTITY, ...overrides };
}

function fixture(text = JSON_TEXT) {
  const readSnapshot = vi.fn(async () => ({ text, fingerprint: "sha256:open" }));
  return {
    readSnapshot,
    sessions: new KtcCodegenDocumentSessionController({ readSnapshot }),
  };
}

describe("Codegen document session controller", () => {
  it("首次打开只读一次快照，经 Wing 解析后建立唯一 Document Model", async () => {
    const { sessions, readSnapshot } = fixture();
    const result = await sessions.open(request());

    expect(result.kind).toBe("opened");
    if (result.kind !== "opened") throw new Error("expected opened session");
    expect(readSnapshot).toHaveBeenCalledOnce();
    expect(readSnapshot).toHaveBeenCalledWith(IDENTITY);
    expect(result.session.identity).toEqual(IDENTITY);
    expect(result.session.controller.param.namePrefix).toBe("PNX");
    expect(result.session.controller.param.nameMiddle).toBe("Demo");
    expect(result.session.controller.param.items).toHaveLength(1);
    expect(result.session.diskFingerprint).toBe("sha256:open");
    expect(sessions.get(IDENTITY.uri)).toBe(result.session);
  });

  it("重复打开返回同一 session，不复读磁盘也不建立第二份 Param", async () => {
    const { sessions, readSnapshot } = fixture();
    const first = await sessions.open(request());
    const second = await sessions.open(request());

    expect(first.kind).toBe("opened");
    expect(second.kind).toBe("existing");
    if (first.kind === "error" || second.kind === "error") throw new Error("unexpected open error");
    expect(second.session).toBe(first.session);
    expect(readSnapshot).toHaveBeenCalledOnce();
    expect([...sessions.values()]).toHaveLength(1);
  });

  it("CSV 已准备的 Wing Controller 不再解析快照，但仍记录真实磁盘指纹", async () => {
    const prepared = new KtCodegenController();
    expect(prepared.readJson(JSON_TEXT).ok).toBe(true);
    const readJson = vi.spyOn(prepared, "readJson");
    const { sessions } = fixture("该文本故意不是 JSON");

    const result = await sessions.open(request({ preparedController: prepared, diagnosticCount: 3 }));

    expect(result.kind).toBe("opened");
    if (result.kind !== "opened") throw new Error("expected opened session");
    expect(readJson).not.toHaveBeenCalled();
    expect(result.session.controller).toBe(prepared);
    expect(result.session.diagnosticCount).toBe(3);
    expect(result.session.diskFingerprint).toBe("sha256:open");
  });

  it("读取或解析失败返回稳定错误，不能留下半初始化 session", async () => {
    const readFailure = vi.fn(async () => {
      throw new Error("磁盘不可读");
    });
    const failedRead = new KtcCodegenDocumentSessionController({ readSnapshot: readFailure });
    const readResult = await failedRead.open(request());
    expect(readResult).toEqual({ kind: "error", message: "磁盘不可读" });
    expect([...failedRead.values()]).toEqual([]);

    const { sessions } = fixture("{ broken json");
    const parseResult = await sessions.open(request());
    expect(parseResult.kind).toBe("error");
    expect(parseResult).toEqual(expect.objectContaining({ kind: "error", message: expect.any(String) }));
    expect([...sessions.values()]).toEqual([]);
  });

  it("活动态只接受 registry 内的同一 session，关闭只清活动态而 dispose 清理真源", async () => {
    const { sessions } = fixture();
    const opened = await sessions.open(request());
    if (opened.kind === "error") throw new Error(opened.message);

    expect(sessions.activate(opened.session)).toBe(true);
    expect(sessions.activeUri).toBe(IDENTITY.uri);
    expect(sessions.deactivate("file:///workspace/Other.json")).toBe(false);
    expect(sessions.activeUri).toBe(IDENTITY.uri);
    expect(sessions.deactivate(IDENTITY.uri)).toBe(true);
    expect(sessions.activeUri).toBeUndefined();
    expect(sessions.get(IDENTITY.uri)).toBe(opened.session);

    const foreign = await fixture().sessions.open(request());
    if (foreign.kind === "error") throw new Error(foreign.message);
    expect(sessions.activate(foreign.session)).toBe(false);
    expect(sessions.activeUri).toBeUndefined();

    sessions.activate(opened.session);
    sessions.clear();
    expect(sessions.activeUri).toBeUndefined();
    expect([...sessions.values()]).toEqual([]);
  });
});
