import {
  KTC_PROJECT_RENAME_VARIANT_STYLES,
  type KtcProjectRenameRule,
  type KtcProjectRenameRuleStyle,
  type KtcProjectRenameViewInboundMessage,
} from "./contracts.js";

const KTC_PROJECT_RENAME_MAX_NAME_LENGTH = 256;
const KTC_PROJECT_RENAME_MAX_RULES = 32;
const KTC_PROJECT_RENAME_STYLES = new Set<string>([...KTC_PROJECT_RENAME_VARIANT_STYLES, "custom"]);

/** Webview 消息不可信；只接受有限、完整、可枚举的分析请求。 */
export function ktcParseProjectRenameViewMessage(value: unknown): KtcProjectRenameViewInboundMessage | undefined {
  if (!ktcIsRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "ready" || value.type === "chooseRoot" || value.type === "cancel" || value.type === "finish") {
    return { type: value.type };
  }
  if (value.type === "derive" && ktcIsBoundedString(value.sourceName) && ktcIsBoundedString(value.targetName)) {
    return { type: "derive", sourceName: value.sourceName, targetName: value.targetName };
  }
  if (value.type === "analyze"
    && ktcIsBoundedString(value.sourceName)
    && ktcIsBoundedString(value.targetName)
    && Array.isArray(value.rules)
    && value.rules.length <= KTC_PROJECT_RENAME_MAX_RULES) {
    const rules = value.rules.map(ktcParseProjectRenameRule);
    if (rules.some((rule) => rule === undefined)) return undefined;
    return {
      type: "analyze",
      sourceName: value.sourceName,
      targetName: value.targetName,
      rules: rules as readonly KtcProjectRenameRule[],
    };
  }
  if (value.type === "loadMore"
    && ktcIsReportId(value.reportId)
    && Number.isSafeInteger(value.offset)
    && typeof value.offset === "number"
    && value.offset >= 0) {
    return { type: "loadMore", reportId: value.reportId, offset: value.offset };
  }
  if (value.type === "renameRoot" && ktcIsReportId(value.reportId)) {
    return { type: "renameRoot", reportId: value.reportId };
  }
  if (value.type === "apply" && ktcIsReportId(value.reportId)) {
    return { type: "apply", reportId: value.reportId };
  }
  if (value.type === "open" && ktcIsReportId(value.reportId) && ktcIsIdentifier(value.rowId)) {
    return { type: "open", reportId: value.reportId, rowId: value.rowId };
  }
  return undefined;
}

function ktcParseProjectRenameRule(value: unknown): KtcProjectRenameRule | undefined {
  if (!ktcIsRecord(value)
    || !ktcIsIdentifier(value.id, 128)
    || !ktcIsProjectRenameRuleStyle(value.style)
    || !ktcIsBoundedString(value.search)
    || !ktcIsBoundedString(value.replace)
    || typeof value.enabled !== "boolean") return undefined;
  return {
    id: value.id,
    style: value.style,
    search: value.search,
    replace: value.replace,
    enabled: value.enabled,
  };
}

function ktcIsProjectRenameRuleStyle(value: unknown): value is KtcProjectRenameRuleStyle {
  return typeof value === "string" && KTC_PROJECT_RENAME_STYLES.has(value);
}

function ktcIsBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= KTC_PROJECT_RENAME_MAX_NAME_LENGTH;
}

function ktcIsIdentifier(value: unknown, maxLength = 4_096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/u.test(value);
}

function ktcIsReportId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function ktcIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
