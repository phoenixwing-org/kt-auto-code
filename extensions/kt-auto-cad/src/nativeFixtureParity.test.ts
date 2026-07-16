import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { pnwIsCadNativeV1XlinkScanSuccess } from "@phoenix-wing/cad-contracts";

const require = createRequire(import.meta.url);

describe("KT Auto CAD native fixture parity", () => {
  it("consumes the real FCStd read summary verified during the Desk native build", () => {
    const fixturePath = require.resolve(
      "@phoenix-wing/cad-contracts/fixtures/native-read-real-summary-v1.json",
    );
    const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(fixture).toMatchObject({
      tool: "fcstd-read",
      operation: "read",
      ok: true,
      summary: {
        objects: 66,
        bom_items: 10,
        root_names: ["PCB"],
        selected: {
          name: "_6222656233",
          properties: { PartNumber: "8008", PartVersion: "001", PartName: "内部装配" },
        },
      },
    });
  });

  it("accepts the same real XLink golden JSON emitted during the Desk native build", () => {
    const fixturePath = require.resolve(
      "@phoenix-wing/cad-contracts/fixtures/native-xlink-real-success-v1.json",
    );
    const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(pnwIsCadNativeV1XlinkScanSuccess(fixture)).toBe(true);
    expect(fixture).toMatchObject({
      tool: "fcstd-xlink",
      operation: "scan",
      ok: true,
      result: { hits: [{ file: "8003.001-H-PHOENIX-滑轨.FCStd", label: null }] },
    });
  });
});
