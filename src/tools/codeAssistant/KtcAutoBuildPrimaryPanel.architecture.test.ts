import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("AutoBuild Primary panel architecture", () => {
  it("是 Host-neutral 的专用组件，并只发语义 actionId", () => {
    const source = readFileSync(new URL("./KtcAutoBuildPrimaryPanel.ts", import.meta.url), "utf8");
    const entry = readFileSync(new URL("./KtcAutoBuildPrimaryPanelEntry.ts", import.meta.url), "utf8");
    const build = readFileSync(new URL("../../../esbuild.mjs", import.meta.url), "utf8");
    const artifactVerifier = readFileSync(new URL("../../../scripts/verify-extension-artifacts.mjs", import.meta.url), "utf8");
    expect(source).toContain('KtcAutoBuildPrimaryPanelTag = "ktc-auto-build-primary-panel"');
    expect(source).toContain('"ktc-auto-build-primary-action"');
    expect(source).toContain("detail: { actionId");
    expect(source).toContain('textContent = "执行"');
    expect(source).toContain('for (const id of ["openScript", "preflight", "start", "stop"])');
    expect(source.indexOf('this.configuration(model)')).toBeLessThan(source.indexOf('this.overview(model)'));
    expect(source.indexOf('this.overview(model)')).toBeLessThan(source.indexOf('this.maintenance(model)'));
    expect(source.indexOf('this.maintenance(model)')).toBeLessThan(source.indexOf('this.environment(model)'));
    expect(source).toContain('label.textContent = "当前配置"');
    expect(source).toContain('["openConfig", "saveConfig", "saveAsConfig", "closeConfig", "reveal"]');
    expect(source).not.toContain('textContent = "项目摘要"');
    expect(source).toContain('repositoryCleanupLabel.textContent = "清理仓库"');
    expect(source).toContain('cleanupTitle.textContent = "手动清理 Root"');
    expect(source).toContain('this.actionButton(cleanupAction, model.ready, "清理")');
    expect(source).toContain('document.createTextNode("工程环境")');
    expect(source).toContain('document.createTextNode("维护与清理")');
    expect(source).toContain("private environmentExpanded = true");
    expect(source).toContain("private maintenanceExpanded = true");
    expect(source).not.toContain("acquireVsCodeApi");
    expect(source).not.toContain("postMessage");
    expect(source).not.toMatch(/from ["'](?:vscode|node:fs|node:fs\/promises)["']/u);
    expect(source).not.toMatch(/\b(?:unlink|rm|rmdir|writeFile|copyFile)\s*\(/u);
    expect(entry).toContain("KtcDefineAutoBuildPrimaryPanel()");
    expect(build).toContain('entryPoints: ["src/tools/codeAssistant/KtcAutoBuildPrimaryPanelEntry.ts"]');
    expect(build).toContain('outfile: "dist/ktc-auto-build-primary-panel.js"');
    expect(artifactVerifier).toContain('readText(zip, "extension/dist/ktc-auto-build-primary-panel.js")');
    expect(artifactVerifier).toContain('autoBuildPrimaryPanelBundle.includes("ktc-auto-build-primary-panel")');
    expect(artifactVerifier).toContain('autoBuildPrimaryPanelBundle.includes("ktc-auto-build-primary-action")');
    expect(artifactVerifier).toContain('autoBuildPrimaryPanelBundle.includes("acquireVsCodeApi")');
    expect(artifactVerifier).toContain('autoBuildPrimaryPanelBundle.includes("postMessage")');
    expect(artifactVerifier).toContain('autoBuildPrimaryPanelBundle.includes("workspace.fs")');
  });

  it("Right 保留正式执行区，并以带版本草稿与 Host 共用执行入口", () => {
    const entry = readFileSync(new URL("./autoBuildViewEntry.ts", import.meta.url), "utf8");
    const controller = readFileSync(new URL("./autoBuildViewController.ts", import.meta.url), "utf8");
    expect(controller).toContain('<pnw-collapsible-block title="执行">');
    expect(entry).toContain('type: "draftChanged"');
    expect(entry).toContain('type: "configurationSnapshot"');
    expect(entry).toContain('type: "ready", documentId: autoBuildDocumentId');
    expect(controller).toContain('type: "requestConfiguration"');
    expect(controller).toContain("this.runExecutionAction(");
    expect(controller).not.toContain("ktc-system-output-block");
  });
});
