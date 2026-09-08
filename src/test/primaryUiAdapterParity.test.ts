import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const OPEN_ITEMS_PROPERTIES = [
  "--ktc-open-items-bar-height",
  "--ktc-open-items-more-width",
  "--ktc-open-items-close-width",
  "--ktc-open-items-track-gap",
  "--ktc-open-items-activate-gap",
  "--ktc-open-items-activate-padding",
] as const;

const RIBBON_ITEM_PROPERTIES = [
  "width",
  "min-width",
  "height",
  "min-height",
  "flex",
] as const;

describe("Preview / formal Primary adapters", () => {
  it("共用同一 Open Items 组件、ViewModel 字段和语义事件", async () => {
    const [previewHtml, previewSource, formalSource, buildSource] = await Promise.all([
      readFile(path.resolve("ui-preview/index.html"), "utf8"),
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
      readFile(path.resolve("src/sidebar/panelHtml.ts"), "utf8"),
      readFile(path.resolve("esbuild.mjs"), "utf8"),
    ]);

    expect(previewHtml).toContain(
      '<ktc-open-items-bar id="preview-open-items-bar" slot="open-items"></ktc-open-items-bar>',
    );
    expect(formalSource).toContain(
      '<ktc-open-items-bar id="open-items-bar" slot="open-items"></ktc-open-items-bar>',
    );
    expect(previewSource).toContain("KtcOpenItemsBarEntry.js");
    expect(buildSource).toContain('"src/ui/KtcOpenItemsBarEntry.ts"');
    expect(buildSource).toContain('"dist/ktc-open-items-bar.js"');
    for (const field of ["id", "title", "shortTitle", "icon"] as const) {
      expect(openItemsProjection(previewSource)).toMatch(new RegExp(`\\b${field}:`, "u"));
      expect(openItemsProjection(formalSource)).toMatch(new RegExp(`\\b${field}:`, "u"));
    }
    for (const kind of ["activate", "close", "closeOthers"] as const) {
      expect(previewSource).toContain(`detail.kind === "${kind}"`);
      expect(formalSource).toContain(`detail.kind === "${kind}"`);
    }
  });

  it("Ribbon、紧凑 Open Items 和 CODE 模块标识在两个 adapter 中使用相同 token", async () => {
    const [previewHtml, previewStyles, formalSource, providerSource, toolbarSource] = await Promise.all([
      readFile(path.resolve("ui-preview/index.html"), "utf8"),
      readFile(path.resolve("ui-preview/styles.css"), "utf8"),
      readFile(path.resolve("src/sidebar/panelHtml.ts"), "utf8"),
      readFile(path.resolve("src/sidebar/sidebarViewProvider.ts"), "utf8"),
      readFile(path.resolve("src/ui/KtcToolbarStrip.ts"), "utf8"),
    ]);

    const previewOpenItems = cssRule(previewStyles, "#preview-open-items-bar");
    const formalOpenItems = cssRule(formalSource, "#open-items-bar");
    expect(properties(previewOpenItems, OPEN_ITEMS_PROPERTIES)).toEqual(
      properties(formalOpenItems, OPEN_ITEMS_PROPERTIES),
    );

    const previewRibbonItem = cssRule(previewStyles, "\\.preview-ribbon-item");
    const formalRibbonItem = cssRule(formalSource, "\\.tabs\\.ribbon \\.tab");
    expect(properties(previewRibbonItem, RIBBON_ITEM_PROPERTIES)).toEqual(
      properties(formalRibbonItem, RIBBON_ITEM_PROPERTIES),
    );

    const previewCompactModule = cssRule(previewStyles, "ktc-toolbar-strip\\[data-toolbar-strip\\]");
    const formalCompactModule = cssRule(formalSource, "#ribbon-shell");
    expect(previewCompactModule).toBe("");
    expect(formalCompactModule).toBe("");
    expect(previewHtml).toContain(
      '<span class="preview-module-mark" aria-label="Code 模块">CODE</span>',
    );
    expect(providerSource).toContain('moduleTitle: "Code"');
    expect(formalSource).toContain("groupLabel.textContent = (moduleTools[0].moduleTitle || moduleId).toUpperCase()");
    const sharedDefaults = [
      ["--ktc-toolbar-compact-module-min-width", "18px"],
      ["--ktc-toolbar-compact-module-writing-mode", "vertical-rl"],
      ["--ktc-toolbar-compact-module-font-size", "8px"],
      ["--ktc-toolbar-compact-module-letter-spacing", ".7px"],
      ["--ktc-toolbar-expanded-item-min-width", "46px"],
      ["--ktc-toolbar-expanded-module-min-width", "18px"],
      ["--ktc-toolbar-toggle-track-width", "24px"],
    ] as const;
    for (const [property, fallback] of sharedDefaults) expect(toolbarSource).toContain(`var(${property},${fallback})`);
  });
});

function cssRule(source: string, selectorPattern: string): string {
  return source.match(new RegExp(`${selectorPattern}\\s*\\{(?<body>[^}]*)\\}`, "u"))
    ?.groups?.body ?? "";
}

function properties(
  rule: string,
  names: readonly string[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(names.map((name) => {
    const value = rule.match(new RegExp(`${name}:\\s*(?<value>[^;]+)`, "u"))?.groups?.value.trim();
    expect(value, `${name} 应在 adapter 中显式定义`).toBeTruthy();
    return [name, value ?? ""];
  }));
}

function openItemsProjection(source: string): string {
  const start = source.indexOf("items: (state.openToolIds") >= 0
    ? source.indexOf("items: (state.openToolIds")
    : source.indexOf("items: openItems.map");
  const end = source.indexOf('overflowLabel: "全部打开项"', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}
