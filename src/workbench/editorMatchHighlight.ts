import * as vscode from "vscode";
import { ktcFindIssueLineHighlightOffsets, ktcFindLiteralHighlightOffsets } from "../core/editorMatchHighlights.js";
import type { FileResultSummary } from "../tools/types.js";

let decoration: vscode.TextEditorDecorationType | undefined;
let previousEditor: vscode.TextEditor | undefined;

export function ktcRegisterEditorMatchHighlight(context: vscode.ExtensionContext): void {
  if (decoration) return;
  decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 204, 0, 0.34)",
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editorWarning.foreground"),
    overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.warningForeground"),
    overviewRulerLane: vscode.OverviewRulerLane.Center,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  context.subscriptions.push(decoration, vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!decoration || !previousEditor || editor === previousEditor) return;
    previousEditor.setDecorations(decoration, []);
    previousEditor = undefined;
  }), {
    dispose: () => {
      previousEditor = undefined;
      decoration = undefined;
    },
  });
}

function setHighlights(
  editor: vscode.TextEditor,
  options: readonly vscode.DecorationOptions[],
): void {
  if (!decoration) return;
  if (previousEditor && previousEditor !== editor) previousEditor.setDecorations(decoration, []);
  editor.setDecorations(decoration, options);
  previousEditor = editor;
}

export function ktcHighlightLiteralMatches(
  editor: vscode.TextEditor,
  terms: readonly string[],
): void {
  const options = ktcFindLiteralHighlightOffsets(editor.document.getText(), terms).map(({ start, end }) => ({
    range: new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end)),
    hoverMessage: "KT Auto Code：搜索替换命中",
  }));
  setHighlights(editor, options);
}

export function ktcHighlightHeaderIssues(
  editor: vscode.TextEditor,
  issues: readonly FileResultSummary["issues"][number][],
  preferNonAscii = false,
): void {
  const options: vscode.DecorationOptions[] = [];
  const byLine = new Map<number, FileResultSummary["issues"][number][]>();
  for (const issue of issues) {
    const lineIndex = Math.max(0, Math.min(editor.document.lineCount - 1, issue.line - 1));
    const group = byLine.get(lineIndex) ?? [];
    group.push(issue);
    byLine.set(lineIndex, group);
  }
  for (const [lineIndex, lineIssues] of byLine) {
    const line = editor.document.lineAt(lineIndex);
    const ranges = ktcFindIssueLineHighlightOffsets(line.text, lineIssues.map((issue) => issue.column), preferNonAscii);
    for (const range of ranges) {
      options.push({
        range: new vscode.Range(lineIndex, range.start, lineIndex, range.end),
        hoverMessage: preferNonAscii
          ? "KT Auto Code：非 ASCII 文本"
          : `KT Auto Code：${lineIssues[0]?.fromLabel ?? "问题字符"} → ${lineIssues[0]?.toLabel ?? "请检查"}`,
      });
    }
  }
  setHighlights(editor, options);
}

export function ktcClearEditorMatchHighlights(editor?: vscode.TextEditor): void {
  if (!decoration) return;
  if (previousEditor) previousEditor.setDecorations(decoration, []);
  if (editor && editor !== previousEditor) editor.setDecorations(decoration, []);
  previousEditor = undefined;
}
