// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { installPreviewButtonFeedback } from "../../ui-preview/src/previewButtonFeedback.js";
import { ktcCreateCmakeBuildOptions } from "../ui/KtcCmakeBuildOptions.js";

let dispose = () => {};
afterEach(() => { dispose(); document.body.replaceChildren(); });

describe("Preview button feedback", () => {
  it("logs silent shadow buttons even if removed or propagation is stopped", async () => {
    const lines: string[] = [];
    dispose = installPreviewButtonFeedback(document, { revision: () => lines.length, write: (line) => lines.push(line) });
    const host = document.createElement("section"), shadow = host.attachShadow({ mode: "open" });
    const button = document.createElement("button"); button.textContent = "结束任务";
    button.onclick = (event) => { event.stopPropagation(); host.remove(); };
    shadow.append(button); document.body.append(host);
    button.click(); await Promise.resolve();
    expect(lines).toEqual(["[界面] 结束任务（原型）"]);
  });
  it("does not duplicate semantic logs or pretend disabled actions executed", async () => {
    const lines: string[] = [];
    dispose = installPreviewButtonFeedback(document, { revision: () => lines.length, write: (line) => lines.push(line) });
    const button = document.createElement("button"); button.textContent = "更新";
    button.onclick = () => lines.push("更新成功"); document.body.append(button);
    button.click(); await Promise.resolve(); expect(lines).toEqual(["更新成功"]);
    button.disabled = true; button.click(); await Promise.resolve(); expect(lines).toHaveLength(1);
  });
  it("shared CMake checkboxes default to both, then allow Release only", () => {
    const changes: string[][] = [];
    const group = ktcCreateCmakeBuildOptions(undefined, false, (selected) => changes.push(selected));
    document.body.append(group);
    const inputs = group.querySelectorAll("input");
    expect(Array.from(inputs).every((input) => input.checked)).toBe(true);
    inputs[0]!.click(); expect(changes).toEqual([["Release"]]);
  });
});
