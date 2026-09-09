import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import {
  KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
  KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH,
} from "../../core/rootCleanupPatterns.js";

export type KtcAutoBuildExecutionAction = "preflight" | "start";
export type KtcAutoBuildDraftRequestAction = KtcAutoBuildExecutionAction
  | "toggleParallelBuild"
  | "setCmakeBuildTypes"
  | "saveConfig"
  | "saveAsConfig"
  | "closeConfig"
  | "openConfig"
  | "selectRecent"
  | "newConfigForDirectory"
  | "keepProjectsForDirectory"
  | "cleanupDialog";

export interface KtcAutoBuildDraftReadyMessage {
  readonly type: "ready";
  readonly documentId: string;
}

export interface KtcAutoBuildDraftChangedMessage {
  readonly type: "draftChanged";
  readonly documentId: string;
  readonly draftRevision: number;
  readonly configuration: KtcAutoBuildConfiguration;
}

export interface KtcAutoBuildConfigurationRequest {
  readonly type: "requestConfiguration";
  readonly requestId: string;
  readonly documentId: string;
  readonly minimumDraftRevision: number;
  readonly action: KtcAutoBuildDraftRequestAction;
}

export interface KtcAutoBuildConfigurationSnapshotMessage {
  readonly type: "configurationSnapshot";
  readonly requestId: string;
  readonly documentId: string;
  readonly draftRevision: number;
  readonly configuration: KtcAutoBuildConfiguration;
}

export interface KtcAutoBuildRightExecutionMessage {
  readonly type: KtcAutoBuildExecutionAction;
  readonly documentId: string;
  readonly draftRevision: number;
  readonly configuration: KtcAutoBuildConfiguration;
}

export function ktcIsAutoBuildConfiguration(value: unknown): value is KtcAutoBuildConfiguration {
  if (!isRecord(value)) return false;
  const configuration = value as Partial<KtcAutoBuildConfiguration>;
  return configuration.schemaVersion === 2
    && isBoundedString(configuration.rootDirectory)
    && isBoundedString(configuration.thirdPartyDirectory)
    && (configuration.rootEnabled === undefined || typeof configuration.rootEnabled === "boolean")
    && (configuration.thirdPartyEnabled === undefined || typeof configuration.thirdPartyEnabled === "boolean")
    && (configuration.updateRoot === undefined || typeof configuration.updateRoot === "boolean")
    && (configuration.updateThirdParty === undefined || typeof configuration.updateThirdParty === "boolean")
    && (configuration.workingDirectory === undefined || isBoundedString(configuration.workingDirectory))
    && isBoundedString(configuration.rootBranch)
    && isBoundedString(configuration.branch)
    && isBoundedString(configuration.cmakeBranch)
    && typeof configuration.clean === "boolean"
    && (configuration.rootCleanupYaml === undefined
      || (typeof configuration.rootCleanupYaml === "string"
        && configuration.rootCleanupYaml.length <= KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH))
    && (configuration.buildExecutionMode === undefined
      || configuration.buildExecutionMode === "sequential"
      || configuration.buildExecutionMode === "parallel")
    && (configuration.cmakeBuildTypes === undefined
      || (Array.isArray(configuration.cmakeBuildTypes)
        && configuration.cmakeBuildTypes.length <= 2
        && new Set(configuration.cmakeBuildTypes).size === configuration.cmakeBuildTypes.length
        && configuration.cmakeBuildTypes.every((type) => type === "Debug" || type === "Release")))
    && Array.isArray(configuration.projects)
    && configuration.projects.length <= 500
    && configuration.projects.every((project) => isRecord(project)
      && isBoundedString(project.id)
      && typeof project.enabled === "boolean"
      && isBoundedString(project.name)
      && isBoundedString(project.path)
      && isBoundedString(project.branch)
      && isRecord(project.operations)
      && typeof project.operations.update === "boolean"
      && typeof project.operations.cmake === "boolean"
      && typeof project.operations.caa === "boolean"
      && typeof project.operations.linkCaa === "boolean"
      && (project.probe === undefined || isProbe(project.probe)))
    && (configuration.repositorySnapshot === undefined
      || isRepositorySnapshot(configuration.repositorySnapshot));
}

const MAX_CONFIGURATION_STRING_LENGTH = 32_768;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_CONFIGURATION_STRING_LENGTH;
}

function isProbe(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isBoundedString(value.capturedAt)
    && isBoundedString(value.branch)
    && isBoundedString(value.commit)
    && isBoundedString(value.origin)
    && typeof value.status === "string"
    && ["clean", "modified", "invalid", "not-git", "script-mismatch", "unknown"].includes(value.status)
    && (value.message === undefined || isBoundedString(value.message));
}

function isRepositorySnapshot(value: unknown): boolean {
  if (!isRecord(value)
    || !isBoundedString(value.capturedAt)
    || !Array.isArray(value.repositories)
    || value.repositories.length > 1_000) return false;
  return value.repositories.every((repository: unknown) => isRecord(repository)
    && isBoundedString(repository.role)
    && isBoundedString(repository.path)
    && isBoundedString(repository.branch)
    && isBoundedString(repository.commit)
    && isBoundedString(repository.origin)
    && (repository.hasChanges === undefined || typeof repository.hasChanges === "boolean")
    && (repository.error === undefined || isBoundedString(repository.error)));
}

/** Freeze the Webview-owned mutable draft before projecting or executing it in the Host. */
export function ktcCloneAutoBuildConfiguration(
  configuration: KtcAutoBuildConfiguration,
): KtcAutoBuildConfiguration {
  return structuredClone({
    ...configuration,
    rootCleanupYaml: typeof configuration.rootCleanupYaml === "string"
      ? configuration.rootCleanupYaml.slice(0, KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH)
      : KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
  });
}
