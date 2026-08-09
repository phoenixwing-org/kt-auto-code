import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFiles } = vi.hoisted(() => ({ findFiles: vi.fn() }));

vi.mock("vscode", () => ({
  CancellationError: class CancellationError extends Error {},
  Uri: {
    file: (path: string) => ({
      fsPath: path,
      path,
      scheme: "file",
      toString: () => `file://${path}`,
      with: (change: { path?: string }) => ({
        fsPath: change.path ?? path,
        path: change.path ?? path,
        scheme: "file",
        toString: () => `file://${change.path ?? path}`,
      }),
    }),
  },
  RelativePattern: class RelativePattern {
    constructor(
      public readonly base: unknown,
      public readonly pattern: string,
    ) {}
  },
  workspace: { findFiles },
}));

import type * as vscode from "vscode";
import type { KtcCodegenDocumentService } from "./documentService.js";
import { KtcCodegenWorkspaceDiscoveryService } from "./workspaceDiscovery.js";

function uri(path: string): vscode.Uri {
  return {
    fsPath: path,
    path,
    scheme: "file",
    toString: () => `file://${path}`,
  } as vscode.Uri;
}

describe("KtcCodegenWorkspaceDiscoveryService", () => {
  beforeEach(() => findFiles.mockReset());

  it("同时点检根目录和嵌套 JSON，并对重叠 glob 去重", async () => {
    const root = uri("/workspace");
    const rootJson = uri("/workspace/root.json");
    const nestedJson = uri("/workspace/src/nested.json");
    findFiles.mockImplementation((pattern?: { pattern: string }) => {
      if (pattern?.pattern === "*.json") return Promise.resolve([rootJson]);
      if (pattern?.pattern === "**/*.json") return Promise.resolve([rootJson, nestedJson]);
      return Promise.resolve([]);
    });
    const documents = {
      inspect: vi.fn((value: vscode.Uri) => Promise.resolve({
        uri: value,
        itemCount: 1,
        className: "PNXPart",
        namePrefix: "PNX",
        nameMiddle: "Part",
        nameSpace: "Kt",
        appendFunction: "push_back",
        diagnosticCount: 0,
      })),
      convertCsv: vi.fn(),
    } as unknown as KtcCodegenDocumentService;

    const result = await new KtcCodegenWorkspaceDiscoveryService(documents).discover(
      [root],
      vi.fn(),
    );

    expect(findFiles.mock.calls.map((call) => call[0]?.pattern)).toEqual([
      "*.json", "**/*.json", "*.csv", "**/*.csv",
    ]);
    expect(result.scannedJsonCount).toBe(2);
    expect(result.documents.map((entry) => entry.uri.toString())).toEqual([
      rootJson.toString(), nestedJson.toString(),
    ]);
    expect(documents.inspect).toHaveBeenCalledTimes(2);
  });

  it("在文件系统点检前响应取消", async () => {
    const documents = { inspect: vi.fn(), convertCsv: vi.fn() } as unknown as KtcCodegenDocumentService;
    await expect(new KtcCodegenWorkspaceDiscoveryService(documents).discover(
      [uri("/workspace")],
      vi.fn(),
      { isCancellationRequested: true } as vscode.CancellationToken,
    )).rejects.toThrow();
    expect(findFiles).not.toHaveBeenCalled();
  });

  it("把取消令牌直接交给四个 VS Code 文件检索", async () => {
    findFiles.mockResolvedValue([]);
    const documents = { inspect: vi.fn(), convertCsv: vi.fn() } as unknown as KtcCodegenDocumentService;
    const token = { isCancellationRequested: false } as vscode.CancellationToken;
    await new KtcCodegenWorkspaceDiscoveryService(documents).discover(
      [uri("/workspace")],
      vi.fn(),
      token,
    );
    expect(findFiles).toHaveBeenCalledTimes(4);
    expect(findFiles.mock.calls.every((call) => call[3] === token)).toBe(true);
  });

  it("一次发现聚合安全转换、冲突保留、负样例过滤和进度", async () => {
    const root = uri("/workspace");
    const rootJson = uri("/workspace/root.json");
    const conflictJson = uri("/workspace/conflict.json");
    const negativeJson = uri("/workspace/not-codegen.json");
    const legacyCsv = uri("/workspace/legacy.csv");
    const conflictCsv = uri("/workspace/conflict.csv");
    findFiles.mockImplementation((pattern?: { pattern: string }) => {
      if (pattern?.pattern === "*.json") return Promise.resolve([rootJson, conflictJson, negativeJson]);
      if (pattern?.pattern === "**/*.json") return Promise.resolve([rootJson, conflictJson, negativeJson]);
      if (pattern?.pattern === "*.csv") return Promise.resolve([legacyCsv, conflictCsv]);
      if (pattern?.pattern === "**/*.csv") return Promise.resolve([legacyCsv, conflictCsv]);
      return Promise.resolve([]);
    });
    const inspect = vi.fn((value: vscode.Uri) => Promise.resolve(
      value.toString() === negativeJson.toString() ? undefined : {
        uri: value,
        itemCount: 1,
        className: "PNXPart",
        namePrefix: "PNX",
        nameMiddle: "Part",
        nameSpace: "Kt",
        appendFunction: "push_back",
        diagnosticCount: 0,
      },
    ));
    const convertCsv = vi.fn((csv: vscode.Uri, target: vscode.Uri) => Promise.resolve({
      kind: csv.toString() === conflictCsv.toString() ? "conflict" as const : "converted" as const,
      target,
      diagnosticCount: 0,
    }));
    const documents = { inspect, convertCsv } as unknown as KtcCodegenDocumentService;
    const progress = vi.fn();

    const result = await new KtcCodegenWorkspaceDiscoveryService(documents).discover(
      [root],
      vi.fn(),
      undefined,
      progress,
    );

    expect(result).toMatchObject({
      scannedJsonCount: 3,
      convertedCount: 1,
      deduplicatedCount: 0,
      conflictCount: 1,
    });
    expect(result.documents.map((document) => document.uri.fsPath).sort()).toEqual([
      "/workspace/conflict.json", "/workspace/legacy.json", "/workspace/root.json",
    ]);
    expect(convertCsv).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.map((call) => call[0])).toEqual([
      "已定位 3 份 JSON、2 份 CSV，正在识别格式…",
      "正在点检 4 份 JSON 的 Codegen 数据模型…",
    ]);
  });
});
