/** Theme-only floating information; delayed text hints and click-only information badges. */
export const KtcHoverTooltipStyle = `
#ktc-hover-tooltip { position:fixed; z-index:1000; width:max-content; max-width:min(560px,calc(100vw - 16px)); max-height:calc(100vh - 16px); overflow:auto; padding:7px 9px; border:1px solid var(--vscode-editorHoverWidget-border,var(--vscode-panel-border)); border-radius:3px; color:var(--vscode-editorHoverWidget-foreground,var(--vscode-foreground)); background:var(--vscode-editorHoverWidget-background,var(--vscode-editorWidget-background,var(--vscode-editor-background))); box-shadow:0 2px 8px var(--vscode-widget-shadow); font:12px/1.5 var(--vscode-font-family); white-space:pre-wrap; overflow-wrap:anywhere; user-select:text; }
#ktc-hover-tooltip[hidden] { display:none !important; }
[data-hover-text]:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:1px; }
`;

/** Self-contained so nonce-authorized Webviews can embed the same tested function. */
export function ktcInstallHoverTooltip(doc: Document): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const tooltip = doc.createElement("div");
  tooltip.id = "ktc-hover-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  doc.body.append(tooltip);
  let anchor: HTMLElement | undefined;
  let pinned = false;
  let openTimer: number | undefined;
  let pendingAnchor: HTMLElement | undefined;
  let closeTimer: number | undefined;
  let originalDescription: string | null = null;

  const cancelClose = () => { if (closeTimer !== undefined) win.clearTimeout(closeTimer); closeTimer = undefined; };
  const cancelOpen = () => {
    if (openTimer !== undefined) win.clearTimeout(openTimer);
    openTimer = undefined;
    pendingAnchor = undefined;
  };
  const hide = () => {
    cancelOpen();
    cancelClose();
    if (anchor) {
      if (originalDescription === null) anchor.removeAttribute("aria-describedby");
      else anchor.setAttribute("aria-describedby", originalDescription);
      if (anchor.hasAttribute("data-hover-pin")) anchor.setAttribute("aria-expanded", "false");
    }
    anchor = undefined;
    pinned = false;
    tooltip.hidden = true;
  };
  const show = (target: HTMLElement, pin = false) => {
    if (!target.dataset.hoverText || pinned && target !== anchor) return;
    cancelOpen();
    cancelClose();
    if (anchor !== target) {
      hide();
      anchor = target;
      originalDescription = target.getAttribute("aria-describedby");
    }
    pinned = pin || pinned;
    tooltip.textContent = target.dataset.hoverText;
    tooltip.hidden = false;
    target.setAttribute("aria-describedby", [originalDescription, tooltip.id].filter(Boolean).join(" "));
    if (target.hasAttribute("data-hover-pin")) target.setAttribute("aria-expanded", "true");
    const margin = 8;
    tooltip.style.left = margin + "px";
    tooltip.style.top = margin + "px";
    const box = target.getBoundingClientRect();
    const popup = tooltip.getBoundingClientRect();
    const viewportWidth = doc.documentElement.clientWidth || win.innerWidth;
    const viewportHeight = doc.documentElement.clientHeight || win.innerHeight;
    const left = Math.max(margin, Math.min(box.left, viewportWidth - popup.width - margin));
    const below = box.bottom + 5;
    const top = below + popup.height <= viewportHeight - margin ? below : box.top - popup.height - 5;
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(margin, Math.min(top, viewportHeight - popup.height - margin)) + "px";
  };
  const trigger = (target: EventTarget | null): HTMLElement | null =>
    target && "closest" in target ? (target as Element).closest<HTMLElement>("[data-hover-text]") : null;
  const scheduleClose = () => {
    cancelClose();
    if (!pinned) closeTimer = win.setTimeout(hide, 120);
  };
  const over = (event: Event) => {
    // Do not cover a drag-selection or the graph's range-drag interaction.
    if ((event as PointerEvent).buttons) { cancelOpen(); return; }
    const target = event.target;
    if (target instanceof win.Node && tooltip.contains(target)) { cancelClose(); return; }
    const next = trigger(target);
    // A help cursor advertises an explicit click, not another automatic popup.
    if (!next || next.hasAttribute("data-hover-pin") || pinned) { cancelOpen(); return; }
    cancelClose();
    if (next === anchor || next === pendingAnchor) return;
    hide();
    pendingAnchor = next;
    openTimer = win.setTimeout(() => {
      if (next.isConnected) show(next);
      else cancelOpen();
    }, 500);
  };
  const out = (event: Event) => {
    const next = (event as MouseEvent).relatedTarget;
    if (pendingAnchor && trigger(next) !== pendingAnchor) cancelOpen();
    if (next instanceof win.Node && (anchor?.contains(next) || tooltip.contains(next))) return;
    scheduleClose();
  };
  const click = (event: Event) => {
    const next = trigger(event.target);
    if (next?.hasAttribute("data-hover-pin")) {
      event.preventDefault();
      event.stopPropagation();
      if (anchor === next && pinned) hide();
      else { hide(); show(next, true); }
    } else if (!(event.target instanceof win.Node) || !tooltip.contains(event.target)) hide();
  };
  const key = (event: KeyboardEvent) => { if (event.key === "Escape" && (!tooltip.hidden || pendingAnchor)) { event.stopPropagation(); hide(); } };
  const down = (event: Event) => {
    const target = event.target;
    if (!trigger(target)?.hasAttribute("data-hover-pin")
      && (!(target instanceof win.Node) || !tooltip.contains(target))) hide();
  };
  const scroll = (event: Event) => { if (!(event.target instanceof win.Node) || !tooltip.contains(event.target)) hide(); };
  doc.addEventListener("pointerover", over);
  doc.addEventListener("pointerout", out);
  doc.addEventListener("focusin", over);
  doc.addEventListener("focusout", out);
  doc.addEventListener("pointerdown", down, true);
  doc.addEventListener("click", click, true);
  doc.addEventListener("keydown", key, true);
  doc.addEventListener("scroll", scroll, true);
  win.addEventListener("resize", hide);
  win.addEventListener("blur", hide);
  return () => {
    hide();
    tooltip.remove();
    doc.removeEventListener("pointerover", over);
    doc.removeEventListener("pointerout", out);
    doc.removeEventListener("focusin", over);
    doc.removeEventListener("focusout", out);
    doc.removeEventListener("pointerdown", down, true);
    doc.removeEventListener("click", click, true);
    doc.removeEventListener("keydown", key, true);
    doc.removeEventListener("scroll", scroll, true);
    win.removeEventListener("resize", hide);
    win.removeEventListener("blur", hide);
  };
}
