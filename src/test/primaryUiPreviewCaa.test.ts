// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewCaaSurface } from "../../ui-preview/src/previewCaaSurface.js";
import { KTC_CAA_PRIMARY_ACTION, ktcDefineCaaPrimary, type KtcCaaPrimary } from "../ui/KtcCaaPrimary.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });
function setup() {
  vi.useFakeTimers();
  let directory = "/workspace/PNXCaaStudy";
  const log = vi.fn();
  const surface = createPreviewCaaSurface({ directory: () => directory, log });
  const primary = surface.createPrimary() as KtcCaaPrimary;
  document.body.append(primary);
  return {
    surface, primary, log,
    directory(value: string) { directory = value; surface.directoryChanged(); },
    action(label: string) {
      return Array.from(primary.shadowRoot!.querySelector("ktc-primary-action-bar")!.shadowRoot!.querySelectorAll("button"))
        .find((button) => button.textContent === label)!;
    },
    rows() { return Array.from(primary.shadowRoot!.querySelectorAll<HTMLElement>(".file")); },
  };
}

describe("CAA Primary preview", () => {
  it("starts with the shared text toolbar and no fake Right, scan or connection", () => {
    const view = setup();
    expect(view.primary.shadowRoot!.children[1]!.localName).toBe("ktc-primary-action-bar");
    expect(view.action("扫描 CATDlg").disabled).toBe(false);
    expect(view.action("Desk Tools 设置")).toBeDefined();
    expect(view.action("连接 Desk Tools")).toBeDefined();
    expect(view.rows()).toHaveLength(0);
    expect(view.log).not.toHaveBeenCalled();
    expect(view.primary.model?.notice).toContain("不扫描文件、不连接外部服务");
  });

  it("simulates scanning with busy feedback, two files and a visible connection action", () => {
    const view = setup();
    view.action("扫描 CATDlg").click();
    expect(view.primary.getAttribute("aria-busy")).toBe("true");
    expect(view.action("扫描 CATDlg").disabled).toBe(true);
    expect(view.action("Desk Tools 设置").disabled).toBe(true);
    vi.advanceTimersByTime(220);
    expect(view.primary.getAttribute("aria-busy")).toBe("false");
    expect(view.rows()).toHaveLength(2);
    expect(view.rows()[0]!.querySelector(".path")!.textContent).toBe("PNXIssueDialog.CATDlg · Dialog");
    expect(view.rows()[0]!.querySelector(".path")!.getAttribute("aria-label")).toBe("打开 Dialog/PNXIssueDialog.CATDlg");
    expect(view.action("重新检测")).toBeDefined();
  });

  it("keeps source and external-editor actions explicit, with no real calls", () => {
    const view = setup();
    const fetch = vi.spyOn(window, "fetch"); const open = vi.spyOn(window, "open");
    view.action("扫描 CATDlg").click(); vi.advanceTimersByTime(220); view.log.mockClear();
    view.rows()[0]!.querySelector<HTMLButtonElement>(".tail button")!.click();
    expect(view.log).toHaveBeenCalledTimes(1);
    expect(view.log).toHaveBeenLastCalledWith(expect.stringContaining("在 VS Code 中打开 Dialog/PNXIssueDialog.CATDlg"));
    view.rows()[0]!.querySelectorAll<HTMLButtonElement>(".tail button")[1]!.click();
    expect(view.rows()[0]!.querySelector(".badge")!.textContent).toBe("已交接");
    expect(fetch).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    view.rows()[1]!.querySelectorAll<HTMLButtonElement>(".tail button")[1]!.click();
    expect(view.rows()[0]!.querySelector<HTMLElement>(".badge")!.hidden).toBe(true);
    expect(view.rows()[1]!.querySelector<HTMLElement>(".badge")!.hidden).toBe(false);
  });

  it("opens only a simulated settings notice and supports connection without scanning", () => {
    const view = setup();
    view.action("Desk Tools 设置").click();
    expect(view.primary.model?.message).toContain("未修改真实设置");
    view.action("连接 Desk Tools").click(); vi.advanceTimersByTime(220);
    expect(view.primary.model?.connection.status).toBe("online");
    expect(view.rows()).toHaveLength(0);
  });

  it("preserves results and identity across Primary switches", () => {
    const view = setup(); view.action("扫描 CATDlg").click(); vi.advanceTimersByTime(220);
    view.primary.remove();
    expect(view.surface.createPrimary()).toBe(view.primary);
    document.body.append(view.surface.createPrimary());
    expect(view.rows()).toHaveLength(2);
    expect(view.log).toHaveBeenCalledTimes(2);
  });

  it("invalidates old results on directory changes and refuses stale row actions", () => {
    const view = setup(); view.action("扫描 CATDlg").click(); vi.advanceTimersByTime(220);
    const uri = view.primary.model!.rows![0]!.uri;
    view.directory("/workspace/new"); view.log.mockClear();
    expect(view.rows()).toHaveLength(2);
    expect(view.rows()[0]!.querySelector<HTMLButtonElement>(".tail button")!.disabled).toBe(true);
    view.primary.dispatchEvent(new CustomEvent(KTC_CAA_PRIMARY_ACTION, { detail: { actionId: "openExternal", uri } }));
    expect(view.log).not.toHaveBeenCalled();
    view.action("扫描 CATDlg").click(); vi.advanceTimersByTime(220);
    expect(view.primary.model!.rows![0]!.uri).toContain("/workspace/new/");
  });

  it("cancels delayed work when changing directory or disposing", () => {
    const view = setup(); view.action("连接 Desk Tools").click();
    view.directory("/workspace/new"); vi.advanceTimersByTime(220);
    expect(view.primary.model?.running).toBe(false);
    expect(view.primary.model?.connection.status).toBe("offline");
    view.action("扫描 CATDlg").click(); view.surface.dispose(); view.log.mockClear();
    vi.advanceTimersByTime(220); expect(view.log).not.toHaveBeenCalled(); expect(view.rows()).toHaveLength(0);
  });

  it("does not scan without a directory", () => {
    const view = setup(); view.directory("");
    expect(view.action("扫描 CATDlg").disabled).toBe(true);
    view.primary.dispatchEvent(new CustomEvent(KTC_CAA_PRIMARY_ACTION, { detail: { actionId: "scan" } }));
    vi.advanceTimersByTime(220); expect(view.rows()).toHaveLength(0); expect(view.log).not.toHaveBeenCalled();
  });

  it("renders paths as text and preserves focused row buttons on state refresh", () => {
    ktcDefineCaaPrimary();
    const primary = document.createElement("ktc-caa-primary") as KtcCaaPrimary;
    document.body.append(primary);
    primary.model = { running: false, canScan: true, resultActionsEnabled: true, message: "", connection: { status: "offline", text: "" }, rows: [{ uri: "/fixture/x", relativePath: '<img src=x onerror="boom">.CATDlg' }] };
    const button = primary.shadowRoot!.querySelector<HTMLButtonElement>(".tail button")!;
    button.focus(); primary.model = { ...primary.model!, message: "状态更新" };
    expect(primary.shadowRoot!.activeElement).toBe(button);
    expect(primary.shadowRoot!.querySelector("img")).toBeNull();
    expect(primary.shadowRoot!.querySelector(".path")!.textContent).toContain("<img");
  });
});
