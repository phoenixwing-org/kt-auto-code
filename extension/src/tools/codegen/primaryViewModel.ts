import type { KtcCodegenControlCatalogViewModel } from "./controlViewModel.js";

export interface KtcCodegenDocumentSummary {
  readonly uri: string;
  readonly fileName: string;
  readonly displayPath: string;
  readonly itemCount: number;
  readonly className: string;
  readonly namePrefix: string;
  readonly nameMiddle: string;
  readonly nameSpace: string;
  readonly appendFunction: string;
  readonly open: boolean;
  readonly active: boolean;
  readonly dirty: boolean;
  readonly externalConflict: boolean;
  readonly externalState: "current" | "changed" | "deleted";
  readonly diagnosticCount: number;
}

/** 工作区级控制标记候选；不绑定某一份 Codegen JSON。 */
export interface KtcCodegenSourceCandidateSummary {
  readonly uri: string;
  readonly displayPath: string;
  readonly markerCount: number;
  readonly encoding: string;
  readonly eol: "lf" | "crlf";
}

export interface KtcCodegenPrimaryViewModel {
  readonly documents: readonly KtcCodegenDocumentSummary[];
  readonly activeUri?: string;
  readonly controls?: KtcCodegenControlCatalogViewModel;
  readonly candidates: readonly KtcCodegenSourceCandidateSummary[];
  readonly operation?: "discovery" | "candidates";
  readonly running: boolean;
}
