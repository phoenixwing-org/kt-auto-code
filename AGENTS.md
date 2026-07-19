# KT Auto Code agent instructions

## Local Phoenix Wing development

- The supported local integration layout is sibling repositories: `kt-auto-code`, `phoenix-wing`, and optionally `phoenix-desk-tools`.
- Use `pnpm dev` or `pnpm ext:dev` for local Wing development. These commands must resolve `../phoenix-wing`, build its required Code and CAD packages, build both Auto extensions, and launch both extension development paths.
- For build-only AI verification, use `pnpm ext:dev:prepare`. Use `pnpm ext:dev:check` only for a fast repository contract check.
- If sibling Wing is absent, local development must fail. Never add a silent Registry fallback.
- Use `pnpm dev:registry` when comparing against the exact npm Registry versions in the committed lockfile.
- Never write `link:`, `file:`, a workspace override, or a local Wing path into a committed manifest or `pnpm-lock.yaml`.
- `PHOENIX_WING_ROOT` is accepted only through the controlled local wrapper, paired with `PHOENIX_WING_DEV_MODE=1`. Formal builds must reject a leaked root variable; the Registry wrapper clears both variables.
- A local build is accepted only after the esbuild metafile gate proves all expected Wing inputs came from the sibling repository and none came from the consumer's `node_modules`.
- Do not describe a local integration check as passed until `pnpm ext:dev:prepare` has completed successfully.

See [doc/本地Wing并列开发.md](doc/本地Wing并列开发.md) for commands and the manual checklist.

## Compact manager lists

- Primary/sidebar manager file rows default to one continuous `file name · relative path` label. Let that single label consume the remaining width and ellipsize as a whole; do not reserve separate fixed or percentage widths for the name and path. Inline child spans may distinguish the file name (primary/semibold) from the path (secondary/smaller), but both must remain inside the same flexible truncation container.
- Keep status/count/encoding badges in one fixed right-side tail. Preserve the full path in `title` and `aria-label`.
- For VS Code-style manager blocks, prefer full-width section borders and very small internal padding over card-like outer horizontal gaps. Retain a small inner inset for text and icon toolbars so interactive content does not touch the edge.
