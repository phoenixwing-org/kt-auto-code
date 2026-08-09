import { describe, expect, it, vi } from "vitest";
import {
  ktcParseWindowsRegistryEnvironmentValue,
  ktcReadProjectEnvironment,
} from "./projectEnvironment.js";

describe("project environment", () => {
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
      ROOT_DIR_3rdParty: "D:\\ThirdParty",
      ROOT_DIR_CORE: "D:\\Core",
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
    expect(readWindowsVariable).toHaveBeenCalledTimes(4);
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
      } as Partial<Record<string, string>>)[name],
    });
    expect(environment.values.find((value) => value.key === "coreRoot")?.value).toBe("D:\\Phoenix\\core");
  });
});
