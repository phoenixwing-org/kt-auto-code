import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KtcCaaInstallationArguments,
  KtcCaaRadeCommandRoot,
  KtcResolveCaaInstallation,
} from "./KtcCaaInstallation.js";

describe("CAA machine installation resolution", () => {
  it("uses the documented C:\\DS convention and fixed RADE intel_a tool directory", () => {
    const installation = KtcResolveCaaInstallation({ version: "R20" });
    expect(installation).toEqual({
      radeRoot: "C:\\DS\\RADE20",
      catiaRoot: "C:\\DS\\B20",
    });
    expect(KtcCaaRadeCommandRoot(installation)).toBe("C:\\DS\\RADE20\\intel_a");
  });

  it("keeps explicitly configured RADE and CATIA roots separate", () => {
    const installation = KtcResolveCaaInstallation({
      version: "26",
      radeRoot: "D:/Dassault/RADE-R26/",
      catiaRoot: "E:/Dassault/CATIA-R26/",
    });
    expect(installation).toEqual({
      radeRoot: "D:/Dassault/RADE-R26",
      catiaRoot: "E:/Dassault/CATIA-R26",
    });
    expect(KtcCaaInstallationArguments(installation)).toEqual([
      "--rade-root", "D:/Dassault/RADE-R26",
      "--catia-root", "E:/Dassault/CATIA-R26",
    ]);
  });

  it("rejects invalid machine values before they reach cmd.exe", () => {
    expect(() => KtcResolveCaaInstallation({ version: "20", radeRoot: "C:/DS/& unsafe" }))
      .toThrow("CAA 安装目录无效");
  });

  it("keeps the bundled cmd protocol aligned with the resolved machine values", () => {
    const runner = readFileSync(path.join(process.cwd(), "resources/run/caa/pnw-caa-runner.cmd"), "utf8");
    expect(runner).toContain('"--rade-root"');
    expect(runner).toContain('"--catia-root"');
    expect(runner).not.toContain('"--runtime"');
    expect(runner).toContain('set "PNW_BASE=%PNW_RADE_ROOT%\\intel_a"');
    expect(runner).toContain('set "PNW_PREQ=%PNW_CATIA_ROOT%;%PNW_PROJECT%"');
  });
});
