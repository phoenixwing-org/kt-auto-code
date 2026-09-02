import {
  KTC_PROJECT_RENAME_VARIANT_STYLES,
  type KtcProjectRenameRule,
  type KtcProjectRenameRuleStyle,
  type KtcProjectRenameViewInboundMessage,
} from "./contracts.js";

const KTC_PROJECT_RENAME_MAX_NAME_LENGTH = 256;
const KTC_PROJECT_RENAME_MAX_RULES = 32;
const KTC_PROJECT_RENAME_STYLES = new Set<string>([...KTC_PROJECT_RENAME_VARIANT_STYLES, "custom"]);
const KTC_PROJECT_RENAME_RELATION_KINDS = new Set<string>([
  "spaced", "prefix", "caa-i", "caa-e", "caa-i-full", "caa-e-full", "custom",
]);
const KTC_PROJECT_RENAME_PICKER_MODES = new Set<string>(["custom", "common", "caa"]);

/** Webview 消息不可信；只接受有限、完整、可枚举的分析请求。 */
export function ktcParseProjectRenameViewMessage(value: unknown): KtcProjectRenameViewInboundMessage | undefined {
  if (!ktcIsRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "ready"
    || value.type === "chooseRoot"
    || value.type === "cancel"
    || value.type === "finish"
    || value.type === "openGitChanges"
    || value.type === "clearHistory") {
    return { type: value.type };
  }
  if (value.type === "derive"
    && ktcIsBoundedString(value.sourceName)
    && ktcIsBoundedString(value.targetName)
    && ktcIsBoundedString(value.sourcePrefix)
    && ktcIsBoundedString(value.targetPrefix)) {
    return {
      type: "derive",
      sourceName: value.sourceName,
      targetName: value.targetName,
      sourcePrefix: value.sourcePrefix,
      targetPrefix: value.targetPrefix,
    };
  }
  if (value.type === "analyze"
    && ktcIsBoundedString(value.sourceName)
    && ktcIsBoundedString(value.targetName)
    && ktcIsBoundedString(value.sourcePrefix)
    && ktcIsBoundedString(value.targetPrefix)) {
    const rules = ktcParseProjectRenameRules(value.rules);
    if (!rules) return undefined;
    return {
      type: "analyze",
      sourceName: value.sourceName,
      targetName: value.targetName,
      sourcePrefix: value.sourcePrefix,
      targetPrefix: value.targetPrefix,
      rules,
    };
  }
  if (value.type === "loadProfile" && ktcIsIdentifier(value.id, 256)) {
    return { type: "loadProfile", id: value.id };
  }
  if (value.type === "loadProjectHistory" && ktcIsIdentifier(value.id, 256)) {
    return { type: "loadProjectHistory", id: value.id };
  }
  if (value.type === "deleteHistory" && ktcIsRecord(value.entry)) {
    if (value.entry.kind === "project" && ktcIsIdentifier(value.entry.id, 256)) {
      return { type: "deleteHistory", entry: { kind: "project", id: value.entry.id } };
    }
    if (value.entry.kind === "pair"
      && ktcIsBoundedString(value.entry.source)
      && ktcIsBoundedString(value.entry.target)
      && value.entry.source.trim()
      && value.entry.target.trim()) {
      return {
        type: "deleteHistory",
        entry: { kind: "pair", source: value.entry.source, target: value.entry.target },
      };
    }
  }
  if ((value.type === "saveProfile" || value.type === "requestRulePicker")
    && ktcIsBoundedString(value.sourceName)
    && ktcIsBoundedString(value.targetName)
    && ktcIsBoundedString(value.sourcePrefix)
    && ktcIsBoundedString(value.targetPrefix)) {
    const rules = ktcParseProjectRenameRules(value.rules);
    if (!rules) return undefined;
    if (value.type === "saveProfile" && ktcIsBoundedString(value.label)) {
      return {
        type: "saveProfile",
        label: value.label,
        sourceName: value.sourceName,
        targetName: value.targetName,
        sourcePrefix: value.sourcePrefix,
        targetPrefix: value.targetPrefix,
        rules,
      };
    }
    if (value.type === "requestRulePicker"
      && typeof value.mode === "string"
      && KTC_PROJECT_RENAME_PICKER_MODES.has(value.mode)) {
      return {
        type: "requestRulePicker",
        mode: value.mode as "custom" | "common" | "caa",
        sourceName: value.sourceName,
        targetName: value.targetName,
        sourcePrefix: value.sourcePrefix,
        targetPrefix: value.targetPrefix,
        rules,
      };
    }
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
  if (value.type === "previewFirstDiff" && ktcIsReportId(value.reportId)) {
    return { type: "previewFirstDiff", reportId: value.reportId };
  }
  if (value.type === "previewDiff" && ktcIsReportId(value.reportId) && ktcIsIdentifier(value.rowId)) {
    return { type: "previewDiff", reportId: value.reportId, rowId: value.rowId };
  }
  if (value.type === "open" && ktcIsReportId(value.reportId) && ktcIsIdentifier(value.rowId)) {
    return { type: "open", reportId: value.reportId, rowId: value.rowId };
  }
  return undefined;
}

function ktcParseProjectRenameRules(value: unknown): readonly KtcProjectRenameRule[] | undefined {
  if (!Array.isArray(value) || value.length > KTC_PROJECT_RENAME_MAX_RULES) return undefined;
  const rules = value.map(ktcParseProjectRenameRule);
  return rules.some((rule) => rule === undefined)
    ? undefined
    : rules as readonly KtcProjectRenameRule[];
}

function ktcParseProjectRenameRule(value: unknown): KtcProjectRenameRule | undefined {
  if (!ktcIsRecord(value)
    || !ktcIsIdentifier(value.id, 128)
    || !ktcIsProjectRenameRuleStyle(value.style)
    || !ktcIsBoundedString(value.search)
    || !ktcIsBoundedString(value.replace)
    || typeof value.enabled !== "boolean"
    || (value.parentId !== undefined && !ktcIsIdentifier(value.parentId, 128))
    || (value.relationKind !== undefined
      && (typeof value.relationKind !== "string" || !KTC_PROJECT_RENAME_RELATION_KINDS.has(value.relationKind)))
    || (value.source !== undefined && value.source !== "generated" && value.source !== "user")) return undefined;
  return {
    id: value.id,
    style: value.style,
    search: value.search,
    replace: value.replace,
    enabled: value.enabled,
    ...(typeof value.parentId === "string" ? { parentId: value.parentId } : {}),
    ...(typeof value.relationKind === "string"
      ? { relationKind: value.relationKind as KtcProjectRenameRule["relationKind"] }
      : {}),
    ...(value.source === "generated" || value.source === "user" ? { source: value.source } : {}),
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
