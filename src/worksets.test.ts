import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  textDocuments: [] as Array<{ uri: { toString(): string }; isDirty: boolean }>,
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => undefined),
  showQuickPick: vi.fn(),
}));

vi.mock("vscode", () => {
  class Uri {
    static file(fsPath: string) { return new Uri(fsPath); }
    static joinPath(base: Uri, ...segments: string[]) {
      return new Uri([base.fsPath, ...segments].join("/").replace(/\/+/g, "/"));
    }
    static parse(value: string) { return new Uri(value.replace(/^file:\/\//, "")); }
    readonly path: string;
    constructor(readonly fsPath: string) { this.path = fsPath; }
    toString() { return `file://${this.fsPath}`; }
  }
  class FileSystemError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  }
  return {
    Uri,
    FileSystemError,
    RelativePattern: class {},
    workspace: {
      get textDocuments() { return host.textDocuments; },
      fs: {
        readFile: host.readFile,
        writeFile: host.writeFile,
      },
      findFiles: vi.fn(async () => []),
    },
    window: {
      showQuickPick: host.showQuickPick,
      showInformationMessage: vi.fn(),
    },
  };
});

import * as vscode from "vscode";
import { ktcAddResultFilesToWorkset } from "./worksets.js";

beforeEach(() => {
  host.textDocuments = [];
  host.readFile.mockClear();
  host.writeFile.mockClear();
  host.showQuickPick.mockClear();
});

describe("workspace workset Host safety", () => {
  it("rejects a dirty worksets buffer before reading or parsing stale disk content", async () => {
    const root = vscode.Uri.file("/workspace");
    const worksets = vscode.Uri.joinPath(root, ".phoenix", "worksets.json");
    host.textDocuments = [{ uri: worksets, isDirty: true }];

    await expect(ktcAddResultFilesToWorkset(root, ["src/Part.cpp"], "搜索结果"))
      .rejects.toThrow("有未保存修改");
    expect(host.readFile).not.toHaveBeenCalled();
    expect(host.writeFile).not.toHaveBeenCalled();
    expect(host.showQuickPick).not.toHaveBeenCalled();
  });
});
