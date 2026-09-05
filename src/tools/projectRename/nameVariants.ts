import {
  KTC_PROJECT_RENAME_VARIANT_STYLES,
  type KtcProjectRenameRule,
  type KtcProjectRenameVariantStyle,
} from "./contracts.js";
import { ktcProjectRenameNameTokens } from "./nameTokenization.js";

export { ktcProjectRenameNameTokens } from "./nameTokenization.js";

const KTC_PROJECT_RENAME_STYLE_LABELS: Readonly<Record<KtcProjectRenameVariantStyle, string>> = {
  display: "Display",
  kebab: "kebab-case",
  snake: "snake_case",
  camel: "camelCase",
  pascal: "PascalCase",
  "upper-snake": "UPPER_SNAKE",
};

export function ktcProjectRenameVariantStyleLabel(style: KtcProjectRenameVariantStyle): string {
  return KTC_PROJECT_RENAME_STYLE_LABELS[style];
}

export function ktcProjectRenameNameVariants(
  value: string,
): Readonly<Record<KtcProjectRenameVariantStyle, string>> {
  const tokens = ktcProjectRenameNameTokens(value);
  if (tokens.length === 0) {
    return { display: "", kebab: "", snake: "", camel: "", pascal: "", "upper-snake": "" };
  }
  const normalized = tokens.map((token) => token.toLocaleLowerCase("en-US"));
  const pascalTokens = tokens.map((token, index) => ktcPascalToken(token, normalized[index]!));
  return {
    display: tokens.map((token, index) => ktcDisplayToken(token, normalized[index]!)).join(" "),
    kebab: normalized.join("-"),
    snake: normalized.join("_"),
    camel: `${pascalTokens[0]!.toLocaleLowerCase("en-US")}${pascalTokens.slice(1).join("")}`,
    pascal: pascalTokens.join(""),
    "upper-snake": normalized.join("_").toLocaleUpperCase("en-US"),
  };
}

export function ktcDeriveProjectRenameRules(
  sourceName: string,
  targetName: string,
): readonly KtcProjectRenameRule[] {
  const source = ktcProjectRenameNameVariants(sourceName);
  const target = ktcProjectRenameNameVariants(targetName);
  return KTC_PROJECT_RENAME_VARIANT_STYLES.map((style) => ({
    id: `variant-${style}`,
    style,
    search: source[style],
    replace: target[style],
    enabled: source[style] !== "" && target[style] !== "" && source[style] !== target[style],
  }));
}

function ktcDisplayToken(original: string, lower: string): string {
  if (/^[A-Z0-9]{2,4}$/u.test(original)) return original;
  return `${lower.slice(0, 1).toLocaleUpperCase("en-US")}${lower.slice(1)}`;
}

function ktcPascalToken(original: string, lower: string): string {
  if (/^[A-Z0-9]{2,4}$/u.test(original)) return original;
  return `${lower.slice(0, 1).toLocaleUpperCase("en-US")}${lower.slice(1)}`;
}
