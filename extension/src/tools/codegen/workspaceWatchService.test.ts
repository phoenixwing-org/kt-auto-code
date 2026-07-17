import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  watchers: [] as Array<{
    pattern: string;
    create?: (uri: unknown) => void;
    change?: (uri: unknown) => void;
    delete?: (uri: unknown) => void;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  createFileSystemWatcher: vi.fn(),
}));

vi.mock("vscode", () => {
  mocks.createFileSystemWatcher.mockImplementation((pattern: string) => {
    const watcher = {
      pattern,
      create: undefined as ((uri: unknown) => void) | undefined,
      change: undefined as ((uri: unknown) => void) | undefined,
      delete: undefined as ((uri: unknown) => void) | undefined,
      dispose: vi.fn(),
      onDidCreate(callback: (uri: unknown) => void) { this.create = callback; },
      onDidChange(callback: (uri: unknown) => void) { this.change = callback; },
      onDidDelete(callback: (uri: unknown) => void) { this.delete = callback; },
    };
    mocks.watchers.push(watcher);
    return watcher;
  });
  return { workspace: { createFileSystemWatcher: mocks.createFileSystemWatcher } };
});

import type * as vscode from "vscode";
import {
  KtcCodegenWorkspaceWatchService,
  ktcClassifyCodegenWorkspaceFile,
} from "./workspaceWatchService.js";

function uri(path: string): vscode.Uri {
  return { fsPath: path, toString: () => `file://${path}` } as vscode.Uri;
}

describe("KtcCodegenWorkspaceWatchService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.watchers.length = 0;
    mocks.createFileSystemWatcher.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it("分类受支持文件并排除缓存、构建和依赖目录", () => {
    expect(ktcClassifyCodegenWorkspaceFile(uri("/workspace/root.JSON"))).toBe("json");
    expect(ktcClassifyCodegenWorkspaceFile(uri("/workspace/legacy.csv"))).toBe("csv");
    expect(ktcClassifyCodegenWorkspaceFile(uri("/workspace/src/Part.cpp"))).toBe("source");
    expect(ktcClassifyCodegenWorkspaceFile(uri("/workspace/.phoenix/cache/index.json"))).toBeUndefined();
    expect(ktcClassifyCodegenWorkspaceFile(uri("/workspace/node_modules/pkg/a.cpp"))).toBeUndefined();
    expect(ktcClassifyCodegenWorkspaceFile(uri("/workspace/README.md"))).toBeUndefined();
  });

  it("把连续文件事件合并为一次发现和一次候选刷新", () => {
    const onJson = vi.fn();
    const onDiscoveryRefresh = vi.fn();
    const onSource = vi.fn(() => true);
    const onCandidateRefresh = vi.fn();
    const service = new KtcCodegenWorkspaceWatchService({
      onJson,
      onDiscoveryRefresh,
      onSource,
      onCandidateRefresh,
    });
    service.start();

    expect(mocks.watchers.map((watcher) => watcher.pattern)).toEqual([
      "**/*.{json,csv}", "**/*.{h,hpp,hh,hxx,c,cc,cpp,cxx}",
    ]);
    mocks.watchers[0]!.create?.(uri("/workspace/root.json"));
    mocks.watchers[0]!.change?.(uri("/workspace/root.json"));
    mocks.watchers[0]!.change?.(uri("/workspace/legacy.csv"));
    expect(onJson).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(499);
    expect(onDiscoveryRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDiscoveryRefresh).toHaveBeenCalledTimes(1);

    mocks.watchers[1]!.change?.(uri("/workspace/src/Part.cpp"));
    mocks.watchers[1]!.change?.(uri("/workspace/src/Part.hpp"));
    vi.advanceTimersByTime(750);
    expect(onSource).toHaveBeenCalledTimes(2);
    expect(onCandidateRefresh).toHaveBeenCalledTimes(1);

    service.dispose();
    expect(mocks.watchers.every((watcher) => watcher.dispose.mock.calls.length === 1)).toBe(true);
  });
});
