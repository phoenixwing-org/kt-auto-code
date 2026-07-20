import * as vscode from "vscode";
import type { EncodingTargetPolicy, ExpectedEncoding } from "../../../../src/fileEncoding.js";

export type EncodingTargetSetting = "ascii" | "utf8" | "gbk";
export type EncodingTargetOverrideSetting = "inherit" | EncodingTargetSetting;

export interface EncodingFixOptions {
  defaultTarget: "utf8" | "gbk";
  headerTarget: EncodingTargetOverrideSetting;
  sourceTarget: EncodingTargetOverrideSetting;
  markdownTarget: EncodingTargetOverrideSetting;
}

const TARGETS = new Set<EncodingTargetSetting>(["ascii", "utf8", "gbk"]);

function resource(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function configuration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("ktAutoCode.encodingFix", resource());
}

function target(value: unknown, fallback: EncodingTargetSetting): EncodingTargetSetting {
  return typeof value === "string" && TARGETS.has(value as EncodingTargetSetting)
    ? value as EncodingTargetSetting
    : fallback;
}

function override(value: unknown): EncodingTargetOverrideSetting {
  return typeof value === "string" && TARGETS.has(value as EncodingTargetSetting)
    ? value as EncodingTargetSetting
    : "inherit";
}

export function getEncodingFixOptions(): EncodingFixOptions {
  const config = configuration();
  const defaultTarget = target(config.get("defaultTarget"), "utf8");
  return {
    defaultTarget: defaultTarget === "gbk" ? "gbk" : "utf8",
    headerTarget: override(config.get("headerTarget", "inherit")),
    sourceTarget: override(config.get("sourceTarget", "inherit")),
    markdownTarget: override(config.get("markdownTarget", "inherit")),
  };
}

function inherited(value: EncodingTargetOverrideSetting): ExpectedEncoding | undefined {
  return value === "inherit" ? undefined : value;
}

export function getEncodingTargetPolicy(): EncodingTargetPolicy {
  const options = getEncodingFixOptions();
  return {
    defaultTarget: options.defaultTarget,
    headerTarget: inherited(options.headerTarget),
    sourceTarget: inherited(options.sourceTarget),
    markdownTarget: inherited(options.markdownTarget),
  };
}

export async function setWorkspaceDefaultEncodingTarget(value: "utf8" | "gbk"): Promise<void> {
  const config = configuration();
  const targetScope = resource()
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Workspace;
  await config.update("defaultTarget", value, targetScope);
}

export async function openWorkspaceEncodingSettings(): Promise<void> {
  const command = resource()
    ? "workbench.action.openWorkspaceSettings"
    : "workbench.action.openSettings";
  await vscode.commands.executeCommand(command, "@ext:kuntai.kt-auto-code encodingFix");
}
