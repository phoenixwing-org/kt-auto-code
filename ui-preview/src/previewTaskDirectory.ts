import { ktcFormatRightViewContextPath } from "../../src/ui/KtcRightViewShell.js";

/** Read-only task context. Never reads or changes the shared directory selector. */
export function createPreviewTaskDirectory(root: string): HTMLElement {
  const row = document.createElement("footer");
  row.className = "preview-companion-directory";
  row.setAttribute("aria-label", "当前任务绑定目录，只读");
  const context = ktcFormatRightViewContextPath(root);
  const value = document.createElement("span");
  value.textContent = context.label;
  value.title = context.title;
  value.setAttribute("aria-label", context.title);
  const hint = document.createElement("small");
  hint.textContent = "当前任务目录已固定；如需更换，请关闭右侧视图后重新打开。";
  row.append(value, hint);
  return row;
}
