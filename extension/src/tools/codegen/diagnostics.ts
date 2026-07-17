import type {
  KtcCodegenDocumentSummary,
  KtcCodegenSourceCandidateSummary,
} from "../types.js";

export interface KtcCodegenDiagnosticSession {
  readonly fileName: string;
  readonly revision: number;
  readonly dirty: boolean;
  readonly externalState: "current" | "changed" | "deleted";
  readonly selectedBlockCount: number;
  readonly singleSelectionMode: boolean;
  readonly preflight?: {
    readonly markerIndexRevision: number;
    readonly candidateFileCount: number;
    readonly regionCount: number;
    readonly diagnosticCount: number;
    readonly canApply: boolean;
    readonly reused: boolean;
  };
}

export interface KtcCodegenDiagnosticsInput {
  readonly createdAt: string;
  readonly vscodeVersion: string;
  readonly extensionVersion: string;
  readonly workspaceRoots: readonly string[];
  readonly workspaceScopeId: string;
  readonly activeUri?: string;
  readonly operation?: "discovery" | "candidates";
  readonly pendingOperations: readonly ("discovery" | "candidates")[];
  readonly candidateIndexReady: boolean;
  readonly pendingExternalJsonResources: number;
  readonly csv: {
    readonly convertedInSession: number;
    readonly deduplicatedInSession: number;
    readonly conflictCount: number;
  };
  readonly documents: readonly KtcCodegenDocumentSummary[];
  readonly candidates: readonly KtcCodegenSourceCandidateSummary[];
  readonly sessions: readonly KtcCodegenDiagnosticSession[];
}

export interface KtcCodegenDiagnosticsReport {
  readonly kind: "kt.codegen.runtime-diagnostics";
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly host: {
    readonly vscodeVersion: string;
    readonly extensionVersion: string;
  };
  readonly workspace: {
    readonly roots: readonly string[];
    readonly scopeId: string;
  };
  readonly runtime: {
    readonly activeDocument?: string;
    readonly operation: "idle" | "discovery" | "candidates";
    readonly pendingOperations: readonly ("discovery" | "candidates")[];
    readonly candidateIndexReady: boolean;
    readonly pendingExternalJsonResources: number;
  };
  readonly csv: {
    readonly convertedInSession: number;
    readonly deduplicatedInSession: number;
    readonly conflictCount: number;
  };
  readonly documents: readonly {
    readonly fileName: string;
    readonly displayPath: string;
    readonly itemCount: number;
    readonly open: boolean;
    readonly active: boolean;
    readonly dirty: boolean;
    readonly externalState: "current" | "changed" | "deleted";
    readonly diagnosticCount: number;
  }[];
  readonly candidates: readonly {
    readonly displayPath: string;
    readonly markerCount: number;
    readonly encoding: string;
    readonly eol: "lf" | "crlf";
  }[];
  readonly sessions: readonly KtcCodegenDiagnosticSession[];
}

/** 只投影状态，不包含 JSON 内容、表格单元格或源码内容。 */
export function ktcCreateCodegenDiagnostics(
  input: KtcCodegenDiagnosticsInput,
): KtcCodegenDiagnosticsReport {
  return {
    kind: "kt.codegen.runtime-diagnostics",
    schemaVersion: 1,
    createdAt: input.createdAt,
    host: {
      vscodeVersion: input.vscodeVersion,
      extensionVersion: input.extensionVersion,
    },
    workspace: {
      roots: [...input.workspaceRoots],
      scopeId: input.workspaceScopeId,
    },
    runtime: {
      ...(input.activeUri ? {
        activeDocument: input.documents.find((document) => document.uri === input.activeUri)?.displayPath
          ?? input.activeUri,
      } : {}),
      operation: input.operation ?? "idle",
      pendingOperations: [...input.pendingOperations],
      candidateIndexReady: input.candidateIndexReady,
      pendingExternalJsonResources: input.pendingExternalJsonResources,
    },
    csv: { ...input.csv },
    documents: input.documents.map((document) => ({
      fileName: document.fileName,
      displayPath: document.displayPath,
      itemCount: document.itemCount,
      open: document.open,
      active: document.active,
      dirty: document.dirty,
      externalState: document.externalState,
      diagnosticCount: document.diagnosticCount,
    })),
    candidates: input.candidates.map((candidate) => ({
      displayPath: candidate.displayPath,
      markerCount: candidate.markerCount,
      encoding: candidate.encoding,
      eol: candidate.eol,
    })),
    sessions: input.sessions.map((session) => ({
      ...session,
      ...(session.preflight ? { preflight: { ...session.preflight } } : {}),
    })),
  };
}

export function ktcCodegenRuntimeDiagnosticsText(input: KtcCodegenDiagnosticsInput): string {
  return `${JSON.stringify(ktcCreateCodegenDiagnostics(input), null, 2)}\n`;
}
