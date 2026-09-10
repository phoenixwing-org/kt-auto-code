/** Host-neutral source identities. Paths are display-only; actions use opaque IDs. */
export interface KtcCleanupYamlSource {
  readonly id: string;
  readonly revision: number;
  readonly path: string;
  readonly root: string;
  readonly status?: string;
  readonly disabledReason?: string;
}
export interface KtcCleanupYamlWorkspaceModel {
  /** Exact discovery/current cleanup scope, displayed even when no YAML is found. */
  readonly workingDirectory?: string;
  readonly sources: readonly KtcCleanupYamlSource[];
  readonly busy: boolean;
  readonly notice?: string;
  readonly contextId?: string;
}
