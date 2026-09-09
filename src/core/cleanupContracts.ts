/** Serializable, Host-owned contracts shared by consumers of the Wing cleanup dialog. */
export type KtcCleanupDialogPreviewState =
  | "idle"
  | "loading"
  | "ready"
  | "executing"
  | "complete"
  | "error";

export interface KtcCleanupDialogMode {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly risk: "normal" | "high";
  readonly rulesVisible?: boolean;
}

/** Browser-safe labels shared by the Run Host projection and its Preview fixture. */
export const KTC_RUN_CLEANUP_DIALOG_MODES = [
  { id: "build", label: "删除 build 目录", description: "递归查找 build；跳过 .git 和目录链接。", risk: "high" },
  { id: "objects", label: "删除 objects 目录", description: "递归查找 objects；跳过 .git 和目录链接。", risk: "high" },
  { id: "obj", label: "删除 *.obj", description: "递归查找 .obj 文件；跳过 .git 和目录链接。", risk: "high" },
  { id: "git-untracked", label: "Git 未跟踪与忽略文件", description: "发现当前目录下的仓库，执行 clean -dfx；保留已跟踪修改、暂存区和嵌套仓库，不执行 reset。", risk: "high" },
] as const satisfies readonly KtcCleanupDialogMode[];

export interface KtcCleanupDialogTarget {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly supportedModeIds?: readonly string[];
}

/** Structural mirror of the Phoenix Wing cleanup dialog model; no Host behavior. */
export interface KtcCleanupDialogModel {
  readonly title: string;
  readonly description?: string;
  readonly modes: readonly KtcCleanupDialogMode[];
  readonly selectedModeId?: string;
  readonly targets: readonly KtcCleanupDialogTarget[];
  readonly rulesVisible: boolean;
  readonly rulesLabel: string;
  readonly rulesYaml: string;
  readonly preview: {
    readonly state: KtcCleanupDialogPreviewState;
    readonly token?: string;
    readonly summary?: string;
    readonly message?: string;
    readonly items: readonly string[];
  };
  readonly previewEnabled: boolean;
  readonly previewDisabledReason?: string;
  readonly executeEnabled: boolean;
  readonly executeDisabledReason?: string;
  readonly previewLabel: string;
  readonly executeLabel: string;
  readonly cancelLabel: string;
  /** Defaults to true; false removes only the extra checkbox, never the preview-token gate. */
  readonly requireHighRiskConfirmation?: boolean;
  readonly highRiskConfirmationLabel: string;
}

export interface KtcCleanupDialogRequest {
  readonly modeId: string;
  readonly targetIds: readonly string[];
  readonly rulesYaml: string;
}

/** Only these semantic actions cross the Host boundary; local edits stay in the component. */
export type KtcCleanupDialogHostAction =
  | { readonly kind: "preview"; readonly request: KtcCleanupDialogRequest }
  | { readonly kind: "execute"; readonly request: KtcCleanupDialogRequest; readonly previewToken: string }
  | { readonly kind: "cancel" };

/** A new openRequestId is an explicit Host request, not a replayable running-state effect. */
export interface KtcRunCleanupProjection {
  readonly sessionId: string;
  readonly revision: number;
  readonly openRequestId: number;
  readonly model: KtcCleanupDialogModel;
}
