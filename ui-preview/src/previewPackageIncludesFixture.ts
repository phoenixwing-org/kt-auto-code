/** Deterministic UI recipes, not a scanner and never paths to access on disk. */
export interface PreviewPackageIncludesFixture {
  readonly headers: readonly string[];
  readonly files: readonly { readonly relativePath: string; readonly text: string }[];
  readonly rows: readonly {
    readonly relativePath: string;
    readonly line: number;
    readonly oldValue: string;
    readonly newValue: string;
  }[];
  readonly ignoredDirectoryCount: number;
  readonly warnings: readonly string[];
}

export const PREVIEW_PACKAGE_INCLUDES_FIXTURE: PreviewPackageIncludesFixture = {
  headers: ["KtCore/KtString.h", "KtCore/KtArray.h", "KtCore/KtObject.h"],
  files: [
    { relativePath: "src/PNXWidget.cpp", text: '#include "KtString.h"\n#include "KtArray.h"\nvoid updateWidget() {}\n' },
    { relativePath: "include/PNXWidget.h", text: '#pragma once\n#include "KtObject.h"\n' },
  ],
  rows: [
    { relativePath: "src/PNXWidget.cpp", line: 1, oldValue: '#include "KtString.h"', newValue: "#include <KtCore/KtString.h>" },
    { relativePath: "src/PNXWidget.cpp", line: 2, oldValue: '#include "KtArray.h"', newValue: "#include <KtCore/KtArray.h>" },
    { relativePath: "include/PNXWidget.h", line: 2, oldValue: '#include "KtObject.h"', newValue: "#include <KtCore/KtObject.h>" },
  ],
  ignoredDirectoryCount: 1,
  warnings: [],
};
