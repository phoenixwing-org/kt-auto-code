import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLocalWingExtensionHostEnvironment,
  snapshotExtensionPaths,
} from "../scripts/extension-host-snapshot.mjs";

const root = process.cwd();
const launchScript = path.join(root, "scripts/launch-extension-host.mjs");

describe("Extension Development Host launcher", () => {
  it("loads Code and CAD by default", () => {
    const result = runDryLaunch();
    expect(result.status).toBe(0);
    expect(result.stdout.match(/--extensionDevelopmentPath=/g)).toHaveLength(2);
    expect(result.stdout).toContain(path.join(root, "extension"));
    expect(result.stdout).toContain(path.join(root, "extensions/kt-auto-cad"));
    expect(result.stderr).toContain("当前只加载已有 dist");
    expect(result.stderr).toContain("pnpm dev");
  });

  it("keeps an explicit Code-only mode", () => {
    const result = runDryLaunch("--code-only");
    expect(result.status).toBe(0);
    expect(result.stdout.match(/--extensionDevelopmentPath=/g)).toHaveLength(1);
    expect(result.stdout).not.toContain(path.join(root, "extensions/kt-auto-cad"));
  });

  it("uses an isolated snapshot and a new window for local Wing development", () => {
    const result = runDryLaunchWithEnvironment({
      PHOENIX_WING_DEV_MODE: "1",
      PHOENIX_WING_ROOT: path.join(root, "..", "phoenix-wing"),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--new-window");
    expect(result.stdout).toContain("kt-auto-code-local-host-<runtime>");
    expect(result.stdout).toContain("本地快照");
    expect(result.stdout).toContain("旧 Development Host 不会自动关闭");
    expect(result.stdout).toContain("只在刚打开的窗口测试");
    expect(result.stderr).not.toContain("当前只加载已有 dist");
    expect(result.stdout.match(/--extensionDevelopmentPath=/g)).toHaveLength(2);
    expect(result.stdout).not.toContain(`--extensionDevelopmentPath=${path.join(root, "extension")}`);
  });

  it("copies runnable extension files without dependency trees or old VSIX files", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kt-auto-host-snapshot-test-"));
    try {
      const source = path.join(fixtureRoot, "source");
      fs.mkdirSync(path.join(source, "dist"), { recursive: true });
      fs.mkdirSync(path.join(source, "node_modules", "old-wing"), { recursive: true });
      fs.mkdirSync(path.join(source, ".git"), { recursive: true });
      fs.writeFileSync(path.join(source, "package.json"), "{}");
      fs.writeFileSync(path.join(source, "dist", "extension.js"), "exports.activate = () => {};");
      fs.writeFileSync(path.join(source, "node_modules", "old-wing", "index.js"), "old");
      fs.writeFileSync(path.join(source, ".git", "HEAD"), "ref: refs/heads/main");
      fs.writeFileSync(path.join(source, "old.vsix"), "old");

      const snapshot = snapshotExtensionPaths(
        [{ id: "kt-auto-code", path: source }],
        { temporaryDirectory: fixtureRoot },
      );
      const target = snapshot.paths[0]!;
      expect(fs.existsSync(path.join(target, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(target, "dist", "extension.js"))).toBe(true);
      expect(fs.existsSync(path.join(target, "node_modules"))).toBe(false);
      expect(fs.existsSync(path.join(target, ".git"))).toBe(false);
      expect(fs.existsSync(path.join(target, "old.vsix"))).toBe(false);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("requires the two local Wing launch variables as one contract", () => {
    expect(isLocalWingExtensionHostEnvironment({})).toBe(false);
    expect(() => isLocalWingExtensionHostEnvironment({ PHOENIX_WING_DEV_MODE: "1" })).toThrow(
      "必须同时设置",
    );
  });

  it("uses the dual configuration as the first F5 choice", () => {
    const launch = JSON.parse(fs.readFileSync(path.join(root, ".vscode/launch.json"), "utf8"));
    expect(launch.configurations[0].name).toBe("Run Code + CAD Extensions");
    expect(launch.configurations[0].args).toEqual([
      "--extensionDevelopmentPath=${workspaceFolder}/extension",
      "--extensionDevelopmentPath=${workspaceFolder}/extensions/kt-auto-cad",
    ]);
  });
});

function runDryLaunch(...args: string[]): SpawnSyncReturns<string> {
  return runDryLaunchWithEnvironment({}, ...args);
}

function runDryLaunchWithEnvironment(
  environment: NodeJS.ProcessEnv,
  ...args: string[]
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [launchScript, ...args, "--dry-run"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PHOENIX_WING_DEV_MODE: "",
      PHOENIX_WING_ROOT: "",
      ...environment,
    },
  });
}
