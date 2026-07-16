import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const launchScript = path.join(root, "scripts/launch-extension-host.mjs");

describe("Extension Development Host launcher", () => {
  it("loads Code and CAD by default", () => {
    const result = runDryLaunch();
    expect(result.status).toBe(0);
    expect(result.stdout.match(/--extensionDevelopmentPath=/g)).toHaveLength(2);
    expect(result.stdout).toContain(path.join(root, "extension"));
    expect(result.stdout).toContain(path.join(root, "extensions/kt-auto-cad"));
  });

  it("keeps an explicit Code-only mode", () => {
    const result = runDryLaunch("--code-only");
    expect(result.status).toBe(0);
    expect(result.stdout.match(/--extensionDevelopmentPath=/g)).toHaveLength(1);
    expect(result.stdout).not.toContain(path.join(root, "extensions/kt-auto-cad"));
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

function runDryLaunch(...args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [launchScript, ...args, "--dry-run"], {
    cwd: root,
    encoding: "utf8",
  });
}
