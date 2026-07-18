# 本地 Wing 并列开发

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-18

## 目标与目录约定

Auto Code 的正式依赖始终使用 npm Registry 精确版本。本地联调通过受控构建期解析器直接消费 Wing 的 `dist`，不把 `link:`、`file:` 或 workspace override 写入 `package.json` 与 `pnpm-lock.yaml`。

推荐三个仓库并列：

```text
phoenix/
├── kt-auto-code/
├── phoenix-wing/
└── phoenix-desk-tools/ # 可选的本地 native provider
```

默认目录名必须是 `phoenix-wing`。非标准位置可在运行命令时显式设置 `PHOENIX_WING_ROOT=/absolute/path/to/phoenix-wing`；不能把这个路径写进仓库。

## 日常命令

在 `kt-auto-code` 根目录执行：

| 命令 | Wing 来源 | 行为 |
| --- | --- | --- |
| `pnpm dev` / `pnpm ext:dev` | 本地 `../phoenix-wing` | 构建 Wing 的 Code、Codegen、CAD 契约/核心/Schema，构建 Auto Code + Auto CAD，并同时启动两个插件 |
| `pnpm ext:dev:prepare` | 本地 `../phoenix-wing` | 完成同样的构建和来源门禁，但不启动 VS Code，适合 AI 或 CI 做集成检查 |
| `pnpm ext:dev:code` | 本地 `../phoenix-wing` | 只构建并启动 Auto Code，适合只调 Codegen 的短循环 |
| `pnpm ext:dev:check` | 本地 `../phoenix-wing` | 只检查仓库身份、必需包和构建契约，不构建、不启动 |
| `pnpm dev:registry` | npm Registry / 当前 lockfile | 清除本地环境变量，构建并启动 Auto Code + Auto CAD，作为正式依赖对照组 |
| `pnpm ext:dev:registry:prepare` | npm Registry / 当前 lockfile | 完成 Registry 对照构建但不启动 VS Code，适合 AI 验证 |

本地日志开头明确显示 `[local-wing] 模式：本地并列仓库（非 npm Registry）`；Registry 对照日志显示 `[registry-wing] 模式：npm Registry / 当前 pnpm-lock.yaml（非本地 Wing）`。

本地模式找不到 Wing 时必须失败，不允许悄悄回退到 Registry。错误会给出实际查找路径，并提示用 `pnpm dev:registry` 做正式包对照。

## 受控构建流程

1. 校验 Wing 根 manifest 的 `name` 为 `phoenix-wing`，并检查五个必需包的 manifest、`scripts.build`、`dist` 主入口与 Codegen table 子入口。
2. 在 Auto 构建前运行 `verify:wing-dependencies`，确认提交态依赖仍是精确 Registry 版本。
3. 构建 `code-core`、`kt-codegen`、`cad-core`、`cad-contracts` 与 `workspace-schema`。
4. 只为本次 esbuild 注入 `PHOENIX_WING_ROOT` 和内部模式开关；解析全部 `@phoenix-wing/*` 公共入口，包括 `@phoenix-wing/kt-codegen/table`。
5. 读取 Code 全部 bundle、host smoke 与 CAD bundle 的 esbuild metafile：五个预期包必须来自并列仓库，consumer `node_modules` 命中必须为 0。
6. 再次运行 Registry 依赖门禁，并逐字核对三个 manifest 与 lockfile 未被构建修改。
7. 本地模式把已通过来源门禁的 Code/CAD 扩展目录复制到独立临时快照；忽略 `node_modules`、Git 元数据与旧 VSIX。
8. 以快照目录作为 `--extensionDevelopmentPath`，并用 `--new-window` 启动全新 Extension Development Host。后续普通 Registry 构建即使重写仓库内 `dist`，也不会改变正在验收的本地 Wing 产物。

直接设置 `PHOENIX_WING_ROOT` 后运行普通 `pnpm extensions:build` 会被拒绝，以免 shell 中残留变量污染正式构建。请统一走 `pnpm dev` 或 `pnpm ext:dev:prepare`。

Desk Tools 是 Auto CAD 的可选 native provider，不由本命令构建或启动。需要深度 CAD 能力时，从 Auto CAD 设置中选择并列 `phoenix-desk-tools` 产生的 provider manifest；不使用 provider 时，Code 与 CAD 的纯 TypeScript 能力仍可联调。

## Codegen 预检缓存

`pnpm dev` 会重新构建并嵌入并列 Wing，但不会直接删除真实工作区的 `.phoenix/cache/codegen`。当 Wing 的 Marker 解析或 Renderer 语义发生变化时，必须同步递增 Auto Code 的 `KTC_CODEGEN_GENERATOR_VERSION`；旧版本 Preflight Plan 才会失效并重新 Analyze。只更新 Wing、却不更新该版本，会让新 bundle 继续复用旧诊断，看起来像本地修复没有生效。

当前正式 Registry 依赖仍是 Wing 0.4.2，本地并列 Wing 已含下一控制符边界恢复规则。为防止 Registry 构建与本地构建在同一工作区交叉写缓存，即使版本标签相同，只要缓存仍带有旧扫描器特有的 `marker.nested-start` 或 `marker.mismatched-end` 级联诊断，也会强制重新 Analyze。

缓存失效只触发重新预检，不会放宽 Apply：缺失 End 的坏块仍不产生可写 region，源码指纹、未保存文件、区域重叠与事务回滚门禁保持不变。

## 点检表

- [x] `pnpm ext:dev:check` 明确打印本地 Wing 绝对路径和五个必需包。
- [x] 指定不存在的 `PHOENIX_WING_ROOT` 后，本地命令立即失败并提示 `pnpm dev:registry`。
- [x] `pnpm ext:dev:prepare` 成功构建 Wing、Auto Code 与 Auto CAD。
- [x] Code 来源门禁命中本地 `code-core`、`kt-codegen`（包括 table），Registry 命中 0。
- [x] CAD 来源门禁命中本地 `cad-core`、`cad-contracts`、`workspace-schema`，Registry 命中 0。
- [x] 构建前后根 manifest、两个插件 manifest 与 `pnpm-lock.yaml` 无差异。
- [x] Extension Host dry-run 同时包含 Code 与 CAD 两个 `--extensionDevelopmentPath`。
- [x] 本地 Extension Host dry-run 使用临时快照路径和 `--new-window`，不直接消费会被后续构建覆盖的仓库扩展目录。
- [x] `pnpm ext:dev:registry:prepare` 明确显示 Registry 模式，且构建日志不出现 `[local-wing]`。

## 2026-07-18 自动验收记录

- `pnpm test`：在产品提交独立归档副本中 **88 个测试文件、436 个测试通过**。
- `pnpm extensions:typecheck`：Code 与 CAD 两个 TypeScript 工程通过。
- `pnpm ext:dev:prepare`：五个 Wing 包、Code 全部 bundle/host smoke、CAD bundle 构建通过；两组 metafile 来源门禁通过。
- Code 本地 bundle 包含新的 `marker.missing-end ... before Start/End marker` 边界恢复逻辑；旧扫描实现消息 `A foreign Start marker appears before`、`appears inside the open` 与 `does not close` 均为 0 命中。
- Codegen 生成器缓存版本为 `0.3.2`；已有 `0.3.1` 计划会在下一次预检时失效并重新 Analyze。
- `pnpm ext:dev:registry:prepare`：Registry 0.4.2 对照构建通过，未启动 GUI。
- 泄漏 `PHOENIX_WING_ROOT` 的普通 `extensions:build` 按设计失败；不存在 Wing 根目录的 `ext:dev:check` 按设计失败。
