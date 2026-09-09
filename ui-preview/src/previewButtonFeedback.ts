/** Preview-only fallback: business handlers keep their detailed messages; silent clicks get one line.
 * Capture before a button removes itself/stops propagation, then wait for its semantic handler.
 */
export function installPreviewButtonFeedback(
  target: Document,
  options: {
    readonly revision: () => number;
    readonly write: (message: string) => void;
    readonly ignore?: (path: EventTarget[]) => boolean;
  },
): () => void {
  const onClick = (event: Event): void => {
    const path = event.composedPath();
    if (options.ignore?.(path)) return;
    const button = path.find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    const label = [button.getAttribute("aria-label"), button.title, button.textContent]
      .map((value) => value?.replace(/\s+/gu, " ").trim()).find(Boolean);
    if (!label) return;
    const revision = options.revision();
    queueMicrotask(() => {
      if (options.revision() === revision) options.write(`[界面] ${label.slice(0, 80)}（原型）`);
    });
  };
  target.addEventListener("click", onClick, true);
  return () => target.removeEventListener("click", onClick, true);
}
