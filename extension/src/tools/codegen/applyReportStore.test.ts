import { beforeEach, describe, expect, it, vi } from "vitest";

const { FakeUri, FakeFileSystemError } = vi.hoisted(() => {
  class HoistedFakeUri {
    readonly scheme = "file";
    constructor(readonly fsPath: string) {}
    toString(): string { return `file://${this.fsPath}`; }
    static file(value: string): HoistedFakeUri { return new HoistedFakeUri(value); }
    static parse(value: string): HoistedFakeUri { return new HoistedFakeUri(value.replace(/^file:\/\//u, "")); }
    static joinPath(base: HoistedFakeUri, ...parts: string[]): HoistedFakeUri {
      return new HoistedFakeUri([base.fsPath.replace(/\/$/u, ""), ...parts].join("/"));
    }
  }
  class HoistedFakeFileSystemError extends Error {
    readonly code: string;
    constructor(message: string, code = "FileNotFound") {
      super(message);
      this.code = code;
    }
  }
  return { FakeUri: HoistedFakeUri, FakeFileSystemError: HoistedFakeFileSystemError };
});

vi.mock("vscode", () => ({
  Uri: FakeUri,
  FileType: { File: 1, Directory: 2 },
  FileSystemError: FakeFileSystemError,
  workspace: { fs: {} },
}));

import type * as vscode from "vscode";
import { KtcCodegenApplyReportStore } from "./applyReportStore.js";
import { ktcCodegenBatchApplyReport } from "./batchApplyReport.js";

const files = new Map<string, Uint8Array>();

function fileSystem() {
  return {
    createDirectory: vi.fn(async () => undefined),
    writeFile: vi.fn(async (uri: vscode.Uri, content: Uint8Array) => { files.set(uri.toString(), content); }),
    readFile: vi.fn(async (uri: vscode.Uri) => {
      const content = files.get(uri.toString());
      if (!content) throw new FakeFileSystemError("ENOENT");
      return content;
    }),
    rename: vi.fn(async (source: vscode.Uri, target: vscode.Uri, options: { overwrite: boolean }) => {
      const content = files.get(source.toString());
      if (!content) throw new FakeFileSystemError("ENOENT");
      if (!options.overwrite && files.has(target.toString())) throw new Error("exists");
      files.set(target.toString(), content);
      files.delete(source.toString());
    }),
    delete: vi.fn(async (uri: vscode.Uri) => { files.delete(uri.toString()); }),
    readDirectory: vi.fn(async (directory: vscode.Uri) => {
      const prefix = `${directory.toString()}/`;
      return [...files.keys()]
        .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes("/"))
        .map((uri) => [uri.slice(prefix.length), 1] as [string, vscode.FileType]);
    }),
  };
}

function runtimeReport() {
  return ktcCodegenBatchApplyReport([{
    uri: "file:///workspace/config/PNXCombinedCurveParam.json",
    fileName: "PNXCombinedCurveParam.json",
    health: "warning",
    change: "unchanged",
    reasonCode: "content-unchanged",
    errorCount: 0,
    preflightRegionCount: 3,
    preflightArtifactCount: 3,
    preflightDiagnosticCount: 0,
    preflightErrorCount: 0,
    modifiedFileCount: 0,
    writtenRegionCount: 0,
    elapsedMilliseconds: 90,
    issues: [{
      severity: "warning",
      code: "notice",
      message: "/workspace/src/Part.cpp 示例提示",
      file: "/workspace/src/Part.cpp",
      line: 12,
    }],
  }], 100, {
    reportId: "12345678-1234-4234-8234-123456789abc",
    applyKind: "single",
    startedAt: "2026-07-20T13:02:45.123Z",
    finishedAt: "2026-07-20T13:02:45.223Z",
  });
}

describe("Codegen Apply 报告 Host store", () => {
  beforeEach(() => files.clear());

  it("临时写入复读后原子改名，并只持久化工作区相对路径", async () => {
    const fs = fileSystem();
    const store = new KtcCodegenApplyReportStore(fs as never);
    const root = FakeUri.file("/workspace") as unknown as vscode.Uri;
    const workspaces = [{ name: "demo", uri: root }];
    const record = await store.write(runtimeReport(), root, workspaces);

    expect(record.summary).toMatchObject({
      health: "warning",
      change: "unchanged",
      subject: "PNXCombinedCurveParam.json",
    });
    expect(fs.rename).toHaveBeenCalledOnce();
    expect([...files.keys()]).toHaveLength(1);
    const json = new TextDecoder().decode([...files.values()][0]);
    expect(json).toContain('"workspaceFolder": "demo"');
    expect(json).toContain('"path": "config/PNXCombinedCurveParam.json"');
    expect(json).toContain('"health": "warning"');
    expect(json).not.toContain("file:///workspace");
    expect(json).not.toContain('"file": "/workspace');
    expect(json).not.toContain("/workspace/src/Part.cpp");
    expect(json).toContain("<workspace:demo>/src/Part.cpp 示例提示");

    const index = await store.list([root]);
    expect(index.invalidCount).toBe(0);
    expect(index.records).toHaveLength(1);
    const loaded = await store.load(index.records[0]!.storageUri, workspaces);
    expect(loaded.items[0]).toMatchObject({
      uri: "file:///workspace/config/PNXCombinedCurveParam.json",
      health: "warning",
      change: "unchanged",
      issues: [{ file: "/workspace/src/Part.cpp", line: 12 }],
    });
  });
});
