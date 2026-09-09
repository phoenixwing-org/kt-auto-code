import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  ktcApplyPackageIncludes,
  ktcPreviewPackageIncludes,
} from "../tools/codeAssistant/packageIncludeService.js";

export interface KtcPackageIncludesSmokeEvidence {
  readonly fixtureIsolated: boolean;
  readonly coreIgnoreApplied: boolean;
  readonly targetIgnoreApplied: boolean;
  readonly previewReadOnly: boolean;
  readonly staleFingerprintRejected: boolean;
  readonly staleRejectPreservedAllFiles: boolean;
  readonly appliedExpectedChanges: boolean;
  readonly zeroHitRescan: boolean;
  readonly ignoredFilesPreserved: boolean;
  readonly previewRowCount: number;
  readonly changedFiles: number;
  readonly changedIncludes: number;
  readonly rescanRowCount: number;
}

/** Real service I/O only inside a fresh fixture owned by the isolated EH launcher. */
export async function ktcRunPackageIncludesSmoke(workspacePath: string): Promise<KtcPackageIncludesSmokeEvidence> {
  assert.equal(process.env.KTC_EXTENSION_HOST_SMOKE, "1", "package include smoke requires the isolated launcher");
  const workspace = await realpath(workspacePath);
  assert.equal(basename(workspace), "workspace", "smoke workspace must be the launcher's fixture workspace");
  assert.match(basename(dirname(workspace)), /^ktc-(?:cad-)?eh-[\w-]+$/u,
    "package include smoke must not run in a user workspace");
  const inside = (root: string, path: string): string => {
    const absolute = resolve(path);
    const suffix = relative(root, absolute);
    assert.ok(suffix && !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`),
      "every smoke file must remain inside its disposable fixture");
    return absolute;
  };
  const fixtureRoot = inside(workspace, await mkdtemp(join(workspace, "package-includes-smoke-")));
  assert.equal(await realpath(fixtureRoot), fixtureRoot, "fixture root must not be a symlink");
  const file = (...segments: string[]) => inside(fixtureRoot, join(fixtureRoot, ...segments));
  const put = async (path: string, content: string) => {
    inside(fixtureRoot, path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  };
  const includeRoot = file("package", "include");
  const targetRoot = file("project");
  const sourceA = file("project", "src", "First.cpp");
  const sourceB = file("project", "src", "Second.hpp");
  const beforeA = '#include "KtString.h"\n#include "KtVector.hpp"\n';
  const beforeB = '#include "KtString.h"\n#include "Ghost.h"\n';
  const sentinels = [
    { path: file("package", "include", "KtCore", "source", "KtString.h"), text: "#pragma once\n// live string\n" },
    { path: file("package", "include", "KtCore", "source", "KtVector.hpp"), text: "#pragma once\n// live vector\n" },
    // Without core Ignore this creates a real collision and suppresses KtString matches.
    { path: file("package", "include", "ignored-package", "KtShadow", "source", "KtString.h"), text: "#pragma once\n// ignored collision\n" },
    { path: file("package", "include", "ignored-package", "KtGhost", "source", "Ghost.h"), text: "#pragma once\n// ignored mapping\n" },
    { path: file("project", "ignored-project", "Hidden.cpp"), text: '#include "KtVector.hpp"\n// user ignored\n' },
    { path: file("project", "build", "Generated.cpp"), text: '#include "KtString.h"\n// built-in ignored\n' },
    { path: file("project", ".git", "Metadata.cpp"), text: '#include "KtString.h"\n// safety ignored\n' },
  ];
  for (const sentinel of sentinels) await put(sentinel.path, sentinel.text);
  await put(sourceA, beforeA);
  await put(sourceB, beforeB);

  const unfiltered = await ktcPreviewPackageIncludes({ coreIncludeDirectory: includeRoot, targetDirectory: targetRoot });
  assert.ok(unfiltered.preview.collisions.some(collision => collision.fileName === "KtString.h"),
    "the ignored mapping fixture must actually cause a collision without core Ignore");
  assert.ok(unfiltered.preview.rows.some(row => row.relativePath === "ignored-project/Hidden.cpp"),
    "the ignored source fixture must actually match without target Ignore");

  const preview = () => ktcPreviewPackageIncludes({
    coreIncludeDirectory: includeRoot,
    targetDirectory: targetRoot,
    coreIgnorePatterns: ["ignored-package/"],
    targetIgnorePatterns: ["ignored-project/"],
  });
  const session = await preview();
  assert.equal(session.preview.headerCount, 2);
  assert.deepEqual(session.preview.collisions, []);
  assert.equal(session.preview.scannedFileCount, 2);
  assert.equal(session.preview.ignoredDirectoryCount, 4);
  assert.equal(session.preview.rows.length, 3);
  assert.deepEqual(session.preview.rows.map(row => [row.relativePath, row.line, row.newValue]), [
    ["src/First.cpp", 1, "#include <KtCore/KtString.h>"],
    ["src/First.cpp", 2, "#include <KtCore/KtVector.hpp>"],
    ["src/Second.hpp", 1, "#include <KtCore/KtString.h>"],
  ]);
  for (const entry of session.files) inside(fixtureRoot, entry.filePath);
  assert.equal(await readFile(sourceA, "utf8"), beforeA, "preview must not write sources");
  assert.equal(await readFile(sourceB, "utf8"), beforeB, "preview must not write sources");

  // Change the second file: the pre-write fingerprint pass must preserve the first too.
  const externalB = `// external edit after preview\n${beforeB}`;
  await put(sourceB, externalB);
  await assert.rejects(ktcApplyPackageIncludes(session), /预览后文件已改变/u);
  assert.equal(await readFile(sourceA, "utf8"), beforeA, "a stale file must prevent earlier files from being written");
  assert.equal(await readFile(sourceB, "utf8"), externalB, "rejecting a stale preview must preserve external edits");

  const fresh = await preview();
  assert.equal(fresh.preview.rows.length, 3);
  for (const entry of fresh.files) inside(fixtureRoot, entry.filePath);
  const applied = await ktcApplyPackageIncludes(fresh);
  assert.deepEqual(applied, { changedFiles: 2, changedIncludes: 3 });
  assert.equal(await readFile(sourceA, "utf8"), "#include <KtCore/KtString.h>\n#include <KtCore/KtVector.hpp>\n");
  assert.equal(await readFile(sourceB, "utf8"), '// external edit after preview\n#include <KtCore/KtString.h>\n#include "Ghost.h"\n');
  const rescanned = await preview();
  assert.equal(rescanned.preview.rows.length, 0);
  assert.equal(rescanned.files.length, 0);
  assert.equal(rescanned.preview.scannedFileCount, 2);
  for (const sentinel of sentinels) {
    assert.deepEqual(await readFile(sentinel.path), Buffer.from(sentinel.text, "utf8"),
      `ignored files and header sources must be byte-for-byte preserved: ${relative(fixtureRoot, sentinel.path)}`);
  }

  // The launcher owns cleanup, including KTC_KEEP_EXTENSION_HOST_SMOKE failure evidence.
  // Return evidence only after every real-service assertion above has passed.
  return {
    fixtureIsolated: true,
    coreIgnoreApplied: true,
    targetIgnoreApplied: true,
    previewReadOnly: true,
    staleFingerprintRejected: true,
    staleRejectPreservedAllFiles: true,
    appliedExpectedChanges: true,
    zeroHitRescan: true,
    ignoredFilesPreserved: true,
    previewRowCount: session.preview.rows.length,
    changedFiles: applied.changedFiles,
    changedIncludes: applied.changedIncludes,
    rescanRowCount: rescanned.preview.rows.length,
  };
}
