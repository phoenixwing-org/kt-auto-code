# Git Primary Block 实现基线

状态：current

Owner：KT Auto Code maintainers

适用版本：KT Auto Code 0.6.0

最后核验：2026-07-23

本目录记录 Git Primary Block 的可行性、已冻结交互、安全算法与 0.6.0 实现基线。功能已进入本地发布候选；未经用户明确授权不执行 Marketplace 发布。

## 当前推荐结论

- Git 先作为 **Code 模块的最后一个 Ribbon 工具**，排在 CAA UI 后面。
- 点击 Git 只打开共享 Primary 中的一个 Git Block；不创建编辑器 View、TreeView、WebviewPanel 或第二套结果页。
- 暂不新增独立 Git 模块，也不新增“配置模块”。V1 的少量选项放在 Git Block 内，并让生成结果可编辑。
- “不新增独立 Git 模块”只指 Auto Code 顶层 UI；共享算法与 Git CLI 从第一阶段就在 Phoenix Wing 建立 `git-core` / `git-node` 领域包，Auto Code 不保留第二套实现。
- 不复制 Desk Tools 的 Git Page、暂存区、文件 Diff、侧栏提交框或 HTTP API。Auto Code 只处理本计划的两项能力。
- 功能一“群消息摘要”为只读能力；最近 commit 行可勾选一个或多个节点，一次生成多条简报，不重复展开原始 Commit/Author/email 等信息。
- 简报选项保持短标签：`Git 地址`、`时间`、`@审查人`。Git 地址整份只输出一次；默认审查人/候选保存在机器级插件设置 `ktAutoCode.git.reviewers`，可删除或清空。
- 简报文本框拖动后的高度保存在机器级用户设置 `ktAutoCode.git.summaryTextHeight`，下次打开简报时恢复，不写入工程 `.vscode/settings.json`。
- 群消息中的 `++` 是固定状态后缀，表示“代码已更新”；默认生成但允许在预览中编辑。
- 功能二“合并提交”为历史改写能力。V1 允许选择当前分支直线历史中间的连续区间；remote/其他分支或 tag 占用时询问是否只改写当前本地分支，其他安全问题仍硬阻断。
- 多仓库增量已复用标题下方现有工作区信息行，Git 激活时显示仓库下拉。候选合并多根 `.code-workspace`、VS Code Git API 已发现的 submodule/嵌套仓库及活动编辑器所属仓库；至少保留活动仓库，下方一次只显示所选仓库，不堆叠多个完整 Git Block。

## 计划范围

1. 从一个或多个 commit 节点读取结构化元数据，但 Primary 只显示可编辑、可复制的群消息简报。
2. 在当前分支的一条直线上选择多个连续 commit，提取并允许编辑 message、author、committer 与时间，再安全合并为一个 commit 节点；选择区间可以位于 HEAD 之前。

详细方案见 [Git Primary Block 可行性与实施计划](Git-Primary-Block可行性与实施计划.md)。

## 何时再考虑独立 Git 模块

满足以下任一条件后再重新评估：

- 增加 status/stage/restore/diff/branch/push 等第三类 Git 工作流；
- Git 工具需要多个长期并列 Block；
- Git 能力要由独立扩展发布，或被 Code/CAD 之外的模块消费；
- Code Ribbon 宽度已无法容纳 Git，且紧凑模式也不能保持可用。

在这些条件出现前，新建模块只会增加 manifest、Header 显隐、模块状态和迁移成本，不符合“Primary only”的目标。

## 后续才讨论

- 是否增加团队级 reviewer 名录；0.6.0 仅使用机器级 `ktAutoCode.git.reviewers`，`@` 可在简报中勾选，不改写原 commit message。
- 已存在于 remote 的提交允许经明确确认后仅改写当前本地分支；删除旧远端分支或后续 force push 由用户自行处理，插件不自动执行。
- 是否需要支持带 GPG/SSH 签名或 merge parent 的提交；V1 推荐拒绝，避免静默丢失签名或改变拓扑语义。
