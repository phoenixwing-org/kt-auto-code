import { describe, expect, it } from "vitest";
import {
  addPreviewAutoBuildSampleDirectories,
  applyPreviewAutoBuildImport,
  createPreviewAutoBuildDraft,
  planPreviewAutoBuildImport,
  removePreviewAutoBuildDisabledProjects,
  updatePreviewAutoBuildConfiguration,
  updatePreviewAutoBuildRepository,
} from "../../ui-preview/src/previewAutoBuildDraft.js";
import { PREVIEW_AUTO_BUILD_SAMPLE } from "../../ui-preview/src/previewAutoBuildSample.js";

const manifestEntry = (overrides: Record<string, unknown> = {}) => ({
  role: "project", name: "PreviewProject", origin: "https://example.invalid/preview.git",
  branch: "develop", commit: "1234567", dirty: false, buildKinds: ["cmake"], ...overrides,
});
const manifest = (repositories: readonly unknown[]) => ({
  schemaVersion: 1, finishedAt: "2026-09-10T00:00:00Z", status: "succeeded", repositories,
});

describe("AutoBuild Preview pure in-memory draft", () => {
  it("由样例初始化配置、项目与构建选项，深冻结且不复用可变输入引用", () => {
    const draft = createPreviewAutoBuildDraft();
    expect(draft.revision).toBe(0);
    expect(draft.configuration).toEqual(PREVIEW_AUTO_BUILD_SAMPLE.configuration);
    expect(draft.configuration).not.toBe(PREVIEW_AUTO_BUILD_SAMPLE.configuration);
    expect(draft.repositories).toHaveLength(4);
    expect(draft.repositories.find((row) => row.id === "ktcore")?.buildKinds).toEqual(["cmake"]);
    expect(draft.repositories.find((row) => row.id === "bom")?.buildKinds).toEqual(["caa"]);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.configuration.recentConfigs)).toBe(true);
    expect(Object.isFrozen(draft.repositories[0])).toBe(true);
    expect(Object.isFrozen(draft.repositories[2].buildKinds)).toBe(true);
    expect(Object.isFrozen(draft.repositories[2].operations[0])).toBe(true);
  });

  it("不可变修改启用、分支与构建选项，保留其他行及样例输入", () => {
    const initial = createPreviewAutoBuildDraft();
    const change = updatePreviewAutoBuildRepository(initial, "ktcore", { enabled: false, branch: "release/test", buildKinds: ["caa", "cmake"], update: false, linkCaa: true });
    const row = change.draft.repositories.find((item) => item.id === "ktcore")!;
    expect(change.errors).toEqual([]);
    expect(change.draft.revision).toBe(1);
    expect(row).toMatchObject({ enabled: false, branch: "release/test", buildKinds: ["cmake", "caa"], commit: "", status: "待检查" });
    expect(row.operations.map(({ enabled }) => enabled)).toEqual([false, true, true, true]);
    expect(initial.repositories[2].enabled).toBe(true);
    expect(initial.repositories[2].branch).toBe("develop");
    expect(change.draft.repositories[3]).toEqual(initial.repositories[3]);
    expect(PREVIEW_AUTO_BUILD_SAMPLE.repositories[2].commit).toBe("a4c19b3d12f0");
  });

  it("无变化不增加 revision，不使既有计划无故失效", () => {
    const initial = createPreviewAutoBuildDraft();
    expect(updatePreviewAutoBuildRepository(initial, "ktcore", { enabled: true, branch: "develop" }).draft).toBe(initial);
    expect(updatePreviewAutoBuildConfiguration(initial, {}).draft).toBe(initial);
    expect(removePreviewAutoBuildDisabledProjects(initial).draft).toBe(initial);
  });

  it("配置与固定仓库双向同步，换路径清除旧探测信息", () => {
    const initial = createPreviewAutoBuildDraft();
    const change = updatePreviewAutoBuildConfiguration(initial, { rootDirectory: "/workspace/OtherRoot", rootBranch: "release", workingDirectory: "/workspace/OtherRoot/projects", updateRootDirectory: true });
    expect(change.errors).toEqual([]);
    expect(change.draft.repositories[0]).toMatchObject({ path: "/workspace/OtherRoot", branch: "release", commit: "", originTitle: "", status: "待检查" });
    expect(change.draft.repositories[0].operations[0].enabled).toBe(true);
    expect(change.draft.repositories[2].path).toBe(initial.repositories[2].path);
    const rowEdit = updatePreviewAutoBuildRepository(change.draft, "third-party", { path: "/workspace/ThirdParty", update: false });
    expect(rowEdit.draft.configuration).toMatchObject({ thirdPartyDirectory: "/workspace/ThirdParty", updateThirdParty: false });
  });

  it.each([
    { branch: "bad\nbranch" }, { branch: "feature/../bad" }, { path: "../escape" },
    { path: "/workspace/Phoenix" }, { path: "PNXBomAnalysisWsp" }, { path: "https://example.invalid/sample" },
    { path: "C:sample" }, { buildKinds: ["cmake", "cmake"] },
    { enabled: "true" }, { unknown: "field" },
  ])("拒绝无效/重复的编辑且草稿保持原样：%j", (patch) => {
    const initial = createPreviewAutoBuildDraft();
    const change = updatePreviewAutoBuildRepository(initial, "ktcore", patch as never);
    expect(change.draft).toBe(initial);
    expect(change.errors).toHaveLength(1);
  });

  it("拒绝不存在的行、固定仓库构建选项与未知配置字段", () => {
    const initial = createPreviewAutoBuildDraft();
    expect(updatePreviewAutoBuildRepository(initial, "missing", { enabled: false }).errors).toHaveLength(1);
    expect(updatePreviewAutoBuildRepository(initial, "root", { buildKinds: ["cmake"] }).draft).toBe(initial);
    expect(updatePreviewAutoBuildConfiguration(initial, { recentConfigs: [] } as never).errors).toHaveLength(1);
  });

  it("选择/扫描只加入传入的样例，按路径或 origin 去重且重复调用无重复", () => {
    const initial = createPreviewAutoBuildDraft();
    const candidates = [
      { path: "/workspace/Phoenix/projects/KtCore/./" },
      { path: "/workspace/DuplicateOrigin", origin: initial.repositories[2].originTitle },
      { path: "/workspace/Phoenix/projects/NewSample", origin: "https://example.invalid/new.git", buildKinds: ["caa"] as const },
      { path: "/workspace/Phoenix/projects/NewSample/" },
      { path: "/workspace/../escape" },
    ];
    const first = addPreviewAutoBuildSampleDirectories(initial, candidates);
    expect(first.summary).toEqual({ added: 1, updated: 0, removed: 0, ignored: 4 });
    expect(first.warnings).toHaveLength(1);
    expect(first.draft.repositories.at(-1)).toMatchObject({ name: "NewSample", branch: "develop", buildKinds: ["caa"], status: "待检查（模拟）" });
    const second = addPreviewAutoBuildSampleDirectories(first.draft, candidates);
    expect(second.draft).toBe(first.draft);
    expect(second.summary.added).toBe(0);
  });

  it("样例 Windows 路径去重不依赖 node:path，POSIX 大小写保持区别", () => {
    const initial = createPreviewAutoBuildDraft();
    const change = addPreviewAutoBuildSampleDirectories(initial, [
      { path: "C:\\Samples\\Project" }, { path: "c:/samples/project/" },
      { path: "/workspace/Case" }, { path: "/workspace/case" },
    ]);
    expect(change.summary.added).toBe(3);
    expect(change.summary.ignored).toBe(1);
  });

  it("目录选择与导入都将相对项目路径按当前工作目录比较，不重复落表", () => {
    const initial = updatePreviewAutoBuildRepository(createPreviewAutoBuildDraft(), "ktcore", { path: "KtCore" }).draft;
    const picked = addPreviewAutoBuildSampleDirectories(initial, [{ path: "/workspace/Phoenix/projects/KtCore" }]);
    expect(picked.draft).toBe(initial);
    expect(picked.summary.ignored).toBe(1);
    const plan = planPreviewAutoBuildImport(initial, manifest([manifestEntry({ name: "KtCore" })]));
    expect(plan.draft).toBe(initial);
    expect(plan.warnings[0]).toContain("目标路径已占用");
  });

  it("用 origin 匹配固定仓库时保留行身份和目录，并同步 Root 分支", () => {
    const initial = createPreviewAutoBuildDraft();
    const plan = planPreviewAutoBuildImport(initial, manifest([manifestEntry({ role: "root", name: "Phoenix", origin: initial.repositories[0].originTitle, branch: "release", buildKinds: undefined })]));
    expect(plan.summary.updated).toBe(1);
    expect(plan.draft.repositories[0]).toMatchObject({ id: "root", path: initial.repositories[0].path, branch: "release", buildKinds: [] });
    expect(plan.draft.configuration.rootBranch).toBe("release");
  });

  it("移除禁用项目永远保留 Root 和 3rdParty", () => {
    let draft = createPreviewAutoBuildDraft();
    for (const id of ["root", "third-party", "ktcore"]) draft = updatePreviewAutoBuildRepository(draft, id, { enabled: false }).draft;
    const change = removePreviewAutoBuildDisabledProjects(draft);
    expect(change.summary.removed).toBe(1);
    expect(change.draft.repositories.map(({ id }) => id)).toEqual(["root", "third-party", "bom"]);
    expect(change.draft.repositories.slice(0, 2).every((row) => !row.enabled)).toBe(true);
  });

  it("导入先产生真实摘要，取消不落表；确认后只改内存并能重复导入", () => {
    const initial = createPreviewAutoBuildDraft();
    const source = manifest([
      manifestEntry(),
      manifestEntry({ name: "KtCore", origin: initial.repositories[2].originTitle, branch: "release", buildKinds: ["caa"] }),
      manifestEntry({ role: "thirdParty", name: "OtherThirdParty", origin: "https://example.invalid/other-third.git", buildKinds: undefined }),
    ]);
    const plan = planPreviewAutoBuildImport(initial, JSON.stringify(source));
    expect(plan.errors).toEqual([]);
    expect(plan.summary).toEqual({ added: 1, updated: 1, removed: 0, ignored: 1 });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.summary)).toBe(true);
    expect(initial.repositories).toHaveLength(4);
    expect(applyPreviewAutoBuildImport(initial, plan, false).draft).toBe(initial);
    const applied = applyPreviewAutoBuildImport(initial, plan, true);
    expect(applied.draft.repositories).toHaveLength(5);
    expect(applied.draft.repositories[2]).toMatchObject({ branch: "release", buildKinds: ["caa"], status: "清单快照（模拟）" });
    const repeat = planPreviewAutoBuildImport(applied.draft, source);
    expect(repeat.draft).toBe(applied.draft);
    expect(repeat.summary).toEqual({ added: 0, updated: 0, removed: 0, ignored: 3 });
    expect(applyPreviewAutoBuildImport(applied.draft, repeat, true).draft).toBe(applied.draft);
  });

  it("同 revision 的其他会话和编辑后的旧导入计划均被拒绝，取消仍无副作用", () => {
    const initial = createPreviewAutoBuildDraft();
    const plan = planPreviewAutoBuildImport(initial, manifest([manifestEntry()]));
    const edited = updatePreviewAutoBuildRepository(initial, "bom", { enabled: false }).draft;
    expect(applyPreviewAutoBuildImport(edited, plan, true)).toMatchObject({ draft: edited, errors: [expect.stringContaining("草稿已变更")] });
    expect(applyPreviewAutoBuildImport(createPreviewAutoBuildDraft(), plan, true).errors).toHaveLength(1);
    expect(applyPreviewAutoBuildImport(edited, plan, false)).toMatchObject({ draft: edited, errors: [] });
  });

  it("清单修改不会影响已冻结计划；相同 origin 不新建目录，保留用户的启用与路径", () => {
    const initial = updatePreviewAutoBuildRepository(createPreviewAutoBuildDraft(), "ktcore", { enabled: false }).draft;
    const entry = manifestEntry({ name: "Renamed", origin: initial.repositories[2].originTitle });
    const source = manifest([entry]);
    const plan = planPreviewAutoBuildImport(initial, source);
    entry.branch = "changed-after-planning";
    entry.buildKinds = ["caa"];
    const applied = applyPreviewAutoBuildImport(initial, plan, true).draft;
    expect(applied.repositories).toHaveLength(4);
    expect(applied.repositories[2]).toMatchObject({ enabled: false, path: initial.repositories[2].path, name: "KtCore", branch: "develop", buildKinds: ["cmake"] });
  });

  it("跳过重复 origin、脏快照、缺 origin 和目标路径冲突并给出原因", () => {
    const initial = createPreviewAutoBuildDraft();
    const plan = planPreviewAutoBuildImport(initial, manifest([
      manifestEntry(), manifestEntry({ name: "SameOrigin" }),
      manifestEntry({ name: "Dirty", origin: "https://example.invalid/dirty.git", dirty: true }),
      manifestEntry({ name: "NoOrigin", origin: "" }),
      manifestEntry({ name: "KtCore", origin: "https://example.invalid/collision.git" }),
    ]));
    expect(plan.summary).toEqual({ added: 1, updated: 0, removed: 0, ignored: 4 });
    expect(plan.warnings).toHaveLength(4);
    expect(plan.errors).toEqual([]);
  });

  it.each([
    "not json", manifest([manifestEntry(), manifestEntry({ buildKinds: [] })]),
    manifest([manifestEntry({ name: "../escape" })]), manifest([manifestEntry({ dirty: "false" })]),
    manifest([manifestEntry({ role: "unknown" })]), manifest([manifestEntry({ commit: "not-a-hash" })]),
    { ...manifest([]), status: "failed" }, { ...manifest([]), finishedAt: "not a date" },
    JSON.parse('{"schemaVersion":1,"status":"succeeded","finishedAt":"2026-09-10","repositories":[],"__proto__":{}}'),
  ])("整个清单校验失败不允许部分导入：%j", (source) => {
    const initial = createPreviewAutoBuildDraft();
    const plan = planPreviewAutoBuildImport(initial, source);
    expect(plan.draft).toBe(initial);
    expect(plan.errors).toHaveLength(1);
    expect(applyPreviewAutoBuildImport(initial, plan, true).draft).toBe(initial);
  });

  it("明确限制样例与清单输入大小，避免无界渲染", () => {
    const initial = createPreviewAutoBuildDraft();
    expect(addPreviewAutoBuildSampleDirectories(initial, Array.from({ length: 201 }, () => ({ path: "/workspace/example" }))).errors).toHaveLength(1);
    expect(planPreviewAutoBuildImport(initial, " ".repeat(256_001)).errors).toHaveLength(1);
    expect(planPreviewAutoBuildImport(initial, manifest(Array.from({ length: 201 }, () => manifestEntry()))).errors).toHaveLength(1);
  });

  it("Origin 主机名规范化去重，但不混淆大小写敏感的仓库路径", () => {
    const initial = createPreviewAutoBuildDraft();
    const first = addPreviewAutoBuildSampleDirectories(initial, [{ path: "/workspace/New", origin: "https://EXAMPLE.invalid/Team/Repo.git" }]).draft;
    const duplicate = addPreviewAutoBuildSampleDirectories(first, [{ path: "/workspace/Duplicate", origin: "https://example.invalid/Team/Repo" }]);
    expect(duplicate.draft).toBe(first);
    expect(addPreviewAutoBuildSampleDirectories(first, [{ path: "/workspace/Other", origin: "https://example.invalid/team/repo" }]).summary.added).toBe(1);
  });

  it.each(["javascript:alert(1)", "file:///private/example", "https://person:password@example.invalid/repo", "https://example.invalid/repo?secret=value", "https://example.invalid/repo;command"])("不把不安全 Origin 纳入内存导入计划：%s", (origin) => {
    const initial = createPreviewAutoBuildDraft();
    const plan = planPreviewAutoBuildImport(initial, manifest([manifestEntry({ origin })]));
    expect(plan.draft).toBe(initial); expect(plan.errors).toHaveLength(1);
  });

  it("导入目标可改，但越界和重复目标不落表", () => {
    const initial = createPreviewAutoBuildDraft(), source = manifest([manifestEntry()]);
    const targetPaths = { "https://example.invalid/preview.git": "/workspace/Phoenix/projects/Custom" };
    expect(planPreviewAutoBuildImport(initial, source, { targetPaths }).draft.repositories.at(-1)?.path).toBe(targetPaths["https://example.invalid/preview.git"]);
    const outside = planPreviewAutoBuildImport(initial, source, { targetPaths: { "https://example.invalid/preview.git": "/outside/target" } });
    expect(outside.draft).toBe(initial); expect(outside.errors[0]).toContain("工作目录内");
  });
});
