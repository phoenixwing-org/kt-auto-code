// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { KTC_SELECTION_PRIMARY_ACTION, KtcSelectionPrimary, ktcDefineSelectionPrimary, type KtcSelectionPrimaryModel } from "./KtcSelectionPrimary.js";
import { KtcReorderMembersPanel, KTC_REORDER_MEMBERS_PANEL_ACTION } from "../sidebar/reorderMembersPanel.js";
import { KtcUuidResultsPanel, KTC_UUID_RESULTS_ACTION } from "../sidebar/uuidResultsPanel.js";
import { ktcProjectSelectionPrimary, ktcSelectionPrimaryMessage } from "../sidebar/selectionPrimaryAdapter.js";

afterEach(() => document.body.replaceChildren());
const reorderRow = { uri: "file:///A.h", relativePath: "A.h", kind: "header" as const, encoding: "UTF-8", changed: true, state: "pending" as const, warnings: [] };
const uuidRow = { uri: "file:///A.h", relativePath: "A.h", encoding: "UTF-8", hitCount: 2, firstLine: 7, state: "pending" as const, hasApplied: false, warnings: [], mappings: [] };
function setup(kind: "reorderMembers" | "uuidReplace") {
  ktcDefineSelectionPrimary();
  const view = document.createElement("ktc-selection-primary");
  const model = ktcProjectSelectionPrimary({ toolId: kind, directory: "/repo", state: kind === "reorderMembers"
    ? { status: "done", message: "已扫描", reorderResults: [reorderRow], reorderSelectedUris: [reorderRow.uri] }
    : { status: "done", message: "已扫描", uuidResults: [uuidRow], uuidSelectedUris: [uuidRow.uri] } });
  view.model = model; document.body.append(view);
  const bar = view.shadowRoot!.querySelector("ktc-primary-action-bar")!;
  const result = view.shadowRoot!.querySelector(kind === "reorderMembers" ? "ktc-reorder-members-panel" : "ktc-uuid-results-panel") as KtcReorderMembersPanel | KtcUuidResultsPanel;
  const received = vi.fn(); view.addEventListener(KTC_SELECTION_PRIMARY_ACTION, event => received((event as CustomEvent).detail));
  return { view, model, result, received, buttons: () => Array.from(bar.shadowRoot!.querySelectorAll("button")) };
}

describe("KtcSelectionPrimary shared formal/Preview presentation", () => {
  it.each(["reorderMembers", "uuidReplace"] as const)("%s keeps the approved first-line text toolbar and actual Wing results, without a second title", kind => {
    const { view, result, buttons } = setup(kind);
    expect(view).toBeInstanceOf(KtcSelectionPrimary);
    expect(view.shadowRoot!.firstElementChild?.tagName.toLowerCase()).toBe("ktc-primary-action-bar");
    expect(view.shadowRoot!.querySelectorAll("h1,h2,h3")).toHaveLength(0);
    expect(buttons().map(button => button.textContent)).toEqual(kind === "reorderMembers" ? ["扫描排序", "应用所选（1）"] : ["扫描 UUID", "替换所选（1）"]);
    expect(result).toBeInstanceOf(kind === "reorderMembers" ? KtcReorderMembersPanel : KtcUuidResultsPanel);
    expect(view.shadowRoot!.querySelector("style")!.textContent).toContain(":host([hidden]),[hidden]{display:none!important}");
  });

  it.each(["reorderMembers", "uuidReplace"] as const)("%s toolbar maps to the exact existing Host scan/apply routes", kind => {
    const { buttons, received } = setup(kind);
    buttons()[0]!.click(); buttons()[1]!.click();
    expect(received.mock.calls.map(([detail]) => ktcSelectionPrimaryMessage(detail))).toEqual([
      { type: "run", toolId: kind, action: "scan", ...(kind === "uuidReplace" ? { uuidStrategy: "map_per_value" } : {}) },
      { type: kind === "reorderMembers" ? "reorderAction" : "uuidAction", toolId: kind, action: "apply", uris: [reorderRow.uri] },
    ]);
  });

  it.each(["reorderMembers", "uuidReplace"] as const)("%s result actions relay exactly once and do not leak legacy event routing", kind => {
    const { view, result, received } = setup(kind);
    const eventName = kind === "reorderMembers" ? KTC_REORDER_MEMBERS_PANEL_ACTION : KTC_UUID_RESULTS_ACTION;
    const legacy = vi.fn(); view.addEventListener(eventName, legacy);
    const actions = kind === "reorderMembers" ? ["open", "preview", "apply", "cancel", "gitDiff", "revert"] : ["open", "apply", "cancel", "gitDiff"];
    for (const action of actions) result.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true,
      detail: kind === "reorderMembers" ? { kind: "reorderAction", action, uris: [reorderRow.uri] } : { kind: "action", scope: "file", action, ids: [uuidRow.uri] } }));
    expect(received.mock.calls.map(([detail]) => detail.action)).toEqual(actions);
    expect(legacy).not.toHaveBeenCalled();
    result.dispatchEvent(new CustomEvent(eventName, { detail: kind === "reorderMembers" ? { kind: "reorderSelection", uris: [] } : { kind: "selection", scope: "file", ids: [] } }));
    expect(received).toHaveBeenLastCalledWith({ toolId: kind, kind: "selection", uris: [] });
  });

  it.each(["reorderMembers", "uuidReplace"] as const)("%s busy guards toolbar, strategy and even synthetic result events", kind => {
    const { view, model, buttons, result, received } = setup(kind);
    view.model = { ...model, running: true };
    for (const button of buttons()) { expect(button.disabled).toBe(true); button.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
    result.dispatchEvent(new CustomEvent(kind === "reorderMembers" ? KTC_REORDER_MEMBERS_PANEL_ACTION : KTC_UUID_RESULTS_ACTION, {
      detail: kind === "reorderMembers" ? { kind: "reorderAction", action: "apply", uris: [reorderRow.uri] } : { kind: "action", scope: "file", action: "apply", ids: [uuidRow.uri] },
    }));
    const select = view.shadowRoot!.querySelector("select")!; select.value = "fresh_per_hit"; select.dispatchEvent(new Event("change"));
    expect(select.disabled).toBe(true); expect(select.value).toBe("map_per_value"); expect(received).not.toHaveBeenCalled();
    expect(view.getAttribute("aria-busy")).toBe("true");
  });

  it("uses controlled UUID strategy, preserving warning, focus and result component across model updates", () => {
    const { view, model, result, received } = setup("uuidReplace");
    const select = view.shadowRoot!.querySelector("select")!; select.focus();
    select.value = "fresh_per_hit"; select.dispatchEvent(new Event("change"));
    expect(received).toHaveBeenCalledWith({ toolId: "uuidReplace", kind: "setStrategy", strategy: "fresh_per_hit" });
    view.model = { ...model, uuidStrategy: "fresh_per_hit" };
    expect(view.shadowRoot!.activeElement).toBe(select);
    expect(view.shadowRoot!.querySelector(".selection-tool-hint")!.textContent).toContain("打破原有引用关系");
    expect(view.shadowRoot!.querySelector("ktc-uuid-results-panel")).toBe(result);
    view.remove(); document.body.append(view); expect(view.model?.uuidStrategy).toBe("fresh_per_hit");
  });

  it("counts only selected pending rows, respects cleared selection and disabled apply capability", () => {
    const { view, model, buttons, received } = setup("reorderMembers");
    const publish = (reorder: KtcSelectionPrimaryModel["reorder"]) => { view.model = { ...model, reorder }; };
    publish({ ...model.reorder!, reorderResults: [reorderRow, { ...reorderRow, uri: "done", state: "applied" }], reorderSelectedUris: [reorderRow.uri, "done", "missing", reorderRow.uri] });
    expect(buttons()[1]!.textContent).toBe("应用所选（1）");
    publish({ ...model.reorder!, reorderSelectedUris: [] }); expect(buttons()[1]!.disabled).toBe(true);
    publish({ ...model.reorder!, capabilities: { apply: false } }); expect(buttons()[1]!.disabled).toBe(true);
    buttons()[1]!.dispatchEvent(new MouseEvent("click")); expect(received).not.toHaveBeenCalled();
  });

  it("formal UUID strategy mismatch disables real selection/apply but keeps opening the unchanged frozen result", () => {
    const { view, result, buttons, received } = setup("uuidReplace");
    const state = { status: "done" as const, uuidStrategy: "map_per_value" as const, uuidResults: [uuidRow], uuidSelectedUris: [uuidRow.uri] };
    view.model = ktcProjectSelectionPrimary({ toolId: "uuidReplace", directory: "/repo", state, uuidStrategy: "fresh_per_hit" });
    expect(buttons()[1]!.disabled).toBe(true);
    // Wing removes selection controls when the capability is unavailable.
    expect(result.shadowRoot!.querySelector('input[aria-label="选择 A.h"]')).toBeNull();
    result.shadowRoot!.querySelector<HTMLElement>(".main")!.click();
    expect(received).toHaveBeenLastCalledWith({ toolId: "uuidReplace", kind: "action", action: "open", uris: [uuidRow.uri] });
    received.mockClear();
    for (const detail of [{ kind: "selection", scope: "file", ids: [uuidRow.uri] }, { kind: "action", scope: "file", action: "apply", ids: [uuidRow.uri] }]) {
      result.dispatchEvent(new CustomEvent(KTC_UUID_RESULTS_ACTION, { detail }));
    }
    expect(received).not.toHaveBeenCalled();
    view.model = ktcProjectSelectionPrimary({ toolId: "uuidReplace", directory: "/repo", state, uuidStrategy: "map_per_value" });
    expect(buttons()[1]!.disabled).toBe(false);
    expect((result as KtcUuidResultsPanel).model?.files?.[0]).toBe(uuidRow);
  });
});
