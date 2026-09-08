import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcAutoBuildPrimaryPanelModel } from "../../core/autoBuildPrimaryContracts.js";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  title = "";
  type = "";
  value = "";
  placeholder = "";
  maxLength = 0;
  disabled = false;
  checked = false;
  open = false;
  onclick?: () => void;
  onchange?: () => void;
  oninput?: () => void;
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

function installFakeDom(): void {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
    createDocumentFragment: () => new FakeNode("fragment"),
    createTextNode: (value: string) => {
      const node = new FakeNode("text");
      node.textContent = value;
      return node;
    },
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
}

function findNodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  const result: FakeNode[] = [];
  if (predicate(root)) result.push(root);
  for (const child of root.children) result.push(...findNodes(child, predicate));
  return result;
}

function textOf(node: FakeNode): string {
  return node.textContent + node.children.map(textOf).join("");
}

function model(disabledActionId = ""): KtcAutoBuildPrimaryPanelModel {
  const action = (id: string, label: string, tone?: "primary" | "secondary" | "danger") => ({
    id,
    label,
    enabled: id !== disabledActionId,
    ...(tone ? { tone } : {}),
    ...(id === disabledActionId ? { disabledReason: "测试禁用" } : {}),
  });
  return {
    configuration: {
      name: "auto-build.local.json",
      fullPath: "/workspace/auto-build.local.json",
      dirty: true,
      statusLabel: "有未保存修改",
      workingDirectoryMismatch: false,
      workingDirectoryMismatchMessage: "",
      recent: [
        {
          actionId: "selectRecent0",
          name: "auto-build.release.json",
          fullPath: "/workspace/auto-build.release.json",
          selected: false,
        },
      ],
    },
    metrics: [
      { label: "启用项目", value: "2 / 2" },
      { label: "任务", value: "0 / 4" },
      { label: "失败", value: "0" },
    ],
    parallelBuild: false,
    environmentLabel: "macOS（检查）",
    environment: [
      { label: "工作目录", value: "/workspace/Phoenix/projects" },
      { label: "执行模式", value: "顺序：CMake → CAA" },
      { label: "平台", value: "macOS（检查）→ Windows 执行" },
    ],
    maintenance: {
      scriptStatus: "脚本一致",
      scriptDetail: "/extension/script.ps1 → /workspace/tools/script.ps1",
      repositoryCleanupStatus: "仅手动触发",
      rootCleanupStatus: "待确认规则",
      rootCleanupYaml: KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
    },
    status: "idle",
    statusText: "等待操作。",
    ready: true,
    actions: [
      action("openConfig", "打开"),
      action("saveConfig", "保存", "primary"),
      action("saveAsConfig", "另存"),
      action("closeConfig", "关闭"),
      action("newConfigForDirectory", "新建配置"),
      action("keepProjectsForDirectory", "保留项目"),
      action("reveal", "详细配置"),
      action("selectRecent0", "auto-build.release.json"),
      action("openScript", "脚本"),
      action("preflight", "预检配置"),
      action("start", "启动", "primary"),
      action("stop", "停止", "danger"),
      action("toggleParallelBuild", "并行编译"),
      action("openOutput", "Output"),
      action("syncRootScript", "同步"),
      action("cleanRepositories", "清理"),
      action("updateRootCleanupYaml", "更新清理规则"),
      action("cleanRootArtifacts", "清理", "danger"),
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("AutoBuild Primary panel", () => {
  it("按已确认顺序渲染四段，并默认展开维护与工程环境", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & {
      model: KtcAutoBuildPrimaryPanelModel;
    };
    panel.model = model();

    const sections = findNodes(panel.shadow, (node) => node.attributes.has("data-section"));
    expect(sections.map((section) => section.attributes.get("data-section"))).toEqual([
      "configuration",
      "execution",
      "maintenance",
      "environment",
    ]);
    expect(sections[2]?.open).toBe(true);
    expect(sections[3]?.open).toBe(true);
    expect(textOf(panel.shadow)).not.toContain("项目摘要");

    const executionActions = findNodes(sections[1]!, (node) => node.attributes.has("data-action-id"));
    expect(executionActions.slice(0, 4).map((button) => button.attributes.get("data-action-id"))).toEqual([
      "openScript",
      "preflight",
      "start",
      "stop",
    ]);
    expect(textOf(sections[0]!)).toContain("当前配置auto-build.local.json有未保存修改打开保存另存关闭详细配置");
  });

  it("清理按钮只发语义 actionId，Root YAML 规则作为有界值上送", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & {
      model: KtcAutoBuildPrimaryPanelModel;
    };
    panel.model = model();

    const repositoryCleanup = findNodes(
      panel.shadow,
      (node) => node.attributes.get("data-action-id") === "cleanRepositories",
    )[0]!;
    repositoryCleanup.onclick?.();

    const patterns = findNodes(
      panel.shadow,
      (node) => node.attributes.get("aria-label") === "Root 清理 YAML 规则",
    )[0]!;
    patterns.value = "A".repeat(5_000);
    patterns.oninput?.();
    patterns.onchange?.();
    const rootCleanup = findNodes(
      panel.shadow,
      (node) => node.attributes.get("data-action-id") === "cleanRootArtifacts",
    )[0]!;
    rootCleanup.onclick?.();

    expect(panel.events).toEqual([
      {
        type: "ktc-auto-build-primary-action",
        detail: { actionId: "cleanRepositories" },
        bubbles: true,
        composed: true,
      },
      {
        type: "ktc-auto-build-primary-action",
        detail: { actionId: "updateRootCleanupYaml", value: "A".repeat(4_096) },
        bubbles: true,
        composed: true,
      },
      {
        type: "ktc-auto-build-primary-action",
        detail: { actionId: "cleanRootArtifacts", value: "A".repeat(4_096) },
        bubbles: true,
        composed: true,
      },
    ]);
  });

  it("按钮和输入的可用性完全服从 Host 模型", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & {
      model: KtcAutoBuildPrimaryPanelModel;
    };
    panel.model = model("cleanRootArtifacts");

    const button = findNodes(
      panel.shadow,
      (node) => node.attributes.get("data-action-id") === "cleanRootArtifacts",
    )[0]!;
    const input = findNodes(
      panel.shadow,
      (node) => node.attributes.get("aria-label") === "Root 清理 YAML 规则",
    )[0]!;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("测试禁用");
    expect(input.disabled).toBe(true);
  });

  it("工作目录冲突只渲染 Host 指定的两个显式迁移动作", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & {
      model: KtcAutoBuildPrimaryPanelModel;
    };
    const value = model();
    panel.model = {
      ...value,
      configuration: {
        ...value.configuration,
        workingDirectoryMismatch: true,
        workingDirectoryMismatchMessage: "工作目录已改变，请确认。",
      },
    };

    const warning = findNodes(panel.shadow, (node) => node.attributes.get("role") === "alert")[0]!;
    expect(textOf(warning)).toContain("工作目录已改变，请确认。");
    expect(findNodes(warning, (node) => node.attributes.has("data-action-id"))
      .map((node) => node.attributes.get("data-action-id"))).toEqual([
      "newConfigForDirectory",
      "keepProjectsForDirectory",
    ]);
  });
});
