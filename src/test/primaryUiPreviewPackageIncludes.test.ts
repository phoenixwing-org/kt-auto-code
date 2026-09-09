// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewPackageIncludesSurface } from "../../ui-preview/src/previewPackageIncludes.js";
import { PREVIEW_PACKAGE_INCLUDES_FIXTURE, type PreviewPackageIncludesFixture } from "../../ui-preview/src/previewPackageIncludesFixture.js";
import type { PreviewCompanionModel } from "../../ui-preview/src/previewCompanionModel.js";
import {
  KtcIgnorePolicyBlock,
  type KtcIgnorePolicyBlockActionDetail,
  type KtcIgnorePolicyBlockModel,
} from "../ui/KtcIgnorePolicyBlock.js";

const INITIAL: PreviewCompanionModel = {
  status: { label: "任务已完成。", tone: "success" },
  facts: [
    { id: "package", label: "Package", value: "/fixture/include" },
    { id: "target", label: "工程", value: "/fixture/project" },
    { id: "ignore", label: "Ignore", value: "插件 + Git" },
    { id: "scan", label: "扫描", value: "126 个文件" },
    { id: "matches", label: "命中", value: "18 处" },
  ],
  actions: [
    { actionId: "preview", label: "重新预览", enabled: true },
    { actionId: "reveal", label: "回到 View", enabled: true },
    { actionId: "openEnvironment", label: "工程环境", enabled: true },
  ],
};

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function setup(initial = INITIAL, fixture?: PreviewPackageIncludesFixture) {
  let model: KtcIgnorePolicyBlockModel = {
    enabled: true, builtInEnabled: true, gitEnabled: true, customEnabled: false, customCount: 3,
  };
  const log = vi.fn<(line: string) => void>();
  const action = vi.fn<(actionId: string) => void>();
  const directoryChanged = vi.fn<() => void>();
  const ignoreAction = vi.fn((detail: KtcIgnorePolicyBlockActionDetail) => {
    if (detail.kind === "toggleMaster") model = { ...model, enabled: detail.enabled };
    if (detail.kind === "toggleSource") {
      const key = { builtIn: "builtInEnabled", git: "gitEnabled", custom: "customEnabled" } as const;
      model = { ...model, [key[detail.source]]: detail.enabled };
    }
  });
  const surface = createPreviewPackageIncludesSurface({ initial, log, action, ignoreModel: () => model, ignoreAction, directoryChanged, fixture });
  let primary = surface.createPrimary();
  document.body.append(primary);
  const content = () => primary.shadowRoot!.querySelector<HTMLElement>(".preview-package-primary")!;
  return {
    surface, log, action, ignoreAction, directoryChanged,
    setIgnoreModel(next: Partial<KtcIgnorePolicyBlockModel>) { model = { ...model, ...next }; surface.ignorePolicyChanged(); },
    get primary() { return content(); },
    get ignore() { return content().querySelector("ktc-ignore-policy-block")!; },
    get status() { return content().querySelector('[role="status"]')!.textContent; },
    unmount() { primary.remove(); },
    button(label: string) {
      const button = Array.from(content().querySelectorAll<HTMLButtonElement>("button"))
        .find(({ textContent }) => textContent === label);
      expect(button, `missing button: ${label}`).toBeDefined();
      return button!;
    },
    input(label: string) { return content().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; },
    remount() {
      primary.remove();
      primary = surface.createPrimary();
      document.body.append(primary);
    },
  };
}

function edit(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function enter(input: HTMLInputElement): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

describe("Preview PackageIncludes with the real Ignore component", () => {
  it("首行保留重新预览、回到 View、工程环境，目录和真实 Ignore 均在操作行下方", () => {
    const view = setup();
    expect(Array.from(view.primary.children, ({ className, localName }) => className || localName)).toEqual([
      "preview-package-actions", "preview-package-directories", "ktc-ignore-policy-block", "preview-package-results",
    ]);
    expect(Array.from(view.primary.firstElementChild!.children, ({ textContent }) => textContent)).toEqual([
      "重新预览", "回到 View", "工程环境",
    ]);
    expect(view.ignore).toBeInstanceOf(KtcIgnorePolicyBlock);
    expect(view.ignore.shadowRoot!.querySelectorAll(".sources input")).toHaveLength(3);
    expect(view.input("Package 目录").value).toBe("/fixture/include");
    expect(view.input("工程目录").value).toBe("/fixture/project");
    expect(view.status).toContain("尚未预览");
    expect(view.primary.querySelector('[aria-label="预览摘要"]')!.textContent).toBe("Ignore插件 + Git扫描未开始命中0 处");
    for (const label of ["重新预览", "回到 View", "工程环境"]) view.button(label).click();
    expect(view.action.mock.calls).toEqual([["preview"], ["reveal"], ["openEnvironment"]]);
  });

  it.each(["Package 目录", "工程目录"])("编辑 %s 使旧结果失效，重建保持草稿，Enter 只触发模拟预览", (label) => {
    const view = setup();
    view.button("重新预览").click();
    view.action.mockClear();
    edit(view.input(label), "/fixture/edited path");
    expect(view.input(label).title).toBe("/fixture/edited path");
    expect(view.status).toContain("旧预览已失效");
    expect(view.primary.querySelector('[aria-label="预览摘要"]')!.textContent).toContain("扫描（上次）2 个文件命中（上次）3 处");
    expect(view.action).not.toHaveBeenCalled();
    view.remount();
    expect(view.input(label).value).toBe("/fixture/edited path");
    expect(view.status).toContain("旧预览已失效");
    expect(enter(view.input(label)).defaultPrevented).toBe(true);
    expect(view.action.mock.calls).toEqual([["preview"]]);
    expect(view.status).toBe("已预览 2 个样例文件，命中 3 处。（模拟）");
    expect(view.primary.querySelector('[aria-label="预览摘要"]')!.textContent).not.toContain("上次");
  });

  it("只有工程目录编辑通知上下文，getter 同步当前草稿，不隐式预览或校验真实路径", () => {
    const view = setup();
    expect(view.surface.contextDirectory()).toBe("/fixture/project");
    edit(view.input("Package 目录"), "/fixture/package-only");
    expect(view.directoryChanged).not.toHaveBeenCalled();
    expect(view.surface.contextDirectory()).toBe("/fixture/project");
    let observedDirectory = "";
    view.directoryChanged.mockImplementation(() => { observedDirectory = view.surface.contextDirectory(); });
    edit(view.input("工程目录"), "/not-a-real-directory/用户草稿");
    expect(view.directoryChanged).toHaveBeenCalledOnce();
    expect(observedDirectory).toBe("/not-a-real-directory/用户草稿");
    expect(view.surface.contextDirectory()).toBe(observedDirectory);
    expect(view.action).not.toHaveBeenCalled();
  });

  it.each(["Package 目录", "工程目录"])("%s 为空时按钮与 Enter 均拒绝预览并输出原因", (label) => {
    const view = setup();
    edit(view.input(label), "  ");
    view.button("重新预览").click();
    enter(view.input(label));
    expect(view.action).not.toHaveBeenCalled();
    expect(view.status).toContain("请先填写 Package 目录与工程目录");
    expect(view.log).not.toHaveBeenCalled();
    expect(view.log.mock.calls.every(([line]) => line.includes("（模拟）"))).toBe(true);
  });

  it("禁用的预览动作不能通过按钮或输入 Enter 绕过", () => {
    const view = setup({ ...INITIAL, actions: INITIAL.actions.map((item) => ({ ...item, enabled: false })) });
    for (const label of ["重新预览", "回到 View", "工程环境"]) {
      expect(view.button(label).disabled).toBe(true);
      view.button(label).click();
    }
    enter(view.input("Package 目录"));
    enter(view.input("工程目录"));
    expect(view.action).not.toHaveBeenCalled();
  });

  it("推导只恢复样例目录，选择只聚焦输入框；两者明确记录模拟边界", () => {
    const view = setup();
    edit(view.input("Package 目录"), "/fixture/other");
    view.button("推导").click();
    expect(view.input("Package 目录").value).toBe("/fixture/include");
    expect(view.status).toContain("旧预览已失效");
    view.button("选择").click();
    expect((view.input("Package 目录").getRootNode() as ShadowRoot).activeElement).toBe(view.input("Package 目录"));
    expect(view.log.mock.calls[0]![0]).toContain("未读取真实工程环境");
    expect(view.log.mock.calls[1]![0]).toContain("未打开真实目录选择器");
    expect(view.action).not.toHaveBeenCalled();
  });

  it("Ignore 默认展开，真实来源/总开关动作回投影且折叠状态在重建后保留", () => {
    const view = setup();
    const block = view.ignore;
    const details = block.shadowRoot!.querySelector("details")!;
    expect(details.open).toBe(true);
    details.open = false;
    const custom = block.shadowRoot!.querySelector<HTMLInputElement>('input[data-source="custom"]')!;
    custom.click();
    expect(view.ignoreAction.mock.calls).toEqual([[{ kind: "toggleSource", source: "custom", enabled: true }]]);
    expect(custom.checked).toBe(true);
    expect(view.primary.querySelector('[aria-label="预览摘要"]')!.textContent).toContain("Ignore插件 + Git + 自定义");
    expect(view.status).toContain("忽略策略已变化");
    expect(details.open).toBe(false);
    block.shadowRoot!.querySelector<HTMLButtonElement>(".toggle-master")!.click();
    expect(view.ignoreAction.mock.calls.at(-1)).toEqual([{ kind: "toggleMaster", enabled: false }]);
    expect(block.model.enabled).toBe(false);
    expect(view.primary.querySelector('[aria-label="预览摘要"]')!.textContent).toContain("Ignore已停用");
    expect(Array.from(block.shadowRoot!.querySelectorAll<HTMLInputElement>("input")).every((input) => input.disabled)).toBe(true);
    view.remount();
    expect(view.ignore).toBe(block);
    expect(block.shadowRoot!.querySelector("details")).toBe(details);
    expect(details.open).toBe(false);
    expect(view.status).toContain("忽略策略已变化");
    details.open = true;
    block.shadowRoot!.querySelector<HTMLButtonElement>(".toggle-master")!.click();
    expect(block.model.enabled).toBe(true);
    expect(details.open).toBe(true);
  });

  it("Ignore 修改只发送 manage，不误作策略变更或自动扫描，也不展开已折叠区域", () => {
    const view = setup();
    const details = view.ignore.shadowRoot!.querySelector("details")!;
    details.open = false;
    const before = view.status;
    view.ignore.shadowRoot!.querySelector<HTMLButtonElement>(".manage")!.click();
    expect(view.ignoreAction.mock.calls).toEqual([[{ kind: "manage" }]]);
    expect(view.status).toBe(before);
    expect(view.action).not.toHaveBeenCalled();
    expect(details.open).toBe(false);
  });

  it("模拟入口只依赖内存、DOM 与回调，不持有文件系统、进程、Host 或浏览器持久化入口", () => {
    // These reads inspect source in the test harness; the surface and actual
    // component themselves have no disk access and are intentionally not mocked.
    for (const path of [
      "../../ui-preview/src/previewPackageIncludes.ts",
      "../../ui-preview/src/previewPackageIncludesFixture.ts",
      "../ui/KtcIgnorePolicyBlock.ts",
      "../ui/KtcIgnorePolicyBlockEntry.ts",
    ]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).not.toMatch(/node:(?:fs|child_process)|from\s+["'](?:vscode|fs|child_process)["']|acquireVsCodeApi|postMessage|localStorage|sessionStorage|indexedDB|showDirectoryPicker|showOpenFilePicker|\bfetch\s*\(/u);
    }
    const view = setup();
    const unsafeText = '<img src=x onerror="throw Error(1)">';
    edit(view.input("Package 目录"), unsafeText);
    enter(view.input("Package 目录"));
    expect(view.primary.querySelector("img")).toBeNull();
    expect(view.input("Package 目录").value).toBe(unsafeText);
    expect(view.action.mock.calls).toEqual([["preview"]]);
  });

  it("Right 保留完整提示行和三行结果表，不重复 Primary 统计，逐行打开只记模拟日志", () => {
    const view = setup();
    const right = view.surface.createRight();
    const actions = view.surface.createRightActions();
    document.body.append(actions, right);
    const [preview, apply] = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"));
    expect(Array.from(actions.querySelectorAll("button"), ({ textContent }) => textContent)).toEqual(["预览", "写入修正"]);
    expect(right.querySelectorAll("input,select")).toHaveLength(0);
    expect(right.querySelector("h2")).toBeNull();
    expect(right.textContent).not.toContain("工程环境");
    expect(apply!.disabled).toBe(true);
    expect(right.querySelector("table")).toBeNull();
    preview!.click();
    expect(apply!.disabled).toBe(false);
    expect(right.querySelector(".preview-package-right-summary")).toBeNull();
    expect(right.querySelector('[role="status"]')!.textContent).toBe(view.status);
    expect(right.textContent).not.toContain("映射 3 个头文件");
    expect(Array.from(right.querySelectorAll("th"), ({ textContent }) => textContent)).toEqual(["文件 @ 目录", "行", "旧值", "新值", "状态 / 操作"]);
    expect(right.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(right.querySelector("tbody tr")!.textContent).toBe('PNXWidget.cpp @ src1#include "KtString.h"#include <KtCore/KtString.h>待写入打开');
    expect(Array.from(right.querySelectorAll(".write-state"), (cell) => cell.textContent)).toEqual(["待写入", "待写入", "待写入"]);
    expect(right.querySelector("th:last-child")?.className).toBe("operations");
    expect(right.querySelector("td:last-child")?.className).toBe("operations");
    view.log.mockClear();
    right.querySelector<HTMLButtonElement>("tbody button")!.click();
    expect(view.log.mock.calls.at(-1)![0]).toContain("/fixture/project/src/PNXWidget.cpp:1；未打开真实文件");
    expect(view.log).toHaveBeenCalledTimes(1);
    right.querySelector<HTMLElement>("tbody tr")!.click(); expect(view.log).toHaveBeenCalledTimes(2);
    expect(right.querySelector<HTMLButtonElement>("tbody button")!.title).toBe("打开样例 /fixture/project/src/PNXWidget.cpp 第 1 行（模拟）");
    const style = readFileSync("ui-preview/styles.css", "utf8");
    expect(style).toContain(".preview-package-right .operations { position: sticky; right: 0; z-index: 1; background: var(--vscode-editor-background)");
    expect(view.status).toContain("命中 3 处");
  });

  it.each(["Package 目录", "工程目录", "Ignore"])("%s 编辑撤销旧资格，包括持有旧按钮引用，重新预览后仅内存写入并保留回执", (changed) => {
    const view = setup();
    const right = view.surface.createRight();
    const actions = view.surface.createRightActions();
    document.body.append(actions, right);
    const [preview, apply] = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"));
    preview!.click();
    if (changed === "Ignore") view.ignore.shadowRoot!.querySelector<HTMLInputElement>('input[data-source="custom"]')!.click();
    else edit(view.input(changed), "/fixture/changed");
    expect(apply!.disabled).toBe(true);
    // Even a synthetic event cannot bypass the in-memory snapshot guard.
    apply!.disabled = false;
    apply!.dispatchEvent(new MouseEvent("click"));
    expect(view.log.mock.calls.at(-1)![0]).toContain("旧预览不可用");
    expect(right.querySelector("table")).toBeNull();
    preview!.click();
    const previousCells = Array.from(right.querySelectorAll("tbody tr"), (row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent).slice(0, 4));
    const previewCount = view.action.mock.calls.filter(([id]) => id === "preview").length;
    apply!.click();
    expect(view.status).toContain("已模拟修正 2 个样例文件中的 3 处");
    expect(view.status).toContain("未写入真实文件");
    expect(right.querySelector('[role="status"]')!.textContent).toBe(view.status);
    expect(apply!.disabled).toBe(true);
    expect(right.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(right.querySelector("table")!.getAttribute("aria-label")).toBe("模拟写入回执");
    expect(Array.from(right.querySelectorAll("tbody tr"), (row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent).slice(0, 4))).toEqual(previousCells);
    expect(Array.from(right.querySelectorAll(".write-state"), (cell) => cell.textContent)).toEqual(["已写入", "已写入", "已写入"]);
    expect(view.action.mock.calls.filter(([id]) => id === "preview")).toHaveLength(previewCount);
    apply!.disabled = false; apply!.dispatchEvent(new MouseEvent("click"));
    expect(apply!.disabled).toBe(true); expect(view.status).toContain("已模拟修正");
    view.log.mockClear(); right.querySelector<HTMLButtonElement>("tbody button")!.click();
    expect(view.log).toHaveBeenCalledTimes(1);
    preview!.click();
    expect(right.querySelector("table")).toBeNull();
    expect(right.textContent).toContain("未发现可修正的 include。");
    expect(right.querySelector(".preview-package-right-summary")).toBeNull();
    expect(right.querySelector('[role="status"]')!.textContent).toBe(view.status);
    expect(view.status).toContain("命中 0 处");
  });

  it("无命中与提示由专用 fixture 注入，不新增可见场景控件且不能写入", () => {
    const view = setup(INITIAL, { ...PREVIEW_PACKAGE_INCLUDES_FIXTURE, rows: [], warnings: ["同名头文件已排除，不会自动修正。"] });
    const right = view.surface.createRight();
    const actions = view.surface.createRightActions();
    document.body.append(actions, right);
    actions.querySelector<HTMLButtonElement>("button")!.click();
    expect(right.textContent).toContain("未发现可修正的 include。");
    expect(right.querySelector('[role="status"]')!.textContent).toBe(view.status);
    expect(right.querySelector(".preview-package-right-summary")).toBeNull();
    expect(right.querySelector(".preview-package-right-warning")!.textContent).toContain("同名头文件已排除");
    expect(right.querySelector("table")).toBeNull();
    expect(Array.from(actions.querySelectorAll<HTMLButtonElement>("button"))[1]!.disabled).toBe(true);
    expect(right.querySelectorAll("select,input")).toHaveLength(0);
    expect(actions.querySelectorAll("select,input")).toHaveLength(0);
  });

  it("其他工具改变 Ignore 时立即撤销 Right 写入资格，同策略重复通知不撤销新预览", () => {
    const view = setup();
    const right = view.surface.createRight();
    const actions = view.surface.createRightActions();
    document.body.append(actions, right);
    const [preview, apply] = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"));
    preview!.click();
    expect(apply!.disabled).toBe(false);
    view.unmount();
    view.setIgnoreModel({ gitEnabled: false });
    expect(apply!.disabled).toBe(true);
    expect(right.querySelector('[role="status"]')!.textContent).toContain("忽略策略已变化");
    expect(view.ignore.model.gitEnabled).toBe(false);
    preview!.click();
    expect(apply!.disabled).toBe(false);
    view.surface.ignorePolicyChanged();
    expect(apply!.disabled).toBe(false);
    expect(right.querySelector('[role="status"]')!.textContent).toContain("命中 3 处");
  });
});
