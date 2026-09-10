// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KtcTextRepairPrimary, KTC_TEXT_REPAIR_PRIMARY_ACTION } from "../ui/KtcTextRepairPrimary.js";
import { createPreviewHeaderAsciiSurface, createPreviewEncodingFixSurface } from "../../ui-preview/src/previewTextRepairSurface.js";

type Surface = ReturnType<typeof createPreviewHeaderAsciiSurface>;
const surfaces: Surface[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const surface of surfaces.splice(0)) surface.dispose();
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

function setup(kind: "headerAscii" | "encodingFix", initialDirectory = "/sample/workspace") {
  let directory = initialDirectory;
  const log = vi.fn<(line: string) => void>();
  const surface = (kind === "headerAscii" ? createPreviewHeaderAsciiSurface : createPreviewEncodingFixSurface)({ directory: () => directory, log });
  surfaces.push(surface);
  const view = surface.createPrimary() as KtcTextRepairPrimary;
  document.body.append(view);
  const root = view.shadowRoot!, bar = root.querySelector("ktc-primary-action-bar")!;
  const writeLabel = kind === "headerAscii" ? "修复" : "转换";
  return { surface, view, root, log, writeLabel,
    button(label: string) { return Array.from(bar.shadowRoot!.querySelectorAll("button")).find(button => button.textContent === label)!; },
    write() { this.button(writeLabel).click(); },
    scan() { this.button("预检").click(); vi.advanceTimersByTime(100); },
    get rows() { return view.model!.rows; },
    get status() { return view.model!.status; },
    get dialog() { return document.querySelector<HTMLDialogElement>("dialog[open]"); },
    confirm(cancel = false) {
      const shadow = this.dialog!.firstElementChild!.shadowRoot!;
      Array.from(shadow.querySelectorAll("button")).find(button => button.textContent === (cancel ? "取消" : `${writeLabel}（模拟）`))!.click();
    },
    option(label: string) { return root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; },
    target(value: "utf8" | "gbk") { const target = root.querySelector("select")!; target.value = value; target.dispatchEvent(new Event("change")); },
    directory(next: string, notify = true) { directory = next; if (notify) surface.directoryChanged(); },
  };
}

describe("text repair Preview uses the real Host-neutral Primary, only memory fixtures", () => {
  it.each(["headerAscii", "encodingFix"] as const)("%s starts idle with directly reachable write and survives ordinary removal/reopening", kind => {
    const ctx = setup(kind);
    expect(ctx.view).toBeInstanceOf(KtcTextRepairPrimary);
    expect(ctx.rows).toEqual([]); expect(ctx.log).not.toHaveBeenCalled();
    expect(ctx.button(ctx.writeLabel).disabled).toBe(false);
    expect(ctx.view.model!.summary).toContain("不扫描或写入真实文件");
    ctx.scan(); const original = ctx.rows;
    ctx.view.remove(); expect(ctx.surface.createPrimary()).toBe(ctx.view); document.body.append(ctx.surface.createPrimary());
    expect(ctx.rows).toBe(original);
    ctx.surface.directoryChanged(); expect(ctx.rows).toBe(original);
  });

  it.each(["headerAscii", "encodingFix"] as const)("%s prevents duplicate operations and retains results during a rescan", kind => {
    const ctx = setup(kind); ctx.scan();
    const rows = ctx.rows;
    ctx.button("预检").click();
    expect(ctx.rows).toBe(rows); expect(ctx.status).toContain("正在重新预检");
    expect(ctx.view.model!.busy).toBe(true);
    const calls = ctx.log.mock.calls.length;
    ctx.write(); ctx.button("预检").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    ctx.option("头文件").dispatchEvent(new Event("change"));
    expect(ctx.log).toHaveBeenCalledTimes(calls);
    vi.advanceTimersByTime(100); expect(ctx.view.model!.busy).toBe(false);
    expect(ctx.rows).toHaveLength(kind === "headerAscii" ? 3 : 4);
  });

  it.each(["headerAscii", "encodingFix"] as const)("%s direct write auto-preflights then confirms; cancel preserves results and makes no changes", kind => {
    const ctx = setup(kind); ctx.write();
    expect(ctx.dialog).toBeNull(); expect(ctx.status).toContain("先按当前选项重新预检");
    vi.advanceTimersByTime(100);
    expect(ctx.dialog).not.toBeNull(); expect(ctx.view.model!.busy).toBe(true);
    expect(ctx.dialog!.firstElementChild!.shadowRoot!.textContent).toContain("不读取、不写入真实文件");
    const original = structuredClone(ctx.rows);
    ctx.confirm(true); vi.advanceTimersByTime(100);
    expect(ctx.rows).toEqual(original); expect(ctx.dialog).toBeNull();
    expect(ctx.status).toContain(`已取消${ctx.writeLabel}`); expect(ctx.button(ctx.writeLabel).disabled).toBe(false);
    expect(ctx.log.mock.calls.some(([line]) => line.includes("已修复") || line.includes("已转换"))).toBe(false);
  });

  it("ASCII 默认修复只处理可修复样例，宽字节 BOM 保留；定位包括具体问题行", () => {
    const ctx = setup("headerAscii"); ctx.scan();
    expect(ctx.rows.find(row => row.id === "bom")!.badge).toBe("跳过宽字节 BOM");
    ctx.option("显示详细（原字符 → 修正为）").click();
    const issues = ctx.root.querySelector<HTMLElement>(".issues")!;
    expect(issues.hidden).toBe(false);
    issues.querySelectorAll("button")[1]!.click();
    expect(ctx.log).toHaveBeenLastCalledWith(expect.stringContaining("/sample/workspace/include/PNXPart.h:18"));
    ctx.write(); vi.advanceTimersByTime(100); ctx.confirm(); vi.advanceTimersByTime(100);
    expect(ctx.rows.map(row => row.id)).toEqual(["bom"]);
    expect(ctx.status).toContain("已修复 2 个内存样例");
    ctx.write(); vi.advanceTimersByTime(100);
    expect(ctx.dialog).toBeNull(); expect(ctx.status).toContain("没有可自动修复");
  });

  it("ASCII 保留 GBK 与去 BOM 使用当前选项，取消保留后仍能扫描到未处理中文", () => {
    const ctx = setup("headerAscii");
    ctx.option("保留 GBK 中文注释").click(); ctx.option("去除 BOM（含 UTF-8 BOM / UTF-16）→ UTF-8").click();
    ctx.write(); vi.advanceTimersByTime(100);
    expect(ctx.dialog!.firstElementChild!.shadowRoot!.textContent).toContain("保留 GBK 中文注释");
    ctx.confirm(); vi.advanceTimersByTime(100);
    expect(ctx.rows).toEqual([]); expect(ctx.status).toContain("已修复 3");
    expect(ctx.root.querySelector(".empty")!.textContent).toBe("未发现需要处理的样例。");
    ctx.option("保留 GBK 中文注释").click(); ctx.scan();
    expect(ctx.rows).toHaveLength(1); expect(ctx.rows[0]!.issues!.map(issue => issue.from)).toEqual(["中文注释"]);
  });

  it("编码保留检测/目标/仅报告行；详情与文件打开、更多设置均有模拟反馈", () => {
    const ctx = setup("encodingFix"); ctx.scan();
    expect(ctx.rows.map(row => row.badge)).toEqual(["GBK → UTF-8", "UTF-8 BOM → UTF-8", "符合目标", "仅报告"]);
    ctx.option("显示详细（BOM 十六进制、检测说明）").click();
    expect(Array.from(ctx.root.querySelectorAll<HTMLElement>(".detail")).every(node => !node.hidden)).toBe(true);
    expect(ctx.root.textContent).toContain("BOM EF BB BF");
    ctx.root.querySelector<HTMLButtonElement>(".open")!.click();
    expect(ctx.log).toHaveBeenLastCalledWith(expect.stringContaining("打开文件 /sample/workspace/include/PNXPart.h；不调用 Host"));
    ctx.button("更多设置").click(); expect(ctx.log).toHaveBeenLastCalledWith(expect.stringContaining("不调用 VS Code"));
    ctx.write(); vi.advanceTimersByTime(100); ctx.confirm(); vi.advanceTimersByTime(100);
    expect(ctx.rows.map(row => row.badge)).toEqual(["符合目标", "符合目标", "符合目标", "仅报告"]);
    expect(ctx.rows[3]!.detail).toContain("不会自动转换");
    expect(ctx.status).toContain("已转换 2");
    ctx.write(); vi.advanceTimersByTime(100); expect(ctx.dialog).toBeNull(); expect(ctx.status).toContain("其余仅报告");
  });

  it("目标编码/范围改变撤销旧预检，直接转换仍可用且先重扫；详情开关不失效", () => {
    const ctx = setup("encodingFix"); ctx.scan();
    const status = ctx.status, rows = ctx.rows;
    ctx.option("显示详细（BOM 十六进制、检测说明）").click();
    expect(ctx.status).toBe(status); expect(ctx.rows).toBe(rows);
    ctx.target("gbk"); expect(ctx.status).toContain("旧预检已失效"); expect(ctx.view.model!.summary).toContain("上次结果仅供查看");
    expect(ctx.button("转换").disabled).toBe(false);
    ctx.option(".md 文档").click(); ctx.option("头文件").click();
    ctx.write(); expect(ctx.dialog).toBeNull(); vi.advanceTimersByTime(100);
    expect(ctx.rows.map(row => row.id)).toEqual(["source", "unknown"]);
    expect(ctx.dialog!.firstElementChild!.shadowRoot!.textContent).toContain("目标 GBK");
    ctx.confirm(); vi.advanceTimersByTime(100);
    expect(ctx.rows[0]!.description).toBe("GBK → GBK");
    expect(ctx.status).toContain("已转换 1");
  });

  it.each(["headerAscii", "encodingFix"] as const)("%s invalid directory or empty scope disables actions with visible reason", kind => {
    const ctx = setup(kind, "");
    expect(ctx.status).toContain("请先选择工作目录"); expect(ctx.button(ctx.writeLabel).disabled).toBe(true);
    expect(ctx.button(ctx.writeLabel).parentElement!.title).toContain("请先选择工作目录");
    ctx.directory("/sample/workspace"); ctx.option("头文件").click(); ctx.option("源文件").click();
    if (kind === "encodingFix") ctx.option(".md 文档").click();
    expect(ctx.button("预检").disabled).toBe(true); expect(ctx.status).toContain("至少勾选");
    expect(ctx.view.model!.scope.includeMarkdown).toBe(false);
    ctx.view.dispatchEvent(new CustomEvent(KTC_TEXT_REPAIR_PRIMARY_ACTION, { detail: { action: "scan" } }));
    vi.advanceTimersByTime(100); expect(ctx.rows).toEqual([]);
  });

  it.each(["headerAscii", "encodingFix"] as const)("%s directory change cancels scan, confirmation and pending write; no stale completion", kind => {
    const ctx = setup(kind); ctx.button("预检").click(); ctx.directory("/sample/second"); vi.advanceTimersByTime(100);
    expect(ctx.rows).toEqual([]); expect(ctx.status).toContain("旧预检已失效");
    ctx.write(); vi.advanceTimersByTime(100); const oldExecute = ctx.dialog!.firstElementChild!.shadowRoot!.querySelectorAll("button")[1]!;
    ctx.directory("/sample/third"); oldExecute.click(); vi.advanceTimersByTime(100);
    expect(ctx.dialog).toBeNull(); expect(ctx.rows).toEqual([]);
    ctx.write(); vi.advanceTimersByTime(100); ctx.confirm(); ctx.directory("/sample/fourth"); vi.advanceTimersByTime(100);
    expect(ctx.rows).toEqual([]); expect(ctx.view.model!.busy).toBe(false);
    expect(ctx.log.mock.calls.some(([line]) => line.includes("已修复") || line.includes("已转换"))).toBe(false);
    ctx.scan(); expect(ctx.rows.every(row => row.fullPath.startsWith("/sample/fourth/"))).toBe(true);
  });

  it.each(["headerAscii", "encodingFix"] as const)("%s confirmation rechecks current directory even without notification; Escape cancels", kind => {
    const ctx = setup(kind); ctx.write(); vi.advanceTimersByTime(100);
    ctx.dialog!.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(ctx.dialog).toBeNull(); expect(ctx.status).toContain("已取消");
    ctx.write(); vi.advanceTimersByTime(100); ctx.directory("/sample/new", false); ctx.confirm(); vi.advanceTimersByTime(100);
    expect(ctx.rows).toEqual([]); expect(ctx.status).toContain("旧预检已失效");
    ctx.scan(); expect(ctx.rows.every(row => row.fullPath.startsWith("/sample/new/"))).toBe(true);
  });

  it.each(["headerAscii", "encodingFix"] as const)("%s disposal cancels timers, removes its dialog and rejects reopening", kind => {
    const ctx = setup(kind); ctx.write(); vi.advanceTimersByTime(100); ctx.confirm();
    ctx.surface.dispose(); const callCount = ctx.log.mock.calls.length; vi.advanceTimersByTime(100);
    expect(ctx.log).toHaveBeenCalledTimes(callCount); expect(ctx.view.isConnected).toBe(false);
    expect(document.querySelector("dialog")).toBeNull();
    expect(() => ctx.surface.createPrimary()).toThrow("disposed");
  });

  it.each(["headerAscii", "encodingFix"] as const)("%s ordinary tool close neither cancels a scan nor loses local options", kind => {
    const ctx = setup(kind);
    if (kind === "headerAscii") ctx.option("保留 GBK 中文注释").click(); else ctx.target("gbk");
    ctx.button("预检").click(); ctx.view.remove(); vi.advanceTimersByTime(100);
    document.body.append(ctx.surface.createPrimary());
    expect(ctx.view.model!.busy).toBe(false); expect(ctx.rows.length).toBeGreaterThan(0);
    if (kind === "headerAscii") expect(ctx.option("保留 GBK 中文注释").checked).toBe(true);
    else expect(ctx.root.querySelector("select")!.value).toBe("gbk");
    expect(ctx.status).toContain("预检完成");
  });

  it("all public actions avoid Host, network and persistent storage; fixtures remain per-surface", () => {
    const host = vi.fn(() => { throw new Error("must not call Host"); }), fetch = vi.fn(() => { throw new Error("must not fetch"); });
    vi.stubGlobal("acquireVsCodeApi", host); vi.stubGlobal("fetch", fetch);
    const storage = vi.spyOn(Storage.prototype, "setItem"), open = vi.spyOn(window, "open");
    const ctx = setup("encodingFix"); ctx.write(); vi.advanceTimersByTime(100); ctx.confirm(); vi.advanceTimersByTime(100);
    ctx.root.querySelector<HTMLButtonElement>(".open")!.click(); ctx.button("更多设置").click();
    expect(host).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    expect(ctx.log.mock.calls.every(([line]) => line.endsWith("（模拟）"))).toBe(true);
    const fresh = setup("encodingFix"); fresh.scan(); expect(fresh.rows[0]!.badge).toBe("GBK → UTF-8");
  });
});
