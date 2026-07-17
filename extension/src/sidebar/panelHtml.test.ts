import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPanelHtml, ktcNextReorderSelection, ktcSearchReplaceButtonState } from "./panelHtml.js";

describe("sidebar panel HTML", () => {
  it("使用统一关联规则对话框而不是多套 Quick Pick 消息", () => {
    const html = getPanelHtml(
      { cspSource: "test-webview" } as unknown as Parameters<typeof getPanelHtml>[0],
      {} as unknown as Parameters<typeof getPanelHtml>[1],
    );

    expect(html).toContain('id="rule-picker"');
    expect(html).toContain('dataset.customSearch');
    expect(html).toContain('type: "requestAssociatedRuleCandidates"');
    expect(html).toContain('type: "appendAssociatedRules"');
    expect(html).toContain('id="btn-pick-working-directory"');
    expect(html).toContain('id="replace-profile-name"');
    expect(html).toContain('label,');
    expect(html).toContain('id="workspace-file-scope-select"');
    expect(html).toContain('type: "selectWorkspaceFileScope"');
    expect(html).toContain('type: "openWorkspaceWorksets"');
    expect(html).not.toContain('state.replace.scope = ""');
    expect(html).toContain('list="recent-working-directories"');
    expect(html).toContain('type: "pickSearchReplaceDirectory"');
    expect(html).toContain('type: "rememberSearchReplaceDirectory"');
    expect(html).toContain('"当前工作区 · " + directory');
    expect(html).toContain('"外部 · " + directory');
    expect(html).not.toContain('type: "chooseCaaRules"');
    expect(html).not.toContain('type: "chooseAssociatedRule"');
    expect(html).toContain('body.detail-block #tabs');
    expect(html).toContain('id="module-block"');
    expect(html).toContain('type: "moduleBlockAction"');
    expect(html).toContain('msg.type === "moduleBlock"');
    expect(html).toContain('body.external-module-block');
    expect(html).not.toContain('id="module-filters"');
    expect(html).not.toContain('id="module-code"');
    expect(html).not.toContain('id="module-cad"');
    expect(html).toContain('msg.type === "modules"');
    expect(html).toContain('(item.moduleId || "code") === moduleId');
    expect(html).toContain('type: "runModuleTool"');
    expect(html).toContain('t.shortTitle || shortTitles[t.id] || t.title');
    expect(html).toContain('body.detail-block .reorder-block h2');
    expect(html).toContain('id="btn-reorder-apply"');
    expect(html).toContain('id="reorder-show-unchanged"');
    expect(html).toContain('id="reorder-groups"');
    expect(html).toContain('type: "reorderAction"');
    expect(html).toContain('type: "reorderSelection"');
    expect(html).toContain('createReorderIcon("⇄", "预览排序差异"');
    expect(html).toContain('createReorderIcon("↶", "还原本次成员排序"');
    expect(html).toContain('acceptReorderState(msg.state)');
    expect(html).toContain('.reorder-file-name { flex: 0 0 auto;');
    expect(html).toContain('.reorder-file-dir { flex: 1 1 0; min-width: 0;');
    expect(html).toContain('pending: "M", applied: "✓"');
    expect(html).toContain('state.presentation === "detailBlock"');
    expect(html).toContain('className = "tab" + (isOpen ? " open" : "") + (isActive ? " active" : "")');
    expect(html).toContain('已打开，当前隐藏');
    expect(html).toContain('.tab.open:not(.active)');
    expect(html).toContain('msg.type === "openTools"');
    expect(html).not.toContain('body.detail-block #results');
    expect(html).toContain('renderEncodingResults(ts, !!state.showEncDetails)');
    expect(html).toContain('renderHeaderResults(ts, !!state.showDetails)');
    expect(html).toContain('renderCodeRenameResults(ts)');
    expect(html).toContain('renderIgnoreResults(ts)');
    expect(html).toContain('renderUuidResults(ts)');
    expect(html).toContain('renderCaaResults(ts)');
    expect(html).toContain('renderEnvironment(ts)');
    expect(html).toContain('id="environment-block"');
    expect(html).toContain('id="codegen-block"');
    expect(html).toContain('id="codegen-list"');
    expect(html).toContain('id="btn-codegen-candidates"');
    expect(html).toContain('id="btn-codegen-diagnostics"');
    expect(html).toContain('id="codegen-current" role="status" aria-live="polite"');
    expect(html).toContain('id="codegen-list" aria-label="Codegen JSON 列表"');
    expect(html).toContain('id="codegen-json-block" open');
    expect(html).toContain('id="codegen-document-count"');
    expect(html).toContain("max-height: 252px");
    expect(html).toContain('grid-auto-rows: 48px;');
    expect(html).not.toContain('max-height: 507px;');
    expect(html).toContain('activeRow.scrollIntoView({ block: "nearest", inline: "nearest" })');
    expect(html).toContain('els.codegenList.setAttribute("aria-busy"');
    expect(html).toContain('row.setAttribute("aria-current", entry.active ? "true" : "false")');
    expect(html).toContain('.codegen-row.active .codegen-tag { color: inherit;');
    expect(html).toContain('id="codegen-candidate-list"');
    expect(html).toContain('id="codegen-candidate-block" open');
    expect(html).toContain('? "cancelOperation" : "scanCandidates"');
    expect(html).toContain('? "cancelOperation" : "refresh"');
    expect(html).toContain('action: "openCandidate"');
    expect(html).toContain('action: "copyDiagnostics"');
    expect(html).toContain('id="codegen-properties"');
    expect(html).toContain('id="codegen-prefix"');
    expect(html).toContain('id="codegen-middle"');
    expect(html).toContain('id="codegen-namespace"');
    expect(html).toContain('id="codegen-append"');
    expect(html).toContain('type: "codegenAction"');
    expect(html).toContain('action: "openDocument"');
    expect(html).not.toContain("for (const document of documents)");
    expect(html).toContain("for (const entry of documents)");
    expect(html).toContain('action: "updateMeta"');
    expect(html).toContain('一份 JSON 对应当前编辑区一个表格 View');
    expect(html).not.toContain('document.active ? " current" : ""');
    expect(html).toContain('action: "pick"');
    expect(html).toContain('action: "set"');
    expect(html).toContain('action: "clear"');
    expect(html).toContain('id="btn-apply-ignore-recommendations"');
    expect(html).toContain('type: "uuidAction"');
    expect(html).toContain('id="uuid-options"');
    expect(html).toContain('id="uuid-strategy"');
    expect(html).toContain('uuidStrategy: isUuidTool() ? state.uuidStrategy : undefined');
    expect(html).toContain('type: "caaDialogAction"');
    expect(html).toContain('id="btn-caa-check-connection"');
    expect(html).toContain('action: "checkConnection"');
    expect(html).toContain('ts.caaDeskConnection');
    expect(html).toContain('type: "codeRenameAction"');
    expect(html).toContain('mark.result-hit');
    expect(html).toContain('.compact-file-name { flex: 0 0 auto;');
    expect(html).toContain('.compact-file-dir { flex: 1 1 0; min-width: 0;');
    expect(html).toContain('body.ribbon-only .wrap { padding: 3px 10px 4px; }');
    expect(html).toContain('className = "module-group"');
    expect(html).toContain('className = "module-group-label"');
    expect(html).toContain('(moduleTools[0].moduleTitle || moduleId).toUpperCase()');
    expect(html).toContain('.module-group-tools { display: flex;');
    expect(html).toContain('min-height: 50px;');
    expect(html).toContain('id="replace-validation"');
    expect(html).toContain('id="replace-preview-tooltip"');
    expect(html).toContain('id="replace-apply-tooltip"');
    expect(html).toContain('els.replacePreviewTooltip.title = disabledReason');
    expect(html).toContain('body.task-running button.action:disabled { cursor: progress; }');
    expect(html).toContain('button.action:disabled { opacity: 0.5; cursor: not-allowed; }');

    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();

    const uuidTool = readFileSync(new URL("../tools/uuidReplace/index.ts", import.meta.url), "utf8");
    expect(uuidTool).not.toContain("showQuickPick");
    expect(uuidTool).not.toContain("chooseStrategy");
    const profileController = readFileSync(new URL("../searchReplaceProfileController.ts", import.meta.url), "utf8");
    expect(profileController).not.toContain("showInputBox");
    expect(profileController).not.toContain("showWarningMessage");
    const encodingCommands = readFileSync(new URL("../tools/encodingFix/commands.ts", import.meta.url), "utf8");
    expect(encodingCommands).not.toContain("是否查看预检结果");
  });

  it("实际执行 Codegen 列表渲染，并允许在扫描中取消对应操作", () => {
    const html = getPanelHtml(
      { cspSource: "test-webview" } as unknown as Parameters<typeof getPanelHtml>[0],
      {} as unknown as Parameters<typeof getPanelHtml>[1],
    );
    const body = html.match(
      /function renderCodegen\(ts, running\) \{([\s\S]*?)\n    \}\n\n    function render\(\)/,
    )?.[1];
    expect(body).toBeTruthy();

    class FakeNode {
      attributes: Record<string, string> = {};
      children: FakeNode[] = [];
      className = "";
      disabled = false;
      hidden = false;
      onclick: (() => void) | undefined;
      textContent = "";
      title = "";
      type = "";
      value = "";

      append(...nodes: FakeNode[]): void {
        this.children.push(...nodes);
      }

      appendChild(node: FakeNode): FakeNode {
        this.children.push(node);
        return node;
      }

      replaceChildren(...nodes: FakeNode[]): void {
        this.children = [...nodes];
      }

      setAttribute(name: string, value: string): void {
        this.attributes[name] = value;
      }
    }

    const document = {
      createDocumentFragment: () => new FakeNode(),
      createElement: () => new FakeNode(),
    };
    const elementNames = [
      "btnCodegenOpen", "btnCodegenImport", "btnCodegenRefresh", "btnCodegenCandidates", "btnCodegenDiagnostics",
      "codegenCurrent", "codegenProperties", "codegenCurrentName", "codegenCurrentMeta",
      "codegenPrefix", "codegenMiddle", "codegenNamespace", "codegenAppend", "codegenDocumentCount", "codegenList",
      "codegenCandidateCount", "codegenCandidateList",
    ];
    const els = Object.fromEntries(elementNames.map((name) => [name, new FakeNode()]));
    const posted: unknown[] = [];
    const vscode = { postMessage: (message: unknown) => posted.push(message) };
    const renderCodegen = new Function(
      "document",
      "els",
      "vscode",
      "resultPathParts",
      `return function renderCodegen(ts, running) {${body!}\n};`,
    )(
      document,
      els,
      vscode,
      (path: string) => ({ name: path.split("/").at(-1) ?? path }),
    ) as (state: Record<string, unknown>, running: boolean) => void;

    expect(() => renderCodegen({
      codegenOperation: "discovery",
      codegenDocuments: [{
        uri: "file:///workspace/root.json",
        fileName: "root.json",
        displayPath: "root.json",
        itemCount: 3,
        className: "PNXPart",
        namePrefix: "PNX",
        nameMiddle: "Part",
        nameSpace: "Kt",
        appendFunction: "push_back",
        open: false,
        active: false,
        dirty: false,
        externalConflict: false,
        externalState: "current",
      }],
      codegenCandidates: [{
        uri: "file:///workspace/Part.cpp",
        displayPath: "Part.cpp",
        markerCount: 2,
        encoding: "UTF-8",
      }],
    }, true)).not.toThrow();

    expect(els.btnCodegenRefresh.textContent).toBe("取消扫描");
    expect(els.btnCodegenRefresh.disabled).toBe(false);
    expect(els.btnCodegenCandidates.disabled).toBe(true);
    expect(els.codegenList.attributes["aria-busy"]).toBe("true");
    expect(els.codegenCandidateList.attributes["aria-busy"]).toBe("false");
    expect(els.codegenDocumentCount.textContent).toBe("1 份");
    const documentFragment = els.codegenList.children[0]!;
    expect(documentFragment.children).toHaveLength(1);
    expect(documentFragment.children[0]!.attributes["aria-current"]).toBe("false");
    documentFragment.children[0]!.onclick?.();
    const candidateFragment = els.codegenCandidateList.children[0]!;
    expect(candidateFragment.children).toHaveLength(1);
    expect(candidateFragment.children[0]!.attributes["aria-label"]).toContain("2 个控制标记");
    candidateFragment.children[0]!.onclick?.();
    expect(posted).toEqual([
      { type: "codegenAction", toolId: "codegen", action: "openDocument", uri: "file:///workspace/root.json" },
      { type: "codegenAction", toolId: "codegen", action: "openCandidate", uri: "file:///workspace/Part.cpp" },
    ]);
  });

  it("搜索替换只在真实运行时显示繁忙，普通校验给出可操作原因", () => {
    const base = { running: false, search: "", replace: "", text: true, file: false, dir: false, extraRules: [] };
    expect(ktcSearchReplaceButtonState(base)).toEqual({
      disabled: true,
      busy: false,
      message: "请输入搜索内容，或添加一条已启用的关联规则。",
    });
    expect(ktcSearchReplaceButtonState({ ...base, search: "Old" })).toEqual({ disabled: false, busy: false, message: "" });
    expect(ktcSearchReplaceButtonState({ ...base, search: "Old", file: true })).toEqual({
      disabled: true,
      busy: false,
      message: "替换文件名或文件夹名时，替换内容不能为空。",
    });
    expect(ktcSearchReplaceButtonState({ ...base, running: true })).toEqual({ disabled: true, busy: true, message: "" });
  });

  it("只贡献 Ribbon 与单个工具 Block，不再注册旧结果 TreeView", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      contributes: {
        viewsContainers?: { activitybar?: Array<{ id: string }> };
        views: Record<string, Array<{ id: string; initialSize?: number; when?: string }>>;
        menus: Record<string, unknown[]>;
        configuration: { properties: Record<string, unknown> };
      };
    };
    expect(manifest.contributes.views["kt-auto-code"]?.map((view) => view.id)).toEqual([
      "ktAutoCode.sidebar",
      "ktAutoCode.modulePanel",
    ]);
    expect(manifest.contributes.views["kt-auto-code"]?.map((view) => view.initialSize)).toEqual([1, 12]);
    expect(manifest.contributes.viewsContainers?.activitybar).toHaveLength(1);
    expect(manifest.contributes.viewsContainers?.activitybar?.[0]?.id).toBe("kt-auto-code");
    expect(manifest.contributes.views["kt-auto-code"]?.[1]?.when).toBe(
      "ktAutoCode.modulePanelVisible",
    );
    expect(manifest.contributes.menus["view/item/context"]).toBeUndefined();
    expect(Object.keys(manifest.contributes.configuration.properties)).not.toEqual(expect.arrayContaining([
      "ktAutoCode.environment.rootDir",
      "ktAutoCode.environment.rootDir3rdParty",
      "ktAutoCode.environment.rootDirCore",
      "ktAutoCode.environment.mkVersion",
    ]));
  });

  it("新扫描全选 pending，同一缓存更新保留用户取消选择", () => {
    const rows = (states: Array<[string, "pending" | "applied"]>) => states.map(([uri, state]) => ({
      uri,
      relativePath: `${uri}.cpp`,
      kind: "source" as const,
      encoding: "UTF-8",
      changed: true,
      state,
      warnings: [],
    }));
    const first = ktcNextReorderSelection(new Set(), undefined, {
      reorderRevision: 1,
      reorderResults: rows([["one", "pending"], ["two", "pending"]]),
    });
    expect([...first.selected]).toEqual(["one", "two"]);
    const sameRevision = ktcNextReorderSelection(new Set(["one"]), first.revision, {
      reorderRevision: 1,
      reorderResults: rows([["one", "applied"], ["two", "pending"]]),
      reorderSelectedUris: [],
    });
    expect([...sameRevision.selected]).toEqual([]);
    const newScan = ktcNextReorderSelection(sameRevision.selected, sameRevision.revision, {
      reorderRevision: 2,
      reorderResults: rows([["two", "pending"]]),
    });
    expect([...newScan.selected]).toEqual(["two"]);
  });
});
