import { basename } from "node:path";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import { ktcResolveAutoBuildPath } from "./autoBuildProjectTable.js";

export type KtcBuildManifestMode = "overwrite" | "merge";
export type KtcBuildManifestRole = "root" | "thirdParty" | "project";
export type KtcBuildKind = "cmake" | "caa";
export interface KtcBuildManifestRepository { role: KtcBuildManifestRole; name: string; origin: string; branch: string; commit: string; dirty: boolean; buildKinds?: KtcBuildKind[]; }
export interface KtcBuildManifest { schemaVersion: 1; finishedAt: string; status: "succeeded"; repositories: KtcBuildManifestRepository[]; }

export function ktcCreateBuildManifest(configuration: KtcAutoBuildConfiguration, previous?: KtcBuildManifest): KtcBuildManifest {
  const working = configuration.workingDirectory || "", compiledKinds = new Map(configuration.projects
    .filter((item) => item.enabled && (item.operations.cmake || item.operations.caa))
    .map((item) => [ktcPathKey(ktcResolveAutoBuildPath(item.path, working)), [item.operations.cmake ? "cmake" : undefined, item.operations.caa ? "caa" : undefined].filter(Boolean) as KtcBuildKind[]]));
  const current = (configuration.repositorySnapshot?.repositories || [])
    .filter((item) => !item.error && !!item.commit && (item.role === "ROOT_DIR" || item.role === "ROOT_DIR_3rdParty" || compiledKinds.has(ktcPathKey(item.path))))
    .map((item): KtcBuildManifestRepository => {
      const common = { name: basename(item.path.replace(/[\\/]+$/, "")), origin: item.origin || "", branch: item.branch, commit: item.commit, dirty: !!item.hasChanges };
      if (item.role === "ROOT_DIR") return { role: "root", ...common };
      if (item.role === "ROOT_DIR_3rdParty") return { role: "thirdParty", ...common };
      return { role: "project", ...common, buildKinds: compiledKinds.get(ktcPathKey(item.path))! };
    });
  const repositories = previous ? [...previous.repositories] : [];
  for (const item of current) {
    const key = ktcRepositoryKey(item), index = repositories.findIndex((candidate) => ktcRepositoryKey(candidate) === key);
    if (index >= 0) repositories[index] = item; else repositories.push(item);
  }
  repositories.sort((left, right) => ktcRepositorySortKey(left).localeCompare(ktcRepositorySortKey(right), "en", { sensitivity: "base" }));
  return { schemaVersion: 1, finishedAt: new Date().toISOString(), status: "succeeded", repositories };
}

export function ktcParseBuildManifest(source: string): KtcBuildManifest {
  const value = JSON.parse(source) as KtcBuildManifest;
  if (value.schemaVersion !== 1 || !Array.isArray(value.repositories)) throw new Error("仅支持 BUILD_MANIFEST schemaVersion 1。");
  for (const item of value.repositories) {
    if (!item || !["root", "thirdParty", "project"].includes(item.role)) throw new Error("BUILD_MANIFEST 包含无效的 role。仅支持 root、thirdParty、project。");
    if (item.role === "project") {
      if (!Array.isArray(item.buildKinds) || item.buildKinds.length === 0 || item.buildKinds.some((kind) => kind !== "cmake" && kind !== "caa")) throw new Error("BUILD_MANIFEST 的 project 必须包含有效的 buildKinds。");
      const normalized = [...new Set(item.buildKinds)].sort((left, right) => ["cmake", "caa"].indexOf(left) - ["cmake", "caa"].indexOf(right));
      if (normalized.length !== item.buildKinds.length || normalized.some((kind, index) => kind !== item.buildKinds![index])) throw new Error("BUILD_MANIFEST 的 buildKinds 必须无重复并按 cmake、caa 排序。");
    } else if (item.buildKinds !== undefined) throw new Error("BUILD_MANIFEST 仅允许 project 包含 buildKinds。");
  }
  return value;
}

function ktcPathKey(value: string): string { return value.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase(); }
function ktcRepositoryKey(item: KtcBuildManifestRepository): string { return item.origin ? `origin:${item.origin.toLocaleLowerCase()}` : `name:${item.role.toLocaleLowerCase()}:${item.name.toLocaleLowerCase()}`; }
function ktcRepositorySortKey(item: KtcBuildManifestRepository): string { return item.origin || `${item.role}/${item.name}`; }
