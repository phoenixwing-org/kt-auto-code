import * as vscode from "vscode";

const CONFIG_SECTION = "ktAutoCode";
const CONFIG_KEY_PRESERVE_GBK = "headerAscii.preserveGbk";
const CONFIG_KEY_STRIP_BOM = "headerAscii.stripBom";

/** 是否保留 GBK 中文（默认 false → 纯 ASCII 模式） */
export function getPreserveGbk(): boolean {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>(CONFIG_KEY_PRESERVE_GBK, false);
}

/** 去除 UTF-8 BOM / UTF-16 等转为 UTF-8 无 BOM（默认 false） */
export function getStripBom(): boolean {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>(CONFIG_KEY_STRIP_BOM, false);
}

export function isAsciiOnly(): boolean {
  return !getPreserveGbk();
}

export async function setPreserveGbk(value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(CONFIG_KEY_PRESERVE_GBK, value, vscode.ConfigurationTarget.Global);
}

export async function setStripBom(value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(CONFIG_KEY_STRIP_BOM, value, vscode.ConfigurationTarget.Global);
}

export function getModeLabel(): string {
  const parts = [getPreserveGbk() ? "仅弯引号等问题字节" : "纯 ASCII（不含 GBK）"];
  if (getStripBom()) {
    parts.push("去 BOM→UTF-8");
  }
  return parts.join("；");
}
