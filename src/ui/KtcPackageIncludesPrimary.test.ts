// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { ktcDefinePackageIncludesPrimary } from "./KtcPackageIncludesPrimary.js";
import { ktcIsPackageIncludesDirectoryDraft, type KtcPackageIncludesPrimaryActionDetail, type KtcPackageIncludesPrimaryPanelModel } from "../core/packageIncludesPrimaryContracts.js";

ktcDefinePackageIncludesPrimary();
afterEach(() => document.body.replaceChildren());
const model: KtcPackageIncludesPrimaryPanelModel = {
  sessionId: "session-1", revision: 1, ready: true, busy: false,
  packageDirectory: "/include", targetDirectory: "/project", packageDirectoryExists: true, targetDirectoryExists: true,
  scanStatus: "尚未扫描", summary: [{ label: "扫描", value: "未开始" }],
  ignore: { enabled: true, builtInEnabled: true, gitEnabled: true, customEnabled: false },
  actions: ["preview", "reveal", "openEnvironment", "updateDraft", "pickPackageDirectory", "pickEnvironmentPackageDirectory"]
    .map((id) => ({ id, label: id, enabled: true })),
};
function setup() {
  const view = document.createElement("ktc-package-includes-primary"); view.model = model; document.body.append(view);
  const seen: KtcPackageIncludesPrimaryActionDetail[] = [];
  view.addEventListener("ktc-package-includes-primary-action", (event) => seen.push((event as CustomEvent).detail));
  const input = view.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Package 目录"]')!;
  const edit = (value: string) => { input.value = value; input.dispatchEvent(new Event("input")); };
  return { view, seen, input, edit };
}
it("共用 Primary 保留纯文字操作行、可编辑目录、同一 Ignore 折叠实例和完整 title", () => {
  const { view, input } = setup(), root = view.shadowRoot!;
  expect(Array.from(root.querySelectorAll(".preview-package-actions button"), (node) => node.textContent)).toEqual(["重新预览", "回到 View", "工程环境"]);
  expect(input.readOnly).toBe(false); expect(input.title).toBe("/include");
  const labels = Array.from(root.querySelectorAll<HTMLSpanElement>(".preview-package-directory-row > span"));
  expect(labels.map((label) => label.textContent)).toEqual(["依赖", "工程"]);
  expect(labels[0]!.title).toContain("Package 目录"); expect(labels[1]!.title).toContain("工程目录");
  expect(Array.from(root.querySelectorAll("input"), (node) => node.getAttribute("aria-label"))).toEqual(["Package 目录", "工程目录"]);
  expect(root.querySelector("style")?.textContent).toContain("grid-template-columns:2em minmax(0,1fr) auto auto");
  expect(Array.from(root.querySelectorAll(".preview-package-directory-row button"), (node) => node.textContent)).toEqual(["推导", "选择"]);
  const results = root.querySelector('.preview-package-results[aria-label="结果"]')!;
  expect(results.previousElementSibling?.tagName.toLowerCase()).toBe("ktc-ignore-policy-block");
  expect(Array.from(results.children, (node) => node.tagName.toLowerCase())).toEqual(["h3", "p", "dl"]);
  expect(results.querySelector("h3")?.textContent).toBe("结果");
  expect(results.querySelector('[role="status"]')?.textContent).toBe("尚未扫描");
  expect(results.querySelector('[aria-label="预览摘要"]')?.textContent).toBe("扫描未开始");
  expect(results.querySelector("details")).toBeNull();
  const ignore = root.querySelector("ktc-ignore-policy-block")!, details = ignore.shadowRoot!.querySelector("details")!;
  details.open = false; view.model = { ...model, revision: 2, scanStatus: "已扫描 0 个文件" };
  expect(root.querySelector("ktc-ignore-policy-block")).toBe(ignore); expect(details.open).toBe(false);
  expect(root.querySelector('[role="status"]')?.textContent).toContain("已扫描 0");
});
it("连续输入合并；更高 Host revision 拒绝旧 token 后可重同步，同 revision 不无限重发", () => {
  const { view, seen, input, edit } = setup();
  edit("/first"); edit("/latest path");
  expect(seen).toEqual([{ actionId: "updateDraft", payload: { packageDirectory: "/first", targetDirectory: "/project" } }]);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
  view.model = { ...model, revision: 2 }; // An Ignore/environment snapshot superseded the old token.
  expect(seen.at(-1)).toEqual({ actionId: "updateDraft", payload: { packageDirectory: "/latest path", targetDirectory: "/project" } });
  expect(input.value).toBe("/latest path");
  view.model = { ...model, revision: 2 }; expect(seen).toHaveLength(2);
  view.model = { ...model, revision: 3, packageDirectory: "/latest path" };
  expect(seen.map((event) => event.actionId)).toEqual(["updateDraft", "updateDraft", "preview"]);
});
it("关闭或更换 session 丢弃待确认草稿与排队预览，禁用 Enter 不发业务动作", () => {
  const { view, input, seen, edit } = setup(); edit("/pending");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  view.model = { ...model, ready: false, revision: 2 };
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(seen).toHaveLength(1); expect(input.disabled).toBe(true);
  view.model = { ...model, sessionId: "session-2" };
  expect(input.value).toBe("/include"); expect(seen).toHaveLength(1);
});
it("路径 payload 长度和控制字符有显式门禁；类型验证不允许多余字段", () => {
  expect(ktcIsPackageIncludesDirectoryDraft({ packageDirectory: "", targetDirectory: "" })).toBe(true);
  for (const packageDirectory of ["x".repeat(4097), "bad\0path", "a\nb"]) expect(ktcIsPackageIncludesDirectoryDraft({ packageDirectory, targetDirectory: "/p" })).toBe(false);
  expect(ktcIsPackageIncludesDirectoryDraft({ packageDirectory: "/i", targetDirectory: "/p", extra: true })).toBe(false);
  const { edit, seen } = setup(); edit("x".repeat(4097)); expect(seen).toEqual([]);
});
