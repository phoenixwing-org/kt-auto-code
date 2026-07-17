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
import type {
  KtCodegenBlockKey,
  KtCodegenLegacyBlockState,
  KtCodegenPlan,
  KtCodegenPlatform,
  KtCodegenTableData,
} from "@phoenix-wing/kt-codegen";
import type { KtcCodegenMetaField } from "./codegen/contracts.js";

export type { KtcCodegenMetaField } from "./codegen/contracts.js";

/** Webview → Extension */
export type WebviewInboundMessage =
  | { type: "ready" }
  | { type: "runModuleTool"; moduleId: KtcModuleId; command: string }
  | { type: "moduleBlockAction"; actionId: string }
  | { type: "selectTool"; toolId: string }
  | {
      type: "codegenAction";
      toolId: "codegen";
      action: "refresh" | "openJson" | "importCsv" | "openDocument" | "updateMeta"
        | "scanCandidates" | "openCandidate" | "cancelOperation" | "copyDiagnostics";
      uri?: string;
      field?: KtcCodegenMetaField;
      value?: string;
    }
  | {
      type: "codegenEditorAction";
      toolId: "codegen";
      uri: string;
      action: "ready" | "revert" | "preflight" | "cancelPreflight" | "apply";
      table?: KtCodegenTableData;
    }
  | {
      type: "codegenEditorDirty";
      toolId: "codegen";
      uri: string;
      itemCount: number;
    }
  | {
      type: "codegenEditorExchange";
      toolId: "codegen";
      uri: string;
      action: "sync" | "save";
      model: KtcCodegenEditorModel;
    }
  | {
      type: "codegenControlSelection";
      toolId: "codegen";
      uri: string;
      blockKeys: KtCodegenBlockKey[];
      singleMode: boolean;
    }
  | {
      type: "codegenControlOpen";
      toolId: "codegen";
      uri: string;
      path: string;
      line: number;
    }
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

/** Extension Host → Codegen 右侧编辑 Webview。 */
export type KtcCodegenEditorOutboundMessage =
  | { type: "codegenModel"; model: KtcCodegenEditorModel }
  | { type: "codegenControlsModel"; model: KtcCodegenControlViewModel }
  | { type: "codegenDocumentState"; dirty: boolean; externalConflict: boolean }
  | { type: "codegenPreflightState"; running: boolean }
  | {
      type: "codegenStatus";
      status: "idle" | "saving" | "saved" | "error";
      message: string;
      documentRevision?: number;
    };

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
  codegenCandidates?: KtcCodegenSourceCandidateSummary[];
  codegenOperation?: "discovery" | "candidates";
}

export interface KtcCodegenDocumentSummary {
  uri: string;
  fileName: string;
  displayPath: string;
  itemCount: number;
  className: string;
  namePrefix: string;
  nameMiddle: string;
  nameSpace: string;
  appendFunction: string;
  open: boolean;
  active: boolean;
  dirty: boolean;
  externalConflict: boolean;
  externalState: "current" | "changed" | "deleted";
  diagnosticCount: number;
}

export interface KtcCodegenEditorModel {
  uri: string;
  fileName: string;
  table: KtCodegenTableData;
  controls: KtcCodegenControlViewModel;
  dirty: boolean;
  externalConflict: boolean;
}

export interface KtcCodegenControlBlockViewModel {
  readonly key: KtCodegenBlockKey;
  readonly legacyId: number;
  readonly platform: KtCodegenPlatform;
  readonly legacyState: KtCodegenLegacyBlockState;
  readonly legacyCall: string;
  readonly title: string;
  readonly controlWords: string;
  readonly notes: string;
}

/** 当前 JSON 页面独享的控制符选择与预检缓存投影。 */
export interface KtcCodegenControlViewModel {
  readonly kind: "kt.codegen.control-view-model";
  readonly schemaVersion: 1;
  readonly uri: string;
  readonly fileName: string;
  readonly blocks: readonly KtcCodegenControlBlockViewModel[];
  readonly selectedBlockKeys: readonly KtCodegenBlockKey[];
  readonly singleSelectionMode: boolean;
  readonly presets: {
    readonly all: readonly KtCodegenBlockKey[];
    readonly none: readonly KtCodegenBlockKey[];
    readonly cppOnly: readonly KtCodegenBlockKey[];
    readonly fieldCode: readonly KtCodegenBlockKey[];
  };
  readonly preflight?: {
    readonly plan: KtCodegenPlan;
    readonly reused: boolean;
    readonly createdAt: string;
  };
}

/** 工作区级控制标记候选；不绑定某一份 Codegen JSON。 */
export interface KtcCodegenSourceCandidateSummary {
  uri: string;
  displayPath: string;
  markerCount: number;
  encoding: string;
  eol: "lf" | "crlf";
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
