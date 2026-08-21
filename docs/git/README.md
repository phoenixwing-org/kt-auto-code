# Git Primary Block 实现基线

状态：current

Owner：KT Auto Code maintainers

适用版本：KT Auto Code 0.6.0

最后核验：2026-07-23

本目录记录 Git Primary Block 的可行性、已冻结交互、安全算法与 0.6.0 实现基线。功能已进入本地发布候选；未经用户明确授权不执行 Marketplace 发布。

## 当前推荐结论

- Git 作为 Code 模块中的工具入口；Primary 保持轻量摘要和 Git 操作 Tree。
- 高频“群消息简报”仍在共享 Primary 内完成；低频且有较大内容密度的“合并本地 commit”在编辑器区打开唯一的只读提交图/合并 View。
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

## 2026-08-21：提交图与合并 View

合并是低频、高风险操作，不能再把完整选择、预检和身份编辑器挤在 Primary。现在由 Primary 的 `Git 操作` Tree 负责入口，点击“合并本地未发布 commit”后只在编辑器右侧打开一个单例 View：再次点击复用同一个 View，不产生多个 Tab。

- 首屏调用 Wing `pnwReadGitCommitGraphPage`，只读取所选本地分支图的最近 **5** 条；不读 status、remote、全部 refs 或完整历史。
- “下一条”和“下 5 条”使用 Wing 返回的**不透明 cursor**继续分页，并携带首屏 `expectedHeadOid`；Auto 不解析、拼接或用 OID 重建 cursor。
- 提交图按拓扑顺序绘制 Wing 提供的 lane/parent edge；本地分支和标签仅以 decoration 显示。切换“本地分支 / 本地分支和标签”会重新开始一份只读图，不会 checkout、移动 ref 或切换工作分支。
- 用户至少选择 2 条后才执行一次完整 Wing squash 安全预检。预检继续负责连续区间、HEAD、工作区、受影响引用、签名和 replay 等硬安全判断；图仅用于浏览和选择。
- HEAD/仓库根在分页或预检期间变化时，旧图会失效并刷新当前仓库；切换仓库、关闭提交图 View 或合并成功均释放已加载图和草稿，避免保留不再需要的内存。

正式 `package.json` 与 lockfile 已精确升级到已发布的 `@phoenix-wing/git-core` / `git-node` `0.6.4`。并列 `../phoenix-wing` 只用于后续候选本地联调；Registry 构建不读取本地 Wing。

### 提交图点检

1. 打开 Git，确认首条简报仍自动生成并复制一次；同一 HEAD 不重复覆盖编辑中的简报。
2. 点击 Git 操作 Tree 的“合并本地未发布 commit”，确认右侧只出现一个 View，首屏为 5 条或更少的本地分支提交图。
3. 在含 merge 的测试仓库确认车道连线、分支 decoration；切换标签范围后确认 tag decoration 出现且未切换分支。
4. 分别点击“下一条”“下 5 条”，确认只追加相应条数；新建 commit 后再次分页，确认旧图被拒绝并刷新，而不是使用旧 cursor 写入。
5. 选择连续普通 commit 后预检，确认身份/时间/提交说明可编辑；选择不连续、merge 或受保护引用范围时确认只显示阻断，不写工作树。
6. 关闭提交图 View、切换仓库或执行成功后重新打开，确认从最近 5 条重新读取，旧选择和草稿不保留；任何路径均不自动 push。

## 2026-07-29 性能改进（历史：简报列表）

实际使用频率已经确认：**获得当前仓库最新一个节点的群消息简报最高频，多节点合并较少使用**。当前打开 Git 时对全部候选仓库各预取 200 条 commit，再由界面只显示 20 条，加载成本与使用频率不匹配。

Auto 侧已按“最新简报 → 默认收缩的更多 commit → 点击后才执行合并安全预检”三层加载。首屏只加载最新 1 条；折叠的 `更多 commit` 不读取历史，每次从折叠变为展开时自动追加下一条。保持展开时还可通过 `下一条` 追加 1 条，或通过 `下 5 条` 追加 5 条并进行多选简报。

这是一条 Git Primary 的“小界面、真按需”规则：默认收缩低频内容，不为隐藏内容提前执行 Git I/O；用户通过自然的收起/展开逐条浏览，只有明确需要批量查看时才点击 `下 5 条`。`更多 commit` 的“已加载”数量只统计最新节点之外的历史，初始为 0。

仓库目录已改为轻量内存缓存：打开 Git 不再每次重新搜索仓库；只有点击刷新才重建 VS Code 已知仓库与缓存目录。当前工作区仓库优先并分组显示，工作区外常用仓库固定到机器级设置的“我的仓库”。commit 内容不做跨仓库缓存，只读取当前选中仓库。Auto 已接入 Registry Wing 0.6.0：首屏使用轻量 summary，更多 commit 使用 OID 游标分页与 `AbortSignal`；完整仓库快照只用于合并安全预检。根因、缓存边界、实现回执与验收场景见[运行性能、Git 按需加载与 Codegen 刷新研究](../运行性能与按需加载研究.md#5-git-加载缓慢的根因)。

工作区未发现 Git 时，Primary 提供“新建 Git 仓库”和“搜索所有子目录”。递归搜索仅在用户点击后开始；每找到一个仓库就立即加入下拉，首个结果立即显示；搜索完成前可随时点击“停止”，已发现结果不会丢失。

与“改名”功能可以选择其他目录相同，当前工作区不是 Git 功能的硬边界。用户显式选择并校验工作区外 Git 根后，可以在该仓库生成简报或合并提交；合并确认必须突出“工作区外仓库”、完整路径、分支与改写数量，执行期间不得随活动编辑器切换仓库。

## 2026-08-21：Wing Registry 消费收口

正式 Registry 的 Wing `git-core` / `git-node` `0.6.4` 已包含完整正文 formatter 与提交图分页 API。Auto 直接消费 formatter，保留标题与正文之间的空行、正文内部列表和全部内容，不再补写 `body`；Registry manifest/lockfile 不含本地路径、link、file 或 override。

- [x] Wing 公开发布包含正文格式化和提交图 API 的版本后，按实际被消费的包精确升级 Auto manifest 与 lockfile。
- [x] 用 Open Issue 0.7.0 多行 commit 样例验证 Registry formatter、Auto 简报与剪贴板文本；正文仅出现一次、空行完整保留，已删除 `KtcIncludeCommitBody` 兼容函数。
- [x] 删除 `src/wingGitGraph.local.d.ts`，以正式 `@phoenix-wing/git-node` 类型替代候选声明；Registry VSIX 与 Extension Host 门禁继续作为 0.7.0 发布条件。
- [ ] 保留 Auto 消费级简报和提交图测试，防止未来 Wing 或 Host adapter 再次只输出 subject、解析 cursor 或退化为整仓读取。
