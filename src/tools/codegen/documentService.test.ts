import { describe, expect, it } from "vitest";
import type * as vscode from "vscode";
import {
  KtCodegenController,
} from "@phoenix-wing/kt-codegen";
import {
  KtcCodegenDocumentService,
  ktcCodegenClassifySaveDiskState,
  ktcCodegenFingerprint,
  ktcCodegenIsFileNotFoundError,
  type KtcCodegenFileSystem,
} from "./documentService.js";

function fileUri(path: string): vscode.Uri {
  return {
    path,
    fsPath: path,
    scheme: "file",
    toString: () => `file://${path}`,
    with: (change: { path?: string }) => fileUri(change.path ?? path),
  } as vscode.Uri;
}

class MemoryFileSystem implements KtcCodegenFileSystem {
  readonly files = new Map<string, Uint8Array>();
  readonly deleted: string[] = [];
  failNextRename = false;
  corruptNextRenameTarget = false;

  private error(code: string): Error {
    return Object.assign(new Error(code), { code });
  }

  readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const value = this.files.get(uri.toString());
    if (!value) return Promise.reject(this.error("ENOENT"));
    return Promise.resolve(value);
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    this.files.set(uri.toString(), Uint8Array.from(content));
    return Promise.resolve();
  }

  stat(uri: vscode.Uri): Promise<unknown> {
    return this.files.has(uri.toString()) ? Promise.resolve({}) : Promise.reject(this.error("ENOENT"));
  }

  delete(uri: vscode.Uri): Promise<void> {
    if (!this.files.delete(uri.toString())) return Promise.reject(this.error("ENOENT"));
    this.deleted.push(uri.toString());
    return Promise.resolve();
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options?: { overwrite?: boolean }): Promise<void> {
    if (this.failNextRename) {
      this.failNextRename = false;
      return Promise.reject(this.error("EIO"));
    }
    const value = this.files.get(oldUri.toString());
    if (!value) return Promise.reject(this.error("ENOENT"));
    if (!options?.overwrite && this.files.has(newUri.toString())) return Promise.reject(this.error("EEXIST"));
    this.files.set(newUri.toString(), value);
    this.files.delete(oldUri.toString());
    if (this.corruptNextRenameTarget) {
      this.corruptNextRenameTarget = false;
      this.files.set(newUri.toString(), new TextEncoder().encode("{ corrupted"));
    }
    return Promise.resolve();
  }
}

function fixture(): { csv: string; json: string } {
  const controller = new KtCodegenController();
  const read = controller.readJson({
    type: "100106",
    version: "4.0",
    NamePrefix: "PNX",
    NameMiddle: "Part",
    NameSpace: "Kt",
    AppendFunction: "push_back",
    headers: [
      "NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue",
      "CATAttrInOut", "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit",
      "Author", "CreateDate", "Notes",
    ],
    data: [["Part", 1, "First", "First", "int", "Integer", 0, "In", 0, 0, "", 0, 0, "", "", "", ""]],
  });
  if (!read.ok) throw new Error("invalid fixture");
  return { csv: controller.writeCsv().value!, json: controller.writeJson().value! };
}

describe("KtcCodegenDocumentService", () => {
  it("读取文本时返回稳定内容指纹，保存冲突判定不依赖 watcher", async () => {
    const fs = new MemoryFileSystem();
    const service = new KtcCodegenDocumentService(fs);
    const uri = fileUri("/workspace/fingerprint.json");
    const first = new TextEncoder().encode('{"value":1}');
    fs.files.set(uri.toString(), first);

    const snapshot = await service.readSnapshot(uri);
    expect(snapshot.text).toBe('{"value":1}');
    expect(snapshot.fingerprint).toBe(ktcCodegenFingerprint(first));
    expect((await service.readSnapshot(uri)).fingerprint).toBe(snapshot.fingerprint);

    fs.files.set(uri.toString(), new TextEncoder().encode('{"value":2}'));
    const changed = await service.readSnapshot(uri);
    expect(changed.fingerprint).not.toBe(snapshot.fingerprint);
    expect(ktcCodegenClassifySaveDiskState(snapshot.fingerprint, snapshot.fingerprint, false)).toBe("current");
    expect(ktcCodegenClassifySaveDiskState(snapshot.fingerprint, changed.fingerprint, false)).toBe("changed");
    expect(ktcCodegenClassifySaveDiskState(snapshot.fingerprint, snapshot.fingerprint, true)).toBe("changed");
    expect(ktcCodegenClassifySaveDiskState(snapshot.fingerprint, undefined, false)).toBe("deleted");
  });

  it("只把明确的文件不存在错误视为删除", () => {
    expect(ktcCodegenIsFileNotFoundError({ code: "FileNotFound" })).toBe(true);
    expect(ktcCodegenIsFileNotFoundError({ code: "ENOENT" })).toBe(true);
    expect(ktcCodegenIsFileNotFoundError({ code: "NoPermissions" })).toBe(false);
    expect(ktcCodegenIsFileNotFoundError(new Error("temporary failure"))).toBe(false);
  });

  it("保存 JSON 时临时复读、原子替换并返回写后指纹", async () => {
    const fs = new MemoryFileSystem();
    const service = new KtcCodegenDocumentService(fs);
    const uri = fileUri("/workspace/save.json");
    const original = fixture().json;
    fs.files.set(uri.toString(), new TextEncoder().encode(original));
    const checkpoint = (await service.readSnapshot(uri)).fingerprint;
    const controller = new KtCodegenController();
    expect(controller.readJson(original).ok).toBe(true);
    controller.param.nameSpace = "SavedNamespace";
    const next = controller.writeJson().value!;

    const saved = await service.writeValidatedJson(uri, next, {
      expectedFingerprint: checkpoint,
    });

    expect(saved.text).toBe(next);
    expect(saved.fingerprint).toBe(ktcCodegenFingerprint(new TextEncoder().encode(next)));
    expect((await service.inspect(uri))?.nameSpace).toBe("SavedNamespace");
    expect([...fs.files.keys()].some((key) => key.endsWith(".tmp"))).toBe(false);
  });

  it("保存期间指纹再次变化或 rename 失败时不覆盖原文件并清理临时文件", async () => {
    const fs = new MemoryFileSystem();
    const service = new KtcCodegenDocumentService(fs);
    const uri = fileUri("/workspace/conflicted-save.json");
    const original = fixture().json;
    fs.files.set(uri.toString(), new TextEncoder().encode(original));
    const checkpoint = (await service.readSnapshot(uri)).fingerprint;
    const external = original.replace('"NameSpace": "Kt"', '"NameSpace": "External"');
    fs.files.set(uri.toString(), new TextEncoder().encode(external));

    await expect(service.writeValidatedJson(uri, original, {
      expectedFingerprint: checkpoint,
    })).rejects.toThrow("保存过程中再次变化");
    expect(new TextDecoder().decode(fs.files.get(uri.toString()))).toBe(external);

    fs.failNextRename = true;
    await expect(service.writeValidatedJson(uri, original)).rejects.toThrow("EIO");
    expect(new TextDecoder().decode(fs.files.get(uri.toString()))).toBe(external);
    expect([...fs.files.keys()].some((key) => key.endsWith(".tmp"))).toBe(false);
  });

  it("重新创建 guard 会拒绝竞态中重新出现的 JSON", async () => {
    const fs = new MemoryFileSystem();
    const service = new KtcCodegenDocumentService(fs);
    const uri = fileUri("/workspace/recreate.json");
    const json = fixture().json;
    const created = await service.writeValidatedJson(uri, json, { requireMissing: true });
    expect(created.text).toBe(json);

    await expect(service.writeValidatedJson(uri, json, { requireMissing: true }))
      .rejects.toThrow("重新出现");
  });

  it("转换后复读 JSON，成功后才删除 CSV", async () => {
    const fs = new MemoryFileSystem();
    const service = new KtcCodegenDocumentService(fs);
    const csv = fileUri("/workspace/example.csv");
    const json = fileUri("/workspace/example.json");
    fs.files.set(csv.toString(), new TextEncoder().encode(fixture().csv));

    const result = await service.convertCsv(csv, json, false);

    expect(result.kind).toBe("converted");
    expect(fs.files.has(json.toString())).toBe(true);
    expect(fs.files.has(csv.toString())).toBe(false);
    expect(fs.deleted).toContain(csv.toString());
    expect((await service.inspect(json))?.itemCount).toBe(1);
  });

  it("相同 JSON 去重，内容冲突时保留两份文件", async () => {
    const sameFs = new MemoryFileSystem();
    const sameService = new KtcCodegenDocumentService(sameFs);
    const sameCsv = fileUri("/workspace/same.csv");
    const sameJson = fileUri("/workspace/same.json");
    const data = fixture();
    sameFs.files.set(sameCsv.toString(), new TextEncoder().encode(data.csv));
    sameFs.files.set(sameJson.toString(), new TextEncoder().encode(data.json));
    expect((await sameService.convertCsv(sameCsv, sameJson, false)).kind).toBe("deduplicated");
    expect(sameFs.files.has(sameCsv.toString())).toBe(false);

    const conflictFs = new MemoryFileSystem();
    const conflictService = new KtcCodegenDocumentService(conflictFs);
    const conflictCsv = fileUri("/workspace/conflict.csv");
    const conflictJson = fileUri("/workspace/conflict.json");
    conflictFs.files.set(conflictCsv.toString(), new TextEncoder().encode(data.csv));
    conflictFs.files.set(conflictJson.toString(), new TextEncoder().encode('{"type":"other"}'));
    expect((await conflictService.convertCsv(conflictCsv, conflictJson, false)).kind).toBe("conflict");
    expect(conflictFs.files.has(conflictCsv.toString())).toBe(true);
    expect(conflictFs.files.has(conflictJson.toString())).toBe(true);
  });

  it("显式覆盖转换在目标复读失败时恢复原 JSON 并保留 CSV", async () => {
    const fs = new MemoryFileSystem();
    const service = new KtcCodegenDocumentService(fs);
    const csv = fileUri("/workspace/overwrite.csv");
    const json = fileUri("/workspace/overwrite.json");
    const data = fixture();
    const original = new TextEncoder().encode('{"type":"existing"}');
    fs.files.set(csv.toString(), new TextEncoder().encode(data.csv));
    fs.files.set(json.toString(), original);
    fs.corruptNextRenameTarget = true;

    await expect(service.convertCsv(csv, json, true)).rejects.toThrow("复读验证不一致");

    expect(fs.files.get(json.toString())).toEqual(original);
    expect(fs.files.has(csv.toString())).toBe(true);
    expect([...fs.files.keys()].some((key) => key.endsWith(".tmp"))).toBe(false);
  });
});
