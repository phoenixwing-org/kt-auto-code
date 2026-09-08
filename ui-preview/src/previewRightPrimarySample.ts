import type { KtCodegenPrimaryUiModel } from "@phoenix-wing/kt-codegen/ui";
import rawSample from "../fixtures/right-primary.sample.json";
import {
  normalizePreviewCompanionModel,
  type PreviewCompanionModel,
} from "./previewCompanionModel.js";

export interface PreviewRightPrimarySample {
  readonly schemaVersion: 1;
  readonly companions: Readonly<{
    packageIncludes: PreviewCompanionModel;
    projectRename: PreviewCompanionModel;
  }>;
  readonly projectRenameHistory: Readonly<{
    selectedId: string;
    items: readonly Readonly<{ id: string; label: string; group: string }>[];
  }>;
  readonly projectRenameOverview: readonly Readonly<{ label: string; value: string }>[];
  readonly projectRenameRootSuggestion: Readonly<{ source: string; target: string; enabled: boolean }>;
  readonly projectRenameProfiles: Readonly<{
    selectedId: string;
    profileName: string;
    items: readonly Readonly<{ id: string; label: string }>[];
  }>;
  readonly codegen: KtCodegenPrimaryUiModel;
}

export function parsePreviewRightPrimarySample(value: unknown): PreviewRightPrimarySample {
  const document = requireRecord(value, "Right Primary sample");
  if (document.schemaVersion !== 1) throw new Error("Right Primary sample schemaVersion must be 1");
  const companions = requireRecord(document.companions, "Right Primary companions");
  const history = requireRecord(document.projectRenameHistory, "Project rename history");
  if (typeof history.selectedId !== "string" || !Array.isArray(history.items)) {
    throw new Error("Project rename history contract is invalid");
  }
  const historyIds = new Set<string>();
  const historyItems = Object.freeze(history.items.map((candidate, index) => {
    const item = requireRecord(candidate, `Project rename history item #${index + 1}`);
    const id = requireText(item.id, `Project rename history item #${index + 1} id`);
    if (historyIds.has(id)) throw new Error(`Project rename history contains duplicate id: ${id}`);
    historyIds.add(id);
    return Object.freeze({
      id,
      label: requireText(item.label, `Project rename history item #${index + 1} label`),
      group: requireText(item.group, `Project rename history item #${index + 1} group`),
    });
  }));
  if (history.selectedId && !historyIds.has(history.selectedId)) {
    throw new Error("Project rename history selectedId is missing from items");
  }
  if (!Array.isArray(document.projectRenameOverview)) {
    throw new Error("Project rename overview contract is invalid");
  }
  const overviewItems = Object.freeze(document.projectRenameOverview.map((candidate, index) => {
    const item = requireRecord(candidate, `Project rename overview item #${index + 1}`);
    return Object.freeze({
      label: requireText(item.label, `Project rename overview item #${index + 1} label`),
      value: requireText(item.value, `Project rename overview item #${index + 1} value`),
    });
  }));
  const rootSuggestion = requireRecord(document.projectRenameRootSuggestion, "Project rename root suggestion");
  if (typeof rootSuggestion.enabled !== "boolean") {
    throw new Error("Project rename root suggestion enabled must be a boolean");
  }
  const profiles = requireRecord(document.projectRenameProfiles, "Project rename profiles");
  if (typeof profiles.selectedId !== "string" || typeof profiles.profileName !== "string" || !Array.isArray(profiles.items)) {
    throw new Error("Project rename profiles contract is invalid");
  }
  const profileIds = new Set<string>();
  const profileItems = Object.freeze(profiles.items.map((candidate, index) => {
    const item = requireRecord(candidate, `Project rename profile #${index + 1}`);
    const id = requireText(item.id, `Project rename profile #${index + 1} id`);
    if (profileIds.has(id)) throw new Error(`Project rename profiles contain duplicate id: ${id}`);
    profileIds.add(id);
    return Object.freeze({ id, label: requireText(item.label, `Project rename profile #${index + 1} label`) });
  }));
  if (profiles.selectedId && !profileIds.has(profiles.selectedId)) {
    throw new Error("Project rename profiles selectedId is missing from items");
  }
  const codegen = requireRecord(document.codegen, "Right Primary Codegen model");
  if (codegen.kind !== "kt.codegen.primary-ui-model" || codegen.schemaVersion !== 1) {
    throw new Error("Right Primary Codegen model contract is invalid");
  }
  if (!Array.isArray(codegen.documents) || !Array.isArray(codegen.candidates) || !Array.isArray(codegen.reports)) {
    throw new Error("Right Primary Codegen model lists are invalid");
  }
  return Object.freeze({
    schemaVersion: 1,
    companions: Object.freeze({
      packageIncludes: normalizePreviewCompanionModel(companions.packageIncludes),
      projectRename: normalizePreviewCompanionModel(companions.projectRename),
    }),
    projectRenameHistory: Object.freeze({
      selectedId: history.selectedId,
      items: historyItems,
    }),
    projectRenameOverview: overviewItems,
    projectRenameRootSuggestion: Object.freeze({
      source: requireText(rootSuggestion.source, "Project rename root suggestion source"),
      target: requireText(rootSuggestion.target, "Project rename root suggestion target"),
      enabled: rootSuggestion.enabled,
    }),
    projectRenameProfiles: Object.freeze({
      selectedId: profiles.selectedId,
      profileName: profiles.profileName.trim(),
      items: profileItems,
    }),
    codegen: Object.freeze(codegen) as unknown as KtCodegenPrimaryUiModel,
  });
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${context} must be a non-empty string`);
  return value.trim();
}

export const PREVIEW_RIGHT_PRIMARY_SAMPLE = parsePreviewRightPrimarySample(rawSample);
