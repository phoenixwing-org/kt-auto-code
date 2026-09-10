import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from "node:fs";
import { opendir, realpath } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH, ktcParseRootCleanupConfigurationYaml } from "../../core/rootCleanupPatterns.js";
import { ktcCleanPreviewedWingArtifacts, ktcPreviewWingCleanupArtifacts } from "./autoBuildCleanupWingAdapter.js";

export const KTC_CLEANUP_YAML_DISCOVERY_LIMITS = Object.freeze({
  maxRoots: 64, maxDepth: 6, maxDirectories: 2_048, maxEntries: 20_000, maxSources: 64,
  maxYamlBytes: KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH * 4,
});
type Limits = { -readonly [Key in keyof typeof KTC_CLEANUP_YAML_DISCOVERY_LIMITS]: number };
export interface KtcAutoBuildCleanupYamlSource {
  readonly id: string;
  readonly revision: number;
  readonly path: string;
  readonly root: string;
  readonly status: string;
  readonly disabledReason?: string;
  readonly deleted?: readonly string[];
}
export interface KtcAutoBuildCleanupYamlOptions {
  readonly shouldContinue?: () => boolean;
}
export interface KtcAutoBuildCleanupYamlCleanOptions extends KtcAutoBuildCleanupYamlOptions {
  /** Host-owned VS Code document lookup, never supplied by the Webview. */
  readonly isDirty?: (filePath: string) => boolean;
}
export interface KtcAutoBuildCleanupYamlResult {
  readonly root: string;
  readonly deleted: readonly string[];
  readonly status: string;
  readonly source: KtcAutoBuildCleanupYamlSource;
}
interface DirectoryIdentity { readonly path: string; readonly identity: string; }
interface Snapshot {
  readonly path: string;
  readonly yaml: string;
  readonly fingerprint: string;
  readonly ancestors: readonly DirectoryIdentity[];
}
interface SourceRecord { source: KtcAutoBuildCleanupYamlSource; readonly snapshot: Snapshot; }
const SKIPPED_NAMES = new Set([".git", "node_modules"]);

/** Node-only saved-file registry. Wing alone owns target snapshots and destructive IO. */
export class KtcAutoBuildCleanupYamlWorkspace {
  private records = new Map<string, SourceRecord>();
  private messages: readonly string[] = [];
  private epoch = 0;
  private closed = false;
  private busy = false;
  private scopeKey = "";
  private readonly limits: Limits;

  constructor(options: { readonly limits?: Partial<Limits> } = {}) {
    const limits: Limits = { ...KTC_CLEANUP_YAML_DISCOVERY_LIMITS };
    for (const key of Object.keys(limits) as (keyof Limits)[]) {
      const value = options.limits?.[key];
      if (value !== undefined) {
        if (!Number.isInteger(value) || value < (key === "maxDepth" ? 0 : 1) || value > limits[key]) {
          throw new Error(`无效的 YAML 发现上限：${key}`);
        }
        limits[key] = value;
      }
    }
    this.limits = Object.freeze(limits);
  }
  get sources(): readonly KtcAutoBuildCleanupYamlSource[] { return Object.freeze([...this.records.values()].map(({ source }) => source)); }
  get warnings(): readonly string[] { return this.messages; }

  /** Invalidate immediately when the Host's configuration/context changes or its dialog closes. */
  invalidate(): void { this.epoch++; this.records.clear(); this.scopeKey = ""; this.messages = []; }
  dispose(): void { this.closed = true; this.invalidate(); }

  async discover(roots: readonly string[], options: KtcAutoBuildCleanupYamlOptions = {}): Promise<readonly KtcAutoBuildCleanupYamlSource[]> {
    this.assertAvailable();
    this.busy = true;
    const epoch = ++this.epoch;
    const previous = this.records;
    const previousScope = this.scopeKey;
    this.records = new Map(); this.messages = []; this.scopeKey = "";
    const warnings: string[] = [];
    let overflow = 0;
    const warn = (message: string): void => { if (warnings.length < 100) warnings.push(message); else overflow++; };
    const check = (): void => this.assertActive(epoch, options);
    try {
      check();
      if (roots.length > this.limits.maxRoots) warn(`发现根目录数量上限 ${this.limits.maxRoots}；其余根未扫描。`);
      const normalized = new Set<string>();
      const rootIdentities = new Map<string, readonly DirectoryIdentity[]>();
      for (const value of roots.slice(0, this.limits.maxRoots)) {
        check();
        try {
          const root = safeRoot(value);
          rootIdentities.set(root, readAncestors(root));
          normalized.add(root);
        } catch (error) { warn(`跳过发现根 ${JSON.stringify(value)}：${message(error)}`); }
      }
      const scopeKey = [...normalized].map(pathKey).sort().join("\n");
      const previousPaths = new Map([...previous.values()].map((record) => [pathKey(record.source.path), record]));
      const next = new Map<string, SourceRecord>();
      const visited = new Set<string>();
      let entries = 0;
      // Explicit deeper roots keep their own depth budget even when a parent is also selected.
      const queue = [...normalized].sort((a, b) => depth(b) - depth(a)).map((directory) => ({ directory, level: 0 }));
      let stopped = false;
      while (queue.length && !stopped) {
        check();
        const { directory, level } = queue.shift()!;
        const key = pathKey(directory);
        if (visited.has(key)) continue;
        if (visited.size >= this.limits.maxDirectories) { warn(`目录数量达到上限 ${this.limits.maxDirectories}；发现未完整。`); break; }
        visited.add(key);
        try {
          readAncestors(directory);
          const listing = await opendir(directory);
          for await (const entry of listing) {
            check();
            if (++entries > this.limits.maxEntries) { warn(`目录项数量达到上限 ${this.limits.maxEntries}；发现未完整。`); stopped = true; break; }
            const filePath = path.join(directory, entry.name);
            if (SKIPPED_NAMES.has(entry.name.toLowerCase())) continue;
            if (entry.isSymbolicLink()) { warn(`跳过链接：${filePath}`); continue; }
            if (entry.isDirectory()) {
              if (level >= this.limits.maxDepth) warn(`跳过超出深度 ${this.limits.maxDepth} 的目录：${filePath}`);
              else queue.push({ directory: filePath, level: level + 1 });
            } else if (entry.name === "cleanup.yaml" && entry.isFile()) {
              if (next.size >= this.limits.maxSources) { warn(`YAML 数量达到上限 ${this.limits.maxSources}；发现未完整。`); stopped = true; break; }
              try {
                const snapshot = readSnapshot(filePath, this.limits.maxYamlBytes);
                let disabledReason: string | undefined;
                try { validateRules(snapshot.yaml); } catch (error) { disabledReason = message(error); }
                const old = previousScope === scopeKey ? previousPaths.get(pathKey(filePath)) : undefined;
                const unchanged = old && sameSnapshot(old.snapshot, snapshot) && old.source.disabledReason === disabledReason;
                const source = unchanged ? old.source : Object.freeze({
                  id: old?.source.id ?? randomUUID(), revision: (old?.source.revision ?? 0) + 1,
                  path: filePath, root: directory,
                  status: disabledReason ? `规则错误：${disabledReason}` : "待清理", disabledReason,
                });
                next.set(source.id, { source, snapshot });
              } catch (error) { warn(`跳过 YAML ${filePath}：${message(error)}`); }
            }
          }
        } catch (error) { check(); warn(`跳过目录 ${directory}：${message(error)}`); }
      }
      check();
      for (const [root, identity] of rootIdentities) {
        if (JSON.stringify(identity) !== JSON.stringify(readAncestors(root))) throw new Error("发现范围的目录身份已变化，请重新探测。");
      }
      this.records = new Map([...next].sort(([, a], [, b]) => a.source.path.localeCompare(b.source.path)));
      this.scopeKey = scopeKey;
      this.messages = Object.freeze([...warnings, ...(overflow ? [`另有 ${overflow} 条跳过警告。`] : [])]);
      return this.sources;
    } finally { this.busy = false; }
  }

  getSource(id: string, revision?: number): KtcAutoBuildCleanupYamlSource {
    if (this.closed) throw new Error("清理会话已关闭。");
    const record = this.records.get(id);
    if (!record || (revision !== undefined && (!Number.isInteger(revision) || record.source.revision !== revision))) {
      throw new Error("YAML 来源或版本已失效，请重新探测。");
    }
    return record.source;
  }

  async readForOpen(id: string): Promise<{ readonly path: string; readonly root: string; readonly yaml: string; readonly source: KtcAutoBuildCleanupYamlSource }> {
    this.assertAvailable();
    const source = this.getSource(id);
    const record = this.records.get(id)!;
    const epoch = this.epoch;
    await this.revalidate(record.snapshot);
    this.assertActive(epoch, {});
    if (this.records.get(id) !== record) throw new Error("YAML 来源已变化，请重新探测。");
    return Object.freeze({ path: source.path, root: source.root, yaml: record.snapshot.yaml, source });
  }

  async clean(id: string, revision: number, options: KtcAutoBuildCleanupYamlCleanOptions = {}): Promise<KtcAutoBuildCleanupYamlResult> {
    this.assertAvailable();
    const source = this.getSource(id, revision);
    if (source.disabledReason) throw new Error(source.disabledReason);
    const record = this.records.get(id)!;
    const epoch = this.epoch;
    const check = (): boolean => {
      this.assertActive(epoch, options);
      if (this.records.get(id) !== record) throw new Error("YAML 来源已失效，请重新探测。");
      if (options.isDirty?.(source.path)) throw new Error("YAML 有未保存改动，请先在 VS Code 中保存后重新探测。");
      assertSnapshot(record.snapshot, this.limits.maxYamlBytes);
      return true;
    };
    this.busy = true;
    record.source = Object.freeze({ ...source, status: "清理中" });
    try {
      this.assertActive(epoch, options);
      await this.revalidate(record.snapshot);
      check();
      validateRules(record.snapshot.yaml);
      const preview = await ktcPreviewWingCleanupArtifacts(source.root, record.snapshot.yaml);
      // Do not permit a YAML pattern to delete its own authority file or Git metadata.
      for (const target of preview.matched) {
        if (pathKey(path.dirname(target)) !== pathKey(source.root) || pathKey(target) === pathKey(source.path)
          || SKIPPED_NAMES.has(path.basename(target).toLowerCase())) {
          throw new Error("规则命中了配置自身、受保护目录或非直属项，拒绝清理。");
        }
      }
      const trees = (preview as unknown as { readonly targets?: readonly { readonly tree?: readonly { readonly identity?: { readonly path?: string } }[] }[] }).targets;
      if (!Array.isArray(trees) || trees.some((target) => !Array.isArray(target.tree))) throw new Error("Wing 清理身份快照不完整。");
      if (trees.some((target) => target.tree!.some((node: { readonly identity?: { readonly path?: string } }) => !node.identity?.path
        || path.relative(source.root, node.identity.path).split(path.sep).some((name) => name.toLowerCase() === ".git")))) {
        throw new Error("清理目标包含 Git 元数据，拒绝删除。");
      }
      await this.revalidate(record.snapshot);
      check();
      // Wing's synchronous guard rechecks YAML/ancestors/dirty/context before each destructive step.
      // This narrows races; it is not an OS-atomic openat/unlinkat transaction against hostile writers.
      const result = await ktcCleanPreviewedWingArtifacts(preview, { shouldContinue: check });
      check();
      const status = `已清理 ${result.deleted.length} 项`;
      if (this.epoch !== epoch || this.records.get(id) !== record) throw new Error("清理上下文已失效；已删内容不自动回滚。");
      record.source = Object.freeze({ ...source, revision: source.revision + 1, status, deleted: Object.freeze([...result.deleted]) });
      return Object.freeze({ root: result.root, deleted: record.source.deleted!, status, source: record.source });
    } catch (error) {
      const reason = `${message(error)} 清理未完整完成；已删内容不自动回滚。`;
      if (this.epoch === epoch && this.records.get(id) === record) {
        record.source = Object.freeze({ ...source, revision: source.revision + 1, status: reason, disabledReason: "请重新探测并核对当前文件。" });
      }
      throw new Error(reason);
    } finally { this.busy = false; }
  }

  private assertAvailable(): void {
    if (this.closed) throw new Error("清理会话已关闭。");
    if (this.busy) throw new Error("发现或清理正在进行，请勿重复操作。");
  }
  private assertActive(epoch: number, options: KtcAutoBuildCleanupYamlOptions): void {
    if (this.closed || this.epoch !== epoch || options.shouldContinue?.() === false) throw new Error("清理已取消或上下文已失效。");
  }
  private async revalidate(snapshot: Snapshot): Promise<void> {
    if (pathKey(await realpath(snapshot.path)) !== pathKey(snapshot.path)) throw new Error("YAML 路径已变为链接或指向其他文件。");
    assertSnapshot(snapshot, this.limits.maxYamlBytes);
  }
}

function safeRoot(value: string): string {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value) || /\p{Cc}/u.test(value)) throw new Error("发现范围必须是明确的绝对目录。");
  const root = path.resolve(value);
  const home = canonical(homedir());
  const broad = [path.parse(root).root, home, canonical(tmpdir()), "/Users", "/Volumes", "/Applications", "/private", "/private/tmp", "/private/var", "/usr", "/var", "/tmp"];
  if (broad.some((candidate) => pathKey(root) === pathKey(candidate)) || inside(root, home) || (process.platform !== "win32" && depth(root) < 2)) {
    throw new Error("拒绝盘根、家目录或其他过宽的发现范围。");
  }
  if (root.split(path.sep).some((name) => SKIPPED_NAMES.has(name.toLowerCase()))) throw new Error("发现范围位于受保护目录。");
  if (pathKey(realpathSync(root)) !== pathKey(root)) throw new Error("发现根包含链接，请使用真实目录路径。");
  return root;
}
function readAncestors(directory: string): readonly DirectoryIdentity[] {
  const values: DirectoryIdentity[] = [];
  let cursor = path.resolve(directory);
  while (true) {
    const stat = lstatSync(cursor, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`目录祖先不是普通目录或已变为链接：${cursor}`);
    values.push({ path: cursor, identity: stableIdentity(stat) });
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return values;
}
function readSnapshot(filePath: string, maxBytes: number): Snapshot {
  const ancestors = readAncestors(path.dirname(filePath));
  const before = lstatSync(filePath, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) throw new Error("YAML 必须是非链接的普通文件。");
  if (before.size > BigInt(maxBytes)) throw new Error(`YAML 体积超过 ${maxBytes} 字节上限。`);
  const fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (fileIdentity(before) !== fileIdentity(opened)) throw new Error("YAML 在读取前已变化。");
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) { const size = readSync(fd, buffer, length, buffer.length - length, null); if (!size) break; length += size; }
    if (length > maxBytes) throw new Error(`YAML 体积超过 ${maxBytes} 字节上限。`);
    const after = fstatSync(fd, { bigint: true });
    if (fileIdentity(opened) !== fileIdentity(after) || fileIdentity(after) !== fileIdentity(lstatSync(filePath, { bigint: true }))) throw new Error("YAML 在读取期间已变化。");
    if (pathKey(realpathSync(filePath)) !== pathKey(filePath) || JSON.stringify(ancestors) !== JSON.stringify(readAncestors(path.dirname(filePath)))) throw new Error("YAML 目录祖先在读取期间已变化。");
    const bytes = buffer.subarray(0, length);
    const yaml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { path: filePath, yaml, ancestors, fingerprint: `${fileIdentity(after)}:${createHash("sha256").update(bytes).digest("hex")}` };
  } finally { closeSync(fd); }
}
function assertSnapshot(snapshot: Snapshot, maxBytes: number): void {
  if (!sameSnapshot(snapshot, readSnapshot(snapshot.path, maxBytes))) throw new Error("YAML 内容、文件或目录祖先身份已变化，请重新探测。");
}
function sameSnapshot(a: Snapshot, b: Snapshot): boolean { return a.fingerprint === b.fingerprint && JSON.stringify(a.ancestors) === JSON.stringify(b.ancestors); }
function validateRules(yaml: string): void {
  const rules = ktcParseRootCleanupConfigurationYaml(yaml);
  if (rules.directories.some((name) => SKIPPED_NAMES.has(name.toLowerCase()))) throw new Error("规则不能删除 .git 或 node_modules 受保护目录。");
}
function stableIdentity(stat: BigIntStats): string { return [stat.dev, stat.ino, stat.birthtimeNs].join(":"); }
function fileIdentity(stat: BigIntStats): string { return [stableIdentity(stat), stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].join(":"); }
function canonical(value: string): string { try { return realpathSync(value); } catch { return path.resolve(value); } }
function pathKey(value: string): string { return process.platform === "win32" ? path.normalize(value).toLowerCase() : path.normalize(value); }
function depth(value: string): number { return path.resolve(value).slice(path.parse(path.resolve(value)).root.length).split(path.sep).filter(Boolean).length; }
function inside(root: string, target: string): boolean { const relative = path.relative(root, target); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
