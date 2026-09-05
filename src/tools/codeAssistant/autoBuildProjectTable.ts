import { basename, isAbsolute, relative, resolve, win32 } from "node:path";

export type KtcAutoBuildProbeStatus = "clean" | "modified" | "invalid" | "not-git" | "script-mismatch" | "unknown";

export interface KtcAutoBuildProjectOperations {
  update: boolean;
  cmake: boolean;
  caa: boolean;
  linkCaa: boolean;
}
export interface KtcAutoBuildProjectProbe {
  capturedAt: string;
  branch: string;
  commit: string;
  origin: string;
  status: KtcAutoBuildProbeStatus;
  message?: string;
}

export interface KtcAutoBuildProjectRow {
  id: string;
  enabled: boolean;
  name: string;
  path: string;
  branch: string;
  operations: KtcAutoBuildProjectOperations;
  probe?: KtcAutoBuildProjectProbe;
}

function ktcIsWindowsAbsolutePath(value: string): boolean {
  return win32.isAbsolute(value);
}

function ktcIsParentPath(value: string): boolean {
  return value === ".." || value.startsWith("../") || value.startsWith("..\\");
}

export function ktcResolveAutoBuildPath(path: string, workingDirectory: string): string {
  const value = path.trim();
  if (ktcIsWindowsAbsolutePath(value)) return win32.normalize(value);
  if (ktcIsWindowsAbsolutePath(workingDirectory)) return win32.resolve(workingDirectory, value);
  return isAbsolute(value) ? resolve(value) : resolve(workingDirectory, value);
}

export function ktcStoreAutoBuildPath(path: string, workingDirectory: string): string {
  if (ktcIsWindowsAbsolutePath(path) || ktcIsWindowsAbsolutePath(workingDirectory)) {
    const absolute = ktcIsWindowsAbsolutePath(path) ? win32.normalize(path) : path;
    if (!ktcIsWindowsAbsolutePath(absolute) || !ktcIsWindowsAbsolutePath(workingDirectory)) return absolute;
    const candidate = win32.relative(win32.resolve(workingDirectory), absolute);
    if (!candidate || candidate === ".") return ".";
    return win32.isAbsolute(candidate) || ktcIsParentPath(candidate) ? absolute : candidate;
  }
  const absolute = resolve(path);
  const candidate = relative(resolve(workingDirectory), absolute);
  if (!candidate || candidate === ".") return ".";
  if (isAbsolute(candidate) || ktcIsParentPath(candidate)) return absolute;
  return candidate;
}

export function ktcCreateAutoBuildProjectRow(path: string, workingDirectory: string, index: number): KtcAutoBuildProjectRow {
  const absolute = ktcResolveAutoBuildPath(path, workingDirectory);
  return {
    id: `project-${index}-${absolute.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    enabled: true,
    name: (ktcIsWindowsAbsolutePath(absolute) ? win32.basename(absolute) : basename(absolute)) || absolute,
    path: ktcStoreAutoBuildPath(absolute, workingDirectory),
    branch: "master",
    operations: { update: false, cmake: false, caa: false, linkCaa: false },
  };
}
