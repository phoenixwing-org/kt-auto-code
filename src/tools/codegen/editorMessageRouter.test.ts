import { describe, expect, it } from "vitest";
import type { KtcCodegenEditorInboundMessage, KtcCodegenEditorModel } from "./editorContracts.js";
import { ktcRouteCodegenEditorMessage } from "./editorMessageRouter.js";

const URI = "file:///workspace/Demo.json";
const TABLE = {
  kind: "kt.codegen.table-data" as const,
  schemaVersion: 1 as const,
  documentRevision: 3,
  selectedRow: null,
  items: [],
};
const MODEL: KtcCodegenEditorModel = {
  uri: URI,
  fileName: "Demo.json",
  table: TABLE,
  controls: {
    kind: "kt.codegen.control-ui-model",
    schemaVersion: 1,
    documentId: URI,
    uri: URI,
    fileName: "Demo.json",
    blocks: [],
    unclosed: [],
    selectedBlockKeys: [],
    singleSelectionMode: false,
    showMissingTemplates: false,
    preflightAvailable: false,
    missingTemplates: [],
    presets: { all: [], none: [], cppOnly: [], fieldCode: [] },
  },
  dirty: false,
  externalConflict: false,
  externalState: "current",
};

function route(message: KtcCodegenEditorInboundMessage) {
  return ktcRouteCodegenEditorMessage(URI, message);
}

describe("Codegen editor message router", () => {
  it("拒绝不属于当前文档会话的消息", () => {
    expect(route({
      type: "codegenEditorDirty", toolId: "codegen", uri: "file:///workspace/Other.json", itemCount: 2,
    })).toEqual({ kind: "ignore" });
    expect(route({
      type: "codegenEditorLayout", toolId: "codegen", uri: URI,
      layout: { controlSplitPercent: 42 },
    })).toEqual({ kind: "ignore" });
  });

  it("把 dirty、整表交换与带表格动作投影为语义命令", () => {
    expect(route({ type: "codegenEditorDirty", toolId: "codegen", uri: URI, itemCount: 4 }))
      .toEqual({ kind: "dirty", itemCount: 4 });
    expect(route({ type: "codegenEditorExchange", toolId: "codegen", uri: URI, action: "save", model: MODEL }))
      .toEqual({ kind: "exchange", action: "save", model: MODEL });
    expect(route({ type: "codegenEditorExchange", toolId: "codegen", uri: URI, action: "sync", model: MODEL }))
      .toEqual({ kind: "exchange", action: "sync", model: MODEL });
    expect(route({ type: "codegenEditorAction", toolId: "codegen", uri: URI, action: "preflight", table: TABLE }))
      .toEqual({ kind: "preflight", table: TABLE });
    expect(route({ type: "codegenEditorAction", toolId: "codegen", uri: URI, action: "apply", table: TABLE }))
      .toEqual({ kind: "apply", table: TABLE });
    expect(route({ type: "codegenEditorAction", toolId: "codegen", uri: URI, action: "apply" }))
      .toEqual({ kind: "apply", table: undefined });
  });

  it("把控制符消息与无负载动作准确分类", () => {
    const control = {
      type: "codegenControlDisplay" as const,
      toolId: "codegen" as const,
      uri: URI,
      showMissingTemplates: true,
    };
    expect(route(control)).toEqual({ kind: "control", message: control });
    const copyEnd = {
      type: "codegenControlCopyEnd" as const,
      toolId: "codegen" as const,
      uri: URI,
      blockKey: "CMD AGENT CONSTRUCTOR" as const,
      path: "/workspace/PNXBomAnalysisCmd.cpp",
      line: 91,
    };
    expect(route(copyEnd)).toEqual({ kind: "control", message: copyEnd });
    for (const action of ["ready", "reload", "cancelPreflight"] as const) {
      expect(route({ type: "codegenEditorAction", toolId: "codegen", uri: URI, action }))
        .toEqual({ kind: action });
    }
  });
});
