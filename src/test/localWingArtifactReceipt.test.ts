import { describe, expect, it } from "vitest";
// @ts-expect-error Repository tooling is an intentionally plain ESM module.
import { verifyLocalWingReceipt } from "../../scripts/local-wing-artifact-receipt.mjs";

describe("internal Wing artifact receipt", () => {
  const expected = { artifact: "kt-auto-code-0.9.0.vsix", version: "0.9.0", sha256: "a".repeat(64), bytes: 123 };
  const receipt = { ...expected, schemaVersion: 1, kind: "kt.auto-code.local-wing-vsix", wingRoot: "/work/phoenix-wing", publishable: false };
  it("accepts only the exact internal candidate", () => {
    expect(verifyLocalWingReceipt(receipt, expected)).toEqual(receipt);
  });
  it.each([{ publishable: true }, { sha256: "b".repeat(64) }, { version: "0.8.1" }, { artifact: "other.vsix" }, { bytes: 124 }, { wingRoot: "" }])("rejects a changed identity or release flag: %s", (change) => {
    expect(() => verifyLocalWingReceipt({ ...receipt, ...change }, expected)).toThrow();
  });
});
