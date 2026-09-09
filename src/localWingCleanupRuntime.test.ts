import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Repository verification is intentionally implemented as plain ESM.
import { RUN_CLEANUP_RUNTIME_EXPORTS, verifyLocalWingCleanupRuntime, verifyRunCleanupBundleImplementations } from "../scripts/verify-local-wing-cleanup-runtime.mjs";

const roots: string[] = [];
const cleanupExports: readonly string[] = RUN_CLEANUP_RUNTIME_EXPORTS;

function createWingRuntime(exports: readonly string[]): string {
  const root = mkdtempSync(resolve(tmpdir(), "kt-auto-local-wing-cleanup-"));
  roots.push(root);
  const packageRoot = resolve(root, "packages/run-node");
  mkdirSync(resolve(packageRoot, "dist"), { recursive: true });
  writeFileSync(resolve(packageRoot, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(resolve(packageRoot, "dist/index.js"), exports.map((name) => (
    `export function ${name}() { throw new Error("cleanup verifier must not invoke providers"); }`
  )).join("\n"));
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local Wing Run cleanup runtime gate", () => {
  it("accepts all four function exports without invoking any cleanup provider", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = createWingRuntime(cleanupExports);

    expect(await verifyLocalWingCleanupRuntime(root)).toEqual({
      exports: cleanupExports,
    });
  });

  it("fails closed when the freshly built run-node entry omits one export", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = createWingRuntime(cleanupExports.slice(0, -1));

    await expect(verifyLocalWingCleanupRuntime(root)).rejects.toThrow(
      "pnwExecuteGitUntrackedCleanup",
    );
  });

  it("requires bundled function declarations and rejects call-site strings alone", () => {
    const callsOnly = cleanupExports.map((name) => `KtcWing.${name}();`).join("\n");
    expect(() => verifyRunCleanupBundleImplementations(callsOnly, "fixture VSIX")).toThrow(
      "缺少 Run cleanup 真实实现",
    );
    const implementations = cleanupExports
      .map((name) => `async function ${name}() {}`)
      .join("\n");
    expect(verifyRunCleanupBundleImplementations(implementations, "fixture VSIX"))
      .toEqual(cleanupExports);
  });

  it("is wired after Wing build and before the extension build, and the artifact verifier calls the implementation gate", () => {
    const root = resolve(import.meta.dirname, "..");
    const launcher = readFileSync(resolve(root, "scripts/develop-local-wing.mjs"), "utf8");
    const verifier = readFileSync(resolve(root, "scripts/verify-extension-artifacts.mjs"), "utf8");
    const wingBuild = launcher.indexOf('...filters, "run", "build"');
    const runtimeGate = launcher.indexOf("verify-local-wing-cleanup-runtime.mjs");
    const extensionBuild = launcher.indexOf('run(pnpm, ["ext:build"]');

    expect(wingBuild).toBeGreaterThan(0);
    expect(runtimeGate).toBeGreaterThan(wingBuild);
    expect(runtimeGate).toBeLessThan(extensionBuild);
    expect(verifier).toContain("verifyRunCleanupBundleImplementations(bundle");
  });
});
