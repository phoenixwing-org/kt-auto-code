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

## Locked two-region shell

- The Primary sidebar contributes one native Webview View named `KT Auto Code`. Its native View Header currently owns three fixed core global actions in this order: Directory visibility, Ignore, then Settings. The Directory action uses `folder-opened` while the row is visible and `folder` while hidden, with “隐藏目录” / “显示目录” tooltips. Ignore opens the `ignoreSettings` logical tool and Settings opens `environmentSettings`. Search preview is not a Header action, and duplicate Webview-internal visibility, Ignore, or Settings shortcuts are forbidden; the directory row's selector and actual folder picker remain content controls. A future truly global, frequently used action may be added only sparingly through an explicit contract/document/test change; ordinary tool actions do not qualify.
- Inside the Webview there are exactly two ordered first-level regions: an optional visibility-controlled, fixed one-line `目录` row, then the Tool Area. The directory row is visible on first use; its visibility preference persists. Hiding it is presentation-only and must preserve the selected directory and all directory context.
- The Tool Area contains exactly two ordered children: the integrated Toolbar Strip first and one headerless Tool Surface second. Neither child is another first-level Webview region. Ignore and Settings reuse the same Tool Surface runtime and never create extra first-level regions.
- The Toolbar Strip has no separate visible title row or density button. Its 16px chevron changes only the one Ribbon DOM between expanded and compact modes; it never hides the Tool Area, Tool Surface, or directory row. The one Ribbon DOM occupies the middle, and the only ribbon customization `…` stays at the right. Expanded mode preserves icon-plus-short-label entries and may wrap; compact mode keeps one icon-only row, with overflow entries still reachable from `…`.
- The Tool Surface has no dedicated Header row, title row, or collapse chevron. Repeating the currently active Ribbon Tool/Group toggles only the Surface between expanded and collapsed presentation; it does not close the logical tool, change MRU, close an Editor, dispose/cancel a task, or clear results. Selecting another tool or activating a tool from a menu, command, native Header action, or Editor reveals the Surface. A keyboard-reachable floating `×` at the Surface's top-right is the only in-Webview logical close action and applies the existing MRU fallback. Only the Surface Body owns the normal vertical content scrollbar; neither the Webview page nor Tool Area becomes the scrolling boundary.
- The directory row has no disclosure arrow or body. It owns directory context, selection, and folder picking; hiding it does not reset those values. Direct leaf `toolId` values reached from Ribbon, menu, command, or Editor must enter the same activation runtime, state, MRU, and close semantics.
- Treat the two-region count/order, Tool Area nesting, current Header core-action order/state, directory-row UI and persistence, Toolbar two-state behavior, single-Ribbon/single-ellipsis rule, repeated-current-entry toggle, floating close semantics, and sole Surface scroll boundary as a locked outer-shell contract. Ordinary feature, styling, or cleanup work must not change them incidentally.
- Titles, icons, spacing, responsive styling, accessibility, and content inside an individual Tool Surface may be improved as long as the locked outer-shell contract remains intact.
- Before implementing a request that would change the locked contract, explicitly tell the user which rule would be broken, why the change is necessary, and what migration or regression risk it creates. Wait for explicit user confirmation before changing code or this rule.

See [docs/前端开发规则.md](docs/前端开发规则.md) for the authoritative UI contract and acceptance checklist.

## Compact manager lists

- Primary/sidebar manager file rows default to one continuous `file name · relative path` label. Let that single label consume the remaining width and ellipsize as a whole; do not reserve separate fixed or percentage widths for the name and path. Inline child spans may distinguish the file name (primary/semibold) from the path (secondary/smaller), but both must remain inside the same flexible truncation container.
- Keep status/count/encoding badges in one fixed right-side tail. Preserve the full path in `title` and `aria-label`.
- For VS Code-style manager blocks, prefer full-width section borders and very small internal padding over card-like outer horizontal gaps. Retain a small inner inset for text and icon toolbars so interactive content does not touch the edge.

## Locked Primary shell details

- Preserve the approved two first-level regions in this exact order: the visibility-controlled Directory row, then Tool Area. Tool Area always nests Toolbar Strip before one headerless Tool Surface. The Directory row defaults visible for a new preference, remains a fixed one-line context row when shown, and retains its selected directory/context while hidden.
- Preserve full-width adjoining separators, native 16px Ribbon-chevron alignment, compact controls, no card gap, and no draggable separator. Directory uses the VS Code row baseline; Toolbar is the integrated first child of Tool Area; Tool Surface follows it directly without a secondary Header row.
- The native View Header keeps Directory visibility, Ignore, and Settings in that order. Directory toggles `folder-opened` / `folder` and “隐藏目录” / “显示目录” according to effective visibility. Toolbar keeps one chevron, one shared Ribbon, and one overflow action, with no density action or visible `工具栏` title. Repeating the current Ribbon entry toggles Surface presentation; the Surface's floating `×` alone closes the logical tool through MRU. The current Header, directory-row UI, Toolbar two-state behavior, and headerless Surface are the approved baseline; add another Header action only when it is a frequently used global action and the intentional contract, documentation, and regression tests change together.
- The same direct leaf `toolId` must activate through one runtime regardless of whether its source is Ribbon, menu, command, or Editor. Internal features may evolve, but changing this outer structure, persistence, activation, close, or scroll boundary requires warning the user and receiving explicit confirmation first.
- A future shared ShellBlock component must be a behavior- and appearance-preserving extraction. Follow [docs/ShellBlock控件提炼TODO.md](docs/ShellBlock控件提炼TODO.md); do not combine the extraction with feature work.

## Plugin configuration storage

- Classify every new `ktAutoCode.*` setting before choosing storage. Team-visible project policy belongs in the current Workspace Folder's `.vscode/settings.json` through a resource-scoped configuration and `vscode.ConfigurationTarget.WorkspaceFolder`; examples include encoding targets and related CAA/MK projects.
- A locally installed tool version is not automatically a project property. `ktAutoCode.run.caaVersion` is a machine-scoped default; each project's current Run selection may live in `workspaceState` because the same source can be built against multiple versions. A future team-pinned version matrix must be an explicit target/profile schema rather than a single mutable default.
- Machine integration stays in VS Code User Settings and must use the unified `ktAutoCode.deskTools.*` machine-scoped keys. Never write Desk Tools executable paths, installation manifests, service ports, or other user-machine absolute paths into a project `.vscode/settings.json`.
- Use `workspaceState` only for transient per-workspace UI/session state such as expansion, filters, cursors, and recent UI history. Do not hide durable project configuration in `workspaceState`.
- Store project paths as normalized workspace-relative paths whenever practical. Treat migration from legacy keys or hidden state as an explicit compatibility task; do not silently copy machine-specific values into a tracked project file.
