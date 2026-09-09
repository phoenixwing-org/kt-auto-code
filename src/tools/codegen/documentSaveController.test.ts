import { describe, expect, it, vi } from "vitest";
import { KtCodegenController } from "@phoenix-wing/kt-codegen";
import { KtcCodegenDocumentModel } from "./documentModel.js";
import { KtcCodegenDocumentSaveController } from "./documentSaveController.js";
import { KtcCodegenFileEventQueue } from "./fileEventQueue.js";

function createSession(name = "example") {
  const controller = new KtCodegenController();
  const loaded = controller.readJson({
    type: "100106", version: "4.0", NamePrefix: "PNX", NameMiddle: "Part", NameSpace: "Kt", AppendFunction: "push_back",
    headers: ["NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue", "CATAttrInOut",
      "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit", "Author", "CreateDate", "Notes"],
    data: [["Part", 1, "Original", "First", "int", "Integer", 0, "In", 0, 0, "", 0, 0, "", "", "", ""]],
  });
  expect(loaded.ok).toBe(true);
  return new KtcCodegenDocumentModel({
    uri: `file:///${name}.json`, fsPath: `/${name}.json`, fileName: `${name}.json`,
  }, controller, 0, "before");
}
function capture(session: KtcCodegenDocumentModel) {
  return session.captureSaveSnapshot(session.controller.writeJson().value!);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Codegen save/reload coordination", () => {
  it("同 revision 的两个保存串行，第二个过期请求不写盘或逆序发 saved 回执", async () => {
    const session = createSession();
    const saves = new KtcCodegenDocumentSaveController(new KtcCodegenFileEventQueue());
    const gate = deferred();
    const writeFirst = vi.fn(async () => { await gate.promise; return { fingerprint: "saved", diagnosticCount: 0 }; });
    const firstAck = vi.fn();
    const first = saves.save(session, capture(session), { isCurrent: () => true, write: writeFirst, saved: firstAck });
    session.updateMeta("nameMiddle", "Newer");
    const writeSecond = vi.fn(async () => ({ fingerprint: "second", diagnosticCount: 0 }));
    const secondAck = vi.fn();
    const second = saves.save(session, capture(session), { isCurrent: () => true, write: writeSecond, saved: secondAck });
    await Promise.resolve();
    expect(writeSecond).not.toHaveBeenCalled();
    gate.resolve();
    expect(await first).toBe("saved");
    expect(await second).toBe("stale");
    expect(writeFirst).toHaveBeenCalledOnce();
    expect(writeSecond).not.toHaveBeenCalled();
    expect(firstAck).toHaveBeenCalledOnce();
    expect(secondAck).not.toHaveBeenCalled();
    expect(session.dirty).toBe(true);
    expect(session.controller.param.nameMiddle).toBe("Newer");
    expect(session.diskFingerprint).toBe("saved");
  });

  it("保存与 reload 共用队列，旧 saved 回执先于新模型；新 checkpoint 不被旧写盘覆盖", async () => {
    const session = createSession();
    const queue = new KtcCodegenFileEventQueue();
    const saves = new KtcCodegenDocumentSaveController(queue);
    const gate = deferred();
    const events: string[] = [];
    const saving = saves.save(session, capture(session), {
      isCurrent: () => true,
      write: async () => { events.push("write"); await gate.promise; return { fingerprint: "saved", diagnosticCount: 0 }; },
      saved: () => { events.push(`ack:${session.revision}`); },
    });
    const other = createSession(); other.updateMeta("nameMiddle", "Reloaded");
    const reloading = queue.enqueue(session.identity.uri, async () => {
      session.reloadFromJson(other.controller.writeJson().value!, "reloaded");
      events.push(`reload:${session.revision}`);
    });
    await Promise.resolve();
    expect(session.revision).toBe(0);
    gate.resolve();
    await Promise.all([saving, reloading]);
    expect(events).toEqual(["write", "ack:1", "reload:2"]);
    expect(session.diskFingerprint).toBe("reloaded");
    expect(session.controller.param.nameMiddle).toBe("Reloaded");
    expect(session.dirty).toBe(false);
  });

  it.each(["reloaded", "replaced"])("写盘期间会话 %s，完成时不覆盖新模型、不发旧 saved", async (change) => {
    const session = createSession();
    const saves = new KtcCodegenDocumentSaveController(new KtcCodegenFileEventQueue());
    const gate = deferred(); const started = deferred();
    let current = session;
    const saved = vi.fn();
    const saving = saves.save(session, capture(session), {
      isCurrent: () => current === session,
      write: async () => { started.resolve(); await gate.promise; return { fingerprint: "late", diagnosticCount: 0 }; },
      saved,
    });
    await started.promise;
    if (change === "replaced") current = createSession();
    else {
      const disk = createSession(); disk.updateMeta("nameMiddle", "Newer reload");
      session.reloadFromJson(disk.controller.writeJson().value!, "reload");
    }
    gate.resolve();
    expect(await saving).toBe("written-stale");
    expect(saved).not.toHaveBeenCalled();
    expect(current.diskFingerprint).not.toBe("late");
    if (change === "reloaded") {
      expect(session.externalState).toBe("changed");
      expect(session.controller.param.nameMiddle).toBe("Newer reload");
      expect(session.revision).toBe(1);
    } else expect(current.revision).toBe(0);
  });

  it("不同 JSON 保存仍并行；排队期间已重载的请求不触发写盘", async () => {
    const queue = new KtcCodegenFileEventQueue();
    const saves = new KtcCodegenDocumentSaveController(queue);
    const first = createSession("first"); const second = createSession("second");
    const gate = deferred();
    const blocked = saves.save(first, capture(first), {
      isCurrent: () => true, saved: vi.fn(),
      write: async () => { await gate.promise; return { fingerprint: "first", diagnosticCount: 0 }; },
    });
    expect(await saves.save(second, capture(second), {
      isCurrent: () => true, saved: vi.fn(), write: async () => ({ fingerprint: "second", diagnosticCount: 0 }),
    })).toBe("saved");
    gate.resolve(); await blocked;
    const old = capture(first);
    first.reloadFromJson(old.json, "external");
    const write = vi.fn(async () => ({ fingerprint: "must-not-write", diagnosticCount: 0 }));
    expect(await saves.save(first, old, { isCurrent: () => true, saved: vi.fn(), write })).toBe("stale");
    expect(write).not.toHaveBeenCalled();
  });
});
