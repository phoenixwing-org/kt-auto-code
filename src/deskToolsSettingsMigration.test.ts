import { beforeEach, describe, expect, it, vi } from "vitest";

type Inspection = {
  defaultValue?: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

const sections = new Map<string, Map<string, Inspection>>();
const updates: Array<{ section: string; key: string; value: unknown; target: unknown }> = [];

vi.mock("vscode", () => ({
  ConfigurationTarget: { Global: "global" },
  workspace: {
    getConfiguration(section: string) {
      return {
        inspect(key: string) {
          return sections.get(section)?.get(key);
        },
        async update(key: string, value: unknown, target: unknown) {
          updates.push({ section, key, value, target });
          const values = sections.get(section) ?? new Map<string, Inspection>();
          const inspected = values.get(key) ?? {};
          values.set(key, { ...inspected, globalValue: value });
          sections.set(section, values);
        },
      };
    },
  },
}));

import { ktcMigrateLegacyDeskToolsSettings } from "./deskToolsSettingsMigration.js";

function configure(section: string, key: string, inspected: Inspection): void {
  const values = sections.get(section) ?? new Map<string, Inspection>();
  values.set(key, inspected);
  sections.set(section, values);
}

beforeEach(() => {
  sections.clear();
  updates.length = 0;
});

describe("Desk Tools legacy settings migration", () => {
  it("moves explicit CAA and CAD values to unified global settings", async () => {
    configure("ktAutoCode.caa.externalEditor", "command", { workspaceValue: "  /Applications/Desk Tools  " });
    configure("ktAutoCode.caa.externalEditor", "args", { workspaceFolderValue: ["--file", "${file}"] });
    configure("ktAutoCode.caa.externalEditor", "endpoint", { globalValue: " http://127.0.0.1:5180/api/caa/dialog/open " });
    configure("ktAutoCad", "deskToolsProviderManifest", { globalValue: "/Desk/runtime/native-provider.json" });

    await expect(ktcMigrateLegacyDeskToolsSettings()).resolves.toEqual([
      "executable",
      "executableArgs",
      "serviceEndpoint",
      "discoveryMode",
      "nativeProviderManifest",
    ]);
    expect(updates).toEqual([
      { section: "ktAutoCode.deskTools", key: "executable", value: "/Applications/Desk Tools", target: "global" },
      { section: "ktAutoCode.deskTools", key: "executableArgs", value: ["--file", "${file}"], target: "global" },
      { section: "ktAutoCode.deskTools", key: "serviceEndpoint", value: "http://127.0.0.1:5180/api/caa/dialog/open", target: "global" },
      { section: "ktAutoCode.deskTools", key: "discoveryMode", value: "custom", target: "global" },
      { section: "ktAutoCode.deskTools", key: "nativeProviderManifest", value: "/Desk/runtime/native-provider.json", target: "global" },
    ]);
  });

  it("never migrates defaults or overwrites explicit unified values", async () => {
    configure("ktAutoCode.deskTools", "executable", { globalValue: "/new/desk" });
    configure("ktAutoCode.deskTools", "discoveryMode", { globalValue: "auto" });
    configure("ktAutoCode.caa.externalEditor", "command", { workspaceValue: "/old/desk" });
    configure("ktAutoCode.caa.externalEditor", "endpoint", { defaultValue: "http://127.0.0.1:5180/api/caa/dialog/open" });
    configure("ktAutoCad", "deskToolsProviderManifest", { defaultValue: "" });

    await expect(ktcMigrateLegacyDeskToolsSettings()).resolves.toEqual([]);
    expect(updates).toEqual([]);
  });

  it("is idempotent after the first successful migration", async () => {
    configure("ktAutoCode.caa.externalEditor", "command", { globalValue: "/old/desk" });
    await expect(ktcMigrateLegacyDeskToolsSettings()).resolves.toEqual(["executable"]);
    await expect(ktcMigrateLegacyDeskToolsSettings()).resolves.toEqual([]);
    expect(updates).toHaveLength(1);
  });
});
