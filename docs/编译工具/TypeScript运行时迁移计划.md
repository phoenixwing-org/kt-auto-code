# 编译工具 TypeScript 运行时迁移计划

状态：当前执行草案，按阶段实施

最后核验：2026-09-09

## 目标

编译工具的按钮、任务状态、Git 更新、标准 CMake、CAA 链接和文件导出逐步改由
Phoenix Wing TypeScript 能力执行。插件内置与 Root 下发的 PowerShell 文件继续作为
命令行示例、Windows 兼容入口和回退工具，但不再作为 Webview “预检 / 启动 / 单步运行”
的默认运行时依赖。

这不是把 Windows CAA 伪装成跨平台构建。macOS、Linux、Windows 可以共享探测、Git、
文件、任务图、日志和标准 CMake 逻辑；RADE、MSVC 及其批处理仍只能在满足条件的
Windows 主机运行。

## 当前运行时快照（0.9.0 内测，2026-09-09）

运行框架由“TS 调度，PS1 执行”推进为 **TS 调度，Git 与标准 CMake 直接执行；Windows link/export/CAA 仍使用 PS1**。
以下是已经接线的范围，不等同于下文全部阶段完成：

| 入口 / 阶段 | 当前行为 | 边界 |
| --- | --- | --- |
| 预检 | TS 读取配置、路径、Git 状态和任务计划 | 不执行 PS1，不写 Git |
| 项目行“更新” | TS → Git，仅更新所选仓库 | 不执行 link、export、编译；有本地改动则保留并跳过 |
| 整体启动 / 仓库任务行“运行” | TS 逐仓库 fetch / checkout / pull --ff-only / submodule；可用时 LFS install --local / pull | 不再调用 Invoke-AutoBuild.ps1；只支持已存在仓库；一个普通仓库失败继续其他仓库 |
| CMake 项目 / 任务 / 整体启动 | TS 直接启动 cmake configure/build | 不要求 mk.ps1；默认 Debug + Release，也可只选 Release；写入 AutoBuild JSON 的 cmakeBuildTypes |
| macOS/Linux export | 日志明确“未运行 export.ps1”，任务标记已跳过 | 随后顺序编译 CMake；缺失导出依赖时会真实失败，绝不伪报导出成功 |
| linkCAA / CAA | Windows 继续 PS1；非 Windows 标记已跳过 | 尚未实现 TS link provider / Windows CAA runner |
| 脚本保存与同步 | 保留 Windows PS1 与 sample | 离线脚本不等于插件 TS 运行时；本轮不扩展到 .sh |
| AutoBuild 清理 | Wing TS 预览 / 冻结 / 复验 / 执行；Host 响应对话框取消 | Git 预览包含双 force 的嵌套仓库，冻结完整未跟踪/ignored 树及暂存区；取消不回滚已执行命令 |

包后增量（不在上述已交付内测包中）：Run 首行增加“清理”文字按钮打开 Wing 对话框，刷新也改为文字。
原 build / objects / `*.obj` 三个快捷叶子按用户要求恢复单击执行、不弹确认；内部仍使用 TS 冻结执行。
递归 build / objects / `*.obj` 与单 force Git 未跟踪清理使用独立 API，保留“不 reset、保留嵌套仓库”的语义；
Host 增加信任、目录、Task 并发及 session/token 门禁。可见 Host 和跨系统实机点检仍待完成，详见
[Run 清理阶段](../运行模块/README.md#09-包后增量run-统一清理)。已交付 VSIX 和其说明不被后续源码更新覆盖。

实现先落在 Auto 的独立 TS helper，已标注迁入 Wing 的 TODO；不能表述为这些新 provider 已经在 Wing 发布。
`export.yaml` 仅登记[独立讨论议题](Export跨平台支持讨论.md)，用户要求稍后研究，尚未设计或实施。

### 已知问题与未迁移能力

- `BUILD_MANIFEST.json` 导入目前是 Preview 方案；真实 Host 的统一 clone / origin 冲突校验 / 固定 Commit 检出仍待阶段 A。现有表格的 Commit 是探测快照，不是 TS 固定检出指令。
- Root/3rdParty 更新失败时保守跳过本批全部构建；更细的依赖图仍待提炼。普通项目失败只阻止自身及其子路径任务；显式重试会清除上一批失败记录。
- Git 脏工作树会跳过更新，但允许后续使用当前工作树编译；不隐式 reset、clean 或 stash。fetch 后会再次检查本地修改。
- Git LFS 未安装时记录 warning；已安装而 pull 失败时该仓库失败。Git 日志按命令结束回传，尚未复用 Wing 的完整流式 provider。
- 标准 CMake 走系统 PATH 的 cmake / 编译器；不会执行自定义 mk.ps1 的附加动作。需要这些动作的项目暂用原有离线 PS1；UI 显式“项目脚本”provider 尚待接入，不应称为已实现。
- 导出的 Windows 构建 PS1 仍遵循 mk.ps1 自身的配置，尚不消费新增 cmakeBuildTypes。Primary Debug/Release 当前只约束插件执行；导出窗口也会提示此边界。
- macOS 已用临时 C++ 工程真实验证 Release 编译；Linux/Windows 本轮仅验证参数计划，实际工具链和可见 Host 的按钮/停止操作仍需内测。
- POSIX CMake 在独立进程组启动，停止向该组发送 SIGTERM，并停止调度后续任务；Windows 仍沿用现有子进程停止方式，完整进程树取消待实机验证。Git 已完成的操作不会自动回滚。
- Windows export 失败后的细粒依赖阻断仍待完善；当前保留旧策略：汇总失败并继续编译，避免将“编译尝试”误当作导出成功。

## 真实脚本审计（迁移前基线）

| 当前阶段 | 真实实现 | 可迁移结论 | 兼容项 |
| --- | --- | --- | --- |
| 仓库预检与更新 | `Invoke-AutoBuild.ps1` 调用 Git：status、fetch、checkout、pull、submodule、LFS | 全部迁入 Wing `git-node`；已有无 shell 的 Git runner、取消、超时和退出码模型 | PS1 保留作离线命令行入口 |
| 标准 CMake | Root `tools/mk.ps1` 最终调用 `cmake -S/-B` 与 `cmake --build`，Debug/Release 分别输出到相邻 `build/<项目名><配置>` | 全部迁入 Wing `run-core/run-node`；Wing 已有跨平台 CMake target 基线 | 有自定义 `mk.ps1` 的项目可显式选择“项目脚本”回退，不再默认依赖 |
| CMake 前置导出 | 项目 `export.ps1` 调用 `Invoke-Export`，复制 `.h/.hpp/.lib/.dll` 到 `ROOT_DIR_CORE` | 抽象为声明式 copy/export provider；不能通过解析任意 PS1 猜测行为 | 未迁移的自定义 export 继续作为显式脚本节点 |
| linkCAA | `linkCAA.ps1` 组合 `linkFramework.ps1` 与 `linkWinb64.ps1`；按 `IdentityCard.h/Imakefile.mk` 发现工作区，复制 sample 入口，创建或校验 junction | 目录发现、重复框架检测、复制、link 预检/执行全部迁入 Wing Node 能力 | Windows 用 junction；POSIX 可生成等价目录 symlink 供开发检查，但不作为 CAA 编译通过证据 |
| 项目 `linkOut.ps1` | 只是调用 `linkWinb64.ps1` 并指定聚合目标 | 改成声明式 link target，不需要 PS1 | 旧脚本保留兼容 |
| CAA 编译 | 项目 `mk.ps1` 多为 Root `tools/mk.ps1` 的薄代理；Root 脚本最终在一个 `cmd.exe` 会话调用 RADE `tck_init/tck_profile/mkGetPreq/mkmk/mkrtv` | TypeScript 在 Windows 直接启动同一命令链、流式日志并按退出码判断；UI 调度不再需要 PowerShell | RADE `.bat/.exe` 是外部工具链，不承诺 macOS/Linux 可执行；未知自定义脚本保留显式回退 |
| AutoBuild 清理 | 已由 Wing preview/freeze/revalidate/execute 实现，包含完整 Git 目标快照和 Host 取消 | AutoBuild 已接线；Run 的独立递归/非 reset 模式也已接线（包后增量） | PS1 仅保留离线示例/回退；取消是命令边界协作停止 |

## 目标分层

### Wing `run-core`

- 定义仓库同步、导出、link、CMake、CAA 等节点及依赖。
- 状态统一为 `waiting / running / succeeded / failed / skipped / cancelled`。
- 生成平台无关的命令计划、环境需求、危险级别和可重试边界。
- 不读取本机文件系统，不调用 VS Code API，不拼接 shell 命令字符串。

### Wing `git-node`

- 新增仓库同步 preview/execute：读取 identity、dirty、origin、branch、HEAD。
- 缺失目录执行 clone；已有且 origin 匹配时 fetch/update；完整 commit 可固定检出。
- 继续支持递归 submodule；Git LFS 可用时执行，不可用时产生 warning 而不是误报整个任务失败。
- 所有命令以参数数组调用，错误只按启动失败、超时、取消或退出码判断。

### Wing `run-node`

- 统一进程 runner：参数数组、工作目录、环境白名单、流式 stdout/stderr、取消、退出码。
- 标准 CMake 的 configure/build/clean。
- 安全的文件复制、目录发现、junction/symlink 预览与执行。
- Windows CAA 命令链的直接执行 adapter。

### KT Auto Code

- 将 AutoBuild JSON/`BUILD_MANIFEST.json` 投影成 Wing 任务图。
- 保留 VS Code 文件选择、确认框、OutputChannel、状态栏和工作区配置。
- `脚本`继续导出 PS1 与版本归档；`启动`和任务行`运行`切换为 TS 任务图。
- `同步脚本`一直可点击；“脚本一致”只是状态，不是禁用理由。

## 分阶段实施

| 阶段 | 范围 | 切换条件 | 当前状态 |
| --- | --- | --- | --- |
| A | Wing 仓库同步 provider；AutoBuild 仓库任务改走 TS | dirty、分支缺失、origin 冲突、clone、固定 commit、submodule、LFS、取消和部分失败测试齐全 | 部分接通：Auto 已存在仓库的单行/整批 TS 更新；Wing provider 与 clone/固定检出待实现 |
| B | 标准 CMake provider；已识别 CMake 行不再要求 `mk.ps1` | 与现有 Debug/Release 输出目录和退出码语义一致；Windows/macOS/Linux 至少完成计划测试 | Auto 直接 CMake 与配置选择已接通，macOS 临时工程实编通过；Wing 提炼及三平台实机验收待完成 |
| C | linkCAA / linkOut provider | ListOnly 等价预览、重复 framework、普通目录阻挡、同目标不变、错误 link 替换均有测试 | 待实现 |
| D | 声明式 export provider | 先覆盖现有 `Invoke-Export`/`KtCore`；未知脚本必须标成“项目脚本”而非静默跳过 | 仅登记独立议题，用户要求稍后讨论；非 Windows 暂提示跳过并继续 CMake |
| E | Windows CAA 直接 runner | 同一 `cmd.exe` 环境链、编码、流式日志、停止和退出码与现有工具一致 | 待实现 |
| F | UI 默认运行时完全切到 TS，PS1 降级为导出/兼容 | 真实 Extension Host 验收、回归测试、功能迁移清单无缺口 | 待实现 |

每阶段独立提交。只有新 provider、测试和真实 UI 验收完成后，才移除对应的默认 PS1 调用；
不先删旧链路制造功能空窗。

## Git 阶段的冻结语义

1. 每个仓库独立执行；一个普通项目失败不阻止其他独立仓库。
2. dirty 且未选择强制恢复时，保留现场并把该仓库标为 `skipped`，不再把提示写成成功更新。
3. 目标不存在时，只有来源 origin 和安全目标路径都明确才允许 clone。
4. 目标存在但不是 Git、origin 不一致或路径冲突时，只阻止该仓库，并在任务行给出处理原因。
5. Root / 3rdParty 失败时只跳过依赖它们的节点；不相关项目继续。
6. Git 强制恢复仍只能从高风险清理对话框确认，普通“更新”不得隐式 reset/clean。

## CMake 阶段的冻结语义

- 默认识别依据是项目根的 `CMakeLists.txt`，不再把 `mk.ps1` 当成标准 CMake 的必需文件。
- 首轮保持当前产物目录：`<项目父目录>/build/<项目名>Debug|Release`；后续若支持 preset，作为显式 profile。
- 可选 export 是独立前置节点；失败只跳过依赖该 export 的构建。
- stdout 和 stderr 都进入同一任务日志，但 stderr 有内容不等于失败。
- 用户停止后不再创建新进程，运行中进程被取消，未开始节点标为 `cancelled`。

## 不删除的能力

- PS1 构建脚本、仓库检出脚本与 `BUILD_MANIFEST.json` 的导出。
- 单仓库、单项目、单任务运行与重试。
- Root / 3rdParty 更新开关、逐项目 branch/commit、并行编译。
- Root/tools 与 Root/sample 同步以及每个复制目标的一行日志。
- 自定义项目脚本回退；它会明确显示 provider 类型和平台限制。

## 验收证据

- Wing 各 provider 的纯计划测试、Node 临时仓库/目录集成测试、取消和失败隔离测试。
- AutoBuild 消息契约、任务状态投影、按钮可用性和 Output 日志测试。
- Preview 只验证布局和交互；真实 Extension Development Host 验证文件、Git、CMake 和取消。
- `pnpm ext:dev:prepare` 必须证明所有预期 Wing 输入来自并列仓库且 consumer `node_modules` 命中 0。
- 正式 manifest 与 lockfile 不写 `link:`、`file:` 或本地 Wing 路径。
