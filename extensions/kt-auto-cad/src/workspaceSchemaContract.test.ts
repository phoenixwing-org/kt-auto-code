import { describe, expect, it } from "vitest";
import fixture from "@phoenix-wing/workspace-schema/fixtures/workspace-schema-compatibility-v1.json";
import {
  PNW_WORKSPACE_SCHEMA_VERSION,
  pnwClassifyWorkspaceSchemaVersion,
} from "@phoenix-wing/workspace-schema";

describe("Wing workspace schema compatibility v1", () => {
  it("使用 Registry fixture 对未知版本 fail-closed", () => {
    expect(fixture).toMatchObject({ contract_version: 1, current_version: 13 });
    expect(PNW_WORKSPACE_SCHEMA_VERSION).toBe(fixture.current_version);

    for (const item of fixture.cases) {
      const classification = pnwClassifyWorkspaceSchemaVersion(item.actual_version);
      expect(classification).toBe(item.classification);
      expect(classification === "current").toBe(item.may_write);
    }
  });
});
