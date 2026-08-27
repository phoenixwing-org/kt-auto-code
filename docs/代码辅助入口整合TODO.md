# 代码辅助入口整合 TODO

状态：current（代码辅助分组入口已实现；排序已用户点检，头文件引用修正/ASCII/编码/UUID/CAA UI 待逐项点检）

Owner：KT Auto Code maintainers

适用版本：future

最后核验：2026-08-21

环境变量名 `ROOT_DIR`、`SDK_PREFIX`、`ROOT_DIR_CORE`、`ROOT_DIR_INCLUDE`、
`ROOT_DIR_3rdParty` 与 `CAA_MK_VERSION` 属于可公开的配置契约；文档只描述键、相对路径或
`<WORKSPACE_ROOT>` 等占位符，不记录任意开发机用户名、主目录或具体绝对路径。

## 1. 背景

Code 模块的 Ribbon 现只保留高频的搜索替换、自动代码、代码辅助、Run 与 Git。低频的头文件引用修正、成员排序、头文件 ASCII、编码、UUID 和 CAA UI 已收拢到代码辅助 Tree，避免一级按钮与固定/排序菜单持续膨胀。

代码辅助只负责聚合入口，不把头文件 ASCII、编码或 UUID 误命名为 CMake 功能。C++ 成员排序是第一个用户点检通过的迁移样例；所有原命令 ID、设置入口与自动化调用继续兼容。

## 2. 候选信息架构

建议采用以下三层界面：

1. Ribbon 提供一个 `代码辅助`按钮入口；它不再为每个低频代码辅助动作新增一级按钮。新用户首次启动的默认顺序为：`代码辅助 → Git → Run → 替换 → 自动代码`；旧版本已保存的 Ribbon 只做一次兼容迁移，之后始终尊重用户自己的固定或排序选择。`…` 菜单的“重置 Code 默认顺序”只恢复 Code 的默认顺序和固定项，不影响 CAD。
2. 点击入口后，Primary 的第三个 Block 显示可整体折叠、带轻边框与独立 Header 的“功能目录”Tree。标题右侧显示总数 `（6）`；当前分组为：`C++ 整理`（3 项：头文件引用修正、成员排序、头文件 ASCII）、`文件工具`（2 项：编码、UUID）和 `CAA`（1 项：CAA UI），每个分组 Header 右侧以紧凑的 `（3）` 样式显示下级功能数。目录内容与 Git Block 一样贴齐当前工具 Block 的左右边界，不另留卡片空隙；当前功能以选中背景和左侧细线标识。点击叶子后“功能目录”自动收起，立即露出 Tree 下方的对应操作区，避免用户误以为点击无响应；该次入口和当前目录同时写入 KT Auto Code Output。整体目录、分类折叠与排序的两个内部 Block 折叠均保存到 VS Code 用户级 `globalState`，不写工程配置；收起目录不关闭已打开的右侧 View 或清理功能会话。
3. 头文件引用修正等长表格功能在编辑器区打开或激活自己的单例、文档式右侧 View；目录、环境、长表格、Preview 和 Apply 都在该 View 中完成。重复点击同一节点只定位已有标签页。
4. C++ 成员排序保留在当前工具 Block：点击 `C++ 整理 → C++ 成员排序` 后，在 Tree 下显示既有排序 UI，分为“排序操作”和“预览结果”两个可折叠内部 Block。选择功能本身不扫描、不写入。
5. 各功能的 Preview/Apply 会话彼此独立；不得把 A 功能的预览或待写入计划用于 B 功能，也不在一个共享页签内切换功能。

候选功能：

| 功能 | 当前状态 | 说明 |
| --- | --- | --- |
| 头文件引用修正 | 已迁入 `C++ 整理`，待点检 | 将平铺 include 修正为 CMake package include，例如 `#include "KtString.h"` → `#include <KtCore/KtString.h>` |
| C++ 成员排序 | 首个用户参与迁移已完成 | 已从一级 Ribbon 移入 `C++ 整理` Tree；保留原扫描、选择、确认、写入、还原和 Git diff 语义 |
| 头文件 ASCII 修正 | 已迁入 `C++ 整理`，待点检 | 保留原预检、修复、设置和命令兼容 |
| 编码修正 | 已迁入 `文件工具`，待点检 | 项目编码策略仍是独立领域能力，不因迁入而改为 CMake 专属 |
| UUID 修正 | 已迁入 `文件工具`，待点检 | 保留原扫描、映射选择、确认写盘与命令兼容 |
| CAA UI | 已迁入 `CAA`，待点检 | 保留 CATDlg 扫描、Desk Tools 连接与命令兼容 |
| 发布结构迁移：`export.bat` / SDK include | 仅需求草案 | SDK include 从平铺输出迁移到按 `public/<dll-name>`（以最终约定为准）分目录输出；预览旧平铺文件的清理计划，再显式确认删除 |
| `CMakeLists.txt` package 迁移 | 仅需求草案 | 将直接引用 lib/dll 的方式改为 `find_package`；搜索目录必须由显式参数、Preset 或项目配置提供 |

## 3. 头文件引用修正规则

只有该功能被单独批准后，才按以下边界实施：

1. 优先从机器环境变量 `ROOT_DIR_INCLUDE` 读取公共目录并取其 package 根；该变量可为空，仅在显式设置时覆盖默认目录。为空时使用 `ROOT_DIR` 与 `SDK_PREFIX` 组合为 `<ROOT_DIR>/<SDK_PREFIX>/core/include`，只有 `SDK_PREFIX` 未设置时才默认使用 `kt`。KtCore 头文件跨平台只保留这一份共享输出，`ROOT_DIR_CORE` 仅用于 DLL、dylib、so、lib 等平台产物。目录输入框允许直接修改或选择目录，最近明确选择仅保存在本机 UI 状态，不写入工程配置。
2. 在 CORE include 树中建立不区分大小写的文件名映射。兼容旧 `include/**/source/**/*.{h,hpp}`（去掉结构段 `source`）与已分包的 `include/<package>/**/*.{h,hpp}`；例如 `KtCore/source/KtString.h` 和 `KtCore/KtString.h` 都映射为 `KtCore/KtString.h`。没有 package 目录的平铺头文件不自动猜测。
3. 同名头文件映射到多个 package 时标为冲突并禁止自动替换，不能任意选择一个。
4. 工程目录在打开 View 时使用 Primary 顶部“目录”的当前选择；View 内文本框允许为本次 Preview/Apply 临时修改，但不提供目录选择按钮、不回写 Primary、不缓存，也不写入团队 `.vscode/settings.json`。Primary Tree 和直接命令入口都必须在点击时解析并传入当前目录，不能绕过 Primary 上下文。
5. 遍历目标的 C/C++ 头文件和源文件，只修改合法 `#include` 行，匹配文件名时不区分大小写；默认输出尖括号 package include。
6. Preview 表格显示 `文件名 · 相对目录`、行号、旧值和新值。首列允许局部横向滚动；行号与变更列保持紧凑自动列宽。
7. Apply 保留 UTF-8、UTF-8 BOM、GBK 和换行；预览记录文件指纹，写入前重新读取，任何文件变化都要求重新预览。
8. 写入前需要明确确认；完成后提供变更文件数、include 数和打开 Git diff 的入口，不自动提交。

### 当前点检清单

1. 点击 Ribbon 的“代码辅助”，确认第三个 Block 显示三组 Tree；一级 Ribbon 与其 `…` 菜单中均不再出现排序、头文件 ASCII、编码、UUID 或 CAA UI。
2. 点击“头文件引用修正”，确认右侧打开 `代码辅助 · 头文件引用修正`；Header 左侧显示功能名，右侧固定显示“预览 / 写入修正 / 工程环境”，其余目录和结果都位于 Main；再次点击时只定位同一页签。
3. 设置有效的 `ROOT_DIR` 与非默认 `SDK_PREFIX`，确认 `ROOT_DIR_INCLUDE` 有值时优先使用、为空时回退 `<ROOT_DIR>/<SDK_PREFIX>/core/include`；Package 行只显示路径、“推导…”和“选择…”，“推导…”菜单提供从 `ROOT_DIR_INCLUDE` 或 `ROOT_DIR + SDK_PREFIX` 推导。推导成功、变量缺失或结果目录不存在都必须写入 KT Auto Code Output。确认工程目录默认带入 Primary 当前目录，可临时编辑并参与 Preview，但不提供选择按钮且不保存。
4. 预览摘要写入 KT Auto Code Output；同名头文件冲突逐项输出“文件名 → 全部候选 include 路径”，未进入 `source`/包目录结构的头文件逐项输出相对路径。两类条目都只供检查，继续排除在自动映射和写入之外。
5. 检查同名冲突会列出警告且不会自动替换；点击表格行可定位文件及行号。
6. Apply 前修改任一待写入文件或 Package 目录，确认必须重新 Preview；确认写入后检查 Git diff、UTF-8 BOM/GBK 与原换行均被保留。

### C++ 成员排序迁移点检清单

1. [x] 一级 Ribbon 与 `…` 中不再显示“排序”。
2. [x] 展开“代码辅助”，Tree 中显示 `C++ 整理 → C++ 成员排序`。
3. [x] 点击该叶子，Tree 下显示“排序操作”和“预览结果”两个独立可折叠 Block；“排序操作”的 `×` 关闭该内部功能、清空排序会话和预览缓存后返回 Tree，不关闭第三个 Block。
4. [x] 扫描与应用所选均与原功能一致；选择功能本身不自动扫描或写入。

## 4. 用户参与迁移规则

每个既有工具迁入“代码辅助”都按单项、可见、可回归的方式进行：

1. 首个功能必须单项迁入并完成外层用户点检；同一轮的相邻低频工具可复用已验证外壳批量进入 Tree，但其实际扫描/写入仍须逐项用户点检。
2. 保留既有命令 ID、后端算法、文件写入确认、配置键与自动化调用。入口迁移不是重写业务能力。
3. 首轮只调整 Ribbon 与当前工具 Block 的呈现；扫描、Preview、Apply 和右侧 View 的功能边界须保持原状。叶子点击绝不隐式执行扫描或写入。
4. 原一级按钮从 Ribbon 和 Ribbon `…` 中移除时，必须由自动测试验证默认布局、已保存布局清理和命令兼容；用户需点检极窄侧栏、Tree 折叠重启恢复与实际执行结果。
5. Tree 的通用 Web Component 未来由 Phoenix Wing 提供后，只做等价替换；不得借此改变功能分类、会话或写盘语义。

## 5. 与现有按钮的待决问题

恢复开发前至少回答：

- 头文件 ASCII、编码、UUID 与 CAA UI 已从 Ribbon 下线；原命令 ID、设置链接和自动化调用继续保留兼容入口。
- Tree 的分类、图标、未选中叶子和功能状态将来怎样由通用组件模型驱动？默认不得自动执行磁盘扫描。
- 右侧 View 已确定为每项功能独立文档式 View；后续需统一标签命名、重复打开定位和关闭后的会话释放规则。
- `export.bat` 与 `find_package` 的真实输入/输出样例、回滚边界和多配置策略尚未提供，不能根据描述直接批量改写。

## 6. 发布结构迁移与 AI 检查草案

`export.bat` 的 include 输出目录调整、目标 SDK 中旧平铺 include 的清理，以及消费方 `CMakeLists.txt` 的 `find_package` 改写彼此有关联，但不能和源码 include 改写混入同一个 Apply。

每项应各自生成 Preview/Apply 会话：先展示新增目录、移动/生成的文件、计划清理的旧平铺文件以及 CMake 差异；删除旧文件必须在单独确认后执行，并且需要可审查的 Git diff。

修正完成后提供“交给 AI 检查”入口。该入口默认只读，向 AI 提供本次计划、实际写入回执、相关 `export.bat`/`CMakeLists.txt`/include 树和 Git diff；AI 负责检查路径一致性、遗留平铺文件、package 名称、`find_package` 调用和消费 include 是否匹配。AI 不应在检查阶段再次直接写盘。

## 7. 后续恢复条件

发布结构迁移与 `find_package` 迁移保持暂停，直至用户提供真实 fixture。已迁入的 ASCII、编码、UUID 与 CAA UI 先完成逐项人工点检；后续新增能力仍应先做纯 TypeScript Analyze/Plan/Apply 算法和测试，再接 VS Code Host 与各自的右侧 View；不得顺手改变已锁定的三个 Primary 一级 Block。
