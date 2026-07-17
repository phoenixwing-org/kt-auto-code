export interface ReplacementRule {
  id?: string;
  search: string;
  replace: string;
  enabled?: boolean;
}

export interface ResolvedReplacementRule {
  id: string;
  search: string;
  replace: string;
  sourceIndex: number;
  derived: boolean;
}

export interface RuleMatchSummary {
  ruleId: string;
  search: string;
  replace: string;
  occurrences: number;
}

export type ReplacementTextEncoding = "utf8" | "ascii" | "gbk";
