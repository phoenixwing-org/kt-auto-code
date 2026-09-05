export interface KtcProjectRenameStructuredCandidate {
  readonly id: string;
  readonly sourceText: string;
  readonly targetText: string;
  readonly occurrences: number;
  readonly matchedItems: number;
  readonly examples: readonly string[];
  readonly reason: string;
}

export interface KtcProjectRenameStructuredDiscovery {
  readonly status: "ready" | "unsupported";
  readonly message: string;
  readonly scannedItems: number;
  readonly matchedItems: number;
  readonly occurrences: number;
  readonly truncated: boolean;
  readonly candidates: readonly KtcProjectRenameStructuredCandidate[];
}
