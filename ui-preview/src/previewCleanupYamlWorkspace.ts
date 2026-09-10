import { ktcParseRootCleanupConfigurationYaml, ktcRootCleanupFilenameMatches } from "../../src/core/rootCleanupPatterns.js";
import type { KtcCleanupYamlSource } from "../../src/ui/KtcCleanupYamlWorkspace.js";

export interface PreviewCleanupYamlFile extends KtcCleanupYamlSource { readonly yaml: string; }
export interface PreviewCleanupYamlDiscoveryLimits { readonly maxDepth?: number; readonly maxSources?: number; }
export interface PreviewCleanupYamlDiscovery {
  readonly sources: readonly KtcCleanupYamlSource[];
  readonly warnings: readonly string[];
  readonly incomplete: boolean;
}

/** In-memory file host only. No file IO, no path traversal and no execution of YAML commands. */
export class PreviewCleanupYamlWorkspace {
  readonly files: PreviewCleanupYamlFile[];
  openedFileId?: string;
  constructor(public yaml: string, readonly workingDirectory: string) {
    const working = normalizeDirectory(workingDirectory);
    this.files = working ? [
      { id: "working-cleanup", revision: 1, path: `${working}/cleanup.yaml`, root: working, yaml },
      { id: "sample-cleanup", revision: 1, path: `${working}/sample/cleanup.yaml`, root: `${working}/sample`, yaml: "delete:\n  directories:\n    - objects\n  files:\n    - '*.obj'" },
    ] : [];
  }
  edit(yaml: string): void { this.yaml = yaml; }
  open(sourceId: string): PreviewCleanupYamlFile {
    const file = this.files.find(({ id }) => id === sourceId && this.discovered().some((source) => source.id === id));
    if (!file) throw new Error("未找到 YAML 样例，请重新探测。");
    this.openedFileId = file.id;
    return file;
  }
  discovered(): readonly KtcCleanupYamlSource[] {
    return this.discover().sources;
  }
  /** Preview bounds exercise list/log behavior only; no filesystem walk or extra discovery roots. */
  discover(limits: PreviewCleanupYamlDiscoveryLimits = {}): PreviewCleanupYamlDiscovery {
    const working = normalizeDirectory(this.workingDirectory);
    if (!working) return Object.freeze({ sources: Object.freeze([]), warnings: Object.freeze(["工作目录无效；未探测 YAML，未回退到 ROOT 或其他目录。"]), incomplete: true });
    const maxDepth = Number.isInteger(limits.maxDepth) ? Math.max(0, Math.min(6, limits.maxDepth!)) : 6;
    const maxSources = Number.isInteger(limits.maxSources) ? Math.max(1, Math.min(64, limits.maxSources!)) : 64;
    const sources: KtcCleanupYamlSource[] = [], warnings: string[] = [];
    const seen = new Set<string>();
    for (const file of this.files) {
      const path = normalizeDirectory(file.path), parent = normalizeDirectory(file.root);
      if (!path?.endsWith("/cleanup.yaml")) continue;
      const relative = path.startsWith(`${working}/`) ? path.slice(working.length + 1) : "";
      if (!relative || parent !== path.slice(0, -"/cleanup.yaml".length)) { warnings.push(`跳过当前工作目录之外或 parent 不一致的 YAML：${file.path}`); continue; }
      const directories = relative.split("/").slice(0, -1);
      if (directories.some((name) => name === ".git" || name === "node_modules")) { warnings.push(`跳过排除目录中的 YAML：${file.path}`); continue; }
      if (directories.length > maxDepth) { warnings.push(`跳过超出深度 ${maxDepth} 的样例目录：${parent}`); continue; }
      if (seen.has(path)) continue;
      if (sources.length >= maxSources) { warnings.push(`达到 ${maxSources} 份 YAML 来源限额；其余样例未列出。`); break; }
      seen.add(path); sources.push(file);
    }
    return Object.freeze({ sources: Object.freeze(sources), warnings: Object.freeze(warnings), incomplete: warnings.length > 0 });
  }
  /** Parse real rule syntax against controlled memory entries; all matches are direct children. */
  clean(sourceId: string, revision: number): readonly string[] {
    const file = this.files.find(({ id }) => id === sourceId && this.discovered().some((source) => source.id === id));
    if (!file || file.revision !== revision) throw new Error("配置已变化，请重新探测后清理。");
    let config;
    try { config = ktcParseRootCleanupConfigurationYaml(file.yaml); }
    catch (error) {
      const index = this.files.findIndex(({ id }) => id === sourceId);
      this.files[index] = { ...file, status: `失败：${error instanceof Error ? error.message : String(error)}` };
      throw error;
    }
    const fingerprint = JSON.stringify([file.path, file.root, file.yaml, file.revision]);
    const items = [
      ...["objects", "build"].filter((name) => config.directories.includes(name)),
      ...["module.obj", "module.pdb", "module.exp", "test_sample.exe"].filter((name) => ktcRootCleanupFilenameMatches(name, config.files)),
      ...["DemoLink"].filter((name) => ktcRootCleanupFilenameMatches(name, config.unlinkDirectories)).map((name) => `${name}（仅解除链接）`),
    ].map((name) => `${file.root}/${name}（样例）`);
    if (fingerprint !== JSON.stringify([file.path, file.root, file.yaml, file.revision])) throw new Error("规则快照已变化，请重新清理。");
    const index = this.files.findIndex(({ id }) => id === sourceId);
    this.files[index] = { ...file, status: `模拟完成：${items.length} 项；未删除真实文件`, revision: file.revision + 1 };
    return items;
  }
}

function normalizeDirectory(value: string): string | undefined {
  const path = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path === "/" || /^[a-z]:$/i.test(path) || /[\u0000-\u001f]/u.test(path) || path.split("/").some((part) => part === ".." || part === ".")) return undefined;
  return path.startsWith("/") || /^[a-z]:\//i.test(path) ? path : undefined;
}
