// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { pnwCodeDefineCleanupDialog } from "@phoenix-wing/code-core/ui";
import type { KtcCleanupDialogModel } from "../core/cleanupContracts.js";
import { ktcMountCleanupDialogLayout } from "./ktcCleanupDialogLayout.js";
import { ktcAutoBuildCleanupTitle } from "../core/autoBuildCleanupScope.js";

describe("Registry Wing cleanup layout adapter", () => {
  it("规则动作挂到真实折叠标题，点击不折叠；模式切换/模型刷新后仍唯一", async () => {
    pnwCodeDefineCleanupDialog();
    const dialog = document.createElement("pnw-cleanup-dialog") as HTMLElement & { model: KtcCleanupDialogModel };
    const button = document.createElement("button"); button.slot = "rules-actions"; button.textContent = "在 VS Code 中编辑";
    const edit = vi.fn(); button.onclick = edit; dialog.append(button); document.body.append(dialog);
    const dispose = ktcMountCleanupDialogLayout(dialog);
    const model: KtcCleanupDialogModel = {
      title: ktcAutoBuildCleanupTitle("/workspace/project"), modes: [
        { id: "rules", label: "规则", risk: "normal", rulesVisible: true },
        { id: "cmake", label: "CMake", risk: "normal", rulesVisible: false },
        { id: "git-force", label: "Git", risk: "high", rulesVisible: false },
      ], selectedModeId: "rules", modePresentation: "radio", collapsibleSections: true,
      actionsPlacement: "header", targets: [], rulesVisible: true, rulesLabel: "清理规则", rulesYaml: "",
      preview: { state: "idle", items: [] }, previewEnabled: true, executeEnabled: false,
      previewLabel: "预览", executeLabel: "清理", cancelLabel: "取消", highRiskConfirmationLabel: "确认",
    };
    const root = dialog.shadowRoot!;
    try {
      for (const mode of ["rules", "cmake", "rules"]) {
        dialog.model = { ...model, selectedModeId: mode };
        await vi.waitFor(() => expect(root.querySelectorAll('slot[name="rules-actions"]')).toHaveLength(mode === "rules" ? 1 : 0));
        if (mode !== "rules") continue;
        const slot = root.querySelector<HTMLSlotElement>('slot[name="rules-actions"]')!;
        expect(slot.parentElement?.tagName).toBe("SUMMARY");
        expect(slot.assignedElements()).toContain(button);
        const block = slot.closest("details")!;
        expect(block.open).toBe(true);
        button.click(); expect(block.open).toBe(true);
        slot.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        expect(block.open).toBe(true);
        slot.parentElement!.click(); expect(block.open).toBe(false);
        slot.parentElement!.click(); expect(block.open).toBe(true);
        expect(root.querySelector(".pnw-cleanup-title")?.textContent).toBe("清理 · project @ /workspace");
      }
      expect(edit).toHaveBeenCalledTimes(2);
      expect(root.querySelectorAll("[data-ktc-cleanup-layout]")).toHaveLength(1);
      // happy-dom cannot measure geometry. Lock the size contract here; real
      // Chromium regressions additionally check all button bounds at 360–840px.
      const style = root.querySelector("[data-ktc-cleanup-layout]")!.textContent!;
      expect(style).toContain("grid-template-columns: minmax(0, 1fr)");
      expect(style).toContain("flex-wrap: wrap");
      expect(style).toContain(".pnw-cleanup-close { flex: 0 0 26px;");
      const longTitle = ktcAutoBuildCleanupTitle("/workspace/very-long-parent-directory/project-source/PNXBomAnalysisWsp");
      dialog.model = { ...model, title: longTitle };
      await vi.waitFor(() => expect(root.querySelector<HTMLElement>(".pnw-cleanup-title")?.title).toBe(longTitle));
      expect(root.querySelector(".pnw-cleanup-title")?.textContent).toBe(longTitle);
      dialog.model = { ...model, selectedModeId: "git-force" };
      expect(root.querySelector(".pnw-cleanup-confirm")?.parentElement)
        .toBe(root.querySelector(".pnw-cleanup-content"));
      const confirmation = () => root.querySelector<HTMLInputElement>('.pnw-cleanup-confirm input[type="checkbox"]')!;
      expect(confirmation().checked).toBe(false);
      expect(confirmation().disabled).toBe(true);
      dialog.model = { ...model, selectedModeId: "git-force", executeEnabled: true,
        targets: [{ id: "git:working", label: "当前目录", path: "/workspace/project", selected: true, supportedModeIds: ["git-force"] }],
        preview: { state: "ready", token: "fixture", items: ["fixture only"] } };
      const execute = () => Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "清理")!;
      expect(execute().disabled).toBe(true);
      confirmation().click(); expect(confirmation().checked).toBe(true);
      expect(execute().disabled).toBe(false);
      // Location changes must not replace Wing's own high-risk gate.
      dialog.model = { ...model, selectedModeId: "rules" };
      expect(root.querySelector(".pnw-cleanup-confirm")).toBeNull();
    } finally { dispose(); dialog.remove(); }
  });
  it.each([
    ["/workspace/project", "清理 · project @ /workspace"],
    ["C:\\work\\project\\", "清理 · project @ C:/work"],
    ["", "清理 · 未传入工作目录"],
    ["/", "清理 · /"],
  ])("标题格式：%s", (path, title) => expect(ktcAutoBuildCleanupTitle(path)).toBe(title));
});
