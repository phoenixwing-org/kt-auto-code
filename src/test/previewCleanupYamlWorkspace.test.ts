import { describe, expect, it } from "vitest";
import { PreviewCleanupYamlWorkspace } from "../../ui-preview/src/previewCleanupYamlWorkspace.js";
const yaml = "delete:\n  directories:\n    - build\n  files:\n    - '*.pdb'";
const create = () => new PreviewCleanupYamlWorkspace(yaml, "/workspace/projects");

describe("cleanup YAML in-memory document host", () => {
  it("发现多份cleanup.yaml各自以所在目录为根，打开只记录原生编辑器目标", () => {
    const host = create();
    expect(host.discovered().map(({ path }) => path)).toEqual(["/workspace/projects/cleanup.yaml", "/workspace/projects/sample/cleanup.yaml"]);
    host.open("sample-cleanup"); host.open("sample-cleanup");
    expect(host.openedFileId).toBe("sample-cleanup"); expect(host.files).toHaveLength(2);
    const items = host.clean("sample-cleanup", 1);
    expect(items).toEqual(["/workspace/projects/sample/objects（样例）", "/workspace/projects/sample/module.obj（样例）"]);
    expect(host.files[0]?.status).toBeUndefined(); expect(host.files[1]?.status).toContain("模拟完成");
  });
  it("界面规则编辑不覆盖源文件，也不引入内置文件草稿或另存对话框", () => {
    const host = create(); host.open("sample-cleanup"); host.edit(yaml);
    host.open("working-cleanup"); expect(host.yaml).toBe(yaml);
    expect(host.files[1]?.yaml).not.toBe(yaml); expect(host.discovered()).toHaveLength(2);
    expect(host).not.toHaveProperty("documents"); expect(host).not.toHaveProperty("saveCopy");
  });
  it("拒绝非法规则、未知source、旧revision；无FS或shell", () => {
    const host = create();
    host.files[1] = { ...host.files[1]!, yaml: "delete:\n  directories:\n    - ../other" };
    expect(() => host.clean("sample-cleanup", 1)).toThrow("路径");
    expect(() => host.clean("forged", 1)).toThrow("配置已变化");
    host.clean("working-cleanup", 1); expect(() => host.clean("working-cleanup", 1)).toThrow("配置已变化");
  });
  it("只发现工作目录及子目录，不带 ROOT、3rdParty 或其他项目根，排除目录与重复项不入表", () => {
    const host = create();
    for (const [id, root] of [["root", "/workspace"], ["third-party", "/workspace/thirdParty"], ["other-project", "/workspace/projects-other"],
      ["git", "/workspace/projects/.git"], ["modules", "/workspace/projects/node_modules/pkg"]]) {
      host.files.push({ id: id!, root: root!, path: `${root}/cleanup.yaml`, revision: 1, yaml });
    }
    host.files.push({ ...host.files[0]!, id: "duplicate" });
    const result = host.discover();
    expect(result.sources.map(({ id }) => id)).toEqual(["working-cleanup", "sample-cleanup"]);
    expect(result.warnings).toHaveLength(5);
    expect(result.incomplete).toBe(true);
    expect(() => host.open("root")).toThrow("未找到");
    expect(() => host.clean("other-project", 1)).toThrow("配置已变化");
  });
  it("发现深度和数量有界，详细原因单独返回供 Host 日志使用", () => {
    const host = create();
    expect(host.discover({ maxDepth: 0 })).toMatchObject({ sources: [{ id: "working-cleanup" }], incomplete: true,
      warnings: ["跳过超出深度 0 的样例目录：/workspace/projects/sample"] });
    expect(host.discover({ maxSources: 1 })).toMatchObject({ sources: [{ id: "working-cleanup" }], incomplete: true,
      warnings: ["达到 1 份 YAML 来源限额；其余样例未列出。"] });
    expect(host.discover().incomplete).toBe(false);
  });
  it.each(["", "/", "C:\\", "relative", "/workspace/../other"])("无效工作目录 %s 不回退到其他根", (working) => {
    const host = new PreviewCleanupYamlWorkspace(yaml, working);
    expect(host.files).toEqual([]);
    expect(host.discover()).toMatchObject({ sources: [], incomplete: true, warnings: [expect.stringContaining("未回退到 ROOT")] });
  });
});
