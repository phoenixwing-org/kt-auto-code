# Changelog

所有显著变更会记录在本文件中。

## 0.7.0（发布准备中）

- Primary 固化为“工具栏、目录、当前工具”三段式连续 Section：目录改为固定单行上下文，唯一设置入口承载 Ignore、工程环境与插件设置；当前工具仍保留独立关闭和内部滚动。
- Ribbon 增加代码辅助入口、固定与排序菜单和新用户默认顺序；低频 Code/CAA 工具按 Tree 分组迁入代码辅助，C++ 成员排序等功能使用独立会话并可主动关闭释放现场。
- Git 简报首条自动生成并复制；提交图和本地合并迁入编辑器区单例 View，按首 5 条、下一条、下 5 条分页，仓库下拉仅在重名时补充父目录。
- Run 使用 Wing Navigation Tree，项目和分组按用户状态展开，叶子命令单击直接进入既有安全运行边界；搜索替换、设置与各当前工具 Block 收敛为连续、紧凑的满宽 Section。
- CMake Package 头文件引用修正加入代码辅助第一阶段，使用目录/环境约定构造预览与受控写入会话。
- 已精确消费 Phoenix Wing `0.7.1` 发布的 `code-core`、`git-core`、`git-node`、`kt-codegen` `0.6.4`，并升级 Registry 当前最新的 `run-core`、`run-node` `0.6.3`；删除本地候选类型声明和 Git 正文补写兼容层，正式 Registry/VSIX 门禁仍在执行。

## 0.6.3

- 扩展从 `extension/` 扁平化到仓库根：manifest、源码、资源、开发、构建和发布入口统一，正式 VSIX 归档到 `dist/vsix/` 并生成 SHA-256。
- Primary 收敛为单 Webview 的三段式工作台；工具栏、工作目录与 Ignore、当前工具三个一级 Block 的数量、顺序和职责固定，均可独立折叠，当前工具保留独立关闭入口和内部滚动。
- Ribbon 增加 Code/CAD 模块筛选、图标与文字/仅图标密度、固定、整行拖动和上下排序；菜单适配极窄侧栏、键盘焦点和持久化，模块切换不再占用 View Header。
- 工作目录成为头文件、编码、搜索替换等工具的共享范围；Git Ignore 默认生效，插件 Ignore 可选叠加，未成熟的工作集入口暂时隐藏并保留后续调查记录。
- 搜索替换改为 VS Code 风格紧凑双行：空替换内容仍可搜索、替换需填写内容；支持当前目录、一级子目录、多根工作区和外部目录，并记忆最近选择。
- Git 群消息简报保留完整 commit 正文及原有空行，不再只复制首行 subject；多条列表内容与审查人信息均完整输出。
- `更多 commit` 保持默认收缩，折叠时不读取历史；每次重新展开自动追加下一条，并保留“下一条 / 下 5 条”的显式分页入口。
- Git Primary 的已加载数量只统计最新节点之外的历史，首屏显示 0，减少空列表与计数不一致造成的困惑。
- KT Auto Code 与 CAD 的产品文档完成分仓整理，并增加面向用户的简洁功能关系图。
- 本开发候选可受控消费并列 Wing 0.6.3；正式 Registry 依赖在 Wing 发布前继续精确保持 0.6.2，不写入本地路径或虚假 lockfile。

## 0.6.2

- Code 与 CAD 的 15 处 Phoenix Wing 依赖精确升级到 Registry 0.6.2；Git 首屏改用轻量仓库摘要，更多 commit 使用 expected HEAD + OID 游标分页，切库和刷新可取消过期读取，完整快照仅用于合并安全预检。
- 当前工作区没有 Git 仓库时，Git Primary 提供“新建 Git 仓库”和“搜索所有子目录”；搜索结果逐个加入仓库下拉，首个立即显示，扫描完成前可随时停止并保留已发现结果。
- Codegen 增加磁盘变化检测、冲突提示和始终可用的手动重新加载，避免关闭 View 后仍保留过期 JSON 会话。
- 增加非模态运行诊断页面，可输出 Extension Host 内存、Block、Codegen、Git 与 watcher 等调试信息，并明确内存统计边界。

## 0.6.1

- 没有打开任何功能 Block 时，下方工具界面改为紧凑 Welcome：显示 KT Auto Code / CAD 的安装状态与版本，缺失插件可直接安装，并在底部提供 Gitee、安装说明、快速开始和插件设置入口。
- 仓库地址统一迁移到 `gitee.com/phoenixwing/kt-auto-code`；Welcome 的“安装说明”改为打开 VS Code 内置扩展搜索，避免外部 Marketplace 登录页脚本错误。
- Git Primary 现在发现多根 VS Code 工作区、Git API 仓库与嵌套子模块，并在工作区信息行提供仓库下拉；简报、连续提交合并和撤销始终绑定当前选择的真实仓库根。
- Codegen Primary、控制符目录、应用报告、成员排序、UUID 与搜索替换结果进一步收敛到 Phoenix Wing 的共享状态模型和 Host-neutral Web Component；Auto Code 保留 VS Code Host、权限确认与工作区编排。
- Code 与 CAD 的 15 处 Phoenix Wing 依赖精确升级到 Registry 0.5.1；同步适配 Codegen 报告类型收窄及 0.5.1 的 Primary/预检组件打包边界。
- 本补丁保持 KT Auto CAD 版本为 0.1.0，不新增 Marketplace 扩展标识，也不引入 `link:`、`file:`、workspace override 或本地 Wing 运行时回退。

## 0.6.0

- 新增 Git Primary Block：可勾选一个或多个最近 commit，一次生成多条可编辑群消息简报；支持顶部一次 remote URL、committer 时间、`@审查人`，`++` 固定表示“代码已更新”。默认审查人候选进入可删除的机器级插件设置。
- 支持把当前分支直线历史中的连续提交安全合并为一个节点。脏工作区、merge/签名提交和非连续区间仍阻断；remote 或其他分支/tag 占用时明确询问，确认后只更新当前本地分支，不移动相关引用。临时 worktree 重放后校验最终文件树，备份 ref 重名自动编号，并保留一次显式撤销。
- 新增独立 Run Primary Block：递归发现多根工作区内的 Task、PowerShell/Batch/Shell 脚本、可执行文件、CMake 与 CAA 工程，统一通过 VS Code Task Terminal 执行，并保留命名 problem matcher、停止和运行历史。
- 每个可靠识别的 CAA 子项目固定提供 `MK` 与 `Run` 两个逻辑入口，可独立选择 CAA 版本及 MK 关联工程/Preq；内置 Windows runner 随 VSIX 只读发布，不修改 ExecutionPolicy，也不向工作区写脚本。
- Git/Run 的纯 TypeScript 算法与 Node adapter 分别位于 Phoenix Wing `git-core`/`git-node`、`run-core`/`run-node`；Auto Code 只保留 VS Code Host、Primary UI、确认和权限编排。
- Code 与 CAD 的 15 处 Phoenix Wing 依赖统一精确升级到 Registry 0.5.0，正式构建不使用本地路径、workspace override 或旧版回退。
- “工程环境 → 插件设置”现在只按扩展 ID 打开全部 KT Auto Code 配置，不再被 `deskTools` 搜索词限制；Desk Tools 专用入口仍保持定向过滤。

## 0.5.3

- 修复高对比度与高对比度浅色主题下 Primary、各功能 Block、Codegen 预检结果及对话框按钮缺少可见边框的问题；操作按钮、图标按钮、筛选按钮和状态标签统一使用宿主对比度颜色。
- hover 在保留原有背景反馈的同时增加活动对比边框，并回退到焦点边框；普通浅色/深色主题继续沿用原有按钮与面板颜色。
- 高对比度变量可跨 Shadow DOM 传入 Codegen Primary/控制符目录、成员排序和关联规则组件；本补丁不新增公共命令或扩展 API。

## 0.5.2

- Codegen 单次与批量 Apply 现在把结构化报告原子写入工作区 `.phoenix/reports/codegen/`；Primary 可重开历史报告，报告中的 JSON 进入 Codegen View，批量后台 session 不再铺开或关闭用户的 JSON View。
- 报告将健康度与源码变化拆为“正常/警告/错误”和“已更新/内容一致/部分更新/未应用”两轴，正常零写入明确显示“正常 · 内容一致”；新增紧凑状态筛选、带状态的 JSON 下拉与循环切换，并完善单项模式、问题链接和长路径换行。
- 编码修正新增工作区默认目标 UTF-8/GBK，以及头文件、源文件、Markdown 的 ASCII/UTF-8/GBK 项目级覆盖；转换前验证目标编码可无损表示内容，不可安全转换时只报告。
- 修正 UTF-8/GBK 源文件扫描与上下文显示，避免 UTF-8 中文被按 GBK 字节误拆；自动代码标题菜单、页面切换滚动位置和 Primary 工具栏图标尺寸同步完成收口。

## 0.5.1

- 将 Code 与 CAD 的七个 Phoenix Wing Registry 依赖精确升级到 0.4.3，并把 Codegen 缓存生成器提升到 0.3.3，避免继续复用 0.4.2 的旧 Marker 计划。
- 修正 Kevin 控制符缺失 Start/End 时的级联误报和状态呈现；坏块保持不可写，其他完整区域仍可安全 Apply，Problems、日志、Primary 与预检详情使用一致编号。
- 稳定 Codegen Primary 与 JSON View：checkbox 不再跳回列表顶部，候选 Preview/定位/高亮、折叠与滚动状态、预检结果留存和全部应用报告保持一致。
- 压缩工具栏、控制符目录、候选文件与预检详情，补齐浅色/深色/高对比主题及表格选中态；本补丁不新增公共命令或扩展 API。

## 0.5.0

- 初步完成旧 Qt/VB Codegen 自动代码能力迁移：首次进入自动发现工作区内根目录及嵌套 Codegen JSON，但不自动打开编辑器；旧 CSV 可在验证成功后单向转换为 JSON，冲突时保留两边。
- 一份 JSON 对应当前编辑区一个 Codegen View；左侧 Block 跟随活动 View 显示 Prefix、Middle、Namespace 与 Append 属性，JSON 和工作区控制符候选均提供可收缩、有限高度的滚动列表。
- 新增可复用的 `KtCodegenTable` Web Component 与 `KtCodegenTableCore`，采用整表数据输入/输出、文档级 dirty/checkpoint 和批量操作，避免每个单元格修改都与扩展宿主交互。
- Codegen JSON 保存保持既有根字段和 `headers` 顺序，统一使用 4 空格；支持还原、外部文件变更/删除检测以及保存时指纹复验，避免静默覆盖磁盘修改。
- 恢复 32 项 Kevin 控制符目录、选择预设、单选模式、候选扫描、可取消预检、命中/问题/Artifact 预览和源码定位；控制符与预检固定内嵌在当前 JSON View，并支持横向和纵向滚动。
- 真实 Apply 复用 `@phoenix-wing/kt-codegen` 0.4.0 的 Marker、生成、区域投影与通用事务算法，保持 UTF-8/BOM/GBK 和原换行；写入前复读源码，批量失败时安全回滚。
- Apply 的 Output 按 Target、Marker、文件和区域输出稳定身份；warning/error 同步进入 Problems。成功事务额外生成不含源码正文的 Apply Receipt，可按前后 sha256 和区域身份复核实际写入。
- 增加可重复 JSON/CSV/源码 fixture、A–F 手工验收清单及自动 verifier；当前用户已确认 A–D、JSON 保存与 Apply 核心路径，主题和完整预检交互继续保留为后续回归项。

## 0.4.0

- Code 纯算法改为直接消费 `@phoenix-wing/code-core` 小包，不再通过带 Vue/Element 依赖的聚合包。
- Code/CAD 模块切换迁入原生 View Header；共享 Ribbon 根据当前模块渲染 manifest 数据定义的工具，不再增加独立 CAD 工具块或 Activity Bar 按钮。
- CAD 文件名分析、工作区 FCStd 检索、基础界面和已有 Schema v13 数据库只读查询无需 Desk Tools；只有 FCStd 原生读取在执行时检查 provider。
- 主侧栏保留最小高度 Ribbon；点击模块只在其正下方展开原工具界面 Block，不再立即扫描或预览。
- Ribbon 支持“单显示、多打开”状态：当前 Block 强高亮，后台已打开 Block 使用次级颜色；关闭当前项按最近使用顺序恢复上一个。
- 新增单 Block 双样板：编码修正用于验证多控件操作区，C++ 成员排序将扫描、状态、筛选、勾选和文件结果合并在同一 Block，不再自动打开第二个原生结果 View。
- 成员排序的会话缓存保留用户选择及执行后状态；支持单文件/批量应用、预览 Diff、按需 Git Diff、安全还原、取消候选和加入工作集，写盘后不会自动逐个弹出 Diff。
- Header 成员排序兼容 KtAlarmClock 的 clang-format 基线：普通成员及最终 `// clang-format on` 与 `};` 之间不留空行；不同注释段之间的原始空行（包括 `//END ...` 与 `// clang-format on` 之间）保持不变。
- Ribbon 下方默认采用排他展开：最近使用的模块获得主要高度，关闭或切换模块时保留缓存；可在设置中改为多开。
- 搜索替换恢复完整规则界面 Block，覆盖搜索词、替换词、文件层级、工作目录、Ignore、编码、关联规则、档案和预览/写盘选择；旧连续 QuickPick 命令改为直接打开此 Block。
- 搜索替换与头文件 ASCII 结果增加 VS Code 风格命中高亮：文件名中的匹配片段在 Block 结果行标记，右侧编辑器以醒目的查找黄色背景和概览尺标记显示全部命中。
- 头文件、编码、Ignore、搜索替换、成员排序、UUID 与 CAA 全部完成单 Block 迁移；清理六个旧结果 TreeView 及其标题/行菜单，命令面板执行也会先打开对应 Block。
- 新增独立“工程环境”Block：四个工程环境变量不再占用 VS Code Settings；Windows 刷新直接读取用户/机器注册表，并可编辑当前用户变量、选择目录或文件、清除和打开系统环境变量界面。
- Ignore 推荐迁入原生 Block，支持按规则组查看、勾选和追加，并保留需确认组的二次确认；不再打开独立推荐页面。
- 删除未调用的 ASCII、搜索替换和 Ignore Webview 面板及其消息协议；文件预览与 Diff 继续交给 VS Code 原生编辑器和 Git。
- 新增 `.phoenix/worksets.json` 原生入口；ASCII、编码、成员排序、UUID、搜索替换和 CAA 对话框在各自 Block 顶部按模块记忆工作区/工作集范围，不再在扫描时弹范围 QuickPick；结果仍可加入已有工作集。
- UUID 扫描新增“同值同替换”与“每处独立新值”策略，默认保持前者，并在结果 Block 标明当前策略。
- Ignore 分析复用 Desk Tools 的顶层构建/缓存目录启发式，只生成可审核建议，不自动写盘，Git 已跟踪文件继续阻断。

## 0.3.0

- 新增 UUID 替换与 CAA 对话框文件结果 View；成员排序、UUID、CAA 均采用主侧栏下方的 Git 风格文件列表。
- 结果 View 不再互相替换：已扫描的结果会同时保留，支持由 VS Code 记住各 View 的展开或收起状态。
- 成员排序与 UUID 支持全选复选框、按文件逐行应用、预览或 Git Diff，以及不写盘的 × 取消候选操作。
- 三项文件扫描统一遵守 `.phoenix/.ignore`；`.phoenix/` 为内建默认排除目录。
- 设置入口集中到主侧栏标题工具栏，覆盖全局工程环境与 CAA 外部编辑器配置。
- 头文件 ASCII 修正、编码修正和搜索替换的结果统一迁移为主侧栏下方的紧凑文件块；批量修复、转换和替换仍保留原有的预检与确认保护。

## 0.2.0

- C++ 成员排序改为消费 `phoenix-wing/code-core`，支持头文件与实现文件的扫描、选择、确认写盘、会话级还原和按需 Git 差异预览。
- 成员排序、搜索替换、头文件 ASCII 修正和 Ignore 结果 View 改为全宽、紧凑表格布局；头文件 ASCII 结果 View 可直接重新预检或修复。
- 保持 UTF-8、UTF-8 BOM、GBK 文件编码；写盘前检查预检快照，避免覆盖外部改动。
- 市场图标、Apache-2.0 许可、权利人与发布元数据统一。

## 0.1.1

- 新增 Visual Studio Marketplace 专用 PNG 图标。

## 0.1.0

- 首个公开版本。
- 提供头文件 ASCII 修正、文件编码修正、Ignore 设置和工作区搜索替换。
- 搜索替换支持关联规则、冲突预览和 UTF-8 / GBK 编码保护。
- 加入 C++ 成员排序扫描入口（POC）。
