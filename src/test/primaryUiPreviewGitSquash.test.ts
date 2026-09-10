// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { Window } from "happy-dom";
import type { KtcGitRepositoryInput } from "../core/git/KtcGitModel.js";
import { createPreviewGitSquash } from "../../ui-preview/src/previewGitSquash.js";
import { createPreviewGitSquashFixture } from "../../ui-preview/src/previewGitSquashFixture.js";

const oid = (n: number) => `a${n.toString().padStart(6, "0")}${"0".repeat(33)}`;
const parentNonce = "a".repeat(32);
const identity = { name: "Example", email: "dev@example.com", date: "1789014000 +0800", dateLabel: "2026-09-10 09:00" };
const repository: KtcGitRepositoryInput = {
  id: "/workspace/example", name: "example", branch: "develop", head: oid(16),
  commits: Array.from({ length: 17 }, (_, n) => ({ oid: oid(n), parentOids: n ? [oid(n - 1)] : [], subject: `Commit ${n}`, body: "", author: identity, committer: identity })),
};
const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach((dispose) => dispose()); vi.useRealTimers(); document.body.replaceChildren(); document.querySelectorAll('meta[name="phoenix-preview-script-nonce"]').forEach((meta) => meta.remove()); });

function setup() {
  vi.useFakeTimers();
  const nonce = document.createElement("meta"); nonce.name = "phoenix-preview-script-nonce"; nonce.content = parentNonce; document.head.append(nonce);
  const log = vi.fn(); const visibilityChanged = vi.fn(); const repositoryChanged = vi.fn();
  const view = createPreviewGitSquash({ log, visibilityChanged, repositoryChanged });
  document.body.append(view.element); disposals.push(() => view.dispose());
  const frame = view.element.querySelector("iframe")!;
  const send = (value: unknown, channel = frame.dataset.channel, source = frame.contentWindow) => window.dispatchEvent(new MessageEvent("message", { source, data: { channel, value } }));
  const scenario = (value: string) => { const select = view.element.querySelector("select")!; select.value = value; select.dispatchEvent(new Event("change")); };
  const click = (label: string) => Array.from(view.element.querySelectorAll("button")).find((button) => button.textContent === label)!.click();
  const selectRange = (first = 15, last = 14) => { send({ type: "select", oid: oid(first), checked: true }); send({ type: "select", oid: oid(last), checked: true }); };
  const finish = () => vi.advanceTimersByTime(200);
  view.open(repository);
  return { view, frame, send, scenario, click, selectRange, finish, log, visibilityChanged, repositoryChanged };
}

describe("Git merge-range Preview memory Host", () => {
  it("当前HEAD起步，复用同一Right；分页保留中段主线选择，非主线禁选", () => {
    const x = setup();
    expect(x.view.state()!.commits).toHaveLength(5);
    expect(x.view.state()!.commits[0]!.oid).toBe(oid(16));
    x.selectRange();
    expect(x.view.state()!.selectedOids).toEqual([oid(15), oid(14)]);
    expect(x.view.state()!.selectedOids).not.toContain(oid(16));
    x.send({ type: "load", count: 5 }); x.finish();
    expect(x.view.state()!.commits).toHaveLength(10);
    expect(x.view.state()!.selectedOids).toEqual([oid(15), oid(14)]);
    expect(x.frame.srcdoc).toContain('class="graph-row unavailable"');
    const branchCommit = x.view.state()!.commits.find(({ oid }) => oid.startsWith("f2"))!;
    expect(x.view.state()!.selectableOids).not.toContain(branchCommit.oid);
    x.send({ type: "select", oid: branchCommit.oid, checked: true });
    expect(x.view.state()!.message).toContain("非当前分支");
    expect(x.view.state()!.selectedOids).toEqual([oid(15), oid(14)]);
    const previous = x.view.state();
    x.view.open(repository);
    expect(x.view.state()).toBe(previous);
    expect(x.view.element.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("主线中段预检和执行只给模拟反馈，不伪装成真实历史改写", () => {
    const x = setup(); x.selectRange();
    x.send({ type: "preflight", selectedOids: [oid(16), oid(0)] }); x.finish();
    const draft = x.view.state()!.draft!;
    expect(draft.selectedOids).toEqual([oid(15), oid(14)]); // incoming OID set never grants authority
    expect(draft.replayCount).toBe(1);
    expect(x.frame.srcdoc).toContain("确认信息");
    expect(x.frame.srcdoc).toContain("remote ×2");
    x.send({ type: "execute", selectedOids: draft.selectedOids, message: draft.message, author: draft.author, committer: draft.committer });
    expect(x.view.state()!.expectedHeadOid).toBe(oid(16));
    expect(x.view.state()!.message).toContain("未改写任何 Git 提交");
    expect(x.view.state()!.draft).toBeUndefined();
  });

  it("已有Right拒绝另一个仓库，保留原仓库选择/预检并提示先关闭", () => {
    const x = setup(); x.selectRange(); x.send({ type: "preflight", selectedOids: [] }); x.finish();
    const before = x.view.state();
    x.view.open({ ...repository, id: "/workspace/other", name: "other" });
    expect(x.view.state()).toBe(before);
    expect(x.view.element.querySelector("dialog")!.textContent).toContain("请先关闭");
    x.click("知道了"); x.view.close();
    x.view.open({ ...repository, id: "/workspace/other", name: "other" });
    expect(x.view.state()!.repositoryId).toBe("/workspace/other");
    expect(x.view.state()!.selectedOids).toEqual([]);
  });

  it("脏场景与失败重预检使旧草稿失效，迟到execute不能显示成功", () => {
    const x = setup(); x.selectRange(); x.send({ type: "preflight", selectedOids: [] }); x.finish();
    const old = x.view.state()!.draft!;
    x.scenario("dirty");
    expect(x.view.state()!.draft).toBeUndefined();
    x.send({ type: "preflight", selectedOids: old.selectedOids }); x.finish();
    expect(x.view.state()!.status).toBe("error");
    expect(x.view.state()!.draft).toBeUndefined();
    x.send({ type: "execute", selectedOids: old.selectedOids, message: old.message, author: old.author, committer: old.committer });
    expect(x.view.state()!.message).toContain("未提交");
    expect(x.log).not.toHaveBeenCalledWith(expect.stringContaining("模拟执行完成"));
  });

  it("重放历史包含merge时沿用Wing真实纯预检阻断，不伪造通过", () => {
    const x = setup(); x.send({ type: "load", count: 5 }); x.finish();
    x.selectRange(10, 9);
    x.send({ type: "preflight", selectedOids: [] }); x.finish();
    expect(x.view.state()!.status).toBe("error");
    expect(x.view.state()!.message).toContain("重放区间包含合并提交");
    expect(x.view.state()!.draft).toBeUndefined();
  });

  it("分支确认取消保留草稿，确认成功后清空勾选/预检并从新HEAD重载", () => {
    const x = setup(); x.selectRange(); x.send({ type: "preflight", selectedOids: [] }); x.finish();
    const draft = x.view.state()!.draft;
    x.send({ type: "selectBranch", branchName: "topic/demo" });
    expect(x.view.element.querySelector("dialog")!.textContent).toContain("仅模拟");
    x.click("取消");
    expect(x.view.state()!.draft).toEqual(draft);
    expect(x.view.state()!.branchLabel).toBe("develop");
    expect(x.repositoryChanged).not.toHaveBeenCalled();
    x.send({ type: "selectBranch", branchName: "topic/demo" }); x.click("切换分支（模拟）"); x.finish();
    expect(x.view.state()!.branchLabel).toBe("topic/demo");
    expect(x.view.state()!.commits[0]!.oid).toBe("c2".padEnd(40, "0"));
    expect(x.view.state()!.selectedOids).toEqual([]);
    expect(x.view.state()!.draft).toBeUndefined();
    expect(x.view.state()!.commits).toHaveLength(5);
    expect(x.repositoryChanged).toHaveBeenCalledOnce();
    const snapshot = x.repositoryChanged.mock.calls[0]![0] as KtcGitRepositoryInput;
    expect(snapshot).toMatchObject({ id: repository.id, branch: "topic/demo", head: "c2".padEnd(40, "0"), upstream: "origin/topic/demo" });
    expect(snapshot.commits?.at(-1)?.oid).toBe(snapshot.head);
    expect(snapshot.commits).toHaveLength(19);
    x.view.close(); x.view.open(snapshot);
    expect(x.view.state()!.branchLabel).toBe("topic/demo");
    x.send({ type: "load", count: 5 }); x.finish();
    const reopenedOids = x.view.state()!.commits.map(({ oid }) => oid);
    expect(new Set(reopenedOids).size).toBe(reopenedOids.length);
    x.send({ type: "selectBranch", branchName: "develop" }); x.click("切换分支（模拟）"); x.finish();
    expect(x.repositoryChanged.mock.calls[1]![0]).toMatchObject({ branch: "develop", head: repository.head });
    expect((x.repositoryChanged.mock.calls[1]![0] as KtcGitRepositoryInput).commits).toHaveLength(17);
    expect(repository.commits).toHaveLength(17);
    expect(repository.branch).toBe("develop");
  });

  it.each([["dirty", "未提交"], ["occupied", "worktree"], ["failure", "切换失败"]])("%s 阻止切换并显示对话框，旧勾选保持", (scenario, reason) => {
    const x = setup(); x.selectRange(); x.scenario(scenario!);
    x.send({ type: "selectBranch", branchName: "topic/demo" });
    if (scenario === "failure") { x.click("切换分支（模拟）"); x.finish(); }
    expect(x.view.state()!.branchLabel).toBe("develop");
    expect(x.view.state()!.selectedOids).toEqual([oid(15), oid(14)]);
    expect(x.view.element.querySelector("dialog")!.textContent).toContain(reason);
    expect(x.view.state()!.status).toBe("error");
    expect(x.repositoryChanged).not.toHaveBeenCalled();
    x.click("知道了");
  });

  it("禁用/未知branch消息不能绕过选择限制；只接受当前iframe和当前channel", () => {
    const x = setup();
    x.send({ type: "selectBranch", branchName: "occupied/example" });
    expect(x.view.element.querySelector("dialog")).toBeNull();
    x.send({ type: "selectBranch", branchName: "not-a-branch" });
    x.send({ type: "select", oid: oid(15), checked: true }, "old-channel");
    x.send({ type: "select", oid: oid(15), checked: true }, x.frame.dataset.channel, window);
    expect(x.view.state()!.selectedOids).toEqual([]);
    expect(x.frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(x.frame.srcdoc).toContain("Content-Security-Policy");
    expect(x.frame.srcdoc).toContain(`script-src 'nonce-${parentNonce}'`);
    expect(x.frame.srcdoc).toContain(`<script nonce="${parentNonce}">`);
    expect(x.frame.srcdoc).not.toContain("acquireVsCodeApi");
  });

  it("缺少父页面授权nonce时拒绝渲染脚本，不降级unsafe-inline或same-origin", () => {
    const view = createPreviewGitSquash({ log: vi.fn(), visibilityChanged: vi.fn() });
    document.body.append(view.element); disposals.push(() => view.dispose());
    view.open(repository);
    expect(view.state()!.status).toBe("error");
    expect(view.element.textContent).toContain("重启预览服务");
    expect(view.element.querySelector("iframe")!.srcdoc).toBe("");
    expect(view.element.querySelector("iframe")!.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("真实共享HTML脚本绑定checkbox/分页/分支/remote，不仅接受合成消息", async () => {
    const x = setup();
    const child = new Window();
    const outgoing = vi.spyOn(child, "postMessage").mockImplementation(() => {});
    try {
      const script = x.frame.srcdoc.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/u)![1]!;
      child.document.write(x.frame.srcdoc.replace(/<script nonce="[^"]+">[\s\S]*?<\/script>/u, ""));
      // Execute the emitted browser script without an eval-enabled CSP; this
      // catches toString/bundling dependencies and missing event installation.
      new Function("document", "window", script)(child.document, child);
      expect(child.document.querySelectorAll("#ktc-hover-tooltip")).toHaveLength(1);
      expect(outgoing).toHaveBeenCalledWith({ channel: x.frame.dataset.channel, value: { type: "ready" } }, "*");
      const checkbox = child.document.querySelector("input")!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new child.Event("change", { bubbles: true }));
      expect(outgoing).toHaveBeenCalledWith({ channel: x.frame.dataset.channel, value: { type: "select", oid: oid(16), checked: true } }, "*");
      [...child.document.querySelectorAll("button")].find((button) => button.getAttribute("data-load") === "5")!.click();
      expect(outgoing).toHaveBeenCalledWith({ channel: x.frame.dataset.channel, value: { type: "load", count: 5 } }, "*");
      const branch = child.document.querySelector("select")!;
      branch.value = "topic/demo"; branch.dispatchEvent(new child.Event("change"));
      expect(outgoing).toHaveBeenCalledWith({ channel: x.frame.dataset.channel, value: { type: "selectBranch", branchName: "topic/demo" } }, "*");
      const remote = [...child.document.querySelectorAll("button")].find((button) => button.classList.contains("remote"))!;
      remote.click();
      expect(remote.getAttribute("aria-expanded")).toBe("true");
      expect(child.document.querySelector("#ktc-hover-tooltip")!.textContent).toContain("refs/remotes/origin/develop");
    } finally { await child.happyDOM.close(); }
  });

  it("取消/关闭/重开隔离延迟分页与分支回包，已关闭Right不会复活", () => {
    const x = setup(); x.scenario("delay"); x.selectRange();
    x.send({ type: "load", count: 5 });
    x.click("取消等待"); vi.advanceTimersByTime(1000);
    expect(x.view.state()!.commits).toHaveLength(5);
    expect(x.view.state()!.selectedOids).toHaveLength(2);
    x.send({ type: "selectBranch", branchName: "topic/demo" }); x.click("切换分支（模拟）");
    const oldChannel = x.frame.dataset.channel;
    x.view.close();
    expect(x.view.state()).toBeUndefined();
    x.view.open(repository);
    x.send({ type: "select", oid: oid(15), checked: true }, oldChannel);
    vi.advanceTimersByTime(1500);
    expect(x.view.state()!.branchLabel).toBe("develop");
    expect(x.view.state()!.selectedOids).toEqual([]);
    expect(x.visibilityChanged.mock.calls.map(([open]) => open)).toEqual([true, false, true]);
    expect(x.repositoryChanged).not.toHaveBeenCalled();
  });

  it("夹具只含当前分支可达提交，时间下降且父节点在后；复用Wing轨道投影", () => {
    for (const branch of ["develop", "topic/demo"]) {
      const fixture = createPreviewGitSquashFixture(repository, branch);
      const visited = new Set<string>();
      const byOid = new Map(fixture.commits.map((commit) => [commit.oid, commit]));
      const walk = (id: string) => { if (visited.has(id)) return; visited.add(id); byOid.get(id)?.parentOids.forEach(walk); };
      walk(fixture.commits[0]!.oid);
      expect(fixture.commits.every(({ oid }) => visited.has(oid))).toBe(true);
      fixture.commits.forEach((commit, index) => {
        for (const parent of commit.parentOids) expect(fixture.commits.findIndex(({ oid }) => parent === oid)).toBeGreaterThan(index);
        if (index) expect(Number(commit.author.date.split(" ")[0])).toBeLessThan(Number(fixture.commits[index - 1]!.author.date.split(" ")[0]));
      });
      expect(fixture.graphRows.some(({ lane }) => lane > 0)).toBe(true);
    }
  });

  it("Preview adapter可独立构建成browser bundle，不带VSCode/Git Node/文件进程能力", async () => {
    vi.useRealTimers();
    const result = await build({ entryPoints: ["ui-preview/src/previewGitSquash.ts"], bundle: true, write: false, platform: "browser", format: "esm", metafile: true, logLevel: "silent" });
    expect(Object.keys(result.metafile!.inputs).some((path) => /git-node|KtcGitSquashViewController|KtcGitStashService|webviewSupport/u.test(path))).toBe(false);
    const text = result.outputFiles[0]!.text;
    expect(text).not.toContain("acquireVsCodeApi");
    expect(text).not.toContain("child_process");
    expect(text).not.toContain("node:fs");
  });
});
