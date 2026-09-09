// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPreviewTaskDirectory } from "../../ui-preview/src/previewTaskDirectory.js";

describe("Preview task-bound directory footer", () => {
  it("只读显示任务目录及更换说明，保留完整路径且无选择按钮", () => {
    const footer = createPreviewTaskDirectory("/workspace/phoenix-open-issue");
    expect(footer.localName).toBe("footer");
    expect(footer.querySelector("span")?.textContent).toBe("phoenix-open-issue @ /workspace");
    expect(footer.querySelector("span")?.title).toBe("/workspace/phoenix-open-issue");
    expect(footer.textContent).toContain("请关闭右侧视图后重新打开");
    expect(footer.querySelector("button,input,select")).toBeNull();
  });
  it("未关联目录不猜测当前全局路径", () => {
    expect(createPreviewTaskDirectory("").querySelector("span")?.textContent).toBe("未关联目录");
  });
  it("项目改名摘要之后才追加底部目录，样式单列并省略长路径", () => {
    const main = readFileSync("ui-preview/src/main.ts", "utf8");
    const start = main.indexOf("function createEditorCompanionPrimary(");
    const end = main.indexOf("function renderProjectRenameDirectory(", start);
    const renderer = main.slice(start, end);
    expect(renderer.indexOf("section.append(renderProjectRenameDirectory(model))"))
      .toBeGreaterThan(renderer.indexOf("section.append(renderRightCompanionFacts(remainingModel))"));
    expect(renderer.match(/section\.append\(renderProjectRenameDirectory\(model\)\)/gu)).toHaveLength(1);
    const css = readFileSync("ui-preview/styles.css", "utf8");
    expect(css).toContain(".preview-companion-directory span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }");
  });
});
