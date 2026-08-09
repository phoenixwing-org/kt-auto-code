import { isIgnoredPath } from "./dotIgnore.js";
import {
  ktcGetBuiltinIgnoreRuleCatalog,
  ktcResolveIgnoreGroupRules,
  type KtcIgnoreRuleCatalogDocument,
  type KtcIgnoreRuleDefinition,
} from "./ignoreRuleCatalog.js";

export type KtcIgnoreRecommendationConfidence = "high" | "medium" | "low";

export interface KtcIgnoreWorkspaceSnapshot {
  paths: readonly string[];
  trackedPaths: readonly string[];
  existingPatterns: readonly string[];
  truncated?: boolean;
}

export interface KtcIgnoreRecommendationEvidence {
  kind: "signature" | "existing-rule" | "matching-path";
  label: string;
  path?: string;
}

export interface KtcBlockedIgnoreRule {
  rule: KtcIgnoreRuleDefinition;
  trackedPaths: readonly string[];
}

export interface KtcIgnoreGroupRecommendation {
  groupId: string;
  title: string;
  description: string;
  confidence: KtcIgnoreRecommendationConfidence;
  defaultSelected: boolean;
  reviewRequired: boolean;
  evidence: readonly KtcIgnoreRecommendationEvidence[];
  suggestedRules: readonly KtcIgnoreRuleDefinition[];
  existingRules: readonly KtcIgnoreRuleDefinition[];
  blockedRules: readonly KtcBlockedIgnoreRule[];
}

const PROCESS_DIRECTORY_NAMES = new Set(["build", "debug", "release", "out", "bin", "obj", "dist", ".cache", "_build"]);

interface EvidenceSeed {
  confidence: KtcIgnoreRecommendationConfidence;
  evidence: KtcIgnoreRecommendationEvidence;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function basename(value: string): string {
  const parts = normalizePath(value).replace(/\/$/, "").split("/");
  return parts[parts.length - 1] ?? "";
}

function hasPath(snapshot: KtcIgnoreWorkspaceSnapshot, predicate: (path: string) => boolean): string | undefined {
  return snapshot.paths.map(normalizePath).find(predicate);
}

function addEvidence(
  target: Map<string, EvidenceSeed[]>,
  groupIds: readonly string[],
  confidence: KtcIgnoreRecommendationConfidence,
  label: string,
  path?: string,
): void {
  for (const groupId of groupIds) {
    const list = target.get(groupId) ?? [];
    list.push({ confidence, evidence: { kind: "signature", label, path } });
    target.set(groupId, list);
  }
}

function seedSignatureEvidence(snapshot: KtcIgnoreWorkspaceSnapshot): Map<string, EvidenceSeed[]> {
  const result = new Map<string, EvidenceSeed[]>();
  const imake = hasPath(snapshot, (path) => basename(path) === "Imakefile.mk");
  const identityCard = hasPath(snapshot, (path) => path.split("/").includes("IdentityCard"));
  const caaModule = hasPath(snapshot, (path) => path.split("/").some((part) => part.endsWith(".m")));
  const caaToolData = hasPath(snapshot, (path) => ["ToolsData", "Objects", "ImportedInterfaces"].includes(basename(path)));
  const caaPlatform = hasPath(snapshot, (path) => ["intel_a", "win_b64", "Install_config_win_b64"].includes(basename(path)));
  if (imake) addEvidence(result, ["caa-mkmk", "caa-generated"], "high", "发现 CAA mkmk 构建文件", imake);
  if (identityCard) addEvidence(result, ["caa-mkmk"], "high", "发现 CAA Framework IdentityCard", identityCard);
  if (caaModule) addEvidence(result, ["caa-mkmk", "caa-generated"], "medium", "发现 CAA .m 模块目录", caaModule);
  if (caaToolData) addEvidence(result, ["caa-mkmk"], "high", "发现 CAA 工具或构建目录", caaToolData);
  if (caaPlatform) addEvidence(result, ["caa-platform"], "high", "发现 CAA 平台输出目录", caaPlatform);

  const cmake = hasPath(snapshot, (path) => basename(path) === "CMakeLists.txt");
  const msbuild = hasPath(snapshot, (path) => /\.(sln|vcxproj)$/i.test(path));
  const makefile = hasPath(snapshot, (path) => ["Makefile", "makefile"].includes(basename(path)));
  if (cmake) addEvidence(result, ["cpp-cmake", "native-object"], "high", "发现 CMakeLists.txt", cmake);
  if (msbuild) addEvidence(result, ["cpp-cmake", "native-object"], "high", "发现 Visual Studio 工程", msbuild);
  if (makefile) addEvidence(result, ["native-object"], "medium", "发现 Makefile", makefile);

  const packageJson = hasPath(snapshot, (path) => basename(path) === "package.json");
  const nodeLock = hasPath(snapshot, (path) => ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb"].includes(basename(path)));
  const webFramework = hasPath(snapshot, (path) => /(^|\/)(vite|next|nuxt)\.config\.[^/]+$/i.test(path));
  if (packageJson) addEvidence(result, ["web-node"], "high", "发现 package.json", packageJson);
  if (nodeLock) addEvidence(result, ["web-node"], "high", "发现 Node 锁文件", nodeLock);
  if (webFramework) addEvidence(result, ["web-output"], "high", "发现 Web 框架配置", webFramework);
  return result;
}

function confidenceRank(value: KtcIgnoreRecommendationConfidence): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function maxConfidence(seeds: readonly EvidenceSeed[]): KtcIgnoreRecommendationConfidence {
  return seeds.reduce<KtcIgnoreRecommendationConfidence>(
    (current, seed) => confidenceRank(seed.confidence) > confidenceRank(current) ? seed.confidence : current,
    "low",
  );
}

function ruleMatchesPaths(rule: KtcIgnoreRuleDefinition, paths: readonly string[]): string[] {
  return paths.filter((path) => isIgnoredPath(normalizePath(path), [rule.value]));
}

function hasEquivalentExistingPattern(rule: KtcIgnoreRuleDefinition, patterns: ReadonlySet<string>): boolean {
  const value = normalizePath(rule.value);
  if (patterns.has(value)) return true;
  if (rule.kind !== "directory") return false;
  const withoutSlash = value.replace(/\/$/, "");
  return patterns.has(withoutSlash) || patterns.has(`${withoutSlash}/`);
}

function topLevelProcessDirectory(path: string): string | undefined {
  const normalized = normalizePath(path);
  if (!normalized.endsWith("/") || normalized.slice(0, -1).includes("/")) return undefined;
  const name = normalized.slice(0, -1);
  const lower = name.toLowerCase();
  return PROCESS_DIRECTORY_NAMES.has(lower) || /^build-/i.test(name) || /^cmake-build-/i.test(name) ? name : undefined;
}

function processDirectoryPattern(name: string): string {
  if (/^cmake-build-/i.test(name)) return "cmake-build-*/";
  if (/^build-/i.test(name)) return "build-*/";
  return `${name}/`;
}

function buildProcessDirectoryRecommendation(
  snapshot: KtcIgnoreWorkspaceSnapshot,
  catalog: KtcIgnoreRuleCatalogDocument,
): KtcIgnoreGroupRecommendation | undefined {
  const existingPatterns = new Set(snapshot.existingPatterns.map((pattern) => normalizePath(pattern.trim())).filter(Boolean));
  const catalogValues = new Set(catalog.rules.map((rule) => normalizePath(rule.value)));
  const pathsByPattern = new Map<string, string[]>();
  for (const path of snapshot.paths) {
    const name = topLevelProcessDirectory(path);
    if (!name || isIgnoredPath(path, [...snapshot.existingPatterns])) continue;
    const pattern = processDirectoryPattern(name);
    if (catalogValues.has(normalizePath(pattern))) continue;
    const paths = pathsByPattern.get(pattern) ?? [];
    paths.push(path);
    pathsByPattern.set(pattern, paths);
  }
  if (pathsByPattern.size === 0) return undefined;

  const rules: KtcIgnoreRuleDefinition[] = [...pathsByPattern.keys()].sort().map((value, index) => ({
    id: `process-directory-${index + 1}`,
    value,
    kind: "directory",
    categories: ["build-output", "process-directory"],
    description: "Desk Tools 进程目录启发式识别出的顶层构建或缓存目录",
  }));
  const existingRules = rules.filter((rule) => hasEquivalentExistingPattern(rule, existingPatterns));
  const candidateRules = rules.filter((rule) => !hasEquivalentExistingPattern(rule, existingPatterns));
  const blockedRules = candidateRules
    .map((rule) => ({ rule, trackedPaths: ruleMatchesPaths(rule, snapshot.trackedPaths).slice(0, 5) }))
    .filter((item) => item.trackedPaths.length > 0);
  const blockedIds = new Set(blockedRules.map((item) => item.rule.id));
  const suggestedRules = candidateRules.filter((rule) => !blockedIds.has(rule.id));
  return {
    groupId: "process-directories",
    title: "顶层构建与缓存目录",
    description: "Desk Tools 启发式发现的 process/build 目录；仅建议，不会自动写入",
    confidence: "high",
    defaultSelected: suggestedRules.length > 0 && blockedRules.length === 0,
    reviewRequired: false,
    evidence: [...pathsByPattern.values()].flat().slice(0, 8).map((path) => ({
      kind: "matching-path" as const,
      label: `发现顶层进程目录 ${path}`,
      path,
    })),
    suggestedRules,
    existingRules,
    blockedRules,
  };
}

export function ktcAnalyzeIgnoreRecommendations(
  snapshot: KtcIgnoreWorkspaceSnapshot,
  catalog: KtcIgnoreRuleCatalogDocument = ktcGetBuiltinIgnoreRuleCatalog(),
): readonly KtcIgnoreGroupRecommendation[] {
  const seedsByGroup = seedSignatureEvidence(snapshot);
  const existingPatterns = new Set(snapshot.existingPatterns.map((pattern) => normalizePath(pattern.trim())).filter(Boolean));

  for (const group of catalog.groups) {
    const rules = ktcResolveIgnoreGroupRules(group.id, catalog);
    for (const rule of rules) {
      if (hasEquivalentExistingPattern(rule, existingPatterns)) {
        const seeds = seedsByGroup.get(group.id) ?? [];
        seeds.push({
          confidence: "high",
          evidence: { kind: "existing-rule", label: `已有规则 ${rule.value}` },
        });
        seedsByGroup.set(group.id, seeds);
      }
      const matchedPath = ruleMatchesPaths(rule, snapshot.paths)[0];
      if (matchedPath) {
        const seeds = seedsByGroup.get(group.id) ?? [];
        seeds.push({
          confidence: "high",
          evidence: { kind: "matching-path", label: `发现匹配项 ${rule.value}`, path: matchedPath },
        });
        seedsByGroup.set(group.id, seeds);
      }
    }
  }

  const recommendations: KtcIgnoreGroupRecommendation[] = [];
  for (const group of catalog.groups) {
    const seeds = seedsByGroup.get(group.id) ?? [];
    if (seeds.length === 0) continue;
    const rules = ktcResolveIgnoreGroupRules(group.id, catalog);
    const existingRules = rules.filter((rule) => hasEquivalentExistingPattern(rule, existingPatterns));
    const candidateRules = rules.filter((rule) => !hasEquivalentExistingPattern(rule, existingPatterns));
    const blockedRules = candidateRules
      .map((rule) => ({ rule, trackedPaths: ruleMatchesPaths(rule, snapshot.trackedPaths).slice(0, 5) }))
      .filter((item) => item.trackedPaths.length > 0);
    const blockedIds = new Set(blockedRules.map((item) => item.rule.id));
    const suggestedRules = candidateRules.filter((rule) => !blockedIds.has(rule.id));
    const confidence = maxConfidence(seeds);
    recommendations.push({
      groupId: group.id,
      title: group.title,
      description: group.description,
      confidence,
      defaultSelected: group.defaultSelected && !group.reviewRequired
        && blockedRules.length === 0 && suggestedRules.length > 0 && confidence === "high",
      reviewRequired: group.reviewRequired,
      evidence: seeds.map((seed) => seed.evidence),
      suggestedRules,
      existingRules,
      blockedRules,
    });
  }
  const processDirectories = buildProcessDirectoryRecommendation(snapshot, catalog);
  if (processDirectories) recommendations.push(processDirectories);
  return recommendations.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence)
    || Number(a.reviewRequired) - Number(b.reviewRequired)
    || a.title.localeCompare(b.title));
}
