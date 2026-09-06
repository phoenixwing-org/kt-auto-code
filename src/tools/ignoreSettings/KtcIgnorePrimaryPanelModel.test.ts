import { describe, expect, it } from "vitest";
import type { KtcIgnoreRuleDefinition } from "../../core/ignoreRuleCatalog.js";
import type { KtcIgnoreRecommendationReport } from "../../ignoreRecommendationTypes.js";
import type { IgnoreConfigSummary, IgnoreMergedRuleSummary } from "../types.js";
import {
  ktcBuildIgnorePrimaryPanelViewModel,
  ktcCreateIgnorePrimaryPanelState,
  ktcReconcileIgnorePrimaryPanelState,
  ktcReduceIgnorePrimaryPanelState,
  ktcSelectedIgnoreRules,
  type KtcIgnorePrimaryPanelModel,
} from "./KtcIgnorePrimaryPanelModel.js";

function merged(
  value: string,
  normalizedValue: string,
  git: boolean,
  phoenix: boolean,
): IgnoreMergedRuleSummary {
  return {
    value,
    normalizedValue,
    sources: [git ? "git" as const : undefined, phoenix ? "phoenix" as const : undefined]
      .filter((source): source is "git" | "phoenix" => !!source),
    presentIn: { git, phoenix },
  };
}

function config(rules: readonly IgnoreMergedRuleSummary[] = []): IgnoreConfigSummary {
  return {
    relativePath: ".phoenix/.ignore",
    fullPath: "/repo/.phoenix/.ignore",
    patternCount: rules.filter((item) => item.presentIn.phoenix).length,
    gitIgnoreExists: true,
    statusText: `${rules.length} 条有效规则`,
    primaryCustomPatterns: [],
    builtInPatternCount: 31,
    builtInPatterns: [".git/", "build/", "build"],
    targets: [
      {
        target: "git", label: "Git .gitignore", relativePath: ".gitignore",
        fullPath: "/repo/.gitignore", exists: true, available: true, dirty: false,
        patternCount: rules.filter((item) => item.presentIn.git).length,
      },
      {
        target: "phoenix", label: "Phoenix .ignore", relativePath: ".phoenix/.ignore",
        fullPath: "/repo/.phoenix/.ignore", exists: true, available: true, dirty: false,
        patternCount: rules.filter((item) => item.presentIn.phoenix).length,
      },
    ],
    mergedRules: rules,
  };
}

function rule(id: string, value: string): KtcIgnoreRuleDefinition {
  return { id, value, kind: value.endsWith("/") ? "directory" : "pattern", categories: ["test"], description: `${value} 说明` };
}

function recommendations(): KtcIgnoreRecommendationReport {
  return {
    workspace: "repo",
    truncated: false,
    recommendations: [{
      groupId: "generated",
      title: "生成文件",
      description: "构建生成与本地配置",
      confidence: "high",
      defaultSelected: true,
      reviewRequired: false,
      evidence: [{ kind: "signature", label: "发现构建配置", path: "CMakeLists.txt" }],
      suggestedRules: [rule("cache", "cache/")],
      existingRules: [rule("build", "build/")],
      blockedRules: [{ rule: rule("vscode", ".vscode/"), trackedPaths: [".vscode/tasks.json"] }],
    }],
  };
}

describe("Ignore Primary panel model", () => {
  it("keeps the three sections stable and opens recommendations by default", () => {
    const input: KtcIgnorePrimaryPanelModel = { config: config() };
    const state = ktcCreateIgnorePrimaryPanelState(input);
    const view = ktcBuildIgnorePrimaryPanelViewModel(input, state);
    expect(state.openSections).toEqual(["sources", "recommendations"]);
    expect(view.openSections).toEqual({ sources: true, builtIn: false, effective: false, recommendations: true });
    expect(view.targets.map((target) => target.target)).toEqual(["git", "phoenix"]);
    expect(view.targets.find((target) => target.target === "git")?.selected).toBe(true);
    expect(view.builtInRules).toEqual([".git/", "build/", "build"]);
    expect(view.effectiveRules).toEqual([]);

    const withoutGit: KtcIgnorePrimaryPanelModel = {
      config: {
        ...config(),
        targets: config().targets.map((target) => target.target === "git"
          ? { ...target, available: false, exists: false, fullPath: undefined }
          : target),
      },
    };
    let fallbackState = ktcCreateIgnorePrimaryPanelState(withoutGit);
    expect(fallbackState).toMatchObject({ selectedTarget: "phoenix", targetSelectionMode: "automatic" });

    fallbackState = ktcReconcileIgnorePrimaryPanelState(fallbackState, { config: config() });
    expect(fallbackState).toMatchObject({ selectedTarget: "git", targetSelectionMode: "automatic" });
  });

  it("keeps an explicit target in one directory and resets to Git-first when the directory changes", () => {
    const input: KtcIgnorePrimaryPanelModel = { config: config() };
    let state = ktcCreateIgnorePrimaryPanelState(input);
    state = ktcReduceIgnorePrimaryPanelState(state, { type: "selectTarget", target: "phoenix" });
    expect(ktcReconcileIgnorePrimaryPanelState(state, input)).toMatchObject({
      selectedTarget: "phoenix",
      targetSelectionMode: "explicit",
      explicitTarget: "phoenix",
    });

    const otherDirectory: KtcIgnorePrimaryPanelModel = {
      config: {
        ...config(),
        fullPath: "/repo/packages/other/.phoenix/.ignore",
        targets: config().targets.map((target) => ({
          ...target,
          fullPath: target.target === "git" ? "/repo/.gitignore" : "/repo/packages/other/.phoenix/.ignore",
        })),
      },
    };
    expect(ktcReconcileIgnorePrimaryPanelState(state, otherDirectory)).toMatchObject({
      selectedTarget: "git",
      targetSelectionMode: "automatic",
      explicitTarget: undefined,
    });
  });

  it("projects add/remove state against the selected target rather than all sources", () => {
    const input: KtcIgnorePrimaryPanelModel = {
      config: config([
        merged("win_b64/", "win_b64/", true, false),
        merged("*.obj", "*.obj", false, true),
      ]),
      selectedTarget: "phoenix",
    };
    let state = ktcCreateIgnorePrimaryPanelState(input);
    for (const key of ["win_b64/", "*.obj", "ToolsData/"]) {
      state = ktcReduceIgnorePrimaryPanelState(state, {
        type: "setRuleSelected", scope: "preset", ruleKey: key, selected: true,
      });
    }
    let view = ktcBuildIgnorePrimaryPanelViewModel(input, state);
    const caa = view.presets.find((preset) => preset.id === "caa")!;
    expect(caa.rules.find((item) => item.value === "win_b64/")).toMatchObject({
      presence: "git", canAppend: true, canRemove: false, selected: true,
    });
    expect(caa.rules.find((item) => item.value === "*.obj")).toMatchObject({
      presence: "phoenix", canAppend: false, canRemove: true, selected: true,
    });
    expect(caa.rules.find((item) => item.value === "ToolsData/")).toMatchObject({
      presence: "missing", canAppend: true, canRemove: false, selected: true,
    });
    expect(ktcSelectedIgnoreRules(view, "preset", "append")).toEqual(["ToolsData/", "win_b64/"]);
    expect(ktcSelectedIgnoreRules(view, "preset", "remove")).toEqual(["*.obj"]);

    state = ktcReduceIgnorePrimaryPanelState(state, { type: "selectTarget", target: "git" });
    view = ktcBuildIgnorePrimaryPanelViewModel(input, state);
    expect(ktcSelectedIgnoreRules(view, "preset", "remove")).toEqual(["win_b64/"]);
    expect(ktcSelectedIgnoreRules(view, "preset", "append")).toEqual(["ToolsData/", "*.obj"]);
  });

  it("defaults only a safe recommendation, exposes counts, and never selects blocked rules", () => {
    const input: KtcIgnorePrimaryPanelModel = {
      config: config([merged("build/", "build/", false, true)]),
      recommendations: recommendations(),
      selectedTarget: "phoenix",
    };
    let state = ktcCreateIgnorePrimaryPanelState(input);
    let view = ktcBuildIgnorePrimaryPanelViewModel(input, state);
    const group = view.recommendationGroups[0]!;
    expect(group).toMatchObject({ confidenceLabel: "高", appendCount: 1, existingCount: 1, blockedCount: 1 });
    expect(group.secondLine).toContain("构建生成与本地配置");
    expect(ktcSelectedIgnoreRules(view, "recommendation", "append")).toEqual(["cache/"]);

    state = ktcReduceIgnorePrimaryPanelState(state, {
      type: "setRuleSelected", scope: "recommendation", ruleKey: "build/", selected: true,
    });
    state = ktcReduceIgnorePrimaryPanelState(state, {
      type: "setRuleSelected", scope: "recommendation", ruleKey: ".vscode/", selected: true,
    });
    view = ktcBuildIgnorePrimaryPanelViewModel(input, state);
    expect(ktcSelectedIgnoreRules(view, "recommendation", "remove")).toEqual(["build/"]);
    expect(view.recommendationGroups[0]?.rules.find((item) => item.value === ".vscode/")).toMatchObject({
      presence: "blocked", selected: false, canAppend: false, canRemove: false,
    });
  });

  it("preserves transient state for the same report and resets stale recommendation choices", () => {
    const input: KtcIgnorePrimaryPanelModel = { config: config(), recommendations: recommendations() };
    let state = ktcCreateIgnorePrimaryPanelState(input);
    state = ktcReduceIgnorePrimaryPanelState(state, { type: "setRecommendationOpen", groupId: "generated", open: true });
    expect(ktcReconcileIgnorePrimaryPanelState(state, input).openRecommendationIds).toEqual(["generated"]);

    const next: KtcIgnorePrimaryPanelModel = {
      ...input,
      recommendations: {
        ...recommendations(),
        recommendations: [{
          ...recommendations().recommendations[0]!,
          suggestedRules: [rule("dist", "dist/")],
        }],
      },
    };
    const reconciled = ktcReconcileIgnorePrimaryPanelState(state, next);
    expect(reconciled.openRecommendationIds).toEqual([]);
    expect(reconciled.selectedRecommendationRuleKeys).toEqual(["dist/"]);
  });
});
