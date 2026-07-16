/** Data-only contract shared by the base extension and optional module extensions. */
export type KtcModuleId = string;

export interface KtcPersistedModuleState {
  readonly known?: readonly KtcModuleId[];
  readonly enabled?: readonly KtcModuleId[];
  readonly active?: KtcModuleId;
}

export interface KtcModuleState {
  readonly installed: readonly KtcModuleId[];
  readonly enabled: readonly KtcModuleId[];
  readonly visible: readonly KtcModuleId[];
  readonly known: readonly KtcModuleId[];
  readonly active: KtcModuleId;
}

export interface KtcToolBlockState {
  readonly openToolIds: readonly string[];
  readonly activeModuleId?: KtcModuleId;
  readonly activeToolId?: string;
}

export interface KtcModuleBlockContent {
  readonly title: string;
  readonly description?: string;
  readonly status?: string;
  readonly statusKind?: "default" | "success" | "warning";
  readonly headerActions?: readonly {
    readonly id: string;
    readonly title: string;
    readonly icon?: string;
  }[];
  /** Trusted HTML fragment rendered inside the Shell-owned Block container. */
  readonly html: string;
}

export interface KtcModuleBlockProvider {
  render(toolId: string): KtcModuleBlockContent | Promise<KtcModuleBlockContent>;
  handleAction?(toolId: string, actionId: string): void | Promise<void>;
}

export interface KtcModuleBlockRegistration {
  dispose(): void;
}

/**
 * Shell API v2 owns module visibility, activation and logical Block history.
 * Optional modules own their commands and detail View rendering.
 */
export interface KtcAutoCodeShellApiV2 {
  readonly version: 2;
  getModuleState(): KtcModuleState;
  activateModule(moduleId: KtcModuleId): Promise<boolean>;
  toggleModule(moduleId: KtcModuleId): Promise<boolean>;
  registerModuleBlockProvider(
    moduleId: KtcModuleId,
    provider: KtcModuleBlockProvider,
  ): KtcModuleBlockRegistration;
  refreshModuleBlock(moduleId: KtcModuleId): Promise<void>;
  showModuleTool(moduleId: KtcModuleId, toolId: string): Promise<boolean>;
  closeModuleTool(moduleId: KtcModuleId, toolId: string): Promise<KtcToolBlockState>;
}
