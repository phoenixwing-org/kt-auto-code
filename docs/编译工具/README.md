# Auto Build（首版）

状态：试用

插件内置的主编排脚本位于 [`scripts/auto-build/Invoke-AutoBuild.ps1`](../../scripts/auto-build/Invoke-AutoBuild.ps1)。插件始终运行这份随版本发布的脚本；用户可以在界面中显式同步到 `ROOT_DIR\tools\Invoke-AutoBuild.ps1`，作为脱离 UI 的命令行入口。

脚本先处理 Git 仓库，再执行构建：

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
- 单行重新探测、单独运行和移除操作。

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

插件运行时始终使用 VSIX 内置的 `Invoke-AutoBuild.ps1`，避免依赖 Root 中恰好存在同版本副本。View 对 Root 同路径副本执行 SHA-256 检查：

- 一致时显示“脚本一致”；
- 不一致时显示“脚本不一致”，但不静默覆盖；
- 仅在用户点击“同步脚本”后执行明确覆盖；
- 同步造成的 Git 修改必须进入仓库状态，不得隐藏。

项目自己的 `mk.ps1` 始终在项目目录中无参数运行；若它是 `$env:ROOT_DIR/tools/mk.ps1` 代理而当前 Root 缺少该脚本，项目表显示“脚本不一致”。后续复杂顺序仍用阶段或 DAG 表达重试和断点续跑，不用表格行位置暗示依赖。

### 并行与失败策略

- 仓库预检完成后，各仓库更新作为独立 PowerShell Job 并行执行；任一失败在全部结束后汇总。
- 所有存在的 `export.ps1` 并行执行；全部结束后才进入编译。
- “并行编译”复选框未勾选时按 CMake → CAA 顺序逐项执行；勾选时 CMake 与 CAA 全部同时启动。
- 单个导出或编译失败不取消其他同阶段任务，最后统一统计。

### 手动清理

- Run Block 靠前的“清理”节点提供“删除 build 目录”“删除 objects 目录”“删除 *.obj”三个点击即执行的当前工作目录操作。
- 编译工具 View 的“手动清理 Root”按用户输入前缀（不区分大小写）删除 `.h/.hh/.hpp/.hxx/.dll/.lib`。
- 两种清理都不在加载或预检时自动执行，递归时跳过 `.git` 和符号链接；清理产生的 Root 修改显示为“有修改”，不会阻断其他任务。
