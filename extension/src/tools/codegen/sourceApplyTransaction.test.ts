import { describe, expect, it } from "vitest";
import {
  KtcCodegenApplyConcurrentChangeError,
  ktcCommitCodegenApplyWrites,
  type KtcCodegenApplyWritePort,
} from "./sourceApplyTransaction.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const text = (value: Uint8Array | undefined) => value ? new TextDecoder().decode(value) : undefined;

class MemoryWritePort implements KtcCodegenApplyWritePort<string> {
  readonly files = new Map<string, Uint8Array>();
  failForwardTarget?: string;
  failRollbackTarget?: string;
  changeBeforeReadTarget?: string;
  changeAdditionalTargetOnRead?: { trigger: string; target: string };
  private forwardFailed = false;

  async readFile(target: string): Promise<Uint8Array> {
    if (target === this.changeBeforeReadTarget) {
      this.changeBeforeReadTarget = undefined;
      this.files.set(target, bytes(`external-${target}`));
    }
    if (target === this.changeAdditionalTargetOnRead?.trigger) {
      const changed = this.changeAdditionalTargetOnRead.target;
      this.changeAdditionalTargetOnRead = undefined;
      this.files.set(changed, bytes(`external-${changed}`));
    }
    const content = this.files.get(target);
    if (!content) throw new Error(`missing: ${target}`);
    return Uint8Array.from(content);
  }

  async writeFile(target: string, content: Uint8Array): Promise<void> {
    const value = text(content);
    if (!this.forwardFailed && target === this.failForwardTarget && value?.startsWith("after")) {
      this.files.set(target, Uint8Array.from(content));
      this.forwardFailed = true;
      throw new Error(`forward failed: ${target}`);
    }
    if (this.forwardFailed && target === this.failRollbackTarget && value?.startsWith("before")) {
      throw new Error(`rollback failed: ${target}`);
    }
    this.files.set(target, Uint8Array.from(content));
  }
}

function writes() {
  return [
    { target: "a.cpp", before: bytes("before-a"), after: bytes("after-a") },
    { target: "b.cpp", before: bytes("before-b"), after: bytes("after-b") },
  ];
}

function portWithBefore(): MemoryWritePort {
  const port = new MemoryWritePort();
  for (const write of writes()) port.files.set(write.target, Uint8Array.from(write.before));
  return port;
}

describe("Codegen Apply write transaction", () => {
  it("全部写入成功时保留 after", async () => {
    const port = portWithBefore();
    const result = await ktcCommitCodegenApplyWrites(port, writes());
    expect(result).toEqual({ ok: true });
    expect(text(port.files.get("a.cpp"))).toBe("after-a");
    expect(text(port.files.get("b.cpp"))).toBe("after-b");
  });

  it("第二个文件写入后抛错时逆序恢复两个文件", async () => {
    const port = portWithBefore();
    port.failForwardTarget = "b.cpp";
    const result = await ktcCommitCodegenApplyWrites(port, writes());
    expect(result).toMatchObject({ ok: false, rollbackFailures: [] });
    expect(text(port.files.get("a.cpp"))).toBe("before-a");
    expect(text(port.files.get("b.cpp"))).toBe("before-b");
  });

  it("回滚失败时返回精确目标供 Problems 和 Git 提示", async () => {
    const port = portWithBefore();
    port.failForwardTarget = "b.cpp";
    port.failRollbackTarget = "a.cpp";
    const result = await ktcCommitCodegenApplyWrites(port, writes());
    expect(result).toMatchObject({ ok: false, rollbackFailures: ["a.cpp"] });
    expect(text(port.files.get("b.cpp"))).toBe("before-b");
    expect(text(port.files.get("a.cpp"))).toBe("after-a");
  });

  it("第二个文件在事务中途被外部修改时停止并回滚第一个文件", async () => {
    const port = portWithBefore();
    port.changeBeforeReadTarget = "b.cpp";

    const result = await ktcCommitCodegenApplyWrites(port, writes());

    expect(result).toMatchObject({ ok: false, rollbackFailures: [] });
    expect(result.ok || result.error).toBeInstanceOf(KtcCodegenApplyConcurrentChangeError);
    if (!result.ok) {
      expect((result.error as KtcCodegenApplyConcurrentChangeError<string>).target).toBe("b.cpp");
    }
    expect(text(port.files.get("a.cpp"))).toBe("before-a");
    expect(text(port.files.get("b.cpp"))).toBe("external-b.cpp");
  });

  it("回滚前文件又被外部修改时不覆盖第三方内容并报告目标", async () => {
    const port = portWithBefore();
    port.changeBeforeReadTarget = "b.cpp";
    port.changeAdditionalTargetOnRead = { trigger: "b.cpp", target: "a.cpp" };

    const result = await ktcCommitCodegenApplyWrites(port, writes());

    expect(result).toMatchObject({ ok: false, rollbackFailures: ["a.cpp"] });
    expect(text(port.files.get("a.cpp"))).toBe("external-a.cpp");
    expect(text(port.files.get("b.cpp"))).toBe("external-b.cpp");
  });
});
