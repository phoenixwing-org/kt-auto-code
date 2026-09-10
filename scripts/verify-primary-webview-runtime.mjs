import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { Window } from "happy-dom";
import ts from "typescript";

/** Execute the shipped Primary HTML and its own script list, never Preview's
 * globally registered components. Only VS Code IPC and Host data are fixtures.
 * This DOM gate does not replace a real VS Code/CSP/visual installation check. */
export async function verifyPrimaryWebviewRuntime(extensionBundle, readResource) {
  const names = ["getPanelHtml", "ktcGitPanelModel", "ktcGitRepositoryOptionLabels",
    "ktcResolveGroupMruToolId", "ktcEditorCompanionStatusText",
    "ktcSearchReplaceButtonState", "ktcSimpleRenameRules"];
  const parsed = ts.createSourceFile("extension.js", extensionBundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = parsed.statements.filter((node) => ts.isFunctionDeclaration(node)
    && names.includes(node.name?.text));
  assert.equal(declarations.length, names.length, "Primary bootstrap declarations must be present in the actual bundle");
  const context = {
    // Security enforcement belongs to the real-browser check; DOM execution is offline.
    ktcCreateWebviewSecurity: () => ({ nonce: "primary-smoke", csp: "default-src 'none'" }),
    KTC_CODE_ASSISTANT_NAVIGATION: [],
    KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS: ["projectRename", "packageIncludes", "autoBuild"],
  };
  runInNewContext(declarations.map((node) => node.getText(parsed)).join("\n"), context);
  const extensionUri = { path: "/extension", with(change) { return { ...this, ...change }; } };
  const html = context.getPanelHtml({ asWebviewUri: (uri) => uri.path }, extensionUri);
  const windows = [];
  try {
    for (const hasWorkspace of [false, true]) {
      const window = new Window({ url: "https://primary-smoke.invalid", settings: {
        disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true,
      } });
      windows.push(window);
      const messages = [];
      const errors = [];
      window.addEventListener("error", (event) => errors.push(event.error ?? event.message));
      window.acquireVsCodeApi = () => ({ getState: () => undefined, setState() {}, postMessage: (message) => messages.push(message) });
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gu)]
        .map((match) => ({ src: /\bsrc="([^"]+)"/u.exec(match[1])?.[1], text: match[2] }));
      // happy-dom 15 does not implement native in-place custom-element upgrade.
      // Run the real registration entries before parsing, then the real IPC script.
      // Actual parser/upgrade timing is additionally checked in Chromium/VS Code.
      for (const script of scripts.filter((script) => script.src)) {
        assert.match(script.src, /^\/extension\/dist\/[\w-]+\.js$/u);
        window.eval(readResource(script.src.slice(1)));
      }
      window.document.write(html);
      for (const script of scripts.filter((script) => !script.src)) window.eval(script.text);
      assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: "ready" }], "Primary must send its real ready handshake");
      const dialog = window.document.getElementById("run-cleanup-dialog");
      assert.ok(window.customElements.get("pnw-cleanup-dialog"), "Primary did not register pnw-cleanup-dialog");
      assert.equal(typeof dialog.close, "function", "Run cleanup must have the real Wing close method");
      assert.equal(typeof dialog.showModal, "function", "Run cleanup must have the real Wing showModal method");
      const send = (data) => window.dispatchEvent(new window.MessageEvent("message", { data }));
      const tools = [
        { id: "run", title: "Run", moduleId: "code" },
        { id: "codegen", title: "自动代码", moduleId: "code" },
      ];
      const directory = hasWorkspace ? "/workspace/smoke" : "";
      const init = { type: "init", tools, activeToolId: "", openToolIds: [],
        workspaceLabel: hasWorkspace ? "smoke" : "（未打开工作区）", presentation: "detailBlock",
        workingContext: { label: directory || "未打开目录", selectedDirectory: directory, resolvedDirectory: directory },
        ribbonLayout: { pinnedToolIds: ["run", "codegen"], toolOrder: [] },
      };
      // No Run session exists on first load. This used to call close() on an unregistered element.
      send(init);
      assert.deepEqual(errors, [], "First Primary init must not throw");
      assert.equal(window.document.getElementById("current-tool-region").model.title, "KT Auto Code");
      assert.equal(window.document.getElementById("welcome-panel").hidden, false);
      assert.ok(window.document.getElementById("tabs").textContent.includes("Run"));
      assert.ok(window.document.getElementById("tabs").textContent.includes("自动代码"));
      assert.equal(dialog.shadowRoot?.querySelector("dialog")?.hasAttribute("open"), false);
      // The sidebar must still render after opening a tool and receiving a directory refresh.
      send({ type: "openTools", activeToolId: "run", openToolIds: ["run"] });
      send({ type: "workingContext", context: init.workingContext });
      assert.equal(window.document.getElementById("current-tool-region").model.title, "Run");
      assert.equal(window.document.getElementById("welcome-panel").hidden, true);
      assert.deepEqual(errors, [], "Run activation and directory refresh must not throw");
      assert.equal(messages.some((message) => message.type === "runAction"), false, "Loading must never execute cleanup");
    }
    return { emptyWindow: true, workspaceWindow: true, cleanupRegistered: true, toolbarRendered: true, runActivated: true };
  } finally {
    await Promise.all(windows.map((window) => window.happyDOM.abort()));
  }
}
