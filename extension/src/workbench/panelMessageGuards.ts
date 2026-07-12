export type KtcHeaderAsciiPanelMessage =
  | { type: "ready" }
  | { type: "openIssue"; file: string; line: number };

export type KtcIgnoreRecommendationPanelMessage =
  | { type: "ready" }
  | { type: "applyGroups"; groupIds: string[] };

export function ktcIsHeaderAsciiPanelMessage(
  value: unknown,
): value is KtcHeaderAsciiPanelMessage {
  const message = asMessage(value);
  if (!message) return false;
  if (message.type === "ready") return true;
  return message.type === "openIssue"
    && typeof message.file === "string"
    && message.file.length > 0
    && isPositiveInteger(message.line);
}

export function ktcIsIgnoreRecommendationPanelMessage(
  value: unknown,
): value is KtcIgnoreRecommendationPanelMessage {
  const message = asMessage(value);
  if (!message) return false;
  if (message.type === "ready") return true;
  if (message.type !== "applyGroups" || !Array.isArray(message.groupIds)) return false;
  const groupIds = message.groupIds;
  return groupIds.length > 0
    && groupIds.length <= 100
    && groupIds.every((id): id is string => typeof id === "string" && id.length > 0)
    && new Set(groupIds).size === groupIds.length;
}

function asMessage(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
