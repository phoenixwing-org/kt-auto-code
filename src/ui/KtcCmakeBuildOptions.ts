/** Host-neutral options shared by formal Primary and Preview. No storage or process execution. */
export function ktcCreateCmakeBuildOptions(
  selected: readonly ("Debug" | "Release")[] | undefined,
  disabled: boolean,
  onChange: (selected: ("Debug" | "Release")[]) => void,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "ktc-cmake-build-options";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "CMake 编译配置");
  group.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:5px 7px;border-bottom:1px solid var(--vscode-panel-border)";
  group.append(document.createTextNode("CMake"));
  const choices = (["Debug", "Release"] as const).map((type) => {
    const label = document.createElement("label");
    label.style.cssText = "display:inline-flex;align-items:center;gap:4px";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected === undefined || selected.includes(type);
    input.disabled = disabled;
    input.setAttribute("aria-label", `编译 ${type}`);
    input.onchange = () => onChange(choices.filter((choice) => choice.input.checked).map((choice) => choice.type));
    label.append(input, type);
    group.append(label);
    return { type, input };
  });
  return group;
}
