import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createArtifactVerificationEvidence,
  createBuildProvenance,
  serializeArtifactVerificationEvidence,
  writeBuildProvenance,
  type GitBuildState,
} from "../scripts/release-artifact-provenance.mjs";
import {
  createReleaseReceipt,
  parseVerifiedArtifactMetrics,
  serializeReleaseReceipt,
  writeReleaseReceipt,
  type ReleaseReceipt,
} from "../scripts/generate-release-receipt.mjs";

const temporaryRoots: string[] = [];
const version = "0.8.3";
const commit = "0123456789abcdef0123456789abcdef01234567";
const otherCommit = "89abcdef0123456789abcdef0123456789abcdef";
const cleanStatusSha256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");

function buildState(overrides: Partial<GitBuildState> = {}): GitBuildState {
  return { commit, clean: true, statusSha256: cleanStatusSha256, ...overrides };
}

function createArtifact(options: {
  readonly bytes?: Buffer;
  readonly before?: GitBuildState;
  readonly after?: GitBuildState;
  readonly fileCount?: number;
} = {}) {
  const bytes = options.bytes ?? Buffer.from("verified vsix fixture\n");
  const root = mkdtempSync(join(tmpdir(), "kt-auto-release-receipt-"));
  temporaryRoots.push(root);
  const outputRoot = join(root, "dist", "vsix");
  mkdirSync(outputRoot, { recursive: true });
  const artifactName = `kt-auto-code-${version}.vsix`;
  const artifact = `dist/vsix/${artifactName}`;
  const artifactPath = join(outputRoot, artifactName);
  writeFileSync(artifactPath, bytes);
  const provenance = createBuildProvenance({
    artifact,
    version,
    artifactBytes: bytes,
    before: options.before ?? buildState(),
    after: options.after ?? buildState(),
  });
  writeFileSync(`${artifactPath}.sha256`, `${provenance.sha256}  ${artifactName}\n`);
  writeBuildProvenance(artifactPath, provenance);
  const evidence = createArtifactVerificationEvidence({
    artifactKind: "code",
    artifact,
    version,
    fileCount: options.fileCount ?? 7,
    bytes: provenance.bytes,
    sha256: provenance.sha256,
    provenance,
  });
  const verifierOutput = `[verify] code VSIX: ${evidence.fileCount} files, ${evidence.bytes} bytes passed\n`
    + serializeArtifactVerificationEvidence(evidence);
  return { root, artifactPath, bytes, provenance, evidence, verifierOutput };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release artifact receipt", () => {
  it("parses exactly one machine-readable verifier evidence line", () => {
    const fixture = createArtifact({ fileCount: 43 });
    expect(parseVerifiedArtifactMetrics(fixture.verifierOutput))
      .toEqual({ fileCount: 43, bytes: fixture.bytes.length });
    expect(() => parseVerifiedArtifactMetrics("[verify] code VSIX: 43 files, 1 bytes passed\n"))
      .toThrow(/exactly one machine-readable/u);
    expect(() => parseVerifiedArtifactMetrics(
      `${fixture.verifierOutput}${serializeArtifactVerificationEvidence(fixture.evidence)}`,
    )).toThrow(/exactly one machine-readable/u);
  });

  it("records metrics only when verified SHA and clean build provenance still match disk", () => {
    const fixture = createArtifact();
    const receipt = createReleaseReceipt({ root: fixture.root, version, commit, verifierOutput: fixture.verifierOutput });
    expect(receipt).toEqual({
      kind: "kt-auto-code.release-receipt",
      schemaVersion: 1,
      version,
      commit,
      artifact: `dist/vsix/kt-auto-code-${version}.vsix`,
      fileCount: 7,
      bytes: fixture.bytes.length,
      sha256: fixture.provenance.sha256,
      verifier: "scripts/verify-extension-artifacts.mjs",
    });
    expect(serializeReleaseReceipt(receipt)).toBe(`${JSON.stringify(receipt, null, 2)}\n`);
  });

  it("rejects a same-size artifact swap after verification and a stale checksum sidecar", () => {
    const swapped = createArtifact({ bytes: Buffer.from("verified bytes A\n") });
    const replacement = Buffer.from("tampered bytes B\n");
    expect(replacement).toHaveLength(swapped.bytes.length);
    writeFileSync(swapped.artifactPath, replacement);
    const replacementSha256 = createHash("sha256").update(replacement).digest("hex");
    writeFileSync(`${swapped.artifactPath}.sha256`, `${replacementSha256}  kt-auto-code-${version}.vsix\n`);
    expect(() => createReleaseReceipt({
      root: swapped.root,
      version,
      commit,
      verifierOutput: swapped.verifierOutput,
    })).toThrow(/SHA-256 changed after verification/u);

    const staleSidecar = createArtifact();
    writeFileSync(`${staleSidecar.artifactPath}.sha256`, `${"f".repeat(64)}  kt-auto-code-${version}.vsix\n`);
    expect(() => createReleaseReceipt({
      root: staleSidecar.root,
      version,
      commit,
      verifierOutput: staleSidecar.verifierOutput,
    })).toThrow(/does not match/u);
  });

  it("rejects stale-commit, dirty and unstable build provenance", () => {
    const stale = createArtifact({
      before: buildState({ commit: otherCommit }),
      after: buildState({ commit: otherCommit }),
    });
    expect(() => createReleaseReceipt({ root: stale.root, version, commit, verifierOutput: stale.verifierOutput }))
      .toThrow(/must equal expected commit/u);

    const dirtyStatusSha256 = createHash("sha256").update(" M package.json\0").digest("hex");
    const dirty = createArtifact({
      before: buildState({ clean: false, statusSha256: dirtyStatusSha256 }),
      after: buildState({ clean: false, statusSha256: dirtyStatusSha256 }),
    });
    expect(dirty.provenance).toMatchObject({ clean: false, stable: true, sourceCleanAndStable: false });
    expect(() => createReleaseReceipt({ root: dirty.root, version, commit, verifierOutput: dirty.verifierOutput }))
      .toThrow(/source must be clean and stable/u);

    const unstable = createArtifact({ after: buildState({ clean: false, statusSha256: "f".repeat(64) }) });
    expect(unstable.provenance).toMatchObject({ clean: false, stable: false, sourceCleanAndStable: false });
    expect(() => createReleaseReceipt({ root: unstable.root, version, commit, verifierOutput: unstable.verifierOutput }))
      .toThrow(/source must be clean and stable/u);
  });

  it("rejects shortened commit IDs and a changed provenance sidecar", () => {
    const fixture = createArtifact();
    expect(() => createReleaseReceipt({
      root: fixture.root,
      version,
      commit: "0123456",
      verifierOutput: fixture.verifierOutput,
    })).toThrow(/Invalid release receipt commit/u);

    const changedStatusSha256 = "f".repeat(64);
    writeBuildProvenance(fixture.artifactPath, {
      ...fixture.provenance,
      before: { ...fixture.provenance.before, clean: false, statusSha256: changedStatusSha256 },
      after: { ...fixture.provenance.after, clean: false, statusSha256: changedStatusSha256 },
      clean: false,
      sourceCleanAndStable: false,
    });
    expect(() => createReleaseReceipt({ root: fixture.root, version, commit, verifierOutput: fixture.verifierOutput }))
      .toThrow(/provenance changed after verification/u);
  });

  it("atomically replaces a deterministic receipt despite a stale legacy PID temp file", () => {
    const fixture = createArtifact();
    const receipt = createReleaseReceipt({ root: fixture.root, version, commit, verifierOutput: fixture.verifierOutput });
    const expectedPath = join(fixture.root, "dist", "vsix", `kt-auto-code-${version}.release-receipt.json`);
    writeFileSync(`${expectedPath}.tmp-${process.pid}`, "stale\n");
    expect(writeReleaseReceipt(fixture.root, receipt)).toBe(expectedPath);
    expect(writeReleaseReceipt(fixture.root, receipt)).toBe(expectedPath);
    expect(readFileSync(expectedPath, "utf8")).toBe(serializeReleaseReceipt(receipt));
  });

  it("validates receipt versions at the exported write boundary", () => {
    const fixture = createArtifact();
    const receipt = createReleaseReceipt({ root: fixture.root, version, commit, verifierOutput: fixture.verifierOutput });
    expect(() => writeReleaseReceipt(fixture.root, {
      ...receipt,
      version: "x/../../../../outside",
    } as ReleaseReceipt)).toThrow(/Invalid release artifact version/u);
  });

  it("keeps the command separate from packaging, version changes and remote publication", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const source = readFileSync(new URL("../scripts/generate-release-receipt.mjs", import.meta.url), "utf8");
    expect(manifest.scripts["release:receipt"]).toBe("node scripts/generate-release-receipt.mjs");
    expect(manifest.scripts["release:check"]).toBe("pnpm verify:ci");
    expect(source).not.toMatch(/\b(?:push|tag|publish|vsce)\b/u);
    expect(source).not.toContain("package-registry-vsix.mjs");
  });
});
