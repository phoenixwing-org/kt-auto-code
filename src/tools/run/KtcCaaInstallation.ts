import path from "node:path";

export interface KtcCaaInstallation {
  readonly radeRoot: string;
  readonly catiaRoot: string;
}

export interface KtcCaaInstallationInput {
  readonly version: string;
  readonly radeRoot?: string;
  readonly catiaRoot?: string;
}

/**
 * Resolves machine-local CAA installations without putting their paths into a
 * workspace setting. Empty roots retain the established C:\\DS convention.
 */
export function KtcResolveCaaInstallation(input: KtcCaaInstallationInput): KtcCaaInstallation {
  const version = KtcCaaVersion(input.version);
  const radeRoot = KtcWindowsRoot(input.radeRoot) ?? `C:\\DS\\RADE${version}`;
  const catiaRoot = KtcWindowsRoot(input.catiaRoot) ?? `C:\\DS\\B${version}`;
  return { radeRoot, catiaRoot };
}

export function KtcCaaInstallationArguments(installation: KtcCaaInstallation): readonly string[] {
  return [
    "--rade-root", installation.radeRoot,
    "--catia-root", installation.catiaRoot,
  ];
}

export function KtcCaaRadeCommandRoot(installation: KtcCaaInstallation): string {
  return path.win32.join(installation.radeRoot, "intel_a");
}

function KtcCaaVersion(value: string): string {
  const normalized = value.trim().replace(/^[A-Za-z]/u, "");
  if (!/^\d{2,4}$/u.test(normalized)) throw new Error(`CAA 版本无效：${value || "<empty>"}`);
  return normalized;
}

function KtcWindowsRoot(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/[\\/]+$/u, "");
  if (!normalized) return undefined;
  if (!path.win32.isAbsolute(normalized) || /[;"&|<>^%\r\n]/u.test(normalized)) {
    throw new Error(`CAA 安装目录无效：${value}`);
  }
  return normalized;
}
