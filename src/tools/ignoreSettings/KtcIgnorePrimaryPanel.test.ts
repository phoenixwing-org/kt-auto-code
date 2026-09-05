import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcIgnoreRuleDefinition } from "../../core/ignoreRuleCatalog.js";
import type { KtcIgnoreRecommendationReport } from "../../ignoreRecommendationTypes.js";
import type { IgnoreConfigSummary } from "../types.js";
import type { KtcIgnorePrimaryPanelModel } from "./KtcIgnorePrimaryPanelModel.js";

class FakeClassList {
  constructor(private readonly node: FakeNode) {}
  add(...names: string[]): void {
    const values = new Set(this.node.className.split(/\s+/u).filter(Boolean));
    for (const name of names) values.add(name);
    this.node.className = [...values].join(" ");
  }
}

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly classList = new FakeClassList(this);
  className = "";
  textContent = "";
  title = "";
  type = "";
  checked = false;
  disabled = false;
  open = false;
  name = "";
  value = "";
  onclick?: () => void;
  onchange?: () => void;
  ontoggle?: () => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

class FakeElement extends FakeNode {
  readonly shadow = new FakeNode("shadow-root");
  readonly events: Array<{ type: string; detail: unknown; bubbles: boolean; composed: boolean }> = [];
  readonly isConnected = true;
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown; bubbles?: boolean; composed?: boolean }): boolean {
    this.events.push({
      type: event.type,
      detail: event.detail,
      bubbles: Boolean(event.bubbles),
      composed: Boolean(event.composed),
    });
    return true;
  }
}

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
    createElementNS: (_namespace: string, tagName: string) => new FakeNode(tagName),
  });
  vi.stubGlobal("CustomEvent", class<T> {
    readonly detail: T;
    readonly bubbles: boolean;
    readonly composed: boolean;
    constructor(
      public readonly type: string,
      init: { detail: T; bubbles?: boolean; composed?: boolean },
    ) {
      this.detail = init.detail;
      this.bubbles = Boolean(init.bubbles);
      this.composed = Boolean(init.composed);
    }
  });
  vi.stubGlobal("customElements", {
    get: (name: string) => registry.get(name),
    define: (name: string, value: CustomElementConstructor) => registry.set(name, value),
  });
  return registry;
}

function findNodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  const result: FakeNode[] = [];
  if (predicate(root)) result.push(root);
  for (const child of root.children) result.push(...findNodes(child, predicate));
  return result;
}

function findByAttribute(root: FakeNode, name: string, value: string): FakeNode {
  return findNodes(root, (node) => node.attributes.get(name) === value)[0]!;
}

function textOf(node: FakeNode): string {
  return node.textContent + node.children.map(textOf).join("");
}

function rule(id: string, value: string): KtcIgnoreRuleDefinition {
  return { id, value, kind: value.endsWith("/") ? "directory" : "pattern", categories: ["test"], description: `${value} 说明` };
}

function report(): KtcIgnoreRecommendationReport {
  return {
    workspace: "repo",
    truncated: false,
    recommendations: [{
      groupId: "build-output",
      title: "构建输出",
      description: "构建生成文件与缓存",
      confidence: "high",
      defaultSelected: true,
      reviewRequired: false,
      evidence: [{ kind: "matching-path", label: "发现 build/", path: "build/" }],
      suggestedRules: [rule("cache", "cache/")],
      existingRules: [rule("build", "build/")],
      blockedRules: [],
    }],
  };
}

function config(): IgnoreConfigSummary {
  return {
    relativePath: ".phoenix/.ignore",
    fullPath: "/repo/.phoenix/.ignore",
    patternCount: 1,
    gitIgnoreExists: true,
    statusText: "2 条有效规则",
    primaryCustomPatterns: [],
    builtInPatternCount: 31,
    builtInPatterns: [".git/", "build/", "node_modules/"],
    targets: [
      {
        target: "git", label: "Git .gitignore", relativePath: ".gitignore", fullPath: "/repo/.gitignore",
        exists: true, available: true, dirty: false, patternCount: 1,
      },
      {
        target: "phoenix", label: "Phoenix .ignore", relativePath: ".phoenix/.ignore", fullPath: "/repo/.phoenix/.ignore",
        exists: true, available: true, dirty: true, patternCount: 1,
      },
    ],
    mergedRules: [{
      value: "build/",
      normalizedValue: "build/",
      sources: ["git", "phoenix"],
      presentIn: { git: true, phoenix: true },
    }],
  };
}

function model(): KtcIgnorePrimaryPanelModel {
  return {
    config: config(),
    recommendations: report(),
    sourceEnabled: { builtIn: true, git: true, custom: false },
    message: "规则已读取",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Ignore Primary panel Web Component", () => {
  it("registers idempotently and renders four contiguous sections with Git selected by default", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcIgnorePrimaryPanel.js");
    const first = browser.KtcDefineIgnorePrimaryPanel();
    const second = browser.KtcDefineIgnorePrimaryPanel();
    expect(registry.get("ktc-ignore-primary-panel")).toBe(first);
    expect(second).toBe(first);

    const element = new browser.KtcIgnorePrimaryPanel() as unknown as FakeElement & {
      model: KtcIgnorePrimaryPanelModel;
    };
    element.model = model();
    const sections = findNodes(element.shadow, (node) => node.className === "section");
    expect(sections.map((section) => section.attributes.get("data-section")))
      .toEqual(["sources", "builtIn", "effective", "recommendations"]);
    expect(sections[0]?.open).toBe(true);
    expect(sections[1]?.open).toBe(false);
    expect(sections[2]?.open).toBe(false);
    expect(sections[3]?.open).toBe(true);
    expect(findNodes(element.shadow, (node) => node.className.split(/\s+/u).includes("target")).map(textOf))
      .toEqual(["Git .gitignore1 条", "Phoenix .ignore1 条 · 未保存"]);
    const targetRadios = findNodes(element.shadow, (node) => node.tagName === "input" && node.type === "radio");
    expect(targetRadios.map((radio) => radio.name)).toEqual(["ktc-ignore-write-target", "ktc-ignore-write-target"]);
    expect(targetRadios.map((radio) => radio.checked)).toEqual([true, false]);
    const targetLabels = findNodes(element.shadow, (node) => node.className.split(/\s+/u).includes("target"));
    expect(targetLabels.every((label) => label.children[0]?.tagName === "input" && label.children[0]?.type === "radio"))
      .toBe(true);
  });

  it("renders effective source badges and two-line recommendation summaries", async () => {
    installFakeDom();
    const browser = await import("./KtcIgnorePrimaryPanel.js");
    const element = new browser.KtcIgnorePrimaryPanel() as unknown as FakeElement & { model: KtcIgnorePrimaryPanelModel };
    element.model = model();

    const effective = findNodes(element.shadow, (node) => node.className === "effective-row")[0]!;
    expect(textOf(effective)).toBe("build/GitPhoenix");
    expect(findNodes(effective, (node) => node.className.split(/\s+/u).includes("source-badge")).map(textOf))
      .toEqual(["Git", "Phoenix"]);
    expect(findNodes(element.shadow, (node) => node.className === "built-in-row").map(textOf))
      .toEqual([".git/内置", "build/内置", "node_modules/内置"]);
    expect(textOf(effective)).not.toContain("node_modules");

    const recommendation = findNodes(element.shadow, (node) => node.className === "recommendation-summary")[0]!;
    expect(recommendation.children).toHaveLength(2);
    expect(recommendation.children[0]?.className).toContain("recommendation-first-line");
    expect(recommendation.children[1]?.className).toBe("recommendation-second-line");
    expect(textOf(recommendation)).toContain("构建输出");
    expect(textOf(recommendation)).toContain("待加 1 · 已有 1 · 阻止 0");
    expect(textOf(recommendation)).toContain("构建生成文件与缓存");

    expect(findNodes(element.shadow, (node) => node.className === "preset-group")
      .map((node) => node.attributes.get("data-preset-id"))).toEqual(["caa", "cpp", "web"]);
  });

  it("does not offer to open a target file before a rule has created it", async () => {
    installFakeDom();
    const browser = await import("./KtcIgnorePrimaryPanel.js");
    const missingGit = config();
    missingGit.targets = missingGit.targets.map((target) => target.target === "git"
      ? { ...target, exists: false, patternCount: 0 }
      : target);
    const element = new browser.KtcIgnorePrimaryPanel() as unknown as FakeElement & {
      model: KtcIgnorePrimaryPanelModel;
    };
    element.model = { config: missingGit };

    const open = findNodes(
      element.shadow,
      (node) => node.tagName === "button" && node.textContent === "打开目标文件",
    )[0]!;
    expect(open.disabled).toBe(true);
    expect(open.title).toContain("尚不存在");
    open.onclick?.();
    expect(element.events).toEqual([]);
  });

  it("emits only typed composed actions for source, target, open, and analyze", async () => {
    installFakeDom();
    const browser = await import("./KtcIgnorePrimaryPanel.js");
    const element = new browser.KtcIgnorePrimaryPanel() as unknown as FakeElement & { model: KtcIgnorePrimaryPanelModel };
    element.model = model();

    const gitSource = findByAttribute(element.shadow, "aria-label", "启用 Git");
    gitSource.checked = false;
    gitSource.onchange?.();
    const phoenixTarget = findByAttribute(element.shadow, "data-target", "phoenix");
    const phoenixRadio = phoenixTarget.children[0]!;
    phoenixRadio.checked = true;
    phoenixRadio.onchange?.();
    findNodes(element.shadow, (node) => node.tagName === "button" && node.textContent === "打开目标文件")[0]?.onclick?.();
    findNodes(element.shadow, (node) => node.tagName === "button" && node.textContent === "分析当前目录")[0]?.onclick?.();

    expect(element.events.map((event) => event.detail)).toEqual([
      { action: "setSourceEnabled", source: "git", enabled: false },
      { action: "selectTarget", target: "phoenix" },
      { action: "openTarget", target: "phoenix" },
      { action: "analyze" },
    ]);
    expect(element.events.every((event) =>
      event.type === "ktc-ignore-primary-action" && event.bubbles && event.composed)).toBe(true);
  });

  it("supports partial preset and recommendation rule operations", async () => {
    installFakeDom();
    const browser = await import("./KtcIgnorePrimaryPanel.js");
    const element = new browser.KtcIgnorePrimaryPanel() as unknown as FakeElement & { model: KtcIgnorePrimaryPanelModel };
    element.model = model();

    const caa = findByAttribute(element.shadow, "data-preset-id", "caa");
    caa.open = true;
    caa.ontoggle?.();
    const toolsData = findByAttribute(element.shadow, "aria-label", "选择规则 ToolsData/");
    toolsData.checked = true;
    toolsData.onchange?.();
    const reopenedCaa = findByAttribute(element.shadow, "data-preset-id", "caa");
    expect(reopenedCaa.open).toBe(true);
    const presetActions = findByAttribute(element.shadow, "data-rule-scope", "preset");
    findByAttribute(presetActions, "data-operation", "append").onclick?.();

    const recommendationActions = findByAttribute(element.shadow, "data-rule-scope", "recommendation");
    findByAttribute(recommendationActions, "data-operation", "append").onclick?.();
    expect(element.events.map((event) => event.detail)).toEqual([
      {
        action: "applyRules", scope: "preset", target: "git",
        operation: "append", rules: ["ToolsData/"],
      },
      {
        action: "applyRules", scope: "recommendation", target: "git",
        operation: "append", rules: ["cache/"],
      },
    ]);
  });
});
