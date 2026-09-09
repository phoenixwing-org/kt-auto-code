import {
  type KtcIgnorePolicyBlockActionDetail,
  type KtcIgnorePolicyBlockModel,
} from "../../src/ui/KtcIgnorePolicyBlock.js";
import "../../src/ui/KtcPackageIncludesPrimaryEntry.js";
import type { KtcPackageIncludesPrimaryActionDetail } from "../../src/core/packageIncludesPrimaryContracts.js";
import type { PreviewCompanionModel } from "./previewCompanionModel.js";
import { PREVIEW_PACKAGE_INCLUDES_FIXTURE, type PreviewPackageIncludesFixture } from "./previewPackageIncludesFixture.js";

/** Preview-only draft. No filesystem, settings or production Controller calls. */
export function createPreviewPackageIncludesSurface(options: {
  readonly initial: PreviewCompanionModel;
  readonly log: (line: string) => void;
  readonly action: (actionId: string) => void;
  readonly ignoreModel: () => KtcIgnorePolicyBlockModel;
  readonly ignoreAction: (detail: KtcIgnorePolicyBlockActionDetail) => void;
  readonly directoryChanged?: () => void;
  readonly fixture?: PreviewPackageIncludesFixture;
}): { createPrimary(): HTMLElement; createRight(): HTMLElement; createRightActions(): HTMLElement; contextDirectory(): string; ignorePolicyChanged(): void } {
  const fact = (id: string) => options.initial.facts.find((item) => item.id === id)?.value ?? "";
  const originalPackage = fact("package");
  let packageDirectory = originalPackage;
  let targetDirectory = fact("target");
  const fixture = options.fixture ?? PREVIEW_PACKAGE_INCLUDES_FIXTURE;
  const sources = new Map(fixture.files.map(({ relativePath, text }) => [relativePath, text]));
  let status = "尚未预览；仅使用内存样例，不读取真实文件。";
  let dirty = false;
  let revision = 0;
  let result: {
    readonly revision: number;
    readonly fingerprint: string;
    readonly targetDirectory: string;
    readonly rows: PreviewPackageIncludesFixture["rows"];
    readonly scannedFileCount: number;
    readonly ignoredDirectoryCount: number;
    applied: boolean;
  } | undefined;
  let right: HTMLElement | undefined;
  let rightActions: HTMLElement | undefined;
  let rightApply: HTMLButtonElement | undefined;
  let lastIgnoreSignature = ignoreSignature();
  const primary = document.createElement("ktc-package-includes-primary");
  primary.addEventListener("ktc-ignore-policy-action", (event) => {
    options.ignoreAction((event as CustomEvent<KtcIgnorePolicyBlockActionDetail>).detail);
    ignorePolicyChanged();
  });
  primary.addEventListener("ktc-package-includes-primary-action", (event) => {
    const detail = (event as CustomEvent<KtcPackageIncludesPrimaryActionDetail>).detail;
    if (detail.actionId === "updateDraft") {
      const targetChanged = targetDirectory !== detail.payload.targetDirectory;
      packageDirectory = detail.payload.packageDirectory;
      targetDirectory = detail.payload.targetDirectory;
      invalidate(!packageDirectory.trim() || !targetDirectory.trim()
        ? "请先填写 Package 目录与工程目录。（模拟）"
        : "目录已修改，旧预览已失效；请重新预览。（模拟）");
      if (targetChanged) options.directoryChanged?.();
    } else if (detail.actionId === "pickEnvironmentPackageDirectory") {
      packageDirectory = originalPackage;
      invalidate("目录已修改，旧预览已失效；请重新预览。（模拟）");
      options.log(`[头文件引用修正] 已模拟推导 Package 目录：${packageDirectory}；未读取真实工程环境`);
    } else if (detail.actionId === "pickPackageDirectory") {
      options.log("［头文件引用修正］选择 Package 目录（模拟）；可在输入框编辑样例路径，未打开真实目录选择器");
      primary.shadowRoot?.querySelector<HTMLInputElement>('input[aria-label="Package 目录"]')?.focus();
    } else if (detail.actionId === "preview") preview();
    else options.action(detail.actionId);
  });

  function ignoreSignature(): string {
    const policy = options.ignoreModel();
    return JSON.stringify([policy.enabled, policy.builtInEnabled, policy.gitEnabled, policy.customEnabled, policy.customCount]);
  }

  function ignorePolicyChanged(): void {
    const next = ignoreSignature();
    if (next === lastIgnoreSignature) { refresh(); return; }
    lastIgnoreSignature = next;
    invalidate("忽略策略已变化，请重新预览。（模拟）");
  }

  function fingerprint(): string {
    const policy = options.ignoreModel();
    return JSON.stringify([packageDirectory, targetDirectory, policy.enabled, policy.builtInEnabled, policy.gitEnabled, policy.customEnabled, [...sources]]);
  }

  function canApply(): boolean {
    return Boolean(result && !result.applied && result.rows.length && result.revision === revision && result.fingerprint === fingerprint());
  }

  function invalidate(message: string): void {
    revision += 1;
    dirty = true;
    status = message;
    refresh();
  }

  function refresh(): void {
    renderPrimary();
    renderRight();
    if (rightApply) {
      rightApply.disabled = !canApply();
      rightApply.title = canApply() ? "仅修改内存样例，未写入真实文件" : "请先预览当前目录与忽略策略，且需有待修正的样例行";
      rightApply.parentElement!.title = rightApply.title;
    }
  }

  function preview(): void {
    if (!options.initial.actions.some(({ actionId, enabled }) => actionId === "preview" && enabled)) return;
    if (!packageDirectory.trim() || !targetDirectory.trim()) {
      invalidate("请先填写 Package 目录与工程目录。（模拟）");
      options.log(`[头文件引用修正] ${status}`);
      return;
    }
    const policy = options.ignoreModel();
    result = {
      revision, fingerprint: fingerprint(), targetDirectory,
      // Recipes only match their known fixture source line, never arbitrary files.
      rows: fixture.rows.filter((row) => sources.get(row.relativePath)?.split("\n")[row.line - 1] === row.oldValue),
      scannedFileCount: sources.size,
      ignoredDirectoryCount: policy.enabled && (policy.builtInEnabled || policy.gitEnabled || policy.customEnabled) ? fixture.ignoredDirectoryCount : 0,
      applied: false,
    };
    dirty = false;
    status = `已预览 ${result.scannedFileCount} 个样例文件，命中 ${result.rows.length} 处。（模拟）`;
    refresh();
    options.log(`[头文件引用修正][预览][模拟] ${targetDirectory}；${result.scannedFileCount} 个样例文件、${result.rows.length} 处；未扫描真实目录`);
    options.action("preview");
  }

  function apply(): void {
    if (!canApply() || !result) {
      options.log("[头文件引用修正][写入][模拟] 旧预览不可用；请先重新预览，未写入真实文件");
      refresh();
      return;
    }
    const changedFiles = new Set<string>();
    for (const row of result.rows) {
      const lines = sources.get(row.relativePath)!.split("\n");
      lines[row.line - 1] = row.newValue;
      sources.set(row.relativePath, lines.join("\n"));
      changedFiles.add(row.relativePath);
    }
    result.applied = true;
    status = `已模拟修正 ${changedFiles.size} 个样例文件中的 ${result.rows.length} 处 include；未写入真实文件。`;
    options.log(`[头文件引用修正][写入][模拟] ${status}`);
    refresh();
  }

  function renderRight(): void {
    if (!right) return;
    right.replaceChildren();
    const notice = document.createElement("p");
    notice.className = "preview-package-right-notice";
    notice.textContent = "内存样例 · 不读取或写入真实文件";
    const message = document.createElement("p");
    message.className = "preview-package-right-status";
    message.setAttribute("role", "status");
    message.textContent = status;
    right.append(notice, message);
    if (!result || dirty) {
      const empty = document.createElement("p");
      empty.className = "preview-package-right-empty";
      empty.textContent = "点击“预览”，查看几行头文件引用修正样例。";
      right.append(empty);
      return;
    }
    for (const warning of fixture.warnings) {
      const line = document.createElement("p");
      line.className = "preview-package-right-warning";
      line.textContent = `样例提示：${warning}`;
      right.append(line);
    }
    if (!result.rows.length) {
      const empty = document.createElement("p");
      empty.className = "preview-package-right-empty";
      empty.textContent = "未发现可修正的 include。";
      right.append(empty);
      return;
    }
    const scroll = document.createElement("div");
    scroll.className = "preview-package-right-table-scroll";
    const table = document.createElement("table");
    table.setAttribute("aria-label", result.applied ? "模拟写入回执" : "头文件引用修正样例");
    const heading = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of ["文件 @ 目录", "行", "旧值", "新值", "状态 / 操作"]) {
      const cell = document.createElement("th"); cell.textContent = label;
      if (label === "状态 / 操作") cell.className = "operations";
      headerRow.append(cell);
    }
    heading.append(headerRow);
    const body = document.createElement("tbody");
    for (const row of result.rows) {
      const tr = document.createElement("tr");
      const file = document.createElement("td");
      const slash = row.relativePath.lastIndexOf("/");
      const fullPath = `${result.targetDirectory.replace(/[\\/]$/u, "")}/${row.relativePath}`;
      const openSource = () => {
        options.log(`[头文件引用修正][打开][模拟] ${fullPath}:${row.line}；未打开真实文件`);
      };
      tr.addEventListener("click", openSource);
      const open = createButton("打开", openSource);
      open.addEventListener("click", (event) => event.stopPropagation());
      open.title = `打开样例 ${fullPath} 第 ${row.line} 行（模拟）`;
      open.setAttribute("aria-label", open.title);
      file.textContent = `${row.relativePath.slice(slash + 1)}${slash >= 0 ? ` @ ${row.relativePath.slice(0, slash)}` : ""}`;
      file.title = fullPath;
      tr.append(file);
      for (const value of [String(row.line), row.oldValue, row.newValue]) {
        const cell = document.createElement("td"); cell.textContent = value; cell.title = value; tr.append(cell);
      }
      const operations = document.createElement("td"); operations.className = "operations";
      const writeState = document.createElement("span"); writeState.className = "write-state";
      writeState.textContent = result.applied ? "已写入" : "待写入";
      operations.append(writeState, open); tr.append(operations);
      body.append(tr);
    }
    table.append(heading, body);
    scroll.append(table);
    right.append(scroll);
  }

  function renderPrimary(): void {
    const policy = options.ignoreModel();
    primary.model = {
      sessionId: "preview-package-includes", revision,
      packageDirectory, targetDirectory,
      packageDirectoryExists: Boolean(packageDirectory.trim()),
      targetDirectoryExists: Boolean(targetDirectory.trim()),
      ready: true, busy: false, scanStatus: status, ignore: policy,
      actions: [
        ...options.initial.actions.map((action) => ({
          id: action.actionId, label: action.label,
          enabled: action.enabled && (action.actionId !== "preview" || Boolean(packageDirectory.trim() && targetDirectory.trim())),
        })),
        ...["updateDraft", "pickEnvironmentPackageDirectory", "pickPackageDirectory"].map((id) => ({ id, label: id, enabled: true })),
      ],
      summary: options.initial.facts.filter(({ id }) => id !== "package" && id !== "target").map((item) => ({
        label: item.label + (dirty && (item.id === "scan" || item.id === "matches") ? "（上次）" : ""),
        value: item.id === "ignore"
          ? !policy.enabled ? "已停用" : [policy.builtInEnabled && "插件", policy.gitEnabled && "Git", policy.customEnabled && "自定义"].filter(Boolean).join(" + ") || "无来源启用"
          : item.id === "scan" ? result ? `${result.scannedFileCount} 个文件` : "未开始"
          : item.id === "matches" ? `${result?.rows.length ?? 0} 处` : item.value,
      })),
    };
  }

  return {
    contextDirectory: () => targetDirectory,
    ignorePolicyChanged,
    createRight(): HTMLElement {
      right ??= document.createElement("section");
      right.className = "preview-package-right";
      right.setAttribute("aria-label", "头文件引用修正示例");
      renderRight();
      return right;
    },
    createRightActions(): HTMLElement {
      if (!rightActions) {
        rightActions = document.createElement("div");
        rightActions.className = "preview-package-right-actions";
        const previewButton = createButton("预览", preview);
        previewButton.className = "is-primary";
        previewButton.disabled = !options.initial.actions.some(({ actionId, enabled }) => actionId === "preview" && enabled);
        rightApply = createButton("写入修正", apply);
        const applySlot = document.createElement("span");
        applySlot.append(rightApply);
        rightActions.append(previewButton, applySlot);
      }
      refresh();
      return rightActions;
    },
    createPrimary(): HTMLElement {
      renderPrimary();
      return primary;
    },
  };
}

function createButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}
