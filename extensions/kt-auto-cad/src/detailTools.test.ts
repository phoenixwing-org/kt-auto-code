import { describe, expect, it } from "vitest";
import { KTC_CAD_DETAIL_TOOLS, ktcGetCadDetailTool } from "./detailTools.js";

describe("CAD detail Block prototypes", () => {
  it("defines one detail prototype for every Ribbon tool", () => {
    expect(KTC_CAD_DETAIL_TOOLS.map((tool) => tool.id)).toEqual([
      "cadFilename",
      "cadScan",
      "cadRead",
      "cadQuery",
      "cadProvider",
      "cadDiagnostics",
    ]);
  });

  it("marks FCStd native reading as an optional Desk Tools enhancement", () => {
    expect(KTC_CAD_DETAIL_TOOLS.filter((tool) => tool.requirement === "desk-provider")
      .map((tool) => tool.id)).toEqual([]);
    expect(KTC_CAD_DETAIL_TOOLS.filter((tool) => tool.requirement === "optional-desk-provider")
      .map((tool) => tool.id)).toEqual(["cadRead"]);
    expect(ktcGetCadDetailTool("unknown").id).toBe("cadFilename");
  });
});
