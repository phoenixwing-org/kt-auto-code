import { KTC_CAA_PRIMARY_ACTION, ktcDefineCaaPrimary, type KtcCaaPrimary, type KtcCaaPrimaryActionDetail } from "../../src/ui/KtcCaaPrimary.js";

/** Fixture-only adapter: never probes a port, launches an editor or accesses files. */
export function createPreviewCaaSurface(options: { readonly directory: () => string; readonly log: (line: string) => void }) {
  ktcDefineCaaPrimary();
  const primary = document.createElement("ktc-caa-primary") as KtcCaaPrimary;
  let directory = options.directory();
  let scanDirectory: string | undefined;
  let rows: { uri: string; relativePath: string; selected?: boolean }[] | undefined;
  let running = false;
  let disposed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let message = "尚未扫描。";
  let connection = { status: "offline", text: "Desk Tools 尚未连接（模拟）" };
  const paths = ["Dialog/PNXIssueDialog.CATDlg", "Dialog/PNXOptionsDialog.CATDlg"];

  function update(): void {
    primary.model = {
      running, canScan: Boolean(directory.trim()), resultActionsEnabled: scanDirectory === directory,
      message, rows, connection,
      notice: "内存样例 · 不扫描文件、不连接外部服务",
      environmentText: "工程环境沿用当前目录（模拟）",
    };
  }
  function log(text: string): void { options.log(`[CAA UI] ${text}（模拟）`); }
  function invalidate(): void {
    generation += 1; if (timer) clearTimeout(timer); timer = undefined; running = false;
  }
  function directoryChanged(): void {
    const next = options.directory();
    if (disposed || next === directory) return;
    directory = next; invalidate(); scanDirectory = undefined;
    if (connection.status === "checking") connection = { status: "offline", text: "检测已取消，请重新连接（模拟）" };
    message = "目录已变化，请重新扫描。"; update();
  }
  function start(kind: "scan" | "checkConnection"): void {
    if (disposed || running || (kind === "scan" && !directory.trim())) return;
    const ticket = ++generation; const capturedDirectory = directory;
    running = true;
    if (kind === "scan") message = "正在扫描 CATDlg（模拟）…";
    else connection = { status: "checking", text: "正在检测 Desk Tools（模拟）…" };
    update(); log(kind === "scan" ? "开始扫描 CATDlg" : "检测 Desk Tools 连接");
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || ticket !== generation || capturedDirectory !== options.directory()) { directoryChanged(); return; }
      running = false;
      if (kind === "scan") {
        scanDirectory = capturedDirectory;
        rows = paths.map((relativePath) => ({ uri: `${capturedDirectory.replace(/\/$/, "")}/${relativePath}`, relativePath }));
        message = "已定位 2 个 CATDlg 样例文件。（模拟）";
      }
      connection = { status: "online", text: "Desk Tools 已连接（模拟）" };
      update(); log(kind === "scan" ? "扫描完成：2 个样例文件" : "Desk Tools 连接正常");
    }, 220);
  }
  primary.addEventListener(KTC_CAA_PRIMARY_ACTION, (event) => {
    if (disposed) return;
    directoryChanged();
    const detail = (event as CustomEvent<KtcCaaPrimaryActionDetail>).detail;
    if (!detail || running) return;
    if (detail.actionId === "scan" || detail.actionId === "checkConnection") start(detail.actionId);
    else if (detail.actionId === "settings") {
      message = "将打开 Desk Tools 机器级设置；未修改真实设置。（模拟）"; log("打开 Desk Tools 设置"); update();
    } else if ("uri" in detail) {
      const row = rows?.find((item) => item.uri === detail.uri);
      if (!row || scanDirectory !== directory) return;
      if (detail.actionId === "open") { log(`在 VS Code 中打开 ${row.relativePath}；未打开真实文件`); return; }
      if (detail.actionId !== "openExternal") return;
      rows = rows!.map((item) => ({ ...item, selected: item.uri === row.uri }));
      message = `已模拟交接 ${row.relativePath}；未启动外部编辑器。`;
      connection = { status: "online", text: "Desk Tools 已连接（模拟）" };
      log(`交给 Desk Tools：${row.relativePath}`); update();
    }
  });
  update();
  return {
    createPrimary(): HTMLElement { directoryChanged(); return primary; },
    directoryChanged,
    dispose(): void { disposed = true; invalidate(); },
  };
}
