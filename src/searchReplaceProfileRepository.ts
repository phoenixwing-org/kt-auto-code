import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { PHOENIX_CONFIG_DIR } from "./dotIgnore.js";
import {
  ktcEmptySearchReplaceProfileDocument,
  ktcParseSearchReplaceProfileDocument,
  type KtcSearchReplaceProfileDocument,
} from "./searchReplaceProfiles.js";

export const KTC_SEARCH_REPLACE_PROFILE_FILE = "search-replace.json";

export interface KtcSearchReplaceProfileSnapshot {
  document: KtcSearchReplaceProfileDocument;
  filePath: string;
  exists: boolean;
  error?: string;
}

export function ktcWorkspaceSearchReplaceProfilePath(root: string): string {
  return join(root, PHOENIX_CONFIG_DIR, KTC_SEARCH_REPLACE_PROFILE_FILE);
}

export function ktcLoadWorkspaceSearchReplaceProfiles(root: string): KtcSearchReplaceProfileSnapshot {
  const filePath = ktcWorkspaceSearchReplaceProfilePath(root);
  if (!existsSync(filePath)) {
    return { document: ktcEmptySearchReplaceProfileDocument(), filePath, exists: false };
  }
  try {
    return {
      document: ktcParseSearchReplaceProfileDocument(readFileSync(filePath, "utf8")),
      filePath,
      exists: true,
    };
  } catch (error) {
    return {
      document: ktcEmptySearchReplaceProfileDocument(),
      filePath,
      exists: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function ktcWriteWorkspaceSearchReplaceProfiles(
  root: string,
  document: KtcSearchReplaceProfileDocument,
): KtcSearchReplaceProfileSnapshot {
  const current = ktcLoadWorkspaceSearchReplaceProfiles(root);
  if (current.error) throw new Error(`现有规则档案无效，未覆盖：${current.error}`);
  const filePath = current.filePath;
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  const validated = ktcParseSearchReplaceProfileDocument(serialized);
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, serialized, "utf8");
    renameSync(tempPath, filePath);
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }
  return { document: validated, filePath, exists: true };
}
