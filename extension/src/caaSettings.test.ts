import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

type Inspection = {
  defaultValue?: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

const sections = new Map<string, Map<string, Inspection>>();

vi.mock("vscode", () => ({
  commands: { executeCommand: vi.fn(async () => undefined) },
  ConfigurationTarget: { Global: "global" },
  workspace: {
    getConfiguration(section: string) {
      return {
        inspect(key: string) { return sections.get(section)?.get(key); },
        get(key: string, fallback: unknown) {
          const inspected = sections.get(section)?.get(key);
          return inspected?.workspaceFolderValue
            ?? inspected?.workspaceValue
            ?? inspected?.globalValue
            ?? inspected?.defaultValue
            ?? fallback;
        },
        update: vi.fn(async () => undefined),
      };
    },
  },
}));

const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ktc-caa-settings-"));
process.env.PHOENIX_DESK_TOOLS_REGISTRY_DIR = registryRoot;

import { ktcReadCaaExternalEditor, ktcResolveDeskToolsNativeProvider } from "./caaSettings.js";

function configure(section: string, key: string, inspected: Inspection): void {
  const values = sections.get(section) ?? new Map<string, Inspection>();
  values.set(key, inspected);
  sections.set(section, values);
}

beforeEach(() => sections.clear());
afterAll(() => {
  delete process.env.PHOENIX_DESK_TOOLS_REGISTRY_DIR;
  fs.rmSync(registryRoot, { recursive: true, force: true });
});

describe("CAA unified settings precedence", () => {
  it("treats explicit empty new values as authoritative instead of reviving legacy values", () => {
    configure("ktAutoCode.deskTools", "executable", { globalValue: "" });
    configure("ktAutoCode.deskTools", "executableArgs", { globalValue: [] });
    configure("ktAutoCode.deskTools", "serviceEndpoint", { globalValue: "" });
    configure("ktAutoCode.deskTools", "nativeProviderManifest", { globalValue: "" });
    configure("ktAutoCode.caa.externalEditor", "command", { workspaceValue: "/legacy/editor" });
    configure("ktAutoCode.caa.externalEditor", "args", { workspaceValue: ["legacy", "${file}"] });
    configure("ktAutoCode.caa.externalEditor", "endpoint", { workspaceValue: "http://127.0.0.1:5180/api/caa/dialog/open" });
    configure("ktAutoCad", "deskToolsProviderManifest", { globalValue: "/legacy/native-provider.json" });

    expect(ktcReadCaaExternalEditor()).toMatchObject({ command: "", args: [], endpoint: "" });
    expect(ktcResolveDeskToolsNativeProvider()).toBe("");
  });

  it("continues reading legacy values when no unified value was explicitly configured", () => {
    configure("ktAutoCode.caa.externalEditor", "command", { workspaceValue: "/legacy/editor" });
    configure("ktAutoCode.caa.externalEditor", "args", { workspaceValue: ["${file}"] });
    configure("ktAutoCode.caa.externalEditor", "endpoint", { workspaceValue: "http://127.0.0.1:5180/api/caa/dialog/open" });
    configure("ktAutoCad", "deskToolsProviderManifest", { globalValue: "/legacy/native-provider.json" });

    expect(ktcReadCaaExternalEditor()).toMatchObject({
      command: "/legacy/editor",
      args: ["${file}"],
      endpoint: "http://127.0.0.1:5180/api/caa/dialog/open",
    });
    expect(ktcResolveDeskToolsNativeProvider()).toBe("/legacy/native-provider.json");
  });
});
