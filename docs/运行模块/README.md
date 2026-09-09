# Run Primary Block 实现基线

状态：current

Owner：KT Auto Code maintainers

适用版本：KT Auto Code 0.6.0 基线；0.9.0 Run 清理增量

最后核验：2026-09-09（Run 清理增量；原运行基线不代表全部重验）

本目录记录 Run（运行）Primary Block 的可行性、已冻结交互、共享边界与 0.6.0 实现基线。参考工程只用于只读发现核验；自动测试不启动真实 CAA/CNext。

## 当前推荐结论

- Run 是 Code Ribbon 的独立工具，与 Git 并列；目标顺序为 `… → CAA UI → Git → Run`。它只打开共享 Primary 中的 Run Block，不新增顶层模块、原生 TreeView、编辑器页或第二套结果 View。项目/分组/目标树由 Wing 的通用 Navigation Tree 提供；运行历史和诊断仍在同一个 Block 内。
- 默认树只保留四组高价值入口：CMake 主要动作、`tasks.json` 任务、自定义目标和少量固化目标。一旦可靠识别为 CAA 工程，`内置`组无条件同时提供 `MK`（mk/mkmk）与 `Run`（run/CNext）；即使 Tasks 已有同动作，两个内置 runner 行仍保留，方便明确选择来源与跨平台试运行。
- 同时扫描所有 Workspace Folder 及其子目录中的 `ps1`、`bat`、`cmd`、`sh`、Windows 可执行文件和当前平台可执行文件；扫描只发现，不自动运行。
- 同时发现工作区级与嵌套目录中的 `tasks.json`。VS Code 已原生解析的任务直接执行原 `Task` 对象；嵌套配置采用受限导入，并明确显示 matcher、compound、变量或自定义 task type 是否能完整保留。
- 优先通过 `vscode.tasks.executeTask()` 运行，直接脚本和可执行文件也包装成 VS Code Task，使 Terminal、Problems、运行事件和停止入口保持一致。
- 原生 Task 的 `problemMatcher` 原样保留；生成任务保留命名 matcher。即使项目没有 `tasks.json`，强证据识别出的 CAA `mk.ps1` 也包装成生成 Task，并自动挂接 Auto Code 自带的 CAA/MSVC matcher，把编译错误送进 Problems。小写 `fatal error/error` 保持错误，大写 `ERROR/WARNING` 按 warning 补充捕获；没有文件/行号的文本仍留在 Terminal。CAA/CMake 内置构建任务同样提供受测试的 MSVC、GCC/Clang 与 CMake matcher。无法由公开 API 表达的嵌套 inline matcher 不静默丢失，而是显示“matcher 降级”或要求将子项目加入 Workspace Folder。
- 多项目按真实 Workspace Folder、子项目根和 cwd 分组。`KtCore` 按 CMake C++ 项目处理；`PNXBomAnalysisWsp` 按 CAA 项目处理，二者不因都能运行脚本而混为同一项目类型。
- CAA Block 可为每个子项目选择当前版本。当前选择保存在 `workspaceState`，不写工程文件，也不修改系统 `CAA_MK_VERSION`；其次读取 machine-scoped 插件默认版本和环境值，最后使用建议值 `19`。同一代码可依次选择多个版本编译。
- 内置 CAA MK / Run 的机器安装位置使用 User Settings：`ktAutoCode.run.CAARadeRoot`、`CATIARoot`。配置后优先使用；留空时分别按 `C:\\DS\\RADE<版本>`、`C:\\DS\\B<版本>` 推导。厂商命令固定从 RADE 根下的 `intel_a` 读取，不能把工程输出目录 `win_b64` 拼成 RADE 工具目录。旧 `caaRadeRoot`、`catiaRoot`、`caaCatiaRoot` 仅保留读取兼容。这些都是机器集成信息，绝不写入工程的 `.vscode/settings.json`。
- 点击内置 CAA MK / Run 前，Run 会在输出中记录版本、RADE `intel_a` 工具目录、RADE 根和 CATIA 根；任一根目录或所需厂商脚本不存在时，预检立即停止，不会进入 `tck_init.bat`。
- `设置 → 插件设置` 以紧凑只读行显示当前 `CAA Version`、`CAA Rade Root`、`CATIA Root` 与固定的 `CAA Runtime Directory = intel_a`；来源和完整值保留在悬停提示中。编辑仍统一进入 VS Code 插件设置，不在该清单内维护第二份值。
- 普通 Run 默认只输出“已启动”和清晰的成功/失败结论；发现数量、内部目标 ID、运行 ID、matcher 等开发诊断默认静默。格式遵守[必要日志输出规则](../必要日志输出规则.md)；“试运行”是显式诊断动作，仍输出命令与兼容性细节。
- CAA `MK` 独立维护“关联工程/Preq 目录”，对应参考脚本的 `-Workspace` 与 `mkGetPreq -p`。它不等于当前 cwd；可从已发现项目勾选或显式选择目录，内置 runner 支持多项并做去重与越界确认。关联目录只影响点击后的执行 provider，不改写列表来源：原生 `mk.ps1` 仍在 Tasks，bundled `MK` 仍在内置组，避免出现重复内置项。
- 工程级 Run 配置采用 `ktAutoCode.run.caaRelatedProjects`；多 CAA 子工程使用 `ktAutoCode.run.caaProjects` 映射，关联路径优先按各自工程保存为相对路径。`ktAutoCode.run.CAAVersion` 只表示本机插件默认版本，不是固定工程版本。
- 默认开启“只看当前系统”。macOS 只显示当前可运行目标；关闭后仍可查看 Windows/Linux 候选，但这些候选置灰，仅用于 UI、路径与配置调试，不能伪装执行。
- 参考脚本不会原样写入用户工作区。提炼后的内置 runner 默认随 VSIX 放在只读 `resources/run/`，通过 `ExtensionContext.extensionUri` 定位；没有 task/项目脚本也能直接运行。为调试和定制，可由用户显式把自包含 runner 与 manifest 生成到 `.phoenix/run/<project>/`；扫描/打开 Block 不自动写文件，也不覆盖用户改过的副本。
- CAA 内置 runner 计划摆脱 PowerShell 硬依赖，但不能摆脱 Windows 厂商 `.bat`。它必须在一个 `cmd.exe` 会话中依次 `call` 环境与构建/运行脚本，保留批处理设置的环境，并把真实退出码传给 VS Code Task。
- 项目根命中 `.clang-format` 时，`内置`组增加一个跨平台 `Clang Format`；没有 marker 时不生成。它通过随 VSIX 安装的 Node runner 递归格式化 C/C++ 文件，跳过构建、生成、依赖与工具目录，不依赖项目中的 `clangfile.ps1`；项目脚本若存在仍在“自定义”组并列显示。
- Wing 的 `run-core/run-node` 已有实际 Run 消费者。VS Code Task、Terminal 和 Primary 状态始终留在 Auto Code adapter；Run 叶子命令单击执行，前置的 Workspace Trust、平台、并发和 CAA 预检仍不可绕过。下述三个产物清理快捷项按用户要求继续单击执行、不询问；首行独立“清理”按钮打开统一对话框。

详细方案见 [Run Primary Block 可行性与实施计划](Run-Primary-Block可行性与实施计划.md)。

暂不实施的命令行与流水线方向见 [TODO：Phoenix Wing CLI 与 CAA CI/CD](TODO-Wing-CLI与CAA-CICD.md)。

## 0.9 包后增量：Run 统一清理

本节是 2026-09-09 已交付 0.9.0 安全修订包之后的源码阶段，**不在该包内**。
该包 SHA-256 为 `a162e52d20cf1c1750dddce691ea01e00a4e07d5352e96ed8ce9c696672d9fef`；
独立分发目录和随包说明保持原样，不用本节覆盖旧制品边界。

| 原叶子 | 新点击行为 | 保留的清理能力 |
| --- | --- | --- |
| 删除 build 目录 | 原快捷叶子直接清理，不确认 | 当前工作目录内递归匹配 build（大小写不敏感） |
| 删除 objects 目录 | 原快捷叶子直接清理，不确认 | 当前工作目录内递归匹配 objects（大小写不敏感） |
| 删除 `*.obj` | 原快捷叶子直接清理，不确认 | 当前工作目录内递归匹配目标文件 |
| Git 未跟踪清理 | 移到 Run 内容首行“清理”按钮，对话框默认 git-untracked | 递归发现仓库，单 force clean 删除未跟踪和 ignored；不 reset，不删嵌套仓库 |

没有删除原有清理方式；Git 树入口迁入首行“清理”。首行“刷新”也改为文字按钮，与“清理”组成类似自动代码的紧凑按钮 block，右侧保留“仅当前系统”。
用户明确要求三个产物快捷项保持“点击即执行，不询问”，因此不强制打开确认对话框；内部扫描/冻结/复验不等于 UI 确认。
用户随后明确删除 Run 清理对话框里的额外风险勾选行；Run 设置 `requireHighRiskConfirmation: false`，
仍显示模式/目录/风险和预览清单，取得有效 token 后点击“清理”执行。不增加第二次询问。
Wing 的新选项默认仍为 true，不改变 AutoBuild 或其他调用方的既有风险确认行为。
清理树恢复原图标与紧凑布局，分组说明为“当前工作目录 · 跳过 .git · 点击即执行，不询问”，三个子项无额外 secondary。
TODO（用户指定的后续扩展）：快捷项变多时，改为类似代码辅助的紧凑图标+文字按钮网格；仍单击直接清理、不询问。本次不提前改为网格。
正式 Controller 不再调用本仓旧 `KtcManualCleanup`，该旧 helper 仍保留作兼容参考/测试，不是另一条生产删除路径。
AutoBuild 的 ROOT/工作目录直属规则、CMake 清理和高风险 `reset --hard + clean -ffdx` 不受影响；Run 的 Git 模式不能映射成强制恢复。

### 运行边界

- Wing 提供 `pnwPreviewRecursiveCleanupArtifacts/pnwCleanPreviewedRecursiveArtifacts` 和
  `pnwPreviewGitUntrackedCleanup/pnwExecuteGitUntrackedCleanup`。快照留在 Node Host，不传给 Webview；
  Auto 只把可读清单和随机 token 投影给 Wing 对话框。新 API 尚未通过 Registry 发布。
- 当前 `@phoenix-wing/run-node` Registry 锁定版本不提供这四个新 API；普通 Registry 模式不得标记此阶段已就绪。
  缺能力会明确报错且不回退直接删除；发布前必须先发布 Wing、更新受审依赖/lock，并改用正式类型导出。
  本轮仅受控本地 Wing 构建，不擅自发布新版本或写本地依赖 override。
- 本地准备脚本在 Wing build 后检查四个真实函数导出；VSIX 校验还要求 bundle 包含四个实际实现体，
  不能用 Host 调用字符串冒充能力。新门禁不追认旧包已具备本阶段增量。
- 递归扫描跳过 `.git` 和符号链接；匹配目录中有嵌套仓库或链接时保留这些边界，拆分可安全处理的子项。
  执行核对根、祖先路径身份与目标完整树，拒绝新增/替换的内容进入旧计划。文件系统根不是合法目标。
- Git 模式保持 tracked 的工作区与暂存区内容，冻结完整 index；确认后暂存区改变时拒绝旧计划。
  使用 literal pathspec 和精确冻结目标，不对整个根再次运行无范围 clean；每个实际删除路径才报告成功。
- Host 校验 Workspace Trust、当前目录、模式/目标指纹、session/revision/token、运行与清理互斥。
  对话框不能传入任意路径或隐藏 YAML 扩大固定规则。
- 预览和执行都接收协作取消信号，在递归节点/仓库边界检查；取消使旧 token 与后续操作失效，直到正在执行的 provider 退出才允许新的清理/运行。
  取消不是回滚，也不承诺打断已启动的 Git 命令；错误与部分完成信息保留到 Output。测试前停止其他写入者。
- 工具 Header 的 `×` / 关闭其他工具仍只更新逻辑打开项与 MRU，不取消任务或清空结果。
  清理弹窗自身的 `×` / 取消才撤销清理授权；工作目录变化、实际 Webview 销毁也使旧授权失效，
  不调用普通 VS Code Task 的停止动作。重建 Webview 的 init 重放不得主动重开旧清理弹窗。
- Preview 使用正式 Run 面板和 Wing 对话框，但数据及执行反馈都是内存模拟，不进行任何真实删除。
  AutoBuild Preview 的原有手写弹窗尚待收敛，不宣称所有原型都已使用同一组件实例。

### 验收与剩余点检

- Wing run-node 的真实临时目录与类型检查通过：包含临时目录递归清理、大小写、链接/嵌套仓库、祖先替换、
  目标变化、Git index、literal pathspec、单 force 保留 tracked 以及取消。未在用户工程执行删除。
- 本地 `pnpm ext:dev:prepare` 完成：Auto 六个 Wing 输入来自并列仓库，consumer node_modules 命中 0；
  CAD 的 Registry 准备、50 项测试和构建通过。正式 manifests 与 lockfile 不变。
- 2026-09-09 解锁后的浏览器点检已覆盖：原三项清理树、build 快捷项模拟直达、Git 默认方式、精确预览、清理/关闭日志；弹窗没有额外风险确认勾选，未执行真实删除。
- 同日 Wing run-node 47 项、code-core 103 项测试通过；Auto 全量 220 文件、1354 项通过（2 项条件跳过），`pnpm ext:dev:prepare` 再次通过。
- 真实 Extension Host 代表流程 smoke 通过，保留回执 `/tmp/ktc-eh-4fSDjs/workspace/.phoenix/extension-host-smoke-v1.json`；它覆盖 Run Block 注册，不代表四个清理入口的真实人工点检。
- Extension Host 深浅主题、焦点、弹层避让、真实四入口和 Windows/Linux 实机删除仍待人工验收；DOM 和 Preview 不能替代这些项目。
- 自动代码 Right、AutoBuild 后续 link/export/CAA TS provider 与真实清单 clone 等不在本 Run 阶段完成范围。

## 已修复问题

### BUG-RUN-PRIMARY-WHEEL-001：Run 长 Tree 与 Current Tool 滚动冲突

- **记录日期**：2026-08-25
- **现象**：Run Primary 展开较多项目和目标后，鼠标位于 Tree 行或中部内容区时，滚轮无法带动整个 Current Tool Block 纵向滚动；只有把鼠标移到右侧边缘、使外层滚动条成为命中区域后，滚轮才恢复。
- **复现样本**：已发现 9 个项目、70 个目标，多个项目和“内置”分组同时展开。
- **根因**：Wing Navigation Tree 自带 `overflow:auto` 和 `overscroll-behavior:contain`，嵌入 Current Tool 后形成第二个纵向滚动边界并截获滚轮。
- **期望行为**：鼠标位于 Run 内容区任意位置时，滚轮或触控板均能连续滚动 Current Tool Block；到达边界后不出现卡住或必须移到滚动条的情况。
- **修复约束**：不得改变当前“可显隐目录 Row → Tool Area”两区结构，不得恢复 Primary 页面整体纵向滚动。优先保持 Tool Area 内 Tool Surface 为唯一纵向滚动边界；如 Tree 必须保留局部滚动，则必须实现明确的边界事件交接。
- **修复**：仅在 Run 的 Host 样式中关闭 Tree 自身纵向 overflow/overscroll，继续由 Tool Surface 承担滚动；不修改 Wing 通用组件，也不改变两区外壳。
- **验收范围**：长 Tree、展开/折叠、宽/窄侧栏、鼠标滚轮、触控板、键盘导航，以及深色、浅色和高对比模式。

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
