export const PREVIEW_COMPANION_MAX_FACTS = 6;
export const PREVIEW_COMPANION_MAX_ACTIONS = 4;

export type PreviewCompanionStatusTone = "idle" | "progress" | "success" | "warning" | "error";

export interface PreviewCompanionStatus {
  readonly label: string;
  readonly tone: PreviewCompanionStatusTone;
}

export interface PreviewCompanionFact {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface PreviewCompanionAction {
  readonly actionId: string;
  readonly label: string;
  readonly enabled: boolean;
}

/**
 * Host-neutral data rendered by a Primary companion surface. It deliberately
 * carries no HTML, callbacks, commands or open-ended payload.
 */
export interface PreviewCompanionModel {
  readonly status: PreviewCompanionStatus;
  readonly facts: readonly PreviewCompanionFact[];
  readonly actions: readonly PreviewCompanionAction[];
}

const STATUS_TONES: ReadonlySet<string> = new Set<PreviewCompanionStatusTone>([
  "idle",
  "progress",
  "success",
  "warning",
  "error",
]);

/** Validates untrusted data, trims strings and returns a deeply frozen model. */
export function normalizePreviewCompanionModel(value: unknown): PreviewCompanionModel {
  const model = requireRecord(value, "Primary companion model");
  requireExactKeys(model, ["status", "facts", "actions"], "Primary companion model");

  const statusValue = requireRecord(model.status, "Primary companion status");
  requireExactKeys(statusValue, ["label", "tone"], "Primary companion status");
  const status = Object.freeze({
    label: requireText(statusValue.label, "Primary companion status label"),
    tone: requireTone(statusValue.tone),
  });

  const factsValue = requireArray(model.facts, "Primary companion facts");
  if (factsValue.length > PREVIEW_COMPANION_MAX_FACTS) {
    throw new Error(`Primary companion facts must contain at most ${PREVIEW_COMPANION_MAX_FACTS} items`);
  }
  const factIds = new Set<string>();
  const facts = Object.freeze(Array.from(factsValue, (candidate, index): PreviewCompanionFact => {
    const context = `Primary companion fact #${index + 1}`;
    const fact = requireRecord(candidate, context);
    requireExactKeys(fact, ["id", "label", "value"], context);
    const id = requireText(fact.id, `${context} id`);
    if (factIds.has(id)) throw new Error(`Primary companion facts contain duplicate id: ${id}`);
    factIds.add(id);
    return Object.freeze({
      id,
      label: requireText(fact.label, `${context} label`),
      value: requireText(fact.value, `${context} value`),
    });
  }));

  const actionsValue = requireArray(model.actions, "Primary companion actions");
  if (actionsValue.length > PREVIEW_COMPANION_MAX_ACTIONS) {
    throw new Error(`Primary companion actions must contain at most ${PREVIEW_COMPANION_MAX_ACTIONS} items`);
  }
  const actionIds = new Set<string>();
  const actions = Object.freeze(Array.from(actionsValue, (candidate, index): PreviewCompanionAction => {
    const context = `Primary companion action #${index + 1}`;
    const action = requireRecord(candidate, context);
    requireExactKeys(action, ["actionId", "label", "enabled"], context);
    const actionId = requireText(action.actionId, `${context} actionId`);
    if (actionIds.has(actionId)) {
      throw new Error(`Primary companion actions contain duplicate actionId: ${actionId}`);
    }
    actionIds.add(actionId);
    if (typeof action.enabled !== "boolean") throw new Error(`${context} enabled must be a boolean`);
    return Object.freeze({
      actionId,
      label: requireText(action.label, `${context} label`),
      enabled: action.enabled,
    });
  }));

  return Object.freeze({ status, facts, actions });
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, context: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: string,
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`${context} contains unsupported field: ${unexpected}`);
  const missing = allowedKeys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`${context} is missing field: ${missing}`);
}

function requireText(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value.trim();
}

function requireTone(value: unknown): PreviewCompanionStatusTone {
  if (typeof value !== "string" || !STATUS_TONES.has(value)) {
    throw new Error("Primary companion status tone is invalid");
  }
  return value as PreviewCompanionStatusTone;
}
