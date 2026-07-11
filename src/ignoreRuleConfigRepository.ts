import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PHOENIX_CONFIG_DIR } from "./dotIgnore.js";
import {
  ktcGetBuiltinIgnoreRuleCatalog,
  ktcMergeIgnoreRuleCatalogs,
  ktcParseIgnoreRuleCatalogText,
  type KtcIgnoreRuleCatalogDocument,
} from "./ignoreRuleCatalog.js";

export const KTC_WORKSPACE_IGNORE_RULE_CONFIG_FILE = "ignore-rules.json";

export interface KtcIgnoreRuleCatalogSnapshot {
  catalog: KtcIgnoreRuleCatalogDocument;
  configPath: string;
  workspaceConfigExists: boolean;
  error?: string;
}

export function ktcWorkspaceIgnoreRuleConfigPath(root: string): string {
  return join(root, PHOENIX_CONFIG_DIR, KTC_WORKSPACE_IGNORE_RULE_CONFIG_FILE);
}

export function ktcLoadWorkspaceIgnoreRuleCatalog(root: string): KtcIgnoreRuleCatalogSnapshot {
  const configPath = ktcWorkspaceIgnoreRuleConfigPath(root);
  const builtin = ktcGetBuiltinIgnoreRuleCatalog();
  if (!existsSync(configPath)) {
    return { catalog: builtin, configPath, workspaceConfigExists: false };
  }
  try {
    const extension = ktcParseIgnoreRuleCatalogText(readFileSync(configPath, "utf8"));
    return {
      catalog: ktcMergeIgnoreRuleCatalogs(builtin, extension),
      configPath,
      workspaceConfigExists: true,
    };
  } catch (error) {
    return {
      catalog: builtin,
      configPath,
      workspaceConfigExists: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
