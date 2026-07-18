import type * as vscode from "vscode";
import type { KtcReplacementRuleDraft } from "../../../src/associatedReplacementRules.js";
import type {
  KtcSearchReplaceProfile,
  KtcSearchReplaceProfileDraft,
  KtcSearchReplaceProfileSummary,
} from "../../../src/searchReplaceProfiles.js";
import type { KtcSearchReplaceRequest } from "../../../src/searchReplaceContracts.js";
import type { KtcRenameResultViewModel } from "../../../src/renameResultViewModel.js";
import type { KtcIgnoreRecommendationReport } from "../ignoreRecommendationTypes.js";
import type { KtcWorkspaceFileScopeSummary } from "../worksets.js";
import type { KtcModuleId, KtcModuleState } from "../modules/moduleState.js";
import type { KtcModuleBlockContent } from "../../../src/moduleShellContract.js";
import type { KtcCodegenInboundMessage } from "./codegen/editorContracts.js";
import type {
  KtcCodegenControlCatalogViewModel,
} from "./codegen/controlViewModel.js";
import type {
  KtcCodegenDocumentSummary,
  KtcCodegenSourceCandidateSummary,
} from "./codegen/primaryViewModel.js";

export type { KtcCodegenMetaField } from "./codegen/contracts.js";
export type {
  KtcCodegenControlMessage,
  KtcCodegenEditorInboundMessage,
  KtcCodegenEditorModel,
  KtcCodegenEditorOutboundMessage,
  KtcCodegenInboundMessage,
  KtcCodegenSidebarActionMessage,
} from "./codegen/editorContracts.js";
export type {
  KtcCodegenControlBlockViewModel,
  KtcCodegenControlCatalogViewModel,
  KtcCodegenControlViewModel,
} from "./codegen/controlViewModel.js";
export type {
  KtcCodegenDocumentSummary,
  KtcCodegenPrimaryViewModel,
  KtcCodegenSourceCandidateSummary,
} from "./codegen/primaryViewModel.js";

/** Webview → Extension */
export type WebviewInboundMessage =
  | { type: "ready" }
  | { type: "runModuleTool"; moduleId: KtcModuleId; command: string }
  | { type: "moduleBlockAction"; actionId: string }
  | { type: "selectTool"; toolId: string }
  | KtcCodegenInboundMessage
  | { type: "selectWorkspaceFileScope"; toolId: string; scopeId: string }
  | { type: "openWorkspaceWorksets" }
  | {
      type: "run";
      toolId: string;
      action: string;
      uuidStrategy?: "map_per_value" | "fresh_per_hit";
    }
  | {
      type: "reorderAction";
      toolId: "reorderMembers";
      action: "open" | "preview" | "apply" | "cancel" | "gitDiff" | "revert";
      uris: string[];
    }
  | { type: "reorderSelection"; toolId: "reorderMembers"; uris: string[] }
  | { type: "openIssue"; toolId: string; file: string; line: number }
  | { type: "openEncodingFile"; toolId: string; file: string }
  | { type: "openIgnoreFile" }
  | { type: "syncIgnoreFromGit" }
  | { type: "applyIgnorePreset"; presetId: "caa" | "cpp" | "web"; action: "append" | "remove" }
  | { type: "analyzeIgnore" }
  | { type: "pickSearchReplaceDirectory"; toolId: "codeRename" }
  | { type: "rememberSearchReplaceDirectory"; toolId: "codeRename"; directory: string }
  | { type: "saveSearchReplaceProfile"; toolId: "codeRename"; label: string; draft: KtcSearchReplaceProfileDraft }
  | { type: "loadSearchReplaceProfile"; toolId: "codeRename"; id: string }
  | {
      type: "requestAssociatedRuleCandidates";
      toolId: "codeRename";
      mode: KtcAssociatedRulePickerMode;
      search: string;
      replace: string;
      sourcePrefix: string;
      targetPrefix: string;
      parentRule?: KtcReplacementRuleDraft;
      existingRules: KtcReplacementRuleDraft[];
    }
  | {
      type: "appendAssociatedRules";
      toolId: "codeRename";
      primarySearch: string;
      rules: KtcReplacementRuleDraft[];
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
  | { type: "codeRenameAction"; toolId: "codeRename"; action: "open"; rowId: string }
  | { type: "caaDialogAction"; toolId: "caaDialog"; action: "open" | "openExternal"; uri: string }
  | { type: "uuidAction"; toolId: "uuidReplace"; action: "open" | "apply" | "cancel" | "gitDiff"; uris: string[] }
  | { type: "uuidSelection"; toolId: "uuidReplace"; uris: string[] }
  | { type: "ignoreSelection"; toolId: "ignoreSettings"; groupIds: string[] }
  | { type: "applyIgnoreRecommendations"; groupIds: string[] }
  | { type: "environmentAction"; toolId: "environmentSettings"; action: "refresh" | "openSystemSettings" | "openPluginSettings" }
  | { type: "environmentAction"; toolId: "environmentSettings"; action: "set"; key: ProjectEnvironmentValueSummary["key"]; value: string }
  | { type: "environmentAction"; toolId: "environmentSettings"; action: "clear" | "pick"; key: ProjectEnvironmentValueSummary["key"] }
  | { type: "setOption"; toolId: string; key: "preserveGbk" | "stripBom" | "includeHeaders" | "includeSource" | "includeMarkdown"; value: boolean };

/** Extension → Webview */
export type WebviewOutboundMessage =
  | {
      type: "init";
      tools: ToolSummary[];
      activeToolId: string;
      openToolIds: readonly string[];
      workspaceLabel: string;
      scope: { includeHeaders: boolean; includeSource: boolean; includeMarkdown: boolean };
      ignoreConfig?: IgnoreConfigSummary;
      toolOptions: Record<string, ToolOptionsState>;
      sidebarStyle: "ribbon" | "compact";
      presentation: "ribbon" | "detailBlock";
      recentWorkingDirectories: KtcRecentWorkingDirectories;
      searchReplaceProfiles: readonly KtcSearchReplaceProfileSummary[];
      searchReplaceProfileError?: string;
      workspaceFileScopes: readonly KtcWorkspaceFileScopeSummary[];
      selectedWorkspaceFileScopes: Record<string, string>;
      workspaceFileScopeError?: string;
      moduleState: KtcModuleState;
    }
  | { type: "workspace"; label: string }
  | { type: "scope"; scope: { includeHeaders: boolean; includeSource: boolean; includeMarkdown: boolean } }
  | { type: "ignoreConfig"; ignoreConfig?: IgnoreConfigSummary }
  | { type: "options"; toolId: string; options: ToolOptionsState }
  | { type: "sidebarStyle"; style: "ribbon" | "compact" }
  | { type: "openTools"; activeToolId: string; openToolIds: readonly string[] }
  | { type: "modules"; moduleState: KtcModuleState }
  | { type: "moduleBlock"; moduleId: KtcModuleId; content?: KtcModuleBlockContent }
  | {
      type: "workspaceFileScopes";
      scopes: readonly KtcWorkspaceFileScopeSummary[];
      selected: Record<string, string>;
      error?: string;
    }
  | { type: "requestSearchReplacePreview" }
  | { type: "recentWorkingDirectories"; directories: KtcRecentWorkingDirectories; selected?: string }
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
  moduleId?: KtcModuleId;
  moduleTitle?: string;
  command?: string;
  shortTitle?: string;
}

export interface KtcRecentWorkingDirectories {
  workspace: readonly string[];
  external: readonly string[];
}

export type KtcAssociatedRulePickerMode = "custom" | "common" | "caa" | "row";

export interface KtcAssociatedRulePickerCandidate {
  id: string;
  label: string;
  rule: KtcReplacementRuleDraft;
  checked: boolean;
}

export interface KtcAssociatedRulePickerState {
  title: string;
  candidates: readonly KtcAssociatedRulePickerCandidate[];
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
  associatedRulePicker?: KtcAssociatedRulePickerState;
  results?: FileResultSummary[];
  encodingResults?: EncodingFileResultSummary[];
  scanned?: number;
  issueFiles?: number;
  fixedFiles?: number;
  reorderResults?: ReorderFileResultSummary[];
  reorderRevision?: number;
  reorderScopeLabel?: string;
  reorderSelectedUris?: string[];
  codeRenameResults?: KtcRenameResultViewModel;
  caaDialogResults?: CaaDialogFileResultSummary[];
  caaSettingsText?: string;
  caaDeskConnection?: {
    status: "checking" | "online" | "offline" | "incompatible" | "custom-command";
    text: string;
    endpoint?: string;
    checkedAt: string;
  };
  ignoreRecommendations?: KtcIgnoreRecommendationReport;
  ignoreSelectedGroupIds?: string[];
  uuidResults?: UuidFileResultSummary[];
  uuidRevision?: number;
  uuidStrategy?: "map_per_value" | "fresh_per_hit";
  uuidSelectedUris?: string[];
  environmentValues?: ProjectEnvironmentValueSummary[];
  codegenDocuments?: KtcCodegenDocumentSummary[];
  codegenActiveUri?: string;
  codegenControls?: KtcCodegenControlCatalogViewModel;
  codegenCandidates?: KtcCodegenSourceCandidateSummary[];
  codegenOperation?: "discovery" | "candidates";
}

export interface ProjectEnvironmentValueSummary {
  key: "customRoot" | "thirdPartyRoot" | "coreRoot" | "caaMkVersion";
  environmentVariable: "ROOT_DIR" | "ROOT_DIR_3rdParty" | "ROOT_DIR_CORE" | "CAA_MK_VERSION";
  required: boolean;
  source: "system" | "missing";
  value?: string;
  suggestedValue?: string;
  pathExists?: boolean;
}

export interface UuidFileResultSummary {
  uri: string;
  relativePath: string;
  encoding: string;
  hitCount: number;
  firstLine: number;
  state: "pending" | "cancelled" | "applied" | "blocked";
  hasApplied: boolean;
  warnings: readonly string[];
  mappings: readonly { line: number; column: number; from: string; to: string }[];
}

export interface CaaDialogFileResultSummary {
  uri: string;
  relativePath: string;
  selected: boolean;
}

export interface ReorderFileResultSummary {
  uri: string;
  relativePath: string;
  kind: "header" | "source";
  encoding: string;
  changed: boolean;
  state: "unchanged" | "pending" | "cancelled" | "applied" | "blocked" | "reverted";
  warnings: readonly string[];
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
  workspaceFileScopeId: string;
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
