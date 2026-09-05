export interface GitBuildState {
  readonly commit: string;
  readonly clean: boolean;
  readonly statusSha256: string;
}

export interface ReleaseBuildProvenance {
  readonly kind: "kt-auto-code.release-build-provenance";
  readonly schemaVersion: 1;
  readonly artifact: string;
  readonly version: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly commit: string;
  readonly before: GitBuildState;
  readonly after: GitBuildState;
  readonly clean: boolean;
  readonly stable: boolean;
  /** Necessary source condition only; final release eligibility belongs to preflight + receipt. */
  readonly sourceCleanAndStable: boolean;
}

export interface ArtifactVerificationEvidence {
  readonly kind: "kt-auto-code.vsix-verification-evidence";
  readonly schemaVersion: 1;
  readonly artifactKind: "code";
  readonly artifact: string;
  readonly version: string;
  readonly fileCount: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly provenance: ReleaseBuildProvenance;
}

export const BUILD_PROVENANCE_KIND: "kt-auto-code.release-build-provenance";
export const ARTIFACT_VERIFICATION_EVIDENCE_KIND: "kt-auto-code.vsix-verification-evidence";
export const ARTIFACT_VERIFICATION_EVIDENCE_PREFIX: "[verify:evidence] ";

export function assertReleaseVersion(version: unknown): string;
export function sha256Bytes(bytes: NodeJS.ArrayBufferView): string;
export function buildProvenanceSidecarPath(artifactPath: string): string;
export function captureGitBuildState(root: string): GitBuildState;
export function createBuildProvenance(options: {
  readonly artifact: string;
  readonly version: string;
  readonly artifactBytes: Buffer;
  readonly before: GitBuildState;
  readonly after: GitBuildState;
}): ReleaseBuildProvenance;
export function validateBuildProvenance(
  value: unknown,
  expected?: Partial<Pick<ReleaseBuildProvenance, "artifact" | "version" | "sha256" | "bytes" | "commit">>,
): ReleaseBuildProvenance;
export function readBuildProvenance(
  artifactPath: string,
  expected?: Partial<Pick<ReleaseBuildProvenance, "artifact" | "version" | "sha256" | "bytes" | "commit">>,
): ReleaseBuildProvenance;
export function writeTextAtomically(filename: string, content: string): string;
export function writeBuildProvenance(artifactPath: string, provenance: ReleaseBuildProvenance): string;
export function readVerifiedSha256Sidecar(artifactPath: string, actualSha256: string): string;
export function createArtifactVerificationEvidence(options: {
  readonly artifactKind: "code";
  readonly artifact: string;
  readonly version: string;
  readonly fileCount: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly provenance: ReleaseBuildProvenance;
}): ArtifactVerificationEvidence;
export function validateArtifactVerificationEvidence(value: unknown): ArtifactVerificationEvidence;
export function serializeArtifactVerificationEvidence(evidence: ArtifactVerificationEvidence): string;
export function parseArtifactVerificationEvidence(output: string): ArtifactVerificationEvidence;
