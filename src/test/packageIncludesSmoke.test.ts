import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ktcRunPackageIncludesSmoke } from "./packageIncludesSmoke.js";

const ownedRoots: string[] = [];

async function workspace(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  ownedRoots.push(root);
  const path = join(root, "workspace");
  await mkdir(path);
  return path;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of ownedRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("isolated package include service smoke", () => {
  it.each(["ktc-eh-", "ktc-cad-eh-"])("executes the real service in a %s launcher fixture", async (prefix) => {
    vi.stubEnv("KTC_EXTENSION_HOST_SMOKE", "1");
    const path = await workspace(prefix);
    const evidence = await ktcRunPackageIncludesSmoke(path);
    expect(evidence).toEqual({
      fixtureIsolated: true,
      coreIgnoreApplied: true,
      targetIgnoreApplied: true,
      previewReadOnly: true,
      staleFingerprintRejected: true,
      staleRejectPreservedAllFiles: true,
      appliedExpectedChanges: true,
      zeroHitRescan: true,
      ignoredFilesPreserved: true,
      previewRowCount: 3,
      changedFiles: 2,
      changedIncludes: 3,
      rescanRowCount: 0,
    });
    expect(await readdir(path)).toEqual([expect.stringMatching(/^package-includes-smoke-/u)]);
  });

  it("refuses to write without the isolated smoke environment", async () => {
    vi.stubEnv("KTC_EXTENSION_HOST_SMOKE", "0");
    const path = await workspace("ktc-eh-");
    await expect(ktcRunPackageIncludesSmoke(path)).rejects.toThrow("requires the isolated launcher");
    expect(await readdir(path)).toEqual([]);
  });

  it("refuses a user workspace even when the smoke environment is set", async () => {
    vi.stubEnv("KTC_EXTENSION_HOST_SMOKE", "1");
    const path = await workspace("ktc-package-user-");
    await expect(ktcRunPackageIncludesSmoke(path)).rejects.toThrow("must not run in a user workspace");
    expect(await readdir(path)).toEqual([]);
  });
});
