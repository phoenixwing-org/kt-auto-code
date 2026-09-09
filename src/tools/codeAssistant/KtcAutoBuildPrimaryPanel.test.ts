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
  tabIndex = -1;
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
    },
    cleanup: {
      title: "清理",
      description: "先预览再执行",
      modes: [{ id: "rules", label: "规则清理", risk: "normal" }],
      selectedModeId: "rules",
      targets: [],
      rulesVisible: true,
      rulesLabel: "清理规则",
      rulesYaml: KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
      preview: { state: "idle", items: [] },
      previewEnabled: true,
      executeEnabled: false,
      executeDisabledReason: "请先预览",
      previewLabel: "预览",
      executeLabel: "清理",
      cancelLabel: "取消",
      highRiskConfirmationLabel: "确认",
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
      action("openCleanup", "清理"),
      action("toggleParallelBuild", "并行编译"),
      action("openOutput", "Output"),
      action("syncRootScript", "同步脚本"),
      action("cleanupDialog", "清理", "danger"),
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
    expect(executionActions.slice(0, 5).map((button) => button.attributes.get("data-action-id"))).toEqual([
      "openScript",
      "preflight",
      "start",
      "stop",
      "openCleanup",
    ]);
    expect(sections[0]!.children.map(({ className }) => className)).toEqual(["config", "config-recent", "config-status"]);
    expect(textOf(sections[0]!.children[0]!)).toBe("打开保存另存关闭详细配置");
    expect(textOf(sections[0]!.children[2]!)).toBe("当前配置auto-build.local.json有未保存修改");
  });

  it("首行五个文字动作保留顺序、可访问名称、禁用原因和原事件", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & { model: KtcAutoBuildPrimaryPanelModel };
    panel.model = model("saveAsConfig");
    const row = findNodes(panel.shadow, (node) => node.className === "config")[0]!;
    expect(row.attributes.get("aria-label")).toBe("配置操作");
    expect(row.tabIndex).toBe(0);
    const buttons = findNodes(row, (node) => node.tagName === "button");
    expect(buttons.map((node) => node.attributes.get("data-action-id"))).toEqual([
      "openConfig", "saveConfig", "saveAsConfig", "closeConfig", "reveal",
    ]);
    expect(buttons.map((node) => node.attributes.get("aria-label"))).toEqual(["打开", "保存", "另存", "关闭", "详细配置"]);
    expect(buttons.map((node) => node.textContent)).toEqual(["打开", "保存", "另存", "关闭", "详细配置"]);
    expect(buttons.every((node) => node.children.length === 0)).toBe(true);
    expect(buttons[2]!.disabled).toBe(true);
    expect(buttons[2]!.title).toBe("测试禁用");
    expect(row.children[2]!.title).toBe("测试禁用");
    for (const button of buttons.filter((node) => !node.disabled)) button.onclick?.();
    expect(panel.events.map(({ detail }) => detail)).toEqual([
      { actionId: "openConfig" }, { actionId: "saveConfig" }, { actionId: "closeConfig" }, { actionId: "reveal" },
    ]);
    const name = findNodes(panel.shadow, (node) => node.className === "config-name")[0]!;
    expect(name.title).toBe("/workspace/auto-build.local.json");
    panel.model = { ...model(), ready: false };
    expect(findNodes(panel.shadow, (node) => node.className === "config")[0]!.children
      .every((slot) => slot.children[0]!.disabled)).toBe(true);
  });

  it("真实 DOM：长文件名位于 combo 后，窄容器文字按钮可换行且禁用按钮不发事件", async () => {
    const { Window } = await import("happy-dom");
    const browser = new Window();
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("customElements", browser.customElements);
    vi.stubGlobal("CustomEvent", browser.CustomEvent);
    const { KtcDefineAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    KtcDefineAutoBuildPrimaryPanel();
    const panel = document.createElement("ktc-auto-build-primary-panel") as HTMLElement & { model: KtcAutoBuildPrimaryPanelModel };
    panel.style.width = "140px";
    document.body.append(panel);
    const value = model("saveAsConfig");
    const longName = "project-".repeat(30) + "auto-build.json";
    panel.model = { ...value, configuration: { ...value.configuration, name: longName, fullPath: `/workspace/${longName}` } };
    const configuration = panel.shadowRoot!.querySelector('[data-section="configuration"]')!;
    expect(Array.from(configuration.children, ({ className }) => className)).toEqual(["config", "config-recent", "config-status"]);
    const actions = configuration.querySelector<HTMLElement>(".config")!;
    expect(actions.textContent).toBe("打开保存另存关闭详细配置");
    expect(actions.querySelectorAll("svg")).toHaveLength(0);
    const status = configuration.querySelector(".config-status")!;
    expect(status.textContent).toBe(`当前配置${longName}有未保存修改`);
    expect(status.querySelector<HTMLElement>(".config-name")!.title).toBe(`/workspace/${longName}`);
    const rowStyle = browser.getComputedStyle(actions as unknown as import("happy-dom").HTMLElement);
    expect(rowStyle.flexWrap).toBe("wrap");
    expect(rowStyle.overflowX).not.toBe("auto");
    const emitted: unknown[] = [];
    panel.addEventListener("ktc-auto-build-primary-action", (event) => emitted.push((event as CustomEvent).detail));
    const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"));
    for (const button of buttons) button.click();
    expect(emitted).toEqual([
      { actionId: "openConfig" }, { actionId: "saveConfig" }, { actionId: "closeConfig" }, { actionId: "reveal" },
    ]);
    expect(buttons[2]!.disabled).toBe(true);
    expect(buttons[2]!.parentElement!.title).toBe("测试禁用");
    document.body.replaceChildren();
  });

  it("执行区清理按钮只发打开统一对话框的语义 actionId", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & {
      model: KtcAutoBuildPrimaryPanelModel;
    };
    panel.model = model();

    const cleanup = findNodes(
      panel.shadow,
      (node) => node.attributes.get("data-action-id") === "openCleanup",
    )[0]!;
    cleanup.onclick?.();

    expect(panel.events).toEqual([
      {
        type: "ktc-auto-build-primary-action",
        detail: { actionId: "openCleanup" },
        bubbles: true,
        composed: true,
      },
    ]);
  });

  it("脚本一致只作为状态显示，不禁用同步脚本按钮", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & {
      model: KtcAutoBuildPrimaryPanelModel;
    };
    panel.model = model();

    const sync = findNodes(
      panel.shadow,
      (node) => node.attributes.get("data-action-id") === "syncRootScript",
    )[0]!;
    expect(textOf(sync)).toBe("同步脚本");
    expect(sync.disabled).toBe(false);
    expect(textOf(panel.shadow)).toContain("ROOT/tools 与 ROOT/sample 同步 · 脚本一致");
  });

  it("按钮和输入的可用性完全服从 Host 模型", async () => {
    installFakeDom();
    const { KtcAutoBuildPrimaryPanel } = await import("./KtcAutoBuildPrimaryPanel.js");
    const panel = new KtcAutoBuildPrimaryPanel() as unknown as FakeElement & {
      model: KtcAutoBuildPrimaryPanelModel;
    };
    panel.model = model("openCleanup");

    const button = findNodes(
      panel.shadow,
      (node) => node.attributes.get("data-action-id") === "openCleanup",
    )[0]!;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("测试禁用");
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
