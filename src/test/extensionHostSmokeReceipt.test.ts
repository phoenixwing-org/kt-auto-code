import { describe, expect, it } from "vitest";
import { validateExtensionHostSmokeReceipt } from "../../scripts/extension-host-smoke-receipt.mjs";

const existingFlows = [
  "open",
  "preview",
  "conflict",
  "apply",
  "saveReload",
  "rollback",
  "gitBlock",
  "gitEmptyState",
  "runBlock",
  "projectRenameAnalysis",
  "projectRenameCancel",
] as const;

const newFlows = [
  "preflightDiskCache",
  "sourcePlanInvalidation",
  "jsonRecreateGuard",
  "packageIncludesService",
  "codegenDocumentTabs",
] as const;

const packageIncludesEvidence = [
  "fixtureIsolated",
  "coreIgnoreApplied",
  "targetIgnoreApplied",
  "previewReadOnly",
  "staleFingerprintRejected",
  "staleRejectPreservedAllFiles",
  "appliedExpectedChanges",
  "zeroHitRescan",
  "ignoredFilesPreserved",
] as const;

const persistenceEvidence = [
  "cacheReused",
  "cachePathIsolated",
  "staleGeneratorRejected",
  "corruptCacheRebuilt",
  "sourceChangeRejected",
  "sourceDeletionRejected",
  "indexAdvancedAfterChange",
  "sourceRestored",
  "missingSaveRejected",
  "recreated",
  "reappearedFilePreserved",
] as const;

function createReceipt() {
  return {
    kind: "kt.auto-code.extension-host-smoke",
    schemaVersion: 1,
    extension: { id: "kuntai.kt-auto-code", active: true },
    cadExtension: { id: "kuntai.kt-auto-cad", active: true },
    flows: Object.fromEntries([...existingFlows, ...newFlows].map((flow) => [flow, true])),
    evidence: {
      projectRenameCancel: {
        scannedFilesBeforeCancel: 8,
        signalAborted: true,
        cancelledWithoutReport: true,
        restartReportId: 2,
        fixtureFileCount: 360,
        fixtureUnchanged: true,
      },
      codegenPersistence: Object.fromEntries(persistenceEvidence.map((field) => [field, true])),
      codegenDocumentTabs: { filenameOnly: true, sameNamesNotDisambiguated: true, uriReuse: true, isolatedStateUpdate: true },
      packageIncludes: {
        ...Object.fromEntries(packageIncludesEvidence.map((field) => [field, true])),
        previewRowCount: 3,
        changedFiles: 2,
        changedIncludes: 3,
        rescanRowCount: 0,
      } as Record<string, boolean | number>,
      commands: ["ktAutoCode.git.open", "ktAutoCode.run.open"],
    },
  };
}

describe("Extension Host smoke receipt gate", () => {
  it.each(["filenameOnly", "sameNamesNotDisambiguated", "uriReuse", "isolatedStateUpdate"])("requires native JSON tab evidence: %s", (field) => {
    const receipt = createReceipt();
    Object.assign(receipt.evidence.codegenDocumentTabs, { [field]: false });
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(`evidence.codegenDocumentTabs.${field} must be true`);
  });
  it("accepts a complete schemaVersion 1 Auto receipt", () => {
    expect(validateExtensionHostSmokeReceipt(createReceipt())).toEqual([]);
  });

  it.each([
    ["kind", "other", "kind must be kt.auto-code.extension-host-smoke"],
    ["schemaVersion", 2, "schemaVersion must be 1"],
  ] as const)("rejects an invalid receipt identity field: %s", (field, value, issue) => {
    const receipt = createReceipt();
    Object.assign(receipt, { [field]: value });
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(issue);
  });

  it("requires the Auto extension identity and activation", () => {
    const receipt = createReceipt();
    receipt.extension = { id: "kuntai.other", active: false };
    expect(validateExtensionHostSmokeReceipt(receipt)).toEqual(expect.arrayContaining([
      "extension.id must be kuntai.kt-auto-code",
      "extension.active must be true",
    ]));
  });

  it.each(existingFlows)("rejects a missing existing flow: %s", (flow) => {
    const receipt = createReceipt();
    delete receipt.flows[flow];
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(`flows.${flow} must be true`);
  });

  it.each(newFlows)("requires the new stage flow: %s", (flow) => {
    const receipt = createReceipt();
    receipt.flows[flow] = false;
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(`flows.${flow} must be true`);
  });

  it.each(persistenceEvidence)("requires Codegen persistence evidence: %s", (field) => {
    const receipt = createReceipt();
    receipt.evidence.codegenPersistence[field] = false;
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(
      `evidence.codegenPersistence.${field} must be true`,
    );
  });

  it.each([
    ["scannedFilesBeforeCancel", 0, "must be a positive integer"],
    ["signalAborted", false, "must be true"],
    ["cancelledWithoutReport", false, "must be true"],
    ["restartReportId", 3, "must be 2"],
    ["fixtureFileCount", 359, "must be 360"],
    ["fixtureUnchanged", false, "must be true"],
  ] as const)("rejects invalid project rename cancellation evidence: %s", (field, value, message) => {
    const receipt = createReceipt();
    Object.assign(receipt.evidence.projectRenameCancel, { [field]: value });
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(
      `evidence.projectRenameCancel.${field} ${message}`,
    );
  });

  it.each(packageIncludesEvidence)("requires package include service evidence: %s", (field) => {
    for (const value of [false, undefined]) {
      const receipt = createReceipt();
      if (value === undefined) delete receipt.evidence.packageIncludes[field];
      else receipt.evidence.packageIncludes[field] = value;
      expect(validateExtensionHostSmokeReceipt(receipt)).toContain(
        `evidence.packageIncludes.${field} must be true`,
      );
    }
  });

  it.each([
    ["previewRowCount", 3], ["changedFiles", 2], ["changedIncludes", 3], ["rescanRowCount", 0],
  ] as const)("requires the actual package include result count: %s", (field, count) => {
    const receipt = createReceipt();
    receipt.evidence.packageIncludes[field] = count + 1;
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(
      `evidence.packageIncludes.${field} must be ${count}`,
    );
  });

  it("does not accept a declared package include flow without its service evidence", () => {
    const receipt = createReceipt();
    Reflect.deleteProperty(receipt.evidence, "packageIncludes");
    expect(validateExtensionHostSmokeReceipt(receipt)).toContain(
      "evidence.packageIncludes.coreIgnoreApplied must be true",
    );
    expect(validateExtensionHostSmokeReceipt(receipt, { requireCad: true })).toContain(
      "evidence.packageIncludes.zeroHitRescan must be true",
    );
  });

  it.each(["ktAutoCode.git.open", "ktAutoCode.run.open"])(
    "retains the required command evidence: %s",
    (command) => {
      const receipt = createReceipt();
      receipt.evidence.commands = receipt.evidence.commands.filter((candidate) => candidate !== command);
      expect(validateExtensionHostSmokeReceipt(receipt)).toContain(
        `evidence.commands must include ${command}`,
      );
    },
  );

  it("adds CAD identity and activation checks only for the cross-repository gate", () => {
    const wrongId = createReceipt();
    wrongId.cadExtension.id = "kuntai.other";
    expect(validateExtensionHostSmokeReceipt(wrongId)).toEqual([]);
    expect(validateExtensionHostSmokeReceipt(wrongId, { requireCad: true })).toContain(
      "cadExtension.id must be kuntai.kt-auto-cad",
    );

    const inactive = createReceipt();
    inactive.cadExtension.active = false;
    expect(validateExtensionHostSmokeReceipt(inactive, { requireCad: true })).toContain(
      "cadExtension.active must be true",
    );
  });

  it("does not let the cross-repository gate bypass the complete Auto receipt", () => {
    const receipt = createReceipt();
    delete receipt.flows.rollback;
    expect(validateExtensionHostSmokeReceipt(receipt, { requireCad: true })).toContain(
      "flows.rollback must be true",
    );
  });

  it("rejects a malformed command collection without throwing internally", () => {
    const receipt = createReceipt();
    receipt.evidence.commands = undefined as unknown as string[];
    expect(validateExtensionHostSmokeReceipt(receipt)).toEqual(expect.arrayContaining([
      "evidence.commands must include ktAutoCode.git.open",
      "evidence.commands must include ktAutoCode.run.open",
    ]));
  });
});
