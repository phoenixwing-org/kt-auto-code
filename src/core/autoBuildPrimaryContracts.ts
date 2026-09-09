import type { KtcCleanupDialogModel } from "./cleanupContracts.js";
export type {
  KtcCleanupDialogPreviewState,
  KtcCleanupDialogMode,
  KtcCleanupDialogTarget,
  KtcCleanupDialogModel,
} from "./cleanupContracts.js";

/** Serializable, Host-owned projection consumed by the AutoBuild Primary panel. */
export interface KtcAutoBuildPrimaryMetric {
  readonly label: string;
  readonly value: string;
}

export interface KtcAutoBuildPrimaryFact {
  readonly label: string;
  readonly value: string;
}

export interface KtcAutoBuildPrimaryMaintenance {
  readonly scriptStatus: string;
  readonly scriptDetail: string;
}

export interface KtcAutoBuildPrimaryRecentConfiguration {
  readonly actionId: string;
  readonly name: string;
  readonly fullPath: string;
  readonly selected: boolean;
}

export interface KtcAutoBuildPrimaryViewModel {
  readonly metrics: readonly KtcAutoBuildPrimaryMetric[];
  readonly configuration: {
    readonly name: string;
    readonly fullPath: string;
    /** True only when the Host has observed a draft newer than its saved snapshot. */
    readonly dirty: boolean;
    readonly statusLabel: string;
    readonly workingDirectoryMismatch: boolean;
    readonly workingDirectoryMismatchMessage: string;
    readonly recent: readonly KtcAutoBuildPrimaryRecentConfiguration[];
  };
  readonly parallelBuild: boolean;
  readonly cmakeBuildTypes?: readonly ("Debug" | "Release")[];
  readonly environmentLabel: string;
  readonly environment: readonly KtcAutoBuildPrimaryFact[];
  readonly maintenance: KtcAutoBuildPrimaryMaintenance;
  readonly cleanup: KtcCleanupDialogModel;
}

export interface KtcAutoBuildPrimaryPanelAction {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly tone?: "primary" | "secondary" | "danger";
  readonly disabledReason?: string;
}

/** UI-only panel contract shared by Preview fixtures and the formal Host projection. */
export interface KtcAutoBuildPrimaryPanelModel extends KtcAutoBuildPrimaryViewModel {
  readonly status: "idle" | "running" | "done" | "error";
  readonly statusText: string;
  readonly ready: boolean;
  readonly actions: readonly KtcAutoBuildPrimaryPanelAction[];
}
