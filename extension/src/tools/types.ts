import type * as vscode from "vscode";

/** Webview → Extension */
export type WebviewInboundMessage =
  | { type: "ready" }
  | { type: "selectTool"; toolId: string }
  | { type: "run"; toolId: string; action: string }
  | { type: "openIssue"; toolId: string; file: string; line: number }
  | { type: "openEncodingFile"; toolId: string; file: string }
  | { type: "openIgnoreFile" }
  | { type: "syncIgnoreFromGit" }
  | { type: "setOption"; toolId: string; key: "preserveGbk" | "stripBom" | "includeHeaders" | "includeSource" | "includeMarkdown"; value: boolean };

/** Extension → Webview */
export type WebviewOutboundMessage =
  | {
      type: "init";
      tools: ToolSummary[];
      activeToolId: string;
      workspaceLabel: string;
      scope: { includeHeaders: boolean; includeSource: boolean; includeMarkdown: boolean };
      ignoreConfig?: IgnoreConfigSummary;
      toolOptions: Record<string, ToolOptionsState>;
    }
  | { type: "workspace"; label: string }
  | { type: "scope"; scope: { includeHeaders: boolean; includeSource: boolean; includeMarkdown: boolean } }
  | { type: "ignoreConfig"; ignoreConfig?: IgnoreConfigSummary }
  | { type: "options"; toolId: string; options: ToolOptionsState }
  | { type: "state"; toolId: string; state: ToolUiState };

export interface ToolOptionsState {
  preserveGbk?: boolean;
  stripBom?: boolean;
}

export interface IgnoreConfigSummary {
  relativePath: string;
  fullPath: string;
  patternCount: number;
  gitIgnoreExists: boolean;
  statusText: string;
}

export interface ToolSummary {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

export interface EncodingFileResultSummary {
  file: string;
  relativePath: string;
  fullPath: string;
  detected: string;
  expected: string;
  status: string;
  suggestedAction: string;
  detail?: string;
  converted?: boolean;
}

export interface ToolUiState {
  status: "idle" | "running" | "done" | "error";
  message?: string;
  results?: FileResultSummary[];
  encodingResults?: EncodingFileResultSummary[];
  scanned?: number;
  issueFiles?: number;
  fixedFiles?: number;
}

export interface FileResultSummary {
  file: string;
  fullPath: string;
  issueCount: number;
  topLine: number;
  issues: Array<{
    line: number;
    column: number;
    byte: number;
    kind: string;
    fromLabel: string;
    toLabel: string;
    suggestedAscii?: string;
    context: string;
  }>;
}

export interface ToolPanelModel {
  summary: ToolSummary;
}

export interface ToolRunContext {
  workspaceRoot: string | undefined;
  workspaceLabel: string;
  postState: (state: ToolUiState) => void;
  log: (text: string) => void;
}

export interface KtTool {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  registerCommands(context: vscode.ExtensionContext): void;
  getPanelModel(): ToolPanelModel;
  handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void>;
  runAction(action: string, ctx: ToolRunContext): Promise<void>;
}
