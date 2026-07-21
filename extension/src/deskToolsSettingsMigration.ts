import * as vscode from "vscode";

type InspectedValue<T> = ReturnType<vscode.WorkspaceConfiguration["inspect"]> & {
  readonly globalValue?: T;
  readonly workspaceValue?: T;
  readonly workspaceFolderValue?: T;
};

export type KtcExplicitConfigurationValue<T> = {
  readonly found: boolean;
  readonly value?: T;
};

export function ktcExplicitConfigurationValue<T>(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
): KtcExplicitConfigurationValue<T> {
  const inspected = configuration.inspect<T>(key) as InspectedValue<T> | undefined;
  if (!inspected) return { found: false };
  if (inspected.workspaceFolderValue !== undefined) return { found: true, value: inspected.workspaceFolderValue };
  if (inspected.workspaceValue !== undefined) return { found: true, value: inspected.workspaceValue };
  if (inspected.globalValue !== undefined) return { found: true, value: inspected.globalValue };
  return { found: false };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

async function migrateValue<T>(options: {
  readonly target: vscode.WorkspaceConfiguration;
  readonly targetKey: string;
  readonly source: vscode.WorkspaceConfiguration;
  readonly sourceKey: string;
  readonly valid: (value: unknown) => value is T;
  readonly normalize?: (value: T) => T;
}): Promise<boolean> {
  if (ktcExplicitConfigurationValue(options.target, options.targetKey).found) return false;
  const legacy = ktcExplicitConfigurationValue<unknown>(options.source, options.sourceKey);
  if (!legacy.found || !options.valid(legacy.value)) return false;
  const value = options.normalize ? options.normalize(legacy.value) : legacy.value;
  await options.target.update(options.targetKey, value, vscode.ConfigurationTarget.Global);
  return true;
}

/**
 * Copies explicitly configured legacy integration values into the unified machine settings.
 * Defaults are never migrated and an existing new value always wins. The legacy keys remain
 * readable for one release cycle, so a partial update cannot break the user's current setup.
 */
export async function ktcMigrateLegacyDeskToolsSettings(): Promise<readonly string[]> {
  const target = vscode.workspace.getConfiguration("ktAutoCode.deskTools");
  const caaLegacy = vscode.workspace.getConfiguration("ktAutoCode.caa.externalEditor");
  const cadLegacy = vscode.workspace.getConfiguration("ktAutoCad");
  const migrated: string[] = [];

  if (await migrateValue({
    target,
    targetKey: "executable",
    source: caaLegacy,
    sourceKey: "command",
    valid: nonEmptyString,
    normalize: (value) => value.trim(),
  })) migrated.push("executable");

  if (await migrateValue({
    target,
    targetKey: "executableArgs",
    source: caaLegacy,
    sourceKey: "args",
    valid: stringArray,
  })) migrated.push("executableArgs");

  const endpointMigrated = await migrateValue({
    target,
    targetKey: "serviceEndpoint",
    source: caaLegacy,
    sourceKey: "endpoint",
    valid: nonEmptyString,
    normalize: (value) => value.trim(),
  });
  if (endpointMigrated) {
    migrated.push("serviceEndpoint");
    if (!ktcExplicitConfigurationValue(target, "discoveryMode").found) {
      await target.update("discoveryMode", "custom", vscode.ConfigurationTarget.Global);
      migrated.push("discoveryMode");
    }
  }

  if (await migrateValue({
    target,
    targetKey: "nativeProviderManifest",
    source: cadLegacy,
    sourceKey: "deskToolsProviderManifest",
    valid: nonEmptyString,
    normalize: (value) => value.trim(),
  })) migrated.push("nativeProviderManifest");

  return migrated;
}
