# Run Primary Block 可行性与实施计划

状态：current

Owner：KT Auto Code maintainers

适用版本：KT Auto Code 0.6.0

最后核验：2026-07-21

## 1. 目标

在 KT Auto Code 的共享 Primary 中增加一个独立 Run（运行）Block，与 Git 工具并列，完成以下能力：

1. 扫描一个或多个 Workspace Folder 及其子目录中的脚本、可执行文件与 `tasks.json`；
2. 按 Workspace Folder、子项目、项目类型、平台和工作目录组织可运行目标；
3. 点击后统一通过 VS Code Task/Terminal 运行，并支持状态、并发、停止与错误定位；
4. 最大限度保留现有 `problemMatcher`，让 CAA、CMake、MSVC、GCC/Clang 编译错误进入 Problems；
5. 对 CAA 子项目选择当前版本，并稳定匹配构建/运行 Task、本地 wrapper 或内置 runner；
6. 把 `ps1`、`bat/cmd`、`sh`、可执行文件和 Task 提炼为可配置的内置目标模板；
7. 在 macOS 上默认只显示 macOS 可运行目标，同时允许查看其他平台目标以调试 UI 与发现结果；
8. 评估并分阶段减少 PowerShell 依赖，明确 Phoenix Wing `run-core` / `run-node` 的职责。

本计划同时作为 0.6.0 实现与验收基线。实现不会修改或运行用户提供的参考项目；Windows CAA 的真实 MK/CNext 仍必须由用户在安装 VSIX 后手工确认。

## 2. 明确不做

- 不新增 Activity Bar Container、顶层 Run 模块、原生 TreeView、WebviewPanel 或编辑器 Tab。
- 不把 Run 的“目标 / 运行中 / 诊断”局部 Tab 解释成新的 VS Code View；它们只能存在于共享 Primary 的同一个 Run Block 内。
- 不实现通用 CI/CD、部署中心、远程进程管理器或完整终端模拟器。
- 不扫描工作区外的 `ROOT_DIR*`、`C:\DS` 或任意 PATH 目录；外部目标只能由显式配置引用并再次确认。
- 不在发现后自动运行，也不响应 `runOn: folderOpen` 自动替用户执行嵌套导入任务。
- 不自动修改 PowerShell ExecutionPolicy，不请求管理员权限，不自动 `chmod`，不调用 `sudo`/`runas`。
- 不在扫描、打开 Block 或普通刷新时自动把内置 runner 写入用户工作区；只允许用户显式“生成本地 runner”到 `.phoenix/run/`。永不写系统 PATH、用户 profile 或系统目录。
- 不承诺通过公开 VS Code API 完整重建任意第三方 task type、inline problem matcher、input/command variable 或 background readiness 语义。
- 不把 `vscode`、Webview、Task、Terminal 或确认 UI 放入 Phoenix Wing。
- 不把 `KtCore` 误判成 CAA；它是 CMake C++ 项目。CAA 版本选择只出现在有 CAA 证据的子项目。

## 3. 现有架构与能力审计

### 3.1 Auto Code Primary

- Code Ribbon 顺序来自 `extension/src/extension.ts` 中 `KtTool` 的注册顺序；当前最后一个工具是 CAA UI。
- Git 讨论稿已预留 CAA UI 之后的位置。Run 推荐成为 Git 之后的下一个 `KtTool`：`… → CAA UI → Git → Run`。
- 所有 Code 工具共享 `ktAutoCode.modulePanel` Primary Block、打开态和 MRU 恢复。Run 不需要第二套 View 协议。
- 当前 `ToolRunContext.workspaceRoot` 和 `getWorkspaceRoot()` 只表示第一个 Workspace Folder，不能满足本计划的多根/多项目运行。Run controller 必须直接消费 `vscode.workspace.workspaceFolders`，并在目标 DTO 中保存所属 folder 与 project root；不能把第一个根继续当成全局事实。
- 现有 Output Channel 可继续承载 `[Run]` 诊断；Task 自身 stdout/stderr 留在 Task Terminal。

### 3.2 `projectEnvironment` 与 `CAA_MK_VERSION`

当前实现已经：

- 读取 `ROOT_DIR`、`ROOT_DIR_3rdParty`、`ROOT_DIR_CORE`、`CAA_MK_VERSION`；
- Windows 下优先刷新当前用户/机器注册表，解决 VS Code 主进程环境陈旧问题；
- macOS 下可通过 `launchctl` 维护当前登录会话值；
- 通过 Wing `pnwResolveCaaEnvironment()` 生成结构化状态；
- 把 `CAA_MK_VERSION` 视为可选值，缺失时给出建议值 `19`。

当前实现尚未：

- 校验 CAA 版本格式或验证对应 `C:\DS\RADE<version>\intel_a` 是否存在；
- 维护“每个 CAA 子项目的当前版本”；
- 把版本映射到 `mk.ps1`、`run.ps1`、task 或内置 runner；
- 把环境快照传给某个具体 VS Code Task；
- 使用 Wing 已支持的 workspace override 参数；Auto Code 当前只传系统环境。

因此 Run 不应把下拉选择直接写回系统环境。推荐规则是：

```text
每项目显式选择 > 目标配置的固定版本 > 当前 CAA_MK_VERSION > 建议值 19
```

0.6.0 的每工程当前版本选择保存在 `workspaceState`，通过参数或 task env 只注入本次运行，不修改系统环境；machine-scoped `ktAutoCode.run.caaVersion` 只提供插件默认值。同一代码需要团队固定多个版本时，后续以显式 target/profile 表达，不能把单个当前选择写成唯一工程版本。

### 3.3 VS Code Task API 能力边界

官方 Task API 已提供：

- `tasks.fetchTasks()`：读取当前工作区可用的 `tasks.json` 与扩展 TaskProvider 任务；
- `tasks.executeTask(task)`：运行 Task，并返回可停止的 `TaskExecution`；
- `taskExecutions` 与 start/end/process start/process end 事件；
- `TaskExecution.terminate()`；
- `Task` 的 WorkspaceFolder scope、Shell/Process/CustomExecution、presentation、background、group、runOptions 与命名 problem matcher。

官方工作区模型说明，标准任务配置位于打开的 Workspace Folder 的 `.vscode/tasks.json` 或 `.code-workspace` 的 `tasks` 中。把一个大目录作为单根打开时，任意嵌套子项目的 `.vscode/tasks.json` 不能视为必然由 `fetchTasks()` 原生加载。官方多根工作区会为每个被加入的 folder 加载自己的任务。

官方参考：

- [VS Code Task API](https://code.visualstudio.com/api/references/vscode-api#tasks)
- [Tasks 文档](https://code.visualstudio.com/docs/debugtest/tasks)
- [tasks.json schema](https://code.visualstudio.com/docs/reference/tasks-appendix)
- [Workspace 与多根任务配置](https://code.visualstudio.com/docs/editing/workspaces/workspaces)
- [Task 变量替换](https://code.visualstudio.com/docs/reference/variables-reference)

关键限制：

- `Task` 构造器只接收 problem matcher 名称字符串，不能接收 `tasks.json` 的完整 inline matcher 对象；
- 从 `fetchTasks()` 获得并原样执行的 Task 能保留 VS Code 内部解析出的完整配置；手工重建任务则只能保留公开 API 能表达的部分；
- `onDidEndTaskProcess` 提供退出码，但没有底层进程的任务不会触发该事件；此时不能伪报“成功”；
- Task API 不向扩展提供通用的 Terminal stdout 回读接口；Run 日志只能记录编排与错误摘要，实际输出由 Terminal 和 Problems 承载；
- `${input:*}`、`${command:*}`、第三方 task type 与 compound/background readiness 依赖 VS Code/对应扩展的原生解析，不宜自行猜测。

### 3.4 当前仓库扫描基线

本次只读扫描在 KT Auto Code 工作区发现：

- `.vscode/tasks.json` 与 `extension/.vscode/tasks.json`；
- 命名 matcher `$esbuild` 与一个 inline background matcher；
- 用户源码范围内没有 `ps1`、`bat`、`cmd`、`sh`；
- `.phoenix/native-build` 下有大量生成可执行文件，证明发现规则必须默认排除内部缓存/构建缓存，而不能递归枚举后静默截断；
- `extensions/kt-auto-cad/bin/...` 有随扩展发布的可执行文件，证明不能笼统排除所有名为 `bin` 的目录。

## 4. 用户参考工程审计

### 4.1 `KtCore`：CMake C++

参考根：`/Users/kathy/phoenix/PNXCaaStudy/KtCore`

发现：

- 根和子目录存在 `CMakeLists.txt`，没有 `CMakePresets.json`；
- `buildAll.bat` 先 `cd /d %~dp0`，调用 `export.bat`，再以兄弟目录 `../tools/buildFunction.bat` 分别启动 Debug/Release；
- `buildFunction.bat` 使用 `cmake -S/-B`，把 build 目录放在项目父目录的 `build/<workspace><Config>`；
- `my.initial.cmake` 和 `common.cmake` 使用 `ROOT_DIR`、`ROOT_DIR_3rdParty`、`ROOT_DIR_CORE`；
- `buildAll.bat` 通过 `start ... cmd /k` 脱离父 task，导致父进程完成不等于两个构建完成，停止父 task 也不保证停止子窗口。

结论：

- 项目类型是 `cmake-cpp`，不是 `caa`；
- `buildAll.bat` 应被发现，但标记为“分离子进程/停止能力有限”；
- 推荐同时生成不脱离 Task 生命周期的内置 CMake Debug/Release 目标，使用显式 cwd/buildDir 和 matcher；
- macOS 上 `buildAll.bat` 默认隐藏，但内置 `cmake` 目标只要环境与工具可用即可显示和测试。

### 4.2 `PNXBomAnalysisWsp`：CAA

参考根：`/Users/kathy/phoenix/PNXCaaStudy/PNXBomAnalysisWsp`

发现：

- `.vscode/tasks.json` 有 `mkmk workspace` 和 `Run CNext.exe`；
- 构建任务执行 `.\mk.ps1`，cwd 为 `${workspaceFolder}`，并使用 `$msCompile`；
- 运行任务执行 `.\run.ps1`，cwd 为 `${workspaceFolder}`；
- 项目 wrapper 从 `../tools` 调用共享脚本，因此 cwd 与相对目录关系是运行契约，不是展示信息；
- `.vscode/settings.json` 使用 `C:/DS/B${env:CAA_MK_VERSION}/**`；
- CAA 目录中存在 `IdentityCard`、`Imakefile.mk`、`CNext`、`.m` 模块和 `win_b64` 等项目证据。

结论：

- 当此子项目本身是 Workspace Folder 时，优先原样执行 `fetchTasks()` 返回的任务，`$msCompile` 可完整保留；
- 当打开的是上层 `PNXCaaStudy` 时，嵌套 `.vscode/tasks.json` 需要导入，cwd 必须解释为该子项目根，不能错误替换成最外层根；
- 直接脚本与对应 task 都要可见，但默认动作优先 Task，脚本作为备用来源；
- wrapper 内部传入的目标 workspace 不能由 Run Block 静默改写；发现到歧义时展示实际参数和来源，交给显式目标配置覆盖。

### 4.3 `PNXCaaStudy/tools`：共享 runner 脚本

参考根：`/Users/kathy/phoenix/PNXCaaStudy/tools`

发现：

- PowerShell：`mk.ps1`、`run.ps1`、`common.ps1`、`clangfile.ps1`、`LinkWinb64Common.ps1`；
- 批处理：`buildFunction.bat`、`envSet.bat`；
- `mk.ps1` 的版本优先级是参数 → `CAA_MK_VERSION` → `19`；
- CAA 构建基于 `C:\DS\RADE<version>\intel_a`，preq 包含 `C:\DS\B<version>` 与 workspace；
- 构建依次调用 `tck_init.bat`、`tck_profile.bat`、`mkGetPreq.bat`、`mkmk.bat`、`mkrtv.bat`；
- 运行依次调用 `tck_init.bat`、`tck_profile.bat`、`mkCreateRuntimeView.bat`、`mkrun.bat -c cnext`；
- 多个 `call` 必须位于同一个 `cmd.exe` 会话，才能继承前序批处理设置的环境；
- 现有 PowerShell helper 会生成临时 `.bat`、以 `ExecutionPolicy Bypass` 打开额外窗口，且有创建目录、删除临时文件、删除/创建链接等不同风险操作。

结论：只提炼构建/运行所需的最小 runner，不原样复制整个 tools 目录。链接删除、批量格式化、`setx` 等能力不是 Run V1 的内置默认目标，扫描到时必须按风险规则确认。

## 5. 产品位置与交互边界

### 5.1 Ribbon 顺序

目标顺序：

```text
… → UUID → CAA UI → Git → Run
```

- Ribbon 短标题：`Run`
- 完整标题：`运行`
- 描述：`发现并运行当前工作区的 Task、脚本与可执行目标。`
- 点击只打开/切换 Run Primary Block；不在点击 Ribbon 时自动执行任何目标。
- 如果 Run 先于 Git 发布，Run 暂位于 CAA UI 后；Git 落地时插入 Run 之前，不迁移 Run 的 id、状态或配置。

### 5.2 独立 Block，不是独立模块

“独立 Run Primary Block”表示它拥有独立工具 id、状态模型、controller 和页面组件，但仍属于 Code 模块并复用统一 Primary 容器。只有未来 Run 需要独立扩展发布、多个长期并列工具或被 Code/CAD 之外模块安装/隐藏时，才重新评估顶层模块。

## 6. 目标模型与可配置内置模板

### 6.1 核心 DTO

未来实现建议冻结以下宿主无关模型：

```text
RunWorkspace
  folderUri / label / platform / remoteName / trusted

RunProject
  id / workspaceFolderUri / rootUri / relativePath / kind / evidence

RunTarget
  id / projectId / label / action / sourceKind / sourceUri
  platforms / cwd / relatedProjectRoots / program / args / envKeys
  matcherFidelity / problemMatchers / capabilities / risk / fingerprint

RunExecution
  runId / targetId / taskIdentity / state / startedAt / endedAt
  processId? / exitCode? / stopRequested / errorCode?
```

Webview 只接收脱敏 DTO 并发送 `runTarget`、`stopRun`、`refreshDiscovery`、`setPlatformFilter`、`setCaaVersion` 等语义消息；不得自行拼接命令或解析路径。

### 6.2 模板模型

`ps1`、`bat/cmd`、`sh`、可执行文件和 Task 不应散落成分支判断。使用数据驱动模板：

```text
RunTargetTemplate
  id / label / projectKinds / sourceKinds / fileNamePatterns
  taskLabelPatterns / action / platforms / cwdStrategy
  argumentTemplate / environmentTemplate / problemMatchers
  prerequisites / riskPolicy / priority
```

建议内置项：

| 模板 | 项目 | 来源 | 平台 | 默认 matcher | 用途 |
| --- | --- | --- | --- | --- | --- |
| `pnw.task.native` | 任意 | 原生 Task | Task 决定 | 原样 | 完整执行 VS Code 已解析任务 |
| `pnw.task.imported` | 任意 | 嵌套 Task | 配置决定 | 命名 matcher | 导入公开 API 可表达的任务 |
| `pnw.script.powershell` | 任意 | `.ps1` | Windows；macOS/Linux 需 `pwsh` | 通用脚本无；CAA `mk.ps1` 自动 CAA/MSVC | 兼容用户脚本 |
| `pnw.script.cmd` | 任意 | `.bat/.cmd` | Windows | 无 | 兼容批处理 |
| `pnw.script.shell` | 任意 | `.sh`/shebang | macOS/Linux | 无 | POSIX 脚本 |
| `pnw.executable.native` | 任意 | `.exe/.com` 或当前平台可执行文件 | 文件格式决定 | 无 | 直接程序 |
| `pnw.cmake.configure-build` | CMake C++ | `cmake` | 当前平台 | MSVC/GCC/Clang/CMake | 不脱离 Task 生命周期构建 |
| `pnw.caa.build` | CAA | Task/local/bundled | Windows | MSVC | mkmk 构建 |
| `pnw.caa.run` | CAA | Task/local/bundled | Windows | 无 | 创建 runtime view 并启动 CNext |

### 6.3 工作区配置

0.6.0 已落地的工程级关联设置使用资源作用域 `.vscode/settings.json`：单 CAA 工程用 `ktAutoCode.run.caaRelatedProjects`，多 CAA 子工程用 `ktAutoCode.run.caaProjects`。当前 CAA 版本、平台筛选、折叠和最近运行放 `workspaceState`；其中版本是本次运行选择，不是工程能力声明。未来版本化 target/profile 才承载团队多版本矩阵。

V1 配置必须：

- 只允许相对 Workspace Folder 的 `projectRoot`、`cwd` 与 workspace-owned program；
- 外部 program 必须显式声明并每次执行前验证；
- process/program + args 优先于 shell command string；
- 支持 `extends` 内置模板、disable、label、platforms、cwd、related project/preq roots、args、env key、problem matcher 名称与 CAA version binding；
- 用 JSON Schema 和 Wing 纯 parser 校验；未知主版本拒绝执行；
- 不保存 secret 值，只允许 `${env:NAME}` 引用；日志只显示环境变量名。

覆盖优先级：

```text
显式 run-target 配置 > 原生 Task > 项目本地脚本 > 内置 runner > 通用文件候选
```

同一实际命令不得静默去重消失。UI 选出一个“推荐来源”，其余来源放在展开区，便于比较 Task 与脚本差异。

## 7. 发现规则

### 7.1 扫描根

- 遍历 `vscode.workspace.workspaceFolders` 的每一个 folder；
- 每个 URI 保留 scheme，不把多根压成一个字符串路径；
- 本地 `file:` folder 可用 Node `lstat`/mode/magic；remote/virtual folder 只使用 `workspace.fs` 能力；
- 不跟随目录符号链接；文件符号链接只有解析后仍位于所属 Workspace Folder 才默认允许。

### 7.2 `tasks.json`

每个根扫描：

- `.vscode/tasks.json`；
- `tasks.json`；
- `**/.vscode/tasks.json`；
- `**/tasks.json`。

分类：

1. `native`：能与 `fetchTasks()` 的 scope/source/name/definition 稳定对应；
2. `nested-imported`：VS Code 当前没有原生加载，但属于工作区的子项目配置；
3. `nonstandard`：不在 `.vscode` 下，仅作为候选配置展示，必须通过 schema 后才允许导入。

解析必须使用 JSONC parser，支持注释、尾逗号、platform override，并保留文件位置诊断。禁止用 `JSON.parse()` 假装完整支持 `tasks.json`。

### 7.3 脚本与可执行文件

- 名称扩展：`.ps1`、`.bat`、`.cmd`、`.sh`、`.exe`、`.com`；Windows 比较不区分大小写；
- macOS/Linux 本地文件额外检查 executable mode；无扩展名文件可用 shebang 或 Mach-O/ELF magic 分类；
- `.sh` 即使没有执行位也可作为“解释器运行”候选，但不得自动 `chmod`；
- macOS 的 `pwsh` 探测成功后可显示通用 PowerShell 脚本，但含 `cmd.exe`、Windows 盘符、`.bat` 或 CAA Windows 证据的脚本仍归为 Windows-only；
- remote/virtual workspace 无 mode 时只发现有明确扩展名、Task 或显式配置的目标；不做全文件下载探测。

### 7.4 默认排除与上限

硬排除：

```text
.git/**
node_modules/**
.pnpm-store/**
.phoenix/cache/**
.phoenix/native-build/**
常见包管理器/IDE 私有缓存
```

不笼统排除 `bin`、`build`、`dist`、`out`、`target`，因为这些目录可能包含用户真正要运行的产物；它们作为“生成产物”低优先级分组，并受数量/大小上限控制。

每根设置独立的目录、文件、tasks 文件和候选上限。达到上限时结果状态必须是 `incomplete`，显示被截断的类别和建议配置 exclude，不能把部分结果冒充完整扫描。

### 7.5 子项目识别

使用证据评分，不依赖目录名唯一判断：

| 类型 | 高权重证据 | 辅助证据 |
| --- | --- | --- |
| CMake C++ | `CMakeLists.txt`、`CMakePresets.json` | `.sln/.vcxproj`、`common.cmake`、构建 task |
| CAA | `IdentityCard`、`Imakefile.mk`、`.m` 模块、`CNext` | `win_b64`、mkmk/CNext task、`mk.ps1/run.ps1`、CAA env 引用 |
| 通用 | 显式 task/script/executable | package/README/目录标记 |

当 CAA 目录内部还含 CMake 工具时允许多标签，但 CAA 版本控件只作用于 CAA target。`KtCore` 的 `CMakeLists.txt` 与 `buildAll.bat` 不能仅因位于 `PNXCaaStudy` 下就继承 CAA 类型。

一旦强证据把 project 识别为 CAA，`内置`组就固定生成两个独立目标：`MK` 与 `Run`，两者都明确使用 VSIX bundled runner。发现到的 task、`mk.ps1` 或 `run.ps1` 继续在 Tasks/自定义组显示；即使已有同动作 Task，也不隐藏内置 `MK/Run`，避免来源被静默合并并为 macOS 的跨平台试运行保留稳定入口。

### 7.6 cwd 规则

优先级：

1. 原生 Task 自身已解析的 `options.cwd`；
2. 嵌套 Task 中相对其 project root 解析的 `options.cwd`；
3. 显式 `.phoenix/run-targets.json`；
4. CAA/CMake 内置模板的 project root；
5. 普通脚本/可执行文件所在目录。

确认框、详情和日志始终显示最终 cwd。路径包含空格、中文、正反斜杠时必须通过参数数组/强引用传递。参考工程中的 `../tools/...` 证明 cwd 不能被“统一改为最外层工作区”或“统一改为脚本目录”。

## 8. 平台过滤与 macOS 调试

### 8.1 实际平台

任务实际运行平台以 Extension Host 所在环境为准：

- `process.platform`：`win32` / `darwin` / `linux`；
- `vscode.env.remoteName`：本地、SSH、WSL、Dev Container 等；
- Workspace URI scheme：本地或 virtual/remote 能力。

不能只用 UI 所在 Mac 判断远程 Task 的平台。

### 8.2 默认筛选

Run Block 顶部提供：

```text
平台：macOS（本地）     [✓ 只看当前系统]
```

- 默认开启，只显示当前宿主能执行的目标；
- 关闭后显示所有已发现目标，其他平台目标使用固定尾部 badge `仅 Windows` / `仅 Linux`；
- 每个目标行都有显式动作：当前平台兼容时显示 `运行`，其他平台时显示 `试运行`，已运行时显示 `停止`；其他禁用原因或未信任工作区显示禁用的 `不可用`；
- `试运行` 只写 `[Run][trial]` 脱敏诊断，不调用 Task API、不创建 Terminal、不启动脚本或可执行文件；
- 筛选保存在 workspaceState，不写业务配置。

### 8.3 开发预览

Mac 开发机上的“显示全部平台”用于检查：

- CAA 版本 selector；
- `.ps1/.bat/.cmd/.exe` 图标、排序和禁用态；
- 相对路径、cwd、matcher fidelity、安全确认摘要；
- Windows/Linux 错误说明。

它只改变 ViewModel 过滤。单元测试可向纯 core 注入 platform fixture；生产执行器永远使用真实平台，不接受 UI 伪造平台。

其他平台目标的 `试运行` 用于验证“发现是否正确、将要执行什么”，日志至少包含：

- 当前平台与目标支持平台、是否兼容；
- bundled CAA 目标按其支持平台构造但绝不执行 launch plan，使日志显示真实 runner/program/args，而不是误标为 native task；
- project identity 与 target identity；
- cwd、来源类型和风险等级；
- program/args 的单行脱敏摘要；
- matcher、matcher fidelity 与只记录环境变量名的 `envKeys`；
- disabled reason（若存在）。

敏感参数按 `password`、`passwd`、`secret`、`token`、`api-key` 等键名替换为 `<redacted>`；workspace URI/绝对路径替换为 `<workspace:name>`，用户根替换为 `<home>`；换行和制表符折叠，单项长度受限。试运行不能绕过 Workspace Trust、平台约束或安全确认进入真实执行路径。

## 9. VS Code Task 执行与 problem matcher

### 9.1 统一执行路径

优先使用 `vscode.tasks.executeTask()`：

- 原生 `tasks.json`：执行 `fetchTasks()` 返回的原 `Task`；
- 直接脚本/可执行文件：构造 `ProcessExecution` 或参数化 `ShellExecution` 的 `Task`；
- CAA/CMake 内置 runner：构造稳定 `TaskDefinition` 的 Task；
- 嵌套简单 task：通过 Run TaskProvider/adapter 构造 Task；
- 只在公开 Task API 无法表达且需求明确时评估 `CustomExecution`，不能因为方便而绕过 Task Terminal/Problems。

`window.createTerminal().sendText()` 不作为默认执行方式，因为它难以可靠绑定运行身份、退出码、matcher 和停止操作。

### 9.2 保真等级

| 来源 | 执行方式 | matcher | depends/input/custom type | UI 标记 |
| --- | --- | --- | --- | --- |
| 当前工作区原生 Task | 原对象 `executeTask` | 完整 | 交给 VS Code/提供者 | `原生 Task` |
| 嵌套 shell/process + 命名 matcher | 构造 Task | 完整保留名称 | 支持受限子集 | `导入 Task` |
| 嵌套 inline `{base: ...}` | 不静默转换 | override 无法完整表达 | 要求原生化或显式降级 | `matcher 降级` |
| 嵌套完整 inline matcher | V1 可执行但不宣称进入 Problems，或直接阻断构建类目标 | 不可保留 | 打开配置/加入多根 | `需原生 Task` |
| 直接脚本/可执行文件 | 生成 Task | 内置/配置命名 matcher | 不适用 | `生成 Task` |
| 第三方 task type | 只有已原生解析时执行 | 原样 | 依赖对应扩展 | `提供者 Task` |

任何降级必须在运行前、详情和日志中同时出现。不得把一个 inline matcher 丢掉后仍显示“Problems 已启用”。

### 9.3 CAA/CMake matcher

- 参考 CAA 构建 task 的 `$msCompile` 原样保留；
- 没有 `tasks.json` 时，只要 project evidence 与文件名/调用形状共同确认目标是 CAA build，直接发现的 `mk.ps1` 也必须包装成生成 Task，并自动挂接扩展自带、版本化的 CAA/MSVC matcher；用户不需要为“错误进入 Problems”补一份 task 配置；
- 自动 matcher 只用于强 CAA build 分类，不能给任意同名 PowerShell 脚本套 MSVC 规则。用户自定义目标通过 `problemMatchers` 显式覆盖；
- 内置 CAA build 默认挂接经过 fixture 验证的 MSVC matcher；
- 即使没有发现 `mk.ps1` 或 CAA build task，识别到的 CAA project 仍显示固化“CAA 构建”入口；该入口通过 VSIX 内置 runner 执行厂商 batch 链，并挂接同一个 CAA/MSVC matcher；
- 内置 CMake build 根据 generator/toolchain 挂接 MSVC 或 GCC/Clang matcher，并补 CMake configure/error matcher；
- matcher 的 `fileLocation` 必须相对目标 project root/cwd，而不是永远相对最外层 Workspace Folder；
- background task 的 begins/ends pattern 属于 readiness 协议，不能只复制 regexp；
- matcher 只解析 Terminal 输出。若工具把诊断写入文件，runner 必须明确把需要匹配的行输出到 stdout/stderr，或另设受控 diagnostics adapter。

### 9.4 compound task

- 原生 compound task 原样交给 VS Code；
- 嵌套导入 compound task先验证 `dependsOn` 标签都存在并检查循环；
- parallel 子任务可分别执行并聚合状态；
- sequence 必须等前一项真正结束；
- sequence 中若有 background task，只有可保留并识别其 background matcher readiness 才允许继续，否则标为“需原生 Task”；
- 参考根 `PNXCaaStudy/.vscode/tasks.json` 中存在 compound/label 变化样本，fixture 要覆盖失配标签，Run 只报告，不自动纠正名称。

## 10. CAA 当前版本与目标匹配

### 10.1 版本选择

每个 CAA project group 显示独立 Combo：

```text
当前 CAA 版本  [19 ▾]  来源：系统环境
```

候选来自：

- 项目最近选择；
- `CAA_MK_VERSION`；
- task/config 中的固定版本；
- 在配置中声明的可用版本；
- 默认建议 `19`。

版本值只允许安全 token，例如 `[A-Za-z0-9._-]+`；路径分隔符、引号、换行和 shell 元字符拒绝。

### 10.2 匹配顺序

对 action `build` / `run` 分别匹配：

1. 显式 `.phoenix/run-targets.json` binding；
2. 版本已固定且完全匹配的原生 Task；
3. 通用原生 Task，且所选版本等于其实际环境版本；
4. 能安全注入版本的嵌套 task/共享 `tools/mk.ps1` 或 `tools/run.ps1`；
5. 项目本地 `mk.ps1` / `run.ps1` wrapper；build wrapper 生成 Task 时自动附加 CAA/MSVC matcher；
6. VSIX 内置 CAA runner。

若所选版本与原生 Task 实际环境不一致，不能假装 Task 会使用下拉值。系统应切换到能显式传版本的目标，或要求用户更新工程环境后再执行原生 Task。

上述顺序用于推荐实际来源，但不删除其他明确来源。只要 project 被识别为 CAA，`内置`组的 bundled `MK` 与 bundled `Run` 始终同时存在；Task/脚本来源可并列显示并成为推荐执行来源，用户仍能直接选择内置 runner。

### 10.3 CAA 预检

构建：

- `C:\DS\RADE<version>\intel_a`；
- `tck_init.bat`、`tck_profile.bat`、`mkGetPreq.bat`、`mkmk.bat`、`mkrtv.bat`；
- `C:\DS\B<version>` 与 project root；
- 用户选择的关联工程/Preq 目录都存在、去重且通过 workspace/外部路径边界确认；
- `ROOT_DIR*` 必需值与目录状态；
- matcher 与 cwd。

运行：

- `tck_init.bat`、`tck_profile.bat`、`mkCreateRuntimeView.bat`、`mkrun.bat`；
- project root；
- 当前是否已有同项目 CNext run；
- 版本/profile `V5R<version>_B<version>`。

预检只读；缺失时输出具体路径类别与修复入口，不尝试下载、创建厂商目录或修改系统环境。

### 10.4 `MK` 关联工程/Preq 目录

参考 `tools/mk.ps1` 的 `-Workspace` 最终加入 `mkGetPreq -p`。Run 模型必须把它从 cwd 和“当前要构建的 project root”中拆开：

```text
currentProjectRoot：当前执行 mkmk 的工程
cwd：命令工作目录
relatedProjectRoots：提供给 mkGetPreq 的关联/前置工程目录
```

UI 在 CAA project 的 `MK` 详情中提供“关联工程”：

- 从当前 Workspace 已发现项目多选；
- 显式选择一个或多个目录；
- 显示工作区相对路径和完整 tooltip；
- 排序稳定、规范化后去重；
- 工作区外目录标高风险并再次确认；
- 不把目录文本直接拼到 shell，尤其拒绝分号、换行等注入；由 runner 以重复参数或结构化 spec 接收，再安全生成厂商需要的 preq 列表。

provider 兼容：

- 原生 Task/旧 wrapper 若已固定 `-Workspace`，默认原样执行并只读展示，不能暗中覆盖；
- 需要改变或传入多项时，选择可安全注入参数的共享脚本或 VSIX/`.phoenix` runner；
- 展示 provider 与执行 provider 必须分离：关联目录不能把 Tasks 行重分类为内置行；若当前 MK 动作明确需要多项 Preq，点击运行或试运行时才选择 bundled provider，并在确认框和 `[Run][preflight]` / `[Run][trial]` 中明确记录实际来源；
- 每个 CAA project 的稳定展示不受关联目录数量影响：`tasks.json` 中的 MK/Run 仍属于 Tasks，产品提供的 bundled MK/Run 仍各只有一项；
- 0.6.0 把选择写入资源作用域 `ktAutoCode.run.caaRelatedProjects`，相对当前 project root 保存；未来 `.phoenix/run-targets.json` 只在复杂目标 schema 获批后承载 target-specific 覆盖；
- 关联目录变化属于运行指纹变化，必须重新确认并写入 `[Run][preflight]` 脱敏摘要。

### 10.5 多 CAA 子工程批量运行：后续讨论

V1 只为每个 CAA project 独立提供 `MK` 与 `Run`，不自动生成“全部构建”或“全部运行”。仓库已经显式定义且能被 VS Code 原生解析的 compound Task 仍按原任务显示/执行。

### 10.6 TODO：Headless CI/CD 与无项目脚本运行（不在当前插件范围）

> 状态：只保留讨论与接口边界，当前不实现 CLI、批量调度或 CI Runner 导出。这项能力不一定属于 VS Code 插件；后续应作为独立 CI/CD 课题评审，插件只作为可能的配置编辑、验证或导出入口。
>
> 独立 TODO 记录见 [Phoenix Wing CLI 与 CAA CI/CD](TODO-Wing-CLI与CAA-CICD.md)。

已确认的长期所有权：Phoenix Wing 是 CAA 命令与批处理算法的唯一实现和发布边界。其他消费者应能直接依赖 Wing 完成 CAA MK，不需要安装或定位 KT Auto Code。插件中现有 `resources/run/` 是 0.6.0 的过渡消费资产；公共 contract 稳定后，应迁入 Wing 的可发布 package/resource，并由 Auto Code 通过 Wing API 解析，而不是长期复制两份 runner。

目标场景是 Windows CI Agent 检出多个 CAA 工程后，即使工程中没有 `mk.ps1`、`run.ps1` 或项目 `.bat`，仍能使用与插件相同的版本解析、Preq 关系和厂商 batch 链完成自动编译。CI 不能依赖 VS Code `workspaceState`，也不能通过搜索扩展安装目录把 VSIX 内部路径当成稳定 API。

候选方向（未立项）：

1. `ktc-run` headless CLI：独立发布或作为固定工具缓存安装，复用 `run-core/run-node` 的发现、目标模型、CAA launch plan 与校验逻辑，不加载 `vscode`；
2. “导出 CI Runner”：由插件或 CLI 显式生成 `.phoenix/run/ci/ktc-caa-runner.cmd`、runner manifest、版本/hash 和 profile 示例。生成是用户动作，不在普通扫描或打开 Block 时写文件；已修改副本不静默覆盖。

建议的团队可见 profile 使用 workspace-relative 路径与显式版本矩阵，不保存本机 `C:\DS` 绝对安装路径：

```jsonc
{
  "version": 1,
  "targets": [
    { "id": "bom", "project": "PNXBomAnalysisWsp", "caaVersions": ["22"] },
    { "id": "curve", "project": "PNXCombinedCurveWsp", "caaVersions": ["22"], "preq": ["bom"] }
  ]
}
```

批量执行必须：

- 校验并按 `preq` 有向无环图拓扑排序，循环依赖直接失败；
- 每个 project/version 生成独立执行指纹、Terminal/文件日志和真实退出码；
- 支持 `fail-fast` 与 `continue-on-error`，但最终进程退出码必须反映失败；
- 允许输出 JUnit/SARIF 或 CI provider annotation，使 MSVC/CAA 错误在流水线可定位；不能把 VS Code Problems 当成 CI 接口；
- 参数优先级为 CLI/profile 显式版本 > CI 环境变量 `CAA_MK_VERSION` > 受控默认值；不读取 VS Code User Settings 或 `workspaceState`；
- 继续禁止 `setx`、系统 profile 写入和后台脱离进程。`CAA_MK_VERSION` 只注入当前 child process，厂商 `.bat` 仍在同一个 `cmd.exe` 会话中 `call`；
- runner manifest 记录 schema、工具版本与资源 hash，流水线可验证生成物没有漂移。

若未来立项，建议顺序是：先把现有单项目 bundled CAA runner 固化为无 VS Code 依赖的公开 launch contract；再评估 CLI 的 `discover/plan/run`；随后实现 profile DAG 与批量构建；最后再决定是否需要插件“导出 CI Runner”入口和 Windows 实机流水线 fixture。0.6.0 只交付单项目插件入口，不宣称已完成或正在实现批量 CI 编排。

可复用配置边界：

- 可以复用显式、团队可见、workspace-relative 的 CAA project/profile schema，例如版本矩阵、Preq 依赖和目标 ID；
- 可以复用 `run-core/run-node` 的纯发现、版本解析、安全校验和 launch plan；
- `ktAutoCode.run.caaVersion` 是本机默认值，Run 当前项目选择在 `workspaceState`，两者都不能作为 CI 的隐式事实来源；
- `ktAutoCode.run.caaProjects` / `caaRelatedProjects` 中可迁移的相对路径数据可以作为未来“导出 profile”的输入，但 CI 应消费独立、显式、可审查的配置文件；
- CAA 安装路径、Agent 凭据和其他机器集成继续由 CI secret/environment/toolchain 配置提供，不写入仓库。

Wing 最终拆分边界：

- `run-core`：不访问文件系统、不启动进程；承载 CAA target/profile schema、版本优先级、Preq DAG、拓扑排序、循环检测、批量策略、风险模型、执行指纹和结构化 command spec；
- `run-node`：承载本地 CAA 工程发现、RADE/厂商脚本预检、runner 资源定位或导出、command spec 到 Node process launch plan 的转换，以及跨消费者一致的日志/退出码归一化；
- 可选 `run-cli`：只做参数/profile 输入、调用 Wing API、信号处理和输出格式，不复制发现、批处理或命令拼装算法；是否单独立项由 CI/CD 课题决定；
- Auto Code：只保留 Workspace Trust、VS Code Task/Terminal/Problems、Primary UI、确认框及配置编辑 adapter；不得成为 Wing 执行链的反向依赖。

建议形成版本化公共 API，例如 `pnwDiscoverRunWorkspace`、`pnwCreateBundledCaaLaunchPlan`，以及未来的 `pnwCreateCaaBuildGraph`、`pnwPlanCaaBatch`、`pnwExportCaaRunner`。公共 API 返回结构化计划，不返回需要消费者自行拼接的 shell 字符串；runner 资产必须进入 Wing package 的打包与 hash 门禁。Auto Code、独立 CLI 和至少一个非插件 fixture 应共同作为消费者契约测试，防止算法再次只适配 VS Code。

后续单独冻结：

- build 是顺序还是限流并行、依赖图和失败后是否继续；
- 多工程能否选择不同 CAA version；
- `Run All` 是否允许同时启动多个 CNext/runtime view；
- stop all、部分失败、Problems 聚合和重试语义；
- 是否只允许显式项目清单，避免新发现子项目自动加入批量执行。

## 11. 内置 runner 的安装位置与改进方案

### 11.1 VSIX 内位置

推荐发布结构：

```text
extension/resources/run/
  runner-manifest.json
  windows/
    caa-build.cmd
    caa-run.cmd
  posix/
    shell-runner.sh        # 只有出现公共前后处理需求时才增加
```

- 源资源可由 Wing `run-node` 包提供，Auto Code 构建时复制到上述 VSIX 路径；
- 运行时只通过 `context.extensionUri` / `context.asAbsolutePath()` 定位；
- 不依赖工作区相对位置，不依赖开发仓库中的 `../phoenix-wing`；
- `.vscodeignore` 和 artifact verifier 必须明确允许并校验 manifest、文件列表、hash、license 与禁止意外敏感内容；
- Registry 与本地 Wing 构建都验证 runner 来源，不能把本机绝对路径写入 bundle/manifest。

扩展安装目录视为只读。runner 不得在自身目录生成配置、日志、临时 `.bat` 或缓存。

### 11.2 临时与状态目录

- 需要跨进程的单次 spec 放在 `ExtensionContext.storageUri/run/<runId>/`；
- 纯临时命令文件使用安全的系统 temp 子目录，并在 Task 结束后 best-effort 清理；
- 文件名使用不可预测 run id，权限尽量限制到当前用户；
- 清理失败只记录，不递归删除宽泛目录；
- 扩展升级/卸载后遗留清理由下次激活针对自己的固定子目录执行，不扫描任意 temp。

### 11.3 不原样复制参考脚本

内置 runner 改进要求：

- 参数化 DS 根、version、current project 与一个或多个 related/preq project roots，不固定某个开发机路径；
- 所有厂商 batch 先逐项存在性检查；
- 同一 `cmd.exe` 中使用 `call`，并用 `&&`/显式 errorlevel 在第一处失败时退出；
- 退出码逐层透传，stdout/stderr 不吞掉，便于 matcher；
- 不 `start cmd /k` 脱离 Task；
- 不修改 ExecutionPolicy；
- 不写 `setx`，只使用本次 Task env；
- 不硬编码 `C:\temp`；
- 响应 Task terminate，避免继续派生不可追踪窗口；
- 输出稳定的阶段标记和普通编译行，不用颜色控制字符破坏 matcher；
- destructive link/delete/format 能力不进入 CAA build/run runner。

### 11.4 可选 `.phoenix` 本地 runner

默认路径是直接执行 VSIX 内置 runner，做到“识别 CAA 后已有 `MK/Run`”，不要求 task、项目脚本或首次生成文件。

为方便调试和二次修改，目标详情可提供显式动作“生成本地 runner”：

```text
.phoenix/run/
  manifest.json
  <project-id>/
    caa-build.cmd
    caa-run.cmd
```

规则：

- 生成前原生确认，列出将写入的相对路径与 Git 状态影响；
- runner 必须自包含或使用稳定配置，不能把当前 VSIX 安装绝对路径写入脚本；
- `manifest.json` 记录 schema、template version、source hash、project binding 与生成时间，不保存环境值；
- 原子写入；同 hash 重复生成无变化；文件被用户修改后不覆盖，只提供 diff/另存/继续使用旧版；
- `.phoenix/run-targets.json` 可把该 project 的 `MK/Run` provider 固定为 local runner；
- 不自动修改 `.gitignore`。是否提交或忽略由用户决定；
- 删除本地 runner 后自动回退 VSIX 内置 runner，不影响逻辑入口；
- 本地 runner 视为 workspace-owned executable，修改后确认指纹失效；
- 这只是可选调试/定制路径，不能成为 CAA 可运行的前置条件。

## 12. 是否摆脱 PowerShell与 Wing 分包结论

### 12.1 结论

推荐“内置 CAA 主路径摆脱 PowerShell，用户脚本兼容不移除”。原因：

- PowerShell ExecutionPolicy 与 Windows PowerShell/pwsh 差异会增加安装支持成本；
- 当前 CAA 最终仍调用厂商 `.bat`，用一个受控 `cmd.exe` 会话更直接，也更容易保持环境与退出码；
- 项目自己的 `.ps1` 仍是重要发现目标，不能因为内置 runner 改造而隐藏或禁用；
- macOS/Linux 不因此获得 CAA 能力，CAA 厂商链仍明确为 Windows-only。

### 12.2 `@phoenix-wing/run-core`

在真正开始实现 Run 时建立，不提前建空包。职责：

- Run DTO、schema、target/template 配置解析；
- project/candidate 分类、排序、去重和 platform compatibility；
- CAA version 选择与目标匹配；
- cwd/path 纯校验、风险分级、确认指纹输入；
- 状态机与脱敏诊断模型；
- 参考 fixtures 的纯测试。

禁止依赖 Node、VS Code、DOM、Vue 或进程 API。公共 API 使用 `pnw*`、`Pnw*`、`PNW_*`。

### 12.3 `@phoenix-wing/run-node`

只在以下内容同时落地时建立：

- Auto Code 是实际消费者；
- 本地 fs 扫描、mode/shebang/magic、hash 与 runner asset manifest 有稳定契约；
- CAA/CMake launch plan 已有 Windows fixture 与退出码测试；
- 包输出 JavaScript/`.d.ts`，assets 进入 npm tarball 并能被 VSIX 构建校验。

职责：

- Node 本地文件发现 adapter 与 executable metadata；
- runner asset manifest、hash 与可定位资源；
- 从 core target 生成宿主无关的 process/shell launch spec；
- 可选的内置 `.cmd/.sh` assets。

它不直接管理 VS Code Task、Terminal、Problems、workspaceState、确认框或 Primary，也不应绕过 `vscode.tasks.executeTask()` 自行在后台 spawn 一个不可见进程。

### 12.4 Auto Code adapter

保留：

- Workspace Folder/Trust/remote 能力；
- `fetchTasks`、TaskProvider、`executeTask`、Task events 和 terminate；
- Primary ViewModel、Webview 消息与原生 modal；
- Output Channel、Problems/Terminal 导航；
- VSIX asset copy/resolve 与配置存储。

## 13. Primary UI 草图

UI 可以借鉴 Task Manager 插件的分组折叠树和 CMake 主要命令列表，但不能复制其独立 `TASK MANAGER: TASKS` View。Auto Code 只在现有 `ktAutoCode.modulePanel` 中渲染一个 Run Web Component。

默认 macOS、只看当前系统：

```text
┌ 运行 ───────────────────────────────────── ↻  ⋯ ┐
│ PNXCaaStudy · 2 个项目     macOS [✓ 当前系统] │
│ [目标] [运行中 1] [诊断 2]                      │
│ [搜索目标…]                                    │
├ ▾ KtCore · CMake C++ ────────────────────────┤
│   ▾ CMake                                      │
│     ▶ 配置 Debug                              │
│     ▶ 构建 Debug · CMakeLists.txt     Task 构建 │
│     ▶ 测试                              Task    │
│     ▶ 清理                              Task    │
│   ▸ Tasks                                      │
│   ▾ 自定义                                     │
│       buildAll.bat · KtCore/…        仅 Windows │
├ ▾ PNXBomAnalysisWsp · CAA ───────────────────┤
│   当前版本 [19 ▾]  关联工程 [1 ▾]   仅 Windows │
│   ▾ Tasks                                      │
│       mkmk workspace · .vscode/tasks.json Task │
│       Run CNext.exe · .vscode/tasks.json  Task │
│   ▾ 内置                                       │
│       CAA 构建（mk/mkmk）       $msCompile Win │
│       CAA 运行（run/CNext）                 Win │
└────────────────────────────────────────────────┘
```

关闭“当前系统”后的 Windows 开发态：

```text
PNXBomAnalysisWsp · CAA        当前版本 [19 ▾]
▶ 构建（推荐：原生 Task）  $msCompile  cwd: project
▶ 运行 CNext（推荐：原生 Task）          cwd: project
▸ 其他来源：mk.ps1 / run.ps1 / 内置 runner
```

### 13.1 同一 Block 内的树与可选 Tab

默认使用一棵自定义折叠树，项目下只保留四类分组：

| 分组 | 内容 |
| --- | --- |
| `CMake` | 配置/生成、构建、测试、清理；安装等动作只在 preset、target 或显式配置证明存在时显示 |
| `Tasks` | 当前项目 `tasks.json` 中可运行的原生或受限导入任务 |
| `自定义` | `.phoenix/run-targets.json` 与用户显式固定的脚本/可执行文件 |
| `内置` | 产品固化的少量目标；每个已识别 CAA project 无条件固定 `MK`（mk/mkmk）和 `Run`（run/CNext） |

项目根存在 `.clang-format` 时，`内置`组再显示一个跨平台 `Clang Format`；不存在时不生成。它使用 VSIX 中的 Node runner 递归处理 C/C++ 文件并跳过构建、生成、依赖与工具目录，项目自己的 `clangfile.ps1` 仍作为独立自定义来源。任一分组在当前平台过滤后为 0 项时不渲染节点；非 0 节点默认展开。

所有紧凑管理行统一使用连续的 `文件名 · 相对路径` 标签：名称和路径可以用不同字重/颜色，但必须处在同一个弹性截断容器内，只允许整串在最右端出现一次省略号；状态、matcher、平台与动作按钮位于固定右侧尾部。

不把扫描到的每个文件都做成常驻按钮。普通脚本/可执行文件只有被 task、模板或自定义配置选中时进入主树；其余候选放在“添加自定义目标”选择器中。

当项目超过 3 个、目标超过 20 个、存在运行项或存在发现/预检错误时，可以在同一 Block 内启用局部 Tab：

- `目标`：项目与四类分组树；
- `运行中`：本 Block 启动的 active execution 和短期历史；
- `诊断`：发现/预检/matcher/启动错误摘要，以及“打开输出/Problems”。

Tab 只是 `tablist/tab/tabpanel` 的局部状态，不新增 VS Code View。树使用 `tree/treeitem`、方向键、Enter 展开/运行与明确 focus ring。折叠、搜索和当前 Tab 是页面瞬态状态；Host 状态更新应原位更新节点，避免重建 DOM 后丢失滚动与展开状态。

### 13.2 行布局

遵守仓库 compact manager 规则：

- 左侧只有一个连续 `目标名 · 相对路径` flexible label，整体省略；
- 文件名可 semibold、路径可次级文字，但仍在同一 truncation container；
- 平台、来源、matcher、状态放固定右侧 tail；
- 行内动作按 VS Code 惯例在鼠标悬停或键盘焦点进入时出现：兼容目标显示 `运行`，跨平台目标显示 `试运行`，并与 `打开来源` 箭头同时出现；
- 项目和分组按当前可见目标数初始化展开态：数量大于 `0` 默认展开，`0 项` 默认折叠；切换平台筛选后按新的可见数量重新计算；
- `title` 与 `aria-label` 保留完整路径、cwd 和禁用原因；
- section 使用全宽边框与很小内 padding，不做卡片式外部横向留白；
- 运行列表有固定最大高度并独立滚动，不能无限拉长 Primary。

### 13.3 详情与动作

展开目标显示：

- 来源文件、project root、cwd、平台、program/interpreter；
- 脱敏 args、环境变量名、CAA version；
- problem matcher 与保真等级；
- 风险、指纹、缺失依赖和不能执行原因；
- `运行`、`试运行`、`停止`、`打开来源`、`打开输出`、`打开 Problems`。

Block `…` 菜单：

- 刷新发现；
- 只看当前系统；
- 显示生成产物；
- 打开/创建 Run 配置；
- 打开 KT Auto Code 输出；
- 打开 Problems；
- 复制运行诊断；
- 停止本 Block 全部任务（有运行项时显示）。

## 14. 安全确认

### 14.1 Workspace Trust

- 未信任工作区允许只读发现和查看；
- 所有执行按钮禁用，并提供使用 VS Code Workspace Trust 的说明；
- 获得 trust 后重新预检，不复用未信任阶段的确认。

### 14.2 首次/变更确认

首次运行 workspace-owned target 显示原生 modal：

```text
运行“mkmk workspace”？
来源：PNXBomAnalysisWsp/.vscode/tasks.json
平台：Windows
工作目录：PNXBomAnalysisWsp
版本：19
Problems：$msCompile（完整）
```

记忆确认以 `workspace identity + target id + source hash + cwd + program/args + platform + version/matcher` 指纹为单位。文件、配置、cwd、参数、runner hash 或版本变化后重新确认。

### 14.3 高风险目标

以下不允许“永久不再询问”：

- 删除/清理/格式化磁盘、链接替换、`git clean/reset`；
- `setx`、注册表、profile、系统环境持久修改；
- `sudo`、`runas`、管理员/elevation；
- publish/deploy/install/签名；
- 工作区外 program、UNC/网络路径、越界 symlink；
- shell command string 含重定向、管道、命令替换或多命令；
- 会 `start`/detach 的脚本。

静态风险识别只是提醒，不能声称能证明任意脚本安全。用户仍可打开来源检查。

### 14.4 参数与秘密

- `ProcessExecution` 优先使用 program + args；
- shell task 保留其原始 shell 语义，不在 Webview 拼字符串；
- 日志/复制诊断只显示 env key，值按 secret/token/password/key 等规则脱敏；
- 不记录 remote URL credential、完整 PATH 环境或项目源码内容；
- 配置中的 `${env:*}` 在 Extension Host/Task adapter 解析，Webview 不接收值。

## 15. 状态、并发与停止

### 15.1 状态机

```text
idle → preflighting → awaiting-confirmation → queued → starting → running
                                                       ↘ failed-to-start
running → stopping → terminated
running → succeeded | failed | ended-unknown
```

- 有 process end 且 exit code `0` 才标 `succeeded`；
- 非零标 `failed`；
- terminate 后 exit code 可能 undefined，标 `terminated`；
- 只有 Task end、没有 process result 时标 `ended-unknown`，不能显示绿色成功；
- background task 保持 `running`，直到 Task end/terminate；
- UI 状态来自 Host，不从 Terminal 文本猜测。

### 15.2 并发

- 不同 project target 可并行；
- 同一 target 默认只允许一个实例，原生 Task 的 `instanceLimit` 原样尊重；
- 同一 CAA project 的 build 与 run 默认互斥，除非显式配置允许；
- compound task 的子运行在“最近运行”中可展开；
- 扫描刷新不能丢失进行中的 execution 映射。

### 15.3 停止

- 单项调用对应 `TaskExecution.terminate()`；
- 立即进入 `stopping`，等待 end event；
- 超时后显示“停止结果未知”，不自动使用 `taskkill /F`、`kill -9` 或递归杀进程树；
- “停止全部”只终止 Run Block 创建/认领的 execution，并二次确认；不停止用户从其他入口启动的 task；
- 对 `start cmd /k` 等已知 detach 目标预先显示“停止能力有限”。

## 16. 日志、Problems 与诊断

### 16.1 Output Channel

每次用户点击至少输出：

```text
[Run][preflight] target=... platform=darwin compatible=false reason=platform-mismatch
[Run][trial] execute=false target=... project=...
[Run][trial] currentPlatform=darwin supported=win32 compatible=false
[Run][trial] source=native-task cwd=<workspace>/... risk=build
[Run][trial] command=powershell.exe -NoProfile -File <workspace>/mk.ps1
[Run][trial] matcher=$msCompile fidelity=native envKeys=CAA_MK_VERSION
[Run][start] runId=... source=native-task project=... cwd=<workspace>/...
[Run][start] version=19 matcher=$msCompile fidelity=full envKeys=CAA_MK_VERSION,...
[Run][state] runId=... starting -> running processId=...
[Run][state] runId=... running -> failed exitCode=1 durationMs=...
[Run][error] code=missing-interpreter action="安装 pwsh 或改用当前平台脚本"
```

要求：

- 使用稳定 error code + 中文说明 + 下一步；
- 绝对 workspace root 在“复制运行诊断”中替换为 `<workspace:name>`；
- program/args 脱敏但保持足够定位信息；
- 记录 matcher 是否完整、降级或缺失，不伪造捕获到的问题数量；
- discovery 记录每根扫描数、排除数、错误数和 incomplete 原因；
- 其他平台目标点击 `试运行` 时写完整 `[Run][trial]` 摘要，方便 Mac 调试；日志必须明确 `execute=false`。

### 16.2 Terminal 与 Problems

- stdout/stderr、交互输入和工具原始错误留在 VS Code Task Terminal；
- matcher 产生的诊断进入 Problems；
- Run Block 提供“打开 Terminal/输出”和“打开 Problems”；
- Task API 无 stdout 回读时不在 Primary 复制一个不完整日志面板；
- exit code 为非零但 Problems 为空时提示“任务失败，但 matcher 未产生 Problems；请查看 Terminal 与 matcher 保真状态”。

### 16.3 复制运行诊断

包含：

- Auto Code/VS Code 版本、实际 platform、remoteName、URI scheme、workspace trust；
- target/source/template/config identity 与 hash 前缀；
- project kind/cwd 相对路径、interpreter/tool 探测；
- CAA version 来源、matcher fidelity；
- 状态事件、退出码、耗时、错误 code；
- 不包含环境值、源码、完整用户目录或 terminal 全量输出。

## 17. 错误处理

| 场景 | UI 状态 | 处理 |
| --- | --- | --- |
| `tasks.json` JSONC/schema 错误 | 配置错误，行禁用 | 显示文件/行列，提供打开来源 |
| 嵌套 custom task type 无 provider | 需原生 Task | 建议把子项目加入 Workspace Folder/安装提供者 |
| inline matcher 不可保留 | matcher 降级/阻断 | 构建目标默认阻断或要求显式降级确认 |
| compound 依赖缺失/循环 | 配置错误 | 列出缺失 label/cycle，不自动改名 |
| cwd 不存在/越界 | 预检失败 | 显示解析前后值，不创建目录 |
| interpreter/program 缺失 | 预检失败 | 给出 `pwsh`/`cmake`/vendor path 等具体类别 |
| CAA version 不合法/安装缺失 | 预检失败 | 保留选择，打开环境 Block 或换版本 |
| Workspace 未信任 | 只读 | 不执行，指向 Workspace Trust |
| 目标在扫描后变化 | stale | 重新发现并重新确认 |
| `executeTask` 抛错 | failed-to-start | 记录 API 错误与 target identity |
| 退出码非零 | failed | 打开 Terminal/Problems，不自动重试 |
| 只有 Task end 无 process result | ended-unknown | 不显示成功，记录能力限制 |
| terminate 后无 end event | stopping/unknown | 不强杀，提示手工检查 Terminal/进程 |
| 其他平台目标被点击 | disabled | 记录 platform mismatch，不执行 |
| 扫描达到上限 | incomplete | 显示上限/根/类别，要求收窄 exclude |
| 单个目录无权限/IO 错误 | 部分发现 | 记录路径类别，其他项目继续 |

## 18. 未来目录边界

以下只是未来实施建议，本轮不创建：

```text
extension/src/tools/run/
  index.ts                    # KtTool、命令与 Primary 接线
  runController.ts            # Host 编排与语义消息
  runWorkspaceDiscovery.ts    # VS Code folder/remote adapter
  runTaskAdapter.ts            # fetch/execute/events/terminate
  runImportedTaskAdapter.ts    # 嵌套 task 支持矩阵
  runEnvironment.ts            # projectEnvironment 快照与 per-run env
  runPrimaryPanel.ts           # Host-neutral Web Component
  runViewModel.ts
  *.test.ts

extension/resources/run/
  runner-manifest.json
  windows/caa-build.cmd
  windows/caa-run.cmd

tests/fixtures/run/
  pnxcaa-study/
  cross-platform/
  task-capabilities/
```

Wing 未来目录：

```text
phoenix-wing/packages/run-core/
phoenix-wing/packages/run-node/
```

Primary Web Component 必须 Host-neutral，不导入 `vscode`、`workspace.fs`、clipboard 或 Task API。Host 只向页面投影结构化状态。

## 19. 实施阶段

### Phase 0：契约与脱敏 fixture

- 冻结 RunProject、RunTarget、RunExecution、template、config 与 error code；
- 从参考相对结构提炼最小 fixture，不复制绝对路径、个人配置或不需要的业务源码；
- fixture 包含根/嵌套 `tasks.json`、`$msCompile`、inline matcher、compound task、失配 label、`mk.ps1/run.ps1` wrapper、共享 tools、`buildAll.bat`、CMakeLists；
- 冻结平台兼容矩阵、cwd 规则、matcher fidelity 与日志脱敏格式；
- 在 Wing 建立有真实测试/消费者的 `run-core`，不建立空 `run-node`。

验收：所有发现、匹配、安全和状态输入都能用纯 fixture 表达，不依赖 `/Users/kathy/...`。

### Phase 1：只读发现与 Primary

- 注册 Run `KtTool` 和独立 Primary Block；
- 扫描所有 Workspace Folder、脚本/可执行文件、根与嵌套 tasks；
- 项目分组、来源展开、平台过滤、macOS 显示全部调试态；
- 显示 cwd、matcher fidelity、风险、缺失依赖；
- 实现刷新、watch debounce、扫描上限和 `[Run][discover/preflight]` 日志；
- 所有运行按钮保持不可执行或使用 fixture mock，不启动真实目标。

验收：打开 `PNXCaaStudy` 上层目录时能把 KtCore 与多个 CAA Wsp 分开，嵌套 task 的 project root/cwd 正确。

### Phase 2：原生 Task 运行、状态与停止

- `fetchTasks()` 对应与原 Task 执行；
- Workspace Trust、首次确认、指纹失效；
- Task start/end/process events、exit code、并发与 terminate；
- 打开 Terminal/Problems/Output、复制运行诊断；
- 原生 matcher/compound/input/custom type 不被重建。

验收：参考 CAA task 使用原 `$msCompile`；非零退出码、终止和无 process result 不误报成功。

### Phase 3：生成目标与嵌套 Task

- `ps1`、`bat/cmd`、`sh`、native executable 生成 Task；
- 强 CAA build 分类的 `mk.ps1` 自动附加扩展自带 CAA/MSVC matcher，在没有 `tasks.json` 时也能生成 Problems；
- 实现嵌套 shell/process、platform override、cwd、env、命名 matcher；
- 实现受限 compound graph；inline matcher/background/custom type 按能力矩阵阻断或降级；
- 增加 `.phoenix/run-targets.json` 与 schema；
- 高风险确认、symlink/越界、remote/virtual 限制。

验收：所有可执行入口都通过 Task API；没有 `createTerminal().sendText()` 的旁路。

### Phase 4：CAA/CMake 内置模板与 runner

- KtCore 内置 CMake Debug/Release/组合目标，保留现有 `buildAll.bat` 为兼容候选；
- 每个已识别 CAA project 的`内置`组无条件同时生成 bundled `MK` 与 bundled `Run`；显式配置、Task、项目/共享脚本作为其他可见来源并列保留；
- CAA 每项目版本 selector、目标匹配、DS/vendor 路径预检；
- 提炼 `caa-build.cmd` / `caa-run.cmd`，同一 cmd 会话、退出码和 matcher fixture；
- 建立有真实消费者的 `run-node`，发布 asset manifest 并进入本地/Registry Wing 构建验证；
- VSIX copy、`.vscodeignore`、artifact verifier 和 license/NOTICE 验收。

验收：没有项目 wrapper 时仍可由内置 runner 定位并启动；扩展安装目录不产生临时文件；CAA 构建错误进入 Problems。

### Phase 5：跨平台与真实 Host 验收

- Windows：真实 CAA 只读预检、用户确认后的 mkmk/CNext、停止与 Problems；
- macOS：平台过滤、显示全部、CMake/shell safe fixture、Windows 目标禁用态；
- Linux/remote：shell/executable/task 与 virtual workspace 限制；
- 多根、1000+ 候选、权限错误、配置更新、扩展重载和运行中重建状态；
- 完整 `pnpm ext:dev:prepare` 本地 Wing 验证、Registry 对照和 VSIX artifact 验证。

在 `pnpm ext:dev:prepare` 成功前，不把本地 Wing 集成描述为通过。

## 20. 测试计划

### 20.1 fixture 结构

从用户参考提炼，不直接依赖原路径：

```text
tests/fixtures/run/pnxcaa-study/
  .vscode/tasks.json                 # 多子项目 + compound + 失配 label
  tools/
    mk.ps1                           # 只保留参数/相对调用形状
    run.ps1
    caa-build-stub.cmd               # 不调用真实 DS
    caa-run-stub.cmd
    buildFunction.bat
  KtCore/
    CMakeLists.txt
    buildAll.bat
    export.bat
  PNXBomAnalysisWsp/
    .vscode/tasks.json               # $msCompile
    mk.ps1
    run.ps1
    Module/IdentityCard/IdentityCard.h
    Module/Foo.m/Imakefile.mk
```

fixture 中的命令只能输出可预测文本/退出码，不创建链接、不写系统环境、不启动 CNext、不访问 `C:\DS`。

### 20.2 纯单元测试

- 根与嵌套 tasks 发现、JSONC、platform override；
- `KtCore = cmake-cpp`、`PNXBomAnalysisWsp = caa`；
- cwd 相对配置文件/project root，不相对最外层根；
- 正斜杠/反斜杠、空格、中文、Windows case folding；
- script/task/executable 分类、shebang/mode/magic；
- 当前系统过滤与“显示全部”只影响展示；
- source priority 与重复来源展开；
- `CAA_MK_VERSION` 选择优先级、19/20、非法 token；
- CAA build/run 匹配与缺失厂商路径；
- MK 关联工程单项/多项、去重、工作区外确认、原生 wrapper 不被暗改；
- 命名/inline matcher fidelity；
- compound missing label/cycle/parallel/sequence/background；
- scan cap/incomplete、硬排除、不误排 `extensions/.../bin`；
- risk、fingerprint、source change、env/path redaction；
- RunExecution 状态转移和 unknown end。

### 20.3 Task adapter 测试

- 原生 task 使用同一个对象调用 `executeTask`；
- 生成 task 使用预期 scope、cwd、program/args/env、matcher、presentation；
- start/process/end 事件只更新对应 execution；
- exit `0`/非零/undefined、start throw、terminate timeout；
- 同名 target 跨 Workspace Folder 不串状态；
- 刷新/切换 Block 不丢 active execution；
- 不认领或停止用户从其他入口启动的 Task。

### 20.4 matcher 与日志测试

- MSVC、GCC/Clang、CMake configure 的最小输出进入正确 file/line/severity；
- 删除 CAA fixture 的 `tasks.json` 后，直接点击发现的 `mk.ps1` 生成 Task，MSVC fixture 错误仍进入 Problems；
- 再删除 `mk.ps1` 后，CAA project 的 `MK` 仍存在并切换到内置 runner，MSVC fixture 错误仍进入 Problems；
- 普通目录中的同名 `mk.ps1` 不被误挂 CAA/MSVC matcher；
- project-root fileLocation 在嵌套 cwd 下仍能定位；
- inline matcher 降级明确，不显示 full；
- 失败无 Problems 时给出 Terminal/matcher 提示；
- 每次点击有 preflight/start/state/error 日志；
- 复制诊断无环境值、个人绝对根和源码内容；
- macOS 点击 Windows disabled target 只记录 platform mismatch。

### 20.5 Extension Host/人工验收

- 单根与 multi-root 各一次；
- macOS：只看当前系统、显示全部、shell/CMake safe fixture、Windows 禁用态；
- Windows：原生 CAA task、内置 CAA runner、`$msCompile` Problems、CNext stop；
- KtCore：现有 `buildAll.bat` 风险提示与内置 CMake target 对比；
- nested project 未加入 multi-root 与加入后，导入/原生标记正确切换；
- 更改 task/script 后旧确认失效；
- 没有 task/script 时默认从 VSIX runner 运行；显式生成 `.phoenix/run/<project>/` 后可切换 local runner，修改过的文件不会被覆盖；
- 未信任 workspace 永不运行；
- 安装后从 VSIX 的 `resources/run` 定位，不引用源码仓库绝对路径。

## 21. 完成标准

1. Run 与 Git 是两个独立 Primary 工具，Run 不创建第二个 View。
2. 所有 Workspace Folder 与嵌套子项目都可发现，cwd 不混淆。
3. `KtCore` 显示为 CMake C++；`PNXBomAnalysisWsp` 显示为 CAA。
4. 根与嵌套 `tasks.json` 都被发现，并区分原生/导入/需原生化。
5. 当前平台目标默认可见；Mac 可查看 Windows 目标并使用 `试运行` 输出平台、项目、目标、cwd、来源、matcher 与脱敏命令摘要，但不能误执行。
6. 原生 Task problem matcher 完整保留；CAA `内置`组固定同时提供 bundled `MK` 与 bundled `Run`；没有 `tasks.json` 的 CAA `mk.ps1` 也通过生成 Task + 内置 CAA/MSVC matcher 收集 Problems；任何 matcher 降级显式可见。
7. CAA 每项目可选版本，所选值真正传入执行目标或明确拒绝，不出现“UI 是 20、实际跑 19”。
8. 脚本、可执行文件、内置 CAA/CMake 目标统一经 Task API，状态和停止可追踪。
9. 每次点击都有脱敏 preflight/start/state/error 日志，Terminal 与 Problems 有明确入口。
10. 内置 runner 随 VSIX 发布并从 `extensionUri` 定位；默认不写工作区，只有用户显式操作才生成 `.phoenix/run/`，且永不写系统环境。
11. CAA 内置主路径不依赖 PowerShell，但用户 `.ps1` 仍受支持。
12. Wing core/node 边界、tarball、VSIX asset 与本地/Registry 来源验证通过。
13. 自动测试、macOS/Windows 人工验收和 `pnpm ext:dev:prepare` 均完成后，才能宣称本地集成通过。

## 22. 要求追踪

| 用户要求 | 计划位置 |
| --- | --- |
| `doc/运行模块/` 讨论入口与详细计划 | 本目录 `README` 与本文 |
| 扫描 ps1/bat/cmd/sh/可执行文件 | 第 7 节 |
| 根与嵌套 tasks.json | 第 7、9 节 |
| Terminal/Task API 执行 | 第 9 节 |
| 保留 problemMatcher/Problems | 第 9、16 节 |
| 多子项目与 cwd | 第 7 节 |
| CAA 当前版本、mk/run/task 匹配 | 第 10 节 |
| PowerShell 与 Wing run-core/run-node | 第 11、12 节 |
| UI、安全、状态、停止、错误、阶段、测试 | 第 13～20 节 |
| projectEnvironment/CAA_MK_VERSION/VS Code 能力 | 第 3 节 |
| KtCore/PNXBom/tools 参考与 fixture | 第 4、20 节 |
| VSIX 内置脚本位置与改进 | 第 11 节 |
| 识别 CAA 后固定提供 MK/Run，不依赖 task 或项目脚本 | 第 7、9～11 节 |
| 可选生成 `.phoenix/run/` 本地 runner | 第 11 节 |
| MK 关联工程/Preq 目录 | 第 10 节 |
| 多 CAA 子工程全部构建/运行后续讨论 | 第 10 节 |
| Task Manager/CMake 风格树且仅限单 Primary | 第 13 节 |
| macOS 当前系统筛选/跨平台调试 | 第 8、13、20 节 |
| 点击后的日志与有用诊断 | 第 16、17 节 |
