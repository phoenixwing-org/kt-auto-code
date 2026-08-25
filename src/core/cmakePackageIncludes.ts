import { posix } from "node:path";

export const KTC_CMAKE_PACKAGE_HEADER_EXTENSIONS = new Set([".h", ".hpp"]);
export const KTC_CMAKE_PACKAGE_TARGET_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx",
]);

export interface KtcCmakePackageHeaderMapping {
  readonly fileNameKey: string;
  readonly fileName: string;
  readonly includePath: string;
  readonly sourceRelativePath: string;
}

export interface KtcCmakePackageHeaderCollision {
  readonly fileName: string;
  readonly includePaths: readonly string[];
}

export interface KtcCmakePackageHeaderMap {
  readonly mappings: ReadonlyMap<string, KtcCmakePackageHeaderMapping>;
  readonly collisions: readonly KtcCmakePackageHeaderCollision[];
  readonly skippedUnqualifiedHeaders: readonly string[];
}

export interface KtcCmakePackageIncludeMatch {
  readonly line: number;
  readonly oldValue: string;
  readonly newValue: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}

function normalized(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Converts legacy `KtCore/source/KtString.h` and an already package-qualified
 * `KtCore/KtString.h` into the canonical `KtCore/KtString.h` form.
 */
export function ktcCmakePackageIncludePath(relativePath: string): string | undefined {
  const parts = normalized(relativePath).split("/").filter(Boolean);
  const sourceIndex = parts.findIndex((part) => part.toLocaleLowerCase("en-US") === "source");
  const includeParts = sourceIndex >= 0
    ? parts.filter((_, index) => index !== sourceIndex)
    : parts;
  // A flat include root has no package name and cannot be made into a package
  // include safely. Source-free roots are accepted only when already qualified.
  if (includeParts.length < 2) return undefined;
  return includeParts.length > 0 ? includeParts.join("/") : undefined;
}

/**
 * Builds a case-insensitive file-name map. Ambiguous names are intentionally
 * excluded: Preview reports them and Apply never guesses a package.
 */
export function ktcBuildCmakePackageHeaderMap(relativePaths: readonly string[]): KtcCmakePackageHeaderMap {
  const grouped = new Map<string, KtcCmakePackageHeaderMapping[]>();
  const skippedUnqualifiedHeaders: string[] = [];
  for (const input of relativePaths) {
    const sourceRelativePath = normalized(input);
    const extension = posix.extname(sourceRelativePath).toLocaleLowerCase("en-US");
    if (!KTC_CMAKE_PACKAGE_HEADER_EXTENSIONS.has(extension)) continue;
    const includePath = ktcCmakePackageIncludePath(sourceRelativePath);
    if (!includePath) {
      skippedUnqualifiedHeaders.push(sourceRelativePath);
      continue;
    }
    const fileName = posix.basename(includePath);
    const fileNameKey = fileName.toLocaleLowerCase("en-US");
    const item = { fileNameKey, fileName, includePath, sourceRelativePath };
    const current = grouped.get(fileNameKey) ?? [];
    current.push(item);
    grouped.set(fileNameKey, current);
  }

  const mappings = new Map<string, KtcCmakePackageHeaderMapping>();
  const collisions: KtcCmakePackageHeaderCollision[] = [];
  for (const [key, items] of grouped) {
    const includePaths = [...new Set(items.map(({ includePath }) => includePath))].sort();
    if (includePaths.length === 1) mappings.set(key, items[0]);
    else collisions.push({ fileName: items[0].fileName, includePaths });
  }
  return {
    mappings,
    collisions: collisions.sort((a, b) => a.fileName.localeCompare(b.fileName)),
    skippedUnqualifiedHeaders: skippedUnqualifiedHeaders.sort(),
  };
}

const INCLUDE_LINE = /^(\s*#\s*include\s*)([<"])([^>"]+)([>"])(.*)$/;

/** Finds only valid preprocessor include lines, preserving spacing/comments/EOL. */
export function ktcFindCmakePackageIncludeMatches(
  text: string,
  mappings: ReadonlyMap<string, KtcCmakePackageHeaderMapping>,
): readonly KtcCmakePackageIncludeMatch[] {
  const matches: KtcCmakePackageIncludeMatch[] = [];
  let offset = 0;
  let line = 1;
  while (offset <= text.length) {
    const nextNewline = text.indexOf("\n", offset);
    const end = nextNewline < 0 ? text.length : nextNewline;
    const lineText = text.slice(offset, end).replace(/\r$/, "");
    const parsed = lineText.match(INCLUDE_LINE);
    if (parsed) {
      const oldPath = parsed[3].trim().replace(/\\/g, "/");
      const key = posix.basename(oldPath).toLocaleLowerCase("en-US");
      const mapping = mappings.get(key);
      // Canonicalize both the package path's case and quote style. A qualified
      // but quoted include still needs to become the documented package form.
      if (mapping && (oldPath !== mapping.includePath || parsed[2] !== "<" || parsed[4] !== ">")) {
        matches.push({
          line,
          oldValue: lineText,
          newValue: `${parsed[1]}<${mapping.includePath}>${parsed[5]}`,
          lineStart: offset,
          lineEnd: offset + lineText.length,
        });
      }
    }
    if (nextNewline < 0) break;
    offset = nextNewline + 1;
    line += 1;
  }
  return matches;
}

export function ktcApplyCmakePackageIncludeMatches(
  text: string,
  matches: readonly KtcCmakePackageIncludeMatch[],
): string {
  return [...matches].sort((a, b) => b.lineStart - a.lineStart).reduce(
    (result, match) => result.slice(0, match.lineStart) + match.newValue + result.slice(match.lineEnd),
    text,
  );
}
