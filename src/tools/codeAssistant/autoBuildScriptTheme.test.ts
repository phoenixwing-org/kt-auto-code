import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./autoBuildViewEntry.ts", import.meta.url), "utf8");

describe("Auto Build script manager theme", () => {
  it("uses VS Code theme tokens for every visible script-manager surface", () => {
    for (const marker of [
      ".script-window{",
      "var(--vscode-editorWidget-background,var(--vscode-editor-background))",
      ".script-window-header{",
      "var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground))",
      ".script-window-body{",
      ".script-tabs{",
      ".script-tab{",
      "var(--vscode-button-secondaryForeground,var(--vscode-foreground))",
      "var(--vscode-button-secondaryBackground,var(--vscode-editor-background))",
      ".script-tab:hover:not([aria-selected=true]){",
      "var(--vscode-list-hoverBackground,var(--vscode-toolbar-hoverBackground))",
      ".script-tab[aria-selected=true]{",
      "var(--vscode-tab-activeForeground,var(--vscode-foreground))",
      "var(--vscode-tab-activeBackground,var(--vscode-editor-background))",
      ".script-window input[type=text]{",
      "var(--vscode-input-foreground)",
      "var(--vscode-input-background)",
      ".script-window button:not(.script-tab){",
      "var(--vscode-button-secondaryHoverBackground,var(--vscode-toolbar-hoverBackground))",
      ".script-window button:disabled{",
      ".script-window :focus-visible{",
    ]) {
      expect(source).toContain(marker);
    }
  });

  it("keeps the close control icon-like and gives the write action primary emphasis", () => {
    expect(source).toContain(".script-window-header #closeScriptWindow{");
    expect(source).toContain("background:transparent");
    expect(source).toContain(".script-window #confirmWriteScript{");
    expect(source).toContain("var(--vscode-button-foreground)");
    expect(source).toContain("var(--vscode-button-background)");
    expect(source).toContain("var(--vscode-button-hoverBackground)");
  });

  it("maps native form controls to the active VS Code light, dark and high-contrast scheme", () => {
    expect(source).toContain("body.vscode-light .script-window,body.vscode-high-contrast-light .script-window{color-scheme:light}");
    expect(source).toContain("body.vscode-dark .script-window,body.vscode-high-contrast .script-window{color-scheme:dark}");
    expect(source).not.toContain("color-scheme:light dark");
  });
});
