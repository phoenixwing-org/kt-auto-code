import path from "node:path";

export type KtcCaaRuntimeDirectory = "win_b64" | "intel_a";

export interface KtcCaaInstallation {
  readonly radeRoot: string;
  readonly catiaRoot: string;
  readonly runtimeDirectory: KtcCaaRuntimeDirectory;
}

export interface KtcCaaInstallationInput {
  readonly version: string;
  readonly radeRoot?: string;
  readonly catiaRoot?: string;
  readonly runtimeDirectory?: string;
}

/**
 * Resolves machine-local CAA installations without putting their paths into a
 * workspace setting. Empty roots retain the established C:\\DS convention.
 */
export function KtcResolveCaaInstallation(input: KtcCaaInstallationInput): KtcCaaInstallation {
  const version = KtcCaaVersion(input.version);
  const runtimeDirectory = KtcCaaRuntimeDirectory(input.runtimeDirectory);
  const radeRoot = KtcWindowsRoot(input.radeRoot) ?? `C:\\DS\\RADE${version}`;
  const catiaRoot = KtcWindowsRoot(input.catiaRoot) ?? `C:\\DS\\B${version}`;
  return { radeRoot, catiaRoot, runtimeDirectory };
}

export function KtcCaaInstallationArguments(installation: KtcCaaInstallation): readonly string[] {
  return [
    "--rade-root", installation.radeRoot,
    "--catia-root", installation.catiaRoot,
    "--runtime", installation.runtimeDirectory,
  ];
}

export function KtcCaaRadeCommandRoot(installation: KtcCaaInstallation): string {
  return path.win32.join(installation.radeRoot, installation.runtimeDirectory);
}

export function KtcCaaRuntimeLabel(runtimeDirectory: KtcCaaRuntimeDirectory): string {
  return runtimeDirectory === "win_b64" ? "Windows 64 位（win_b64）" : "Windows 32 位（intel_a）";
}

function KtcCaaVersion(value: string): string {
  const normalized = value.trim().replace(/^[A-Za-z]/u, "");
  if (!/^\d{2,4}$/u.test(normalized)) throw new Error(`CAA 版本无效：${value || "<empty>"}`);
  return normalized;
}

function KtcCaaRuntimeDirectory(value: string | undefined): KtcCaaRuntimeDirectory {
  if (!value || value === "win_b64") return "win_b64";
  if (value === "intel_a") return "intel_a";
  throw new Error(`CAA 平台目录无效：${value}`);
}

function KtcWindowsRoot(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/[\\/]+$/u, "");
  if (!normalized) return undefined;
  if (!path.win32.isAbsolute(normalized) || /[;"&|<>^%\r\n]/u.test(normalized)) {
    throw new Error(`CAA 安装目录无效：${value}`);
  }
  return normalized;
}
