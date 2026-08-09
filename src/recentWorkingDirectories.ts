import { isAbsolute, normalize, resolve } from "node:path";

const KTC_RECENT_WORKING_DIRECTORIES_KEY = "ktAutoCode.searchReplace.recentWorkingDirectories";
const KTC_RECENT_WORKSPACE_DIRECTORIES_KEY = "ktAutoCode.searchReplace.recentWorkspaceDirectories";
const KTC_RECENT_WORKING_DIRECTORIES_LIMIT = 12;

export interface KtcMementoLike {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

function pathIdentity(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin"
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;
}

type KtcDirectoryNormalizer = (value: string) => string | undefined;

class KtcRecentDirectoryStore {
  constructor(
    private readonly memento: KtcMementoLike,
    private readonly key: string,
    private readonly normalizeValue: KtcDirectoryNormalizer,
  ) {}

  list(): readonly string[] {
    const stored = this.memento.get<unknown>(this.key, []);
    if (!Array.isArray(stored)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of stored) {
      if (typeof value !== "string") continue;
      const normalized = this.normalizeValue(value);
      if (!normalized) continue;
      const identity = pathIdentity(normalized);
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push(normalized);
      if (result.length === KTC_RECENT_WORKING_DIRECTORIES_LIMIT) break;
    }
    return result;
  }

  async remember(directory: string): Promise<readonly string[]> {
    const normalized = this.normalizeValue(directory);
    if (!normalized) return this.list();
    const identity = pathIdentity(normalized);
    const next = [
      normalized,
      ...this.list().filter((item) => pathIdentity(item) !== identity),
    ].slice(0, KTC_RECENT_WORKING_DIRECTORIES_LIMIT);
    await this.memento.update(this.key, next);
    return next;
  }
}

function normalizeGlobalDirectory(value: string): string | undefined {
  return isAbsolute(value) ? resolve(value) : undefined;
}

function normalizeWorkspaceDirectory(value: string): string | undefined {
  if (isAbsolute(value)) return undefined;
  const normalized = normalize(value.trim()).replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }
  return normalized;
}

export class KtcRecentWorkingDirectoryStore extends KtcRecentDirectoryStore {
  constructor(memento: KtcMementoLike) {
    super(memento, KTC_RECENT_WORKING_DIRECTORIES_KEY, normalizeGlobalDirectory);
  }
}

export class KtcRecentWorkspaceDirectoryStore extends KtcRecentDirectoryStore {
  constructor(memento: KtcMementoLike) {
    super(memento, KTC_RECENT_WORKSPACE_DIRECTORIES_KEY, normalizeWorkspaceDirectory);
  }
}
