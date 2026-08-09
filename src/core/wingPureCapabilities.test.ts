import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "@phoenix-wing/code-core/fixtures/pure-capabilities-v1.json";
import {
  pnwFindUuidOccurrences,
  pnwFormatUuidForTemplate,
  pnwMatchesWorkspacePath,
  pnwNormalizeWorkspacePath,
  pnwRelativeToWorkspaceRoots,
} from "@phoenix-wing/code-core";

describe("Wing 纯能力跨宿主 fixture", () => {
  it("直接消费 Registry fixture 并锁定其字节身份", () => {
    const fixtureUrl = import.meta.resolve("@phoenix-wing/code-core/fixtures/pure-capabilities-v1.json");
    const bytes = readFileSync(new URL(fixtureUrl));
    expect(crypto.createHash("sha256").update(bytes).digest("hex"))
      .toBe("1d894c5ccffb8d8840c2fcf8a032ed34c79e7c5d2e44ad95fe1bf84665b32e8c");
    expect(fixture.schemaVersion).toBe(1);
  });

  it("UUID 扫描与格式保持由 Wing 唯一实现", () => {
    expect(pnwFindUuidOccurrences(fixture.uuid.scan.text)).toEqual(fixture.uuid.scan.expected);
    for (const item of fixture.uuid.formatCases) {
      expect(pnwFormatUuidForTemplate(item.source, item.replacement)).toBe(item.expected);
    }
  });

  it("workspace path 规范、匹配与相对根由 Wing 唯一实现", () => {
    for (const item of fixture.workspacePath.normalizeCases) {
      expect(pnwNormalizeWorkspacePath(item.input)).toBe(item.expected);
    }
    for (const item of fixture.workspacePath.matchCases) {
      expect(pnwMatchesWorkspacePath(
        item.candidate,
        item.entries as Parameters<typeof pnwMatchesWorkspacePath>[1],
      )).toBe(item.expected);
    }
    for (const item of fixture.workspacePath.relativeCases) {
      expect(pnwRelativeToWorkspaceRoots(item.candidate, item.roots))
        .toBe("expected" in item ? item.expected : undefined);
    }
  });
});
