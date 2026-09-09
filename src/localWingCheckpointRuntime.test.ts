import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KtCodegenItem, KtCodegenParam, KtCodegenTableCore } from "@phoenix-wing/kt-codegen";
// @ts-expect-error Repository verification is intentionally implemented as plain ESM.
import { verifyCodegenCoreCheckpointRuntime, verifyCodegenTableBundleCheckpointRuntime } from "../scripts/verify-codegen-checkpoint-runtime.mjs";

function tableBundle(supportsSnapshot: boolean): string {
  return `(() => {
    const clone = (value) => JSON.parse(JSON.stringify(value));
    class Table {
      setData(data) { this.data = clone(data); this.checkpoint = clone(data.items); }
      getData() { return clone(this.data); }
      markCheckpoint(revision, savedItems) {
        this.data.documentRevision = revision;
        this.checkpoint = clone(${supportsSnapshot ? "savedItems ?? this.data.items" : "this.data.items"});
      }
      revertToCheckpoint() { this.data.items = clone(this.checkpoint); }
    }
    customElements.define("kt-codegen-table", Table);
  })();`;
}

describe("Codegen checkpoint runtime gates", () => {
  it("拒绝有同名 markCheckpoint 但静默忽略保存快照的旧 Core", () => {
    class LegacyCore extends KtCodegenTableCore {
      override markCheckpoint(revision?: number): void { super.markCheckpoint(revision); }
    }
    expect(() => verifyCodegenCoreCheckpointRuntime({
      KtCodegenItem, KtCodegenParam, KtCodegenTableCore: LegacyCore,
    })).toThrow("不支持保存快照 checkpoint");
  });

  it("执行制品 table 注册入口，只有真正传递保存快照的版本才能通过", () => {
    // Fixture bundles exercise the verifier itself; actual Wing behavior is tested in its package.
    expect(() => verifyCodegenTableBundleCheckpointRuntime(tableBundle(false))).toThrow("不支持保存快照 checkpoint");
    expect(verifyCodegenTableBundleCheckpointRuntime(tableBundle(true))).toEqual({ checkpointSnapshot: true });
    expect(() => verifyCodegenTableBundleCheckpointRuntime('const callSite = "markCheckpoint(7, saved.items)";'))
      .toThrow("未注册真实 table");
  });

  it("本地启动与每个 VSIX 验收都执行语义门禁，包括 Registry 制品", () => {
    const root = resolve(import.meta.dirname, "..");
    const local = readFileSync(resolve(root, "scripts/verify-local-wing-marker-runtime.mjs"), "utf8");
    const artifact = readFileSync(resolve(root, "scripts/verify-extension-artifacts.mjs"), "utf8");
    expect(local).toContain("verifyCodegenCoreCheckpointRuntime(runtime");
    expect(artifact).toContain("verifyCodegenTableBundleCheckpointRuntime(tableBundle");
  });
});
