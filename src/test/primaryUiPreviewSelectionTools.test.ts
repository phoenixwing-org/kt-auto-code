// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pnwReorderCppText, pnwReorderHeaderText } from "@phoenix-wing/code-core";
import { KtcReorderMembersPanel, KTC_REORDER_MEMBERS_PANEL_ACTION } from "../sidebar/reorderMembersPanel.js";
import { KtcUuidResultsPanel, KTC_UUID_RESULTS_ACTION } from "../sidebar/uuidResultsPanel.js";
import { KTC_SELECTION_PRIMARY_ACTION } from "../ui/KtcSelectionPrimary.js";
import {
  createPreviewReorderMembersSurface,
  createPreviewUuidReplaceSurface,
  type PreviewSelectionToolsSurface,
} from "../../ui-preview/src/previewSelectionToolsSurface.js";

const surfaces: PreviewSelectionToolsSurface[] = [];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  for (const surface of surfaces.splice(0)) surface.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(kind: "reorder" | "uuid", initialDirectory = "/sample/workspace") {
  let directory = initialDirectory;
  const log = vi.fn<(line: string) => void>();
  const surface = (kind === "reorder" ? createPreviewReorderMembersSurface : createPreviewUuidReplaceSurface)({ directory: () => directory, log });
  surfaces.push(surface);
  const primary = surface.createPrimary();
  document.body.append(primary);
  const panel = primary.shadowRoot!.querySelector<KtcReorderMembersPanel | KtcUuidResultsPanel>(kind === "reorder" ? "ktc-reorder-members-panel" : "ktc-uuid-results-panel")!;
  const actionBar = primary.shadowRoot!.firstElementChild!;
  return {
    surface, primary, panel, log,
    button(action: "scan" | "apply") {
      const buttons = (actionBar.shadowRoot ?? actionBar).querySelectorAll<HTMLButtonElement>("button");
      return Array.from(buttons).find((button) => (button.textContent ?? "").startsWith(action === "scan" ? "扫描" : kind === "reorder" ? "应用所选" : "替换所选"))!;
    },
    get shadow() { return panel.shadowRoot!; },
    get status() { return primary.shadowRoot!.querySelector('[role="status"]')!.textContent!; },
    get dialog() { return document.querySelector<HTMLDialogElement>(`dialog[aria-label="${kind === "reorder" ? "成员排序" : "UUID 替换"}模拟确认"]`); },
    get dialogRoot() { return this.dialog?.firstElementChild!.shadowRoot; },
    confirm() {
      expect(this.dialog?.open).toBe(true);
      this.dialogRoot!.querySelector<HTMLButtonElement>('[data-preview-confirm="execute"]')!.click();
    },
    cancel() {
      expect(this.dialog?.open).toBe(true);
      this.dialogRoot!.querySelector<HTMLButtonElement>('[data-preview-confirm="cancel"]')!.click();
    },
    get rows() { return panel instanceof KtcReorderMembersPanel ? panel.model!.reorderResults : panel.model!.files; },
    scan() { this.button("scan").click(); vi.advanceTimersByTime(100); },
    changeDirectory(next: string, notify = true) { directory = next; if (notify) surface.directoryChanged(); },
    rowAction(title: string, index = 0) { panel.shadowRoot!.querySelectorAll<HTMLButtonElement>(`button[title="${title}"]`)[index]!.click(); },
    selected() { return panel instanceof KtcReorderMembersPanel ? panel.model!.reorderSelectedUris : panel.model!.selectedIds; },
    signal(action: string, ids: readonly string[]) {
      panel.dispatchEvent(new CustomEvent(kind === "reorder" ? KTC_REORDER_MEMBERS_PANEL_ACTION : KTC_UUID_RESULTS_ACTION, {
        detail: kind === "reorder" ? { kind: "reorderAction", action, uris: ids } : { kind: "action", scope: "file", action, ids },
      }));
    },
    readMemory(uri: string) {
      this.signal("open", [uri]);
      return log.mock.calls.at(-1)![0].split("\n").slice(1).join("\n");
    },
  };
}

describe("selection tools Preview using actual Wing result components", () => {
  it.each(["reorder", "uuid"] as const)("%s mounts an idle cached Primary with a first-line shared text toolbar", (kind) => {
    const view = setup(kind);
    expect(view.panel).toBeInstanceOf(kind === "reorder" ? KtcReorderMembersPanel : KtcUuidResultsPanel);
    expect(view.primary.tagName.toLowerCase()).toBe("ktc-selection-primary");
    expect(view.primary.shadowRoot!.firstElementChild?.tagName.toLowerCase()).toBe("ktc-primary-action-bar");
    expect(view.button("scan").disabled).toBe(false);
    expect(view.button("apply").disabled).toBe(true);
    expect(view.rows).toBeUndefined();
    expect(view.log).not.toHaveBeenCalled();
    view.primary.remove();
    expect(view.surface.createPrimary()).toBe(view.primary);
    document.body.append(view.primary);
    expect(view.rows).toBeUndefined();
  });

  it.each(["reorder", "uuid"] as const)("%s shows real fixture rows, disables duplicate work and preserves unchecked candidates", (kind) => {
    const view = setup(kind);
    view.button("scan").click();
    expect(view.primary.getAttribute("aria-busy")).toBe("true");
    expect(view.button("scan").disabled).toBe(true);
    expect(view.button("apply").disabled).toBe(true);
    vi.advanceTimersByTime(100);
    expect(view.rows).toHaveLength(3);
    expect(view.shadow.querySelectorAll(kind === "reorder" ? ".file-row" : ".row")).toHaveLength(kind === "reorder" ? 2 : 3);
    expect(view.button("apply").disabled).toBe(false);
    const unchecked = view.rows!.find((row) => row.relativePath === "include/Widget.h")!.uri;
    view.shadow.querySelector<HTMLInputElement>('input[aria-label="选择 include/Widget.h"]')!.click();
    expect(view.selected()).not.toContain(unchecked);
    const original = structuredClone(view.rows!);
    view.button("apply").click();
    expect(view.dialog?.open).toBe(true);
    expect(view.dialogRoot!.textContent).toContain("仅更新内存样例文本与状态");
    expect(view.button("scan").disabled).toBe(true);
    expect(view.button("apply").disabled).toBe(true);
    expect(view.shadow.querySelector<HTMLInputElement>('input[aria-label="选择 include/Widget.h"]')!.disabled).toBe(true);
    view.confirm();
    vi.advanceTimersByTime(100);
    expect(view.rows!.map(({ uri }) => uri)).toEqual(original.map(({ uri }) => uri));
    expect(view.rows!.find((row) => row.uri === unchecked)!.state).toBe("pending");
    const applied = original.filter((row) => row.state === "pending" && row.uri !== unchecked).map((row) => row.uri);
    expect(applied.every((uri) => view.rows!.find((row) => row.uri === uri)!.state === "applied")).toBe(true);
    expect(view.selected()).toEqual([]);
    expect(view.button("apply").disabled).toBe(true);
    expect(view.status).toContain("不自动重扫");
    view.primary.remove();
    document.body.append(view.surface.createPrimary());
    expect(applied.every((uri) => view.rows!.find((row) => row.uri === uri)!.state === "applied")).toBe(true);
    expect(view.rows!.find((row) => row.uri === unchecked)!.state).toBe("pending");
  });

  it.each(["reorder", "uuid"] as const)("%s group selection and cancelled confirmation preserve the same plan", (kind) => {
    const view = setup(kind);
    view.scan();
    const groupLabel = kind === "reorder" ? "选择全部待写盘文件" : "选择全部待替换文件";
    view.shadow.querySelector<HTMLInputElement>(`input[aria-label="${groupLabel}"]`)!.click();
    expect(view.selected()).toEqual([]);
    expect(view.button("apply").disabled).toBe(true);
    view.shadow.querySelector<HTMLInputElement>(`input[aria-label="${groupLabel}"]`)!.click();
    const selected = [...view.selected()!];
    const original = structuredClone(view.rows!);
    view.button("apply").click();
    view.cancel();
    vi.advanceTimersByTime(100);
    expect(view.rows).toEqual(original);
    expect(view.selected()).toEqual(selected);
    expect(view.status).toContain("已取消");
    expect(view.button("apply").disabled).toBe(false);
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("未执行写入"));
  });

  it("reorder forwards actual Wing open/diff/apply/revert/remove controls without domain execution", () => {
    const view = setup("reorder");
    view.scan();
    view.shadow.querySelector<HTMLElement>(".file-main")!.click();
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("打开源码：/sample/workspace/include/Widget.h"));
    view.rowAction("预览排序差异");
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("预览排序差异"));
    view.rowAction("应用此文件");
    view.confirm();
    vi.advanceTimersByTime(100);
    expect(view.rows![0].state).toBe("applied");
    view.rowAction("查看 Git 差异");
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("查看 Git 差异"));
    view.rowAction("还原本次成员排序");
    view.confirm();
    vi.advanceTimersByTime(100);
    expect(view.rows![0].state).toBe("reverted");
    view.rowAction("从本次结果移除");
    expect(view.rows![1].state).toBe("cancelled");
    expect(view.selected()).toEqual([]);
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("没有删除文件"));
  });

  it("UUID forwards actual Wing file actions and removes only the chosen candidate", () => {
    const view = setup("uuid");
    view.scan();
    view.shadow.querySelector<HTMLElement>(".main")!.click();
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("打开源码"));
    view.rowAction("应用");
    view.confirm();
    vi.advanceTimersByTime(100);
    expect(view.rows![0]).toMatchObject({ state: "applied", hasApplied: true });
    view.rowAction("查看 Git 差异");
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("查看 Git 差异"));
    const removed = view.rows![1].uri;
    view.rowAction("从本次结果移除");
    expect(view.rows).toHaveLength(2);
    expect(view.rows!.some(({ uri }) => uri === removed)).toBe(false);
    expect(view.selected()).not.toContain(removed);
    expect(view.button("apply").textContent).toContain("（1）");
  });

  it.each(["reorder", "uuid"] as const)("%s invalidates on directory change and rejects late scan/apply/row signals", (kind) => {
    const view = setup(kind);
    view.button("scan").click();
    view.changeDirectory("/sample/another");
    vi.advanceTimersByTime(100);
    expect(view.rows).toBeUndefined();
    expect(view.button("scan").disabled).toBe(false);
    expect(view.status).toContain("旧计划已失效");
    view.scan();
    const old = view.rows![0].uri;
    view.button("apply").click();
    view.confirm();
    view.changeDirectory("/sample/third");
    vi.advanceTimersByTime(100);
    expect(view.rows).toBeUndefined();
    expect(view.log.mock.calls.some(([line]) => line.includes("已应用"))).toBe(false);
    view.scan();
    const original = structuredClone(view.rows!);
    view.panel.dispatchEvent(new CustomEvent(kind === "reorder" ? KTC_REORDER_MEMBERS_PANEL_ACTION : KTC_UUID_RESULTS_ACTION, {
      detail: kind === "reorder" ? { kind: "reorderAction", action: "apply", uris: [old] } : { kind: "action", scope: "file", action: "apply", ids: [old] },
    }));
    vi.advanceTimersByTime(100);
    expect(view.rows).toEqual(original);
  });

  it("UUID strategy changes invalidate the frozen fixture and use distinct per-hit examples only on explicit rescan", () => {
    const view = setup("uuid");
    view.scan();
    const panel = view.panel as KtcUuidResultsPanel;
    expect(new Set(panel.model!.files!.map((row) => row.mappings[0].to)).size).toBe(1);
    const strategy = view.primary.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="UUID 生成策略"]')!;
    strategy.value = "fresh_per_hit";
    strategy.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.rows).toBeUndefined();
    expect(view.primary.shadowRoot!.querySelector(".selection-tool-hint")!.textContent).toContain("打破原有引用关系");
    expect(view.button("apply").disabled).toBe(true);
    expect(view.status).toContain("生成策略已变化");
    view.button("scan").click();
    expect(strategy.disabled).toBe(true);
    strategy.value = "map_per_value";
    strategy.dispatchEvent(new Event("change", { bubbles: true }));
    expect(strategy.value).toBe("fresh_per_hit");
    vi.advanceTimersByTime(100);
    expect(new Set(panel.model!.files!.map((row) => row.mappings[0].to)).size).toBe(3);
    const header = panel.model!.files!.find((row) => row.relativePath === "include/Widget.h")!;
    expect(header.hitCount).toBe(2);
    expect(new Set(header.mappings.map((mapping) => mapping.to)).size).toBe(2);
  });

  it.each(["reorder", "uuid"] as const)("%s also rejects context changes during confirmation or without an explicit notification", (kind) => {
    const view = setup(kind);
    view.scan();
    view.button("apply").click();
    view.changeDirectory("/sample/new", false);
    view.confirm();
    expect(view.dialog?.open).toBe(false);
    vi.advanceTimersByTime(100);
    expect(view.rows).toBeUndefined();
    expect(view.status).toContain("旧计划已失效");
    expect(view.log.mock.calls.some(([line]) => line.includes("已应用"))).toBe(false);
  });

  it.each(["reorder", "uuid"] as const)("%s retains rows during rescan and disposal prevents pending completion", (kind) => {
    const view = setup(kind);
    view.scan();
    const original = structuredClone(view.rows!);
    view.button("scan").click();
    expect(view.rows).toEqual(original);
    expect(view.status).toContain("正在重新扫描");
    view.surface.dispose();
    const callCount = view.log.mock.calls.length;
    vi.advanceTimersByTime(100);
    expect(view.log).toHaveBeenCalledTimes(callCount);
    expect(view.primary.isConnected).toBe(false);
    expect(view.rows).toEqual(original);
  });

  it.each(["reorder", "uuid"] as const)("%s cannot start without a directory and unchanged notifications preserve the cache", (kind) => {
    const view = setup(kind, "");
    expect(view.button("scan").disabled).toBe(true);
    expect(view.status).toContain("请先选择工作目录");
    view.changeDirectory("/sample/root");
    view.scan();
    const original = structuredClone(view.rows!);
    view.surface.directoryChanged();
    expect(view.rows).toEqual(original);
  });

  it("runs the actual header/source algorithms, previews their text and restores only the in-memory snapshot", () => {
    const view = setup("reorder");
    view.scan();
    for (const row of view.rows!.filter((item) => item.state === "pending")) {
      const before = view.readMemory(row.uri);
      const expected = row.relativePath.endsWith(".h") ? pnwReorderHeaderText(before).text : pnwReorderCppText(before, "Widget").text;
      expect(expected).not.toBe(before);
      view.signal("preview", [row.uri]);
      expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining(`+++ 排序后\n${expected}`));
      view.signal("apply", [row.uri]);
      view.confirm();
      vi.advanceTimersByTime(100);
      expect(view.readMemory(row.uri)).toBe(expected);
      view.signal("gitDiff", [row.uri]);
      expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining(`+++ 当前内存文本\n${expected}`));
      view.signal("revert", [row.uri]);
      view.cancel();
      vi.advanceTimersByTime(100);
      expect(view.readMemory(row.uri)).toBe(expected);
      expect(view.rows!.find((item) => item.uri === row.uri)!.state).toBe("applied");
      view.signal("revert", [row.uri]);
      view.confirm();
      vi.advanceTimersByTime(100);
      expect(view.readMemory(row.uri)).toBe(before);
      expect(view.rows!.find((item) => item.uri === row.uri)!.state).toBe("reverted");
    }
  });

  it("rescans the applied in-memory files instead of recreating misleading pending reorder fixtures", () => {
    const view = setup("reorder");
    view.scan();
    view.button("apply").click();
    view.confirm();
    vi.advanceTimersByTime(100);
    expect(view.rows!.filter((row) => row.state === "applied")).toHaveLength(2);
    view.scan();
    expect(view.rows!.every((row) => row.state === "unchanged")).toBe(true);
    expect(view.selected()).toEqual([]);
    expect(view.button("apply").disabled).toBe(true);
    expect(view.status).toContain("0 个待处理");
  });

  it.each(["map_per_value", "fresh_per_hit"] as const)("UUID %s writes the frozen Wing mappings to memory and preserves the unchecked source", (strategyValue) => {
    const view = setup("uuid");
    const strategy = view.primary.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="UUID 生成策略"]')!;
    strategy.value = strategyValue;
    strategy.dispatchEvent(new Event("change", { bubbles: true }));
    view.scan();
    const files = (view.panel as KtcUuidResultsPanel).model!.files!;
    const selected = files.find((row) => row.relativePath === "include/Widget.h")!;
    const untouched = files.find((row) => row.uri !== selected.uri)!;
    const before = view.readMemory(selected.uri);
    const untouchedBefore = view.readMemory(untouched.uri);
    view.signal("apply", [selected.uri]);
    view.confirm();
    vi.advanceTimersByTime(100);
    const after = view.readMemory(selected.uri);
    let expected = before;
    for (const mapping of selected.mappings) expected = expected.replace(mapping.from, mapping.to);
    expect(after).toBe(expected);
    expect(after).not.toBe(before);
    expect(view.readMemory(untouched.uri)).toBe(untouchedBefore);
    expect(new Set(selected.mappings.map((mapping) => mapping.to)).size).toBe(strategyValue === "map_per_value" ? 1 : 2);
    expect(view.rows!.find((row) => row.uri === selected.uri)!.state).toBe("applied");
    expect(view.rows!.find((row) => row.uri === untouched.uri)!.state).toBe("pending");
  });

  it.each(["reorder", "uuid"] as const)("%s ignores forged row operations outside formal state eligibility", (kind) => {
    const view = setup(kind);
    view.scan();
    const row = view.rows!.find((item) => item.state === "pending")!;
    view.log.mockClear();
    view.signal("gitDiff", [row.uri]);
    view.signal("revert", [row.uri]);
    if (kind === "uuid") view.signal("preview", [row.uri]);
    expect(view.log).not.toHaveBeenCalled();
    expect(view.dialog?.open).not.toBe(true);
    view.signal("apply", [row.uri]);
    view.confirm();
    vi.advanceTimersByTime(100);
    const written = view.readMemory(row.uri);
    view.log.mockClear();
    view.signal("apply", [row.uri]);
    view.signal("preview", [row.uri]);
    view.signal("cancel", [row.uri]);
    expect(view.log).not.toHaveBeenCalled();
    expect(view.dialog?.open).toBe(false);
    expect(view.readMemory(row.uri)).toBe(written);
  });

  it.each(["reorder", "uuid"] as const)("%s rejects old row and selection events after a rescan of the same directory", (kind) => {
    const view = setup(kind);
    view.scan();
    const old = view.rows!.find((row) => row.state === "pending")!.uri;
    view.scan();
    const current = structuredClone(view.rows!);
    const selection = [...view.selected()!];
    view.panel.dispatchEvent(new CustomEvent(kind === "reorder" ? KTC_REORDER_MEMBERS_PANEL_ACTION : KTC_UUID_RESULTS_ACTION, {
      detail: kind === "reorder" ? { kind: "reorderSelection", uris: [old] } : { kind: "selection", scope: "file", ids: [old] },
    }));
    view.signal("apply", [old]);
    view.signal("open", [old]);
    vi.advanceTimersByTime(100);
    expect(view.rows).toEqual(current);
    expect(view.selected()).toEqual(selection);
    expect(view.dialog?.open).not.toBe(true);
  });

  it("invalidates an old UUID confirmation if its owner receives a newer strategy intent before it returns", () => {
    const view = setup("uuid");
    view.scan();
    const strategy = view.primary.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="UUID 生成策略"]')!;
    view.button("apply").click();
    const execute = view.dialogRoot!.querySelector<HTMLButtonElement>('[data-preview-confirm="execute"]')!;
    expect(strategy.disabled).toBe(true);
    // Disabled component controls cannot emit; a context change arriving from
    // the owner still has to revoke the adapter's outstanding confirmation.
    view.primary.dispatchEvent(new CustomEvent(KTC_SELECTION_PRIMARY_ACTION, {
      detail: { toolId: "uuidReplace", kind: "setStrategy", strategy: "fresh_per_hit" },
    }));
    expect(view.dialog?.open).toBe(false);
    execute.click();
    vi.advanceTimersByTime(100);
    expect(view.rows).toBeUndefined();
    expect(view.status).toContain("生成策略已变化");
    expect(view.log.mock.calls.some(([line]) => line.includes("已应用"))).toBe(false);
    view.scan();
    expect(new Set((view.panel as KtcUuidResultsPanel).model!.files!.flatMap((row) => row.mappings.map((mapping) => mapping.to))).size).toBe(4);
  });

  it.each(["reorder", "uuid"] as const)("%s removing a candidate never deletes its in-memory source", (kind) => {
    const view = setup(kind);
    view.scan();
    const row = view.rows!.find((item) => item.state === "pending")!;
    const before = view.readMemory(row.uri);
    view.signal("cancel", [row.uri]);
    expect(view.selected()).not.toContain(row.uri);
    view.scan();
    const restored = view.rows!.find((item) => item.relativePath === row.relativePath)!;
    expect(restored.state).toBe("pending");
    expect(view.readMemory(restored.uri)).toBe(before);
  });

  it.each([
    ["reorder", "escape"], ["reorder", "close"], ["uuid", "escape"], ["uuid", "close"],
  ] as const)("%s confirmation %s preserves both the plan and memory", (kind, method) => {
    const view = setup(kind);
    view.scan();
    const row = view.rows!.find((item) => item.state === "pending")!;
    const before = view.readMemory(row.uri);
    const rows = structuredClone(view.rows!);
    const selected = [...view.selected()!];
    view.button("apply").click();
    vi.advanceTimersByTime(100);
    expect(view.dialog?.open).toBe(true);
    expect(view.rows).toEqual(rows);
    if (method === "escape") {
      const event = new Event("cancel", { cancelable: true });
      view.dialog!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    } else {
      view.dialog!.close();
    }
    vi.advanceTimersByTime(100);
    expect(view.dialog?.open).toBe(false);
    expect(view.status).toContain("已取消");
    expect(view.rows).toEqual(rows);
    expect(view.selected()).toEqual(selected);
    expect(view.readMemory(row.uri)).toBe(before);
    expect(view.button("apply").disabled).toBe(false);
  });

  it.each(["reorder", "uuid"] as const)("%s pending confirmation freezes selection and rejects duplicate execution", (kind) => {
    const view = setup(kind);
    view.scan();
    const row = view.rows!.find((item) => item.state === "pending")!;
    view.signal("apply", [row.uri]);
    expect(view.dialogRoot!.textContent).toContain("1 个样例文件");
    expect(view.primary.getAttribute("aria-busy")).toBe("true");
    expect(view.button("scan").disabled).toBe(true);
    const selected = [...view.selected()!];
    view.panel.dispatchEvent(new CustomEvent(kind === "reorder" ? KTC_REORDER_MEMBERS_PANEL_ACTION : KTC_UUID_RESULTS_ACTION, {
      detail: kind === "reorder" ? { kind: "reorderSelection", uris: [] } : { kind: "selection", scope: "file", ids: [] },
    }));
    view.signal("apply", view.rows!.map((item) => item.uri));
    expect(view.selected()).toEqual(selected);
    expect(view.dialogRoot!.textContent).toContain("1 个样例文件");
    const execute = view.dialogRoot!.querySelector<HTMLButtonElement>('[data-preview-confirm="execute"]')!;
    view.confirm();
    execute.click();
    execute.dispatchEvent(new Event("click"));
    vi.advanceTimersByTime(100);
    expect(view.rows!.filter((item) => item.state === "applied").map((item) => item.uri)).toEqual([row.uri]);
    expect(view.log.mock.calls.filter(([line]) => line.includes("已应用 1 个样例文件"))).toHaveLength(1);
  });

  it.each(["reorder", "uuid"] as const)("%s directory change closes confirmation and rejects its old execute callback", (kind) => {
    const view = setup(kind);
    view.scan();
    view.button("apply").click();
    const execute = view.dialogRoot!.querySelector<HTMLButtonElement>('[data-preview-confirm="execute"]')!;
    view.changeDirectory("/sample/new-context");
    expect(view.dialog?.open).toBe(false);
    execute.dispatchEvent(new Event("click"));
    vi.advanceTimersByTime(100);
    expect(view.rows).toBeUndefined();
    expect(view.log.mock.calls.some(([line]) => line.includes("已应用"))).toBe(false);
    view.scan();
    expect(view.rows!.some((row) => row.state === "pending")).toBe(true);
  });

  it.each(["reorder", "uuid"] as const)("%s disposal removes its confirmation and no late callback changes the plan", (kind) => {
    const view = setup(kind);
    view.scan();
    const original = structuredClone(view.rows!);
    view.button("apply").click();
    const dialog = view.dialog!;
    const execute = view.dialogRoot!.querySelector<HTMLButtonElement>('[data-preview-confirm="execute"]')!;
    view.surface.dispose();
    const count = view.log.mock.calls.length;
    expect(dialog.open).toBe(false);
    expect(dialog.isConnected).toBe(false);
    execute.dispatchEvent(new Event("click"));
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    vi.advanceTimersByTime(100);
    expect(view.log).toHaveBeenCalledTimes(count);
    expect(view.rows).toEqual(original);
  });

  it("ignores a queued old close event after the confirmation is opened again", () => {
    const view = setup("reorder");
    view.scan();
    view.button("apply").click();
    view.cancel();
    view.button("apply").click();
    view.dialog!.dispatchEvent(new Event("close"));
    expect(view.dialog?.open).toBe(true);
    expect(view.status).toContain("等待确认");
    view.confirm();
    vi.advanceTimersByTime(100);
    expect(view.rows!.filter((row) => row.state === "applied")).toHaveLength(2);
  });
});
