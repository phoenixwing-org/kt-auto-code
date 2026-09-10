// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { FileResultSummary, WebviewInboundMessage } from "../tools/types.js";
import { KTC_TEXT_REPAIR_PRIMARY_ACTION, ktcDefineTextRepairPrimary, type KtcTextRepairPrimaryAction } from "../ui/KtcTextRepairPrimary.js";
import { ktcCreateTextRepairPrimaryModel, ktcTextRepairPrimaryActionToMessage, type KtcTextRepairPrimaryInput } from "./textRepairPrimaryAdapter.js";

afterEach(() => document.body.replaceChildren());

const result: FileResultSummary = {
  file: "客户名.h", relativePath: "include/客户名.h", fullPath: "C:\\repo\\include\\客户名.h", issueCount: 2, topLine: 7,
  issues: [
    { line: 7, column: 4, byte: 147, kind: "curly-quote", fromLabel: "弯引号 0x93", toLabel: '" (0x22)', suggestedAscii: '"', context: "原始中文与 quote" },
    { line: 19, column: 2, byte: 214, kind: "non-ascii", fromLabel: "GBK 中文（2 字节）", toLabel: "ASCII 空格", context: "另一段原始源码" },
  ],
};
const headerInput: KtcTextRepairPrimaryInput = {
  toolId: "headerAscii", directory: "C:\\repo", showDetails: true, showEncDetails: false,
  options: { preserveGbk: true, stripBom: true },
  scope: { includeHeaders: true, includeSource: false, includeMarkdown: true },
  toolState: { status: "done", message: "已预检 21 个文件，1 个文件有问题。", scanned: 21, issueFiles: 1, fixedFiles: 0, results: [result] },
};
const encodingInput: KtcTextRepairPrimaryInput = {
  toolId: "encodingFix", directory: "/actual/project", showDetails: true, showEncDetails: false,
  options: { encodingDefaultTarget: "gbk", encodingHeaderTarget: "ascii", encodingSourceTarget: "utf8", encodingMarkdownTarget: "inherit" },
  toolState: { status: "done", message: "按真实项目目标完成。", scanned: 40, issueFiles: 2, fixedFiles: 1, encodingResults: [
    { file: "Wide.h", relativePath: "include/Wide.h", fullPath: "/actual/project/include/Wide.h", detected: "UTF-16 LE", expected: "ASCII", status: "mismatch", suggestedAction: "UTF-16 → ASCII", detail: "BOM FF FE · 高可信", converted: false },
    { file: "Good.cpp", relativePath: "src/Good.cpp", fullPath: "/actual/project/src/Good.cpp", detected: "UTF-8", expected: "UTF-8", status: "ok", suggestedAction: "—", converted: true },
    { file: "Unknown.cpp", relativePath: "src/Unknown.cpp", fullPath: "/actual/project/src/Unknown.cpp", detected: "不确定", expected: "UTF-8", status: "unsupported", suggestedAction: "仅报告", detail: "不可无损判定" },
  ] },
};

describe("formal TextRepair Primary adapter", () => {
  it("defaults follow existing options and keep direct repair/conversion available without a result or directory", () => {
    for (const toolId of ["headerAscii", "encodingFix"] as const) {
      const model = ktcCreateTextRepairPrimaryModel({ toolId, directory: "" });
      expect(model).toMatchObject({ kind: toolId, directory: "", busy: false, scanEnabled: true, writeEnabled: true,
        preserveGbk: false, stripBom: false, showDetails: false, targetEncoding: "utf8", status: "", summary: "", rows: [] });
      expect(model.scope).toEqual({ includeHeaders: true, includeSource: true, includeMarkdown: toolId === "encodingFix" });
      expect(ktcTextRepairPrimaryActionToMessage(model, { action: "scan" })).toEqual({ type: "run", toolId, action: "scan" });
      const action = toolId === "headerAscii" ? "fix" : "convert";
      expect(ktcTextRepairPrimaryActionToMessage(model, { action })).toEqual({ type: "run", toolId, action });
      const emptyScope = ktcCreateTextRepairPrimaryModel({ toolId, directory: "", scope: { includeHeaders: false, includeSource: false, includeMarkdown: false } });
      expect(emptyScope.writeEnabled).toBe(true); // Existing Host validation is not replaced by a new UI gate.
    }
  });

  it("projects every real header issue and exact source path without modifying the Host's highlighting cache", () => {
    const before = structuredClone(headerInput);
    const model = ktcCreateTextRepairPrimaryModel(headerInput);
    expect(model.rows).toEqual([{
      id: result.fullPath, fullPath: result.fullPath, relativePath: result.relativePath, line: 7,
      badge: "L7 ×2", tone: "error", highlightNonAscii: true,
      issues: result.issues.map(issue => ({ line: issue.line, column: issue.column, from: issue.fromLabel, to: issue.toLabel })),
    }]);
    expect(model.status).toBe(headerInput.toolState!.message);
    expect(model.summary).toBe("已预检 21 个文件 · 1 个问题文件 · 已修复 0 个文件");
    expect(model.scope).toEqual({ includeHeaders: true, includeSource: false, includeMarkdown: false });
    expect(model.showDetails).toBe(true);
    const row = model.rows[0]!;
    expect(ktcTextRepairPrimaryActionToMessage(model, { action: "open", rowId: row.id })).toEqual({ type: "openIssue", toolId: "headerAscii", file: result.fullPath, line: 7 });
    expect(ktcTextRepairPrimaryActionToMessage(model, { action: "open", rowId: row.id, line: 19 })).toEqual({ type: "openIssue", toolId: "headerAscii", file: result.fullPath, line: 19 });
    expect(headerInput).toEqual(before); // byte/kind/context remain in latestHeaderResults; openIssue resolves them in Host.
    expect(structuredClone(model)).toEqual(model);
  });

  it("preserves the Host issue count and legacy file fallback rather than deriving fictional totals from display rows", () => {
    const model = ktcCreateTextRepairPrimaryModel({ ...headerInput, toolState: { status: "done", results: [{ ...result, relativePath: undefined, issueCount: 12 }] } });
    expect(model.rows[0]!.relativePath).toBe("客户名.h");
    expect(model.rows[0]!.badge).toBe("L7 ×12"); expect(model.rows[0]!.issues).toHaveLength(2);
    expect(model.summary).toBe(""); expect(model.status).toBe("");
  });

  it("projects actual BOM/detection/confidence, status and inherited/overridden targets without fixture text", () => {
    const model = ktcCreateTextRepairPrimaryModel(encodingInput);
    expect(model.targetEncoding).toBe("gbk");
    expect(model.targetSummary).toBe("项目覆盖：头文件 ASCII · 源文件 UTF-8");
    expect(model.showDetails).toBe(false); // Encoding uses showEncDetails, not the header checkbox.
    expect(model.rows.map(row => [row.badge, row.tone, row.description, row.detail])).toEqual([
      ["UTF-16 → ASCII", "error", "UTF-16 LE → ASCII", "BOM FF FE · 高可信"],
      ["✓", "success", "UTF-8 → UTF-8", undefined],
      ["仅报告", undefined, "不确定 → UTF-8", "不可无损判定"],
    ]);
    expect(model.summary).toBe("已预检 40 个文件 · 2 个不符合目标 · 已转换 1 个文件");
    expect(JSON.stringify(model)).not.toMatch(/模拟|样例|fixture/u);
    expect(ktcTextRepairPrimaryActionToMessage(model, { action: "open", rowId: model.rows[0]!.id, line: 99 })).toEqual({
      type: "openEncodingFile", toolId: "encodingFix", file: "/actual/project/include/Wide.h",
    }); // No openIssue event, so the existing Host clears character decorations as before.
    const inherited = ktcCreateTextRepairPrimaryModel({ ...encodingInput, options: {}, showEncDetails: true });
    expect(inherited.targetSummary).toBe("头文件、源文件和 Markdown 均继承默认目标。"); expect(inherited.showDetails).toBe(true);
  });

  it.each([
    ["headerAscii", false, "未发现非 ASCII 或问题字节。"],
    ["headerAscii", true, "未发现弯引号等问题字节。"],
    ["encodingFix", false, "所有文件均符合当前项目编码目标。"],
  ] as const)("%s completed zero-result state uses actual outcome, preserveGbk=%s", (toolId, preserveGbk, emptyMessage) => {
    const model = ktcCreateTextRepairPrimaryModel({ toolId, directory: "/real", options: { preserveGbk }, toolState: { status: "done", scanned: 0, issueFiles: 0 } });
    expect(model.emptyMessage).toBe(emptyMessage); expect(model.rows).toEqual([]);
    expect(model.summary).toContain("已预检 0 个文件");
  });

  it("running/error states keep cached results and real message without claiming success", () => {
    for (const status of ["running", "error"] as const) {
      const message = status === "running" ? "正在修复真实目录…" : "读取失败：权限不足";
      const model = ktcCreateTextRepairPrimaryModel({ ...headerInput, toolState: { ...headerInput.toolState!, status, message } });
      expect(model.rows).toHaveLength(1); expect(model.status).toBe(message); expect(model.emptyMessage).toBe("");
      expect(model.busy).toBe(status === "running"); expect(model.statusTone).toBe(status === "error" ? "error" : undefined);
      if (status === "running") expect(model.disabledReason).toBe(message);
    }
  });

  it("maps options to the exact old scope/project commands, leaves detail flags local and rejects other tool actions", () => {
    const header = ktcCreateTextRepairPrimaryModel(headerInput), encoding = ktcCreateTextRepairPrimaryModel(encodingInput);
    for (const key of ["includeHeaders", "includeSource"] as const) {
      expect(ktcTextRepairPrimaryActionToMessage(header, { action: "setScope", key, value: false })).toEqual({ type: "setOption", toolId: "scope", key, value: false });
    }
    expect(ktcTextRepairPrimaryActionToMessage(encoding, { action: "setScope", key: "includeMarkdown", value: true })).toEqual({ type: "setOption", toolId: "scope", key: "includeMarkdown", value: true });
    expect(ktcTextRepairPrimaryActionToMessage(header, { action: "setScope", key: "includeMarkdown", value: true })).toBeUndefined();
    for (const key of ["preserveGbk", "stripBom"] as const) {
      expect(ktcTextRepairPrimaryActionToMessage(header, { action: "setOption", key, value: true })).toEqual({ type: "setOption", toolId: "headerAscii", key, value: true });
      expect(ktcTextRepairPrimaryActionToMessage(encoding, { action: "setOption", key, value: true })).toBeUndefined();
    }
    for (const model of [header, encoding]) expect(ktcTextRepairPrimaryActionToMessage(model, { action: "setOption", key: "showDetails", value: true })).toBeUndefined();
    expect(ktcTextRepairPrimaryActionToMessage(encoding, { action: "setTarget", value: "utf8" })).toEqual({ type: "setEncodingDefaultTarget", toolId: "encodingFix", target: "utf8" });
    expect(ktcTextRepairPrimaryActionToMessage(encoding, { action: "settings" })).toEqual({ type: "openEncodingSettings", toolId: "encodingFix" });
    expect(ktcTextRepairPrimaryActionToMessage(header, { action: "settings" })).toBeUndefined();
    expect(ktcTextRepairPrimaryActionToMessage(header, { action: "setTarget", value: "gbk" })).toBeUndefined();
    expect(ktcTextRepairPrimaryActionToMessage(header, { action: "convert" })).toBeUndefined();
    expect(ktcTextRepairPrimaryActionToMessage(encoding, { action: "fix" })).toBeUndefined();
  });

  it("rejects stale row IDs/invalid line numbers and all actions while busy", () => {
    const model = ktcCreateTextRepairPrimaryModel(headerInput);
    expect(ktcTextRepairPrimaryActionToMessage(model, { action: "open", rowId: "/not-in-the-report" })).toBeUndefined();
    for (const line of [0, -1, 1.5, NaN, Infinity]) expect(ktcTextRepairPrimaryActionToMessage(model, { action: "open", rowId: result.fullPath, line })).toBeUndefined();
    for (const action of [
      { action: "scan" }, { action: "fix" }, { action: "settings" }, { action: "setTarget", value: "gbk" },
      { action: "setScope", key: "includeSource", value: false }, { action: "setOption", key: "preserveGbk", value: true },
      { action: "open", rowId: result.fullPath, line: 7 },
    ] as const) expect(ktcTextRepairPrimaryActionToMessage({ ...model, busy: true }, action)).toBeUndefined();
    expect(ktcTextRepairPrimaryActionToMessage({ ...model, writeEnabled: false }, { action: "fix" })).toBeUndefined();
    expect(ktcTextRepairPrimaryActionToMessage({ ...model, scanEnabled: false }, { action: "scan" })).toBeUndefined();
  });

  it("actual shared ASCII DOM forwards old signals, preserves non-ASCII name marks and local detail toggles", () => {
    ktcDefineTextRepairPrimary();
    const panel = document.createElement("ktc-text-repair-primary");
    let input = { ...headerInput, showDetails: false };
    panel.model = ktcCreateTextRepairPrimaryModel(input);
    const messages: WebviewInboundMessage[] = [];
    panel.addEventListener(KTC_TEXT_REPAIR_PRIMARY_ACTION, event => {
      const action = (event as CustomEvent<KtcTextRepairPrimaryAction>).detail;
      if (action.action === "setOption" && action.key === "showDetails") {
        input = { ...input, showDetails: action.value }; panel.model = ktcCreateTextRepairPrimaryModel(input); return;
      }
      const message = ktcTextRepairPrimaryActionToMessage(panel.model!, action); if (message) messages.push(message);
    });
    document.body.append(panel);
    const root = panel.shadowRoot!, bar = root.querySelector("ktc-primary-action-bar")!;
    bar.shadowRoot!.querySelectorAll("button")[0]!.click(); bar.shadowRoot!.querySelectorAll("button")[1]!.click();
    root.querySelector<HTMLInputElement>('input[aria-label="保留 GBK 中文注释"]')!.click();
    root.querySelector<HTMLInputElement>('input[aria-label="显示详细（原字符 → 修正为）"]')!.click();
    expect(root.querySelector<HTMLElement>(".issues")!.hidden).toBe(false);
    expect(root.querySelector("mark.result-hit")!.textContent).toBe("客户名");
    root.querySelectorAll<HTMLButtonElement>(".issues button")[1]!.click();
    expect(messages).toEqual([
      { type: "run", toolId: "headerAscii", action: "scan" }, { type: "run", toolId: "headerAscii", action: "fix" },
      { type: "setOption", toolId: "headerAscii", key: "preserveGbk", value: false },
      { type: "openIssue", toolId: "headerAscii", file: result.fullPath, line: 19 },
    ]);
    expect(panel.model!.showDetails).toBe(true); expect(panel.model!.status).toBe(headerInput.toolState!.message);
  });

  it("actual shared encoding DOM keeps project-setting and file-opening messages separate from ASCII", () => {
    ktcDefineTextRepairPrimary();
    const panel = document.createElement("ktc-text-repair-primary");
    panel.model = ktcCreateTextRepairPrimaryModel({ ...encodingInput, showEncDetails: true }); document.body.append(panel);
    const messages: WebviewInboundMessage[] = [];
    panel.addEventListener(KTC_TEXT_REPAIR_PRIMARY_ACTION, event => {
      const message = ktcTextRepairPrimaryActionToMessage(panel.model!, (event as CustomEvent<KtcTextRepairPrimaryAction>).detail);
      if (message) messages.push(message);
    });
    const root = panel.shadowRoot!, buttons = root.querySelector("ktc-primary-action-bar")!.shadowRoot!.querySelectorAll("button");
    buttons[1]!.click(); buttons[2]!.click(); root.querySelector<HTMLButtonElement>(".open")!.click();
    const target = root.querySelector("select")!; target.value = "utf8"; target.dispatchEvent(new Event("change"));
    expect(messages).toEqual([
      { type: "run", toolId: "encodingFix", action: "convert" }, { type: "openEncodingSettings", toolId: "encodingFix" },
      { type: "openEncodingFile", toolId: "encodingFix", file: "/actual/project/include/Wide.h" },
      { type: "setEncodingDefaultTarget", toolId: "encodingFix", target: "utf8" },
    ]);
    expect(root.querySelector<HTMLElement>(".detail")!.hidden).toBe(false);
    expect(root.querySelector(".detail")!.textContent).toBe("BOM FF FE · 高可信");
    expect(root.querySelectorAll("mark.result-hit")).toHaveLength(0);
  });
});
