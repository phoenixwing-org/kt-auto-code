#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReleaseVersion,
  parseArtifactVerificationEvidence,
  readBuildProvenance,
  readVerifiedSha256Sidecar,
  sha256Bytes,
  writeTextAtomically,
} from "./release-artifact-provenance.mjs";
import {
  parseReleaseTargetArgs,
  runReleaseTargetPreflight,
} from "./verify-release-target.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export const RELEASE_RECEIPT_USAGE = [
  "Usage:",
  "  pnpm release:receipt --expected-version <version> --expected-commit <full-commit-oid>",
  "",
  "The command re-runs the existing VSIX verifier before writing a local receipt under dist/vsix/.",
].join("\n");

/** 读取现有制品门禁的成功回执；输出格式变化时显式失败，避免记录未经证明的数据。 */
export function parseVerifiedArtifactMetrics(output) {
  const evidence = parseArtifactVerificationEvidence(output);
  return { fileCount: evidence.fileCount, bytes: evidence.bytes };
}

/**
 * 只从已通过 verifier 的本地 VSIX 收集发布身份与制品度量。
 * 调用者必须传入本次 verifier 的完整标准输出，而不是缓存的成功标记。
 */
export function createReleaseReceipt(options) {
  const root = path.resolve(options.root ?? defaultRoot);
  const version = assertReleaseVersion(options.version);
  const commit = options.commit;
  if (!COMMIT_PATTERN.test(commit)) throw new Error(`Invalid release receipt commit: ${commit}`);

  const artifactName = `kt-auto-code-${version}.vsix`;
  const artifact = `dist/vsix/${artifactName}`;
  const artifactPath = path.join(root, "dist", "vsix", artifactName);
  const stat = fs.lstatSync(artifactPath);
  if (!stat.isFile()) throw new Error(`VSIX artifact is not a regular file: ${artifactPath}`);

  const evidence = parseArtifactVerificationEvidence(options.verifierOutput);
  if (evidence.artifact !== artifact) {
    throw new Error(`Verified artifact must equal ${artifact}, got ${evidence.artifact}`);
  }
  if (evidence.version !== version) {
    throw new Error(`Verified artifact version must equal ${version}, got ${evidence.version}`);
  }
  if (evidence.provenance.commit !== commit
      || evidence.provenance.before.commit !== commit
      || evidence.provenance.after.commit !== commit) {
    throw new Error(`Verified build provenance commit must equal expected commit ${commit}`);
  }
  if (!evidence.provenance.clean
      || !evidence.provenance.stable
      || !evidence.provenance.sourceCleanAndStable) {
    throw new Error("Verified build provenance source must be clean and stable");
  }

  const artifactBytes = fs.readFileSync(artifactPath);
  const actualSha256 = sha256Bytes(artifactBytes);
  if (artifactBytes.byteLength !== evidence.bytes) {
    throw new Error(
      `VSIX byte count changed after verification: expected ${evidence.bytes}, got ${artifactBytes.byteLength}`,
    );
  }
  if (actualSha256 !== evidence.sha256) {
    throw new Error(`VSIX SHA-256 changed after verification: expected ${evidence.sha256}, got ${actualSha256}`);
  }
  readVerifiedSha256Sidecar(artifactPath, actualSha256);
  const currentProvenance = readBuildProvenance(artifactPath, {
    artifact,
    version,
    sha256: actualSha256,
    bytes: artifactBytes.byteLength,
    commit,
  });
  if (JSON.stringify(currentProvenance) !== JSON.stringify(evidence.provenance)) {
    throw new Error("Build provenance changed after verification");
  }

  return {
    kind: "kt-auto-code.release-receipt",
    schemaVersion: 1,
    version,
    commit,
    artifact,
    fileCount: evidence.fileCount,
    bytes: evidence.bytes,
    sha256: evidence.sha256,
    verifier: "scripts/verify-extension-artifacts.mjs",
  };
}

export function serializeReleaseReceipt(receipt) {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

/** 写入 Git ignored 的制品目录；临时文件和目标在同一目录，失败不会破坏旧回执。 */
export function writeReleaseReceipt(root, receipt) {
  const version = assertReleaseVersion(receipt?.version);
  const outputPath = path.join(
    path.resolve(root),
    "dist",
    "vsix",
    `kt-auto-code-${version}.release-receipt.json`,
  );
  return writeTextAtomically(outputPath, serializeReleaseReceipt(receipt));
}

function runArtifactVerifier(root) {
  try {
    return execFileSync(process.execPath, [path.join(root, "scripts", "verify-extension-artifacts.mjs")], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = typeof error?.stderr === "string"
      ? error.stderr.trim()
      : Buffer.isBuffer(error?.stderr) ? error.stderr.toString("utf8").trim() : "";
    throw new Error(`VSIX artifact verifier failed${stderr ? `: ${stderr}` : ""}`);
  }
}

export function runReleaseReceipt(options = {}) {
  const root = path.resolve(options.root ?? defaultRoot);
  const argv = options.argv ?? process.argv.slice(2);
  const parsed = parseReleaseTargetArgs(argv);
  if (parsed.help) return { help: true };

  runReleaseTargetPreflight({ root, argv });
  const verifierOutput = runArtifactVerifier(root);
  const receipt = createReleaseReceipt({
    root,
    version: parsed.expectedVersion,
    commit: parsed.expectedCommit,
    verifierOutput,
  });
  const outputPath = writeReleaseReceipt(root, receipt);
  return { help: false, receipt, outputPath, verifierOutput };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const result = runReleaseReceipt();
    if (result.help) {
      process.stdout.write(`${RELEASE_RECEIPT_USAGE}\n`);
    } else {
      process.stdout.write(result.verifierOutput);
      process.stdout.write(`[release:receipt] wrote ${path.relative(defaultRoot, result.outputPath)}\n`);
      process.stdout.write(
        `[release:receipt] version ${result.receipt.version}, commit ${result.receipt.commit}, `
        + `${result.receipt.fileCount} files, ${result.receipt.bytes} bytes, SHA-256 ${result.receipt.sha256}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`[release:receipt] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
