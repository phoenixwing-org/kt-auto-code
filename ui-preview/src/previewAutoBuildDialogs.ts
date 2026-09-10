import { addPreviewAutoBuildSampleDirectories, applyPreviewAutoBuildImport, planPreviewAutoBuildImport, type PreviewAutoBuildDraftChange, type PreviewAutoBuildImportPlan } from "./previewAutoBuildDraft.js";
import { isPreviewAutoBuildDirty, type PreviewBuildSessionIntent } from "./previewAutoBuildSession.js";
import type { PreviewAutoBuildState } from "./previewAutoBuildState.js";
import type { KtcCheckoutScriptOptions } from "../../src/tools/codeAssistant/autoBuildCheckoutScript.js";

export interface PreviewAutoBuildDialogHost {
  state(): PreviewAutoBuildState;
  dispatch(action: PreviewBuildSessionIntent): void;
  log(message: string): void;
}
export function createPreviewAutoBuildDialogs(host: PreviewAutoBuildDialogHost) {
  let active: HTMLDialogElement | undefined;
  const close = () => { active?.close(); active?.remove(); active = undefined; };
  function dialog(title: string, kind: string) {
    close();
    const element = document.createElement("dialog"); element.className = `preview-auto-build-dialog ${kind}`;
    element.setAttribute("aria-label", title);
    const header = document.createElement("header"); header.append(label("strong", title), button("×", close, "close"));
    const body = document.createElement("div"); body.className = "preview-auto-build-dialog-body";
    const footer = document.createElement("footer");
    element.append(header, body, footer); document.body.append(element); active = element;
    element.addEventListener("close", () => { element.remove(); if (active === element) active = undefined; });
    element.showModal();
    return { element, body, footer };
  }
  function edit(change: PreviewAutoBuildDraftChange) { host.dispatch({ type: "edit", change }); }
  function chooseDirectories() {
    const { body, footer } = dialog("选择样例项目目录", "preview-auto-build-directory-dialog");
    const paths = document.createElement("textarea"); paths.rows = 5; paths.setAttribute("aria-label", "样例目录，每行一个");
    paths.value = ["SampleCmake", "SampleCaa", "NotGitSample"].map((name) => `${host.state().session.draft.configuration.workingDirectory}/${name}`).join("\n");
    body.append(label("p", "输入/选择内存样例路径；不会打开真实目录选择器，也不创建文件。"), paths);
    footer.append(button("取消", close), button("加入草稿", () => {
      const draft = host.state().session.draft;
      edit(addPreviewAutoBuildSampleDirectories(draft, paths.value.split(/\r?\n/u).filter((path) => path.trim()).map((path) => ({ path, buildKinds: path.toLowerCase().includes("caa") ? ["caa"] : ["cmake"] })))); close();
    }, "add-directories"));
  }
  function openImport() {
    const { element, body, footer } = dialog("导入仓库清单（内存模拟）", "preview-manifest-dialog");
    const sourceType = select("JSON 类型", [["manifest", "BUILD_MANIFEST schema 1"], ["configuration", "AutoBuild schema 2（需 repositorySnapshot Origin）"]]);
    const source = document.createElement("textarea"); source.rows = 9; source.setAttribute("aria-label", "来源 JSON");
    let plan: PreviewAutoBuildImportPlan | undefined;
    let targets: Record<string, string> = Object.create(null) as Record<string, string>;
    const summary = label("p", "载入样例或粘贴 JSON，然后校验。"), issues = document.createElement("details"), issueBody = document.createElement("ul");
    issues.append(label("summary", "问题项"), issueBody);
    const preview = document.createElement("div"); preview.className = "preview-auto-build-import-targets";
    const confirm = button("确认合入草稿", () => {
      if (!plan) return;
      const change = applyPreviewAutoBuildImport(host.state().session.draft, plan, true);
      edit(change); confirm.disabled = true;
      if (change.errors.length) { summary.textContent = change.errors.join("；"); return; }
      close();
    }, "confirm-import"); confirm.disabled = true;
    const invalidate = () => { plan = undefined; confirm.disabled = true; summary.textContent = "来源已修改，请重新校验。"; };
    source.addEventListener("input", invalidate); sourceType.addEventListener("change", () => { targets = Object.create(null) as Record<string, string>; invalidate(); });
    function validate() {
      try {
        if (source.value.length > 256_000) throw new Error("JSON 超过 256 KB 上限。");
        const parsed: unknown = JSON.parse(source.value);
        const manifest = sourceType.value === "configuration" ? previewConfigurationManifest(parsed) : parsed;
        plan = planPreviewAutoBuildImport(host.state().session.draft, manifest, { targetPaths: targets });
        summary.textContent = `新增 ${plan.summary.added} · 更新 ${plan.summary.updated} · 忽略 ${plan.summary.ignored}（仅草稿；未检出/更新）`;
        const problems = [...plan.errors, ...plan.warnings];
        issueBody.replaceChildren(...problems.map((text) => label("li", text))); issues.open = !!problems.length;
        confirm.disabled = plan.errors.length > 0 || plan.summary.added + plan.summary.updated === 0 || host.state().session.running;
        preview.replaceChildren();
        for (const row of plan.draft.repositories.filter((row) => !plan!.baseDraft.repositories.some((old) => old.id === row.id))) {
          const field = input(`${row.name} 目标目录`, row.path); field.dataset.origin = row.originTitle;
          field.addEventListener("change", () => { targets[row.originTitle] = field.value; validate(); });
          const container = document.createElement("label"); container.append(label("strong", row.name), label("small", `Origin: ${row.originTitle}`), field); preview.append(container);
        }
      } catch (error) { plan = undefined; confirm.disabled = true; summary.textContent = error instanceof Error ? error.message : "无法读取来源 JSON。"; preview.replaceChildren(); }
    }
    const load = button("载入样例", () => {
      targets = Object.create(null) as Record<string, string>;
      const existing = host.state().session.draft.repositories.find((row) => row.kind === "项目" && row.originTitle);
      const entries = [
        { role: "project", name: "ImportedSample", origin: "https://example.invalid/preview/imported.git", branch: "develop", commit: "1234567890abcdef1234567890abcdef12345678", dirty: false, buildKinds: ["cmake"] },
        ...(existing ? [{ role: "project", name: existing.name, origin: existing.originTitle, branch: "release/preview", commit: "abcdef1234567890abcdef1234567890abcdef1234", dirty: false, buildKinds: ["caa"] }] : []),
        { role: "project", name: "NoOrigin", origin: "", branch: "develop", commit: "1234567", dirty: false, buildKinds: ["cmake"] },
      ];
      source.value = JSON.stringify(sourceType.value === "manifest" ? { schemaVersion: 1, status: "succeeded", finishedAt: "2026-09-10T00:00:00Z", repositories: entries } : {
        schemaVersion: 2, projects: entries.map((row) => ({ id: row.name, enabled: true, name: row.name, path: row.name, branch: row.branch, operations: { update: true, cmake: row.buildKinds.includes("cmake"), caa: row.buildKinds.includes("caa"), linkCaa: false } })),
        repositorySnapshot: { capturedAt: "2026-09-10T00:00:00Z", repositories: entries.map((row) => ({ role: "PROJECT", path: row.name, branch: row.branch, commit: row.commit, origin: row.origin, hasChanges: false })) },
      }, null, 2); validate();
    }, "load-import-sample");
    body.append(label("p", "只将来源与构建类型合并到内存草稿；历史 Commit / dirty 是归档事实，不代表当前探测。建议目标可在校验后修改。"), sourceType, load, source, button("校验 / 重新计划", validate, "validate-import"), summary, issues, preview);
    footer.append(button("取消", close), confirm);
    element.addEventListener("cancel", () => { plan = undefined; });
  }
  function config(action: "open" | "saveAs" | "close", recentName?: string) {
    if (host.state().session.running) return;
    const session = host.state().session;
    const { body, footer } = dialog(action === "open" ? "打开内存配置" : action === "saveAs" ? "另存内存配置" : "关闭配置", "preview-auto-build-config-dialog");
    body.append(label("p", "配置仅保存为当前 Preview 内存 checkpoint；刷新页面不会恢复 MRU，不写入磁盘。"));
    const name = input("配置名称", session.checkpoint?.name ?? "auto-build.local.json");
    const saved = select("选择内存配置", session.saved.map((item) => [item.name, item.name]));
    if (recentName) saved.value = recentName;
    const mismatch = select("工作目录不一致时", [["", "请选择目录处理方式"], ["keep", "使用当前工作目录，保留项目"], ["new", "使用当前工作目录，新建空项目"]]);
    const status = label("p", "");
    if (action === "open") body.append(saved, mismatch);
    else if (action === "saveAs") body.append(name);
    body.append(status);
    const complete = (decision: "save" | "discard") => {
      if (action === "saveAs") host.dispatch({ type: "save", name: name.value });
      else if (action === "close") host.dispatch({ type: "close", decision });
      else host.dispatch({ type: "open", name: saved.value, decision, mismatch: mismatch.value === "keep" || mismatch.value === "new" ? mismatch.value : undefined });
      status.textContent = host.state().session.message;
      if (status.textContent.includes("不一致") || status.textContent.includes("请输入")) return;
      close();
    };
    footer.append(button("取消", close));
    if (action === "saveAs") footer.append(button("保存 checkpoint", () => complete("save"), "save-checkpoint"));
    else if (isPreviewAutoBuildDirty(session)) {
      body.prepend(label("strong", "当前有未保存草稿：保存、不保存或取消。"));
      footer.append(button("不保存", () => complete("discard"), "discard-config"), button("保存后继续", () => complete("save"), "save-and-continue"));
    } else footer.append(button(action === "open" ? "打开" : "关闭配置", () => complete("discard"), "confirm-config"));
  }
  function script() {
    const { body, footer } = dialog("脚本管理（内存模拟）", "preview-auto-build-script-dialog");
    const tabs = document.createElement("div"); tabs.setAttribute("role", "tablist");
    const options = document.createElement("div"), result = document.createElement("pre"); result.setAttribute("aria-label", "脚本导出结果");
    let kind: "build" | "checkout" | "manifest" = "build";
    let target = host.state().session.draft.configuration.workingDirectory;
    const checkout: KtcCheckoutScriptOptions = { includeRoots: false, includeBranch: true, includeCommit: false };
    let manifestTarget = "working", manifestMode = "overwrite";
    const results = new Map<string, string>();
    function render() {
      for (const tab of Array.from(tabs.querySelectorAll<HTMLButtonElement>("button"))) tab.setAttribute("aria-selected", String(tab.dataset.scriptKind === kind));
      options.replaceChildren();
      const directory = input("输出目录（样例）", target); directory.addEventListener("change", () => { target = directory.value; });
      if (kind !== "manifest") options.append(directory);
      if (kind === "checkout") for (const [key, title] of [["includeRoots", "包含 Root、3rdParty"], ["includeBranch", "指定当前分支"], ["includeCommit", "固定 Commit"]] as const) options.append(checkbox(title, !!checkout[key], (value) => { checkout[key] = value; }));
      if (kind === "manifest") {
        const destination = select("归档目录", [["working", "当前工作目录"], ["root", "ROOT_DIR"]]); destination.value = manifestTarget; destination.addEventListener("change", () => { manifestTarget = destination.value; });
        const mode = select("归档方式", [["overwrite", "覆盖保存"], ["merge", "追加记录"]]); mode.value = manifestMode; mode.addEventListener("change", () => { manifestMode = mode.value; }); options.append(destination, mode);
      }
      options.append(label("p", kind === "build" ? "正式输出 Windows Invoke-AutoBuild.local.ps1；现有 PS1 按 mk.ps1 执行，尚不消费界面 Debug/Release。此处仅模拟请求，不生成或执行 PS1。" : kind === "checkout" ? "默认仅项目；Origin / Branch / 固定 Commit 独立列入请求，不 clone 或 checkout。" : "归档当前内存来源快照；历史记录不冒充当前探测。"));
      result.textContent = results.get(kind) ?? "尚未模拟导出。";
    }
    for (const [id, title] of [["build", "构建脚本"], ["checkout", "仓库检出"], ["manifest", "版本归档"]] as const) { const tab = button(title, () => { kind = id; render(); }); tab.setAttribute("role", "tab"); tab.dataset.scriptKind = id; tabs.append(tab); }
    const exportButton = button("模拟导出", () => {
      if (host.state().session.running) { result.textContent = "运行中，暂不导出配置快照。"; return; }
      const draft = host.state().session.draft;
      const rows = draft.repositories.filter((row) => row.enabled && (kind !== "checkout" || checkout.includeRoots || row.kind === "项目"));
      if (!target.trim() || target.includes("..") || /[\u0000-\u001f]/u.test(target)) { result.textContent = "输出样例目录无效。"; return; }
      const request = { simulation: true, scriptKind: kind, targetDirectory: kind === "manifest" ? manifestTarget === "root" ? draft.configuration.rootDirectory : draft.configuration.workingDirectory : target,
        ...(kind === "checkout" ? { checkoutOptions: checkout } : kind === "manifest" ? { manifestMode } : { cmakeBuildTypes: host.state().cmakeBuildTypes, parallelBuild: host.state().parallelBuild }),
        repositories: rows.map((row) => ({ name: row.name, path: row.path, origin: row.originTitle, ...(kind !== "checkout" || checkout.includeBranch ? { branch: row.branch } : {}), ...(kind !== "checkout" || checkout.includeCommit ? { commit: row.commit } : {}), buildKinds: row.buildKinds })),
      };
      const output = `已模拟导出 ${rows.length} 个仓库的请求；未写盘、未生成可执行脚本。\n${JSON.stringify(request, null, 2)}`;
      results.set(kind, output); result.textContent = output; host.log(`[编译工具] ${kind} 模拟导出 ${rows.length} 个仓库；未写盘`);
    }, "export-script");
    body.append(tabs, options, result); footer.append(button("关闭", close), exportButton); render();
  }
  return { close, chooseDirectories, openImport, config, script };
}

/** Explicit schema-2 preview projection, not the formal Host importer or an arbitrary-JSON heuristic. */
export function previewConfigurationManifest(value: unknown): unknown {
  if (!value || typeof value !== "object") throw new Error("AutoBuild JSON 必须是对象。");
  const config = value as Record<string, unknown>;
  if (config.schemaVersion !== 2 || !Array.isArray(config.projects) || config.projects.length > 200 || !config.repositorySnapshot || typeof config.repositorySnapshot !== "object") throw new Error("只支持含 repositorySnapshot 的 AutoBuild schema 2。");
  const snapshot = config.repositorySnapshot as Record<string, unknown>;
  if (!Array.isArray(snapshot.repositories) || snapshot.repositories.length > 200) throw new Error("repositorySnapshot.repositories 无效。");
  const paths = new Set<string>();
  const repositories = config.projects.map((value) => {
    if (!value || typeof value !== "object") throw new Error("项目记录无效。");
    const project = value as Record<string, unknown>;
    if (typeof project.path !== "string" || paths.has(project.path)) throw new Error("项目路径无效或重复。"); paths.add(project.path);
    if (!project.operations || typeof project.operations !== "object") throw new Error("项目 operations 无效。");
    const operations = project.operations as Record<string, unknown>;
    if (["cmake", "caa", "update", "linkCaa"].some((key) => typeof operations[key] !== "boolean")) throw new Error("operations 必须为布尔字段。");
    const probes = (snapshot.repositories as unknown[]).filter((row) => !!row && typeof row === "object" && (row as Record<string, unknown>).path === project.path);
    if (probes.length !== 1) throw new Error("每个项目必须有唯一、路径一致的 Origin 快照。");
    const probe = probes[0] as Record<string, unknown>;
    return { role: "project", name: project.name, origin: probe.origin, branch: project.branch, commit: probe.commit, dirty: probe.hasChanges ?? false, buildKinds: ["cmake", "caa"].filter((kind) => operations[kind]) };
  });
  return { schemaVersion: 1, status: "succeeded", finishedAt: snapshot.capturedAt, repositories };
}
export function button(title: string, action: () => void, id?: string): HTMLButtonElement {
  const element = document.createElement("button"); element.type = "button"; element.textContent = title; element.dataset.previewOutput = "handled"; if (id) element.dataset.autoBuildActionId = id;
  element.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); action(); }); return element;
}
export function label<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] { const element = document.createElement(tag); element.textContent = text; return element; }
export function input(title: string, value: string): HTMLInputElement { const element = document.createElement("input"); element.value = value; element.setAttribute("aria-label", title); element.title = title; return element; }
export function select(title: string, values: readonly (readonly [string, string])[]): HTMLSelectElement { const element = document.createElement("select"); element.setAttribute("aria-label", title); for (const [value, title] of values) { const option = document.createElement("option"); option.value = value; option.textContent = title; element.append(option); } return element; }
export function checkbox(title: string, checked: boolean, change: (value: boolean) => void): HTMLLabelElement { const element = document.createElement("label"), field = input(title, ""); field.type = "checkbox"; field.checked = checked; field.addEventListener("change", () => change(field.checked)); element.append(field, document.createTextNode(title)); return element; }
