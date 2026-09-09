# Auto Build（首版）

状态：试用

插件运行时已采用 **TS 调度 + TS Git / 标准 CMake，Windows link/export/CAA 保留 PS1**。内置脚本 [`scripts/auto-build/Invoke-AutoBuild.ps1`](../../scripts/auto-build/Invoke-AutoBuild.ps1) 继续保留；用户可显式同步到 `ROOT_DIR\tools\Invoke-AutoBuild.ps1`，作为脱离 UI 的命令行入口。插件运行时按
[《TypeScript 运行时迁移计划》](TypeScript运行时迁移计划.md) 分阶段改走 Wing，脚本导出与兼容入口继续保留。

## 平台边界

- **标准 CMake 可原生运行**：插件直接调用系统 cmake 与编译器，不依赖 mk.ps1；本轮已验证 macOS Release 实编。Windows CAA 仍依赖 PowerShell 5.1、MSVC/RADE。
- **macOS/Linux 可用于开发检查**：View 可以正常打开，支持配置编辑、本机 POSIX 目录与 Git 探测、预检、JSON 保存以及 PS1 生成，便于不安装扩展的 Extension Development Host 盲开发。载入 Windows 盘符或 UNC 配置时只保留计划，不访问本机文件系统；Root 不直接同步，“导出 PS1”会要求选择本机保存位置。
- 非 Windows 点击运行时，Git 与 CMake 走 TS；export.ps1 明确提示未运行，linkCAA/CAA 标记跳过，随后顺序尝试 CMake。跳过不算成功，缺少导出依赖会产生真实编译错误。
- 日常开发使用 Extension Development Host；用户授权的 0.9.0 内测 VSIX 可交给测试者安装，不等同于市场发布。
- 所有 Root、3rdParty 和工作目录必须是完整绝对路径且实为目录；相对路径只允许用于项目行，并以绝对工作目录为基准。Windows 实际执行只接受盘符绝对路径或完整 UNC 共享路径。清理入口在任何 Git/CMake 副作用前拒绝盘根、共享根、POSIX 根，以及路径链或待删除树内的 junction/符号链接。
- “导出 PS1”先执行同一配置校验；生成的独立脚本还会在任何文件或 Git 操作前重新校验 Root、3rdParty 与全部项目路径，用户后续手工改成相对路径也会安全停止。

以下离线 PS1 示例仍先处理 Git 仓库，再执行构建（插件实际运行时差异见上方链接）：

1. 所有 CMake 项目先完成各自已有的 `export.ps1`，提前输出供其他项目使用的头文件；
2. 顺序模式按 CMake → CAA 逐项运行，单项失败只记入汇总，不阻断后续项目；
3. 并行模式在预导出完成后同时启动全部 CMake 与 CAA 项目。

默认不清理仓库。

## 试跑

先只更新 3 个仓库，不清理、不编译：

```powershell
& 'E:\KtRoot\tools\Invoke-AutoBuild.ps1' `
  -RootDirectory 'D:\work\sdk-root' `
  -ThirdPartyDirectory 'D:\work\third-party' `
  -AdditionalRepositoryPaths 'D:\work\other' `
  -Branch develop `
  -RootBranch develop `
  -SkipBuild
```

更新后先编译 C++，再编译 CAA：

```powershell
& 'E:\KtRoot\tools\Invoke-AutoBuild.ps1' `
  -RootDirectory 'D:\deps\sdk-root' `
  -ThirdPartyDirectory 'D:\deps\third-party' `
  -AdditionalRepositoryPaths 'D:\deps\other' `
  -Branch develop `
  -RootBranch develop `
  -CmakeProjectPaths 'D:\projects\cpp-a','D:\projects\cpp-b' `
  -CaaProjectPaths 'D:\projects\caa-a','D:\projects\caa-b'
```

每个 `-CmakeProjectPaths`、`-CaaProjectPaths` 目录都必须直接包含 `mk.ps1`。可用 `-MkArguments '-foo','bar'` 将相同参数传给所有 `mk.ps1`。

Git 更新包含 `fetch/pull --ff-only`、递归子模块和可用时的 Git LFS。仓库存在本地修改时显示“有修改”，保留当前分支与现场并跳过该仓库的检出、拉取、子模块和 LFS 更新；它不再阻断其他仓库和后续构建。只有用户明确选择 `-Clean` 的目标才允许重置和清理。

## 是否清理

同一个脚本通过 `-Clean` 决定是否清理：

```powershell
& 'E:\KtRoot\tools\Invoke-AutoBuild.ps1' `
  -RootDirectory 'D:\work\sdk-root' `
  -ThirdPartyDirectory 'D:\work\third-party' `
  -AdditionalRepositoryPaths 'D:\work\other' `
  -Branch master `
  -RootBranch develop `
  -Clean `
  -SkipBuild
```

`-Clean` 同时清理三类目标：ROOT_DIR 与 ROOT_DIR_3rdParty；每个 CMake 项目所属的 Git 顶层仓库；每个 CMake 项目的工程内 `build`。工程外统一的 `<project-parent>/build` 会清空全部内容，但保留空的 `build` 根目录；多个项目共享父目录时只处理一次。CMake Git 仓库默认预检并重置到 `origin/master`，可用 `-CmakeBranch` 修改。它不会清理 `-AdditionalRepositoryPaths`，也不推断删除 CAA 工作区。所有目标会在输入 `CLEAN` 前列出。无人值守运行必须同时显式传 `-ForceClean`。

远端固定使用 `origin`，不会自动选择 `check` 或其他 remote。`-RootBranch` 是 ROOT_DIR 必填的专用分支；`-Branch` 用于 ROOT_DIR_3rdParty 和附加仓库。例如：`-RootBranch develop -Branch master`。任一 `origin/<branch>` 不存在时，全部仓库仍停留在预检阶段，不执行清理。

编译日志默认写入传入的 `RootDirectory/logs/<时间>/`；例如 `RootDirectory` 为 `E:\XyRoot` 时，日志位于 `E:\XyRoot\logs\<时间>\`。可用 `-LogDirectory` 显式覆盖。

## Sample 配置入口

[sample/Invoke-AutoBuild.sample.ps1](sample/Invoke-AutoBuild.sample.ps1) 以 `E:\out` 下的两个 C++ 项目和一个 CAA 工作区为例，把仓库、C++ 和 CAA 目录拆成三个易编辑数组。复制或修改该文件后直接运行即可，不必每次在命令行输入长参数。主开发目录保存在 `E:\KtRoot\sample\`；用户测试副本放在 `ROOT_DIR\sample\`，并通过 `$env:ROOT_DIR\tools\Invoke-AutoBuild.ps1` 调用测试目录中的主脚本。

## schema 2 统一项目表

编译工具 View 已用一个紧凑项目表替换 CMake、CAA 和“更新的库”多行文本框；schema 1 不再兼容读取。

表格每行代表一个仓库或构建目录，至少包含：

- 启用、仓库名、路径、目标分支、当前 Commit、Origin、状态；
- 更新、CMake、CAA、linkCAA 等可组合操作；
- 单行重新探测、**更新**（仅 TS Git，不编译）、单独运行和移除操作。

状态区分“干净”“有修改”“路径无效”“不是 Git 仓库”“脚本不一致”等。选入目录和探测只修改计划，不自动更新、覆盖或编译。

### 目录录入与探测

1. “选择目录…”使用 VS Code 原生目录选择器并允许一次多选；选中的每个目录成为一行。
2. “探测当前目录”从当前工作目录向下发现 Git 仓库，自动读取仓库名、分支、Commit、Origin 和修改状态。
3. 重复目录按规范化后的 Git 顶层目录去重，再探测只刷新已有行。
4. 新加入且有效的行默认启用；发现 `mk.ps1`、`export.ps1` 或 `linkCAA.ps1` 时只给出操作建议，不自动勾选具有破坏性的操作。
5. 自动探测必须跳过 `.git`、构建输出、依赖缓存和符号链接，并设置数量与深度上限。

### 路径与 JSON

配置增加明确的路径基准。位于当前工作目录内且可稳定表达的路径，保存为相对路径；不同盘符或工作目录之外的路径保留绝对路径。加载、预检和执行前统一解析为规范化绝对路径，界面仍显示用户保存的表达形式。

项目节点形态：

```json
{
  "schemaVersion": 2,
  "workingDirectory": "E:\\codeMaster",
  "projects": [
    {
      "enabled": true,
      "name": "XyCore",
      "path": "XyCore",
      "branch": "master",
      "operations": {
        "update": true,
        "cmake": true,
        "caa": false,
        "linkCaa": false
      },
      "probe": {
        "commit": "9f5ab7a1304c",
        "origin": "ssh://example/XyCore.git",
        "status": "clean"
      }
    }
  ]
}
```

`probe` 是上次探测快照，可保存用于比较，但执行前必须重新探测；不能把旧快照当成当前事实。

### 插件脚本与 Root 脚本

整体启动的仓库任务已不再调用 `Invoke-AutoBuild.ps1`；该文件继续随 VSIX 提供离线兼容用途。View 对 Root 同路径副本执行 SHA-256 检查：

- 一致时显示“脚本一致”，但“同步脚本”仍可点击，以便用户显式重新覆盖目标脚本；
- 不一致时显示“脚本不一致”，但不静默覆盖；
- 仅在用户点击“同步脚本”后执行明确覆盖；
- 同步造成的 Git 修改必须进入仓库状态，不得隐藏。

CAA 项目的 `mk.ps1` 仍在项目目录中无参数运行；若其 Root 代理缺失则报告脚本问题。标准 CMake 只要求 `CMakeLists.txt`。Primary 的 **CMake Debug / Release** 默认均选，可只选 Release；保存到 AutoBuild JSON 的 `cmakeBuildTypes` 数组，旧 JSON 缺字段默认两项。输出保持 `<项目父目录>/build/<项目名><配置>`。离线导出的 PS1 尚遵循 mk.ps1 自身配置，不消费这个新增选择。

### 编译版本归档

“脚本”浮动窗口提供“版本归档”页签，将当前探测结果写入一个 `BUILD_MANIFEST.json`。用户可选择保存到当前 `ROOT_DIR` 或配置中的工作目录。

- 文件只维护一份顶层仓库列表，不按构建次数创建 `tasks`、`builds` 或其他历史数组。
- 每次固定记录 Root 与 3rdParty，并只加入本次启用且勾选 CMake/CAA 编译的项目；仅更新但未参与编译的仓库不写入。
- “覆盖保存”使用本次集合重写文件；“追加或更新”保留已有仓库，相同 Origin 更新分支与完整 Commit，新 Origin 追加。
- 仓库最终按 Origin 字母顺序稳定排序；无 Origin 时按角色和名称排序，以减少版本控制中的无意义顺序变化。
- `role` 使用固定枚举：Root 为 `root`，3rdParty 为 `thirdParty`，普通构建仓库为 `project`；不写入“更新的库”等界面显示名称。
- `buildKinds` 只用于 `project`，可选值固定为 `cmake`、`caa`，同时存在时按 `cmake`、`caa` 的顺序写入。Root 与 3rdParty 不包含该字段。
- 旧角色值和旧格式不兼容读取；发现无效枚举或乱序、重复的 `buildKinds` 时直接报告配置错误。
- 输出不包含任务明细、并行模式、构建编号或开始时间。
- 写入采用同目录临时文件后重命名替换，避免留下不完整 JSON。

### 并行与失败策略

- 插件仓库任务逐仓库执行 TS Git；失败逐项记录，继续独立仓库。脏仓库保留并跳过更新，后续构建使用当前工作树。
- Windows 保留 export.ps1 并行调用；非 Windows 明确标记跳过后再进入 CMake。
- Windows 按“并行编译”选择运行；非 Windows 当前统一顺序编译 CMake，保留并行选项供 Windows 使用。
- 单个导出或编译失败不取消其他同阶段任务，最后统一统计。

### 手动清理

- 编译工具 Primary 执行区的“清理”打开统一对话框，可选规则清理、CMake 清理和 Git 强制恢复。
- 规则清理可分别选择 ROOT_DIR 或工作目录，规则缓存到当前 AutoBuild JSON；默认只匹配直属
  `objects/build` 与 `*.obj/*.exp/*.pdb/test_*.exe`。
- CMake 清理删除项目自身 `build`；共享工作目录 `build` 只清空内容并保留目录。
- Git 强制恢复单独标为高风险，预览并确认后执行 `reset --hard HEAD + clean -ffdx`。
- 所有方式都先冻结精确命中并在执行前复验；不会在加载或预检时自动执行，也不会顺带删除预览后新增的内容。
- Run 的既有快捷清理仍待接入同一个 Wing 对话框；在接入完成前不得删除其现有能力。
