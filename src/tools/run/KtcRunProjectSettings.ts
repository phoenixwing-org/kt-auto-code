import path from "node:path";

type KtcPathApi = Pick<typeof path, "isAbsolute" | "normalize" | "relative" | "resolve" | "sep">;

export function KtcSerializeCaaRelatedProjects(
  projectRoot: string,
  relatedRoots: readonly string[],
  pathApi: KtcPathApi = path,
): string[] {
  const root = pathApi.resolve(projectRoot);
  return KtcUniqueConfiguredPaths(relatedRoots.map((relatedRoot) => {
    const absolute = pathApi.resolve(relatedRoot);
    const relative = pathApi.relative(root, absolute);
    if (!relative) return ".";
    return pathApi.isAbsolute(relative)
      ? pathApi.normalize(absolute)
      : relative.split(pathApi.sep).join("/");
  }), pathApi).filter((value) => value !== ".");
}

export function KtcResolveCaaRelatedProjects(
  projectRoot: string,
  configuredPaths: readonly string[],
  pathApi: KtcPathApi = path,
): string[] {
  const root = pathApi.resolve(projectRoot);
  const resolved = configuredPaths.map((value) => pathApi.isAbsolute(value)
    ? pathApi.normalize(value)
    : pathApi.resolve(root, value));
  const unique = KtcUniqueAbsolutePaths(resolved, pathApi);
  const rootKey = KtcPathKey(root, pathApi);
  return unique.filter((value) => KtcPathKey(value, pathApi) !== rootKey);
}

function KtcUniqueConfiguredPaths(values: readonly string[], pathApi: KtcPathApi): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const normalized = value === "." || !pathApi.isAbsolute(value)
      ? value
      : pathApi.normalize(value);
    const key = pathApi.sep === "\\" ? normalized.toLocaleLowerCase() : normalized;
    if (!unique.has(key)) unique.set(key, normalized);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function KtcUniqueAbsolutePaths(values: readonly string[], pathApi: KtcPathApi): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const normalized = pathApi.normalize(pathApi.resolve(value));
    const key = KtcPathKey(normalized, pathApi);
    if (!unique.has(key)) unique.set(key, normalized);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function KtcPathKey(value: string, pathApi: KtcPathApi): string {
  const normalized = pathApi.normalize(pathApi.resolve(value));
  return pathApi.sep === "\\" ? normalized.toLocaleLowerCase() : normalized;
}
