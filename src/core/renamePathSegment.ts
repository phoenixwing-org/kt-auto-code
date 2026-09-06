const KTC_WINDOWS_RESERVED_PATH_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$) *(?:\.|$)/iu;
const KTC_CROSS_PLATFORM_FORBIDDEN_PATH_CHARACTER = /[<>:"/\\|?*\u0000-\u001f]/u;

export interface KtcRenameFileSystemIdentity {
  readonly dev: number;
  readonly ino: number;
}

/**
 * Returns a user-facing reason when a generated file or directory basename
 * cannot be represented safely on every supported host.
 */
export function ktcRenamePathSegmentProblem(value: string): string | undefined {
  if (!value || value === "." || value === "..") {
    return "目标名称必须是非空的单层文件或目录名";
  }
  if (KTC_CROSS_PLATFORM_FORBIDDEN_PATH_CHARACTER.test(value)) {
    return "目标名称包含跨平台文件系统不允许的字符";
  }
  if (/[. ]$/u.test(value)) {
    return "目标名称不能以点或空格结尾";
  }
  if (KTC_WINDOWS_RESERVED_PATH_NAME.test(value)) {
    return "目标名称使用了 Windows 保留设备名";
  }
  if (value.length > 255 || Buffer.byteLength(value, "utf8") > 255) {
    return "目标名称超过跨平台单个路径组件的 255 长度限制";
  }
  return undefined;
}

/**
 * Case-folded path strings and inode numbers alone are insufficient: two
 * distinct hard-link directory entries share an inode on case-sensitive
 * volumes. Canonical paths must agree before a destination can be treated as
 * the source's case-insensitive alias.
 */
export function ktcRenamePathsReferToSameEntry(
  sourceRealPath: string,
  destinationRealPath: string,
  sourceIdentity: KtcRenameFileSystemIdentity,
  destinationIdentity: KtcRenameFileSystemIdentity,
): boolean {
  return sourceRealPath === destinationRealPath
    && sourceIdentity.dev === destinationIdentity.dev
    && sourceIdentity.ino === destinationIdentity.ino;
}
