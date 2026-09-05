import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureGitBuildState,
  createArtifactVerificationEvidence,
  createBuildProvenance,
  parseArtifactVerificationEvidence,
  serializeArtifactVerificationEvidence,
  validateBuildProvenance,
} from "../scripts/release-artifact-provenance.mjs";

const temporaryRoots: string[] = [];
const version = "0.8.3";

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "kt-auto-release-provenance-"));
  temporaryRoots.push(root);
  writeFileSync(join(root, "tracked.txt"), "tracked\n");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", [
    "-c", "user.name=Release Test", "-c", "user.email=release-test@example.invalid",
    "commit", "--quiet", "-m", "fixture",
  ], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release artifact build provenance", () => {
  it("binds clean/stable source snapshots and artifact bytes to a full commit", () => {
    const root = createRepository();
    const before = captureGitBuildState(root);
    const after = captureGitBuildState(root);
    const bytes = Buffer.from("artifact bytes\n");
    const provenance = createBuildProvenance({
      artifact: `dist/vsix/kt-auto-code-${version}.vsix`,
      version,
      artifactBytes: bytes,
      before,
      after,
    });
    expect(provenance).toMatchObject({
      commit: before.commit,
      before,
      after,
      bytes: bytes.length,
      clean: true,
      stable: true,
      sourceCleanAndStable: true,
    });
    expect(provenance.commit).toMatch(/^[0-9a-f]{40}$/u);
  });

  it("allows a stable dirty package but marks its source condition false", () => {
    const root = createRepository();
    writeFileSync(join(root, "untracked.txt"), "dirty\n");
    const before = captureGitBuildState(root);
    const after = captureGitBuildState(root);
    const provenance = createBuildProvenance({
      artifact: `dist/vsix/kt-auto-code-${version}.vsix`,
      version,
      artifactBytes: Buffer.from("dirty artifact\n"),
      before,
      after,
    });
    expect(before.clean).toBe(false);
    expect(provenance).toMatchObject({ clean: false, stable: true, sourceCleanAndStable: false });
  });

  it("derives flags instead of trusting forged provenance booleans", () => {
    const root = createRepository();
    const before = captureGitBuildState(root);
    const after = { ...before, clean: false, statusSha256: "f".repeat(64) };
    const provenance = createBuildProvenance({
      artifact: `dist/vsix/kt-auto-code-${version}.vsix`,
      version,
      artifactBytes: Buffer.from("artifact\n"),
      before,
      after,
    });
    expect(provenance).toMatchObject({ clean: false, stable: false, sourceCleanAndStable: false });
    expect(() => validateBuildProvenance({ ...provenance, sourceCleanAndStable: true }))
      .toThrow(/sourceCleanAndStable flag is inconsistent/u);
  });

  it("emits and parses exactly one self-consistent machine evidence line", () => {
    const root = createRepository();
    const state = captureGitBuildState(root);
    const bytes = Buffer.from("artifact\n");
    const provenance = createBuildProvenance({
      artifact: `dist/vsix/kt-auto-code-${version}.vsix`,
      version,
      artifactBytes: bytes,
      before: state,
      after: state,
    });
    const evidence = createArtifactVerificationEvidence({
      artifactKind: "code",
      artifact: provenance.artifact,
      version,
      fileCount: 43,
      bytes: provenance.bytes,
      sha256: provenance.sha256,
      provenance,
    });
    const line = serializeArtifactVerificationEvidence(evidence);
    expect(parseArtifactVerificationEvidence(`human output\r\n${line}`)).toEqual(evidence);
    expect(() => parseArtifactVerificationEvidence(`${line}${line}`))
      .toThrow(/exactly one machine-readable/u);
    expect(() => createArtifactVerificationEvidence({ ...evidence, sha256: "f".repeat(64) }))
      .toThrow(/Build provenance sha256 must equal/u);
  });
});
