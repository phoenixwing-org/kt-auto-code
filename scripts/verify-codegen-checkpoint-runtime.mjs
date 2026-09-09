import { runInNewContext } from "node:vm";

/** 执行实际行为而非只看方法名；旧 Wing 会静默忽略 savedItems 第二参数。 */
export function verifyCodegenCoreCheckpointRuntime(runtime, label = "Wing Codegen") {
  const param = new runtime.KtCodegenParam({ items: [new runtime.KtCodegenItem({ name: "saved" })] });
  const core = new runtime.KtCodegenTableCore(param);
  const saved = core.getData();
  core.updateCell(0, "name", "newer");
  core.markCheckpoint(7, saved.items);
  if (!core.dirty || core.documentRevision !== 7 || core.getData().items[0]?.name !== "newer") {
    throw new Error(`${label} 不支持保存快照 checkpoint：必须保留较新草稿、dirty 与 revision`);
  }
  core.revertToCheckpoint();
  if (core.dirty || core.getData().items[0]?.name !== "saved") {
    throw new Error(`${label} 保存快照 checkpoint 还原错误`);
  }
  return { checkpointSnapshot: true };
}

/** 在隔离 VM 中执行 VSIX 实际 table IIFE；离线、无 FS/Host 权限、无需浏览器。 */
export function verifyCodegenTableBundleCheckpointRuntime(bundle, label = "Codegen table bundle") {
  const registry = new Map();
  class Node {
    dataset = {};
    style = {};
    isConnected = false;
    append() {}
    replaceChildren() {}
    addEventListener() {}
    setAttribute() {}
    getAttribute() { return null; }
    hasAttribute() { return false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    attachShadow() { return new Node(); }
    dispatchEvent() { return true; }
  }
  const context = {
    HTMLElement: Node,
    document: { createElement: () => new Node() },
    customElements: { get: (name) => registry.get(name), define: (name, value) => registry.set(name, value) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  runInNewContext(bundle, context, { timeout: 2000, filename: "codegen-table-artifact.js" });
  const Table = registry.get("kt-codegen-table");
  if (typeof Table !== "function") throw new Error(`${label} 未注册真实 table 控件`);
  const table = new Table();
  table.setData({ kind: "kt.codegen.table-data", schemaVersion: 1, documentRevision: 0,
    selectedRow: 0, items: [{ name: "saved" }] });
  const saved = table.getData();
  const draft = table.getData(); draft.items[0].name = "newer";
  table.setData(draft);
  table.markCheckpoint(7, saved.items);
  if (table.getData().items[0]?.name !== "newer" || table.getData().documentRevision !== 7) {
    throw new Error(`${label} 保存回执覆盖了新草稿或没有推进 revision`);
  }
  table.revertToCheckpoint();
  if (table.getData().items[0]?.name !== "saved") {
    throw new Error(`${label} 不支持保存快照 checkpoint（可能仍嵌入旧 Registry Wing）`);
  }
  return { checkpointSnapshot: true };
}
