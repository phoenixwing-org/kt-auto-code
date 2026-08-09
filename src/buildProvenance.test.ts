import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ktcExtensionRuntimeProvenanceLine,
  ktcLocalWingStatusBarModel,
} from "./buildProvenance.js";

describe("Extension build provenance", () => {
  it("本地构建显示快照路径与显式 Wing 根", () => {
    expect(ktcExtensionRuntimeProvenanceLine(
      "/tmp/kt-auto-code-local-host-abc/extensions/kt-auto-code",
      { mode: "local", wingRoot: "/workspace/phoenix-wing" },
    )).toBe(
      "[Runtime] wingMode=local；"
      + "extensionPath=/tmp/kt-auto-code-local-host-abc/extensions/kt-auto-code；"
      + "wingRoot=/workspace/phoenix-wing",
    );
  });

  it("Registry 构建不输出构建机 Wing 路径", () => {
    const line = ktcExtensionRuntimeProvenanceLine(
      "/workspace/kt-auto-code",
      { mode: "registry", wingRoot: "/must-not-leak" },
    );
    expect(line).toBe(
      "[Runtime] wingMode=registry；extensionPath=/workspace/kt-auto-code",
    );
    expect(line).not.toContain("must-not-leak");
    expect(line).not.toContain("wingRoot=");
  });

  it("只有本地构建显示常驻状态栏来源", () => {
    expect(ktcLocalWingStatusBarModel(
      "/tmp/kt-auto-code-local-host-abc/extensions/kt-auto-code",
      { mode: "local", wingRoot: "/workspace/phoenix-wing" },
    )).toEqual({
      text: "$(beaker) Auto · Wing 本地",
      name: "KT Auto Code 本地 Wing 开发来源",
      tooltip: expect.stringContaining(
        "Wing：/workspace/phoenix-wing\n扩展快照：/tmp/kt-auto-code-local-host-abc/extensions/kt-auto-code",
      ),
    });
    expect(ktcLocalWingStatusBarModel(
      "/workspace/kt-auto-code",
      { mode: "registry", wingRoot: "/must-not-leak" },
    )).toBeUndefined();
  });

  it("激活入口在注册 Host 功能前追加来源首行", () => {
    const source = readFileSync(new URL("./extension.ts", import.meta.url), "utf8");
    const provenance = source.indexOf(
      "appendOutputLine(ktcExtensionRuntimeProvenanceLine(context.extensionPath))",
    );
    const firstHostAction = source.indexOf(
      'vscode.commands.executeCommand("setContext"',
    );
    expect(provenance).toBeGreaterThan(0);
    expect(firstHostAction).toBeGreaterThan(provenance);
    expect(source).toContain("ktcLocalWingStatusBarModel(context.extensionPath)");
    expect(source).toContain("vscode.window.createStatusBarItem");
  });
});
