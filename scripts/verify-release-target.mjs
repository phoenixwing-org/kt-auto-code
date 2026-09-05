import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const PNPM_PACKAGE_MANAGER_PATTERN = /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+sha(?:224|256|384|512)\.[0-9A-Za-z+/=_-]+)?$/u;
const LOCAL_WING_ENVIRONMENT = ["PHOENIX_WING_ROOT", "PHOENIX_WING_DEV_MODE"];

export const RELEASE_TARGET_USAGE = [
  "Usage:",
  "  pnpm release:preflight --expected-version <version> --expected-commit <full-commit-oid>",
  "",
  "Both values are required. The commit must be a full 40- or 64-character Git OID.",
].join("\n");

export function parseReleaseTargetArgs(argv) {
  const values = new Map();
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }

    const match = /^(--expected-version|--expected-commit)(?:=(.*))?$/u.exec(argument);
    if (!match) throw new Error(`Unknown release preflight argument: ${argument}`);
    const name = match[1];
    if (values.has(name)) throw new Error(`Release preflight argument was provided more than once: ${name}`);

    let value = match[2];
    if (value === undefined) {
      value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Release preflight argument requires a value: ${name}`);
      }
      index += 1;
    }
    if (value.length === 0) throw new Error(`Release preflight argument requires a value: ${name}`);
    values.set(name, value);
  }

  if (help) {
    if (values.size > 0) throw new Error("--help cannot be combined with release target arguments");
    return { help: true };
  }

  const expectedVersion = values.get("--expected-version");
  const expectedCommit = values.get("--expected-commit");
  if (!expectedVersion || !expectedCommit) {
    throw new Error("Release preflight requires both --expected-version and --expected-commit");
  }
  if (!VERSION_PATTERN.test(expectedVersion)) {
    throw new Error(`--expected-version must be an exact semantic version, got ${expectedVersion}`);
  }
  if (!COMMIT_PATTERN.test(expectedCommit)) {
    throw new Error(`--expected-commit must be a full lowercase Git OID, got ${expectedCommit}`);
  }

  return { help: false, expectedVersion, expectedCommit };
}

export function readFirstChangelogVersion(changelog) {
  const firstHeading = changelog
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .find((line) => /^##(?:\s|$)/u.test(line));
  if (!firstHeading) throw new Error("CHANGELOG.md must contain a level-2 version heading");

  if (/[（(]\s*开发中\s*[）)]/u.test(firstHeading)) {
    throw new Error(`CHANGELOG.md first version is still marked as development: ${firstHeading}`);
  }

  const match = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?=$|[\s（(])/u.exec(firstHeading);
  if (!match) {
    throw new Error(`CHANGELOG.md first level-2 heading must start with an exact version, got ${firstHeading}`);
  }
  return match[1];
}

function runCommand(root, command, args) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  } catch (error) {
    const detail = typeof error?.stderr === "string"
      ? error.stderr.trim()
      : Buffer.isBuffer(error?.stderr) ? error.stderr.toString("utf8").trim() : "";
    throw new Error(`Failed to run ${command} ${args.join(" ")}${detail ? `: ${detail}` : ""}`);
  }
}

export function pnpmVersionInvocation(platform = process.platform, environment = process.env) {
  return platform === "win32"
    ? { command: environment.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "pnpm --version"] }
    : { command: "pnpm", args: ["--version"] };
}

export function inspectReleaseTarget(options = {}) {
  const root = path.resolve(options.root ?? defaultRoot);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const environment = options.environment ?? process.env;
  const pnpmInvocation = pnpmVersionInvocation(options.platform, environment);
  return {
    packageVersion: manifest.version,
    changelogVersion: readFirstChangelogVersion(changelog),
    headCommit: runCommand(root, "git", ["rev-parse", "--verify", "HEAD"]),
    detachedHead: runCommand(root, "git", ["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD",
    worktreeStatus: runCommand(root, "git", [
      "-c", "core.quotePath=false", "status", "--porcelain=v1", "--untracked-files=all",
    ]),
    nodeVersion: options.nodeVersion ?? process.versions.node,
    packageManager: manifest.packageManager,
    pnpmVersion: options.pnpmVersion ?? runCommand(root, pnpmInvocation.command, pnpmInvocation.args),
    leakedEnvironmentVariables: LOCAL_WING_ENVIRONMENT.filter((name) =>
      Object.prototype.hasOwnProperty.call(environment, name)),
  };
}

export function validateReleaseTarget(target, expected) {
  const failures = [];
  if (target.packageVersion !== expected.expectedVersion) {
    failures.push(`package.json version must equal ${expected.expectedVersion}, got ${String(target.packageVersion)}`);
  }
  if (target.changelogVersion !== expected.expectedVersion) {
    failures.push(`CHANGELOG.md first version must equal ${expected.expectedVersion}, got ${target.changelogVersion}`);
  }
  if (target.headCommit !== expected.expectedCommit) {
    failures.push(`current HEAD must equal ${expected.expectedCommit}, got ${target.headCommit}`);
  }
  if (!target.detachedHead) {
    failures.push("Git HEAD must be detached in the dedicated release worktree");
  }
  if (target.worktreeStatus.length > 0) {
    failures.push(`Git worktree must be clean:\n${target.worktreeStatus}`);
  }

  const nodeMajor = /^(\d+)\./u.exec(target.nodeVersion)?.[1];
  if (nodeMajor !== "22") failures.push(`Node major must be 22, got ${target.nodeVersion}`);

  const packageManagerMatch = typeof target.packageManager === "string"
    ? PNPM_PACKAGE_MANAGER_PATTERN.exec(target.packageManager)
    : undefined;
  if (!packageManagerMatch) {
    failures.push(`package.json packageManager must pin an exact pnpm version, got ${String(target.packageManager)}`);
  } else if (target.pnpmVersion !== packageManagerMatch[1]) {
    failures.push(`pnpm must equal packageManager version ${packageManagerMatch[1]}, got ${target.pnpmVersion}`);
  }

  if (target.leakedEnvironmentVariables.length > 0) {
    failures.push(`local Wing environment must be absent: ${target.leakedEnvironmentVariables.join(", ")}`);
  }
  if (failures.length > 0) throw new Error(`Release target preflight failed:\n- ${failures.join("\n- ")}`);
}

export function runReleaseTargetPreflight(options = {}) {
  const parsed = parseReleaseTargetArgs(options.argv ?? process.argv.slice(2));
  if (parsed.help) return { help: true };

  const target = inspectReleaseTarget(options);
  validateReleaseTarget(target, parsed);
  return { help: false, target, expectedVersion: parsed.expectedVersion, expectedCommit: parsed.expectedCommit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const result = runReleaseTargetPreflight();
    if (result.help) {
      process.stdout.write(`${RELEASE_TARGET_USAGE}\n`);
    } else {
      process.stdout.write(
        `[release:preflight] version ${result.expectedVersion}, commit ${result.expectedCommit}, `
        + `Node ${result.target.nodeVersion}, pnpm ${result.target.pnpmVersion}, detached clean worktree passed\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`[release:preflight] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
