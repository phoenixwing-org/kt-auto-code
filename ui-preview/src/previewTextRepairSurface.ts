import {
  ktcDefineTextRepairPrimary,
  KTC_TEXT_REPAIR_PRIMARY_ACTION,
  type KtcTextRepairKind,
  type KtcTextRepairPrimaryAction,
  type KtcTextRepairPrimaryModel,
  type KtcTextRepairRow,
} from "../../src/ui/KtcTextRepairPrimary.js";

interface KtcPreviewTextRepairOptions {
  readonly directory: () => string;
  readonly log: (line: string) => void;
}
interface KtcPreviewTextRepairSurface {
  createPrimary(): HTMLElement;
  directoryChanged(): void;
  dispose(): void;
}

// Display fixtures, not an encoding implementation: no bytes, filesystem, Host or storage are accessed.
const HEADER_FIXTURE = [
  { id: "header", path: "include/PNXPart.h", scope: "includeHeaders", issues: [
    { kind: "punctuation", line: 12, column: 8, from: "“", to: '"' },
    { kind: "gbk", line: 18, column: 4, from: "中文注释", to: "ASCII 空格" },
  ] },
  { id: "source", path: "src/PNXPart.cpp", scope: "includeSource", issues: [
    { kind: "punctuation", line: 9, column: 12, from: "’", to: "'" },
  ] },
  { id: "bom", path: "include/LegacyUnicode.h", scope: "includeHeaders", issues: [
    { kind: "bom", line: 1, column: 1, from: "UTF-16 BOM FF FE", to: "UTF-8 无 BOM" },
  ] },
] as const;
const ENCODING_FIXTURE = [
  { id: "header", path: "include/PNXPart.h", scope: "includeHeaders", detected: "GBK", detail: "GBK 样例 · 检测说明（模拟）" },
  { id: "source", path: "src/PNXPart.cpp", scope: "includeSource", detected: "UTF-8 BOM", detail: "BOM EF BB BF · UTF-8 样例（模拟）" },
  { id: "markdown", path: "docs/使用说明.md", scope: "includeMarkdown", detected: "UTF-8", detail: "无 BOM · UTF-8 样例（模拟）" },
  { id: "unknown", path: "src/Unknown.cpp", scope: "includeSource", detected: "无法确定", detail: "检测依据不足，仅报告；样例不会自动转换。" },
] as const;

function createSurface(kind: KtcTextRepairKind, options: KtcPreviewTextRepairOptions): KtcPreviewTextRepairSurface {
  ktcDefineTextRepairPrimary();
  const view = document.createElement("ktc-text-repair-primary");
  const name = kind === "headerAscii" ? "头文件 ASCII" : "编码修正";
  const writeLabel = kind === "headerAscii" ? "修复" : "转换";
  let directory = options.directory().trim();
  let busy = false, disposed = false, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let readyRevision: number | undefined;
  let confirmPending = false;
  let rows: KtcTextRepairRow[] = [];
  const scope = { includeHeaders: true, includeSource: true, includeMarkdown: kind === "encodingFix" };
  let preserveGbk = false, stripBom = false, showDetails = false;
  let targetEncoding: "utf8" | "gbk" = "utf8";
  let status = `点击预检查看内存样例；也可直接${writeLabel}后确认（模拟）。`;
  let summary = "仅内存样例，不扫描或写入真实文件。";
  const fixedIssues = new Set<string>(), converted = new Map<string, string>();
  const log = (text: string) => options.log(`[${name}] ${text}（模拟）`);
  const fullPath = (path: string) => `${directory.replace(/[\\/]+$/u, "")}/${path}`;
  const validScope = () => scope.includeHeaders || scope.includeSource || (kind === "encodingFix" && scope.includeMarkdown);
  const valid = () => !!directory && validScope();
  const expected = () => targetEncoding === "gbk" ? "GBK" : "UTF-8";
  const isHeaderIssueVisible = (id: string, issueKind: string) => !fixedIssues.has(`${id}:${issueKind}`) && !(preserveGbk && issueKind === "gbk");
  const activeHeaderIssues = (item: typeof HEADER_FIXTURE[number]) => item.issues.filter(issue => isHeaderIssueVisible(item.id, issue.kind));
  const computeRows = (): KtcTextRepairRow[] => {
    if (kind === "headerAscii") return HEADER_FIXTURE.filter(item => scope[item.scope]).flatMap(item => {
      const issues = activeHeaderIssues(item);
      if (!issues.length) return [];
      const blockedBom = issues.every(issue => issue.kind === "bom") && !stripBom;
      return [{ id: item.id, relativePath: item.path, fullPath: fullPath(item.path), line: issues[0]!.line,
        badge: blockedBom ? "跳过宽字节 BOM" : `L${issues[0]!.line} ×${issues.length}`, tone: "warning" as const,
        ...(blockedBom ? { description: "未勾选去除 BOM，保留该文件；可先处理其他样例。" } : {}), issues }];
    });
    return ENCODING_FIXTURE.filter(item => scope[item.scope]).map(item => {
      const detected = converted.get(item.id) ?? item.detected;
      const unsupported = item.id === "unknown", matches = detected === expected();
      return { id: item.id, relativePath: item.path, fullPath: fullPath(item.path),
        badge: unsupported ? "仅报告" : matches ? "符合目标" : `${detected} → ${expected()}`,
        tone: matches ? "success" : "warning", description: `${detected} → ${expected()}`,
        detail: converted.has(item.id) ? `已转换内存样例为 ${detected}；未写真实文件。` : item.detail };
    });
  };
  const candidateIds = (): string[] => kind === "headerAscii"
    ? HEADER_FIXTURE.filter(item => scope[item.scope] && activeHeaderIssues(item).some(issue => issue.kind !== "bom" || stripBom)).map(item => item.id)
    : ENCODING_FIXTURE.filter(item => scope[item.scope] && item.id !== "unknown" && (converted.get(item.id) ?? item.detected) !== expected()).map(item => item.id);
  const scannedCount = () => (kind === "headerAscii" ? HEADER_FIXTURE : ENCODING_FIXTURE).filter(item => scope[item.scope]).length;
  const publish = () => {
    const model: KtcTextRepairPrimaryModel = {
      kind, directory, busy, scanEnabled: valid(), writeEnabled: valid(), scope: { ...scope }, preserveGbk, stripBom, showDetails, targetEncoding,
      disabledReason: busy ? "正在处理内存样例，请稍候。" : !directory ? "请先选择工作目录。" : !validScope() ? "请至少勾选一种适用范围。" : undefined,
      targetSummary: "头文件、源文件和 Markdown 均继承默认目标；项目覆盖请在更多设置中配置。",
      status: !directory ? "请先选择工作目录。" : !validScope() ? "请至少勾选一种适用范围。" : status, summary, rows,
      emptyMessage: readyRevision === revision ? "未发现需要处理的样例。" : "尚无当前范围的预检结果。",
    };
    view.model = model;
  };
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", `${name}模拟确认`);
  dialog.style.cssText = "color:var(--vscode-foreground);background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);padding:12px;max-width:calc(100vw - 24px);width:420px;font:var(--vscode-font-size,13px)/1.4 var(--vscode-font-family,system-ui)";
  const dialogStyle = document.createElement("style");
  dialogStyle.textContent = "h2 {font-size:14px;margin:0 0 8px;} p{margin:8px 0;overflow-wrap:anywhere;} footer{display:flex;gap:6px;justify-content:flex-end;} button{font:inherit;padding:4px 10px;border:1px solid var(--vscode-button-border,var(--vscode-panel-border));background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);} button:last-child{background:var(--vscode-button-background);color:var(--vscode-button-foreground);} button:focus-visible{outline:1px solid var(--vscode-focusBorder);}";
  // The stylesheet belongs to this disposable dialog, never to the Preview shell.
  const shell = document.createElement("div"); const shadow = shell.attachShadow({ mode: "open" });
  const heading = document.createElement("h2"), message = document.createElement("p"), safety = document.createElement("p"), footer = document.createElement("footer");
  heading.textContent = `${writeLabel}内存样例`;
  safety.textContent = "仅模拟正式确认流程，不读取、不写入真实文件。";
  const cancel = document.createElement("button"), execute = document.createElement("button");
  cancel.textContent = "取消"; execute.textContent = `${writeLabel}（模拟）`;
  footer.append(cancel, execute); shadow.append(dialogStyle, heading, message, safety, footer); dialog.append(shell);
  const closeDialog = () => { confirmPending = false; if (dialog.open) dialog.close(); };
  const invalidate = (reason: string, clearRows = false) => {
    revision += 1; readyRevision = undefined; busy = false;
    if (timer !== undefined) clearTimeout(timer); timer = undefined;
    closeDialog(); if (clearRows) rows = [];
    status = `${reason}，旧预检已失效；下次操作会重新预检（模拟）。`;
    if (!clearRows && rows.length) summary = "上次结果仅供查看；当前范围尚未预检（模拟）。";
    publish();
  };
  const directoryChanged = () => {
    if (disposed) return;
    const next = options.directory().trim(); if (next === directory) return;
    directory = next; fixedIssues.clear(); converted.clear(); summary = "仅内存样例，不扫描或写入真实文件。";
    invalidate("工作目录已改变", true); log(`切换工作目录：${directory || "未选择"}`);
  };
  const later = (work: () => void) => {
    const capturedRevision = revision, capturedDirectory = directory;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || capturedRevision !== revision) return;
      if (options.directory().trim() !== capturedDirectory) { directoryChanged(); return; }
      work();
    }, 80);
  };
  const cancelConfirmation = () => {
    if (!confirmPending) return;
    closeDialog(); busy = false; status = `已取消${writeLabel}，保留当前预检；未修改内存样例。`;
    log(`取消${writeLabel}，未写入文件`); publish();
  };
  const confirm = () => {
    const count = candidateIds().length;
    if (!count) { busy = false; status = `没有可自动${writeLabel}的样例；其余仅报告（模拟）。`; publish(); log(status); return; }
    confirmPending = true; busy = true;
    status = `已预检，等待确认${writeLabel} ${count} 个内存样例。`;
    message.textContent = `当前目录：${directory}。将${writeLabel} ${count} 个内存样例。${kind === "headerAscii" ? (preserveGbk ? "保留 GBK 中文注释。" : "纯 ASCII 模式会替换非 ASCII 内容。") : `目标 ${expected()}。`}`;
    if (!dialog.isConnected) document.body.append(dialog);
    dialog.showModal(); publish(); log(`打开${writeLabel}确认：${count} 个样例`);
  };
  const run = (write: boolean) => {
    if (disposed || busy) return;
    directoryChanged(); if (!valid()) { log("当前目录或范围不完整，操作未执行"); return; }
    busy = true; status = write ? `先按当前选项重新预检，再确认${writeLabel}（模拟）…` : `${rows.length ? "正在重新预检" : "正在预检"}内存样例（模拟）…`;
    publish(); log(write ? `${writeLabel}前重新预检` : "开始预检");
    later(() => {
      rows = computeRows(); readyRevision = revision;
      summary = `扫描 ${scannedCount()} 个样例 · 可${writeLabel} ${candidateIds().length} 个 · 未读取真实文件`;
      status = "预检完成（模拟）。"; busy = false; publish(); log(summary);
      if (write) confirm();
    });
  };
  cancel.addEventListener("click", cancelConfirmation);
  dialog.addEventListener("cancel", event => { event.preventDefault(); cancelConfirmation(); });
  dialog.addEventListener("close", cancelConfirmation);
  execute.addEventListener("click", () => {
    if (!confirmPending || disposed || readyRevision !== revision) return;
    if (options.directory().trim() !== directory) { directoryChanged(); return; }
    const ids = candidateIds(); closeDialog(); busy = true; status = `正在${writeLabel}内存样例（模拟）…`; publish();
    later(() => {
      if (kind === "headerAscii") {
        for (const item of HEADER_FIXTURE) if (ids.includes(item.id)) {
          for (const issue of activeHeaderIssues(item)) if (issue.kind !== "bom" || stripBom) fixedIssues.add(`${item.id}:${issue.kind}`);
        }
      } else for (const id of ids) converted.set(id, expected());
      // Keep the post-operation results current; another write still rescans and asks for confirmation.
      rows = computeRows(); readyRevision = revision; busy = false;
      status = `已${writeLabel} ${ids.length} 个内存样例；未写入真实文件（模拟）。`;
      summary = `处理后样例状态 · 剩余可${writeLabel} ${candidateIds().length} 个`;
      publish(); log(status);
    });
  });
  view.addEventListener(KTC_TEXT_REPAIR_PRIMARY_ACTION, event => {
    const detail = (event as CustomEvent<KtcTextRepairPrimaryAction>).detail;
    if (disposed || busy) return;
    if (detail.action === "scan") run(false);
    else if (detail.action === "fix" || detail.action === "convert") run(true);
    else if (detail.action === "settings") log("打开项目编码更多设置：仅展示入口，不调用 VS Code");
    else if (detail.action === "setScope") {
      if (kind === "headerAscii" && detail.key === "includeMarkdown") return;
      scope[detail.key] = detail.value; invalidate("扫描范围已改变"); log(`范围 ${detail.key}：${detail.value ? "启用" : "停用"}`);
    } else if (detail.action === "setOption") {
      if (detail.key === "showDetails") { showDetails = detail.value; publish(); log(`显示详细：${detail.value ? "开启" : "关闭"}`); return; }
      if (detail.key === "preserveGbk") preserveGbk = detail.value;
      else stripBom = detail.value;
      invalidate("处理选项已改变"); log(`${detail.key}：${detail.value ? "开启" : "关闭"}`);
    } else if (detail.action === "setTarget") {
      targetEncoding = detail.value; invalidate("目标编码已改变"); log(`默认目标 ${expected()}，未保存项目设置`);
    } else if (detail.action === "open") {
      const row = rows.find(item => item.id === detail.rowId); if (!row) return;
      log(`${kind === "headerAscii" ? "打开并定位问题" : "打开文件"} ${row.fullPath}${detail.line ? `:${detail.line}` : ""}；不调用 Host`);
    }
  });
  publish();
  return {
    createPrimary() { if (disposed) throw new Error("Preview text repair surface is disposed"); return view; },
    directoryChanged,
    dispose() { disposed = true; revision += 1; if (timer !== undefined) clearTimeout(timer); closeDialog(); dialog.remove(); view.remove(); },
  };
}

export function createPreviewHeaderAsciiSurface(options: KtcPreviewTextRepairOptions): KtcPreviewTextRepairSurface {
  return createSurface("headerAscii", options);
}
export function createPreviewEncodingFixSurface(options: KtcPreviewTextRepairOptions): KtcPreviewTextRepairSurface {
  return createSurface("encodingFix", options);
}
