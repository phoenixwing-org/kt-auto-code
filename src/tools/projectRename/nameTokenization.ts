import { ktcSplitNameTokens } from "../../core/associatedReplacementRules.js";

export function ktcProjectRenameNameTokens(value: string): readonly string[] {
  return value.trim()
    .split(/[\s._-]+/u)
    .flatMap((part) => ktcSplitNameTokens(part))
    .filter((token) => token.trim() !== "");
}
