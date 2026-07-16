import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { readFcstdWithNativeV1 } from "./nativeRead.js";

const require = createRequire(import.meta.url);

function readFixture(name: string): string {
  return readFileSync(require.resolve(`@phoenix-wing/cad-contracts/fixtures/${name}`), "utf8");
}

describe("KT Auto CAD native read", () => {
  it("calls the validated provider binary through protocol v1", async () => {
    const executor = vi.fn(async () => ({
      stdout: readFixture("native-read-success-v1.json"),
      stderr: "",
    }));
    const response = await readFcstdWithNativeV1(
      "/Desk Tools/runtime/bin/fcstd-read",
      "/workspace/part.FCStd",
      executor,
    );
    expect(response.ok).toBe(true);
    expect(executor).toHaveBeenCalledWith(
      "/Desk Tools/runtime/bin/fcstd-read",
      ["--protocol", "1", "read", "/workspace/part.FCStd"],
      expect.objectContaining({ encoding: "utf8", timeout: 30_000 }),
    );
  });

  it("surfaces stable native error envelopes", async () => {
    const nativeError = Object.assign(new Error("exit 2"), {
      stdout: readFixture("native-error-v1.json"),
      stderr: "invalid archive",
    });
    await expect(readFcstdWithNativeV1(
      "/Desk Tools/runtime/bin/fcstd-read",
      "/workspace/broken.FCStd",
      async () => { throw nativeError; },
    )).rejects.toThrow(/fcstd-read .*：/);
  });

  it("rejects invalid paths and malformed success output", async () => {
    await expect(readFcstdWithNativeV1("fcstd-read", "/workspace/part.FCStd"))
      .rejects.toThrow(/绝对路径/);
    await expect(readFcstdWithNativeV1("/runtime/fcstd-read", "/workspace/part.txt"))
      .rejects.toThrow(/\.FCStd/);
    await expect(readFcstdWithNativeV1(
      "/runtime/fcstd-read",
      "/workspace/part.FCStd",
      async () => ({ stdout: "{}", stderr: "" }),
    )).rejects.toThrow(/protocol v1/);
  });
});
