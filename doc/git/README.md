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

## 2026-07-29 性能改进

实际使用频率已经确认：**获得当前仓库最新一个节点的群消息简报最高频，多节点合并较少使用**。当前打开 Git 时对全部候选仓库各预取 200 条 commit，再由界面只显示 20 条，加载成本与使用频率不匹配。

Auto 侧已按“最新简报 → 默认收缩的更多 commit → 点击后才执行合并安全预检”三层加载。首屏只加载最新 1 条；折叠的 `更多 commit` 不读取历史，每次从折叠变为展开时自动追加下一条。保持展开时还可通过 `下一条` 追加 1 条，或通过 `下 5 条` 追加 5 条并进行多选简报。

这是一条 Git Primary 的“小界面、真按需”规则：默认收缩低频内容，不为隐藏内容提前执行 Git I/O；用户通过自然的收起/展开逐条浏览，只有明确需要批量查看时才点击 `下 5 条`。`更多 commit` 的“已加载”数量只统计最新节点之外的历史，初始为 0。

仓库目录已改为轻量内存缓存：打开 Git 不再每次重新搜索仓库；只有点击刷新才重建 VS Code 已知仓库与缓存目录。当前工作区仓库优先并分组显示，工作区外常用仓库固定到机器级设置的“我的仓库”。commit 内容不做跨仓库缓存，只读取当前选中仓库。Auto 已接入 Registry Wing 0.6.0：首屏使用轻量 summary，更多 commit 使用 OID 游标分页与 `AbortSignal`；完整仓库快照只用于合并安全预检。根因、缓存边界、实现回执与验收场景见[运行性能、Git 按需加载与 Codegen 刷新研究](../运行性能与按需加载研究.md#5-git-加载缓慢的根因)。

工作区未发现 Git 时，Primary 提供“新建 Git 仓库”和“搜索所有子目录”。递归搜索仅在用户点击后开始；每找到一个仓库就立即加入下拉，首个结果立即显示；搜索完成前可随时点击“停止”，已发现结果不会丢失。

与“改名”功能可以选择其他目录相同，当前工作区不是 Git 功能的硬边界。用户显式选择并校验工作区外 Git 根后，可以在该仓库生成简报或合并提交；合并确认必须突出“工作区外仓库”、完整路径、分支与改写数量，执行期间不得随活动编辑器切换仓库。

## TODO：Wing 完整正文修复发布后的简化

已发布的 Wing 0.6.2 只格式化 commit `subject`，因此 Auto 暂时在 `KtcGitWingAdapter` 中补回 `body`，保留标题与正文之间的空行、正文内部列表和全部内容。Wing 源头修复及权威单测已进入 0.6.3 候选，但尚未发布。

- [ ] Wing 下一 patch 公开发布后，精确升级 Auto 的 Wing manifest 与 lockfile。
- [ ] 用 Open Issue 0.7.0 多行 commit 样例同时验证 Registry formatter、Auto 简报和剪贴板文本。
- [ ] 确认正文只出现一次且空行保留后，删除 `KtcIncludeCommitBody` 兼容函数。
- [ ] 接入 Wing 0.6.3 的懒历史公共状态机，保持“每次折叠后重新展开追加 1 条”，再删除 Panel 内的临时展开请求去重状态。
- [ ] 保留 Auto 消费级单测，防止未来 Wing 或 Host adapter 再次只输出 subject。
