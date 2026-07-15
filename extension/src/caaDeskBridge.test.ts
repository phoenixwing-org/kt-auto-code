import { describe, expect, it, vi } from "vitest";
import { ktcCaaHealthEndpoint, ktcProbeDeskTools, ktcSubmitCaaDialog } from "./caaDeskBridge.js";

describe("CAA Desk Tools bridge", () => {
  it("derives the health endpoint from a configured open endpoint", () => {
    expect(ktcCaaHealthEndpoint("http://127.0.0.1:5180/api/caa/dialog/open?x=1"))
      .toBe("http://127.0.0.1:5180/api/caa/health");
  });

  it("distinguishes online, offline and incompatible services", async () => {
    await expect(ktcProbeDeskTools("http://127.0.0.1:5180/api/caa/dialog/open", async () =>
      new Response(JSON.stringify({ ok: true, service: "caa", protocol_version: 1 })))).resolves.toMatchObject({ status: "online" });
    await expect(ktcProbeDeskTools("http://127.0.0.1:5180/api/caa/dialog/open", async () =>
      new Response(JSON.stringify({ ok: true, service: "other" })))).resolves.toMatchObject({ status: "incompatible" });
    await expect(ktcProbeDeskTools("http://127.0.0.1:5180/api/caa/dialog/open", async () => {
      throw new TypeError("fetch failed");
    })).resolves.toMatchObject({ status: "offline" });
  });

  it("submits the workspace and file and reports server rejection", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 202 }));
    await ktcSubmitCaaDialog("http://127.0.0.1:5180/api/caa/dialog/open", { workspaceRoot: "/work", file: "/work/A.CATDlg" }, fetcher);
    expect(fetcher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "POST" }));
    await expect(ktcSubmitCaaDialog("http://127.0.0.1:5180/api/caa/dialog/open", { file: "/work/A.CATDlg" }, async () =>
      new Response("bad file", { status: 400 }))).rejects.toThrow("Desk Tools 拒绝打开请求（400）：bad file");
  });
});
