import autoBuildSampleJson from "../fixtures/auto-build.sample.json";

export interface PreviewAutoBuildSampleRepository {
  readonly id: string;
  readonly enabled: boolean;
  readonly kind: "Root" | "3rdParty" | "项目";
  readonly branch: string;
  readonly name: string;
  readonly path: string;
  readonly commit: string;
  readonly origin: string;
  readonly originTitle: string;
  readonly status: string;
  readonly operations: readonly { readonly id: string; readonly label: string; readonly enabled: boolean }[];
  readonly runnable: boolean;
}

export interface PreviewAutoBuildSampleTask {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly status: string;
  readonly tone: "idle" | "progress" | "success" | "warning" | "error";
}

export interface PreviewAutoBuildSampleConfiguration {
  readonly currentConfigName: string;
  readonly recentConfigs: readonly string[];
  readonly draftLabel: string;
  readonly rootDirectory: string;
  readonly thirdPartyDirectory: string;
  readonly workingDirectory: string;
  readonly rootBranch: string;
  readonly projectBranch: string;
  readonly cmakeBranch: string;
  readonly updateRootDirectory: boolean;
  readonly updateThirdParty: boolean;
}

export interface PreviewAutoBuildSampleInitial {
  readonly phase: "idle" | "preflightPassed" | "running" | "stopped";
  readonly status: string;
  readonly tone: "idle" | "progress" | "success" | "warning";
  readonly parallelBuild: boolean;
  readonly probeColumnsVisible: boolean;
}

export interface PreviewAutoBuildSampleEnvironment {
  readonly hint: string;
  readonly platform: string;
  readonly sequentialExecution: string;
  readonly parallelExecution: string;
}

export interface PreviewAutoBuildSampleMaintenance {
  readonly rootScriptStatus: string;
  readonly repositoryCleanupStatus: string;
  readonly rootCleanupStatus: string;
  readonly rootCleanupPatternsYaml: string;
  readonly rootCleanupPreviewCount: number;
}

export interface PreviewAutoBuildSamplePrimaryBlocks {
  readonly environmentExpanded: boolean;
  readonly maintenanceExpanded: boolean;
}

export interface PreviewAutoBuildSample {
  readonly schemaVersion: 1;
  readonly initial: PreviewAutoBuildSampleInitial;
  readonly configuration: PreviewAutoBuildSampleConfiguration;
  readonly environment: PreviewAutoBuildSampleEnvironment;
  readonly maintenance: PreviewAutoBuildSampleMaintenance;
  readonly primaryBlocks: PreviewAutoBuildSamplePrimaryBlocks;
  readonly repositories: readonly PreviewAutoBuildSampleRepository[];
  readonly tasks: readonly PreviewAutoBuildSampleTask[];
}

const SAMPLE_KEYS = Object.freeze([
  "schemaVersion",
  "initial",
  "configuration",
  "environment",
  "maintenance",
  "primaryBlocks",
  "repositories",
  "tasks",
]);

export function parsePreviewAutoBuildSample(value: unknown): PreviewAutoBuildSample {
  const sample = requireRecord(value, "AutoBuild sample");
  requireExactKeys(sample, SAMPLE_KEYS, "AutoBuild sample");
  if (sample.schemaVersion !== 1) throw new Error("AutoBuild sample schemaVersion must be 1");

  const initialValue = requireRecord(sample.initial, "initial");
  requireExactKeys(initialValue, ["phase", "status", "tone", "parallelBuild", "probeColumnsVisible"], "initial");
  const initial = Object.freeze({
    phase: requireChoice(initialValue.phase, ["idle", "preflightPassed", "running", "stopped"] as const, "initial phase"),
    status: requireText(initialValue.status, "initial status"),
    tone: requireChoice(initialValue.tone, ["idle", "progress", "success", "warning"] as const, "initial tone"),
    parallelBuild: requireBoolean(initialValue.parallelBuild, "initial parallelBuild"),
    probeColumnsVisible: requireBoolean(initialValue.probeColumnsVisible, "initial probeColumnsVisible"),
  });

  const configurationValue = requireRecord(sample.configuration, "configuration");
  requireExactKeys(configurationValue, ["currentConfigName", "recentConfigs", "draftLabel", "rootDirectory", "thirdPartyDirectory", "workingDirectory", "rootBranch", "projectBranch", "cmakeBranch", "updateRootDirectory", "updateThirdParty"], "configuration");
  const configuration = Object.freeze({
    currentConfigName: requireText(configurationValue.currentConfigName, "configuration currentConfigName"),
    recentConfigs: requireTextArray(configurationValue.recentConfigs, "configuration recentConfigs", 12),
    draftLabel: requireText(configurationValue.draftLabel, "configuration draftLabel"),
    rootDirectory: requireText(configurationValue.rootDirectory, "configuration rootDirectory"),
    thirdPartyDirectory: requireText(configurationValue.thirdPartyDirectory, "configuration thirdPartyDirectory"),
    workingDirectory: requireText(configurationValue.workingDirectory, "configuration workingDirectory"),
    rootBranch: requireText(configurationValue.rootBranch, "configuration rootBranch"),
    projectBranch: requireText(configurationValue.projectBranch, "configuration projectBranch"),
    cmakeBranch: requireText(configurationValue.cmakeBranch, "configuration cmakeBranch"),
    updateRootDirectory: requireBoolean(configurationValue.updateRootDirectory, "configuration updateRootDirectory"),
    updateThirdParty: requireBoolean(configurationValue.updateThirdParty, "configuration updateThirdParty"),
  });

  const environmentValue = requireRecord(sample.environment, "environment");
  requireExactKeys(environmentValue, ["hint", "platform", "sequentialExecution", "parallelExecution"], "environment");
  const environment = Object.freeze({
    hint: requireText(environmentValue.hint, "environment hint"),
    platform: requireText(environmentValue.platform, "environment platform"),
    sequentialExecution: requireText(environmentValue.sequentialExecution, "environment sequentialExecution"),
    parallelExecution: requireText(environmentValue.parallelExecution, "environment parallelExecution"),
  });

  const maintenanceValue = requireRecord(sample.maintenance, "maintenance");
  requireExactKeys(maintenanceValue, ["rootScriptStatus", "repositoryCleanupStatus", "rootCleanupStatus", "rootCleanupPatternsYaml", "rootCleanupPreviewCount"], "maintenance");
  const maintenance = Object.freeze({
    rootScriptStatus: requireText(maintenanceValue.rootScriptStatus, "maintenance rootScriptStatus"),
    repositoryCleanupStatus: requireText(maintenanceValue.repositoryCleanupStatus, "maintenance repositoryCleanupStatus"),
    rootCleanupStatus: requireText(maintenanceValue.rootCleanupStatus, "maintenance rootCleanupStatus"),
    rootCleanupPatternsYaml: requireOptionalText(maintenanceValue.rootCleanupPatternsYaml, "maintenance rootCleanupPatternsYaml", 4_096),
    rootCleanupPreviewCount: requireInteger(maintenanceValue.rootCleanupPreviewCount, "maintenance rootCleanupPreviewCount", 0, 10000),
  });

  const primaryBlocksValue = requireRecord(sample.primaryBlocks, "primaryBlocks");
  requireExactKeys(primaryBlocksValue, ["environmentExpanded", "maintenanceExpanded"], "primaryBlocks");
  const primaryBlocks = Object.freeze({
    environmentExpanded: requireBoolean(primaryBlocksValue.environmentExpanded, "primaryBlocks environmentExpanded"),
    maintenanceExpanded: requireBoolean(primaryBlocksValue.maintenanceExpanded, "primaryBlocks maintenanceExpanded"),
  });
  const repositoryIds = new Set<string>();
  const repositories = Object.freeze(requireArray(sample.repositories, "repositories", 32).map((candidate, index) => {
    const context = `repository #${index + 1}`;
    const repository = requireRecord(candidate, context);
    requireExactKeys(repository, ["id", "enabled", "kind", "branch", "name", "path", "commit", "origin", "originTitle", "status", "operations", "runnable"], context);
    const id = requireText(repository.id, `${context} id`);
    if (repositoryIds.has(id)) throw new Error(`AutoBuild sample contains duplicate repository id: ${id}`);
    repositoryIds.add(id);
    if (typeof repository.enabled !== "boolean" || typeof repository.runnable !== "boolean") {
      throw new Error(`${context} enabled/runnable must be booleans`);
    }
    if (repository.kind !== "Root" && repository.kind !== "3rdParty" && repository.kind !== "项目") {
      throw new Error(`${context} kind is invalid`);
    }
    const operationIds = new Set<string>();
    const operations = Object.freeze(requireArray(repository.operations, `${context} operations`, 8).map((candidate, operationIndex) => {
      const operationContext = `${context} operation #${operationIndex + 1}`;
      const operation = requireRecord(candidate, operationContext);
      requireExactKeys(operation, ["id", "label", "enabled"], operationContext);
      const operationId = requireText(operation.id, `${operationContext} id`);
      if (operationIds.has(operationId)) throw new Error(`${context} contains duplicate operation id: ${operationId}`);
      operationIds.add(operationId);
      return Object.freeze({
        id: operationId,
        label: requireText(operation.label, `${operationContext} label`),
        enabled: requireBoolean(operation.enabled, `${operationContext} enabled`),
      });
    }));
    return Object.freeze({
      id,
      enabled: repository.enabled,
      kind: repository.kind,
      branch: requireText(repository.branch, `${context} branch`),
      name: requireText(repository.name, `${context} name`),
      path: requireText(repository.path, `${context} path`),
      commit: requireText(repository.commit, `${context} commit`),
      origin: requireText(repository.origin, `${context} origin`),
      originTitle: requireText(repository.originTitle, `${context} originTitle`),
      status: requireText(repository.status, `${context} status`),
      operations,
      runnable: repository.runnable,
    });
  }));

  const taskIds = new Set<string>();
  const tasks = Object.freeze(requireArray(sample.tasks, "tasks", 32).map((candidate, index) => {
    const context = `task #${index + 1}`;
    const task = requireRecord(candidate, context);
    requireExactKeys(task, ["id", "name", "detail", "status", "tone"], context);
    const id = requireText(task.id, `${context} id`);
    if (taskIds.has(id)) throw new Error(`AutoBuild sample contains duplicate task id: ${id}`);
    taskIds.add(id);
    return Object.freeze({
      id,
      name: requireText(task.name, `${context} name`),
      detail: requireText(task.detail, `${context} detail`),
      status: requireText(task.status, `${context} status`),
      tone: requireChoice(task.tone, ["idle", "progress", "success", "warning", "error"] as const, `${context} tone`),
    });
  }));

  return Object.freeze({
    schemaVersion: 1,
    initial,
    configuration,
    environment,
    maintenance,
    primaryBlocks,
    repositories,
    tasks,
  });
}

export const PREVIEW_AUTO_BUILD_SAMPLE = parsePreviewAutoBuildSample(autoBuildSampleJson);

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, context: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new Error(`${context} must contain 1-${max} items`);
  }
  return value;
}

function requireTextArray(value: unknown, context: string, max: number): readonly string[] {
  return Object.freeze(requireArray(value, context, max).map((candidate, index) => (
    requireText(candidate, `${context} #${index + 1}`)
  )));
}

function requireText(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 512) {
    throw new Error(`${context} must be non-empty text up to 512 characters`);
  }
  return value.trim();
}

function requireOptionalText(value: unknown, context: string, max = 512): string {
  if (typeof value !== "string" || value.length > max) {
    throw new Error(`${context} must be text up to ${max} characters`);
  }
  return value;
}

function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${context} must be a boolean`);
  return value;
}

function requireInteger(value: unknown, context: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${context} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function requireChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  context: string,
): T[number] {
  if (typeof value !== "string" || !choices.some((choice) => choice === value)) {
    throw new Error(`${context} is invalid`);
  }
  return value as T[number];
}

function requireExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[], context: string): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`${context} contains unsupported field: ${unexpected}`);
  const missing = allowedKeys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`${context} is missing field: ${missing}`);
}
