# Run Primary Block 实现基线

状态：current

Owner：KT Auto Code maintainers

适用版本：KT Auto Code 0.6.0

最后核验：2026-07-21

本目录记录 Run（运行）Primary Block 的可行性、已冻结交互、共享边界与 0.6.0 实现基线。参考工程只用于只读发现核验；自动测试不启动真实 CAA/CNext。

## 当前推荐结论

- Run 是 Code Ribbon 的独立工具，与 Git 并列；目标顺序为 `… → CAA UI → Git → Run`。它只打开共享 Primary 中的 Run Block，不新增顶层模块、原生 TreeView、编辑器页或第二套结果 View。项目/分组/目标树由 Wing 的通用 Navigation Tree 提供；运行历史和诊断仍在同一个 Block 内。
- 默认树只保留四组高价值入口：CMake 主要动作、`tasks.json` 任务、自定义目标和少量固化目标。一旦可靠识别为 CAA 工程，`内置`组无条件同时提供 `MK`（mk/mkmk）与 `Run`（run/CNext）；即使 Tasks 已有同动作，两个内置 runner 行仍保留，方便明确选择来源与跨平台试运行。
- 同时扫描所有 Workspace Folder 及其子目录中的 `ps1`、`bat`、`cmd`、`sh`、Windows 可执行文件和当前平台可执行文件；扫描只发现，不自动运行。
- 同时发现工作区级与嵌套目录中的 `tasks.json`。VS Code 已原生解析的任务直接执行原 `Task` 对象；嵌套配置采用受限导入，并明确显示 matcher、compound、变量或自定义 task type 是否能完整保留。
- 优先通过 `vscode.tasks.executeTask()` 运行，直接脚本和可执行文件也包装成 VS Code Task，使 Terminal、Problems、运行事件和停止入口保持一致。
- 原生 Task 的 `problemMatcher` 原样保留；生成任务保留命名 matcher。即使项目没有 `tasks.json`，强证据识别出的 CAA `mk.ps1` 也包装成生成 Task，并自动挂接 Auto Code 自带的 CAA/MSVC matcher，把编译错误送进 Problems。CAA/CMake 内置构建任务同样提供受测试的 MSVC、GCC/Clang 与 CMake matcher。无法由公开 API 表达的嵌套 inline matcher 不静默丢失，而是显示“matcher 降级”或要求将子项目加入 Workspace Folder。
- 多项目按真实 Workspace Folder、子项目根和 cwd 分组。`KtCore` 按 CMake C++ 项目处理；`PNXBomAnalysisWsp` 按 CAA 项目处理，二者不因都能运行脚本而混为同一项目类型。
- CAA Block 可为每个子项目选择当前版本。当前选择保存在 `workspaceState`，不写工程文件，也不修改系统 `CAA_MK_VERSION`；其次读取 machine-scoped 插件默认版本和环境值，最后使用建议值 `19`。同一代码可依次选择多个版本编译。
- 内置 CAA MK / Run 的机器安装位置使用 User Settings：`ktAutoCode.run.CAARadeRoot`、`CATIARoot`。配置后优先使用；留空时分别按 `C:\\DS\\RADE<版本>`、`C:\\DS\\B<版本>` 推导。厂商命令固定从 RADE 根下的 `intel_a` 读取，不能把工程输出目录 `win_b64` 拼成 RADE 工具目录。旧 `caaRadeRoot`、`catiaRoot`、`caaCatiaRoot` 仅保留读取兼容。这些都是机器集成信息，绝不写入工程的 `.vscode/settings.json`。
- 点击内置 CAA MK / Run 前，Run 会在输出中记录版本、RADE `intel_a` 工具目录、RADE 根和 CATIA 根；任一根目录或所需厂商脚本不存在时，预检立即停止，不会进入 `tck_init.bat`。
- `设置 → 插件设置` 以紧凑只读行显示当前 `CAA Version`、`CAA Rade Root`、`CATIA Root` 与固定的 `CAA Runtime Directory = intel_a`；来源和完整值保留在悬停提示中。编辑仍统一进入 VS Code 插件设置，不在该清单内维护第二份值。
- 普通 Run 默认只输出“已启动”和清晰的成功/失败结论；发现数量、内部目标 ID、运行 ID、matcher 等开发诊断默认静默。失败行统一以 `[ERROR]` 开头并说明可行动原因；“试运行”是显式诊断动作，仍输出命令与兼容性细节。
- CAA `MK` 独立维护“关联工程/Preq 目录”，对应参考脚本的 `-Workspace` 与 `mkGetPreq -p`。它不等于当前 cwd；可从已发现项目勾选或显式选择目录，内置 runner 支持多项并做去重与越界确认。关联目录只影响点击后的执行 provider，不改写列表来源：原生 `mk.ps1` 仍在 Tasks，bundled `MK` 仍在内置组，避免出现重复内置项。
- 工程级 Run 配置采用 `ktAutoCode.run.caaRelatedProjects`；多 CAA 子工程使用 `ktAutoCode.run.caaProjects` 映射，关联路径优先按各自工程保存为相对路径。`ktAutoCode.run.CAAVersion` 只表示本机插件默认版本，不是固定工程版本。
- 默认开启“只看当前系统”。macOS 只显示当前可运行目标；关闭后仍可查看 Windows/Linux 候选，但这些候选置灰，仅用于 UI、路径与配置调试，不能伪装执行。
- 参考脚本不会原样写入用户工作区。提炼后的内置 runner 默认随 VSIX 放在只读 `resources/run/`，通过 `ExtensionContext.extensionUri` 定位；没有 task/项目脚本也能直接运行。为调试和定制，可由用户显式把自包含 runner 与 manifest 生成到 `.phoenix/run/<project>/`；扫描/打开 Block 不自动写文件，也不覆盖用户改过的副本。
- CAA 内置 runner 计划摆脱 PowerShell 硬依赖，但不能摆脱 Windows 厂商 `.bat`。它必须在一个 `cmd.exe` 会话中依次 `call` 环境与构建/运行脚本，保留批处理设置的环境，并把真实退出码传给 VS Code Task。
- 项目根命中 `.clang-format` 时，`内置`组增加一个跨平台 `Clang Format`；没有 marker 时不生成。它通过随 VSIX 安装的 Node runner 递归格式化 C/C++ 文件，跳过构建、生成、依赖与工具目录，不依赖项目中的 `clangfile.ps1`；项目脚本若存在仍在“自定义”组并列显示。
- Wing 建议建立有真实消费者的 `run-core`；`run-node` 只在本地发现、runner 资产和 Node launch plan 开始被 Auto Code 消费时建立，禁止预建空包。VS Code Task、Terminal 和 Primary 状态始终留在 Auto Code adapter；Run 叶子命令单击直接执行，前置的 Workspace Trust、平台、并发和 CAA 预检仍不可绕过。

详细方案见 [Run Primary Block 可行性与实施计划](Run-Primary-Block可行性与实施计划.md)。

暂不实施的命令行与流水线方向见 [TODO：Phoenix Wing CLI 与 CAA CI/CD](TODO-Wing-CLI与CAA-CICD.md)。

## 参考基线

- CMake C++：`<CMAKE_PROJECT_ROOT>/KtCore`
- CAA 子项目：`<CAA_PROJECT_ROOT>/PNXBomAnalysisWsp`
- 共享脚本：`<WORKSPACE_ROOT>/tools`

这些示例只用于说明工程类别和后续提炼脱敏 fixture。自动测试必须使用仓库内最小 fixture，不能依赖开发机上长期存在的绝对路径，也不能在测试中启动真实 CAA/CNext。

## 后续增强前必须重新冻结

- `.phoenix/run-targets.json` 的 V1 schema、覆盖优先级与是否允许 shell command string；计划推荐 process/program + args 优先，shell string 仅兼容导入现有 shell task。
- 嵌套 `tasks.json` 的支持矩阵，尤其是 inline problem matcher、`${input:*}`、`${command:*}`、自定义 task type 和 background compound task。
- CAA 内置 runner 的 DS 根目录配置、版本格式、厂商脚本清单与 Windows 实机输出 fixture。
- 首次确认的记忆粒度与指纹策略；高风险脚本、修改后的文件和其他平台目标不得复用旧确认。
- `run-core` / `run-node` 的首个公共 API 与资产发布方式；所有 Wing 公共名称从第一行遵守 `pnw*`、`Pnw*`、`PNW_*` 前缀。
- 多个 CAA 子工程的“全部构建/全部运行”留待后续讨论。V1 每个工程独立提供 `mk` 与 `run`；已有显式 compound Task 仍可按原生任务执行。
- **TODO(CI/CD，非当前插件交付)**：最终由 Phoenix Wing 统一发布 CAA runner 资产、命令/批处理计划、Preq DAG 与安全校验，形成不依赖 VS Code 的可复用 SDK；其他项目可以直接调用 Wing 对 CAA 工程执行 MK。Auto Code 最多提供配置编辑、验证、Task adapter 或显式导出，不成为命令行运行依赖。没有项目 ps1/bat 的 Windows Agent 仍应能运行，但 VS Code `workspaceState` 不进入 CI 配置。
