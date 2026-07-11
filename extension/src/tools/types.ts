import type * as vscode from "vscode";
import type {
  KtcAssociatedRelationKind,
  KtcAssociatedRulePreset,
  KtcReplacementRuleDraft,
} from "../../../src/associatedReplacementRules.js";
import type {
  KtcSearchReplaceProfile,
  KtcSearchReplaceProfileDraft,
  KtcSearchReplaceProfileSummary,
} from "../../../src/searchReplaceProfiles.js";
import type { KtcSearchReplaceRequest } from "../../../src/searchReplaceContracts.js";

/** Webview → Extension */
export type WebviewInboundMessage =
  | { type: "ready" }
  | { type: "selectTool"; toolId: string }
  | { type: "run"; toolId: string; action: string }
  | { type: "openIssue"; toolId: string; file: string; line: number }
  | { type: "openEncodingFile"; toolId: string; file: string }
  | { type: "openIgnoreFile" }
  | { type: "syncIgnoreFromGit" }
  | { type: "applyIgnorePreset"; presetId: "caa" | "cpp" | "web"; action: "append" | "remove" }
  | { type: "analyzeIgnore" }
  | { type: "saveSearchReplaceProfile"; toolId: "codeRename"; draft: KtcSearchReplaceProfileDraft }
  | { type: "loadSearchReplaceProfile"; toolId: "codeRename"; id: string }
  | {
      type: "deriveAssociatedRules";
      toolId: "codeRename";
      search: string;
      replace: string;
      sourcePrefix: string;
      targetPrefix: string;
      preset: KtcAssociatedRulePreset;
      existingRules: KtcReplacementRuleDraft[];
    }
  | {
      type: "chooseCaaRules";
      toolId: "codeRename";
      search: string;
      replace: string;
      sourcePrefix: string;
      targetPrefix: string;
      existingRules: KtcReplacementRuleDraft[];
    }
  | {
      type: "chooseAssociatedRule";
      toolId: "codeRename";
      parentRule: KtcReplacementRuleDraft;
      sourcePrefix: string;
      targetPrefix: string;
      existingRules: KtcReplacementRuleDraft[];
    }
  | {
      type: "searchReplace";
      toolId: "codeRename";
      action: "preview" | "apply";
      payload: KtcSearchReplaceRequest;
    }
  | {
      type: "createRootRenameTodo";
      toolId: "codeRename";
      currentName: string;
      suggestedName: string;
    }
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
      sidebarStyle: "ribbon" | "compact";
      searchReplaceProfiles: readonly KtcSearchReplaceProfileSummary[];
      searchReplaceProfileError?: string;
    }
  | { type: "workspace"; label: string }
  | { type: "scope"; scope: { includeHeaders: boolean; includeSource: boolean; includeMarkdown: boolean } }
  | { type: "ignoreConfig"; ignoreConfig?: IgnoreConfigSummary }
  | { type: "options"; toolId: string; options: ToolOptionsState }
  | { type: "sidebarStyle"; style: "ribbon" | "compact" }
  | {
      type: "searchReplaceProfiles";
      profiles: readonly KtcSearchReplaceProfileSummary[];
      selectedProfile?: KtcSearchReplaceProfile;
      error?: string;
    }
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
  rootRenameSuggestion?: { currentName: string; suggestedName: string };
  associatedRules?: readonly KtcReplacementRuleDraft[];
  results?: FileResultSummary[];
  encodingResults?: EncodingFileResultSummary[];
  scanned?: number;
  issueFiles?: number;
  fixedFiles?: number;
}

export interface FileResultSummary {
  file: string;
  relativePath?: string;
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
