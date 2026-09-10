// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreviewAutoBuildState, derivePreviewAutoBuildState, reducePreviewAutoBuildState } from "../../ui-preview/src/previewAutoBuildState.js";
import { createPreviewAutoBuildWorkbench } from "../../ui-preview/src/previewAutoBuildWorkbench.js";
import { previewConfigurationManifest } from "../../ui-preview/src/previewAutoBuildDialogs.js";
import type { PreviewBuildSessionIntent } from "../../ui-preview/src/previewAutoBuildSession.js";

let cleanup: (() => void) | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup?.(); cleanup = undefined; document.body.replaceChildren(); document.head.querySelectorAll("[data-auto-build-workbench-style]").forEach((node) => node.remove()); vi.useRealTimers(); });
function create() {
  document.body.innerHTML = '<small data-auto-build-config-draft></small><input data-auto-build-config-field="workingDirectory"><button data-auto-build-project-tool="import">导入</button><button data-auto-build-project-tool="selectDirectories">选择目录</button><button data-auto-build-project-tool="discover">探测目录</button><button data-auto-build-project-tool="removeDisabled">移除禁用</button><div><table><tbody data-auto-build-project-rows></tbody></table></div><div data-auto-build-task-list></div>';
  let state = createDefaultPreviewAutoBuildState();
  const dispatch = (action: PreviewBuildSessionIntent) => { state = reducePreviewAutoBuildState(state, { type: "session", action }).state; surface.render(); };
  const surface = createPreviewAutoBuildWorkbench({ state: () => state, dispatch, log: vi.fn() });
  surface.render(); cleanup = surface.reset;
  return { surface, state: () => state, dispatch };
}
function click(id: string) { const element = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-auto-build-action-id]")).find((button) => button.dataset.autoBuildActionId === id); expect(element, id).toBeTruthy(); element!.click(); }
function change(field: HTMLInputElement | HTMLSelectElement, value: string) { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); }

describe("AutoBuild Preview workbench real DOM actions", () => {
  it("项目启用/分支/操作改变同一草稿和 Primary 统计，而不是追加固定日志", () => {
    const { state } = create();
    const row = document.querySelector<HTMLElement>('[data-repository-id="ktcore"]')!;
    const enabled = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!; enabled.checked = false; enabled.dispatchEvent(new Event("change"));
    expect(derivePreviewAutoBuildState(state()).enabledProjectMetric).toBe("1 / 2");
    const branch = document.querySelector<HTMLInputElement>('[aria-label="KtCore 分支"]')!; change(branch, "release/preview");
    expect(state().session.draft.repositories[2].branch).toBe("release/preview");
    expect(document.querySelector<HTMLInputElement>('[aria-label="KtCore 分支"]')?.value).toBe("release/preview");
    (document.querySelector('[data-auto-build-project-tool="removeDisabled"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-repository-id="ktcore"]')).toBeNull();
    expect(document.querySelector('[data-repository-id="root"]')).not.toBeNull();
  });
  it("目录选择取消不加行，确认去重，扫描重复不增加重复项目", () => {
    const { state } = create();
    (document.querySelector('[data-auto-build-project-tool="selectDirectories"]') as HTMLButtonElement).click();
    click("close"); expect(state().session.draft.repositories).toHaveLength(4);
    (document.querySelector('[data-auto-build-project-tool="selectDirectories"]') as HTMLButtonElement).click();
    click("add-directories"); expect(state().session.draft.repositories).toHaveLength(7);
    (document.querySelector('[data-auto-build-project-tool="discover"]') as HTMLButtonElement).click();
    const size = state().session.draft.repositories.length;
    vi.advanceTimersByTime(700);
    (document.querySelector('[data-auto-build-project-tool="discover"]') as HTMLButtonElement).click();
    expect(state().session.draft.repositories).toHaveLength(size);
  });
  it("导入样例动态摘要、目标编辑、确认一次；取消和修改来源后不能沿用旧计划", () => {
    const { state, surface } = create();
    surface.dialogs.openImport(); click("load-import-sample");
    expect(document.querySelector(".preview-manifest-dialog")?.textContent).toContain("新增 1 · 更新 1 · 忽略 1");
    expect(state().session.draft.repositories).toHaveLength(4);
    const target = document.querySelector<HTMLInputElement>('[aria-label="ImportedSample 目标目录"]')!; change(target, `${state().session.draft.configuration.workingDirectory}/CustomTarget`);
    click("confirm-import"); expect(state().session.draft.repositories.at(-1)?.path).toContain("CustomTarget");
    expect(state().session.draft.repositories).toHaveLength(5);
    surface.dialogs.openImport(); click("load-import-sample");
    expect((document.querySelector('[data-auto-build-action-id="confirm-import"]') as HTMLButtonElement).disabled).toBe(true);
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="来源 JSON"]')!; source.value = '<img src="x">'; source.dispatchEvent(new Event("input"));
    click("validate-import"); expect(document.querySelector(".preview-manifest-dialog img")).toBeNull();
    expect((document.querySelector('[data-auto-build-action-id="confirm-import"]') as HTMLButtonElement).disabled).toBe(true);
    click("close"); expect(state().session.draft.repositories).toHaveLength(5);
  });
  it("来源修改时导入按钮即时失效，其他编辑导致旧计划确认显示错误", () => {
    const { surface, dispatch, state } = create();
    surface.dialogs.openImport(); click("load-import-sample");
    dispatch({ type: "save", name: "changed.json" });
    click("confirm-import"); expect(document.querySelector(".preview-manifest-dialog")?.textContent).toContain("草稿已变更");
    expect(state().session.draft.repositories).toHaveLength(4);
  });
  it("探测取消后的延迟回包不覆盖当前行；非 Git 场景有可见状态", () => {
    const { state } = create();
    click("probe:ktcore"); expect(document.querySelector('[data-repository-id="ktcore"]')?.textContent).toContain("探测中");
    click("probe:ktcore"); vi.advanceTimersByTime(700); expect(state().session.probes).toHaveLength(0);
    change(document.querySelector<HTMLSelectElement>('[aria-label="KtCore 探测场景"]')!, "not-git");
    click("probe:ktcore"); vi.advanceTimersByTime(700);
    expect(document.querySelector('[data-repository-id="ktcore"]')?.textContent).toContain("不是 Git 仓库");
  });
  it("运行后按内存任务实际推进，停止禁用调度；单项重试保留其他结果", () => {
    const { dispatch, state } = create();
    dispatch({ type: "start" });
    expect((document.querySelector('[data-auto-build-project-tool="import"]') as HTMLButtonElement).disabled).toBe(true);
    vi.advanceTimersByTime(950); expect(state().session.tasks[0].status).toBe("success");
    dispatch({ type: "stop" });
    const stopped = state().session; vi.advanceTimersByTime(10_000); expect(state().session).toBe(stopped);
    click("retry:ktcore:cmake"); vi.advanceTimersByTime(10_000);
    expect(state().session.tasks.find((task) => task.id === "ktcore:cmake")?.status).toBe("success");
    expect(state().session.tasks.find((task) => task.id === "bom:caa")?.status).toBe("cancelled");
  });
  it("脚本三页签与目标选项产生可读请求并保留各页结果，不伪造磁盘写入", () => {
    const { surface } = create(); surface.dialogs.script(); click("export-script");
    expect(document.querySelector('[aria-label="脚本导出结果"]')?.textContent).toContain('"scriptKind": "build"');
    (document.querySelector('[data-script-kind="checkout"]') as HTMLButtonElement).click();
    const roots = document.querySelector<HTMLInputElement>('[aria-label="包含 Root、3rdParty"]')!; roots.checked = true; roots.dispatchEvent(new Event("change")); click("export-script");
    expect(document.querySelector('[aria-label="脚本导出结果"]')?.textContent).toContain('"includeRoots": true');
    (document.querySelector('[data-script-kind="manifest"]') as HTMLButtonElement).click(); change(document.querySelector<HTMLSelectElement>('[aria-label="归档方式"]')!, "merge"); click("export-script");
    expect(document.querySelector('[aria-label="脚本导出结果"]')?.textContent).toContain('"manifestMode": "merge"');
    (document.querySelector('[data-script-kind="build"]') as HTMLButtonElement).click();
    expect(document.querySelector('[aria-label="脚本导出结果"]')?.textContent).toContain("未写盘");
  });
  it("配置另存与关闭确认有真实 checkpoint，取消保留表格", () => {
    const { surface, state } = create(); surface.dialogs.config("saveAs");
    change(document.querySelector<HTMLInputElement>('[aria-label="配置名称"]')!, "my-preview.json"); click("save-checkpoint");
    expect(state().session.checkpoint?.name).toBe("my-preview.json");
    change(document.querySelector<HTMLInputElement>('[aria-label="KtCore 分支"]')!, "dirty");
    const current = state().session.draft; surface.dialogs.config("close"); click("close"); expect(state().session.draft).toBe(current);
    surface.dialogs.config("close"); click("discard-config"); expect(state().session.checkpoint).toBeUndefined();
  });
  it("AutoBuild schema 2 明确解析分支拒绝任意 JSON 和重复来源身份", () => {
    expect(() => previewConfigurationManifest({ schemaVersion: 1, repositories: [] })).toThrow();
    expect(() => previewConfigurationManifest({ schemaVersion: 2, projects: [{ path: "a", operations: {} }], repositorySnapshot: { repositories: [] } })).toThrow();
  });
});
