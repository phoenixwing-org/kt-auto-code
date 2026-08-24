import { describe, expect, it, vi } from "vitest";
import {
  ktcOrderProjectEnvironmentValues,
  ktcParseWindowsRegistryEnvironmentValue,
  ktcReadProjectEnvironment,
  ktcResolveEnvironmentDirectoryPickerPath,
} from "./projectEnvironment.js";

describe("project environment", () => {
  it("starts directory pickers at a valid configured directory or the user home", () => {
    const isDirectory = vi.fn((candidate: string) => candidate === "/configured");
    expect(ktcResolveEnvironmentDirectoryPickerPath(" /configured ", "/home/user", isDirectory)).toBe("/configured");
    expect(ktcResolveEnvironmentDirectoryPickerPath("/missing", "/home/user", isDirectory)).toBe("/home/user");
    expect(ktcResolveEnvironmentDirectoryPickerPath("", "/home/user", isDirectory)).toBe("/home/user");
  });

  it("orders required environment variables before optional ones without changing group order", () => {
    const values = [
      { key: "sdkPrefix", environmentVariable: "SDK_PREFIX", required: false, source: "default", value: "kt" },
      { key: "customRoot", environmentVariable: "ROOT_DIR", required: true, source: "system", value: "/sdk" },
      { key: "includeRoot", environmentVariable: "ROOT_DIR_INCLUDE", required: false, source: "system", value: "/include" },
      { key: "coreRoot", environmentVariable: "ROOT_DIR_CORE", required: true, source: "system", value: "/core" },
    ] as const;
    expect(ktcOrderProjectEnvironmentValues(values).map((value) => value.key)).toEqual([
      "customRoot",
      "coreRoot",
      "sdkPrefix",
      "includeRoot",
    ]);
  });

  it("parses Windows REG_SZ and REG_EXPAND_SZ values", () => {
    expect(ktcParseWindowsRegistryEnvironmentValue(
      "HKEY_CURRENT_USER\\Environment\r\n    ROOT_DIR    REG_SZ    D:\\Phoenix\r\n",
      "ROOT_DIR",
    )).toBe("D:\\Phoenix");
    expect(ktcParseWindowsRegistryEnvironmentValue(
      "    ROOT_DIR_CORE    REG_EXPAND_SZ    %ROOT_DIR%\\core\r\n",
      "root_dir_core",
    )).toBe("%ROOT_DIR%\\core");
  });

  it("falls back to fresh Windows environment values when the extension host inherited none", async () => {
    const values: Record<string, string> = {
      ROOT_DIR: "D:\\Phoenix",
      SDK_PREFIX: "phoenix",
      ROOT_DIR_3rdParty: "D:\\ThirdParty",
      ROOT_DIR_CORE: "D:\\Core",
      ROOT_DIR_INCLUDE: "D:\\Phoenix\\phoenix\\include\\KtCore",
      CAA_MK_VERSION: "19",
    };
    const readWindowsVariable = vi.fn(async (name: keyof typeof values) => values[name]);
    const environment = await ktcReadProjectEnvironment({
      platform: "win32",
      system: {},
      readWindowsVariable,
    });
    expect(environment.complete).toBe(true);
    expect(environment.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ environmentVariable: "ROOT_DIR", value: "D:\\Phoenix", source: "system" }),
      expect.objectContaining({ environmentVariable: "CAA_MK_VERSION", value: "19", source: "system" }),
    ]));
    expect(readWindowsVariable).toHaveBeenCalledTimes(6);
  });

  it("uses fresh Windows registry values instead of stale inherited values", async () => {
    const environment = await ktcReadProjectEnvironment({
      platform: "win32",
      system: { ROOT_DIR: "D:\\Old" },
      readWindowsVariable: async (name) => name === "ROOT_DIR" ? "D:\\New" : undefined,
    });
    expect(environment.values[0]).toEqual(expect.objectContaining({ value: "D:\\New", source: "system" }));
  });

  it("expands Windows environment references in refreshed values", async () => {
    const environment = await ktcReadProjectEnvironment({
      platform: "win32",
      system: {},
      readWindowsVariable: async (name) => ({
        ROOT_DIR: "D:\\Phoenix",
        ROOT_DIR_CORE: "%ROOT_DIR%\\core",
        ROOT_DIR_INCLUDE: "%ROOT_DIR%\\kt\\include\\KtCore",
      } as Partial<Record<string, string>>)[name],
    });
    expect(environment.values.find((value) => value.key === "coreRoot")?.value).toBe("D:\\Phoenix\\core");
    expect(environment.values.find((value) => value.key === "includeRoot")?.value).toBe("D:\\Phoenix\\kt\\include\\KtCore");
  });

  it("uses kt as the SDK_PREFIX default when the variable is absent", async () => {
    const environment = await ktcReadProjectEnvironment({
      system: { ROOT_DIR: "/sdk", ROOT_DIR_3rdParty: "/third", ROOT_DIR_CORE: "/sdk/kt/macos/core", ROOT_DIR_INCLUDE: "/sdk/kt/include/KtCore" },
    });
    expect(environment.values.find((value) => value.key === "sdkPrefix")).toEqual(expect.objectContaining({
      value: "kt",
      source: "default",
      suggestedValue: "kt",
    }));
  });

  it("allows ROOT_DIR_INCLUDE to remain unset", async () => {
    const environment = await ktcReadProjectEnvironment({
      system: {
        ROOT_DIR: "/sdk",
        ROOT_DIR_3rdParty: "/third",
        ROOT_DIR_CORE: "/sdk/kt/macos/core",
      },
    });
    expect(environment.complete).toBe(true);
    expect(environment.values.find((value) => value.key === "includeRoot")).toEqual(expect.objectContaining({
      required: false,
      source: "missing",
    }));
  });
});
