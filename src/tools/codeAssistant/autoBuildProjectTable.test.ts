import { describe, expect, it } from "vitest";
import { ktcCreateAutoBuildProjectRow, ktcResolveAutoBuildPath, ktcStoreAutoBuildPath } from "./autoBuildProjectTable.js";

describe("Auto Build project table paths", () => {
  it("stores descendants relative to the working directory", () => {
    expect(ktcStoreAutoBuildPath("E:/codeMaster/XyCore", "E:/codeMaster")).toBe("XyCore");
    expect(ktcResolveAutoBuildPath("XyCore", "E:/codeMaster")).toMatch(/E:[\\/]codeMaster[\\/]XyCore$/i);
  });

  it("keeps paths outside the working directory absolute", () => {
    expect(ktcStoreAutoBuildPath("E:/XyRoot", "E:/codeMaster")).toMatch(/^E:[\\/]XyRoot$/i);
  });

  it("creates an enabled row without silently selecting operations", () => {
    const row = ktcCreateAutoBuildProjectRow("E:/codeMaster/XyCore", "E:/codeMaster", 0);
    expect(row).toMatchObject({ enabled: true, name: "XyCore", path: "XyCore" });
    expect(Object.values(row.operations).some(Boolean)).toBe(false);
  });
});
