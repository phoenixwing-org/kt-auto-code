// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KtCodegenController, KtCodegenItem } from "@phoenix-wing/kt-codegen";
import { ktCodegenDefineTableElement, type KtCodegenTable } from "@phoenix-wing/kt-codegen/table";
import { ktCodegenDefineControlPanelElement } from "@phoenix-wing/kt-codegen/ui";
import { KtcCodegenDocumentModel } from "./documentModel.js";
import { KtcCodegenControlSessionController } from "./controlSessionController.js";
import type { KtcCodegenEditorModel, KtcCodegenEditorOutboundMessage, KtcCodegenEditorInboundMessage } from "./editorContracts.js";
import { getCodegenEditorHtml } from "./editorHtml.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Option", function Option(text = "", value = "") {
    const option = document.createElement("option"); option.text = text; option.value = value; return option;
  });
  ktCodegenDefineTableElement();
  ktCodegenDefineControlPanelElement("ktc-codegen-control-panel");
});
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  const controller = new KtCodegenController();
  controller.param.items.push(new KtCodegenItem({ name: "Original" }));
  const session = new KtcCodegenDocumentModel({
    uri: "file:///example.json", fsPath: "/example.json", fileName: "example.json",
  }, controller);
  const model: KtcCodegenEditorModel = {
    uri: session.identity.uri, fileName: session.identity.fileName,
    table: session.getTableData(), controls: new KtcCodegenControlSessionController().viewModel(session),
    dirty: false, externalConflict: false, externalState: "current",
  };
  const extension = { path: "/extension", with(value: { path: string }) { return { ...this, ...value }; } };
  const html = getCodegenEditorHtml({ cspSource: "test", asWebviewUri: (uri: { path: string }) => uri.path } as never, extension as never, model);
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu)]
    .map((match) => match[1]!).find((text) => text.includes("acquireVsCodeApi"))!;
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, ""), "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  const messages: KtcCodegenEditorInboundMessage[] = [];
  const listeners: ((event: MessageEvent) => void)[] = [];
  // Exercise the shipped inline program with the real DOM/components, not a duplicate reducer.
  const windowPort = {
    innerHeight: 800,
    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === "message") listeners.push(listener);
    },
  };
  new Function("acquireVsCodeApi", "window", script)(
    () => ({ postMessage: (message: KtcCodegenEditorInboundMessage) => messages.push(message) }), windowPort,
  );
  const table = document.getElementById("codegen-table") as KtCodegenTable;
  const save = document.getElementById("save") as HTMLButtonElement;
  return {
    table, save, messages,
    receive(data: KtcCodegenEditorOutboundMessage) { for (const listener of listeners) listener({ data } as MessageEvent); },
    edit(value: string) {
      const input = table.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Title，第 1 行"]')!;
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    },
  };
}

describe("formal Codegen editor save lifecycle", () => {
  it("旧 saved 回执不清除 600ms 未同步的新草稿，立即按新 revision 重发", () => {
    const view = setup();
    view.edit("Saved");
    view.save.click();
    const savedTable = view.table.getData();
    view.receive({ type: "codegenStatus", status: "saving", message: "保存中" });
    view.edit("Newer");
    view.receive({ type: "codegenDocumentState", dirty: false, externalConflict: false, externalState: "current" });
    expect(view.save.textContent).toContain("*");
    view.receive({ type: "codegenStatus", status: "saved", message: "已保存", documentRevision: 1, savedTable, savedCurrent: true });
    expect(view.table.getData().items[0]!.name).toBe("Newer");
    expect(view.save.textContent).toContain("*");
    expect(view.save.disabled).toBe(false);
    const syncs = view.messages.filter((message) => message.type === "codegenEditorExchange" && message.action === "sync");
    expect(syncs.at(-1)).toMatchObject({ model: { dirty: true, table: { documentRevision: 1, items: [{ name: "Newer" }] } } });
    const dirtyCount = view.messages.filter((message) => message.type === "codegenEditorDirty").length;
    expect(dirtyCount).toBeGreaterThanOrEqual(2);
  });

  it("保存回执匹配当前表格时 clean，Host 较新元数据则仍保持 dirty", () => {
    const view = setup();
    view.edit("Saved");
    const savedTable = view.table.getData();
    view.receive({ type: "codegenStatus", status: "saved", message: "已保存", documentRevision: 1, savedTable, savedCurrent: false });
    expect(view.save.textContent).toContain("*");
    view.receive({ type: "codegenStatus", status: "saved", message: "已保存", documentRevision: 2,
      savedTable: view.table.getData(), savedCurrent: true });
    expect(view.save.textContent).not.toContain("*");
    expect(view.table.getData().documentRevision).toBe(2);
  });
});
