import { ktcActivateToolBlock, ktcCloseToolBlock } from "./toolBlockHistory.js";

import {
  KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS,
  type KtcEditorPrimaryCompanionLifecycle,
  type KtcEditorPrimaryCompanionToolId,
} from "../core/editorPrimaryCompanionContracts.js";

export {
  KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS,
  type KtcEditorPrimaryCompanionLifecycle,
  type KtcEditorPrimaryCompanionToolId,
} from "../core/editorPrimaryCompanionContracts.js";

export type KtcEditorPrimaryActivationSource = "ribbon" | "menu" | "editor" | "command";

export interface KtcEditorPrimaryToolActivation {
  readonly toolId: string;
  readonly source: KtcEditorPrimaryActivationSource;
  /** Editor activations normally set this so the host does not steal focus. */
  readonly preserveFocus?: boolean;
}

export interface KtcEditorPrimaryCompanionSession {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  readonly revision: number;
  readonly lifecycle: KtcEditorPrimaryCompanionLifecycle;
  /** Monotonic model order used to select the most recently active Editor. */
  readonly lastActiveOrder?: number;
  /** Stable tie-breaker for sessions that have not become active yet. */
  readonly openedOrder: number;
}

export interface KtcEditorPrimaryCompanionState {
  /** Oldest-to-newest MRU order. The last item is the current Tool Surface. */
  readonly openToolIds: readonly string[];
  readonly activeToolId?: string;
  readonly companions: readonly KtcEditorPrimaryCompanionSession[];
  readonly order: number;
}

export interface KtcEditorPrimaryCompanionInitialState {
  readonly openToolIds?: readonly string[];
  readonly activeToolId?: string;
}

export interface KtcRegisterEditorPrimaryCompanion {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  readonly revision: number;
  readonly lifecycle?: Exclude<KtcEditorPrimaryCompanionLifecycle, "disposed">;
}

export interface KtcUpdateEditorPrimaryCompanion {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  readonly revision: number;
  readonly lifecycle: KtcEditorPrimaryCompanionLifecycle;
}

export type KtcEditorPrimaryCompanionRejectionReason =
  | "invalid-revision"
  | "unknown-panel"
  | "tool-mismatch"
  | "session-mismatch"
  | "stale-revision"
  | "disposed";

export type KtcEditorPrimaryCompanionTransitionResult =
  | {
      readonly accepted: true;
      readonly state: KtcEditorPrimaryCompanionState;
      /** Present only when this transition activates the shared Tool Surface. */
      readonly activation?: KtcEditorPrimaryToolActivation;
    }
  | {
      readonly accepted: false;
      readonly state: KtcEditorPrimaryCompanionState;
      readonly reason: KtcEditorPrimaryCompanionRejectionReason;
    };

export interface KtcEditorPrimaryCompanionRoute {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  readonly revision: number;
}

export interface KtcEditorPrimaryCompanionRouteToken {
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  readonly revision: number;
}

export type KtcEditorPrimaryCompanionRouteRejectionReason =
  | "no-open-session"
  | "session-mismatch"
  | "revision-mismatch"
  | "disposed";

export type KtcEditorPrimaryCompanionRouteValidation =
  | { readonly accepted: true; readonly route: KtcEditorPrimaryCompanionRoute }
  | { readonly accepted: false; readonly reason: KtcEditorPrimaryCompanionRouteRejectionReason };

export interface KtcCloseEditorPrimaryToolResult {
  readonly state: KtcEditorPrimaryCompanionState;
  readonly closed: boolean;
  readonly closedToolId?: string;
  readonly nextToolId?: string;
}

function ktcUniqueToolIds(toolIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const toolId of toolIds) {
    if (!toolId || seen.has(toolId)) continue;
    seen.add(toolId);
    result.push(toolId);
  }
  return result;
}

function ktcIsValidRevision(revision: number): boolean {
  return Number.isSafeInteger(revision) && revision >= 0;
}

export function ktcIsEditorPrimaryCompanionToolId(
  toolId: string,
): toolId is KtcEditorPrimaryCompanionToolId {
  return (KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS as readonly string[]).includes(toolId);
}

export function ktcCreateEditorPrimaryCompanionState(
  initial: KtcEditorPrimaryCompanionInitialState = {},
): KtcEditorPrimaryCompanionState {
  let openToolIds = ktcUniqueToolIds(initial.openToolIds ?? []);
  if (initial.activeToolId) {
    openToolIds = [
      ...openToolIds.filter((toolId) => toolId !== initial.activeToolId),
      initial.activeToolId,
    ];
  }
  return {
    openToolIds,
    activeToolId: openToolIds.at(-1),
    companions: [],
    order: 0,
  };
}

/**
 * Every entry point shares this exact activation path. Source and focus intent
 * are deliberately not persisted, so they cannot split tool selection semantics.
 */
export function ktcActivateEditorPrimaryTool(
  state: KtcEditorPrimaryCompanionState,
  activation: KtcEditorPrimaryToolActivation,
): KtcEditorPrimaryCompanionState {
  const openToolIds = ktcActivateToolBlock(state.openToolIds, activation.toolId);
  if (
    state.activeToolId === activation.toolId
    && openToolIds.length === state.openToolIds.length
    && openToolIds.every((toolId, index) => toolId === state.openToolIds[index])
  ) {
    return state;
  }
  return { ...state, openToolIds, activeToolId: activation.toolId };
}

function ktcActivationForActiveEditor(
  toolId: KtcEditorPrimaryCompanionToolId,
): KtcEditorPrimaryToolActivation {
  return { toolId, source: "editor", preserveFocus: true };
}

function ktcApplyActiveEditorActivation(
  state: KtcEditorPrimaryCompanionState,
  lifecycle: KtcEditorPrimaryCompanionLifecycle,
  toolId: KtcEditorPrimaryCompanionToolId,
): Pick<KtcEditorPrimaryCompanionTransitionResult & { accepted: true }, "state" | "activation"> {
  if (lifecycle !== "active") return { state };
  const activation = ktcActivationForActiveEditor(toolId);
  return { state: ktcActivateEditorPrimaryTool(state, activation), activation };
}

/**
 * Registers a new authoritative Editor session. Re-registering a panel with a
 * different sessionId replaces its previous live/disposed record, after which
 * messages from that older session are rejected by session matching.
 */
export function ktcRegisterEditorPrimaryCompanion(
  state: KtcEditorPrimaryCompanionState,
  registration: KtcRegisterEditorPrimaryCompanion,
): KtcEditorPrimaryCompanionTransitionResult {
  if (!ktcIsValidRevision(registration.revision)) {
    return { accepted: false, state, reason: "invalid-revision" };
  }
  const order = state.order + 1;
  const lifecycle = registration.lifecycle ?? "open-inactive";
  const companion: KtcEditorPrimaryCompanionSession = {
    panelId: registration.panelId,
    toolId: registration.toolId,
    sessionId: registration.sessionId,
    revision: registration.revision,
    lifecycle,
    openedOrder: order,
    ...(lifecycle === "active" ? { lastActiveOrder: order } : {}),
  };
  const registeredState: KtcEditorPrimaryCompanionState = {
    ...state,
    companions: [
      ...state.companions.filter((candidate) => candidate.panelId !== registration.panelId),
      companion,
    ],
    order,
  };
  const activated = ktcApplyActiveEditorActivation(registeredState, lifecycle, registration.toolId);
  return { accepted: true, ...activated };
}

/**
 * Applies a lifecycle/snapshot update for an already registered session.
 * Equal revisions are allowed because focus/visibility can change without a
 * draft revision change; a lower revision is always rejected as late.
 */
export function ktcUpdateEditorPrimaryCompanion(
  state: KtcEditorPrimaryCompanionState,
  update: KtcUpdateEditorPrimaryCompanion,
): KtcEditorPrimaryCompanionTransitionResult {
  if (!ktcIsValidRevision(update.revision)) {
    return { accepted: false, state, reason: "invalid-revision" };
  }
  const index = state.companions.findIndex((candidate) => candidate.panelId === update.panelId);
  if (index < 0) return { accepted: false, state, reason: "unknown-panel" };
  const current = state.companions[index]!;
  if (current.toolId !== update.toolId) return { accepted: false, state, reason: "tool-mismatch" };
  if (current.sessionId !== update.sessionId) return { accepted: false, state, reason: "session-mismatch" };
  if (current.lifecycle === "disposed") return { accepted: false, state, reason: "disposed" };
  if (update.revision < current.revision) return { accepted: false, state, reason: "stale-revision" };

  const order = state.order + 1;
  const companion: KtcEditorPrimaryCompanionSession = {
    ...current,
    revision: update.revision,
    lifecycle: update.lifecycle,
    ...(update.lifecycle === "active" ? { lastActiveOrder: order } : {}),
  };
  const companions = [...state.companions];
  companions[index] = companion;
  const updatedState: KtcEditorPrimaryCompanionState = { ...state, companions, order };
  const activated = ktcApplyActiveEditorActivation(updatedState, update.lifecycle, update.toolId);
  return { accepted: true, ...activated };
}

function ktcIsLaterCompanionRouteCandidate(
  candidate: KtcEditorPrimaryCompanionSession,
  latest: KtcEditorPrimaryCompanionSession,
): boolean {
  if (candidate.lastActiveOrder !== undefined && latest.lastActiveOrder === undefined) return true;
  if (candidate.lastActiveOrder === undefined && latest.lastActiveOrder !== undefined) return false;
  if (candidate.lastActiveOrder !== undefined && latest.lastActiveOrder !== undefined) {
    return candidate.lastActiveOrder > latest.lastActiveOrder;
  }
  return candidate.openedOrder > latest.openedOrder;
}

/** Selects the latest active live session, then the newest opened live session. */
export function ktcResolveEditorPrimaryCompanionRoute(
  state: KtcEditorPrimaryCompanionState,
  toolId: string = state.activeToolId ?? "",
): KtcEditorPrimaryCompanionRoute | undefined {
  if (!ktcIsEditorPrimaryCompanionToolId(toolId)) return undefined;
  const candidate = state.companions
    .filter((companion) => companion.toolId === toolId && companion.lifecycle !== "disposed")
    .reduce<KtcEditorPrimaryCompanionSession | undefined>((latest, companion) => {
      if (!latest) return companion;
      return ktcIsLaterCompanionRouteCandidate(companion, latest) ? companion : latest;
    }, undefined);
  return candidate
    ? {
        panelId: candidate.panelId,
        toolId: candidate.toolId,
        sessionId: candidate.sessionId,
        revision: candidate.revision,
      }
    : undefined;
}

/**
 * Validates a Primary action/draft reply against the currently routed Editor.
 * Both sessionId and revision must match exactly before a host may execute it.
 */
export function ktcValidateEditorPrimaryCompanionRoute(
  state: KtcEditorPrimaryCompanionState,
  token: KtcEditorPrimaryCompanionRouteToken,
): KtcEditorPrimaryCompanionRouteValidation {
  const route = ktcResolveEditorPrimaryCompanionRoute(state, token.toolId);
  if (!route) {
    const disposed = state.companions.some((companion) =>
      companion.toolId === token.toolId
      && companion.sessionId === token.sessionId
      && companion.lifecycle === "disposed"
    );
    return { accepted: false, reason: disposed ? "disposed" : "no-open-session" };
  }
  if (route.sessionId !== token.sessionId) {
    return { accepted: false, reason: "session-mismatch" };
  }
  if (route.revision !== token.revision) {
    return { accepted: false, reason: "revision-mismatch" };
  }
  return { accepted: true, route };
}

/**
 * Closes only the logical Primary Tool Surface and restores MRU. Editor session
 * records are intentionally untouched; the host must not dispose an Editor.
 */
export function ktcCloseEditorPrimaryTool(
  state: KtcEditorPrimaryCompanionState,
  toolId: string | undefined = state.activeToolId,
): KtcCloseEditorPrimaryToolResult {
  if (!toolId || !state.openToolIds.includes(toolId)) return { state, closed: false };
  const closed = ktcCloseToolBlock(state.openToolIds, toolId);
  return {
    state: { ...state, openToolIds: closed.openToolIds, activeToolId: closed.nextToolId },
    closed: true,
    closedToolId: toolId,
    nextToolId: closed.nextToolId,
  };
}
