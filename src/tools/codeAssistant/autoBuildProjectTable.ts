import { basename, isAbsolute, relative, resolve } from "node:path";

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

export function ktcResolveAutoBuildPath(path: string, workingDirectory: string): string {
  const value = path.trim();
  return isAbsolute(value) ? resolve(value) : resolve(workingDirectory, value);
}

export function ktcStoreAutoBuildPath(path: string, workingDirectory: string): string {
  const absolute = resolve(path);
  const candidate = relative(resolve(workingDirectory), absolute);
  if (!candidate || candidate === ".") return ".";
  if (isAbsolute(candidate) || candidate.startsWith(`..\\`) || candidate === ".." || candidate.startsWith("../")) return absolute;
  return candidate;
}

export function ktcCreateAutoBuildProjectRow(path: string, workingDirectory: string, index: number): KtcAutoBuildProjectRow {
  const absolute = ktcResolveAutoBuildPath(path, workingDirectory);
  return {
    id: `project-${index}-${absolute.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    enabled: true,
    name: basename(absolute) || absolute,
    path: ktcStoreAutoBuildPath(absolute, workingDirectory),
    branch: "master",
    operations: { update: false, cmake: false, caa: false, linkCaa: false },
  };
}
