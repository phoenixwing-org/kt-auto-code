import * as vscode from "vscode";
import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";
import {
  ktcProjectCodegenProblems,
  type KtcCodegenProblemLocation,
} from "./problemDiagnostics.js";

/** 每份 JSON 独立缓存 Problems，并给当前打开源码的诊断行加黄色背景。 */
export class KtcCodegenProblemReporter implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("kt-codegen");
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(255, 204, 0, 0.18)",
    borderWidth: "0 0 0 2px",
    borderStyle: "solid",
    borderColor: new vscode.ThemeColor("editorWarning.foreground"),
    overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.warningForeground"),
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });
  private readonly sessions = new Map<string, readonly KtcCodegenProblemLocation[]>();
  private readonly activeEditorListener: vscode.Disposable;
  private activeSession: string | undefined;
  private decoratedEditor: vscode.TextEditor | undefined;

  constructor() {
    this.activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (this.decoratedEditor && this.decoratedEditor !== editor) {
        this.decoratedEditor.setDecorations(this.decoration, []);
        this.decoratedEditor = undefined;
      }
      this.decorate(editor);
    });
  }

  publish(
    sessionUri: string,
    fallbackFile: string,
    diagnostics: readonly KtCodegenDiagnostic[],
  ): void {
    this.sessions.set(sessionUri, ktcProjectCodegenProblems(diagnostics, fallbackFile));
    if (this.activeSession === sessionUri) this.renderActive();
  }

  activate(sessionUri: string): void {
    this.activeSession = sessionUri;
    this.renderActive();
  }

  clear(sessionUri: string): void {
    this.sessions.delete(sessionUri);
    if (this.activeSession === sessionUri) this.renderActive();
  }

  async open(file: string, line: number, column = 0): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const lineIndex = Math.max(0, Math.min(document.lineCount - 1, Math.trunc(line)));
    const columnIndex = Math.max(0, Math.min(document.lineAt(lineIndex).text.length, Math.trunc(column)));
    const position = new vscode.Position(lineIndex, columnIndex);
    const editor = await vscode.window.showTextDocument(document, {
      preview: true,
      viewColumn: vscode.ViewColumn.Active,
      selection: new vscode.Range(position, position),
    });
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
    this.decorate(editor);
  }

  dispose(): void {
    this.decoratedEditor?.setDecorations(this.decoration, []);
    this.collection.dispose();
    this.decoration.dispose();
    this.activeEditorListener.dispose();
    this.sessions.clear();
    this.activeSession = undefined;
  }

  private renderActive(): void {
    this.collection.clear();
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const problem of this.activeProblems()) {
      const uri = vscode.Uri.file(problem.file);
      const key = uri.toString();
      const range = new vscode.Range(
        problem.line,
        problem.column,
        problem.line,
        problem.column + 1,
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        problem.message,
        problem.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.code = problem.code;
      diagnostic.source = "KT Codegen";
      const rows = grouped.get(key) ?? [];
      rows.push(diagnostic);
      grouped.set(key, rows);
    }
    for (const [uri, diagnostics] of grouped) {
      this.collection.set(vscode.Uri.parse(uri), diagnostics);
    }
    this.decorate(vscode.window.activeTextEditor);
  }

  private decorate(editor: vscode.TextEditor | undefined): void {
    if (!editor) return;
    const file = editor.document.uri.fsPath;
    const options = this.activeProblems()
      .filter((problem) => problem.file === file)
      .map((problem) => {
        const line = Math.max(0, Math.min(editor.document.lineCount - 1, problem.line));
        return {
          range: editor.document.lineAt(line).range,
          hoverMessage: `KT Codegen ${problem.severity}: ${problem.code} · ${problem.message}`,
        } satisfies vscode.DecorationOptions;
      });
    editor.setDecorations(this.decoration, options);
    this.decoratedEditor = editor;
  }

  private activeProblems(): readonly KtcCodegenProblemLocation[] {
    return this.activeSession ? this.sessions.get(this.activeSession) ?? [] : [];
  }
}
