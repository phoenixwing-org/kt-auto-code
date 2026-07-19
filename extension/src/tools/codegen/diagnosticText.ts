import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";

/** 用户可读的前三条阻断诊断；纯投影，不读取 Host 或修改诊断。 */
export function ktcCodegenDiagnosticsText(
  diagnostics: readonly KtCodegenDiagnostic[],
): string {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .slice(0, 3)
    .map((diagnostic) => diagnostic.message)
    .join("；");
}
