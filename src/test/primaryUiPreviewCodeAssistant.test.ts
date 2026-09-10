// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewCodeAssistantSurfaces } from "../../ui-preview/src/previewCodeAssistantSurface.js";
import { PREVIEW_TOOL_CATALOG_BY_ID } from "../../ui-preview/src/previewToolCatalog.js";
import { resolvePreviewToolRoute } from "../../ui-preview/src/previewToolRouting.js";
import type { KtcTextRepairPrimary } from "../ui/KtcTextRepairPrimary.js";
import type { KtcCaaPrimary } from "../ui/KtcCaaPrimary.js";
import type { KtcReorderMembersPanel } from "../sidebar/reorderMembersPanel.js";
import type { KtcUuidResultsPanel } from "../sidebar/uuidResultsPanel.js";

const toolCases = [
  ["headerAscii", "预检"],
  ["encodingFix", "预检"],
  ["reorderMembers", "扫描排序"],
  ["uuidReplace", "扫描 UUID"],
  ["caaDialog", "扫描 CATDlg"],
] as const;

interface Registry {
  createPrimary(toolId: string): HTMLElement | undefined;
  directoryChanged(): void;
  reset(): void;
  dispose(): void;
}

const registries: Registry[] = [];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(initialDirectory = "/workspace/first") {
  let directory = initialDirectory;
  const log = vi.fn<(line: string) => void>();
  const registry = createPreviewCodeAssistantSurfaces({ directory: () => directory, log });
  registries.push(registry);
  return { registry, log, setDirectory(value: string) { directory = value; } };
}

function actionButton(primary: HTMLElement, label: string): HTMLButtonElement {
  const bar = primary.shadowRoot?.querySelector("ktc-primary-action-bar")
    ?? primary.querySelector("ktc-primary-action-bar");
  const button = Array.from(bar?.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    .find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`Missing ${label} action for ${primary.localName}`);
  return button;
}

function resultCount(toolId: (typeof toolCases)[number][0], primary: HTMLElement): number {
  if (toolId === "headerAscii" || toolId === "encodingFix") {
    return (primary as KtcTextRepairPrimary).model?.rows.length ?? 0;
  }
  if (toolId === "caaDialog") return (primary as KtcCaaPrimary).model?.rows?.length ?? 0;
  const panel = primary.shadowRoot!.querySelector<KtcReorderMembersPanel | KtcUuidResultsPanel>(
    toolId === "reorderMembers" ? "ktc-reorder-members-panel" : "ktc-uuid-results-panel",
  );
  if (!panel) return 0;
  return panel.localName === "ktc-reorder-members-panel"
    ? ((panel as KtcReorderMembersPanel).model?.reorderResults?.length ?? 0)
    : ((panel as KtcUuidResultsPanel).model?.files?.length ?? 0);
}

describe("Code Assistant Preview surface registry", () => {
  it("routes all five leaf tools to interactive cached Primary surfaces", () => {
    const app = setup();
    const primaries = new Map<string, HTMLElement>();
    for (const [toolId, label] of toolCases) {
      const primary = app.registry.createPrimary(toolId)!;
      primaries.set(toolId, primary);
      document.body.append(primary);
      const action = actionButton(primary, label);
      expect(action.disabled, toolId).toBe(false);
      action.click();
    }
    vi.advanceTimersByTime(250);
    for (const [toolId] of toolCases) {
      const primary = primaries.get(toolId)!;
      expect(resultCount(toolId, primary), toolId).toBeGreaterThan(0);
      primary.remove();
      expect(app.registry.createPrimary(toolId), `${toolId} identity`).toBe(primary);
      expect(resultCount(toolId, primary), `${toolId} draft`).toBeGreaterThan(0);
    }
    expect(app.log.mock.calls.some(([line]) => line.includes("[头文件 ASCII]"))).toBe(true);
    expect(app.log.mock.calls.some(([line]) => line.includes("[编码修正]"))).toBe(true);
    expect(app.log.mock.calls.some(([line]) => line.includes("[成员排序]"))).toBe(true);
    expect(app.log.mock.calls.some(([line]) => line.includes("[UUID 替换]"))).toBe(true);
    expect(app.log.mock.calls.some(([line]) => line.includes("[CAA UI]"))).toBe(true);
  });

  it("notifies every created surface when the shared directory changes", () => {
    const app = setup();
    const primaries = Object.fromEntries(toolCases.map(([toolId, label]) => {
      const primary = app.registry.createPrimary(toolId)!;
      document.body.append(primary);
      actionButton(primary, label).click();
      return [toolId, primary];
    })) as Record<(typeof toolCases)[number][0], HTMLElement>;
    vi.advanceTimersByTime(250);
    app.setDirectory("/workspace/second");
    app.registry.directoryChanged();

    for (const toolId of ["headerAscii", "encodingFix"] as const) {
      const model = (primaries[toolId] as KtcTextRepairPrimary).model!;
      expect(model.directory).toBe("/workspace/second");
      expect(model.rows).toEqual([]);
      expect(model.status).toContain("旧预检已失效");
    }
    for (const toolId of ["reorderMembers", "uuidReplace"] as const) {
      expect(resultCount(toolId, primaries[toolId])).toBe(0);
      expect(primaries[toolId].shadowRoot!.querySelector('[role="status"]')?.textContent).toContain("旧计划已失效");
    }
    const caa = primaries.caaDialog as KtcCaaPrimary;
    expect(caa.model).toMatchObject({ resultActionsEnabled: false, message: "目录已变化，请重新扫描。" });
  });

  it("reset and dispose cancel old receipts while allowing fresh sessions", () => {
    const app = setup();
    const old = toolCases.map(([toolId, label]) => {
      const primary = app.registry.createPrimary(toolId)!;
      document.body.append(primary);
      actionButton(primary, label).click();
      return primary;
    });
    const callsAfterStarts = app.log.mock.calls.length;
    app.registry.reset();
    vi.advanceTimersByTime(250);
    expect(app.log).toHaveBeenCalledTimes(callsAfterStarts);
    expect(old.slice(0, 4).every((primary) => !primary.isConnected)).toBe(true);

    const fresh = toolCases.map(([toolId]) => app.registry.createPrimary(toolId)!);
    fresh.forEach((primary, index) => expect(primary).not.toBe(old[index]));
    document.body.append(...fresh);
    actionButton(fresh[0]!, "预检").click();
    vi.advanceTimersByTime(100);
    expect(resultCount("headerAscii", fresh[0]!)).toBeGreaterThan(0);

    actionButton(fresh[1]!, "预检").click();
    actionButton(fresh[4]!, "扫描 CATDlg").click();
    const callsBeforeDispose = app.log.mock.calls.length;
    app.registry.dispose();
    vi.advanceTimersByTime(250);
    expect(app.log).toHaveBeenCalledTimes(callsBeforeDispose);
    const afterDispose = app.registry.createPrimary("headerAscii")!;
    expect(afterDispose).not.toBe(fresh[0]);
  });

  it("returns undefined for unknown tools so main keeps its existing routing and Right ownership", () => {
    const app = setup();
    expect(app.registry.createPrimary("git")).toBeUndefined();
    expect(app.registry.createPrimary("unknown-tool")).toBeUndefined();

    for (const [toolId] of toolCases) {
      expect(resolvePreviewToolRoute(PREVIEW_TOOL_CATALOG_BY_ID[toolId]!).rightPanelId).toBeNull();
    }
    const main = readFileSync("ui-preview/src/main.ts", "utf8");
    const createStart = main.indexOf("function createToolSummary");
    const createEnd = main.indexOf("function createEditorCompanionPrimary", createStart);
    const createToolSummary = main.slice(createStart, createEnd);
    expect(createToolSummary).toContain("previewCodeAssistantSurfaces.createPrimary(toolId)");
    expect(createToolSummary).toContain("if (codeAssistantPrimary) return codeAssistantPrimary");
    expect(createToolSummary.indexOf("if (codeAssistantPrimary)")).toBeLessThan(createToolSummary.indexOf('if (meta?.toolId === "git")'));
    expect(createToolSummary).toContain('if (meta?.toolId === "run") return previewRunSurface.createPrimary()');
    expect(createToolSummary).toContain('if (meta?.toolId === "packageIncludes") return getPreviewPackageSurface().createPrimary()');
    expect(main).toContain("previewCodeAssistantSurfaces.directoryChanged()");
    expect(main).toContain('window.addEventListener("pagehide", () => previewCodeAssistantSurfaces.dispose())');
    expect(main).toContain("previewCodeAssistantSurfaces.reset()");
    expect(main.slice(main.indexOf("function closeItem"), main.indexOf("function closeOtherItems")))
      .not.toContain("previewCodeAssistantSurfaces.reset");
  });
});
