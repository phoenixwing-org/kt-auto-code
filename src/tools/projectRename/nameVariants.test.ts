import { describe, expect, it } from "vitest";
import { ktcDeriveProjectRenameRules, ktcProjectRenameNameVariants } from "./nameVariants.js";

describe("project rename name variants", () => {
  it("派生 6 种明确名称形态", () => {
    expect(ktcProjectRenameNameVariants("Phoenix Dev Hub")).toEqual({
      display: "Phoenix Dev Hub",
      kebab: "phoenix-dev-hub",
      snake: "phoenix_dev_hub",
      camel: "phoenixDevHub",
      pascal: "PhoenixDevHub",
      "upper-snake": "PHOENIX_DEV_HUB",
    });
  });

  it("将常见文件系统和配置分隔符统一为词段", () => {
    expect(ktcProjectRenameNameVariants("phoenix-dev_hub")).toEqual({
      display: "Phoenix Dev Hub",
      kebab: "phoenix-dev-hub",
      snake: "phoenix_dev_hub",
      camel: "phoenixDevHub",
      pascal: "PhoenixDevHub",
      "upper-snake": "PHOENIX_DEV_HUB",
    });
  });

  it("保留 camelCase 尾部的连续大写词段", () => {
    expect(ktcProjectRenameNameVariants("bomAAA")).toEqual({
      display: "Bom AAA",
      kebab: "bom-aaa",
      snake: "bom_aaa",
      camel: "bomAAA",
      pascal: "BomAAA",
      "upper-snake": "BOM_AAA",
    });
    expect(ktcProjectRenameNameVariants("kevinBBB").camel).toBe("kevinBBB");
  });

  it("不猜测短前缀，仅创建固定的 6 条形态规则", () => {
    const rules = ktcDeriveProjectRenameRules("Phoenix Dev Hub", "Phoenix Hub");
    expect(rules).toHaveLength(6);
    expect(rules.map((rule) => rule.search)).not.toContain("Pdh");
    expect(rules.find((rule) => rule.style === "upper-snake")).toMatchObject({
      search: "PHOENIX_DEV_HUB",
      replace: "PHOENIX_HUB",
      enabled: true,
    });
  });
});
