import * as PnwRunNodeImport from "@phoenix-wing/run-node";

export interface KtcWingCleanupArtifactPreview {
  readonly root: string;
  readonly matched: readonly string[];
}

export interface KtcWingCleanupResult {
  readonly root: string;
  readonly deleted: readonly string[];
}

export interface KtcWingGitCleanupPreview {
  readonly repository: string;
  readonly head: string;
  readonly trackedChanges: readonly string[];
  readonly untrackedAndIgnored: readonly string[];
}

export interface KtcWingGitCleanupResult {
  readonly repository: string;
  readonly resetOutput: string;
  readonly cleanOutput: string;
}

interface PnwRunNodeCleanupModule {
  pnwPreviewCleanupArtifacts(root: string, rulesYaml: string): Promise<KtcWingCleanupArtifactPreview>;
  pnwCleanPreviewedArtifacts(
    preview: KtcWingCleanupArtifactPreview,
    options?: { readonly shouldContinue?: () => boolean },
  ): Promise<KtcWingCleanupResult>;
  pnwPreviewDirectoryContents(root: string): Promise<KtcWingCleanupArtifactPreview>;
  pnwCleanPreviewedDirectoryContents(
    preview: KtcWingCleanupArtifactPreview,
    options?: { readonly shouldContinue?: () => boolean },
  ): Promise<KtcWingCleanupResult>;
  pnwPreviewGitForcedCleanup(repository: string): Promise<KtcWingGitCleanupPreview>;
  pnwExecuteGitForcedCleanup(
    preview: KtcWingGitCleanupPreview,
    options?: { readonly shouldContinue?: () => boolean },
  ): Promise<KtcWingGitCleanupResult>;
}

const PnwRunNode = PnwRunNodeImport as unknown as PnwRunNodeCleanupModule;

/** Thin consumer boundary; all destructive filesystem behavior remains owned by Wing. */
export const ktcPreviewWingCleanupArtifacts = PnwRunNode.pnwPreviewCleanupArtifacts;
export const ktcCleanPreviewedWingArtifacts = PnwRunNode.pnwCleanPreviewedArtifacts;
export const ktcPreviewWingDirectoryContents = PnwRunNode.pnwPreviewDirectoryContents;
export const ktcCleanPreviewedWingDirectoryContents = PnwRunNode.pnwCleanPreviewedDirectoryContents;
export const ktcPreviewWingGitForcedCleanup = PnwRunNode.pnwPreviewGitForcedCleanup;
export const ktcExecuteWingGitForcedCleanup = PnwRunNode.pnwExecuteGitForcedCleanup;
