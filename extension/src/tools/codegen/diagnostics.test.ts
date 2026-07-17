import { describe, expect, it } from "vitest";
import { ktcCodegenRuntimeDiagnosticsText, ktcCreateCodegenDiagnostics } from "./diagnostics.js";

describe("Codegen runtime diagnostics", () => {
  it("投影可复制状态但不包含 URI、JSON 内容或表格单元格", () => {
    const input = {
      createdAt: "2026-07-16T13:00:00.000Z",
      vscodeVersion: "1.test",
      extensionVersion: "0.4.0-test",
      workspaceRoots: ["/workspace"],
      workspaceScopeId: "workspace",
      activeUri: "file:///workspace/PNXWidgetParam.json",
      operation: "candidates" as const,
      pendingOperations: ["discovery"] as const,
      candidateIndexReady: true,
      pendingExternalJsonResources: 1,
      csv: { convertedInSession: 1, deduplicatedInSession: 0, conflictCount: 1 },
      documents: [{
        uri: "file:///workspace/PNXWidgetParam.json",
        fileName: "PNXWidgetParam.json",
        displayPath: "PNXWidgetParam.json",
        itemCount: 3,
        className: "PNXWidget",
        namePrefix: "PNX",
        nameMiddle: "Widget",
        nameSpace: "PNX",
        appendFunction: "push_back",
        open: true,
        active: true,
        dirty: true,
        externalConflict: true,
        externalState: "changed" as const,
        diagnosticCount: 0,
      }],
      candidates: [{
        uri: "file:///workspace/src/PNXWidget.cpp",
        displayPath: "src/PNXWidget.cpp",
        markerCount: 4,
        encoding: "utf8",
        eol: "lf" as const,
      }],
      sessions: [{
        fileName: "PNXWidgetParam.json",
        revision: 2,
        dirty: true,
        externalState: "changed" as const,
        selectedBlockCount: 32,
        singleSelectionMode: true,
        preflight: {
          markerIndexRevision: 3,
          candidateFileCount: 1,
          regionCount: 2,
          diagnosticCount: 0,
          canApply: true,
          reused: false,
        },
      }],
    };

    const report = ktcCreateCodegenDiagnostics(input);
    expect(report.runtime).toEqual({
      activeDocument: "PNXWidgetParam.json",
      operation: "candidates",
      pendingOperations: ["discovery"],
      candidateIndexReady: true,
      pendingExternalJsonResources: 1,
    });
    expect(report.documents[0]?.externalState).toBe("changed");
    expect(report.csv).toEqual({ convertedInSession: 1, deduplicatedInSession: 0, conflictCount: 1 });
    expect(report.sessions[0]?.preflight?.markerIndexRevision).toBe(3);
    expect(report.sessions[0]?.singleSelectionMode).toBe(true);
    const serialized = ktcCodegenRuntimeDiagnosticsText(input);
    expect(serialized).not.toContain("file:///workspace");
    expect(serialized).not.toContain("Widget Name");
    expect(serialized.endsWith("\n")).toBe(true);
  });
});
