import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";

export interface KtcCodegenProblemLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
}

/** 将 Wing 诊断投影成 Problems 可定位数据；没有源码路径的诊断落到当前 JSON。 */
export function ktcProjectCodegenProblems(
  diagnostics: readonly KtCodegenDiagnostic[],
  fallbackFile: string,
): readonly KtcCodegenProblemLocation[] {
  return diagnostics.flatMap((diagnostic) => {
    if (diagnostic.severity !== "error" && diagnostic.severity !== "warning") return [];
    return [{
      file: diagnostic.path?.file ?? fallbackFile,
      line: Math.max(0, Math.trunc(diagnostic.path?.row ?? 0)),
      column: Math.max(0, Math.trunc(diagnostic.path?.column ?? 0)),
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
    }];
  });
}
