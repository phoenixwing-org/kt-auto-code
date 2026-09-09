const REQUIRED_AUTO_FLOWS = Object.freeze([
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
  // schemaVersion 1 remains stable, but these receipts are now mandatory for this gate.
  "preflightDiskCache",
  "sourcePlanInvalidation",
  "jsonRecreateGuard",
  "packageIncludesService",
]);

const REQUIRED_CODEGEN_PERSISTENCE_EVIDENCE = Object.freeze([
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
]);

const REQUIRED_COMMANDS = Object.freeze([
  "ktAutoCode.git.open",
  "ktAutoCode.run.open",
]);

const REQUIRED_PACKAGE_INCLUDES_EVIDENCE = Object.freeze([
  "fixtureIsolated",
  "coreIgnoreApplied",
  "targetIgnoreApplied",
  "previewReadOnly",
  "staleFingerprintRejected",
  "staleRejectPreservedAllFiles",
  "appliedExpectedChanges",
  "zeroHitRescan",
  "ignoredFilesPreserved",
]);

/**
 * Return every failed receipt invariant without performing I/O.
 *
 * The receipt schema remains version 1. The newly added Codegen persistence
 * and package include fields are stage acceptance gates, not a wire-format version change.
 */
export function validateExtensionHostSmokeReceipt(receipt, options = {}) {
  const issues = [];
  const requireCad = options.requireCad === true;

  if (receipt?.kind !== "kt.auto-code.extension-host-smoke") {
    issues.push("kind must be kt.auto-code.extension-host-smoke");
  }
  if (receipt?.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (receipt?.extension?.id !== "kuntai.kt-auto-code") {
    issues.push("extension.id must be kuntai.kt-auto-code");
  }
  if (receipt?.extension?.active !== true) issues.push("extension.active must be true");

  for (const flow of REQUIRED_AUTO_FLOWS) {
    if (receipt?.flows?.[flow] !== true) issues.push(`flows.${flow} must be true`);
  }

  const cancel = receipt?.evidence?.projectRenameCancel;
  if (!Number.isInteger(cancel?.scannedFilesBeforeCancel) || cancel.scannedFilesBeforeCancel < 1) {
    issues.push("evidence.projectRenameCancel.scannedFilesBeforeCancel must be a positive integer");
  }
  if (cancel?.signalAborted !== true) {
    issues.push("evidence.projectRenameCancel.signalAborted must be true");
  }
  if (cancel?.cancelledWithoutReport !== true) {
    issues.push("evidence.projectRenameCancel.cancelledWithoutReport must be true");
  }
  if (cancel?.restartReportId !== 2) {
    issues.push("evidence.projectRenameCancel.restartReportId must be 2");
  }
  if (cancel?.fixtureFileCount !== 360) {
    issues.push("evidence.projectRenameCancel.fixtureFileCount must be 360");
  }
  if (cancel?.fixtureUnchanged !== true) {
    issues.push("evidence.projectRenameCancel.fixtureUnchanged must be true");
  }

  const codegenPersistence = receipt?.evidence?.codegenPersistence;
  for (const field of REQUIRED_CODEGEN_PERSISTENCE_EVIDENCE) {
    if (codegenPersistence?.[field] !== true) {
      issues.push(`evidence.codegenPersistence.${field} must be true`);
    }
  }

  const packageIncludes = receipt?.evidence?.packageIncludes;
  for (const field of REQUIRED_PACKAGE_INCLUDES_EVIDENCE) {
    if (packageIncludes?.[field] !== true) {
      issues.push(`evidence.packageIncludes.${field} must be true`);
    }
  }
  for (const [field, count] of Object.entries({ previewRowCount: 3, changedFiles: 2, changedIncludes: 3, rescanRowCount: 0 })) {
    if (packageIncludes?.[field] !== count) {
      issues.push(`evidence.packageIncludes.${field} must be ${count}`);
    }
  }

  const commands = receipt?.evidence?.commands;
  for (const command of REQUIRED_COMMANDS) {
    if (!Array.isArray(commands) || !commands.includes(command)) {
      issues.push(`evidence.commands must include ${command}`);
    }
  }

  if (requireCad) {
    if (receipt?.cadExtension?.id !== "kuntai.kt-auto-cad") {
      issues.push("cadExtension.id must be kuntai.kt-auto-cad");
    }
    if (receipt?.cadExtension?.active !== true) {
      issues.push("cadExtension.active must be true");
    }
  }

  return issues;
}
