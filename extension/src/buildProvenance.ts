export type KtcWingBuildMode = "local" | "registry";

export interface KtcExtensionBuildProvenance {
  readonly mode: KtcWingBuildMode;
  /** 仅本地并列开发构建注入；Registry bundle 不记录构建机目录。 */
  readonly wingRoot?: string;
}

export interface KtcLocalWingStatusBarModel {
  readonly text: string;
  readonly name: string;
  readonly tooltip: string;
}

declare const __KTC_WING_BUILD_MODE__: KtcWingBuildMode;
declare const __KTC_WING_BUILD_ROOT__: string;

function injectedMode(): KtcWingBuildMode {
  return typeof __KTC_WING_BUILD_MODE__ === "string"
    && __KTC_WING_BUILD_MODE__ === "local"
    ? "local"
    : "registry";
}

function injectedWingRoot(): string | undefined {
  if (typeof __KTC_WING_BUILD_ROOT__ !== "string") return undefined;
  const root = __KTC_WING_BUILD_ROOT__.trim();
  return root || undefined;
}

/** esbuild 在 Extension Host bundle 中固化的 Wing 来源，不依赖运行时环境变量。 */
export const KTC_EXTENSION_BUILD_PROVENANCE: KtcExtensionBuildProvenance = Object.freeze({
  mode: injectedMode(),
  ...(injectedMode() === "local" && injectedWingRoot()
    ? { wingRoot: injectedWingRoot() }
    : {}),
});

/** 首行运行回执；只包含扩展加载路径和本地开发明确选择的 Wing 根。 */
export function ktcExtensionRuntimeProvenanceLine(
  extensionPath: string,
  provenance: KtcExtensionBuildProvenance = KTC_EXTENSION_BUILD_PROVENANCE,
): string {
  const fields = [
    `[Runtime] wingMode=${provenance.mode}`,
    `extensionPath=${extensionPath}`,
  ];
  if (provenance.mode === "local" && provenance.wingRoot) {
    fields.push(`wingRoot=${provenance.wingRoot}`);
  }
  return fields.join("；");
}

/**
 * 本地并列构建在 Host 中保留常驻标识，避免把旧 Development Host、普通窗口
 * 或后来被 Registry build 覆盖的仓库 dist 当成本地 Wing 产物测试。
 */
export function ktcLocalWingStatusBarModel(
  extensionPath: string,
  provenance: KtcExtensionBuildProvenance = KTC_EXTENSION_BUILD_PROVENANCE,
): KtcLocalWingStatusBarModel | undefined {
  if (provenance.mode !== "local") return undefined;
  const wingRoot = provenance.wingRoot ?? "<unknown>";
  return {
    text: "$(beaker) Auto · Wing 本地",
    name: "KT Auto Code 本地 Wing 开发来源",
    tooltip: [
      "当前窗口使用本地并列 phoenix-wing。",
      `Wing：${wingRoot}`,
      `扩展快照：${extensionPath}`,
      "若其他窗口没有此标识，请勿用它验收本地 Wing 修复。",
    ].join("\n"),
  };
}
