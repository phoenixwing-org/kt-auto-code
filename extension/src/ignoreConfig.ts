import * as vscode from "vscode";
import {
  ensurePhoenixIgnore,
  phoenixIgnoreFile,
  syncPhoenixIgnoreFromGit,
  type IgnoreConfigInfo,
} from "../../src/dotIgnore.js";
import type { IgnoreConfigSummary } from "./tools/types.js";

export function toIgnoreSummary(root: string, info: IgnoreConfigInfo): IgnoreConfigSummary {
  return {
    relativePath: `${".phoenix"}/.ignore`,
    fullPath: info.ignorePath,
    patternCount: info.patternCount,
    gitIgnoreExists: info.gitIgnoreExists,
    statusText: info.statusText,
  };
}

export function refreshIgnoreConfig(root: string | undefined): IgnoreConfigSummary | undefined {
  if (!root) return undefined;
  return toIgnoreSummary(root, ensurePhoenixIgnore(root));
}

export async function openIgnoreConfigFile(root: string): Promise<void> {
  ensurePhoenixIgnore(root);
  const uri = vscode.Uri.file(phoenixIgnoreFile(root));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

export function syncIgnoreFromGit(root: string): IgnoreConfigSummary {
  return toIgnoreSummary(root, syncPhoenixIgnoreFromGit(root));
}
