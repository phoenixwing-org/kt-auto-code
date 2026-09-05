import * as nodePath from "node:path";

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

type KtcPathApi = Pick<typeof nodePath, "basename" | "isAbsolute" | "join" | "parse" | "relative" | "resolve" | "sep">;
type KtcPathDialect = "invalid" | "relative" | "posix" | "windows" | "windows-drive-relative" | "windows-root-relative";

function ktcClassifyPath(value: string): KtcPathDialect {
  if (/^[A-Za-z]:[\\/]/u.test(value)
    || /^\\\\\?\\(?:[A-Za-z]:[\\/]|UNC\\[^/\\]+[/\\][^/\\]+(?:[/\\]|$))/iu.test(value)
    || /^[\\/]{2}[^?./\\][^/\\]*[/\\][^/\\]+(?:[/\\]|$)/u.test(value)) return "windows";
  if (/^[A-Za-z]:(?![\\/])/u.test(value)) return "windows-drive-relative";
  if (/^\\(?!\\)/u.test(value)) return "windows-root-relative";
  if (/^[\\/]{2}/u.test(value)) return "invalid";
  if (nodePath.posix.isAbsolute(value)) return "posix";
  return "relative";
}

function ktcNormalizeAbsoluteWindowsPath(value: string): string {
  let normalized = nodePath.win32.normalize(value);
  // node:path drops the final separator when an extended drive path collapses to its root.
  if (/^\\\\\?\\[A-Za-z]:$/u.test(normalized)) normalized += "\\";
  if (ktcClassifyPath(normalized) !== "windows") throw new Error(`Windows 路径规范化后无效或越过共享根：${value}`);
  return normalized;
}

export function ktcCanAccessAutoBuildPathOnHost(value: string, platform: NodeJS.Platform): boolean {
  const dialect = ktcClassifyPath(value.trim());
  if (dialect === "windows") {
    try { ktcNormalizeAbsoluteWindowsPath(value.trim()); }
    catch { return false; }
  }
  return platform === "win32" ? dialect === "windows" : dialect === "posix";
}

export function ktcIsAbsoluteAutoBuildPath(value: string): boolean {
  const dialect = ktcClassifyPath(value.trim());
  if (dialect === "posix") return true;
  if (dialect !== "windows") return false;
  try { ktcNormalizeAbsoluteWindowsPath(value.trim()); return true; }
  catch { return false; }
}

export function ktcIsAutoBuildFilesystemRoot(value: string): boolean {
  const dialect = ktcClassifyPath(value.trim());
  if (dialect !== "windows" && dialect !== "posix") return false;
  const pathApi = dialect === "windows" ? nodePath.win32 : nodePath.posix;
  let normalized: string;
  try { normalized = dialect === "windows" ? ktcNormalizeAbsoluteWindowsPath(value) : pathApi.resolve(value); }
  catch { return true; }
  if (/^\\\\\?\\UNC\\[^\\]+\\[^\\]+\\?$/iu.test(normalized)) return true;
  return normalized.toLocaleLowerCase() === pathApi.parse(normalized).root.toLocaleLowerCase();
}

function ktcSelectPathApi(value: string, workingDirectory = ""): KtcPathApi {
  const valueDialect = ktcClassifyPath(value.trim());
  if (valueDialect === "windows" || valueDialect === "windows-drive-relative" || valueDialect === "windows-root-relative") return nodePath.win32;
  if (valueDialect === "posix") return nodePath.posix;
  const workingDialect = ktcClassifyPath(workingDirectory.trim());
  if (workingDialect === "windows" || workingDialect === "windows-drive-relative" || workingDialect === "windows-root-relative") return nodePath.win32;
  if (workingDialect === "posix") return nodePath.posix;
  return nodePath;
}

export function ktcJoinAutoBuildPath(root: string, ...segments: string[]): string {
  const dialect = ktcClassifyPath(root.trim());
  if (dialect === "invalid") throw new Error(`路径格式不完整：${root}`);
  if (dialect === "windows-drive-relative" || dialect === "windows-root-relative") throw new Error(`不支持依赖当前盘符的路径：${root}`);
  const normalizedRoot = dialect === "windows" ? ktcNormalizeAbsoluteWindowsPath(root) : root;
  const joined = ktcSelectPathApi(normalizedRoot).join(normalizedRoot, ...segments);
  return dialect === "windows" ? ktcNormalizeAbsoluteWindowsPath(joined) : joined;
}

export function ktcResolveAutoBuildPath(path: string, workingDirectory: string): string {
  const value = path.trim();
  if (!value) throw new Error("路径不能为空。");
  const valueDialect = ktcClassifyPath(value);
  const workingDialect = ktcClassifyPath(workingDirectory.trim());
  if (valueDialect === "invalid") throw new Error(`路径格式不完整：${value}`);
  if (valueDialect === "windows-drive-relative") throw new Error(`不支持盘符相对路径：${value}`);
  if (valueDialect === "windows-root-relative") {
    if (workingDialect !== "windows") throw new Error(`Windows 根相对路径缺少绝对工作目录：${value}`);
    if (/^\\\\\?\\/u.test(workingDirectory.trim())) throw new Error(`命名空间 Windows 路径不支持根相对项目路径：${value}`);
    return ktcNormalizeAbsoluteWindowsPath(nodePath.win32.resolve(workingDirectory, value));
  }
  if (valueDialect === "windows") return ktcNormalizeAbsoluteWindowsPath(value);
  if (valueDialect === "posix") return nodePath.posix.resolve(value);
  if (!workingDirectory.trim()) throw new Error(`相对路径缺少绝对工作目录：${value || "."}`);
  if (workingDialect === "windows-drive-relative") throw new Error(`不支持盘符相对路径：${workingDirectory}`);
  if (workingDialect === "windows-root-relative") throw new Error(`Windows 工作目录必须包含盘符或 UNC 根：${workingDirectory}`);
  if (workingDialect === "invalid") throw new Error(`工作目录路径格式不完整：${workingDirectory}`);
  if (workingDialect === "relative") throw new Error(`工作目录必须使用绝对路径：${workingDirectory}`);
  const pathApi = ktcSelectPathApi(value, workingDirectory);
  const resolved = pathApi.resolve(workingDirectory, value);
  return pathApi === nodePath.win32 ? ktcNormalizeAbsoluteWindowsPath(resolved) : resolved;
}

export function ktcStoreAutoBuildPath(path: string, workingDirectory: string): string {
  const absolute = ktcResolveAutoBuildPath(path, workingDirectory);
  if (!workingDirectory.trim()) return absolute;
  const base = ktcResolveAutoBuildPath(workingDirectory, "");
  const pathApi = ktcSelectPathApi(absolute);
  if (pathApi !== ktcSelectPathApi(base)) return absolute;
  const candidate = pathApi.relative(base, absolute);
  if (!candidate || candidate === ".") return ".";
  if (pathApi.isAbsolute(candidate) || candidate === ".." || candidate.startsWith(`..${pathApi.sep}`)) return absolute;
  return candidate;
}

export function ktcCreateAutoBuildProjectRow(path: string, workingDirectory: string, index: number): KtcAutoBuildProjectRow {
  const absolute = ktcResolveAutoBuildPath(path, workingDirectory);
  const pathApi = ktcSelectPathApi(absolute, workingDirectory);
  return {
    id: `project-${index}-${absolute.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    enabled: true,
    name: pathApi.basename(absolute) || absolute,
    path: ktcStoreAutoBuildPath(absolute, workingDirectory),
    branch: "master",
    operations: { update: false, cmake: false, caa: false, linkCaa: false },
  };
}
