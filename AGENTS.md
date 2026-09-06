# KT Auto Code agent instructions

## Local Phoenix Wing development

- The supported local integration layout is sibling repositories: `kt-auto-code`, `kt-auto-cad`, `phoenix-wing`, and optionally `phoenix-desk-tools`.
- Use `pnpm dev` or `pnpm ext:dev` for full local Wing development. These commands must resolve `../phoenix-wing` and `../kt-auto-cad`, build required Code/CAD Wing packages, build each extension in its owning repository, and launch both extension development paths.
- Use `pnpm ext:dev:code` when intentionally developing only KT Auto Code, or `pnpm ext:dev:code:prepare` for its build-only gate. The formal Auto build, Registry comparison and release must never require the CAD repository.
- For build-only AI verification, use `pnpm ext:dev:prepare`. Use `pnpm ext:dev:check` only for a fast repository contract check.
- If sibling Wing is absent, local development must fail. Never add a silent Registry fallback.
- Use `pnpm dev:registry` when comparing against the exact npm Registry versions in the committed lockfile.
- Never write `link:`, `file:`, a workspace override, or a local Wing path into a committed manifest or `pnpm-lock.yaml`.
- `PHOENIX_WING_ROOT` is accepted only through the controlled local wrapper, paired with `PHOENIX_WING_DEV_MODE=1`. Formal builds must reject a leaked root variable; the Registry wrapper clears both variables.
- A local build is accepted only after the esbuild metafile gate proves all expected Wing inputs came from the sibling repository and none came from the consumer's `node_modules`.
- Do not describe a local integration check as passed until `pnpm ext:dev:prepare` has completed successfully.

See [docs/本地Wing并列开发.md](docs/本地Wing并列开发.md) for commands and the manual checklist.

## Target release line and worktrees

- Trial rule: read the version branch currently checked out in the repository's main working directory as the target release line for that round. `develop` is only the development/test baseline hint; it is not an implicit commit, merge, or release target.
- Before every commit, merge, package, or release action, re-check the actual branch, package version, working tree, and the user's current release intent. Do not infer the target from an earlier task or another machine's in-progress branch.
- Put ongoing development worktrees in the shared Phoenix root's `worktrees/` directory, alongside the product repositories. Do not create new hidden `.worktrees` directories. Existing historical worktrees may be inspected or retired separately, but must not be used as the new default.

## Locked three-block shell

- The Primary sidebar contributes one native Webview View named `KT Auto Code`. Its native View Header owns the fixed global actions in this order: Ignore, then Settings. Ignore opens the standalone `ignoreSettings` logical tool View; Settings opens `environmentSettings`. Search preview, the directory gear, and a Webview-internal Ignore shortcut do not belong in the native Header or directory row.
- Inside that Webview there are exactly three ordered, full-width regions: the integrated Toolbar strip, fixed one-line `目录`, and the current tool Block. Ignore and Settings reuse the current tool Block and never create a fourth first-level Block.
- The Toolbar strip has no separate visible title row and no density button. Its 16px chevron stays at the upper left, the one Ribbon DOM occupies the middle, and the only ribbon customization `…` stays fixed at the upper right. Expanded mode preserves the current icon-plus-short-label Ribbon and may wrap to multiple rows; compact mode keeps one icon-only row and leaves every hidden-overflow tool reachable from `…`. The chevron switches these two modes through `ktAutoCode.sidebar.toolPickerStyle`; it never removes the primary navigation entirely.
- The current tool remains independently collapsible; the directory row intentionally has no disclosure arrow or body. Only the current tool Block owns the vertical content scrollbar; the Webview page itself must not become the normal scrolling boundary. The directory row owns only directory context, selection, and folder picking: it has no decorative folder on the left, aligns its `目录` label with spacing, and keeps the actionable folder picker as the only folder icon on the right. The current tool header owns both its collapse toggle and the explicit `×`, whose only meaning is closing the current logical tool Block with the existing MRU fallback.
- Treat that section count, order, responsibility split, fixed directory-row behavior, single-ellipsis rule, and close semantics as a locked outer-shell contract. Ordinary feature, styling, or cleanup work must not change them incidentally.
- Titles, icons, spacing, responsive styling, accessibility, and all content inside an individual Block may be improved as long as the locked outer-shell contract remains intact.
- Before implementing a request that would change the locked contract, explicitly tell the user which rule would be broken, why the change is necessary, and what migration or regression risk it creates. Wait for explicit user confirmation before changing code or this rule.

See [docs/前端开发规则.md](docs/前端开发规则.md) for the authoritative UI contract and acceptance checklist.

## Compact manager lists

- Primary/sidebar manager file rows default to one continuous `file name · relative path` label. Let that single label consume the remaining width and ellipsize as a whole; do not reserve separate fixed or percentage widths for the name and path. Inline child spans may distinguish the file name (primary/semibold) from the path (secondary/smaller), but both must remain inside the same flexible truncation container.
- Keep status/count/encoding badges in one fixed right-side tail. Preserve the full path in `title` and `aria-label`.
- For VS Code-style manager blocks, prefer full-width section borders and very small internal padding over card-like outer horizontal gaps. Retain a small inner inset for text and icon toolbars so interactive content does not touch the edge.

## Locked Primary shell

- Preserve the approved three first-level regions in this exact order: integrated Toolbar strip, Directory, Current Tool. Toolbar switches only between expanded and compact navigation; Current Tool remains independently collapsible; Directory is the approved fixed one-line context row; only Current Tool has the separate close action.
- Preserve the full-width adjoining separators, native 16px chevron alignment, compact controls, no card gap and no draggable separator. Directory and Current Tool retain the VS Code section-header baseline; Toolbar intentionally uses the approved integrated strip with no separate title row.
- The native View Header keeps Ignore and Settings in that order. The integrated Toolbar keeps its chevron, one shared Ribbon and one overflow action; it has no density action or visible `工具栏` title. Directory keeps the selector and its sole right-side folder picker with no left decorative folder and no gear. Current Tool keeps collapse and close as independent actions. Header actions may evolve only through an intentional contract, documentation, and regression-test change; ordinary feature work must not add shortcuts there. Internal features may evolve, but changing this outer structure or visual baseline requires warning the user and receiving explicit confirmation first.
- A future shared ShellBlock component must be a behavior- and appearance-preserving extraction. Follow [docs/ShellBlock控件提炼TODO.md](docs/ShellBlock控件提炼TODO.md); do not combine the extraction with feature work.

## Plugin configuration storage

- Classify every new `ktAutoCode.*` setting before choosing storage. Team-visible project policy belongs in the current Workspace Folder's `.vscode/settings.json` through a resource-scoped configuration and `vscode.ConfigurationTarget.WorkspaceFolder`; examples include encoding targets and related CAA/MK projects.
- A locally installed tool version is not automatically a project property. `ktAutoCode.run.caaVersion` is a machine-scoped default; each project's current Run selection may live in `workspaceState` because the same source can be built against multiple versions. A future team-pinned version matrix must be an explicit target/profile schema rather than a single mutable default.
- Machine integration stays in VS Code User Settings and must use the unified `ktAutoCode.deskTools.*` machine-scoped keys. Never write Desk Tools executable paths, installation manifests, service ports, or other user-machine absolute paths into a project `.vscode/settings.json`.
- Use `workspaceState` only for transient per-workspace UI/session state such as expansion, filters, cursors, and recent UI history. Do not hide durable project configuration in `workspaceState`.
- Store project paths as normalized workspace-relative paths whenever practical. Treat migration from legacy keys or hidden state as an explicit compatibility task; do not silently copy machine-specific values into a tracked project file.
