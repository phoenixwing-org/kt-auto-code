# `catdlg-core` 迁入 phoenix-wing 准备清单

> 调查基线：`phoenix-desk-tools/packages/catdlg-core`（2026-07-15）。本文件只定义可执行的迁入边界；本轮不移动 Desk Tools 文件、不改 Vue 编辑器，也不让 VS Code 插件写入 `.CATDlg`。

## 1. 迁入结论

`@desk-tools/catdlg-core` 的绝大多数逻辑是浏览器可运行的 CATDlg / CATNls 纯算法，应该成为 `phoenix-wing` 的 CAA 公共核心。唯一明确的 Node 依赖是 `repoRoot.ts` 的 `findRepoRoot()`；它必须保持 Node-only 入口，不能被 VS Code Web 扩展或浏览器入口静态导入。

迁入后的职责应为：

```text
phoenix-wing/catdlg-core
  解析、IR、NLS、patch、emit、路径推导、控制件目录、Wizard 代码片段
        ↑                       ↑
Desk Tools adapter         KT Auto Code adapter
  文件读写、Vue/服务           vscode.workspace.fs、只读选择/后续写盘
```

## 2. 源清单与目标位置

| 当前模块 | 内容 | Wing 目标 | 入口 |
| --- | --- | --- | --- |
| `schema.ts`、`parseCatDlg.ts`、`parseCatNls.ts`、`parseCatRsc.ts`、`mergeIr.ts` | CATDlg / NLS 解析及 IR | `src/catdlg-core/` | browser core |
| `emitCatDlg.ts`、`patchCatDlg.ts`、`patchCatNls.ts`、`nlsKeys.ts`、`nlsLocales.ts` | 校验、生成、补丁、NLS | `src/catdlg-core/` | browser core |
| `caaDialogPaths.ts`、`lightMeta.ts`、`demoPaths.ts` | 工作区相对路径和轻量元数据 | `src/catdlg-core/` | browser core |
| `controlCatalog.ts`、`control_catalog.json` | 控制件元数据与调色板分组 | `src/catdlg-core/` + data asset | browser core |
| `wizardHeader.ts`、`wizardCpp.ts`、`wizardBindings.ts` | CAA Wizard 代码片段/绑定提取 | `src/catdlg-core/` | browser core |
| `repoRoot.ts` | 以 `fs/path/process` 查找仓库根 | `src/catdlg-core/node.ts` | Node-only |
| `*.test.ts` 与 CAA fixture | 行为基线、golden 比较 | 同名测试 + `tests/fixtures/caa/` | Vitest |

当前包的 browser 入口是 `src/index.ts`，Node 入口是 `src/node.ts`。迁入时需为 Wing 明确新增两个 package export：`phoenix-wing/catdlg-core` 与 `phoenix-wing/catdlg-core/node`；不要把 Node 入口混进 `phoenix-wing/code-core`。

## 3. API 与命名兼容策略

Wing 的公开 API 遵守 `Pnw` / `pnw` 前缀。因此 canonical API 采用如 `PnwCaaDialogNode`、`pnwParseCatDlg()`、`pnwPatchCatNls()`；不在 Wing 根入口混入未加前缀的 Desk 历史名。

为避免一次性改坏 Desk Tools：

1. 先把纯模块与 fixture 复制到 Wing，并以同一 golden 全绿为门槛。
2. 在 Desk Tools 保留 `@desk-tools/catdlg-core` 兼容 facade：旧的 `parseCatDlg` 等名称只在 facade 内映射到 Wing canonical API。
3. Desk server / Vue 和 KT adapter 分批改为直接使用 Wing API；兼容 facade 在两端完成迁移后才能删除。
4. `findRepoRoot` 仅从 `.../catdlg-core/node` 暴露；Web UI、KT 的 web extension 不能从它导入。

这既保留现有 Desk 的大量调用点，又避免共享库长期带着两套无前缀主 API。

## 4. 已核对的依赖边界

- `repoRoot.ts` 是唯一产品源码里的 `node:fs` / `node:path` / `process` 依赖；测试自己的读 fixture 依赖不构成运行时依赖。
- `control_catalog.json` 需要作为 package asset 发布；优先在 `controlCatalog.ts` 使用静态 TypeScript 数据或受 bundler 支持的 JSON import，并在打包测试中验证。
- Desk 的直接消费者包括 server 的 `dialog`、`parseDialogFull`、`discoverDialogResources`、`caaIndexService`，以及 web-ui 的 CAA 编辑器、NLS、控件目录与属性面板。它们都是 adapter/界面层，不随 core 迁移。
- KT 当前只拥有 `phoenix-desk-tools.caa-dialog.v1` 选择交接与校验，并未解析或写 `.CATDlg`；未来 adapter 的第一步应调用轻量解析/路径函数生成只读摘要，而不是复制 Desk 的画布。

## 5. 分阶段实施与验收

| 阶段 | 产出 | 验收 |
| --- | --- | --- |
| A. 导入 | Wing `src/catdlg-core`、browser/node 分离入口、fixture | Wing 中 CATDlg / CATNls / patch / wizard 测试全绿 |
| B. 兼容 | Desk facade 指向 Wing | Desk server、web-ui 类型检查与 CAA 测试全绿 |
| C. KT 只读接入 | `.CATDlg` 扫描结果带 dialog 名称、推导的 NLS 路径和诊断 | 插件不写盘、不弹出 Desk UI；F5 人工验收 |
| D. 写盘适配（后置） | VS Code 预检、选择、确认、字节指纹、Git diff | 每个 patch 有 fixture、预览与单文件回滚 |

禁止跨阶段的捷径：不可先删 Desk package、不可让浏览器 bundle 引入 Node 模块、不可在没有写前指纹和预览的前提下把 patch 直接接到插件命令。

## 6. 与现有交接契约的关系

`phoenix-desk-tools.caa-dialog.v1` 保持“文件选择快照”的边界：`workspaceUri` + 相对 `.CATDlg` 路径 + 时间戳。未来 Wing CATDlg adapter 可以把该 handoff 作为输入，补出只读解析结果；交接契约本身不承载文件文本、绝对路径、编辑状态或写盘权限。

关联文档：[CAA 对话框 Desk Tools 交接契约](CAA对话框-DeskTools交接契约.md)、[DeskTools Code 共享提取审计](DeskTools-Code共享提取审计.md)。
