import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function script(relativePath: string): string {
  return readFileSync(new URL(`../../../scripts/${relativePath}`, import.meta.url), "utf8");
}

describe("canonical CAA Root scripts", () => {
  it("优先把调用目录本身识别为 workspace，不把 Framework 当作子工程", () => {
    const common = script("auto-build/common.ps1");
    const rootFirst = common.indexOf("Test-CAAWorkspaceDirectory -Directory $root");
    const childQueue = common.indexOf("$queue = [System.Collections.Queue]::new()");

    expect(rootFirst).toBeGreaterThan(-1);
    expect(rootFirst).toBeLessThan(childQueue);
    expect(common).toContain("return @($root)");
    expect(common).toContain("Test-CAAFrameworkDirectory -Directory $framework.FullName");
    expect(common).not.toContain("*Frm");
  });

  it("linkOut 一次委托 linkCAA 完成 Framework 与 win_b64 双向聚合", () => {
    const linkOut = script("sample/linkOut.ps1");
    const linkCaa = script("auto-build/linkCAA.ps1");

    expect(linkOut).toContain("'tools\\linkCAA.ps1'");
    expect(linkOut).toContain("Folder = $PSScriptRoot");
    expect(linkOut).toContain("(Split-Path $PSScriptRoot -Parent)");
    expect(linkOut).toContain('"CAAB${Version}MkWsp"');
    expect(linkOut).not.toContain("'tools\\linkWinb64.ps1'");

    expect(linkCaa.indexOf("'linkFramework.ps1'")).toBeLessThan(linkCaa.indexOf("'linkWinb64.ps1'"));
    expect(linkCaa).toContain("Framework linking failed");
    expect(linkCaa).toContain("win_b64 linking failed");
  });

  it("caaAll 先执行链接门禁，再为发现到的 workspace 启动独立构建", () => {
    const caaAll = script("auto-build/caaAll.ps1");
    expect(caaAll.indexOf("'linkCAA.ps1'")).toBeLessThan(caaAll.indexOf("Start-Process"));
    expect(caaAll).toContain("$env:CAA_MK_WORKSPACE");
    expect(caaAll).toContain("CAA output linking failed; build was not started.");
    expect(caaAll).toContain("[switch]$ListOnly");
  });
});
