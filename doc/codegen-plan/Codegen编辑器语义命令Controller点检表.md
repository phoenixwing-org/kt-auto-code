# Codegen 编辑器语义命令 Controller 点检表

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-18

## 目标

迁移前 `extension/src/tools/codegen/index.ts` 为 1,500 行，其中 `handleEditorMessage()` 和 `acceptActionTable()` 同时承担九类 Editor 语义命令分派、整表接收、stale 阻断，以及 Save/Preflight/Apply 的调用顺序。当前已先用 source characterization 冻结行为，再把这段编排提炼到 UI-neutral `editorCommandController.ts`；总 Controller 收敛为 1,447 行，并只装配 Host 动作端口。

本切口不改变 Webview transport、JSON schema、Marker、Preflight、Apply、Save/Revert 或控制符行为；不把 VS Code、文件系统、Presenter、Output Channel 或写盘实现移入新 Controller。

## 责任图

| 层 | 文件 | 本层拥有 | 明确不拥有 |
| --- | --- | --- | --- |
| Domain Model | `documentModel.ts` | Param、revision、dirty、preflight 真源、整表 stale/accepted/unchanged | Host 消息与文件系统 |
| Message Router | `editorMessageRouter.ts` | URI 校验、transport → 九类语义命令 | 状态修改与动作顺序 |
| Command Controller | `editorCommandController.ts` | 语义命令分派、整表接收、动作先后与短路规则 | VS Code、DOM、文件读写、Apply 算法 |
| Presenter | `editorSessionPresenter.ts` | Editor Model、状态、控制符与 Problems 投影 | 命令编排与领域状态 |
| Host adapter | `index.ts` | Context、对话框、CancellationToken、日志、文件/剪贴板、Preflight/Apply/Save/Revert 实现 | 再次复制命令状态机 |

## 冻结的命令矩阵

| 命令 | 冻结行为 |
| --- | --- |
| `ignore` | 无副作用立即返回 |
| `control` | 只调用注入的控制符 Host 动作 |
| `dirty` | `markTableDirty` 后发布 mutation |
| `exchange` | stale 发布错误并停止；accepted 先发布 mutation；save 调用 Save，sync 发布整表已接收 |
| `ready` | 发布当前完整 Editor Model |
| `revert` | 调用注入的 Revert |
| `cancelPreflight` | 取消当前 session URI 的预检任务 |
| `preflight` | 先启动计时器，再接收可选整表；stale 停止；accepted/unchanged 使用同一计时器预检 |
| `apply` | 先启动 Apply 总计时；接收可选整表；无 plan 时以独立 Preflight 计时自动预检；重读 plan，仍为空则记停止日志，否则把总计时器传给 Apply |

`acceptTable()` 的 `stale / accepted / unchanged` 判定继续由 Domain Model 独占。accepted 与 dirty 都会使旧 preflight 失效；Command Controller 不另建 revision 或 plan 状态。

## 关键时序

Apply 现有“双计时器”语义必须保留：

1. 点击 Apply 时立即启动 Apply 总计时器；
2. 若没有 plan，调用 `runPreflight()` 时不传这个 timer，让 Preflight 使用自己的计时器；
3. 自动预检完成后重新读取 `session.preflight`；
4. 无 plan 时停止，不调用 Apply；有 plan 时把最初的总计时器传给 Apply。

这保证 Preflight 日志报告自身耗时，Apply 最终摘要仍覆盖用户从点击到完成的总耗时。

## 迁移端口

新 Controller 只依赖下列 UI-neutral 动作：计时器工厂、控制符动作、mutation/status/model/publish/log 输出、Save、Revert、取消预检、Preflight 与 Apply。Host 在 `index.ts` 用闭包装配当前 session 和 `ToolRunContext`；Apply 是注入动作。

明确留在 `index.ts`：

- `runPreflight()` 的工作区解析、CancellationToken、任务 Map、源码索引/cache 与 Presenter；
- `apply()` 的脏编辑器检查、编码、workspace fs、Wing 投影、事务写盘/回滚与 receipt；
- `save/revert/reload` 的外部变更对话框、fingerprint guard 与磁盘复读；
- `handleControlMessage()` 的导航、clipboard、Output 和 Host session 查找；
- `didMutate()` 的 Presenter、discovered summary 与 Host state 发布。

## 点检

- [x] 迁移前 source characterization 冻结九类分派、stale/accepted/unchanged 和双计时器顺序。
- [x] 新 Controller 使用 spy trace 覆盖全部九类命令与所有短路分支。
- [x] 新 Controller 不导入 `vscode`、DOM、Node 文件系统、`ToolRunContext` 或具体 Presenter。
- [x] `index.ts` 删除 `handleEditorMessage()` 的分支状态机和 `acceptActionTable()`。
- [x] Apply、Preflight、Save/Revert 与控制符具体实现仍位于 Host adapter。
- [x] 定向、全仓、typecheck、architecture、docs、Registry 依赖和 VSIX 制品门禁通过。
- [x] 真实 Extension Host 的 open/preview/conflict/apply/saveReload/rollback 代表流程不回归。

自动核验结果：全仓 95 个测试文件、470 项测试；Extension typecheck；129 个生产源文件、24 个 pure graph、11 个 View root；66 份 Markdown；7 个 Wing Registry 0.4.2 引用；Code VSIX 29 个文件、432,469 bytes，全部通过。VS Code 1.128.0 的隔离 Extension Host 回执覆盖 open、preview、conflict、apply、saveReload、rollback，并命中 2 个候选文件、2 个 Marker 区域和 1 个实际变更文件。

Save/Revert 冲突决策继续作为下一独立切口；本次不顺手修改覆盖、重建、取消或异常语义。

并发预检回写尚未绑定 Editor document revision/epoch，属于现有竞态风险；本次纯迁移不改变它，后续应在独立切口冻结“预检进行中继续编辑”的失效矩阵后治理。
