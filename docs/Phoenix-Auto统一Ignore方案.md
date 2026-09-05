# Phoenix Auto 统一 Ignore 方案

状态：current

Owner：Phoenix Auto maintainers

适用版本：KT Auto Code 0.8.3+；KT Auto CAD 后续接入

最后核验：2026-09-05

本文是 Phoenix Auto Ignore 的主需求、交互、安全与跨产品复用入口。各工具计划只记录接入差异，并链接本文；不得各自复制另一套规则模型。

## 1. 目标与用户模型

所有需要递归扫描项目文件的 Phoenix Auto 功能只向用户暴露三个可独立勾选的来源：

| 来源 | 默认 | 存储与职责 |
| --- | --- | --- |
| 插件忽略 | 开 | Phoenix Auto 随版本发布的稳定生成物/缓存目录表；不写入项目 |
| Git 忽略 | 开 | 只读所选目录所在最近 Git 仓库根部的 `.gitignore`；不复制到自定义文件 |
| 自定义忽略 | 关、内容为空 | 用户在 Primary 明确保存后写入所选项目 `.phoenix/.ignore` |

三个来源是并集，但开关彼此独立。用户可以只启用自定义规则，也可以关闭所有来源做一次明确的全范围扫描。这里的“全范围”仍不进入 `.git/.hg/.svn` 源码管理元数据和 `.phoenix` 插件状态目录；它们是不可关闭的写盘安全边界，不属于用户可选 Ignore。工具不得把“插件忽略”称为 `.phoenix/.ignore`；后者只叫“自定义忽略”。

原生 View Header 固定提供“忽略范围”和“设置”两个图标。“忽略范围”打开独立 `ignoreSettings` 逻辑工具 View，“设置”打开 `environmentSettings`；二者复用 Primary 当前工具 Block，不增加第四个一级 Block。搜索替换内容内另有紧凑的“忽略范围”折叠区，用于在执行前看到并切换当前三个来源。

Ignore View 按以下顺序组织：

1. **来源与写入**：切换三个读取来源；用 radio 二选一确定本次写入目标。默认读写最近 Git 仓库根 `.gitignore`，只有用户主动切换时才使用当前目录 `.phoenix/.ignore`；Git 目标不可用时才自动回退 Phoenix。只有用户明确执行添加/去除时才写盘。
2. **插件内置规则**：独立只读 Block 展示随插件发布的目录规则；不得把它们伪装成已经写入 Git 或 Phoenix 的文件内容。
3. **有效规则**：至少列出并合并根 `.gitignore` 与 `.phoenix/.ignore` 的有效规则，每条保留来源信息；规范化等价规则只显示一次。
4. **推荐规则**：位于末尾并默认展开；每组/条目保持紧凑两行视图，允许逐条选择添加或去除，不要求整组写入。

### 图 1：VS Code 原生 View Header

```text
┌─ KT Auto Code ───────────────────────────── [忽略] [设置] ┐
│                                              │      │     │
│                        打开 ignoreSettings ──┘      │     │
│                     打开 environmentSettings ───────┘     │
└───────────────────────────────────────────────────────────┘
```

### 图 2：Webview 三段外壳

```text
┌─ ▾ │CODE│ [代码辅助] [Git] [Run] [替换] [自动代码] […] ┐
│       展开时保留图标与文字，空间不足可自然换到后续行    │
├─ 目录 ─────────────────────── [当前目录 ▾] [文件夹] ┤
├─ ▾ 当前工具 ─────────────────────────────────── [×] ┤
│  此处显示 Ignore、设置或其他当前逻辑工具               │
└─────────────────────────────────────────────────────┘
```

### 图 3：独立 Ignore View 内部

```text
┌─ ▾ 来源与写入 ──────────────────────────────────────┐
│ 扫描来源   [✓] 插件   [✓] Git   [ ] 自定义            │
│ 写入到     (●) Git .gitignore  (○) .phoenix/.ignore  │
│ 常用规则   CAA · C++ · Web           [打开] [分析]   │
├─ ▸ 插件内置规则 ─────────────────────────── 31 条 ─┤
│ （只读；展开后显示随插件发布的规则）                  │
├─ ▾ 有效规则 ──────────────────────────────── 3 条 ─┤
│ build/                                      [Git]    │
│ ImportedInterfaces/                [Git] [Phoenix]   │
│ node_modules/                            [Phoenix]   │
├─ ▾ 推荐规则（默认展开，最后一段）──────────── 2 项 ─┤
│ [✓] C++ / CMake 构建目录                      [高]   │
│     build/ · cmake-build-*/                          │
│ [ ] 原生对象与预编译头                        [高]   │
│     *.obj · *.pch · …                                │
│                                  [添加所选] [去除所选]│
└─────────────────────────────────────────────────────┘
```

这是连续的四段 Section，不是树形目录。推荐项默认直接使用两行紧凑列表；只有需要查看单条规则时才在段内展开明细，不增加树节点层级。

所有添加先统一路径分隔符并清理前导 `./`，再按精确规则语义去重；尾部目录斜杠必须保留，`foo` 与 `foo/` 是两条不同规则。去除只作用于用户明确选择的目标和规则，必须保留注释、无关规则及另一来源内容。空操作不得创建文件。

## 2. 文件与状态生命周期

- 新项目没有自定义规则时，不创建 `.phoenix/`，也不创建 `.phoenix/.ignore`。
- 只有用户在 Primary 输入至少一条非空规则并点击保存，才创建并保存自定义文件；空行、注释和重复规则不计入输入。
- 清空已经存在的 Primary 自定义受管块是明确写操作，但不得删除同文件中用户手写内容、预设或推荐受管块。
- 旧项目已有 `.phoenix/.ignore` 时继续兼容读取；它默认不自动启用，避免隐藏的旧规则扩大扫描盲区。Primary 显示规则数量，由用户勾选后生效。
- `.gitignore` 与自定义规则始终是两份独立来源。创建自定义文件不再自动复制 Git 规则；“从 `.gitignore` 追加”仅保留为用户明确触发的兼容管理动作。
- Ignore View 的写入 radio 默认选中最近 Git 根 `.gitignore`，并同时读取打开但未保存的目标文档；只有用户主动选择 Phoenix，后续添加/去除才写 `.phoenix/.ignore`。不在 Git 仓库内时允许回退 Phoenix，但必须在界面标明 Git 目标不可用。
- 三个开关属于当前 VS Code 工作区的运行/UI 选择，保存在 `workspaceState`；不是团队工程语义。自定义规则内容属于项目策略，可随项目提交。

## 3. 插件内置目录

插件内置目录名在 Windows、macOS 和 Linux 上统一按大小写无关比较。0.8.3 可关闭基线至少包含：

```text
.vs
node_modules .pnpm-store .cache .next .nuxt .turbo coverage dist build out
Debug Release bin obj target .venv __pycache__
Install_config_win_b64 win_b64 intel_a ToolsData CATEnv ImportedInterfaces
various ProtectedGenerated LocalGenerated Objects
```

这里仅放跨项目可稳定判定为生成物、依赖或缓存的目录。`*.bat`、`.vscode/`、`.github/`、归档、图片和项目源码目录等存在误伤风险的规则，不进入默认内置集合；它们只能由 Git、自定义规则或有证据的推荐流程启用。

`.git/.hg/.svn/.phoenix` 始终排除，并与 symlink、二进制、大文件等一起归入扫描安全边界。关闭“插件忽略”会重新放入 `.vs`、`ImportedInterfaces`、`build` 等可选生成目录，但不会允许搜索替换或项目改名进入这些元数据/状态目录。Ignore View 的“插件内置规则”只展示真正受该开关控制的条目，不能把安全边界伪装成可关闭规则。

内置目录的定义应逐步由 `phoenix-wing/code-core` 的纯数据契约统一提供，Code/CAD 宿主只负责文件系统遍历。当前 Auto Code 的大小写无关目录表是 0.8.3 行为基线，不能由各 View 再复制一份。

## 4. 当前消费者与跨产品边界

| 消费者 | 0.8.3 行为 | 后续要求 |
| --- | --- | --- |
| 搜索替换 | 使用三个来源和当前开关；内置目录可关闭 | 保持写盘前报告与实际执行使用同一快照 |
| 项目改名 | 从 Primary 带入三个开关并绑定到该 View 任务 | 报告 Header 后续显示来源摘要；任务中途不得被 Primary 新状态覆盖 |
| 头文件引用修正 | 从 Primary 带入三个开关；默认跳过 CAA/CMake/IDE 生成目录 | Package 源目录和目标项目分别解析规则，不把一个项目的自定义规则跨项目套用 |
| 头文件 ASCII / 编码修正 | 通过统一运行上下文消费相同来源 | 日志显示有效来源和忽略目录计数 |
| UUID、成员排序、CAA、Codegen | 现有路径逐步收敛到同一 Host 解析入口 | 不新增私有 hard-coded ignore 表 |
| KT Auto CAD | 当前尚无同等项目递归 Ignore UI | 新增扫描/索引能力时消费 Wing 契约；CAD View 只做适配，不复制规则目录与解析器 |

## 5. MVC、Web Components 与 Wing 迁移

- **Model**：规则规范化、来源合并、去重、逐条添加/去除决策必须是无 `vscode`、无 DOM、无 Node 文件系统依赖的纯 TypeScript，并以单元测试锁定。该层是迁入 `phoenix-wing`、供 Auto Code、Auto CAD 与 Desk Tools 共用的首要候选。
- **Controller**：Auto Code Host 只解析当前目录与 Git 根、读取/写入目标文件、保护未保存文档并把纯模型结果转换为消息；不得在 Webview 中读写文件。
- **View / ViewModel**：Ignore 的来源、目标、有效规则和推荐列表使用 Host-neutral ViewModel；通用交互逐步封装为不调用 `acquireVsCodeApi` 的 Web Components，只发语义事件，由宿主适配 VS Code 或 Desk Tools。
- 本轮允许先在 Auto Code 内稳定接口和交互，再迁入 Wing；迁移时保持模型、事件名和可访问性语义，Auto Code 最终只保留 tag 注册与 Host 适配，不复制组件实现。

Auto Code 与 Auto CAD 可以有不同的扫描文件类型、入口和结果 UI，但 Ignore 的来源枚举、规范化、目录大小写语义、规则快照和 fixture 必须一致。共享层不访问 VS Code、Vue/Tauri 或 Node 文件系统，只接受相对路径和规则并返回命中结论。

## 6. Git 语义与子目录 TODO

0.8.3 只读取所选目录所在最近 Git 仓库**根部**的 `.gitignore`，使用 Phoenix 当前支持的规则子集。所选扫描目录位于仓库子目录时，Host 会先按 Git 根到扫描根的相对路径重定位可无损表达的根规则，并过滤只属于兄弟目录的规则，再交给当前 Wing matcher；不能无损表达的完整 Git 语义仍不得伪装为已支持。不能简单把所有子目录 `.gitignore` 拼成一个数组，因为：

- 每个规则相对其所在目录解释；
- `!` 否定规则依赖父规则与出现顺序；
- 同名嵌套仓库、工作树和子模块必须切断继承；
- 目录剪枝过早会使子级重新包含规则失效。

后续若要支持 PNXCaaStudy 各 Wsp 的子目录 `.gitignore`，先在 Wing 定义 `basePath + orderedPatterns + repositoryBoundary` 的规则栈，并以 Git 行为 fixture 做差分测试。完成前只使用最近仓库根规则、插件内置目录和所选扫描根自己的 `.phoenix/.ignore`，不得宣称完整复刻 Git Ignore。

## 7. 安全与验收

- Preview、Apply、写盘后复扫必须冻结并复用同一组来源开关与规则快照。
- symlink、不可读目录、二进制、大文件和结果上限属于扫描安全边界，不应伪装成用户 Ignore 规则。
- 每个扫描型功能至少覆盖：三个来源分别启停、组合去重、大小写目录、空自定义不建文件、非空自定义真实保存、外部目录不串用当前项目规则。
- Windows 人工验收使用含 `ImportedInterfaces`、`win_b64`、`Objects`、`.vs` 和 CMake `build` 的 CAA 工程；再关闭插件忽略，确认这些目录会重新进入只读扫描，同时 `.git/.hg/.svn/.phoenix` 仍不可进入。
- 日志与结果摘要应能回答“哪些来源启用、忽略了多少目录”，但默认不输出可能敏感的全部路径或规则内容。
