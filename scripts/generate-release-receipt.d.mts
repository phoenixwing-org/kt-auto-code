export interface ReleaseReceipt {
  readonly kind: "kt-auto-code.release-receipt";
  readonly schemaVersion: 1;
  readonly version: string;
  readonly commit: string;
  readonly artifact: string;
  readonly fileCount: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly verifier: "scripts/verify-extension-artifacts.mjs";
}

export const RELEASE_RECEIPT_USAGE: string;

export function parseVerifiedArtifactMetrics(output: string): {
  readonly fileCount: number;
  readonly bytes: number;
};

export function createReleaseReceipt(options: {
  readonly root?: string;
  readonly version: string;
  readonly commit: string;
  readonly verifierOutput: string;
}): ReleaseReceipt;

export function serializeReleaseReceipt(receipt: ReleaseReceipt): string;

export function writeReleaseReceipt(root: string, receipt: ReleaseReceipt): string;

export function runReleaseReceipt(options?: {
  readonly root?: string;
  readonly argv?: readonly string[];
}): { readonly help: true } | {
  readonly help: false;
  readonly receipt: ReleaseReceipt;
  readonly outputPath: string;
  readonly verifierOutput: string;
};
