import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CLEAN_STATUS_SHA256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");

export const BUILD_PROVENANCE_KIND = "kt-auto-code.release-build-provenance";
export const ARTIFACT_VERIFICATION_EVIDENCE_KIND = "kt-auto-code.vsix-verification-evidence";
export const ARTIFACT_VERIFICATION_EVIDENCE_PREFIX = "[verify:evidence] ";

export function assertReleaseVersion(version) {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid release artifact version: ${String(version)}`);
  }
  return version;
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildProvenanceSidecarPath(artifactPath) {
  return `${artifactPath}.build-provenance.json`;
}

function runGit(root, args, encoding) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = typeof error?.stderr === "string"
      ? error.stderr.trim()
      : Buffer.isBuffer(error?.stderr) ? error.stderr.toString("utf8").trim() : "";
    throw new Error(`Failed to inspect Git build state${stderr ? `: ${stderr}` : ""}`);
  }
}

function readHeadCommit(root) {
  const commit = runGit(root, ["rev-parse", "--verify", "HEAD"], "utf8").trim();
  if (!COMMIT_PATTERN.test(commit)) throw new Error(`Git HEAD must be a full lowercase OID, got ${commit}`);
  return commit;
}

/** Capture a path-safe digest of the complete tracked/untracked status without storing local filenames. */
export function captureGitBuildState(root) {
  const resolvedRoot = path.resolve(root);
  const commitBeforeStatus = readHeadCommit(resolvedRoot);
  const status = runGit(resolvedRoot, [
    "-c", "core.quotePath=false", "status", "--porcelain=v1", "--untracked-files=all", "-z",
  ], null);
  const commitAfterStatus = readHeadCommit(resolvedRoot);
  if (commitBeforeStatus !== commitAfterStatus) {
    throw new Error("Git HEAD changed while capturing build state");
  }
  return {
    commit: commitBeforeStatus,
    clean: status.length === 0,
    statusSha256: sha256Bytes(status),
  };
}

export function createBuildProvenance(options) {
  const version = assertReleaseVersion(options.version);
  const artifact = options.artifact;
  if (artifact !== `dist/vsix/kt-auto-code-${version}.vsix`) {
    throw new Error(`Invalid release artifact path: ${String(artifact)}`);
  }
  const before = validateGitBuildState(options.before, "before");
  const after = validateGitBuildState(options.after, "after");
  if (!Buffer.isBuffer(options.artifactBytes)) throw new Error("Release artifact bytes must be a Buffer");

  const stable = before.commit === after.commit && before.statusSha256 === after.statusSha256;
  const clean = before.clean && after.clean;
  return {
    kind: BUILD_PROVENANCE_KIND,
    schemaVersion: 1,
    artifact,
    version,
    sha256: sha256Bytes(options.artifactBytes),
    bytes: options.artifactBytes.byteLength,
    commit: before.commit,
    before,
    after,
    clean,
    stable,
    sourceCleanAndStable: clean && stable,
  };
}

function requireObject(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function validateGitBuildState(value, label) {
  const state = requireObject(value, `Build provenance ${label}`);
  if (!COMMIT_PATTERN.test(state.commit)) {
    throw new Error(`Build provenance ${label} commit must be a full lowercase Git OID`);
  }
  if (typeof state.clean !== "boolean") throw new Error(`Build provenance ${label} clean must be boolean`);
  if (!SHA256_PATTERN.test(state.statusSha256)) {
    throw new Error(`Build provenance ${label} statusSha256 must be SHA-256`);
  }
  if (state.clean !== (state.statusSha256 === CLEAN_STATUS_SHA256)) {
    throw new Error(`Build provenance ${label} clean flag is inconsistent with statusSha256`);
  }
  return {
    commit: state.commit,
    clean: state.clean,
    statusSha256: state.statusSha256,
  };
}

export function validateBuildProvenance(value, expected = {}) {
  const provenance = requireObject(value, "Build provenance");
  if (provenance.kind !== BUILD_PROVENANCE_KIND || provenance.schemaVersion !== 1) {
    throw new Error("Invalid release build provenance kind or schemaVersion");
  }
  const version = assertReleaseVersion(provenance.version);
  if (provenance.artifact !== `dist/vsix/kt-auto-code-${version}.vsix`) {
    throw new Error("Build provenance artifact must match its versioned KT Auto Code VSIX path");
  }
  if (!SHA256_PATTERN.test(provenance.sha256)) throw new Error("Build provenance sha256 must be SHA-256");
  if (!Number.isSafeInteger(provenance.bytes) || provenance.bytes <= 0) {
    throw new Error("Build provenance bytes must be a positive safe integer");
  }
  if (!COMMIT_PATTERN.test(provenance.commit)) {
    throw new Error("Build provenance commit must be a full lowercase Git OID");
  }
  const before = validateGitBuildState(provenance.before, "before");
  const after = validateGitBuildState(provenance.after, "after");
  const stable = before.commit === after.commit && before.statusSha256 === after.statusSha256;
  const clean = before.clean && after.clean;
  const sourceCleanAndStable = clean && stable;
  if (provenance.commit !== before.commit) throw new Error("Build provenance commit must equal before.commit");
  if (provenance.stable !== stable) throw new Error("Build provenance stable flag is inconsistent");
  if (provenance.clean !== clean) throw new Error("Build provenance clean flag is inconsistent");
  if (provenance.sourceCleanAndStable !== sourceCleanAndStable) {
    throw new Error("Build provenance sourceCleanAndStable flag is inconsistent");
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && provenance[key] !== expectedValue) {
      throw new Error(`Build provenance ${key} must equal ${String(expectedValue)}, got ${String(provenance[key])}`);
    }
  }
  return {
    kind: BUILD_PROVENANCE_KIND,
    schemaVersion: 1,
    artifact: provenance.artifact,
    version: provenance.version,
    sha256: provenance.sha256,
    bytes: provenance.bytes,
    commit: provenance.commit,
    before,
    after,
    clean,
    stable,
    sourceCleanAndStable,
  };
}

export function readBuildProvenance(artifactPath, expected = {}) {
  const filename = buildProvenanceSidecarPath(artifactPath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read release build provenance ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateBuildProvenance(parsed, expected);
}

export function writeTextAtomically(filename, content) {
  const outputPath = path.resolve(filename);
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
  return outputPath;
}

export function writeBuildProvenance(artifactPath, provenance) {
  const validated = validateBuildProvenance(provenance);
  return writeTextAtomically(
    buildProvenanceSidecarPath(artifactPath),
    `${JSON.stringify(validated, null, 2)}\n`,
  );
}

export function readVerifiedSha256Sidecar(artifactPath, actualSha256) {
  if (!SHA256_PATTERN.test(actualSha256)) throw new Error("Actual VSIX SHA-256 is invalid");
  const sidecarPath = `${artifactPath}.sha256`;
  const sidecar = fs.readFileSync(sidecarPath, "utf8").trim();
  const match = /^([0-9a-f]{64})  ([^\r\n]+)$/u.exec(sidecar);
  if (!match) throw new Error(`Invalid SHA-256 sidecar format: ${sidecarPath}`);
  if (match[2] !== path.basename(artifactPath)) {
    throw new Error(`SHA-256 sidecar artifact name must equal ${path.basename(artifactPath)}`);
  }
  if (match[1] !== actualSha256) throw new Error(`VSIX SHA-256 does not match ${sidecarPath}`);
  return match[1];
}

export function createArtifactVerificationEvidence(options) {
  const evidence = {
    kind: ARTIFACT_VERIFICATION_EVIDENCE_KIND,
    schemaVersion: 1,
    artifactKind: options.artifactKind,
    artifact: options.artifact,
    version: options.version,
    fileCount: options.fileCount,
    bytes: options.bytes,
    sha256: options.sha256,
    provenance: options.provenance,
  };
  return validateArtifactVerificationEvidence(evidence);
}

export function validateArtifactVerificationEvidence(value) {
  const evidence = requireObject(value, "VSIX verification evidence");
  if (evidence.kind !== ARTIFACT_VERIFICATION_EVIDENCE_KIND || evidence.schemaVersion !== 1) {
    throw new Error("Invalid VSIX verification evidence kind or schemaVersion");
  }
  if (evidence.artifactKind !== "code") throw new Error("VSIX verification evidence artifactKind must be code");
  const version = assertReleaseVersion(evidence.version);
  if (typeof evidence.artifact !== "string") throw new Error("VSIX verification evidence artifact must be a string");
  if (!Number.isSafeInteger(evidence.fileCount) || evidence.fileCount <= 0) {
    throw new Error("VSIX verification evidence fileCount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(evidence.bytes) || evidence.bytes <= 0) {
    throw new Error("VSIX verification evidence bytes must be a positive safe integer");
  }
  if (!SHA256_PATTERN.test(evidence.sha256)) throw new Error("VSIX verification evidence sha256 must be SHA-256");
  const provenance = validateBuildProvenance(evidence.provenance, {
    artifact: evidence.artifact,
    version,
    sha256: evidence.sha256,
    bytes: evidence.bytes,
  });
  return {
    kind: ARTIFACT_VERIFICATION_EVIDENCE_KIND,
    schemaVersion: 1,
    artifactKind: "code",
    artifact: evidence.artifact,
    version,
    fileCount: evidence.fileCount,
    bytes: evidence.bytes,
    sha256: evidence.sha256,
    provenance,
  };
}

export function serializeArtifactVerificationEvidence(evidence) {
  return `${ARTIFACT_VERIFICATION_EVIDENCE_PREFIX}${JSON.stringify(validateArtifactVerificationEvidence(evidence))}\n`;
}

export function parseArtifactVerificationEvidence(output) {
  if (typeof output !== "string") throw new Error("VSIX verifier output must be a string");
  const lines = output.split(/\r?\n/u)
    .filter((line) => line.startsWith(ARTIFACT_VERIFICATION_EVIDENCE_PREFIX));
  if (lines.length !== 1) {
    throw new Error("VSIX verifier must report exactly one machine-readable Code artifact evidence line");
  }
  let parsed;
  try {
    parsed = JSON.parse(lines[0].slice(ARTIFACT_VERIFICATION_EVIDENCE_PREFIX.length));
  } catch (error) {
    throw new Error(`Invalid VSIX verification evidence JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateArtifactVerificationEvidence(parsed);
}
