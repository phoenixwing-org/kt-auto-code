import rawCatalog from "./toolRegistrationCatalog.json";

export interface KtcToolRegistrationMetadata {
  readonly toolId: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly icon: string;
  readonly groupId: string;
}

export interface KtcToolRegistrationCatalogDocument {
  readonly version: 1;
  readonly tools: readonly KtcToolRegistrationMetadata[];
}

export function ktcParseToolRegistrationCatalog(
  value: unknown,
): KtcToolRegistrationCatalogDocument {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tools)) {
    throw new Error("工具注册 Catalog 必须是 version 1 且包含 tools 数组。");
  }

  const ids = new Set<string>();
  const tools = value.tools.map((candidate, index): KtcToolRegistrationMetadata => {
    const context = `工具注册 #${index + 1}`;
    if (!isRecord(candidate)) throw new Error(`${context} 必须是对象。`);
    const toolId = requiredString(candidate, "toolId", context);
    if (ids.has(toolId)) throw new Error(`工具注册 toolId 重复：${toolId}`);
    ids.add(toolId);
    return Object.freeze({
      toolId,
      title: requiredString(candidate, "title", context),
      shortTitle: requiredString(candidate, "shortTitle", context),
      description: requiredString(candidate, "description", context),
      icon: requiredString(candidate, "icon", context),
      groupId: requiredString(candidate, "groupId", context),
    });
  });

  return Object.freeze({ version: 1, tools: Object.freeze(tools) });
}

export const KTC_TOOL_REGISTRATION_CATALOG = ktcParseToolRegistrationCatalog(rawCatalog);

export const KTC_TOOL_REGISTRATION_BY_ID: Readonly<Record<string, KtcToolRegistrationMetadata>> =
  Object.freeze(Object.fromEntries(
    KTC_TOOL_REGISTRATION_CATALOG.tools.map((metadata) => [metadata.toolId, metadata]),
  ));

export function ktcRequireToolRegistration(toolId: string): KtcToolRegistrationMetadata {
  const metadata = KTC_TOOL_REGISTRATION_BY_ID[toolId];
  if (!metadata) throw new Error(`工具未注册：${toolId}`);
  return metadata;
}

function requiredString(
  value: Record<string, unknown>,
  key: keyof KtcToolRegistrationMetadata,
  context: string,
): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`${context} 的 ${key} 必须是非空字符串。`);
  }
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
