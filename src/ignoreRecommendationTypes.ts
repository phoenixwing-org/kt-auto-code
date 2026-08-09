import type { KtcIgnoreGroupRecommendation } from "./core/ignoreRecommendation.js";

/** Data-only Ignore recommendation report shared by the native Block and optional legacy panel. */
export interface KtcIgnoreRecommendationReport {
  workspace: string;
  truncated: boolean;
  catalogError?: string;
  recommendations: readonly KtcIgnoreGroupRecommendation[];
}
