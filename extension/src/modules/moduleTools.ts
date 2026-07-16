import type { KtcModuleId } from "./moduleState.js";

export type KtcModuleToolRequirement =
  | "none"
  | "desk-provider"
  | "optional-desk-provider"
  | "workspace-database";

export interface KtcModuleToolDefinition {
  readonly id: string;
  readonly moduleId: KtcModuleId;
  readonly shortTitle: string;
  readonly title: string;
  readonly description: string;
  readonly command: string;
  readonly icon?: string;
  readonly requirement: KtcModuleToolRequirement;
}

export interface KtcModuleContribution {
  readonly id: KtcModuleId;
  readonly title: string;
  readonly order: number;
  readonly commandPrefix: string;
  readonly tools: readonly KtcModuleToolDefinition[];
}

export function ktcReadModuleContribution(packageJson: unknown): KtcModuleContribution | undefined {
  if (!isRecord(packageJson) || !isRecord(packageJson.ktAutoCodeModule)) return undefined;
  const module = packageJson.ktAutoCodeModule;
  if (!isModuleId(module.id)
    || !isNonEmptyString(module.title)
    || !isCommandPrefix(module.commandPrefix)
    || (module.order !== undefined && (typeof module.order !== "number" || !Number.isFinite(module.order)))
    || !Array.isArray(module.tools)) return undefined;
  return Object.freeze({
    id: module.id,
    title: module.title,
    order: module.order ?? 100,
    commandPrefix: module.commandPrefix,
    tools: readTools(module.tools, module.id, module.commandPrefix),
  });
}

export function ktcReadModuleToolDefinitions(
  packageJson: unknown,
  expectedModuleId: KtcModuleId,
): KtcModuleToolDefinition[] {
  const contribution = ktcReadModuleContribution(packageJson);
  return contribution?.id === expectedModuleId ? [...contribution.tools] : [];
}

function readTools(
  values: readonly unknown[],
  moduleId: KtcModuleId,
  allowedCommandPrefix: string,
): KtcModuleToolDefinition[] {
  const seen = new Set<string>();
  const tools: KtcModuleToolDefinition[] = [];
  for (const value of values) {
    if (!isRecord(value)
      || !isSafeId(value.id)
      || seen.has(value.id)
      || !isNonEmptyString(value.shortTitle)
      || !isNonEmptyString(value.title)
      || !isNonEmptyString(value.description)
      || !isNonEmptyString(value.command)
      || !value.command.startsWith(allowedCommandPrefix)
      || !isRequirement(value.requirement)
      || (value.icon !== undefined && !isNonEmptyString(value.icon))) continue;
    seen.add(value.id);
    tools.push(Object.freeze({
      id: value.id,
      moduleId,
      shortTitle: value.shortTitle,
      title: value.title,
      description: value.description,
      command: value.command,
      icon: value.icon,
      requirement: value.requirement,
    }));
  }
  return tools;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeId(value: unknown): value is string {
  return isNonEmptyString(value) && /^[a-z][A-Za-z0-9]*$/.test(value);
}

function isModuleId(value: unknown): value is KtcModuleId {
  return typeof value === "string" && /^[a-z][a-z0-9-]*$/.test(value);
}

function isCommandPrefix(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9.-]*\.$/.test(value);
}

function isRequirement(value: unknown): value is KtcModuleToolRequirement {
  return value === "none"
    || value === "desk-provider"
    || value === "optional-desk-provider"
    || value === "workspace-database";
}
