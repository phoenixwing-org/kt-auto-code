// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KtCodegenPrimaryPanel, KtCodegenControlPanel, type KtCodegenPrimaryActionDetail } from "@phoenix-wing/kt-codegen/ui";
import { KtCodegenTable } from "@phoenix-wing/kt-codegen/table";
import { createPreviewCodegenSurface } from "../../ui-preview/src/previewCodegenSurface.js";
import { PREVIEW_CODEGEN_FIXTURES } from "../../ui-preview/src/previewCodegenFixture.js";

// happy-dom 15 does not expose window.Option; keep actual option DOM and Wing UI.
beforeEach(() => {
  vi.stubGlobal("Option", function Option(text = "", value = "", defaultSelected = false, selected = false) {
    const option = document.createElement("option");
    option.text = text;
    option.value = value;
    option.defaultSelected = defaultSelected;
    option.selected = selected;
    return option;
  });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  const log = vi.fn<(message: string) => void>();
  const openEditor = vi.fn<() => void>();
  const onContextChanged = vi.fn<() => void>();
  const surface = createPreviewCodegenSurface({ log, openEditor, onContextChanged });
  const primary = surface.createPrimary() as KtCodegenPrimaryPanel;
  const right = surface.createRight();
  const actions = surface.createRightActions();
  document.body.append(primary, actions, right);
  const table = right.querySelector("kt-codegen-table") as KtCodegenTable;
  const panel = right.querySelector("ktc-codegen-control-panel") as KtCodegenControlPanel;
  return {
    surface, log, openEditor, onContextChanged, primary, right, actions, table, panel,
    action(name: string) { return actions.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!; },
    get status() { return right.querySelector('[role="status"]')!.textContent; },
    get active() { return primary.model!.documents.find(({ active }) => active)!; },
    get preflight() { return panel.model?.preflight; },
    get output() { return right.querySelector("pre")!.textContent; },
    emit(detail: KtCodegenPrimaryActionDetail) {
      primary.dispatchEvent(new CustomEvent("kt-codegen-primary-action", { detail, bubbles: true }));
    },
    choose(index: number) {
      const fileName = primary.model!.documents[index]!.fileName;
      const row = Array.from(primary.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.pnw-codegen-row"))
        .find((button) => button.textContent?.includes(fileName));
      expect(row).toBeDefined();
      row!.click();
    },
    cell(label = "Variable", row = 1) {
      return table.shadowRoot!.querySelector<HTMLInputElement>(`input[aria-label="${label}，第 ${row} 行"]`)!;
    },
  };
}

function edit(input: HTMLInputElement, value: string, eventName = "input") {
  input.value = value;
  input.dispatchEvent(new Event(eventName, { bubbles: true }));
}

async function settle() { await new Promise<void>((resolve) => setTimeout(resolve, 15)); }

function buttonByText(root: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(({ textContent }) => textContent === label);
  expect(button, `missing button ${label}`).toBeDefined();
  return button!;
}

describe("Preview Codegen shared component/session surface", () => {
  it("使用真实 Primary/Table/ControlPanel，保留 17 列和全部 9 个表格操作", () => {
    const view = setup();
    expect(view.primary).toBeInstanceOf(KtCodegenPrimaryPanel);
    expect(view.table).toBeInstanceOf(KtCodegenTable);
    expect(view.panel).toBeInstanceOf(KtCodegenControlPanel);
    expect(view.table.shadowRoot!.querySelectorAll("thead th")).toHaveLength(18);
    expect(Array.from(view.table.shadowRoot!.querySelectorAll<HTMLButtonElement>("button[data-action]"), ({ dataset }) => dataset.action)).toEqual([
      "autoFit", "sort", "copy", "paste", "insert", "duplicate", "moveUp", "moveDown", "delete",
    ]);
    expect(Array.from(view.actions.children, ({ textContent }) => textContent)).toEqual(["预检", "预检结果", "应用", "重新加载", "保存 JSON"]);
    expect(view.primary.model!.controls!.blocks).toHaveLength(32);
    expect(view.primary.model!.documents).toHaveLength(2);
    expect(view.preflight).toBeUndefined();
    expect(view.surface.contextDirectory()).toBe("/preview-memory/codegen");
    expect(view.status).toContain("内存");
  });

  it("两份 JSON 按 URI 保留各自草稿，点击真实文件行同步 Primary/Right", () => {
    const view = setup();
    const firstUri = view.active.id;
    edit(view.cell(), "ChangedId");
    expect(view.active.dirty).toBe(true);
    view.choose(1);
    expect(view.active.fileName).toBe("IssueDialog.json");
    expect(view.table.getData().items).toHaveLength(1);
    expect(view.cell().value).toBe("Width");
    view.choose(0);
    expect(view.active.id).toBe(firstUri);
    expect(view.cell().value).toBe("ChangedId");
    expect(view.active.dirty).toBe(true);
    expect(view.right.dataset.documentId).toBe(firstUri);
    expect(view.openEditor).toHaveBeenCalledTimes(2);
    expect(view.onContextChanged).toHaveBeenCalledTimes(2);
  });

  it("元数据/整表保存到内存 checkpoint，重载只撤销该文档未保存部分", () => {
    const view = setup();
    const prefix = view.primary.shadowRoot!.querySelector<HTMLInputElement>(".pnw-codegen-property input")!;
    edit(prefix, "New", "change");
    edit(view.cell(), "CheckpointValue");
    view.action("save").click();
    expect(view.active.dirty).toBe(false);
    expect(view.active.namePrefix).toBe("New");
    expect(view.table.getData().documentRevision).toBe(1);
    edit(view.cell(), "UnsavedValue");
    view.action("reload").click();
    expect(view.cell().value).toBe("CheckpointValue");
    expect(view.active.namePrefix).toBe("New");
    expect(view.active.dirty).toBe(false);
    expect(view.table.getData().documentRevision).toBe(2);
    expect(view.status).toContain("内存 checkpoint");
    expect(PREVIEW_CODEGEN_FIXTURES[0]!.json).not.toContain("CheckpointValue");
  });

  it("Wing Analyze 从内存源码产生真实命中/产物，首次预检展开共享结果", async () => {
    const view = setup();
    view.action("preflight").click();
    expect(view.action("preflight").textContent).toBe("取消预检");
    await settle();
    expect(view.preflight?.state).toBe("ready");
    expect(view.preflight?.plan.markerRegions).toHaveLength(1);
    expect(view.preflight?.plan.artifacts).toHaveLength(1);
    expect(view.preflight?.plan.artifacts[0]!.content).toContain("IssueId");
    expect(view.primary.model!.controls!.preflight?.plan).toBe(view.preflight!.plan);
    expect(view.right.querySelector("details")!.open).toBe(true);
    expect(view.action("results").getAttribute("aria-expanded")).toBe("true");
    expect(view.panel.shadowRoot!.textContent).toContain("PARAM DECLARATION");
  });

  it("取消预检使待处理计划失效，并恢复按钮", async () => {
    const view = setup();
    view.action("preflight").click();
    view.action("preflight").click();
    await settle();
    expect(view.preflight).toBeUndefined();
    expect(view.action("preflight").textContent).toBe("预检");
    expect(view.action("apply").disabled).toBe(false);
    expect(view.status).toContain("已取消预检");
  });

  it("扫描进行时修改表格，旧请求不得恢复可应用计划", async () => {
    const view = setup();
    view.action("preflight").click();
    edit(view.cell(), "ChangedDuringPreflight");
    await settle();
    expect(view.preflight).toBeUndefined();
    expect(view.active.dirty).toBe(true);
    expect(view.action("preflight").textContent).toBe("预检");
  });

  it("表格和元数据修改撤销旧预检，Apply 自动重新预检而非执行陈旧产物", async () => {
    const view = setup();
    view.action("preflight").click();
    await settle();
    const oldPlan = view.preflight!.plan;
    edit(view.cell(), "FreshValue");
    expect(view.preflight!.state).toBe("stale");
    expect(view.primary.model!.controls!.preflight!.state).toBe("stale");
    view.action("apply").click();
    await settle();
    expect(view.preflight!.state).toBe("applied");
    expect(view.preflight!.plan).not.toBe(oldPlan);
    expect(view.preflight!.plan.artifacts[0]!.content).toContain("FreshValue");
    buttonByText(view.panel.shadowRoot!, "查看源码").click();
    expect(view.output).toContain("FreshValue");
    expect(view.output).not.toContain("待生成的参数声明");
    const prefix = view.primary.shadowRoot!.querySelector<HTMLInputElement>(".pnw-codegen-property input")!;
    edit(prefix, "Changed", "change");
    expect(view.preflight!.state).toBe("stale");
  });

  it("直接 Apply 自动预检，真实纯投影仅更改内存源码并留下报告", async () => {
    const view = setup();
    view.action("apply").click();
    await settle();
    expect(view.preflight!.state).toBe("applied");
    expect(view.primary.model!.reports).toHaveLength(1);
    expect(view.status).toContain("没有写入磁盘");
    expect(PREVIEW_CODEGEN_FIXTURES[0]!.sources[0]!.text).toContain("待生成的参数声明");
    view.action("apply").click();
    await settle();
    expect(view.primary.model!.reports[0]!.change).toBe("unchanged");
  });

  it("控制符选择改变撤销旧计划，清空选择时 Apply 不伪造成功", async () => {
    const view = setup();
    view.action("preflight").click();
    await settle();
    view.primary.dispatchEvent(new CustomEvent("kt-codegen-control-selection-change", { detail: { blockKeys: [], singleMode: false } }));
    expect(view.preflight!.state).toBe("stale");
    expect(view.primary.model!.controls!.selectedBlockKeys).toEqual([]);
    view.action("apply").click();
    await settle();
    expect(view.preflight!.state).toBe("ready");
    expect(view.primary.model!.reports).toHaveLength(0);
    expect(view.status).toContain("Apply 未执行");
  });

  it("真实控制符 checkbox 与单项输出同步共享计划，不复制目录组件", async () => {
    const view = setup();
    view.action("preflight").click();
    await settle();
    const catalog = view.primary.shadowRoot!.querySelector("kt-codegen-control-catalog")!;
    const row = catalog.shadowRoot!.querySelector(".pnw-codegen-catalog-row")!;
    const check = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(check.checked).toBe(true);
    check.click();
    expect(view.primary.model!.controls!.selectedBlockKeys).not.toContain("PARAM DECLARATION");
    expect(view.preflight!.state).toBe("stale");
    const output = catalog.shadowRoot!.querySelector<HTMLButtonElement>(".pnw-codegen-output-one")!;
    output.click();
    expect(view.output).toContain("START KEVIN CAA WIZARD SECTION");
  });

  it("已保存 revision 拒绝旧表；切换文档保留只读预检但清理跨文档反馈", async () => {
    const view = setup();
    const stale = view.table.getData();
    view.action("save").click();
    view.table.setData({ ...stale, items: [] });
    view.table.dispatchEvent(new CustomEvent("kt-codegen-table-change", { detail: { documentRevision: 0, itemCount: 0 } }));
    expect(view.table.getData().items).toHaveLength(2);
    expect(view.table.getData().documentRevision).toBe(1);
    expect(view.status).toContain("拒绝过期表格");
    view.action("preflight").click();
    await settle();
    const plan = view.preflight!.plan;
    buttonByText(view.panel.shadowRoot!, "查看源码").click();
    expect(view.output).toContain("IssueCommand.h");
    view.choose(1);
    expect(view.output).toBe("");
    expect(view.preflight).toBeUndefined();
    view.choose(0);
    expect(view.preflight!.plan).toBe(plan);
  });

  it("真实 ControlPanel 保留筛选、显示路径、详情/打开与未闭合复制 END", async () => {
    const view = setup();
    view.choose(1);
    view.action("preflight").click();
    await settle();
    expect(view.preflight!.plan.diagnostics.some(({ code }) => code === "marker.missing-end")).toBe(true);
    const issueFilter = Array.from(view.panel.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"))
      .find(({ textContent }) => textContent?.startsWith("问题 "))!;
    issueFilter.click();
    expect(view.panel.shadowRoot!.textContent).toContain("PARAM CONSTRUCTOR");
    buttonByText(view.panel.shadowRoot!, "复制 END").click();
    expect(view.output).toContain("// END KEVIN CAA WIZARD SECTION PNXIssueDialogData PARAM CONSTRUCTOR");
    expect(view.log.mock.calls.flat().join("\n")).toContain("未写系统剪贴板");
    buttonByText(view.panel.shadowRoot!, "查看源码").click();
    expect(view.output).toContain("IssueDialog.h");
    const pathToggle = view.panel.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="显示左侧源码路径"]')!;
    pathToggle.click();
    expect(view.panel.shadowRoot!.querySelector(".pnw-codegen-master")!.textContent).toContain("/preview-memory/");
  });

  it("JSON/CSV 导入使用真正 Reader，错误可修正且不会覆盖已有草稿", () => {
    const view = setup();
    view.emit({ action: "openJson" });
    let dialog = document.querySelector("dialog")!;
    const input = dialog.querySelector("textarea")!;
    input.value = "{ invalid }";
    buttonByText(dialog, "打开").click();
    expect(dialog.querySelector('[role="status"]')!.textContent).not.toBe("");
    expect(view.primary.model!.documents).toHaveLength(2);
    input.value = PREVIEW_CODEGEN_FIXTURES[0]!.json;
    buttonByText(dialog, "打开").click();
    expect(view.primary.model!.documents).toHaveLength(3);
    expect(view.active.fileName).toBe("Imported-1.json");
    view.emit({ action: "importCsv" });
    dialog = document.querySelector("dialog")!;
    expect(dialog.querySelector("textarea")!.value).toContain("IssueId");
    buttonByText(dialog, "导入").click();
    expect(view.primary.model!.documents).toHaveLength(4);
    expect(view.table.getData().items).toHaveLength(2);
    expect(view.active.fileName).toBe("Imported-2.json");
  });

  it("全部应用/刷新/扫描/报告/模板输出有内存反馈，不重置草稿", async () => {
    const view = setup();
    edit(view.cell(), "DirtyValue");
    view.emit({ action: "refresh" });
    expect(view.cell().value).toBe("DirtyValue");
    view.emit({ action: "scanCandidates" });
    expect(view.primary.model!.candidates).toHaveLength(2);
    view.primary.dispatchEvent(new CustomEvent("kt-codegen-control-output", { detail: { scope: "block", blockKey: "PARAM DECLARATION" } }));
    expect(view.output).toContain("DirtyValue");
    view.emit({ action: "applyAll" });
    expect(view.primary.model!.operation).toBe("batch-apply");
    await vi.waitFor(() => expect(view.primary.model!.running).toBe(false));
    expect(view.primary.model!.running).toBe(false);
    expect(view.primary.model!.reports).toHaveLength(2);
    expect(view.primary.model!.reports.every(({ applyKind }) => applyKind === "batch")).toBe(true);
    view.emit({ action: "openReportDirectory" });
    expect(view.output).toContain("内存报告目录");
    expect(view.log.mock.calls.flat().join("\n")).toContain("未扫描工作区");
  });

  it("导入克隆源码按 documentId 隔离，查看源码和候选不会取另一文档的旧内容", async () => {
    const view = setup();
    view.emit({ action: "openJson" });
    buttonByText(document.querySelector("dialog")!, "打开").click();
    expect(view.active.fileName).toBe("Imported-1.json");
    edit(view.cell(), "ImportedOnly");
    view.action("apply").click();
    await settle();
    buttonByText(view.panel.shadowRoot!, "查看源码").click();
    expect(view.output).toContain("ImportedOnly");
    const candidates = view.primary.model!.candidates;
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(candidates.length);
    const originalCandidate = candidates.find(({ displayPath }) => displayPath.startsWith("IssueCommand.json"))!;
    const importedCandidate = candidates.find(({ displayPath }) => displayPath.startsWith("Imported-1.json"))!;
    view.emit({ action: "openCandidate", id: originalCandidate.id });
    expect(view.output).toContain("待生成的参数声明");
    expect(view.output).not.toContain("ImportedOnly");
    view.choose(0);
    view.emit({ action: "openCandidate", id: importedCandidate.id });
    expect(view.output).toContain("ImportedOnly");
  });

  it("批量进度显示当前执行 JSON，不误用用户当前打开的 JSON 名称", async () => {
    const view = setup();
    view.choose(1);
    view.emit({ action: "applyAll" });
    expect(view.active.fileName).toBe("IssueDialog.json");
    expect(view.primary.model!.batch).toMatchObject({ current: 1, total: 2, fileName: "IssueCommand.json" });
    await vi.waitFor(() => expect(view.primary.model!.running).toBe(false));
    expect(view.primary.model!.reports).toHaveLength(2);
    expect(view.primary.model!.reports.every(({ applyKind }) => applyKind === "batch")).toBe(true);
  });

  it("表格真实插入/删除操作及时更新 Primary 数量，折叠及分栏随 JSON 会话保存", () => {
    const view = setup();
    view.table.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="insert"]')!.click();
    expect(view.active.itemCount).toBe(3);
    view.table.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    expect(view.active.itemCount).toBe(2);
    view.table.shadowRoot!.querySelector<HTMLButtonElement>('[data-role="collapse-toggle"]')!.click();
    expect(view.table.collapsed).toBe(true);
    view.panel.dispatchEvent(new CustomEvent("kt-codegen-control-split-change", { detail: { ratio: 60 } }));
    view.choose(1);
    expect(view.table.collapsed).toBe(false);
    view.choose(0);
    expect(view.table.collapsed).toBe(true);
    expect(view.panel.splitRatio).toBe(60);
  });

  it("工厂和 fixture 不导入 Host/FS，也不调用网络、磁盘或系统剪贴板", () => {
    const source = readFileSync("ui-preview/src/previewCodegenSurface.ts", "utf8");
    expect(source).not.toMatch(/from\s+["'](?:node:|vscode|fs["'])/);
    expect(source).not.toMatch(/\b(?:fetch|acquireVsCodeApi|readFile|writeFile)\s*\(/);
    expect(source).not.toContain("navigator.clipboard");
    expect(source).toContain("ktCodegenProjectApply");
    expect(source).toContain("KtcCodegenDocumentModel");
    expect(source).toContain("KtcCodegenControlSessionController");
  });
});
