# Codegen 总 Controller 会话提炼点检表

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-18

## 目标与边界

本切口是大型 UI/Host 分层的第二波小步：把 `Codegen/index.ts` 中“单份 JSON 如何成为 Host session”的纯状态机提炼为 `documentSessionController.ts`。它不改变 Webview 消息、JSON schema、Wing Registry 依赖、Primary/JSON View 行为，也不修改 marker、Preflight、Apply 或 `controlCatalog`。

基线为提交 `6eba19f`：`extension/src/tools/codegen/index.ts` 1,491 行，既负责 VS Code 装配，又直接持有 session `Map`、`activeUri`、Wing Controller 解析和 Document Model 建立。本切口后总 Controller 仍是 Host adapter；新增纯 Controller 负责 registry、活动态和打开状态机。显式 port 装配会增加少量组合代码，因此不把单文件行数下降伪装成验收目标。

## 责任图

| 层 | 文件 | 本层拥有 | 明确不拥有 |
| --- | --- | --- | --- |
| Domain Model | `documentModel.ts`、Wing `KtCodegenController` | Param、revision、dirty、预检失效和磁盘 checkpoint | VS Code URI、窗口、日志 |
| Session Controller | `documentSessionController.ts` | session registry、`activeUri`、snapshot → Wing parse → Model 状态机 | VS Code API、Webview、Problems、对话框、文件系统实现 |
| Pure projection | `diagnosticText.ts`、`contracts.ts` | snapshot DTO、阻断诊断摘要 | VS Code 文件系统或产品 UI |
| Snapshot Host port | `index.ts` → `DocumentService` | 把 `identity.fsPath` 映射为 `vscode.Uri.file` 并读取 snapshot | session 真源、Param 副本 |
| Presenter / View Controller | `editorSessionPresenter.ts`、`editorViewController.ts` | Editor Model、标签状态、消息和 Problems 投影 | JSON 解析、session registry |
| Workspace Host adapter | `index.ts` | URI/对话框、discovered 列表、日志、Presenter/Problems 装配和命令编排 | 直接 `new KtcCodegenDocumentModel` |

## 冻结行为

1. 首次打开只读取一次 snapshot，使用 Wing 解析；只有解析成功才注册 session。
2. 已打开 URI 返回同一 session，不复读磁盘、不建立第二份 Param。
3. CSV 转换已准备的 `KtCodegenController` 不再次 `readJson`，但仍读取真实 JSON snapshot 以建立磁盘 fingerprint。
4. 读取或解析失败不得留下半初始化 session，Host 继续显示 `无法打开 <file>：<reason>`。
5. 活动态只接受 registry 中同一 session；关闭非活动 View 不清空当前活动 URI，关闭活动 View 才清空；dispose 同时清 registry 与活动态。
6. 保持原异常边界：已存在 session 的 `showSession` 异常继续向调用方传播；新建 session 后的 remember/show 异常继续由 `openDocument` 转为 Host error state。
7. 不增加并发 open 去重；并发策略若需要改变，必须另立行为设计和竞态测试。

## 自动点检

| ID | 点检 | 证据 | 状态 |
| --- | --- | --- | --- |
| S1 | 首开、复开、prepared Controller、失败隔离、active/clear | `documentSessionController.test.ts` | [x] |
| S2 | Session Controller 不依赖 VS Code、DOM、Node 文件系统或 `DocumentService` | `codegenArchitecture.test.ts` | [x] |
| S3 | 总 Controller 不再直接建立 Document Model | `codegenArchitecture.test.ts` | [x] |
| S4 | Document Model、DocumentService、Presenter 原行为不回归 | 定向 Vitest 5 文件 / 50 项 | [x] |
| S5 | Extension 类型与既有消息契约保持 | `pnpm --filter ./extension typecheck` | [x] |
| S6 | 全仓测试、架构、文档与依赖门禁 | 88 文件 / 431 测试；124 源文件 / 22 pure graph / 9 View root；64 份 Markdown；7 个 Registry 依赖 | [x] |
| S7 | 真实 VS Code Extension Host 代表流程 | VS Code 1.128.0；open/preview/conflict/apply/saveReload/rollback 回执 | [x] |

最终自动回执：`pnpm test`、`pnpm verify:architecture`、`pnpm docs:check`、`pnpm verify:wing-dependencies` 与 Extension typecheck 均通过。依赖门禁确认 7 个 Wing manifest 引用仍精确消费 Registry `0.4.2`，没有本地 override。

真实宿主回执由隔离临时工作区执行 `pnpm ext:test:host` 取得：VS Code 1.128.0 激活 `kuntai.kt-auto-code@0.5.0`，`open`、`preview`、`conflict`、`apply`、`saveReload`、`rollback` 六条代表流程全部为 `true`；fixture 命中 2 个候选文件、2 个控制符区域并实际修改 1 个文件。该回执验证正式 Registry 构建的 Extension Host 编排，不替代 Windows 手工点检，也不代表已放宽缺失 End 的 Apply 门禁。

## 后续 TODO

- [ ] 把 Editor 语义命令执行从总 Controller 进一步提炼；必须把 Apply 作为注入动作，不能借重构改变其阻断规则。
- [ ] 单独设计 Save/Revert 决策 Controller；先冻结外部修改、覆盖、重新创建与取消矩阵。
- [ ] 评估 discovery/candidate scan 的进度与取消 Presenter，现有 `WorkspaceOperationCoordinator` 继续保持唯一队列真源。
- [ ] 不在本切口实现并发打开合并、Custom Editor Save All、Hot Exit 或 Apply All。
- [ ] Windows Extension Host 手工回执继续由用户后续执行，不阻塞本次无 UI 行为的分层。
