/** Narrow adapter for the pinned Wing dialog (code-core 0.6.6).
 * Wing owns modal, disclosure, editor and action behavior. Add only a rules-action
 * slot and title overflow styling until these slots are part of its public API.
 * Shared by formal Host and Preview; never patch installed package files. */
export function ktcMountCleanupDialogLayout(dialog: HTMLElement): () => void {
  const root = dialog.shadowRoot;
  if (!root) return () => {};
  const refresh = () => {
    if (!root.querySelector("[data-ktc-cleanup-layout]")) {
      const style = document.createElement("style"); style.dataset.ktcCleanupLayout = "";
      style.textContent = `
/* The implicit grid column otherwise grows to the long title's min-content
 * width, beyond the clipped dialog. Constrain the track, not just the text. */
.pnw-cleanup-shell { min-width: 0; grid-template-columns: minmax(0, 1fr); }
.pnw-cleanup-header, .pnw-cleanup-content, .pnw-cleanup-block { min-width: 0; }
.pnw-cleanup-title { min-width: 72px; flex: 1 1 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pnw-cleanup-header-actions { flex: 0 1 auto; flex-wrap: wrap; justify-content: flex-end; overflow: visible; }
.pnw-cleanup-close { flex: 0 0 26px; }
.pnw-cleanup-target-path { display: inline-block; max-width: 100%; vertical-align: top; }
.pnw-cleanup-block > .pnw-cleanup-rules { width: calc(100% - 12px); min-width: 0; }
slot[name="rules-actions"] { display: inline-block; float: right; margin-left: 8px; }
.pnw-cleanup-block > summary:has(slot[name="rules-actions"]) { min-height: 38px; }
::slotted(button[slot="rules-actions"]) { font: inherit; white-space: nowrap; min-height: 24px; padding: 1px 6px; border: 1px solid var(--vscode-button-border,var(--vscode-panel-border)); color: var(--vscode-button-secondaryForeground,var(--vscode-foreground)); background: var(--vscode-button-secondaryBackground,var(--vscode-editorWidget-background)); cursor: pointer; }
::slotted(button[slot="rules-actions"]:hover:not(:disabled)) { background: var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground)); }
::slotted(button[slot="rules-actions"]:disabled) { opacity: .55; cursor: default; }
::slotted(button[slot="rules-actions"]:focus-visible) { outline: 1px solid var(--vscode-focusBorder); }
`;
      root.append(style);
    }
    const title = root.querySelector<HTMLElement>(".pnw-cleanup-title");
    if (title) title.title = title.textContent ?? "";
    const summary = root.querySelector(".pnw-cleanup-rules")?.parentElement?.querySelector("summary");
    if (summary && !summary.querySelector('slot[name="rules-actions"]')) {
      const slot = document.createElement("slot"); slot.name = "rules-actions";
      // Editing is independent of the containing disclosure. Suppress its click
      // and default toggle, not the button's own listener/semantic action.
      slot.onclick = (event) => { event.stopPropagation(); event.preventDefault(); };
      summary.append(slot);
    }
  };
  const observer = new MutationObserver(refresh);
  observer.observe(root, { childList: true, subtree: true });
  refresh();
  return () => observer.disconnect();
}
