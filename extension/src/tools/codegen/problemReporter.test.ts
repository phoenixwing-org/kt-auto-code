import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => {
  const collection = {
    clear: vi.fn(),
    set: vi.fn(),
    dispose: vi.fn(),
  };
  const decoration = { dispose: vi.fn() };
  return {
    collection,
    decoration,
    createDiagnosticCollection: vi.fn(() => collection),
    createTextEditorDecorationType: vi.fn(() => decoration),
    onDidChangeActiveTextEditor: vi.fn(),
    openTextDocument: vi.fn(),
    showTextDocument: vi.fn(),
  };
});

vi.mock("vscode", () => {
  class Uri {
    static file(fsPath: string) { return new Uri(fsPath); }
    static parse(value: string) { return new Uri(value.replace(/^file:\/\//, "")); }
    readonly scheme = "file";
    readonly path: string;
    constructor(readonly fsPath: string) { this.path = fsPath; }
    toString() { return `file://${this.fsPath}`; }
  }
  class Position {
    constructor(readonly line: number, readonly character: number) {}
  }
  class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(startLine: number | Position, startCharacter: number | Position, endLine?: number, endCharacter?: number) {
      if (startLine instanceof Position && startCharacter instanceof Position) {
        this.start = startLine;
        this.end = startCharacter;
      } else {
        this.start = new Position(startLine as number, startCharacter as number);
        this.end = new Position(endLine as number, endCharacter as number);
      }
    }
  }
  class Diagnostic {
    code: unknown;
    source: string | undefined;
    constructor(
      readonly range: Range,
      readonly message: string,
      readonly severity: number,
    ) {}
  }
  return {
    Uri,
    Position,
    Range,
    Diagnostic,
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    OverviewRulerLane: { Center: 2 },
    TextEditorRevealType: { InCenterIfOutsideViewport: 1 },
    ViewColumn: { Active: 1 },
    ThemeColor: class ThemeColor { constructor(readonly id: string) {} },
    languages: { createDiagnosticCollection: host.createDiagnosticCollection },
    workspace: { openTextDocument: host.openTextDocument },
    window: {
      activeTextEditor: undefined,
      createTextEditorDecorationType: host.createTextEditorDecorationType,
      onDidChangeActiveTextEditor: host.onDidChangeActiveTextEditor,
      showTextDocument: host.showTextDocument,
    },
  };
});

import * as vscode from "vscode";
import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";
import { KtcCodegenProblemReporter } from "./problemReporter.js";

function document(path: string, lines = ["zero", "one", "two"]): vscode.TextDocument {
  return {
    uri: vscode.Uri.file(path),
    lineCount: lines.length,
    lineAt(line: number) {
      return {
        text: lines[line] ?? "",
        range: new vscode.Range(line, 0, line, (lines[line] ?? "").length),
      };
    },
  } as vscode.TextDocument;
}

function editor(doc: vscode.TextDocument): vscode.TextEditor {
  return {
    document: doc,
    setDecorations: vi.fn(),
    revealRange: vi.fn(),
  } as unknown as vscode.TextEditor;
}

describe("KtcCodegenProblemReporter", () => {
  let activeEditorListener: ((editor: vscode.TextEditor | undefined) => void) | undefined;

  beforeEach(() => {
    for (const value of Object.values(host)) {
      if (typeof value === "function" && "mockClear" in value) value.mockClear();
    }
    host.collection.clear.mockClear();
    host.collection.set.mockClear();
    host.collection.dispose.mockClear();
    host.decoration.dispose.mockClear();
    host.onDidChangeActiveTextEditor.mockImplementation((listener) => {
      activeEditorListener = listener;
      return { dispose: vi.fn() };
    });
  });

  it("每份 JSON 独立缓存问题，切换活动会话时只发布该页诊断", () => {
    const reporter = new KtcCodegenProblemReporter();
    reporter.publish("json:A", "/workspace/A.json", [({
      code: "marker.missing-end",
      severity: "error",
      message: "A missing",
      path: { source: "source", file: "/workspace/a.cpp", row: 8, column: 2 },
      marker: { blockKey: "CMD AGENT CONSTRUCTOR" },
    } as KtCodegenDiagnostic & { readonly marker: { readonly blockKey: string } })]);
    reporter.publish("json:B", "/workspace/B.json", [{
      code: "marker.warning",
      severity: "warning",
      message: "B warning",
      path: { source: "source", file: "/workspace/b.cpp", row: 3, column: 1 },
    }]);
    expect(host.collection.set).not.toHaveBeenCalled();

    reporter.activate("json:A");
    expect(host.collection.clear).toHaveBeenCalledTimes(1);
    expect(host.collection.set).toHaveBeenCalledTimes(1);
    expect(host.collection.set.mock.calls[0]?.[0].fsPath).toBe("/workspace/a.cpp");
    expect(host.collection.set.mock.calls[0]?.[1][0]).toMatchObject({
      code: "marker.missing-end",
      source: "KT Auto Code",
      severity: 0,
      message: "[KT Auto Code] #23 CMD AGENT CONSTRUCTOR · marker.missing-end：A missing",
    });

    host.collection.set.mockClear();
    reporter.activate("json:B");
    expect(host.collection.set).toHaveBeenCalledTimes(1);
    expect(host.collection.set.mock.calls[0]?.[0].fsPath).toBe("/workspace/b.cpp");
    expect(host.collection.set.mock.calls[0]?.[1][0]).toMatchObject({
      code: "marker.warning",
      severity: 1,
      message: "[KT Auto Code] marker.warning：B warning",
    });
  });

  it("打开问题时使用当前编辑区、夹取位置并施加黄色整行装饰", async () => {
    const doc = document("/workspace/a.cpp");
    const textEditor = editor(doc);
    host.openTextDocument.mockResolvedValue(doc);
    host.showTextDocument.mockResolvedValue(textEditor);
    const reporter = new KtcCodegenProblemReporter();
    reporter.publish("json:A", "/workspace/A.json", [{
      code: "marker.missing-end",
      severity: "error",
      message: "missing",
      path: { source: "source", file: "/workspace/a.cpp", row: 99, column: 99 },
    }]);
    reporter.activate("json:A");

    await reporter.open("/workspace/a.cpp", 99, 99);
    expect(host.showTextDocument).toHaveBeenCalledWith(doc, expect.objectContaining({
      preview: true,
      viewColumn: 1,
    }));
    const selection = host.showTextDocument.mock.calls[0]?.[1].selection as vscode.Range;
    expect([selection.start.line, selection.start.character]).toEqual([2, 3]);
    expect(textEditor.revealRange).toHaveBeenCalledTimes(1);
    expect(textEditor.setDecorations).toHaveBeenCalledWith(
      host.decoration,
      [expect.objectContaining({
        hoverMessage: "[KT Auto Code] marker.missing-end：missing",
      })],
    );

    const other = editor(document("/workspace/other.cpp"));
    activeEditorListener?.(other);
    expect(textEditor.setDecorations).toHaveBeenLastCalledWith(host.decoration, []);
    expect(other.setDecorations).toHaveBeenCalledWith(host.decoration, []);
  });
});
