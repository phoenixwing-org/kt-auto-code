import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import {
  pnwResolveCaaEnvironment,
} from "@phoenix-wing/code-core";

const ENVIRONMENT_VARIABLES = [
  "ROOT_DIR",
  "SDK_PREFIX",
  "ROOT_DIR_CORE",
  "ROOT_DIR_INCLUDE",
  "ROOT_DIR_3rdParty",
  "CAA_MK_VERSION",
] as const;
export type KtcProjectEnvironmentVariable = typeof ENVIRONMENT_VARIABLES[number];
export type KtcProjectEnvironmentKey =
  | "customRoot"
  | "sdkPrefix"
  | "coreRoot"
  | "includeRoot"
  | "thirdPartyRoot"
  | "caaMkVersion";

export interface KtcProjectEnvironmentValue {
  readonly key: KtcProjectEnvironmentKey;
  readonly environmentVariable: KtcProjectEnvironmentVariable;
  readonly required: boolean;
  readonly source: "system" | "default" | "missing";
  readonly value?: string;
  readonly suggestedValue?: string;
}

export interface KtcProjectEnvironment {
  readonly values: readonly KtcProjectEnvironmentValue[];
  readonly complete: boolean;
}

/**
 * Chooses a stable starting folder for an environment-directory picker.
 * Unsaved text is accepted when it points at an existing directory; invalid
 * or empty text falls back to the current user's home directory.
 */
export function ktcResolveEnvironmentDirectoryPickerPath(
  configuredValue: string | undefined,
  homeDirectory: string,
  isDirectory: (candidate: string) => boolean = (candidate) => {
    try { return statSync(candidate).isDirectory(); }
    catch { return false; }
  },
): string {
  const candidate = configuredValue?.trim();
  return candidate && isDirectory(candidate) ? candidate : homeDirectory;
}

/** Keeps the declared variable order stable inside required/optional groups. */
export function ktcOrderProjectEnvironmentValues(
  values: readonly KtcProjectEnvironmentValue[],
): readonly KtcProjectEnvironmentValue[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => Number(right.value.required) - Number(left.value.required) || left.index - right.index)
    .map(({ value }) => value);
}

function ktcNormalizeWingEnvironmentValue(value: {
  readonly key: "customRoot" | "thirdPartyRoot" | "coreRoot" | "caaMkVersion";
  readonly environmentVariable: "ROOT_DIR" | "ROOT_DIR_3rdParty" | "ROOT_DIR_CORE" | "CAA_MK_VERSION";
  readonly required: boolean;
  readonly source: "workspace" | "system" | "missing";
  readonly value?: string;
  readonly suggestedValue?: string;
}): KtcProjectEnvironmentValue {
  return {
    ...value,
    // Auto reads process/registry values only; Wing's workspace source is not
    // used here, but normalizing keeps this adapter forward-compatible.
    source: value.source === "missing" ? "missing" : "system",
  };
}

const WINDOWS_ENVIRONMENT_KEYS = [
  "HKCU\\Environment",
  "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
] as const;

export interface KtcProjectEnvironmentReadOptions {
  readonly system?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly readWindowsVariable?: (name: KtcProjectEnvironmentVariable) => Promise<string | undefined>;
}

/** Parses one `reg.exe query ... /v NAME` result without depending on Windows locale text. */
export function ktcParseWindowsRegistryEnvironmentValue(output: string, name: string): string | undefined {
  const expected = name.toLocaleUpperCase();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\S+)\s+REG_(?:EXPAND_)?SZ\s+(.*?)\s*$/i);
    if (match?.[1]?.toLocaleUpperCase() === expected) return match[2]?.trim() || undefined;
  }
  return undefined;
}

async function queryWindowsRegistryEnvironmentVariable(name: KtcProjectEnvironmentVariable): Promise<string | undefined> {
  for (const registryKey of WINDOWS_ENVIRONMENT_KEYS) {
    const value = await new Promise<string | undefined>((resolve) => {
      execFile(
        "reg.exe",
        ["query", registryKey, "/v", name],
        { windowsHide: true, encoding: "utf8" },
        (error, stdout) => resolve(error ? undefined : ktcParseWindowsRegistryEnvironmentValue(stdout, name)),
      );
    });
    if (value) return value;
  }
  return undefined;
}

async function queryWindowsEnvironmentVariables(): Promise<Partial<Record<KtcProjectEnvironmentVariable, string>>> {
  try {
    const output = await runFile("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $r=@{}; foreach($n in $args) { $v=[Environment]::GetEnvironmentVariable($n, 'User'); if ([string]::IsNullOrWhiteSpace($v)) { $v=[Environment]::GetEnvironmentVariable($n, 'Machine') }; $r[$n]=$v }; [Console]::Write(($r | ConvertTo-Json -Compress))",
      ...ENVIRONMENT_VARIABLES,
    ]);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    return Object.fromEntries(ENVIRONMENT_VARIABLES.flatMap((name) => (
      typeof parsed[name] === "string" && parsed[name].trim() ? [[name, parsed[name].trim()]] : []
    )));
  } catch {
    // Minimal Windows installations may not expose PowerShell; reg.exe is the fallback.
  }
  const result: Partial<Record<KtcProjectEnvironmentVariable, string>> = {};
  for (const name of ENVIRONMENT_VARIABLES) {
    const value = await queryWindowsRegistryEnvironmentVariable(name);
    if (value) result[name] = value;
  }
  return result;
}

async function runFile(command: string, args: readonly string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    execFile(command, [...args], { windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });
}

function expandWindowsValue(value: string, system: Readonly<Record<string, string | undefined>>): string {
  return value.replace(/%([^%]+)%/g, (token, name: string) => system[name] ?? system[name.toLocaleUpperCase()] ?? token);
}

/**
 * Resolves explicit VS Code setting overrides before inherited system values.
 * On Windows, missing inherited values are refreshed from the user/machine
 * environment registry because Reload Window does not restart the VS Code main process.
 */
export async function ktcReadProjectEnvironment(
  options: KtcProjectEnvironmentReadOptions = {},
): Promise<KtcProjectEnvironment> {
  const system: Record<string, string | undefined> = { ...(options.system ?? process.env) };
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const refreshed = options.readWindowsVariable
      ? Object.fromEntries(await Promise.all(ENVIRONMENT_VARIABLES.map(async (name) => [name, await options.readWindowsVariable!(name)])))
      : await queryWindowsEnvironmentVariables();
    for (const name of ENVIRONMENT_VARIABLES) {
      const inheritedKey = Object.keys(system).find((key) => key.toLocaleUpperCase() === name.toLocaleUpperCase());
      if (inheritedKey && inheritedKey !== name) system[name] = system[inheritedKey];
      const current = refreshed[name];
      if (current?.trim()) system[name] = expandWindowsValue(current, system);
    }
  }
  const legacy = pnwResolveCaaEnvironment(system);
  const legacyByKey = new Map(legacy.values.map((value) => [value.key, value]));
  const sdkPrefix = system.SDK_PREFIX?.trim() || "kt";
  const includeRoot = system.ROOT_DIR_INCLUDE?.trim();
  const values: readonly KtcProjectEnvironmentValue[] = [
    ktcNormalizeWingEnvironmentValue(legacyByKey.get("customRoot")!),
    {
      key: "sdkPrefix",
      environmentVariable: "SDK_PREFIX",
      required: false,
      source: system.SDK_PREFIX?.trim() ? "system" : "default",
      value: sdkPrefix,
      suggestedValue: "kt",
    },
    ktcNormalizeWingEnvironmentValue(legacyByKey.get("coreRoot")!),
    {
      key: "includeRoot",
      environmentVariable: "ROOT_DIR_INCLUDE",
      required: false,
      source: includeRoot ? "system" : "missing",
      ...(includeRoot ? { value: includeRoot } : {}),
    },
    ktcNormalizeWingEnvironmentValue(legacyByKey.get("thirdPartyRoot")!),
    ktcNormalizeWingEnvironmentValue(legacyByKey.get("caaMkVersion")!),
  ];
  return { values, complete: values.filter((value) => value.required).every((value) => Boolean(value.value)) };
}

export async function ktcReadProjectEnvironmentStatus(): Promise<{
  readonly text: string;
  readonly complete: boolean;
  readonly values: readonly KtcProjectEnvironmentValue[];
}> {
  const environment = await ktcReadProjectEnvironment();
  const labels = environment.values.map((value) => `${value.environmentVariable}：${value.value ? "系统" : "未设定"}`);
  return { complete: environment.complete, text: labels.join("；"), values: environment.values };
}

/** Writes only the current user's OS environment; machine-level values are never changed. */
export async function ktcSetProjectEnvironmentVariable(name: KtcProjectEnvironmentVariable, value: string): Promise<void> {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} 不能为空`);
  if (process.platform === "win32") {
    const registryType = /%[^%]+%/.test(normalized) ? "REG_EXPAND_SZ" : "REG_SZ";
    await runFile("reg.exe", ["add", WINDOWS_ENVIRONMENT_KEYS[0], "/v", name, "/t", registryType, "/d", normalized, "/f"]);
  } else if (process.platform === "darwin") {
    await runFile("/bin/launchctl", ["setenv", name, normalized]);
  } else {
    throw new Error("当前系统没有统一的用户环境变量存储；请通过登录 shell 或系统环境管理器设置。 ");
  }
  process.env[name] = normalized;
}

/** Clears only the current user's value; a machine-level Windows value may become visible again. */
export async function ktcClearProjectEnvironmentVariable(name: KtcProjectEnvironmentVariable): Promise<void> {
  if (process.platform === "win32") {
    try { await runFile("reg.exe", ["delete", WINDOWS_ENVIRONMENT_KEYS[0], "/v", name, "/f"]); }
    catch { /* Missing user value is already the requested state. */ }
  } else if (process.platform === "darwin") {
    await runFile("/bin/launchctl", ["unsetenv", name]);
  } else {
    throw new Error("当前系统没有统一的用户环境变量存储；请通过登录 shell 或系统环境管理器清除。 ");
  }
  delete process.env[name];
}
