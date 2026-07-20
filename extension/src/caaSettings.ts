import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { ktcSubmitCaaDialog } from "./caaDeskBridge.js";
import {
  ktcDeskToolsOpenEndpoint,
  ktcReadDeskToolsInstallationRegistration,
  ktcReadDeskToolsServiceRegistration,
} from "./deskToolsDiscovery.js";
import { ktcExplicitConfigurationValue } from "./deskToolsSettingsMigration.js";

const SETTINGS_QUERY = "@ext:kuntai.kt-auto-code deskTools";
const LEGACY_ENDPOINT = "http://127.0.0.1:5180/api/caa/dialog/open";

export type KtcCaaExternalEditor = {
  readonly discoveryMode: "auto" | "custom" | "disabled";
  readonly command: string;
  readonly args: readonly string[];
  readonly endpoint: string;
};

export type KtcResolvedCaaEndpoint = {
  readonly endpoint: string;
  readonly source: "registration" | "custom" | "legacy";
};

/** Opens plugin-owned settings only; operating-system environment values live in the Environment Block. */
export async function ktcOpenCaaSettings(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", SETTINGS_QUERY);
}

export function ktcReadCaaExternalEditor(): KtcCaaExternalEditor {
  const config = vscode.workspace.getConfiguration("ktAutoCode.deskTools");
  const legacy = vscode.workspace.getConfiguration("ktAutoCode.caa.externalEditor");
  const mode = config.get<string>("discoveryMode", "auto");
  const discoveryMode = mode === "custom" || mode === "disabled" ? mode : "auto";
  const configuredCommand = ktcExplicitConfigurationValue<unknown>(config, "executable");
  const command = (configuredCommand.found
    ? typeof configuredCommand.value === "string" ? configuredCommand.value : ""
    : legacy.get<string>("command", "")).trim();
  const configuredArgs = ktcExplicitConfigurationValue<unknown>(config, "executableArgs");
  const legacyArgs = legacy.get<readonly unknown[]>("args", ["${file}"]);
  const argsSource = configuredArgs.found && Array.isArray(configuredArgs.value)
    ? configuredArgs.value
    : legacyArgs;
  const args = argsSource.filter((arg): arg is string => typeof arg === "string");
  const configuredEndpoint = ktcExplicitConfigurationValue<unknown>(config, "serviceEndpoint");
  const endpoint = (configuredEndpoint.found
    ? typeof configuredEndpoint.value === "string" ? configuredEndpoint.value : ""
    : legacy.get<string>("endpoint", LEGACY_ENDPOINT)).trim();
  return { discoveryMode, command, args, endpoint };
}

export function ktcResolveCaaOpenEndpoint(
  editor = ktcReadCaaExternalEditor(),
): KtcResolvedCaaEndpoint | undefined {
  if (editor.discoveryMode === "disabled") return undefined;
  if (editor.discoveryMode === "custom") {
    return editor.endpoint ? { endpoint: editor.endpoint, source: "custom" } : undefined;
  }
  const registration = ktcReadDeskToolsServiceRegistration();
  if (registration) return { endpoint: ktcDeskToolsOpenEndpoint(registration), source: "registration" };
  return editor.endpoint ? { endpoint: editor.endpoint, source: "legacy" } : undefined;
}

export function ktcResolveDeskToolsNativeProvider(): string {
  const config = vscode.workspace.getConfiguration("ktAutoCode.deskTools");
  const explicit = ktcExplicitConfigurationValue<unknown>(config, "nativeProviderManifest");
  const configured = (typeof explicit.value === "string" ? explicit.value : "").trim();
  if (configured) return configured;
  const registered = ktcReadDeskToolsInstallationRegistration()?.native_provider_manifest;
  if (registered) return registered;
  if (explicit.found) return "";
  return vscode.workspace.getConfiguration("ktAutoCad")
    .get<string>("deskToolsProviderManifest", "").trim();
}

/** Submit to a running Desk Tools server, or start an explicitly configured executable. */
export async function ktcOpenCaaInExternalEditor(file: vscode.Uri, workspaceRoot?: string): Promise<"desk-tools" | "command"> {
  if (file.scheme !== "file") throw new Error("外部编辑器仅支持本地文件 URI");
  const editor = ktcReadCaaExternalEditor();
  if (!editor.command) {
    const resolved = ktcResolveCaaOpenEndpoint(editor);
    if (resolved) {
      await ktcSubmitCaaDialog(resolved.endpoint, { workspaceRoot, file: file.fsPath });
      return "desk-tools";
    }
    await ktcOpenCaaSettings();
    throw new Error(editor.discoveryMode === "disabled"
      ? "Desk Tools 桌面服务交接已在设置中禁用"
      : "未发现 Desk Tools 服务；请启动 Desk Tools 或检查集成设置");
  }
  const args = editor.args.map((arg) => arg.replaceAll("${file}", file.fsPath).replaceAll("${workspace}", workspaceRoot ?? ""));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor.command, args, { shell: false, windowsHide: true, detached: false });
    child.once("error", (error) => reject(new Error(`无法启动外部编辑器：${error.message}`)));
    child.once("spawn", () => resolve());
  });
  return "command";
}
