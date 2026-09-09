import {
  PREVIEW_TOOL_CATALOG,
  PREVIEW_TOOL_CATALOG_BY_ID,
  previewToolIdsFromNavigation,
  PREVIEW_TOOL_NAVIGATION,
} from "./previewToolCatalog.js";

export const PREVIEW_STATE_SCHEMA_VERSION = 1 as const;
export const PREVIEW_STATE_STORAGE_KEY = "ktAutoCode.uiPreview.state.v1";

export type PreviewTheme = "dark" | "light" | "hc";
export type PreviewPrimaryWidth = "narrow" | "standard" | "wide" | "custom";
export interface PreviewPersistedState {
  readonly theme: PreviewTheme;
  readonly primaryWidth: PreviewPrimaryWidth;
  readonly customPrimaryWidth: number | null;
  readonly primaryVisible: boolean;
  readonly directoryVisible: boolean;
  readonly directoryIndex: number;
  readonly ribbonExpanded: boolean;
  readonly navigatorExpanded: boolean;
  readonly navigatorShowLabels: boolean;
  readonly activeGroupId: string;
  readonly activeToolId: string;
  readonly activeNavigatorToolId: string;
  readonly activeEditorId: string | null;
  readonly activeItemId: string;
  readonly openToolIds: readonly string[];
  readonly mruItemIds: readonly string[];
  readonly surfaceMruToolIds: readonly string[];
  readonly outputVisible: boolean;
}

interface PreviewStateEnvelope {
  readonly schemaVersion: typeof PREVIEW_STATE_SCHEMA_VERSION;
  readonly state: PreviewPersistedState;
}

export interface PreviewStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PreviewStateStore {
  readonly state: PreviewPersistedState;
  load(): PreviewPersistedState;
  patch(nextState: Partial<PreviewPersistedState>): PreviewPersistedState;
  save(nextState?: Partial<PreviewPersistedState>): PreviewPersistedState;
  reset(): PreviewPersistedState;
}

export interface PreviewStateStoreOptions {
  readonly storage?: PreviewStateStorage;
  readonly storageKey?: string;
}

const THEMES = new Set<PreviewTheme>(["dark", "light", "hc"]);
const PRIMARY_WIDTHS = new Set<PreviewPrimaryWidth>(["narrow", "standard", "wide", "custom"]);

// The preview persists identifiers only. Keeping the catalog explicit prevents an
// accidental path, label, scan result, or other business payload entering storage.
const GROUP_IDS = new Set([
  "codeAssistant",
  "git",
  "run",
  "replace",
  "codegen",
  "ignoreSettings",
  "environmentSettings",
]);
const TOOL_IDS = new Set(PREVIEW_TOOL_CATALOG.map(({ toolId }) => toolId));
const RIGHT_TOOL_IDS = new Set(PREVIEW_TOOL_CATALOG
  .filter(({ surfaces }) => Boolean(surfaces.right))
  .map(({ toolId }) => toolId));
const NAVIGATOR_TOOL_IDS = new Set(previewToolIdsFromNavigation(PREVIEW_TOOL_NAVIGATION));
const ITEM_IDS = new Set([...TOOL_IDS].map((toolId) => `tool:${toolId}`));

const DEFAULT_STATE: PreviewPersistedState = Object.freeze({
  theme: "dark",
  primaryWidth: "standard",
  customPrimaryWidth: null,
  primaryVisible: true,
  directoryVisible: true,
  directoryIndex: 0,
  ribbonExpanded: true,
  navigatorExpanded: true,
  navigatorShowLabels: true,
  activeGroupId: "codeAssistant",
  activeToolId: "packageIncludes",
  activeNavigatorToolId: "packageIncludes",
  activeEditorId: "packageIncludes",
  activeItemId: "tool:packageIncludes",
  openToolIds: Object.freeze(["projectRename", "packageIncludes"]),
  mruItemIds: Object.freeze(["tool:projectRename", "tool:packageIncludes"]),
  surfaceMruToolIds: Object.freeze(["projectRename", "packageIncludes"]),
  outputVisible: true,
});

export function defaultPreviewPersistedState(): PreviewPersistedState {
  return cloneState(DEFAULT_STATE);
}

export function normalizePreviewPersistedState(value: unknown): PreviewPersistedState {
  const input = isRecord(value) ? value : {};
  const customPrimaryWidth = normalizeCustomWidth(input.customPrimaryWidth);
  const requestedPrimaryWidth = fromSet(input.primaryWidth, PRIMARY_WIDTHS, DEFAULT_STATE.primaryWidth);
  const primaryWidth = requestedPrimaryWidth === "custom" && customPrimaryWidth === null
    ? DEFAULT_STATE.primaryWidth
    : requestedPrimaryWidth;
  const openToolIds = normalizeIdList(input.openToolIds, TOOL_IDS, DEFAULT_STATE.openToolIds);
  const openToolIdSet = new Set(openToolIds);
  let mruItemIds = completeItemOrder(
    normalizeItemIdList(input.mruItemIds, DEFAULT_STATE.mruItemIds),
    openToolIds,
  );
  let surfaceMruToolIds = completeToolOrder(normalizeIdList(
    input.surfaceMruToolIds,
    TOOL_IDS,
    DEFAULT_STATE.surfaceMruToolIds,
  ), openToolIds);
  const requestedActiveItemId = normalizeItemId(input.activeItemId);
  const requestedActiveToolId = openToolId(input.activeToolId, openToolIdSet);
  const activeItemId = requestedActiveItemId && openToolIdSet.has(toolIdFromItemId(requestedActiveItemId))
    ? requestedActiveItemId
    : requestedActiveToolId
      ? itemIdForTool(requestedActiveToolId)
      : mruItemIds.at(-1) ?? "";
  const activeToolId = activeItemId ? toolIdFromItemId(activeItemId) : "";
  if (activeItemId) mruItemIds = moveToEnd(mruItemIds, activeItemId);
  if (activeToolId) surfaceMruToolIds = moveToEnd(surfaceMruToolIds, activeToolId);

  const activeDescriptor = PREVIEW_TOOL_CATALOG_BY_ID[activeToolId];
  // Group selection is navigation state. It may intentionally differ from the
  // preserved Current Tool when the selected group has no open leaf.
  const activeGroupId = idOr(
    input.activeGroupId,
    GROUP_IDS,
    activeDescriptor?.groupId ?? DEFAULT_STATE.activeGroupId,
  );
  const requestedNavigatorToolId = openNavigatorToolId(input.activeNavigatorToolId, openToolIdSet);
  const latestNavigatorToolId = [...surfaceMruToolIds].reverse().find((toolId) => (
    NAVIGATOR_TOOL_IDS.has(toolId)
    && PREVIEW_TOOL_CATALOG_BY_ID[toolId]?.groupId === "codeAssistant"
  ));
  const activeNavigatorToolId = activeDescriptor?.groupId === "codeAssistant"
    && NAVIGATOR_TOOL_IDS.has(activeToolId)
    ? activeToolId
    : requestedNavigatorToolId ?? latestNavigatorToolId ?? "";

  const activeToolOwnsRight = activeToolId && RIGHT_TOOL_IDS.has(activeToolId);
  const requestedEditorId = rightOpenToolId(input.activeEditorId, openToolIdSet);
  const latestRightToolId = [...mruItemIds].reverse()
    .map(toolIdFromItemId)
    .find((toolId) => RIGHT_TOOL_IDS.has(toolId));
  const activeEditorId = activeToolOwnsRight
    ? activeToolId
    : input.activeEditorId === null
      ? null
      : requestedEditorId ?? latestRightToolId ?? null;

  return {
    theme: fromSet(input.theme, THEMES, DEFAULT_STATE.theme),
    primaryWidth,
    customPrimaryWidth,
    primaryVisible: booleanOr(
      input.primaryVisible,
      input.hostMode === "editor" ? false : DEFAULT_STATE.primaryVisible,
    ),
    directoryVisible: booleanOr(input.directoryVisible, DEFAULT_STATE.directoryVisible),
    directoryIndex: integerInRangeOr(input.directoryIndex, 0, 2, DEFAULT_STATE.directoryIndex),
    ribbonExpanded: booleanOr(input.ribbonExpanded, DEFAULT_STATE.ribbonExpanded),
    navigatorExpanded: booleanOr(input.navigatorExpanded, DEFAULT_STATE.navigatorExpanded),
    navigatorShowLabels: booleanOr(input.navigatorShowLabels, DEFAULT_STATE.navigatorShowLabels),
    activeGroupId,
    activeToolId,
    activeNavigatorToolId,
    activeEditorId,
    activeItemId,
    openToolIds,
    mruItemIds,
    surfaceMruToolIds,
    outputVisible: booleanOr(
      input.outputVisible,
      booleanOr(input.outputExpanded, DEFAULT_STATE.outputVisible),
    ),
  };
}

export function createPreviewStateStore(options: PreviewStateStoreOptions = {}): PreviewStateStore {
  const storage = options.storage ?? browserStorage();
  const storageKey = options.storageKey ?? PREVIEW_STATE_STORAGE_KEY;
  let state = defaultPreviewPersistedState();

  return {
    get state() {
      return cloneState(state);
    },
    load() {
      if (!storage) return cloneState(state);
      try {
        const serialized = storage.getItem(storageKey);
        if (serialized === null) return cloneState(state);
        const envelope: unknown = JSON.parse(serialized);
        if (!isCurrentEnvelope(envelope)) {
          state = defaultPreviewPersistedState();
          return cloneState(state);
        }
        state = normalizePreviewPersistedState(envelope.state);
      } catch {
        state = defaultPreviewPersistedState();
      }
      return cloneState(state);
    },
    patch(nextState) {
      state = normalizePreviewPersistedState({ ...state, ...nextState });
      return cloneState(state);
    },
    save(nextState = {}) {
      state = normalizePreviewPersistedState({ ...state, ...nextState });
      if (storage) {
        const envelope: PreviewStateEnvelope = {
          schemaVersion: PREVIEW_STATE_SCHEMA_VERSION,
          state,
        };
        try {
          storage.setItem(storageKey, JSON.stringify(envelope));
        } catch {
          // A blocked/full localStorage must not make the standalone preview unusable.
        }
      }
      return cloneState(state);
    },
    reset() {
      state = defaultPreviewPersistedState();
      if (storage) {
        try {
          storage.removeItem(storageKey);
        } catch {
          // Reset still succeeds in memory when localStorage is unavailable.
        }
      }
      return cloneState(state);
    },
  };
}

function browserStorage(): PreviewStateStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isCurrentEnvelope(value: unknown): value is PreviewStateEnvelope {
  return isRecord(value)
    && value.schemaVersion === PREVIEW_STATE_SCHEMA_VERSION
    && isRecord(value.state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneState(state: PreviewPersistedState): PreviewPersistedState {
  return {
    ...state,
    openToolIds: [...state.openToolIds],
    mruItemIds: [...state.mruItemIds],
    surfaceMruToolIds: [...state.surfaceMruToolIds],
  };
}

function fromSet<T extends string>(value: unknown, values: ReadonlySet<T>, fallback: T): T {
  return typeof value === "string" && values.has(value as T) ? value as T : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integerInRangeOr(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function normalizeCustomWidth(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(300, Math.min(620, Math.round(value)));
}

function idOr(value: unknown, allowed: ReadonlySet<string>, fallback: string): string {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function openToolId(value: unknown, openToolIds: ReadonlySet<string>): string | undefined {
  return typeof value === "string" && TOOL_IDS.has(value) && openToolIds.has(value) ? value : undefined;
}

function openNavigatorToolId(
  value: unknown,
  openToolIds: ReadonlySet<string>,
): string | undefined {
  return typeof value === "string" && NAVIGATOR_TOOL_IDS.has(value) && openToolIds.has(value)
    ? value
    : undefined;
}

function rightOpenToolId(value: unknown, openToolIds: ReadonlySet<string>): string | undefined {
  return typeof value === "string" && RIGHT_TOOL_IDS.has(value) && openToolIds.has(value)
    ? value
    : undefined;
}

function normalizeItemIdList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized: string[] = [];
  for (const candidate of value) {
    const itemId = normalizeItemId(candidate);
    if (!itemId || normalized.includes(itemId)) continue;
    normalized.push(itemId);
  }
  return normalized;
}

function normalizeItemId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const separator = value.indexOf(":");
  if (separator < 0) return undefined;
  const prefix = value.slice(0, separator);
  if (prefix !== "tool" && prefix !== "primary" && prefix !== "editor") return undefined;
  const toolId = value.slice(separator + 1);
  const itemId = itemIdForTool(toolId);
  return ITEM_IDS.has(itemId) ? itemId : undefined;
}

function completeItemOrder(itemIds: readonly string[], openToolIds: readonly string[]): string[] {
  const allowed = new Set(openToolIds);
  const completed = itemIds.filter((itemId) => allowed.has(toolIdFromItemId(itemId)));
  for (const toolId of openToolIds) {
    const itemId = itemIdForTool(toolId);
    if (!completed.includes(itemId)) completed.push(itemId);
  }
  return completed;
}

function completeToolOrder(toolIds: readonly string[], openToolIds: readonly string[]): string[] {
  const allowed = new Set(openToolIds);
  const completed = toolIds.filter((toolId) => allowed.has(toolId));
  for (const toolId of openToolIds) {
    if (!completed.includes(toolId)) completed.push(toolId);
  }
  return completed;
}

function moveToEnd(values: readonly string[], value: string): string[] {
  return [...values.filter((candidate) => candidate !== value), value];
}

function itemIdForTool(toolId: string): string {
  return `tool:${toolId}`;
}

function normalizeIdList(
  value: unknown,
  allowed: ReadonlySet<string>,
  fallback: readonly string[],
): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || !allowed.has(candidate) || normalized.includes(candidate)) continue;
    normalized.push(candidate);
  }
  return normalized;
}

function toolIdFromItemId(itemId: string): string {
  return itemId.slice(itemId.indexOf(":") + 1);
}
