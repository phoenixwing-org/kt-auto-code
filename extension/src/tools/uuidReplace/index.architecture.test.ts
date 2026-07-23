import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tool = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../types.ts", import.meta.url), "utf8");

describe("UUID result shared view model boundary", () => {
  it("由 Wing 聚合文件结果并约束选择，Auto 只映射 session 与处理 Host 动作", () => {
    expect(tool).toContain('from "@phoenix-wing/code-core/ui/model"');
    expect(tool).toContain("pnwCodeProjectUuidFiles(");
    expect(tool).toContain("pnwCodeSelectUuidFileUris(uuidResultRows(), uris)");
    expect(tool).not.toContain("function fileState(");
    expect(types).toContain("export type UuidFileResultSummary = PnwCodeUuidFileResultRow");
  });
});
