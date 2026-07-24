# Git Primary Block 可行性与实施计划

状态：current

Owner：KT Auto Code maintainers

适用版本：KT Auto Code 0.6.0

最后核验：2026-07-23

## 1. 目标

在 KT Auto Code 的共享 Primary 中增加一个轻量 Git Block，仅提供：

1. 从 commit 节点直接生成只含群消息简报的可编辑结果；
2. 多个连续 commit 合并为一个新 commit，并允许修改 message、人员和时间。

本计划同时作为 0.6.0 实现与验收基线；实现已落入 Wing Git core/node 与 Auto Code Primary，未授权的正式发布不在本计划执行范围内。

## 2. 明确不做

- 不创建 Git View、TreeView、WebviewPanel、编辑器 Tab 或 Diff 页面。
- 不复制 Desk Tools 的 Git Page、暂存/恢复、文件列表、提交侧栏或 `/api/git/*`。
- 不做 stage、unstage、restore、branch 管理、fetch、pull、push 或 force push。
- 不初始化仓库，不自动设置 `user.name` / `user.email`。
- 不在 V1 改写 merge commit 或带签名 commit；remote/其他本地引用占用改为显式确认警告，插件本身不处理这些引用。
- 不把 `vscode`、Webview、Primary 状态或 Auto Code 命令注册放入 Phoenix Wing。
- 不把 Node Git CLI、临时 worktree 或文件系统操作放入无宿主依赖的纯 core。

## 3. 现有架构审计

### 3.1 Auto Code

- Code Ribbon 的顺序由基础扩展注册 `KtTool` 的顺序决定。
- 当前最后一个 Code 工具是 CAA UI；Git 可以作为下一个 `KtTool` 注册，因此天然位于 Code 模块最后。
- Code 工具已使用共享 Ribbon、Primary Block、打开态和 MRU 恢复逻辑，不需要增加模块协议。
- 工具可在 Extension Host 中使用无 shell 的 Git CLI 子进程，并把结构化状态投影到 Primary。

### 3.2 Desk Tools

Desk Tools 当前 Git 能力面向完整工作区管理，包括 Git Page、changes/stage/restore/diff/commit、侧栏布局和 HTTP API。它与本计划差异明显：

| 维度 | Desk Tools | Auto Code 计划 |
| --- | --- | --- |
| UI | 完整页面与侧栏 | Primary 单 Block |
| 文件状态 | changes/staged/untracked | 不提供 |
| 普通提交 | 已暂存内容提交 | 不提供 |
| commit 历史 | 非当前重点 | 简报与受限合并 |
| 运行边界 | Server HTTP + Web | VS Code Extension Host |
| View | 有完整页面 | 明确没有 |

因此只参考其“Git 命令必须集中、路径必须校验、不能由 UI 拼 shell”原则，不复用其页面或 HTTP 契约。

### 3.3 Phoenix Wing

Wing 已采用领域 core 与 Node adapter 分包：`code-core`、`cad-core` 保持纯 TypeScript，`db-node` 承载 Node 能力。当前没有适合承接 Git 历史改写的通用 “system” 包；把 Git 塞入 `code-core` 会混淆代码编辑算法与版本库操作，把它放进根 `src/utils` 也会突破纯工具边界。

因此计划改为从第一阶段就在 Wing 建立有真实消费者的 Git 领域包：

- `@phoenix-wing/git-core`：纯 TypeScript；承载 commit DTO、群消息格式化、reviewer 提取、拓扑/连续区间判定、安全阻断规则、Squash Plan 与结果校验；禁止依赖 Node、Vue、VS Code 或任何进程 API；
- `@phoenix-wing/git-node`：Node 22 adapter；承载 Git CLI、NUL-safe 读取、ref 查询、临时 worktree、受控 cherry-pick、提交创建、清理和原子 update-ref；依赖 `git-core`；
- `kt-auto-code`：第一个真实消费者；只保留 Primary UI、Extension Host 编排、确认窗口和 Wing 调用，不复制算法；
- `phoenix-desk-tools`：以后有相同历史整理需求时直接消费 Wing 包，不是本轮实施前提。

所有 Wing 公共 API 从第一行起遵守其命名规则：函数使用 `pnw*`、类型使用 `Pnw*`、常量使用 `PNW_*`。新包必须同时具备明确 exports、JavaScript/`.d.ts` 输出、测试、架构边界与 npm tarball 验收，不能只建空目录。

## 4. 按钮位置决定

### 推荐：Code 模块最后一个工具

顺序建议：

```text
… → UUID → CAA UI → Git → Run
```

- Ribbon 文案：`Git`
- 完整标题：`Git 提交整理`
- 描述：`生成 commit 群消息简报，或安全合并本地连续提交。`
- 点击行为：只打开/切换 Git Primary Block，不自动读取之外的内容，更不自动改写历史。
- 图标：参考用户给出的绿色分支节点语义，正式实现时绘制与现有 `media/tools/*.svg` 一致的单色 SVG；不直接把截图位图放进扩展。

### 不推荐：新增配置模块

Git 不是“配置”，将它放入配置模块会掩盖历史改写风险，也会让工程环境、插件设置与仓库操作混在一起。V1 不需要持久配置页：模板、人员和时间都在当前 Git Block 草稿中编辑。

### 暂不采用：独立 Git 模块

只有两个 Primary 动作时，独立模块会引入模块安装/显示/激活状态、Header 勾选命令和额外 manifest 契约。当前收益不足，升级条件见本目录 [README](README.md)。

这里的“独立 Git 模块”是指 Auto Code 顶层 UI 模块，不是 Wing 包。Auto Code 暂不新增 Git 导航模块，但 Wing 从一开始新增独立 Git 领域包。

## 5. Primary 交互草图

```text
┌ Git 提交整理 ──────────────────────────────────────┐
│ 仓库：[PNXCaaStudy · packages/caa ▾]               │
│ PNXCaaStudy · origin/sort · HEAD 4b4622d   [刷新] │
│                                                    │
│ 合并本地未发布 commit · 不自动 push                │
│                              [选择并预检]           │
│                                                    │
│ 最近 commit · 勾选生成简报（默认 20）   [生成(2)] │
│ [✓] [●] 4b4622d  修复：补齐曲线分割命令…          │
│ [✓] [○] 8f8f40e  …                                 │
│                                                    │
│ 群消息简报                                         │
│ [ ] Git 地址  [✓] 时间  [✓] @审查人               │
│ 默认审查人 [Kevin ▾]                               │
│ [可编辑的两行文本预览                         ]    │
│                                      [复制简报]    │
└────────────────────────────────────────────────────┘
```

列表必须有固定最大高度并独立滚动，Primary 页面不能因为 commit 数量无限增长。默认只读最近 20 条，按需“再加载 20 条”。

### 5.1 多仓库发现与选择

当前实现会遍历 `vscode.workspace.workspaceFolders`，并把每个工作区根目录当作一个候选仓库；模型和简报/合并命令已经携带 `repositoryId`。因此，多根工作区中“每个根目录本身就是 Git 仓库”时可以得到多个仓库项目，但当前 UI 会把它们逐个纵向渲染成完整区块。一个工作区根目录内部的 Git 子模块或其他嵌套仓库目前不会被发现，这也是只看到一个仓库区块的主要原因。

2026-07-23 增量已改为单仓库上下文，不再堆叠多个完整 Git Block：

- 复用标题下方现有“工作区：Trial”这一行；Git 工具激活时将它改为原生、不可搜索的 `仓库：[名称 · 相对路径 ▾]` 下拉，其他工具仍显示原来的工作区文本；
- 即使只发现一个仓库，下拉也至少保留当前活动工作区对应的仓库作为唯一选项，用于明确简报和合并的操作对象；只有一个选项时可以禁用展开，但不得隐藏当前仓库上下文；
- 多根 `.code-workspace` 的每个 Workspace Folder 都是候选入口；同一根目录通过 `git rev-parse --show-toplevel` 解析真实仓库根，避免打开仓库子目录时误建重复项；
- 优先读取 VS Code 内置 Git 扩展已经发现的 repository 列表，以覆盖工作区根仓库、已打开的嵌套仓库和受 VS Code 管理的子模块；再用 Workspace Folder/活动编辑器路径补足，保证 Git API 尚未完成发现时仍至少得到活动仓库；
- 注册的 Git submodule 可通过父仓库元数据补充发现；普通独立嵌套仓库不做无边界的递归磁盘扫描，避免大型工程、构建目录和依赖目录造成卡顿；
- 仓库使用规范化真实根 URI 作为稳定 ID 并去重；显示一条连续的 `仓库名 · 工作区相对路径`，完整绝对路径放入 `title` 和 `aria-label`；工作区外仓库不在本功能中自动加入；
- 刷新时优先保持当前手动选择；首次打开或原选择失效后依次选择：活动编辑器所属仓库 → 上次在当前工作区选中的仍有效仓库 → 当前 Workspace Folder 的根仓库 → 首个成功读取的仓库；活动编辑器变化不应强制跳库；
- 当前选择属于每工作区的瞬时 UI 状态，保存到 `workspaceState`，不写 `.vscode/settings.json`；刷新后仓库仍存在则保持选择，失效时按上述默认顺序回退；
- 下方只渲染所选仓库的一份分支摘要、最近 commit、简报和合并入口；仓库数量可保留为状态尾部 badge，不再用多个完整区块表达；
- 简报草稿、合并预览、一次撤销记录和运行互斥锁都必须绑定 `repositoryId`。切换仓库时若存在未完成草稿，先提示放弃或取消切换；执行期间禁用仓库切换；绝不允许跨仓库勾选 commit 或组合一次合并；
- 写操作执行前必须使用所选仓库根重新读取 HEAD、分支、状态和 refs，并校验 action 中的 `repositoryId`、`expectedHead` 与预览 revision，不能依赖下拉框的显示文字定位仓库。

这里的“工作区”和“仓库”必须分开建模：一个 VS Code 工作区可以包含多个 Workspace Folder，一个 Workspace Folder 也可以包含根仓库、多个 submodule 或独立嵌套仓库。下拉选择的是 Git 仓库，不是切换 VS Code 工作区。

## 6. 功能一：commit 群消息简报

### 6.1 commit 结构化读取与显示边界

Extension Host/Wing 必须结构化读取以下信息，用于简报、拓扑判断与安全预检：

- 完整 commit SHA；
- parents（0、1 或多个）；
- author name/email/date；
- committer name/email/date；
- subject 与 body；
- 当前仓库、分支和 upstream；
- 是否位于 HEAD、是否为 merge、是否带签名。

Primary 不展开、不重复显示上述原始 Commit/Parents/Author/Committer/email/date/body；最近 commit 行前提供 checkbox，用户可勾选一个或多个节点并一次生成简报。禁止解析 `git log` 面向人的默认输出；使用固定格式与 NUL 分隔，避免中文、换行、引号或特殊字符破坏字段边界。

### 6.2 仓库与 remote 标签

未勾选“Git 地址”时，样例中的 `PNXCaaStudy origin/sort` 按以下优先级生成：

1. 仓库名取 Git top-level 目录 basename，例如 `PNXCaaStudy`；
2. 若当前分支存在 upstream，直接使用 upstream 短名，例如 `origin/sort` 或 `check/sort`；
3. 没有 upstream 时显示 `local/<branch>`；
4. detached HEAD 显示 `detached/<short-sha>`，且禁用合并功能。

remote 名不写死为 `origin`，因此用户使用 `check` 等 remote 时可正确显示。

勾选“Git 地址”后，Wing 读取当前 upstream 所属 remote 的真实 URL，在整份多 commit 简报最前面只输出一次；每条 commit 行省略重复的本地项目目录名，只从 `origin/sort` 或 `check/sort` 开始。插件不把带凭据 URL 写入日志。

### 6.3 默认群消息模板

对用户给出的 commit：

```text
Commit: 4b4622df4580439c1b93876a87565c2420a4f253
Parents: 8f8f40e4ddff2ae6f790801c31004c7da50851e7
Author: Phoenix Wing <3301647@qq.com>
Committer: Phoenix Wing <3301647@qq.com>
Date: Sat Jul 18 2026 14:55:00 GMT+0800

修复：补齐曲线分割命令构造控制符 审查：Kevin
```

默认生成（未勾选 Git 地址，勾选时间）：

```text
PNXCaaStudy origin/sort **Commit:** 4b4622 ++ · 2026-07-18 14:55
修复：补齐曲线分割命令构造控制符 审查：@Kevin
```

规则：

- short SHA 默认 7 位；如同一结果集中发生前缀冲突，自动扩到最短唯一长度；
- 第一行保留 Markdown `**Commit:**`，用于支持 Markdown 的群聊；预览区允许删掉 Markdown；
- “Git 地址”默认关闭；勾选后顶部显示一次 remote URL，下面每条 commit 行不再重复项目目录名；
- “时间”显示每条 commit 的 committer 时间，按原时区换算后精确到分钟；群消息不追加 `+08:00` 等时区后缀；
- `++` 是群消息中的固定状态后缀，含义为“代码已更新”；默认模板保留，用户仍可在发送前编辑预览；
- subject 保留原有 `修复：`、`功能：` 等中文前缀；
- 优先识别 message 中的 `审查：`，其次识别 `Reviewed-by:` trailer；
- “审查人显示 @”默认开启；关闭后保留审查人但不加 `@`，两种情况都不修改 Git 原文；
- commit 内找不到审查人时，使用原生、不可搜索的下拉框所选默认审查人；下拉直接展示全部候选，末项“＋ 输入新人员…”在原位置临时切换为输入框，回车或失焦保存、Esc 取消；没有默认值时不生成空的 `审查：`；
- 默认审查人候选保存在机器级插件设置 `ktAutoCode.git.reviewers`，第一个为默认值、最多 12 项，用户可在设置中删除或清空；commit 内的 `审查：` / `Reviewed-by:` 始终优先；
- 多选按最近 commit 列表顺序生成，每个节点保持两行；remote URL 整份只出现一次；
- 预览始终可编辑，“复制”只复制当前预览，不重新生成。

### 6.4 可行性

结论：高。它只调用只读 Git 命令和剪贴板 API，不改变仓库状态。建议作为第一阶段单独交付。

## 7. 功能二：合并多个 commit

### 7.0 TortoiseGit 交互参考

TortoiseGit Windows 版的 Log Dialog 顶部是带分支线的 commit 列表，HEAD 行以粗体标识。用户用 Ctrl/Shift 选择两个或多个 commit 后，可从右键菜单执行 `Combine to one commit`；官方手册将其定义为合并连续提交，而不是要求所选范围必须结束于 HEAD。

本工具只借鉴“在历史直线上选择连续区间”的交互，不复制 TortoiseGit 的三栏 Log Dialog。Primary 中仍使用紧凑 commit 列表：单击选择起点，再单击选择终点，自动填充两端之间的连续节点，并明确标出“所选区间”和“需要随之重写的后续节点”。

参考：[TortoiseGit Log Dialog](https://tortoisegit.org/docs/tortoisegit/tgit-dug-showlog.html)。

### 7.1 V1 支持范围

所选 commit 必须同时满足：

- 位于当前分支的 first-parent 直线上；
- 连续，不能跳过中间 commit；
- 所选范围最新端可以是 HEAD，也可以位于这条直线的中间；
- 从所选最旧 commit 到当前 HEAD 的整个受影响范围都必须是普通单 parent commit，不允许跨过 merge；根提交可单独专项支持；
- working tree 与 index 均干净；
- 不处于 merge、rebase、cherry-pick、revert 或 bisect 状态；
- 从所选最旧 commit 到 HEAD 的整个受影响范围若可到达 remote-tracking ref，预检显示可确认警告；
- 若其他 local branch 或 tag 引用受影响范围，预检显示可确认警告；确认后这些引用继续指向旧历史，不自动移动或删除；
- 整个受影响范围不含需要保留的 GPG/SSH 签名或暂不支持的额外 commit header。

拓扑、脏工作区、Git 操作中、签名与未知 header 等条件不满足时只说明原因，不提供“仍然执行”按钮。remote/其他分支或标签占用不是硬阻断，但执行前必须弹出明确确认；插件只更新当前本地分支，不 push、不 force push，也不删除或移动相关引用。

这里的“连续”必须按真实 parent 关系判断，不能按界面排序后的相邻行判断。TortoiseGit 的公开历史说明也把能力限制在同一条直线、无 merge point 的场景；本计划采用同样的拓扑边界。

### 7.2 草稿提取

选择多个 commit 后，Primary 显示可编辑草稿：

- 新 commit message：默认按从旧到新顺序合并各 subject/body，并保留清晰分隔；
- author name/email；
- committer name/email；
- author date/timezone；
- committer date/timezone；
- 原始 commit 列表、base parent、旧 HEAD 与预计新 HEAD；
- 合并后会消失的 SHA、后续提交的 old → new SHA 映射，以及将保留的最终 tree SHA。

“默认以最后一个时间重置”在计划中定义为：使用所选范围 tip，也就是所选区间最新 commit 的时间，并保留原时区；它不一定等于 HEAD。界面必须明确写“默认取所选最新提交”，避免列表倒序导致“最后一个”歧义。

author 与 committer 默认也取 tip commit，但允许分别修改。时间输入使用本机可读格式 `YYYY-MM-DD HH:mm:ss`，不显示时区，也不向用户暴露 Git 内部的 `<unix-seconds> <offset>`；读取时把 commit instant 换算成本机时间，执行前再按该日期对应的本机时区严格转换回 Git canonical date。

### 7.3 技术实现简述

假设当前历史为：

```text
A — B — C — D — E — F (HEAD)
    └── 选择 B、C、D
```

目标不是要求 D 等于 HEAD，而是生成：

```text
A — S — E' — F' (HEAD)
```

其中 `S` 是 B/C/D 的合并节点；`S.tree = D.tree`。E'、F' 是把原 E、F 依次重放到 S 上形成的新节点，因此它们的 SHA 会变化，但每一步完成后的文件快照必须与原节点一致。

不在用户当前工作区直接执行 `git reset --soft` 或交互式 rebase。推荐建立隐藏临时 ref 和隔离的临时 worktree：所有 cherry-pick、index 与 working tree 变化都只发生在临时环境；原分支在最终验证前保持不动。

推荐步骤：

1. 再次读取 HEAD、状态、操作状态、ref 占用、remote 可达性与所选范围，确认与预览快照一致；
2. 以 create-only 方式创建备份 ref，例如 `refs/kt-auto-code/backup/<branch>`，指向旧 HEAD；重名时依次使用 `-2`、`-3`，绝不覆盖已有备份；
3. 在所选最旧 commit 的 parent 上创建隐藏临时 ref，并为它建立隔离的临时 worktree；可以把它理解为“在所选范围下面开一条临时分支”；
4. 对所选 B、C、D 按从旧到新执行受控的 `cherry-pick --no-commit`，只累积它们的变更，不逐个生成 commit；
5. 累积完成后只提交一次，生成合并节点 `S`；message、人员和时间来自用户确认后的草稿，并校验 `S.tree` 必须等于原 D.tree；
6. 对 D 之后到 HEAD 的 E、F 逐个重放：每次先 `cherry-pick --no-commit`，再以原节点的 message、author、committer 和时间生成 E'、F'；每一步都校验新 tree 等于对应旧节点的 tree；
7. 校验临时链的新 HEAD tree 与旧 HEAD tree 完全一致，并校验所有 old → new 映射、提交数量和 parent 链；
8. 使用带 expected-old-value 的 `git update-ref`，将当前分支从旧 HEAD 原子更新到临时链的新 HEAD；
9. 复读 HEAD、tree、status 和 reflog，确认用户原 index/worktree 未变化，然后删除临时 worktree 与临时 ref；
10. 在当前会话显示“撤销本次合并”，撤销也必须使用 expected SHA 原子更新，不能覆盖用户后续新提交。

如果临时 cherry-pick 发生冲突，V1 直接终止并删除临时环境，不把冲突带入用户当前工作区；以后如确有需求，再单独设计冲突处理界面。该算法会写临时 worktree，但全部验证成功前不移动用户分支，也不改用户当前 index/worktree。代价是所选区间上方直至 HEAD 的后续 commit SHA 都会变化，确认窗口必须把这一点和数量明确展示出来。

TortoiseGit 官方界面说明只承诺“合并连续 commit”，没有公开保证内部一定使用上述命令序列；这里采用的是与该交互等价、且适合 Auto Code 做失败隔离的实现方案。

### 7.4 Git 命令安全边界

- 只使用 `spawn`/`execFile` 参数数组，`shell: false`；禁止拼接 shell 字符串。
- Git 可执行文件、仓库根和当前 workspace 必须经过显式发现与校验。
- 读取使用 NUL 分隔和机器格式；不根据本地化提示文本判断状态。
- 每条命令设置超时、最大输出和退出码检查。
- message 不通过 `-m` 多层拼接；使用 stdin 或临时受控文件传入。
- 不在日志中输出邮箱以外的环境变量、凭据、remote token 或完整带凭据 URL。
- 不自动 push；即使未来开放，也只能单独设计 `--force-with-lease` 预览与确认，不能复用本按钮暗中执行。

### 7.5 失败与回退

| 失败点 | 分支是否变化 | 处理 |
| --- | --- | --- |
| 预检失败 | 否 | 显示阻断原因 |
| 临时 cherry-pick 冲突或提交失败 | 否 | 保留草稿，删除临时 worktree 与临时 ref |
| tree 校验失败 | 否 | 严重错误，禁止 update-ref |
| `update-ref` expected SHA 不符 | 否 | 说明 HEAD 已变化，要求刷新 |
| update-ref 后复读异常 | 已变化 | 提供基于备份 ref 的显式恢复说明 |
| 用户已有后续提交 | 不自动回退 | “撤销”按钮失效，避免覆盖新历史 |

### 7.6 可行性

结论：有条件可行。当前分支线性历史中的任意连续区间都可以进入 V1；区间上方的后续节点必须一起安全重建。merge commit 与签名等仍硬阻断；已推送历史和其他分支/tag 占用经用户确认后可仅改写当前本地分支；自动 force push 不属于 V1。

## 8. 状态模型建议

未来实现时，Host 应持有结构化状态，Webview 只负责编辑和发语义命令：

```text
RepositorySnapshot
  repoRoot / repoName / branch / upstream / head / clean / operationState

CommitRecord
  oid / parents / author / committer / dates / subject / body / signature

GroupSummaryDraft
  selectedOids / templateText / extractedReviewer / includeRemoteUrl / includeCommitTime / dirty

SquashDraft
  selectedOids / expectedHead / baseParent / message
  author / committer / dates / blockers / previewRevision
```

不得把 Git CLI 原始 stdout 当成可长期保存的 UI 状态。每次执行写操作都要携带 `expectedHead` 与预览 revision，Host 复验后才允许继续。

## 9. 计划中的目录边界

0.6.0 从第一阶段执行 Wing-first，不在 Auto Code 复制一套随后再迁移：

```text
phoenix-wing/packages/git-core/
  src/index.ts             # 公共 Pnw*/pnw* DTO、摘要、拓扑与计划 API
  src/group-summary.ts     # 纯格式化与 reviewer 提取
  src/squash-plan.ts       # 纯连续范围、安全阻断与执行计划
  src/*.test.ts

phoenix-wing/packages/git-node/
  src/index.ts             # Node 22 Git adapter 公共入口
  src/git-runner.ts        # shell:false 的 Git CLI
  src/repository.ts        # 仓库、refs、状态与 NUL-safe log
  src/squash-transaction.ts# temp ref/worktree / cherry-pick / update-ref / backup
  src/*.test.ts

kt-auto-code/extension/src/tools/git/
  index.ts                 # KtTool、命令与 Extension Host 编排
  gitPrimaryPanel.ts       # Primary Web Component
  *.test.ts

kt-auto-code/extension/media/tools/git.svg
```

`git-core` 禁止 Node、VS Code、Vue 和 DOM 依赖；`git-node` 依赖 `git-core` 并拥有 Git 进程与临时资源生命周期；Auto Code 只依赖公开 Wing API并持有 UI/确认/仓库互斥锁。两个 Wing 包必须有真实消费者、稳定 JS/`.d.ts`、架构门禁和 tarball smoke，不建立空包。

## 10. 分阶段计划

### Phase 0：契约与 fixture

- 冻结 commit DTO、群消息模板、reviewer 提取优先级，并为 `++ = 代码已更新` 建立固定格式化 fixture。
- 建立临时 Git 仓库 fixture：普通线性历史、中文 message、不同 remote、merge、dirty、detached、已推送与签名场景。
- 冻结“最新提交时间”的含义和时区 round-trip。

验收：纯解析和格式化不依赖 VS Code/UI，特殊字符与中文信息逐字稳定。

### Phase 1：只读简报

- 在 Code 模块最后增加 Git 工具和 Primary Block。
- 在现有工作区信息行增加 Git 专用仓库下拉：合并 VS Code Git API、Workspace Folder 和活动编辑器的发现结果，以真实仓库根去重；下方一次只渲染所选仓库。
- 完成仓库/upstream/remote URL/最近 commit 读取；勾选一个或多个节点生成简报，提供 `Git 地址`、`时间`、`@审查人`、默认审查人原生下拉、编辑与复制。下拉不做搜索过滤；可从末项输入新人员，删除/清空则进入插件设置。
- 不出现任何改写历史的 Git 命令。

验收：单根、多根 `.code-workspace`、根目录内 submodule/嵌套仓库均按发现边界列出；至少显示活动仓库；切换后只读取所选仓库；`origin`、`check`、无 upstream 和 detached 四类标签正确；复制内容与预览逐字一致。

### Phase 2：合并预览但不写入

- 加入区间选择、真实 parent 连续性验证、后续节点识别、ref 占用、remote 可达性、操作态、签名与 dirty 分类；共享引用进入警告，其余不安全条件阻断。
- 提取 message、author、committer 和时间，生成合并后的 commit 预览。
- 展示所选区间、需要重建的后续节点数量和 old → new 预期映射；不创建临时 worktree，也不调用 cherry-pick/commit/update-ref。

验收：硬阻断与可确认警告分类明确；预览不会改变 HEAD、index、worktree 或 refs。

### Phase 3：本地未发布历史合并

- 实现 backup ref、隔离临时 worktree、所选变更累积、后续节点重放、tree equality 和原子 `update-ref`。
- 增加最终 modal，明确列出旧/new SHA、提交数量、人员/时间和“不自动 push”。
- 增加只对本次 session 有效的安全撤销。

验收：合并前后 tree 一致；HEAD 提交数按预期减少；index/worktree 字节状态不变；中途失败可恢复。

### Phase 4：是否扩展范围（另行决策）

只有真实需求出现后才讨论：

- 自动推送、删除远端引用与 `--force-with-lease`；
- merge commit；
- 自动移动、删除多分支、多 tag 或其他 ref；
- GPG/SSH 签名；
- 独立 Git 模块或完整 Git 工作区。

这些能力不属于当前计划的默认承诺。

## 11. 测试与人工点检计划

### 自动测试

- commit log 的 NUL-safe 解析；
- 中文、多行、空 body、特殊邮箱与时区；
- `审查：Kevin`、`审查：@Kevin`、`Reviewed-by:`、无 reviewer、默认 reviewer 与关闭 `@`；
- 多 commit 勾选顺序、顶部一次 remote URL、项目目录名条件显示与时间开关；
- upstream 为 `origin`、`check`、无 upstream；
- 单根工作区、多根 `.code-workspace`、工作区根不是仓库但活动文件位于仓库、submodule、独立嵌套仓库、重复真实根与仓库消失后的选择回退；
- 仓库切换保持 `workspaceState` 选择，不污染 `.vscode/settings.json`；草稿未保存、合并执行中和撤销记录存在时遵守切换边界；
- short SHA 最短唯一长度；
- 连续/不连续/位于历史中间/merge/detached/dirty/进行中操作；
- 受影响范围的 remote-tracking ref 可达性与其他分支/tag 占用警告、未确认拒绝、确认后引用不移动；
- tip 人员与时间默认值；
- 中间区间合并后的 descendant old → new 映射；
- 临时 cherry-pick 冲突时原分支、当前 index 与 working tree 不变；
- 重建前后 HEAD tree equality；
- expected-old-value 竞争更新；
- backup 重名自动递增编号，backup 与撤销不能覆盖已有引用或后续提交。

### 人工点检

- Primary 在普通、浅色、深色和高对比主题下保持单 Block；
- Git 激活时原“工作区”行显示仓库下拉；单仓库至少显示活动仓库，多仓库切换后下方不堆叠其他仓库 Block；长仓库名与相对路径整体省略，悬浮可见完整路径；
- commit 列表固定高度，长 subject/remote/邮箱不撑破布局；
- 群消息复制到目标群聊后的 Markdown、换行与 `@` 显示符合预期；
- 最终确认明确说明历史会改写、不会 push；
- 使用真实但可丢弃的本地分支完成合并、重载 VS Code 和撤销；
- Windows 与 macOS 的 Git 日期/时区结果一致。

## 12. 实施前决策清单

- [x] UI 仅 Primary，无 View。
- [x] Git 放在 Code 模块最后。
- [x] 暂不新建配置模块或独立 Git 模块。
- [x] 不复制 Desk Tools 完整 Git 工作区。
- [x] 功能一先于功能二。
- [x] V1 允许选择当前分支直线中间的连续区间，并重建区间上方直到 HEAD 的后续节点。
- [x] 整个受影响范围必须是普通单 parent 提交；remote/其他分支或 tag 占用时由用户明确确认，仅改写当前本地分支。
- [x] 默认人员和时间取所选范围最新 commit。
- [x] 不自动 push/force push。
- [x] 群消息中的 `++` 为固定状态后缀，表示“代码已更新”。
- [x] V1 reviewer 只识别 `审查：` 与 `Reviewed-by:`；新增内部格式以后按 fixture 扩展。
- [x] V1 一律拒绝会被重写的签名 commit，避免静默移除无效签名。
- [x] 用户已批准以 KT Auto Code 0.6.0 为目标开始编码，并纳入 Run Block。
- [x] 多仓库交互采用现有工作区信息行中的仓库下拉；至少包含活动仓库，下方一次只显示所选仓库，不为每个仓库堆叠完整 Block。
- [x] 已实现 VS Code Git API + Workspace Folder + 活动编辑器的仓库发现与真实根去重，并补齐 submodule/嵌套仓库、多根工作区及切换安全测试。
