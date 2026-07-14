import { pnwResolveCaaEnvironment, type PnwCaaEnvironment, type PnwCaaEnvironmentKey } from "phoenix-wing/code-core";

/** Reads inherited CAA variables only; workspace overrides will be added by the settings UI. */
export function ktcReadCaaEnvironment(
  workspaceOverrides: Partial<Record<PnwCaaEnvironmentKey, string | undefined>> = {},
): PnwCaaEnvironment {
  return pnwResolveCaaEnvironment(process.env, workspaceOverrides);
}
