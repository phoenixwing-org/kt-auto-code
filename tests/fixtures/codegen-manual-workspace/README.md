# Codegen Manual QA Workspace

This directory is a template. Use `pnpm ext:launch:codegen` from the repository root;
the launcher copies it to a fresh system temporary directory before opening VS Code.

- `PNXWidgetParam.json`: root-level Codegen JSON.
- `config/KtCourseGuardParam.json`: nested Codegen JSON and second View.
- `config/EmptyParam.json`: valid zero-row JSON for empty-state and first-insert testing.
- `legacy/PNXLegacyPanelParam.csv`: automatic one-way CSV conversion fixture.
- `legacy/PNXConflictParam.json` + `.csv`: different normalized content; automatic discovery must retain both.
- `data/not-codegen.json`: negative discovery fixture; it must not enter the list.
- `src/*.cpp`: workspace-level marker candidates and preflight targets.

The temporary copy is intentionally disposable. Edit, save, delete and externally modify it freely.

The launcher also creates `.phoenix/codegen-qa-baseline.json`, `.phoenix/codegen-qa-report.json` and `bulk-source/` in the temporary copy; none belongs to this tracked template. Run `pnpm ext:verify:codegen -- <temporary-workspace>` before Apply to verify the source baseline, then use `--checkpoint-e` after Apply to verify that source changed while Kevin Start/End markers remain paired.
