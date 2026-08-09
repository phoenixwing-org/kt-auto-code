import { describe, expect, it, vi } from "vitest";
import {
  KTC_CODEGEN_APPLY_RECEIPT_DIRECTORY,
  ktcCodegenApplyReceiptRelativePath,
  ktcCodegenReceiptWorkspacePath,
  ktcCreateCodegenApplyReceipt,
  ktcSerializeCodegenApplyReceipt,
  ktcValidCodegenApplyReceipt,
  type KtcCodegenApplyReceipt,
} from "./applyReceipt.js";
import { ktcWriteCodegenApplyReceipt } from "./applyReceiptStore.js";

const BEFORE = `sha256:${"1".repeat(64)}`;
const AFTER = `sha256:${"2".repeat(64)}`;

function receipt(overrides: Partial<KtcCodegenApplyReceipt> = {}): KtcCodegenApplyReceipt {
  return {
    kind: "kt.codegen.apply-receipt",
    schemaVersion: 1,
    createdAt: "2026-07-17T10:00:00.000Z",
    documentPath: "config/PNXWidgetParam.json",
    preflightCachePath: ".phoenix/cache/codegen/preflight-v1/document.json",
    preflightCreatedAt: "2026-07-17T09:59:00.000Z",
    fileCount: 1,
    regionCount: 1,
    files: [{
      path: "src/PNXWidget.cpp",
      beforeFingerprint: BEFORE,
      afterFingerprint: AFTER,
      encoding: "utf8",
      eol: "lf",
      beforeBytes: 100,
      afterBytes: 120,
      regionCount: 1,
      regions: [{
        id: "src/PNXWidget.cpp#PARAM DECLARATION#PNXWidget",
        artifactId: "cpp.parameter#PNXWidget",
        blockKey: "PARAM DECLARATION",
        classId: "PNXWidget",
        nameSuffix: "Widget",
        line: 3,
      }],
    }],
    ...overrides,
  };
}

describe("Codegen Apply Receipt", () => {
  it("生成结构化回执并稳定使用两空格缓存格式", () => {
    const value = ktcCreateCodegenApplyReceipt({
      createdAt: "2026-07-17T10:00:00.000Z",
      documentPath: receipt().documentPath,
      preflightCachePath: receipt().preflightCachePath,
      preflightCreatedAt: receipt().preflightCreatedAt,
      files: receipt().files,
    });
    expect(ktcValidCodegenApplyReceipt(value)).toBe(true);
    const json = new TextDecoder().decode(ktcSerializeCodegenApplyReceipt(value));
    expect(json).toContain('\n  "schemaVersion": 1');
    expect(json.endsWith("\n")).toBe(true);
  });

  it("拒绝越界路径、重复文件、伪造计数和未变化指纹", () => {
    expect(ktcValidCodegenApplyReceipt(receipt({ documentPath: "../outside.json" }))).toBe(false);
    expect(ktcValidCodegenApplyReceipt(receipt({ regionCount: 2 }))).toBe(false);
    expect(ktcValidCodegenApplyReceipt(receipt({ files: [receipt().files[0]!, receipt().files[0]!], fileCount: 2 })))
      .toBe(false);
    expect(ktcValidCodegenApplyReceipt(receipt({
      files: [{ ...receipt().files[0]!, afterFingerprint: BEFORE }],
    }))).toBe(false);
  });

  it("只把工作区内路径投影为正斜杠相对路径", () => {
    expect(ktcCodegenReceiptWorkspacePath("/workspace", "/workspace/src/A.cpp")).toBe("src/A.cpp");
    expect(ktcCodegenReceiptWorkspacePath("/workspace", "/other/A.cpp")).toBeUndefined();
    expect(ktcCodegenReceiptWorkspacePath("/workspace", "/workspace")).toBeUndefined();
    expect(ktcCodegenApplyReceiptRelativePath("/workspace/.phoenix/cache/codegen/preflight-v1/a.json"))
      .toBe(`${KTC_CODEGEN_APPLY_RECEIPT_DIRECTORY}/a.json`);
    expect(() => ktcCodegenApplyReceiptRelativePath("bad name.json")).toThrow(/不能安全映射/);
  });

  it("通过端口原子替换回执，并在 rename 失败时清理临时文件", async () => {
    const calls: string[] = [];
    const contents = new Map<string, Uint8Array>();
    const port = {
      createDirectory: vi.fn(async (path: string) => { calls.push(`mkdir:${path}`); }),
      writeFile: vi.fn(async (path: string, content: Uint8Array) => {
        calls.push(`write:${path}`);
        contents.set(path, content);
      }),
      rename: vi.fn(async (source: string, target: string) => {
        calls.push(`rename:${source}->${target}`);
        contents.set(target, contents.get(source)!);
        contents.delete(source);
      }),
      deleteFile: vi.fn(async (path: string) => {
        calls.push(`delete:${path}`);
        contents.delete(path);
      }),
    };
    const target = await ktcWriteCodegenApplyReceipt(
      port,
      "/workspace",
      "/workspace/.phoenix/cache/codegen/preflight-v1/a.json",
      receipt(),
    );
    expect(target).toBe(`/workspace/${KTC_CODEGEN_APPLY_RECEIPT_DIRECTORY}/a.json`);
    expect(calls.map((item) => item.split(":")[0])).toEqual(["mkdir", "write", "rename"]);
    expect(JSON.parse(new TextDecoder().decode(contents.get(target)!))).toMatchObject({
      kind: "kt.codegen.apply-receipt",
      fileCount: 1,
      regionCount: 1,
    });

    port.rename.mockRejectedValueOnce(new Error("rename failed"));
    await expect(ktcWriteCodegenApplyReceipt(
      port,
      "/workspace",
      "/workspace/.phoenix/cache/codegen/preflight-v1/a.json",
      receipt(),
    )).rejects.toThrow("rename failed");
    expect(port.deleteFile).toHaveBeenCalledTimes(1);
  });
});
