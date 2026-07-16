import type {
  KtcModuleId,
  KtcModuleState,
  KtcPersistedModuleState,
} from "../../../src/moduleShellContract.js";

export type { KtcModuleId, KtcModuleState, KtcPersistedModuleState };

export interface KtcToggleModuleResult {
  readonly state: KtcModuleState;
  readonly changed: boolean;
  readonly reason?: "unavailable" | "last-visible";
}

function ktcUniqueModules(values: readonly unknown[] | undefined): KtcModuleId[] {
  const modules: KtcModuleId[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value) || seen.has(value)) continue;
    seen.add(value);
    modules.push(value);
  }
  return modules;
}

export function ktcCreateModuleState(
  installedInput: readonly KtcModuleId[],
  persisted?: KtcPersistedModuleState,
): KtcModuleState {
  const installed = ktcUniqueModules(installedInput);
  if (installed.length === 0) installed.push("code");

  const knownBefore = ktcUniqueModules(persisted?.known);
  const newlyInstalled = installed.filter((id) => !knownBefore.includes(id));
  const enabled = ktcUniqueModules([
    ...(persisted?.enabled ?? installed),
    ...newlyInstalled,
  ]);
  let visible = installed.filter((id) => enabled.includes(id));
  if (visible.length === 0) {
    const fallback = installed.includes("code") ? "code" : installed[0]!;
    visible = [fallback];
  }

  const active = persisted?.active && visible.includes(persisted.active)
    ? persisted.active
    : visible[0]!;

  return {
    installed,
    enabled: ktcUniqueModules(enabled),
    visible,
    known: ktcUniqueModules([...knownBefore, ...installed]),
    active,
  };
}

export function ktcToggleModule(state: KtcModuleState, moduleId: KtcModuleId): KtcToggleModuleResult {
  if (!state.installed.includes(moduleId)) return { state, changed: false, reason: "unavailable" };

  const isVisible = state.visible.includes(moduleId);
  if (isVisible && state.visible.length === 1) return { state, changed: false, reason: "last-visible" };

  const enabled = isVisible
    ? state.enabled.filter((id) => id !== moduleId)
    : ktcUniqueModules([...state.enabled, moduleId]);
  const visible = state.installed.filter((id) => enabled.includes(id));
  const active = visible.includes(state.active) ? state.active : visible[0]!;

  return {
    changed: true,
    state: { ...state, enabled, visible, active },
  };
}

export function ktcActivateModule(state: KtcModuleState, moduleId: KtcModuleId): KtcModuleState {
  if (!state.visible.includes(moduleId) || state.active === moduleId) return state;
  return { ...state, active: moduleId };
}

export function ktcPersistedModuleState(state: KtcModuleState): KtcPersistedModuleState {
  return { known: state.known, enabled: state.enabled, active: state.active };
}
