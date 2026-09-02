import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeCommand, uriFrom } = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  uriFrom: vi.fn((parts: { scheme: string; path: string }) => ({
    ...parts,
    toString: () => `${parts.scheme}:${parts.path}`,
  })),
}));

vi.mock("vscode", () => ({
  commands: { executeCommand },
  Uri: { from: uriFrom },
}));

import { KtcProjectRenameDiffDocumentProvider } from "./diffDocumentProvider.js";

describe("project rename diff document provider", () => {
  beforeEach(() => {
    executeCommand.mockReset();
    uriFrom.mockClear();
  });

  it("把冻结原文和计划文本交给 VS Code 原生 diff，不写磁盘", async () => {
    const provider = new KtcProjectRenameDiffDocumentProvider();
    await provider.show({
      reportId: 7,
      rowId: "text:src/index.ts",
      relativePath: "src/index.ts",
      originalText: "OldName\n",
      targetText: "NewName\n",
    });

    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.diff",
      expect.objectContaining({ scheme: "kt-auto-code-project-rename-preview" }),
      expect.objectContaining({ scheme: "kt-auto-code-project-rename-preview" }),
      "项目改名预览：src/index.ts",
      { preview: true },
    );
    const [, originalUri, targetUri] = executeCommand.mock.calls[0]!;
    expect(provider.provideTextDocumentContent(originalUri)).toBe("OldName\n");
    expect(provider.provideTextDocumentContent(targetUri)).toBe("NewName\n");
  });
});
