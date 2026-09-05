import { basename } from "node:path";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import { ktcResolveAutoBuildPath } from "./autoBuildProjectTable.js";

export type KtcBuildManifestMode = "overwrite" | "merge";
export interface KtcBuildManifestRepository { role: string; name: string; origin: string; branch: string; commit: string; dirty: boolean; }
export interface KtcBuildManifest { schemaVersion: 1; finishedAt: string; status: "succeeded"; repositories: KtcBuildManifestRepository[]; }

export function ktcCreateBuildManifest(configuration: KtcAutoBuildConfiguration, previous?: KtcBuildManifest): KtcBuildManifest {
  const working = configuration.workingDirectory || "", compiledPaths = new Set(configuration.projects
    .filter((item) => item.enabled && (item.operations.cmake || item.operations.caa))
    .map((item) => ktcPathKey(ktcResolveAutoBuildPath(item.path, working))));
  const current = (configuration.repositorySnapshot?.repositories || [])
    .filter((item) => !item.error && !!item.commit && (item.role === "ROOT_DIR" || item.role === "ROOT_DIR_3rdParty" || compiledPaths.has(ktcPathKey(item.path))))
    .map((item) => ({ role: item.role, name: basename(item.path.replace(/[\\/]+$/, "")), origin: item.origin || "", branch: item.branch, commit: item.commit, dirty: !!item.hasChanges }));
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
  return value;
}

function ktcPathKey(value: string): string { return value.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase(); }
function ktcRepositoryKey(item: KtcBuildManifestRepository): string { return item.origin ? `origin:${item.origin.toLocaleLowerCase()}` : `name:${item.role.toLocaleLowerCase()}:${item.name.toLocaleLowerCase()}`; }
function ktcRepositorySortKey(item: KtcBuildManifestRepository): string { return item.origin || `${item.role}/${item.name}`; }
