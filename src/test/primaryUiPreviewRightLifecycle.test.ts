import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { PREVIEW_TOOL_CATALOG_BY_ID } from "../../ui-preview/src/previewToolCatalog.js";
import { findLatestMruItem, removeMruItem } from "../../ui-preview/src/previewState.js";
import { resolvePreviewToolRoute } from "../../ui-preview/src/previewToolRouting.js";

const main = readFileSync("ui-preview/src/main.ts", "utf8");
const source = ts.createSourceFile("main.ts", main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = new Map(source.statements.filter(ts.isFunctionDeclaration)
  .map((node) => [node.name?.text, node.getText(source)]));
const coupledToolIds = ["projectRename", "autoBuild", "packageIncludes"] as const;
interface Item { readonly id: string; readonly toolId: string; readonly kind: "primary" | "right"; }
interface State {
  openItems: Item[];
  mruItemIds: string[];
  surfaceMruToolIds: string[];
  activeItemId: string;
  activeEditorId: string | undefined;
  activeSurfaceToolId: string;
  activeNavigatorToolId: string;
  activeGroupId: string;
}

/** Exercise main.ts's actual close/MRU functions without loading or invoking any business surface. */
function harness(toolIds: string[], activeToolId: string, mru = toolIds) {
  const items = toolIds.map((toolId) => ({
    id: `tool:${toolId}`, toolId, kind: resolvePreviewToolRoute(PREVIEW_TOOL_CATALOG_BY_ID[toolId]!).openItemKind,
  }));
  const seed: State = {
    openItems: items, mruItemIds: mru.map((id) => `tool:${id}`), surfaceMruToolIds: [...mru],
    activeItemId: `tool:${activeToolId}`, activeEditorId: items.find((item) => item.toolId === activeToolId && item.kind === "right")?.toolId,
    activeSurfaceToolId: activeToolId, activeNavigatorToolId: activeToolId,
    activeGroupId: PREVIEW_TOOL_CATALOG_BY_ID[activeToolId]!.groupId,
  };
  const names = ["closeItem", "closeCurrentPrimaryTool", "latestOpenItem", "latestSurfaceItem", "latestOpenNavigatorToolId", "isOpenTool", "applyToolToSurface", "clearSurface"];
  const body = names.map((name) => {
    const implementation = functions.get(name);
    if (!implementation) throw new Error(`Missing actual Preview function: ${name}`);
    return implementation;
  }).join("\n");
  const runtime = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function("seed", "PREVIEW_TOOL_CATALOG_BY_ID", "findLatestMruItem", "removeMruItem", `
    let { openItems, mruItemIds, surfaceMruToolIds, activeItemId, activeEditorId, activeSurfaceToolId, activeNavigatorToolId, activeGroupId } = seed;
    let renders = 0, releases = 0;
    function renderAll() { renders++; }
    function renderSurface() { renders++; }
    function persistPreviewState() {}
    function releasePreviewPackageSurface() { releases++; }
    ${runtime}
    return { closeRight: closeItem, closePrimary: closeCurrentPrimaryTool,
      state: () => ({ openItems, mruItemIds, surfaceMruToolIds, activeItemId, activeEditorId, activeSurfaceToolId, activeNavigatorToolId, activeGroupId }),
      renders: () => renders, releases: () => releases };
  `)(seed, PREVIEW_TOOL_CATALOG_BY_ID, findLatestMruItem, removeMruItem) as {
    closeRight(itemId: string): void; closePrimary(itemId?: string): void; state(): State; renders(): number; releases(): number;
  };
}

describe("Preview approved Right → Primary close coupling", () => {
  it("Right标签×复用既有逻辑关闭处理；本次三个工具都是单实例", () => {
    expect(functions.get("renderEditor")).toContain('closeButton(`关闭${item.title}标签`, () => closeItem(item.id))');
    for (const toolId of coupledToolIds) {
      expect(PREVIEW_TOOL_CATALOG_BY_ID[toolId]!.instancePolicy.kind).toBe("single");
      expect(resolvePreviewToolRoute(PREVIEW_TOOL_CATALOG_BY_ID[toolId]!).rightPanelId).toBe(toolId);
    }
  });

  it.each(coupledToolIds)("关闭 %s 当前Right同步移除Primary/OpenItems并按MRU回退，不关闭codegen", (toolId) => {
    const app = harness(["codeRename", "codegen", toolId], toolId, ["codegen", "codeRename", toolId]);
    app.closeRight(`tool:${toolId}`);
    expect(app.state()).toMatchObject({
      openItems: [{ id: "tool:codeRename" }, { id: "tool:codegen" }],
      mruItemIds: ["tool:codegen", "tool:codeRename"], surfaceMruToolIds: ["codegen", "codeRename"],
      activeItemId: "tool:codeRename", activeSurfaceToolId: "codeRename", activeEditorId: "codegen",
    });
    expect(app.renders()).toBe(1);
    expect(app.releases()).toBe(toolId === "packageIncludes" ? 1 : 0);
  });

  it.each(coupledToolIds)("关闭后台 %s Right不抢前台、不关闭其他Right或codegen项", (toolId) => {
    const other = coupledToolIds.find((id) => id !== toolId)!;
    const app = harness([toolId, other, "codegen"], "codegen");
    app.closeRight(`tool:${toolId}`);
    expect(app.state().openItems.map((item) => item.toolId)).toEqual([other, "codegen"]);
    expect(app.state()).toMatchObject({ activeItemId: "tool:codegen", activeEditorId: "codegen", activeSurfaceToolId: "codegen" });
  });

  it.each(coupledToolIds)("关闭最后一个 %s Right清空当前块并回到Welcome，重复关闭无副作用", (toolId) => {
    const app = harness([toolId], toolId);
    app.closeRight(`tool:${toolId}`);
    expect(app.state()).toMatchObject({ openItems: [], mruItemIds: [], surfaceMruToolIds: [], activeItemId: "", activeEditorId: undefined, activeSurfaceToolId: "", activeNavigatorToolId: "" });
    app.closeRight(`tool:${toolId}`); expect(app.renders()).toBe(1);
  });

  it("Primary ×仍调用已有关闭路径；不在本次改成额外反向协议", () => {
    expect(functions.get("closeCurrentPrimaryTool")).toContain("closeItem(current.id)");
    const app = harness(["git", "packageIncludes"], "packageIncludes");
    app.closePrimary();
    expect(app.state().openItems.map((item) => item.toolId)).toEqual(["git"]);
    expect(app.state().activeSurfaceToolId).toBe("git");
  });

  it("头文件任务内保留输入，关闭释放后首次打开使用当前目录，不恢复旧任务工程值", () => {
    const names = ["currentPreviewDirectory", "getPreviewPackageSurface", "releasePreviewPackageSurface"];
    const runtime = ts.transpileModule(names.map((name) => functions.get(name)!).join("\n"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const initial = { facts: [{ id: "package", value: "/dependency/include" }, { id: "target", value: "/old/sample" }], actions: [] };
    interface Surface { contextDirectory(): string; edit(value: string): void; createRightActions(): object; createRight(): object; }
    const create = vi.fn((options: { initial: typeof initial }): Surface => {
      let directory = options.initial.facts.find(({ id }) => id === "target")!.value;
      return { contextDirectory: () => directory, edit: (value) => { directory = value; }, createRightActions: () => ({}), createRight: () => ({}) };
    });
    const mounts = new Map<string, unknown[]>();
    const api = new Function("createPreviewPackageIncludesSurface", "initial", "mounts", `
      let previewPackageSurface, directoryIndex = 0;
      const directoryChoices = ['PNXCaaStudy/First', 'Second', '外部 · /external/Third'];
      const previewIgnorePolicy = {};
      function companionModel() { return initial; }
      function recordPreviewOutput() {}
      function dispatchCompanionAction() {}
      function applyPreviewIgnoreAction() {}
      function renderRightViewContexts() {}
      function required(selector) { return { replaceChildren: (...children) => mounts.set(selector, children) }; }
      ${runtime}
      return { get: getPreviewPackageSurface, release: releasePreviewPackageSurface, select: (index) => { directoryIndex = index; } };
    `)(create, initial, mounts) as { get(): Surface; release(): void; select(index: number): void };
    const first = api.get();
    expect(first.contextDirectory()).toBe("/workspace/PNXCaaStudy/First");
    first.edit("/task-only/manual"); api.select(2);
    expect(api.get()).toBe(first); expect(api.get().contextDirectory()).toBe("/task-only/manual");
    expect(create).toHaveBeenCalledTimes(1);
    api.release();
    expect([...mounts.values()]).toEqual([[], []]);
    const reopened = api.get();
    expect(reopened).not.toBe(first); expect(reopened.contextDirectory()).toBe("/external/Third");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0].initial.facts.find(({ id }) => id === "package")?.value).toBe("/dependency/include");
    expect(functions.get("renderEditor")).toContain('if (isOpenTool("packageIncludes")) getPreviewPackageSurface()');
    expect(functions.get("closeOtherItems")).toContain('if (keep.toolId !== "packageIncludes") releasePreviewPackageSurface()');
    expect(functions.get("resetVolatilePreviewState")).toContain("releasePreviewPackageSurface()");
  });
});
