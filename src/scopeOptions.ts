import * as vscode from "vscode";
import type { FileScopeOptions } from "./core/workspace/scanScope.js";

const CONFIG_SECTION = "ktAutoCode";
const KEY_HEADERS = "scope.includeHeaders";
const KEY_SOURCE = "scope.includeSource";
const KEY_MARKDOWN = "scope.includeMarkdown";

export type ScopeOptionKey = "includeHeaders" | "includeSource" | "includeMarkdown";

export function getFileScope(): FileScopeOptions {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    includeHeaders: cfg.get<boolean>(KEY_HEADERS, true),
    includeSource: cfg.get<boolean>(KEY_SOURCE, true),
    includeMarkdown: cfg.get<boolean>(KEY_MARKDOWN, true),
  };
}

export async function setFileScopeOption(key: ScopeOptionKey, value: boolean): Promise<void> {
  const map: Record<ScopeOptionKey, string> = {
    includeHeaders: KEY_HEADERS,
    includeSource: KEY_SOURCE,
    includeMarkdown: KEY_MARKDOWN,
  };
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(map[key], value, vscode.ConfigurationTarget.Global);
}

export function isScopeEmpty(scope: FileScopeOptions, forEncoding: boolean): boolean {
  const byte = scope.includeHeaders || scope.includeSource;
  if (forEncoding) {
    return !byte && !scope.includeMarkdown;
  }
  return !byte;
}

export function scopeSummary(scope: FileScopeOptions): string {
  const parts: string[] = [];
  if (scope.includeHeaders) parts.push("头文件");
  if (scope.includeSource) parts.push("源文件");
  if (scope.includeMarkdown) parts.push(".md");
  return parts.length > 0 ? parts.join("、") : "（未勾选）";
}
