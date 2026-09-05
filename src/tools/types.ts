import type * as vscode from "vscode";
import type { KtcReplacementRuleDraft } from "../core/associatedReplacementRules.js";
import type { KtcSearchReplaceRequest } from "../core/searchReplaceContracts.js";
import type { KtcRenameResultViewModel } from "../core/renameResultViewModel.js";
import type { KtcIgnoreRecommendationReport } from "../ignoreRecommendationTypes.js";
import type { KtcWorkspaceFileScopeSummary } from "../worksets.js";
import type { KtcModuleId, KtcModuleState } from "../modules/moduleState.js";
import type { KtcRibbonLayoutV1 } from "../sidebar/ribbonLayout.js";
import type { KtcModuleBlockContent } from "../core/moduleShellContract.js";
import type { KtcSearchReplaceDirectoryOption } from "../searchReplaceDirectoryOptions.js";
import type { KtcRenamePairHistoryEntry } from "../core/renameHistory.js";
import type { KtcCodegenInboundMessage } from "./codegen/editorContracts.js";
import type {
  KtcCodegenControlCatalogViewModel,
} from "./codegen/controlViewModel.js";
import type {
  KtcCodegenBatchApplyProgress,
  KtcCodegenDocumentSummary,
  KtcCodegenPrimaryViewModel,
  KtcCodegenSourceCandidateSummary,
} from "./codegen/primaryViewModel.js";
import type { KtcRunViewModel } from "../core/run/KtcRunModel.js";
import type { KtcGitViewModel } from "../core/git/KtcGitModel.js";
import type { PnwCodeUuidFileResultRow } from "@phoenix-wing/code-core/ui/model";

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
  KtcCodegenBatchApplyProgress,
  KtcCodegenDocumentSummary,
  KtcCodegenPrimaryViewModel,
  KtcCodegenSourceCandidateSummary,
} from "./codegen/primaryViewModel.js";

/** Webview → Extension */
export type WebviewInboundMessage =
  | { type: "ready" }
  | {
      type: "welcomeAction";
      action: "openRepository" | "openInstallGuide" | "openQuickStart" | "openSettings" | "openDiagnostics";
    }
  | {
      type: "welcomeAction";
      action: "installExtension";
      extensionId: "kuntai.kt-auto-code" | "kuntai.kt-auto-cad";
    }
  | { type: "runModuleTool"; moduleId: KtcModuleId; command: string }
  | { type: "moduleBlockAction"; actionId: string }
  | { type: "selectTool"; toolId: string }
  | { type: "openCodeAssistantFeature"; feature: "packageIncludes" | "autoBuild" }
  | { type: "setCodeAssistantTreeUiState"; state: KtcCodeAssistantTreeUiState }
  | { type: "closeToolBlock" }
  | {
      type: "runAction";
      toolId: "run";
      action: "refresh" | "openOutput" | "openProblems" | "openTerminal" | "runTarget" | "dryRunTarget" | "stopRun" | "setCaaVersion" | "openSource";
      targetId?: string;
      runId?: string;
      projectId?: string;
      value?: string;
    }
  | {
      type: "gitAction";
      toolId: "git";
      action:
        | "refresh"
        | "openScm"
        | "openOutput"
        | "selectRepository"
        | "switchBranch"
        | "openAction"
        | "selectCommit"
        | "copySummary"
        | "closeSummary"
        | "cancelSquash"
        | "executeSquash"
        | "undoSquash";
      actionId?: string;
      repositoryId?: string;
      oid?: string;
      text?: string;
      expectedHeadOid?: string;
      selectedOids?: readonly string[];
      message?: string;
      author?: { readonly name: string; readonly email: string; readonly date: string };
      committer?: { readonly name: string; readonly email: string; readonly date: string };
    }
  | KtcCodegenInboundMessage
  | { type: "selectWorkspaceFileScope"; toolId: string; scopeId: string }
  | { type: "openWorkspaceWorksets" }
  | { type: "toggleRibbonModule"; moduleId: KtcModuleId }
  | { type: "toggleRibbonDensity" }
  | { type: "toggleRibbonToolPin"; toolId: string }
  | { type: "resetCodeRibbonLayout" }
  | { type: "moveRibbonTool"; toolId: string; targetToolId: string; placement: "before" | "after" }
  | { type: "selectWorkingDirectory"; directory: string }
  | { type: "pickWorkingDirectory" }
  | { type: "setPluginIgnoreEnabled"; enabled: boolean }
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
  | { type: "clearReorderMembersSession"; toolId: "reorderMembers" }
  | {
      type: "closeCodeAssistantFeature";
      toolId: "reorderMembers" | "headerAscii" | "encodingFix" | "uuidReplace" | "caaDialog";
    }
  | { type: "openIssue"; toolId: string; file: string; line: number }
  | { type: "openEncodingFile"; toolId: string; file: string }
  | { type: "setEncodingDefaultTarget"; toolId: "encodingFix"; target: "utf8" | "gbk" }
  | { type: "openEncodingSettings"; toolId: "encodingFix" }
  | { type: "openIgnoreFile" }
  | { type: "syncIgnoreFromGit" }
  | { type: "applyIgnorePreset"; presetId: "caa" | "cpp" | "web"; action: "append" | "remove" }
  | { type: "analyzeIgnore" }
  | { type: "pickSearchReplaceDirectory"; toolId: "codeRename" }
  | { type: "rememberSearchReplaceDirectory"; toolId: "codeRename"; directory: string }
  | {
      type: "openProjectRenameAnalysis";
      toolId: "codeRename";
      scope?: string;
      sourceName: string;
      targetName: string;
      rules?: readonly KtcReplacementRuleDraft[];
    }
  | { type: "deleteRenameHistoryPair"; toolId: "codeRename"; source: string; target: string }
  | { type: "clearRenameHistoryPairs"; toolId: "codeRename" }
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
  | { type: "environmentAction"; toolId: "environmentSettings"; action: "clear"; key: ProjectEnvironmentValueSummary["key"] }
  | { type: "environmentAction"; toolId: "environmentSettings"; action: "pick"; key: ProjectEnvironmentValueSummary["key"]; value?: string }
  | { type: "setOption"; toolId: string; key: "preserveGbk" | "stripBom" | "includeHeaders" | "includeSource" | "includeMarkdown"; value: boolean };

/** Extension → Webview */
export type WebviewOutboundMessage =
  | {
      type: "init";
      tools: ToolSummary[];
      activeToolId: string;
      openToolIds: readonly string[];
      codeAssistantFeature?: KtcCodeAssistantFeatureId;
      codeAssistantTreeUiState: KtcCodeAssistantTreeUiState;
      workspaceLabel: string;
      scope: { includeHeaders: boolean; includeSource: boolean; includeMarkdown: boolean };
      ignoreConfig?: IgnoreConfigSummary;
      toolOptions: Record<string, ToolOptionsState>;
      sidebarStyle: "ribbon" | "compact";
      ribbonLayout: KtcRibbonLayoutV1;
      workingContext: KtcWorkingContext;
      presentation: "ribbon" | "detailBlock";
      recentWorkingDirectories: KtcRecentWorkingDirectories;
      workspaceFileScopes: readonly KtcWorkspaceFileScopeSummary[];
      selectedWorkspaceFileScopes: Record<string, string>;
      workspaceFileScopeError?: string;
      moduleState: KtcModuleState;
      extensionInstallations: readonly KtcWelcomeExtensionSummary[];
    }
  | { type: "workspace"; label: string }
  | { type: "scope"; scope: { includeHeaders: boolean; includeSource: boolean; includeMarkdown: boolean } }
  | { type: "ignoreConfig"; ignoreConfig?: IgnoreConfigSummary }
  | { type: "options"; toolId: string; options: ToolOptionsState }
  | { type: "sidebarStyle"; style: "ribbon" | "compact" }
  | { type: "ribbonLayout"; layout: KtcRibbonLayoutV1 }
  | { type: "openRibbonCustomization" }
  | { type: "workingContext"; context: KtcWorkingContext; directories: KtcRecentWorkingDirectories }
  | {
      type: "openTools";
      activeToolId: string;
      openToolIds: readonly string[];
      codeAssistantFeature?: KtcCodeAssistantFeatureId;
    }
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
  | { type: "state"; toolId: string; state: ToolUiState };

export type KtcCodeAssistantFeatureId =
  | "packageIncludes"
  | "autoBuild"
  | "reorderMembers"
  | "headerAscii"
  | "encodingFix"
  | "uuidReplace"
  | "caaDialog";

/** 用户级 Tree 展开状态；不属于任何工作区的工程配置。 */
export interface KtcCodeAssistantTreeUiState {
  /** 整个功能目录的用户级展开状态；不影响已打开的功能会话。 */
  treeExpanded: boolean;
  cppOrganizeExpanded: boolean;
  fileToolsExpanded: boolean;
  caaExpanded: boolean;
  reorderActionsExpanded: boolean;
  reorderResultsExpanded: boolean;
}

export interface ToolOptionsState {
  preserveGbk?: boolean;
  stripBom?: boolean;
  encodingDefaultTarget?: "utf8" | "gbk";
  encodingHeaderTarget?: "inherit" | "ascii" | "utf8" | "gbk";
  encodingSourceTarget?: "inherit" | "ascii" | "utf8" | "gbk";
  encodingMarkdownTarget?: "inherit" | "ascii" | "utf8" | "gbk";
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
  /** False keeps a runnable tool out of the first-level Ribbon and its overflow menu. */
  ribbonVisible?: boolean;
  moduleId?: KtcModuleId;
  moduleTitle?: string;
  command?: string;
  shortTitle?: string;
}

export interface KtcRecentWorkingDirectories {
  workspace: readonly string[];
  external: readonly string[];
  options: readonly KtcSearchReplaceDirectoryOption[];
}

export interface KtcWorkingContext {
  /** 空字符串表示当前 VS Code 工作区首个根目录；相对值以该根目录解析。 */
  selectedDirectory: string;
  resolvedDirectory?: string;
  label: string;
  pluginIgnoreEnabled: boolean;
  gitIgnoreExists: boolean;
}

export interface KtcWelcomeExtensionSummary {
  id: "kuntai.kt-auto-code" | "kuntai.kt-auto-cad";
  title: "KT Auto Code" | "KT Auto CAD";
  moduleId: "code" | "cad";
  installed: boolean;
  version?: string;
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
  summary?: string;
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
  renameHistory?: readonly KtcRenamePairHistoryEntry[];
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
  pluginSettingValues?: KtcPluginSettingValueSummary[];
  codegen?: KtcCodegenPrimaryViewModel;
  run?: KtcRunViewModel;
  git?: KtcGitViewModel;
}

export interface KtcPluginSettingValueSummary {
  label: "CAA Version" | "CAA Rade Root" | "CATIA Root" | "CAA Runtime Directory";
  value: string;
  source: "用户设置" | "环境" | "默认推导" | "内置固定";
}

export interface ProjectEnvironmentValueSummary {
  key: "customRoot" | "sdkPrefix" | "coreRoot" | "includeRoot" | "thirdPartyRoot" | "caaMkVersion";
  environmentVariable: "ROOT_DIR" | "SDK_PREFIX" | "ROOT_DIR_CORE" | "ROOT_DIR_INCLUDE" | "ROOT_DIR_3rdParty" | "CAA_MK_VERSION";
  required: boolean;
  source: "system" | "default" | "missing";
  value?: string;
  suggestedValue?: string;
  pathExists?: boolean;
}

export type UuidFileResultSummary = PnwCodeUuidFileResultRow;

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
  pluginIgnoreEnabled: boolean;
  postState: (state: ToolUiState) => void;
  log: (text: string) => void;
}

export interface KtTool {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  /** Tool remains command-addressable but is surfaced from a parent feature tree. */
  readonly ribbonVisible?: boolean;
  /** Explicit Webview `run` actions; absent means that `run` signals are rejected and logged. */
  readonly runActions?: readonly string[];
  registerCommands(context: vscode.ExtensionContext): void;
  onDidShow?(ctx: ToolRunContext): Promise<void> | void;
  getPanelModel(): ToolPanelModel;
  handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void>;
  runAction(action: string, ctx: ToolRunContext): Promise<void>;
  /** Releases transient preview/results when a nested Code Assistant leaf is explicitly closed. */
  clearSession?(ctx: ToolRunContext): Promise<void> | void;
}
