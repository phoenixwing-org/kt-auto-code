import {
  PREVIEW_AUTO_BUILD_SAMPLE,
  type PreviewAutoBuildSample,
  type PreviewAutoBuildSampleConfiguration,
  type PreviewAutoBuildSampleRepository,
} from "./previewAutoBuildSample.js";

/** Preview only: lexical sample paths and manifest snapshots, never filesystem/Git operations. */
export type PreviewAutoBuildKind = "cmake" | "caa";
export interface PreviewAutoBuildDraftRepository extends PreviewAutoBuildSampleRepository {
  readonly buildKinds: readonly PreviewAutoBuildKind[];
}
export interface PreviewAutoBuildDraft {
  readonly revision: number;
  readonly execution: { readonly parallelBuild: boolean; readonly cmakeBuildTypes: readonly ("Debug" | "Release")[] };
  readonly configuration: PreviewAutoBuildSampleConfiguration;
  readonly repositories: readonly PreviewAutoBuildDraftRepository[];
}
export interface PreviewAutoBuildDraftSummary {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly ignored: number;
}
export interface PreviewAutoBuildDraftChange {
  readonly draft: PreviewAutoBuildDraft;
  readonly summary: PreviewAutoBuildDraftSummary;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}
export interface PreviewAutoBuildImportPlan extends PreviewAutoBuildDraftChange {
  /** Object identity fences a plan to this exact in-memory session, not just its revision. */
  readonly baseDraft: PreviewAutoBuildDraft;
}
export interface PreviewAutoBuildImportOptions { readonly targetPaths?: Readonly<Record<string, string>>; }
export type PreviewAutoBuildConfigurationPatch = Partial<Omit<PreviewAutoBuildSampleConfiguration, "recentConfigs" | "draftLabel">>;
export interface PreviewAutoBuildRepositoryPatch {
  readonly enabled?: boolean;
  readonly branch?: string;
  readonly path?: string;
  readonly buildKinds?: readonly PreviewAutoBuildKind[];
  readonly update?: boolean;
  readonly linkCaa?: boolean;
}
export interface PreviewAutoBuildSampleDirectory {
  readonly path: string;
  readonly name?: string;
  readonly origin?: string;
  readonly branch?: string;
  readonly buildKinds?: readonly PreviewAutoBuildKind[];
}

const MAX_REPOSITORIES = 200;
const BUILD_KINDS = ["cmake", "caa"] as const;
const CONFIGURATION_FIELDS = ["currentConfigName", "rootDirectory", "thirdPartyDirectory", "workingDirectory", "rootBranch", "projectBranch", "cmakeBranch", "updateRootDirectory", "updateThirdParty"] as const;

export function createPreviewAutoBuildDraft(sample: PreviewAutoBuildSample = PREVIEW_AUTO_BUILD_SAMPLE): PreviewAutoBuildDraft {
  return freezeDraft(0, sample.configuration, sample.repositories.map((row) => {
    const enabled = (id: string) => row.operations.some((operation) => operation.id === id && operation.enabled);
    const buildKinds = BUILD_KINDS.filter(enabled);
    return { ...row, buildKinds, operations: operations(row.kind, enabled("update"), buildKinds, enabled("link-caa")) };
  }), { parallelBuild: sample.initial.parallelBuild, cmakeBuildTypes: ["Debug", "Release"] });
}

export function updatePreviewAutoBuildExecution(draft: PreviewAutoBuildDraft, execution: PreviewAutoBuildDraft["execution"]): PreviewAutoBuildDraftChange {
  if (typeof execution.parallelBuild !== "boolean" || !Array.isArray(execution.cmakeBuildTypes) || execution.cmakeBuildTypes.some((type) => type !== "Debug" && type !== "Release")) return failed(draft, new Error("编译选项无效。"));
  const normalized = { parallelBuild: execution.parallelBuild, cmakeBuildTypes: (["Debug", "Release"] as const).filter((type) => execution.cmakeBuildTypes.includes(type)) };
  if (JSON.stringify(normalized) === JSON.stringify(draft.execution)) return result(draft);
  return result(freezeDraft(draft.revision + 1, draft.configuration, draft.repositories, normalized), { updated: 1 });
}

export function updatePreviewAutoBuildConfiguration(draft: PreviewAutoBuildDraft, patch: PreviewAutoBuildConfigurationPatch): PreviewAutoBuildDraftChange {
  try {
    onlyKeys(patch, CONFIGURATION_FIELDS);
    const configuration = { ...draft.configuration };
    for (const key of CONFIGURATION_FIELDS) {
      const value = patch[key];
      if (value === undefined) continue;
      if (key === "updateRootDirectory" || key === "updateThirdParty") configuration[key] = boolean(value, key);
      else configuration[key] = key.endsWith("Directory") ? path(value) : key.endsWith("Branch") ? branch(value) : text(value, key);
    }
    const repositories = draft.repositories.map((row) => {
      if (row.kind === "Root") return patchRepository(row, { path: configuration.rootDirectory, branch: configuration.rootBranch, update: configuration.updateRootDirectory });
      if (row.kind === "3rdParty") return patchRepository(row, { path: configuration.thirdPartyDirectory, update: configuration.updateThirdParty });
      return row;
    });
    assertUniquePaths(repositories, configuration.workingDirectory);
    return changed(draft, configuration, repositories, { updated: 1 });
  } catch (error) { return failed(draft, error); }
}

export function updatePreviewAutoBuildRepository(draft: PreviewAutoBuildDraft, id: string, patch: PreviewAutoBuildRepositoryPatch): PreviewAutoBuildDraftChange {
  try {
    onlyKeys(patch, ["enabled", "branch", "path", "buildKinds", "update", "linkCaa"]);
    const current = draft.repositories.find((row) => row.id === id);
    if (!current) throw new Error("找不到要编辑的样例仓库。");
    const next = patchRepository(current, patch);
    const repositories = draft.repositories.map((row) => row.id === id ? next : row);
    assertUniquePaths(repositories, draft.configuration.workingDirectory);
    const configuration = { ...draft.configuration };
    if (next.kind === "Root") {
      configuration.rootDirectory = next.path;
      configuration.rootBranch = next.branch;
      configuration.updateRootDirectory = isOperationEnabled(next, "update");
    } else if (next.kind === "3rdParty") {
      configuration.thirdPartyDirectory = next.path;
      configuration.updateThirdParty = isOperationEnabled(next, "update");
    }
    return changed(draft, configuration, repositories, { updated: 1 });
  } catch (error) { return failed(draft, error); }
}

/** The caller supplies known sample candidates for either picking or scanning; this function discovers nothing on disk. */
export function addPreviewAutoBuildSampleDirectories(draft: PreviewAutoBuildDraft, candidates: readonly PreviewAutoBuildSampleDirectory[]): PreviewAutoBuildDraftChange {
  if (!Array.isArray(candidates) || candidates.length > MAX_REPOSITORIES) return failed(draft, new Error("样例目录每批最多 200 项。"));
  const repositories = [...draft.repositories];
  const warnings: string[] = [];
  let added = 0;
  let ignored = 0;
  for (const candidate of candidates) {
    try {
      onlyKeys(candidate, ["path", "name", "origin", "branch", "buildKinds"]);
      const directory = path(candidate.path);
      const origin = candidate.origin === undefined ? "" : validatedOrigin(candidate.origin);
      const directoryKey = pathKey(directory, draft.configuration.workingDirectory);
      if (repositories.some((row) => pathKey(row.path, draft.configuration.workingDirectory) === directoryKey || (origin && originKey(row.originTitle) === originKey(origin)))) {
        ignored += 1;
        continue;
      }
      if (repositories.length >= MAX_REPOSITORIES) throw new Error("样例仓库总数已达到 200 项上限。");
      const name = projectName(candidate.name ?? directory.split("/").at(-1));
      repositories.push(createProject(repositories, { name, path: directory, origin, branch: candidate.branch === undefined ? draft.configuration.projectBranch : branch(candidate.branch), buildKinds: kinds(candidate.buildKinds ?? []) }));
      added += 1;
    } catch (error) {
      ignored += 1;
      warnings.push(errorMessage(error));
    }
  }
  return changed(draft, draft.configuration, repositories, { added, ignored }, warnings);
}

export function removePreviewAutoBuildDisabledProjects(draft: PreviewAutoBuildDraft): PreviewAutoBuildDraftChange {
  const repositories = draft.repositories.filter((row) => row.kind !== "项目" || row.enabled);
  return changed(draft, draft.configuration, repositories, { removed: draft.repositories.length - repositories.length });
}

/** BUILD_MANIFEST schema 1 preview. Not the formal importer: no clone, checkout, origin probing, or path existence claim. */
export function planPreviewAutoBuildImport(draft: PreviewAutoBuildDraft, source: unknown, options: PreviewAutoBuildImportOptions = {}): PreviewAutoBuildImportPlan {
  try {
    if (typeof source === "string" && source.length > 256_000) throw new Error("构建清单超过 Preview 的 256 KB 上限。");
    const manifest = record(typeof source === "string" ? JSON.parse(source) : source);
    onlyKeys(manifest, ["schemaVersion", "finishedAt", "status", "repositories"]);
    if (manifest.schemaVersion !== 1 || manifest.status !== "succeeded") throw new Error("仅支持成功构建的 BUILD_MANIFEST schemaVersion 1。");
    if (!Number.isFinite(Date.parse(text(manifest.finishedAt, "finishedAt")))) throw new Error("构建清单 finishedAt 无效。");
    if (!Array.isArray(manifest.repositories) || manifest.repositories.length > MAX_REPOSITORIES) throw new Error("构建清单 repositories 必须是最多 200 项的数组。");
    // Validate the entire source before planning any row, so malformed rows cannot partially import.
    const entries = manifest.repositories.map(parseManifestRepository);
    const repositories = [...draft.repositories];
    const warnings: string[] = [];
    const seenOrigins = new Set<string>();
    let added = 0;
    let updated = 0;
    let ignored = 0;
    for (const entry of entries) {
      const key = originKey(entry.origin);
      if (!key || entry.dirty || seenOrigins.has(key)) {
        ignored += 1;
        warnings.push(`${entry.name}：${!key ? "缺少 origin" : entry.dirty ? "构建时存在未提交改动" : "清单内重复 origin"}，已忽略。`);
        continue;
      }
      seenOrigins.add(key);
      const existing = repositories.findIndex((row) => originKey(row.originTitle) === key);
      const kind = entry.role === "root" ? "Root" : entry.role === "thirdParty" ? "3rdParty" : "项目";
      if (existing >= 0 && repositories[existing].kind === kind) {
        const row = repositories[existing];
        const next = { ...patchRepository(row, { branch: entry.branch, ...(kind === "项目" ? { buildKinds: entry.buildKinds } : {}) }), commit: entry.commit, status: "清单快照（模拟）" };
        if (JSON.stringify(row) === JSON.stringify(next)) ignored += 1;
        else { repositories[existing] = next; updated += 1; }
      } else if (existing >= 0 || kind !== "项目") {
        ignored += 1;
        warnings.push(`${entry.name}：固定仓库或角色不匹配，已忽略。`);
      } else {
        const directory = path(options.targetPaths?.[entry.origin] ?? `${draft.configuration.workingDirectory}/${entry.name}`);
        const working = pathKey(draft.configuration.workingDirectory);
        const target = pathKey(directory, draft.configuration.workingDirectory);
        if (!target.startsWith(`${working}/`)) throw new Error(`${entry.name}：导入样例目标必须在当前工作目录内。`);
        if (repositories.some((row) => pathKey(row.path, draft.configuration.workingDirectory) === pathKey(directory, draft.configuration.workingDirectory)) || repositories.length >= MAX_REPOSITORIES) {
          ignored += 1;
          warnings.push(`${entry.name}：目标路径已占用或已达样例上限，已忽略。`);
          continue;
        }
        repositories.push({ ...createProject(repositories, { ...entry, path: directory }), commit: entry.commit, status: "清单快照（模拟）" });
        added += 1;
      }
    }
    const root = repositories.find((row) => row.kind === "Root");
    const configuration = { ...draft.configuration, rootBranch: root?.branch ?? draft.configuration.rootBranch };
    return Object.freeze({ ...changed(draft, configuration, repositories, { added, updated, ignored }, warnings), baseDraft: draft });
  } catch (error) { return Object.freeze({ ...failed(draft, error), baseDraft: draft }); }
}

/** Call only after a confirmation decision. Cancel is an explicit no-op, even if the plan has since gone stale. */
export function applyPreviewAutoBuildImport(draft: PreviewAutoBuildDraft, plan: PreviewAutoBuildImportPlan, confirmed: boolean): PreviewAutoBuildDraftChange {
  if (!confirmed) return result(draft);
  if (plan.baseDraft !== draft) return failed(draft, new Error("草稿已变更，请重新生成导入计划后确认。"));
  if (plan.errors.length) return result(draft, {}, plan.errors);
  return result(plan.draft, plan.summary, [], plan.warnings);
}

function patchRepository(row: PreviewAutoBuildDraftRepository, patch: PreviewAutoBuildRepositoryPatch): PreviewAutoBuildDraftRepository {
  if (row.kind !== "项目" && (patch.buildKinds !== undefined || patch.linkCaa !== undefined)) throw new Error("Root / 3rdParty 不支持项目构建选项。");
  const enabled = patch.enabled === undefined ? row.enabled : boolean(patch.enabled, "enabled");
  const nextPath = patch.path === undefined ? row.path : path(patch.path);
  const nextBranch = patch.branch === undefined ? row.branch : branch(patch.branch);
  const buildKinds = patch.buildKinds === undefined ? row.buildKinds : kinds(patch.buildKinds);
  const update = patch.update === undefined ? isOperationEnabled(row, "update") : boolean(patch.update, "update");
  const linkCaa = patch.linkCaa === undefined ? isOperationEnabled(row, "link-caa") : boolean(patch.linkCaa, "linkCaa");
  const samePath = pathKey(nextPath) === pathKey(row.path);
  const staleProbe = !samePath || nextBranch !== row.branch;
  return {
    ...row, enabled, path: nextPath, branch: nextBranch, buildKinds,
    ...(staleProbe ? { commit: "", status: "待检查" } : {}),
    ...(!samePath ? { origin: "", originTitle: "" } : {}),
    operations: operations(row.kind, update, buildKinds, linkCaa),
  };
}

function createProject(rows: readonly PreviewAutoBuildDraftRepository[], value: { name: string; path: string; origin: string; branch: string; buildKinds: readonly PreviewAutoBuildKind[] }): PreviewAutoBuildDraftRepository {
  const base = `sample-project:${pathKey(value.path)}`;
  let id = base;
  for (let suffix = 2; rows.some((row) => row.id === id); suffix += 1) id = `${base}:${suffix}`;
  return { id, enabled: true, kind: "项目", name: value.name, path: value.path, origin: value.origin, branch: value.branch, buildKinds: value.buildKinds, commit: "", originTitle: value.origin, status: "待检查（模拟）", runnable: true, operations: operations("项目", false, value.buildKinds, false) };
}

function operations(kind: PreviewAutoBuildDraftRepository["kind"], update: boolean, buildKinds: readonly PreviewAutoBuildKind[], linkCaa: boolean) {
  return [{ id: "update", label: "更新", enabled: update }, ...(kind === "项目" ? [
    { id: "cmake", label: "CMake", enabled: buildKinds.includes("cmake") },
    { id: "caa", label: "CAA", enabled: buildKinds.includes("caa") },
    { id: "link-caa", label: "linkCAA", enabled: linkCaa },
  ] : [])];
}

function parseManifestRepository(value: unknown) {
  const item = record(value);
  onlyKeys(item, ["role", "name", "origin", "branch", "commit", "dirty", "buildKinds"]);
  if (item.role !== "root" && item.role !== "thirdParty" && item.role !== "project") throw new Error("构建清单包含无效 role。");
  const buildKinds = kinds(item.buildKinds ?? []);
  if (item.role === "project" ? buildKinds.length === 0 : item.buildKinds !== undefined) throw new Error("project 必须指定 buildKinds；固定仓库不得指定 buildKinds。");
  const commit = text(item.commit, "commit");
  if (!/^[a-f\d]{7,64}$/i.test(commit)) throw new Error("构建清单 commit 必须是 7–64 位十六进制快照标识。");
  return { role: item.role, name: projectName(item.name), origin: validatedOrigin(item.origin), branch: branch(item.branch), commit, dirty: boolean(item.dirty, "dirty"), buildKinds };
}

function freezeDraft(revision: number, configuration: PreviewAutoBuildSampleConfiguration, repositories: readonly PreviewAutoBuildDraftRepository[], execution: PreviewAutoBuildDraft["execution"]): PreviewAutoBuildDraft {
  return Object.freeze({ revision, execution: Object.freeze({ ...execution, cmakeBuildTypes: Object.freeze([...execution.cmakeBuildTypes]) }), configuration: Object.freeze({ ...configuration, recentConfigs: Object.freeze([...configuration.recentConfigs]) }), repositories: Object.freeze(repositories.map((row) => Object.freeze({ ...row, buildKinds: Object.freeze([...row.buildKinds]), operations: Object.freeze(row.operations.map((operation) => Object.freeze({ ...operation }))) }))) });
}
function changed(draft: PreviewAutoBuildDraft, configuration: PreviewAutoBuildSampleConfiguration, repositories: readonly PreviewAutoBuildDraftRepository[], summary: Partial<PreviewAutoBuildDraftSummary>, warnings: readonly string[] = []): PreviewAutoBuildDraftChange {
  if (JSON.stringify(configuration) === JSON.stringify(draft.configuration) && JSON.stringify(repositories) === JSON.stringify(draft.repositories)) return result(draft, { ignored: summary.ignored ?? 0 }, [], warnings);
  return result(freezeDraft(draft.revision + 1, configuration, repositories, draft.execution), summary, [], warnings);
}
function result(draft: PreviewAutoBuildDraft, summary: Partial<PreviewAutoBuildDraftSummary> = {}, errors: readonly string[] = [], warnings: readonly string[] = []): PreviewAutoBuildDraftChange {
  return Object.freeze({ draft, summary: Object.freeze({ added: 0, updated: 0, removed: 0, ignored: 0, ...summary }), errors: Object.freeze([...errors]), warnings: Object.freeze([...warnings]) });
}
function failed(draft: PreviewAutoBuildDraft, error: unknown) { return result(draft, {}, [errorMessage(error)]); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "样例草稿数据无效。"; }
function isOperationEnabled(row: PreviewAutoBuildDraftRepository, id: string) { return row.operations.some((operation) => operation.id === id && operation.enabled); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("需要一个数据对象。");
  return value as Record<string, unknown>;
}
function onlyKeys(value: unknown, allowed: readonly string[]) {
  if (Object.keys(record(value)).some((key) => !allowed.includes(key))) throw new Error("包含不支持的草稿字段。");
}
function text(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > 2_048 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} 必须是无控制字符的短文本。`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${name} 不能为空。`);
  return normalized;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} 必须是布尔值。`);
  return value;
}
function branch(value: unknown): string {
  const normalized = text(value, "branch");
  if (/\s|\.\.|@\{|[~^:?*\[\\]/u.test(normalized) || normalized === "@" || normalized.startsWith("-") || normalized.endsWith(".") || normalized.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))) throw new Error("branch 不是有效的样例分支名。");
  return normalized;
}
function path(value: unknown): string {
  const normalized = text(value, "path").replace(/\\/g, "/");
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) && !/^[a-z]:\//i.test(normalized)) throw new Error("样例路径不支持 URL 或驱动器相对路径。");
  if (normalized.split("/").includes("..")) throw new Error("样例路径不支持 .. 路径段。");
  const prefix = normalized.startsWith("//") ? "//" : normalized.startsWith("/") ? "/" : "";
  const result = prefix + normalized.split("/").filter((part) => part && part !== ".").join("/");
  if (!result || result === "/" || result === "//" || /^[a-z]:$/i.test(result)) throw new Error("请选择具体样例目录。");
  return result;
}
function pathKey(value: string, workingDirectory?: string) {
  let normalized = path(value);
  // This is lexical comparison only; symlinks, filesystem casing and repository roots are not probed.
  if (workingDirectory && !normalized.startsWith("/") && !/^[a-z]:\//i.test(normalized)) normalized = path(`${workingDirectory}/${normalized}`);
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith("//") ? normalized.toLowerCase() : normalized;
}
function originKey(value: string) {
  let normalized = value.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  // Normalize host spelling, not case-sensitive repository paths or unrelated transport URLs.
  if (/^(https?|ssh|git):\/\//i.test(normalized)) { try { normalized = new URL(normalized).toString().replace(/\/$/, ""); } catch { /* Existing sample display metadata is not executed. */ } }
  else normalized = normalized.replace(/^((?:[\w.-]+@)?)([\w.-]+)([:/])/u, (_match, user: string, host: string, separator: string) => `${user}${host.toLowerCase()}${separator}`);
  return normalized;
}
function validatedOrigin(value: unknown): string {
  const origin = text(value, "origin", true);
  if (!origin) return origin;
  if (/\s|[<>"'`$;]/u.test(origin)) throw new Error("Origin 含不支持的字符。");
  if (/^(https?|ssh|git):\/\//i.test(origin)) {
    const url = new URL(origin);
    if (!url.hostname || url.password || (url.username && url.protocol !== "ssh:") || url.search || url.hash || !url.pathname || url.pathname === "/") throw new Error("Origin 必须是无凭据的 Git 地址。");
    return `${url.protocol}//${url.username ? `${url.username}@` : ""}${url.host}${url.pathname}`.replace(/\/+$/, "");
  }
  if (origin.includes("://") || /^(file|javascript|data):/i.test(origin)) throw new Error("Origin 不支持本地文件或非 Git 协议。");
  if (/^(?:[\w.-]+@)?[\w.-]+:[\w.-][\w./-]*$/u.test(origin) || /^[\w.-]+\.[\w.-]+\/[\w./-]+$/u.test(origin)) return origin;
  throw new Error("Origin 不是支持的 Git 地址（https / ssh / git / scp）。");
}
function projectName(value: unknown): string {
  const name = text(value, "name");
  if (name === "." || name === ".." || /[\\/:]/u.test(name)) throw new Error("项目名称不能含目录分隔符。");
  return name;
}
function kinds(value: unknown): readonly PreviewAutoBuildKind[] {
  if (!Array.isArray(value) || value.length > 2 || value.some((kind) => !BUILD_KINDS.includes(kind))) throw new Error("buildKinds 仅支持 cmake、caa，且不能重复。");
  if (new Set(value).size !== value.length) throw new Error("buildKinds 不能重复。");
  return BUILD_KINDS.filter((kind) => value.includes(kind));
}
function assertUniquePaths(rows: readonly PreviewAutoBuildDraftRepository[], workingDirectory: string) {
  if (new Set(rows.map((row) => pathKey(row.path, workingDirectory))).size !== rows.length) throw new Error("该样例路径已存在，不能重复添加。");
}
