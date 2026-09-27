# tools 脚本说明

> 维护边界：本文与对应脚本已迁入 KT Auto Code。源码真源为 `scripts/auto-build/` 与 `scripts/sample/`；`ROOT_DIR/tools`、`ROOT_DIR/sample` 只是由 Auto Code 显式同步产生的运行副本，不再反向维护。

KtRoot 的 `tools/` 目录集中存放环境设置、CAA 构建、CMake 出库构建和代码格式化脚本。各出库源码仓（out-repo）只需在工程根目录保留少量转发脚本，公共逻辑统一放在 `ROOT_DIR/tools/`。

相关文档：

- [Core SDK 与 CMake 目录规则](<Core SDK 与 CMake 目录规则.md>)
- [CMake 公共模块与项目接入规则](<CMake 公共模块与项目接入规则.md>)
- [批量工程脚本设计](<批量工程脚本设计.md>)

---

## 1. 脚本总览

| 文件 | 类型 | 作用 |
| --- | --- | --- |
| `envSet.ps1` | 可执行 | Windows：设置 `ROOT_DIR`、`SDK_PREFIX`、`ROOT_DIR_CORE` 等环境变量 |
| `envSet-linux.sh` | 可 source | Linux：同上（shell 环境） |
| `envSet-macos.sh` | 可 source | macOS：同上（shell 环境） |
| `commonLoad.ps1` | 模块入口 | 出库仓 dot-source 入口，加载公共 `common*.ps1` |
| `common.ps1` | 模块 | CAA / 批处理通用函数 |
| `commonExport.ps1` | 模块 | 头文件与 SDK 包导出 |
| `commonCAAExport.ps1` | 模块 | 通用 CAA Framework 与运行产物发布 |
| `commonCmake.ps1` | 模块 | CMake configure + build、清理、批量开构建窗口 |
| `buildFunction.ps1` | 可执行 | 单配置 CMake 构建（Debug 或 Release），供构建窗口调用 |
| `invokeAll.ps1` | 内部执行器 | 为通用批量入口搜索并顺序执行 `.ps1` / `.bat` |
| `rebuildAll.ps1` | 可执行 | 查找一级子目录中的 `rebuild.ps1` 并逐个调用，不额外创建窗口 |
| `exportAll.ps1` | 可执行 | 查找 1–3 级目录中的 `export.ps1` / `export.bat` 并逐个调用 |
| `linkFramework.ps1` | 可执行 | 把多仓 CAA Framework 聚合到版本工作区并补充入口脚本 |
| `linkWinb64.ps1` | 可执行 | 把各 CAA 工作区的 `win_b64` 链到聚合输出 |
| `linkCAA.ps1` | 可执行 | 依次完成 Framework 聚合与 `win_b64` 共享 |
| `cmakeAll.ps1` | 可执行 | 发现 CMake 项目并为每个项目打开独立构建窗口 |
| `caaAll.ps1` | 可执行 | 统一链接后打开多个窗口并行编译 CAA workspace |
| `mkAll.ps1` | 可执行 | CMake + CAA 混合批量构建总入口 |
| `cloneClangformat.ps1` | 可执行 | 递归覆盖或检查扫描根下已有的 `.clang-format` |
| `exportCAAFramework.ps1` | 可执行 | 将明确指定的一个 CAA Framework 导出到调用者指定目录 |
| `publish.ps1` | 可执行 | 发布标准 CAA `win_b64` 运行产物 |
| `clangfile.ps1` | 可执行 | 递归扫描工作区并执行 `clang-format`（检查或修复） |
| `mk.ps1` | 可执行 | 单工程入口：自动选择 CMake 或 CAA 构建流程 |
| `run.ps1` | 可执行 | CAA `mkrun -c cnext` 启动流程 |
| `buildErrorSummary.ps1` | 模块 | 编译输出错误分类与汇总（由 `mk.ps1` dot-source） |
| `LinkWinb64Common.ps1` | 模块 | CAA `win_b64` 目录符号链接的创建/删除辅助函数 |

---

## 2. 环境变量脚本

### `envSet.ps1`（Windows）

在当前 PowerShell 进程中设置 SDK 环境变量；也可用 `-PersistUser` 写入用户级环境变量。

```powershell
. .\tools\envSet.ps1
. .\tools\envSet.ps1 -SdkPrefix myco -PersistUser
```

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-SdkRoot` | KtRoot 根目录 | 对应 `ROOT_DIR` |
| `-SdkPrefix` | `kt` | 对应 `SDK_PREFIX` |
| `-CoreRoot` | `$SdkRoot/$SdkPrefix/core` | 对应 `ROOT_DIR_CORE` |
| `-IncludeRoot` | `$CoreRoot/include` | 对应 `ROOT_DIR_INCLUDE` |
| `-ThirdPartyRoot` | `$SdkRoot/3rdParty` | 对应 `ROOT_DIR_3rdParty` |
| `-CaaMkVersion` | `19` | 对应 `CAA_MK_VERSION` |
| `-PersistUser` | — | 同时写入用户环境变量 |

### `envSet-linux.sh` / `envSet-macos.sh`

在对应平台的 shell 中 source 后导出同名变量（默认值与 Windows 一致）：

```sh
. ./tools/envSet-linux.sh
. ./tools/envSet-macos.sh
```

---

## 3. CAA 脚本

面向 CATIA CAA / RADE 环境（默认安装路径 `C:\DS\RADE{版本}\intel_a`）。

### `mk.ps1`

单工程统一入口。目录存在 `CMakeLists.txt` 时，先执行项目根目录已有的 `export.ps1`，再执行 CMake Debug、Release 串行构建；导出失败会在构建后报告，但不阻止编译。否则保持传统 CAA 流程：依次调用 `tck_init`、`tck_profile`、`mkGetPreq`、`mkmk -au`、`mkrtv`。

```powershell
.\tools\mk.ps1
.\tools\mk.ps1 -Project 'C:\Example\LibraryProject' -ProjectType CMake -BuildType Debug,Release
.\tools\mk.ps1 -Version 20 -Workspace 'C:\MyCaaWorkspace'
.\tools\mk.ps1 -ShowMajorErrors    # 同时列出大写 ERROR 行
.\tools\mk.ps1 -UseBat             # 回退到 mk.bat（若存在）
```

| 参数 | 说明 |
| --- | --- |
| `-Version` | RADE 版本，默认读 `CAA_MK_VERSION`，再默认 `19` |
| `-Workspace` | CAA 工作区路径 |
| `-Project` | 待编译的源码项目；默认当前目录 |
| `-ProjectType` | `Auto`、`CMake` 或 `CAA`；默认 `Auto` |
| `-BuildType` | CMake 配置数组；默认 `Debug,Release` |
| `-ShowMajorErrors` | 汇总中显示大写 `ERROR` / `[ERROR]` 行（默认只显示数量） |
| `-UseBat` | 调用同目录 `mk.bat` 而非 PowerShell 实现 |
| `-Help` | 显示帮助 |

CAA 工程根目录可放一行转发的 `mk.ps1`：

```powershell
& "$env:ROOT_DIR/tools/mk.ps1" @args
```

### `run.ps1`

等价于传统 `run.bat`：初始化 CAA 环境后执行 `mkrun -c cnext` 启动 CNEXT。

```powershell
.\tools\run.ps1
.\tools\run.ps1 -Version 20 -Workspace 'C:\MyCaaWorkspace'
```

### `buildErrorSummary.ps1`

不单独运行。由 `mk.ps1` dot-source 后提供：

| 函数 | 作用 |
| --- | --- |
| `Add-BuildOutputLine` | 逐行输出并分类：`error` → 小写错误；`ERROR` / `[ERROR]` → 大写错误 |
| `Show-BuildErrorSummary` | 构建结束时打印汇总；`-ShowMajorErrors` 展开大写 ERROR 列表 |

保留 `文件(行,列): error ...` 原文，便于 VS Code / Windows Terminal 点击跳转。

### `LinkWinb64Common.ps1`

不单独运行。供 CAA 工程中将 `win_b64` 下多个目录链接到统一 SDK 头的脚本 dot-source 使用。

| 函数 | 作用 |
| --- | --- |
| `Remove-SymbolicLinkOrFolder` | 删除目录或 Junction 符号链接 |
| `New-SymbolicLink` | 创建 Junction 链接 |
| `Remove-SymbolicLinkList` | 批量删除 |
| `New-SymbolicLinkList` | 批量创建（相对同一 `SourceDir`） |
| `Show-ScriptHeader` / `Show-ScriptFooter` | 统一脚本头尾输出 |

---

## 4. CMake 出库构建脚本

适用于 KtCore 等 CMake 源码仓。构建产物目录约定为：

```text
<父目录>/build/<工程名>Debug
<父目录>/build/<工程名>Release
```

DLL / LIB 由 CMake 按平台写入 `ROOT_DIR_CORE` 的 `debug/`、`bin/`（见 Core SDK 文档）。

### 出库仓根目录约定脚本

各 CMake 源码仓在**工程根目录**只保留以下转发脚本（逻辑在 KtRoot）：

| 文件 | 作用 | 典型 Tab |
| --- | --- | --- |
| `export.ps1` | 导出头文件（及 SDK 的 lib/dll）到 `ROOT_DIR_CORE` | `ex` |
| `rebuild.ps1` | 清理 build 目录 → `export` → 打开 Debug / Release 两个构建窗口 | `reb` |
| `clangfile.ps1` | 对本仓递归 `clang-format` | `cl` |

**`export.ps1` 示例（单库 CMake 仓）：**

```powershell
. "$env:ROOT_DIR/tools/commonLoad.ps1"

Invoke-Export -RepoRoot $PSScriptRoot -LibNames @('KtCore')
```

**`rebuild.ps1` 示例（各仓相同）：**

```powershell
. "$env:ROOT_DIR/tools/commonLoad.ps1"
Start-BuildAll -RepoRoot $PSScriptRoot
```

**`clangfile.ps1` 示例（单行）：**

```powershell
& "$env:ROOT_DIR/tools/clangfile.ps1" -w $PSScriptRoot @args
```

### `buildFunction.ps1`

在独立 PowerShell 窗口中执行一次 configure + build。通常由 `Start-BuildAll` 通过 `cmd start` 拉起，窗口标题为 `<工程名> Debug` / `<工程名> Release`。

```powershell
& "$env:ROOT_DIR/tools/buildFunction.ps1" -BuildType Debug -WorkDir 'E:\out\KtCore'
```

| 参数 | 说明 |
| --- | --- |
| `-BuildType` | `Debug`（默认）或 `Release` |
| `-WorkDir` | CMake 工程根目录（含 `CMakeLists.txt`） |
| `-WindowTitle` | 控制台窗口标题，默认同上 |

### `clangfile.ps1`

对工作区递归扫描 `.c`、`.cpp`、`.h`、`.hpp` 等源文件，使用工作区内的 `.clang-format`（`clang-format -style=file`）。自动跳过 `.git`、`build`、`win_b64`、`ImportedInterfaces` 等目录。

```powershell
.\tools\clangfile.ps1 -w 'E:\out\KtCore' -Check    # 只检查，不改文件；有问题 exit 1
.\tools\clangfile.ps1 -w 'E:\out\KtCore' -Fix      # 原地格式化（默认模式）
.\tools\clangfile.ps1 -w 'E:\out\KtCore'           # 同 -Fix
```

| 模式 | 行为 | 退出码 |
| --- | --- | --- |
| `-Check` | `--dry-run --Werror`，不写文件 | 有问题 → `1`；全部合规 → `0` |
| `-Fix`（默认） | `-i` 原地修改 | 始终 `0`；输出 `Review: FAIL` + `Format: OK (N updated)` |

依赖 PATH 中的 `clang-format.exe`。

---

## 5. 公共模块（`common*.ps1`）

### `commonLoad.ps1`

出库仓统一入口，依次加载：

```powershell
. "$env:ROOT_DIR/tools/commonLoad.ps1"
```

内部加载：`common.ps1` → `commonExport.ps1` → `commonCAAExport.ps1` → `commonCmake.ps1`。

### `common.ps1` — CAA / 通用

| 函数 | 作用 |
| --- | --- |
| `Get-CAA-Version` | 读 `CAA_MK_VERSION`，默认 `19` |
| `Get-CAA-WorkspaceNames` | 在父目录下按 `IdentityCard.h` / `Imakefile.mk` 结构发现一级 CAA 工作区名 |
| `Get-CAA-RunBatchPaths` | 解析 RADE 批处理路径（`tck_init`、`tck_profile` 等） |
| `Test-WorkspaceFileCheck` | 检查多个工作区下是否存在指定脚本（如 `clangfile.ps1`） |
| `Start-WorkspaceTasks` | 为每个有效工作区新开 PowerShell 窗口执行指定脚本 |
| `Invoke-BatchCommands` | 将多条 `cmd` 命令写入临时 `.bat` 并执行，可选先 `cd` 到工作区 |

### `commonExport.ps1` — 导出

| 函数 | 作用 |
| --- | --- |
| `Get-RootDirCore` | 解析 `ROOT_DIR_CORE`；`-AllowRootDirFallback` 时可用 `ROOT_DIR` + `SDK_PREFIX`（默认 `kt`）推断 |
| `Export-PublicHeaders` | CMake 仓：`public/<Lib>/*.h` → `include/<Lib>/` |
| `Export-SdkPackage` | SDK 仓：复制 `include/` 与 `bin/*.lib|dll` 到 `ROOT_DIR_CORE` |
| `Invoke-Export` | 导出入口：打印标题，遍历 `-LibNames` / `-SdkPackages` |

默认 public 路径：`<LibName>/public/<LibName>/`。

### `commonCmake.ps1` — CMake 构建

| 函数 | 作用 |
| --- | --- |
| `Set-ConsoleTitle` | 设置当前控制台窗口标题 |
| `Test-CMakeProjectDirectory` | 使用根 `CMakeLists.txt` 判断 CMake 项目 |
| `Get-CMakeProjectDirectories` | 按深度发现最浅的独立 CMake 项目根 |
| `Invoke-CMakeBuild` | 单次 `cmake -S -B` + `cmake --build` |
| `Clear-CMakeBuildDirs` | 删除 `<父目录>/build/<工程名>Debug|Release` |
| `Start-BuildAll` | `Clear` → 本仓 `export.ps1` → 为每种配置 `start` 一个 `buildFunction.ps1` 窗口 |

`Start-BuildAll` 使用 `cmd.exe /c start "标题" powershell ...` 打开构建窗口，以便窗口标题正确显示。

---

## 6. 典型工作流

### 首次配置环境（Windows）

```powershell
cd E:\ToolRoot
. .\tools\envSet.ps1
```

### CMake 库：导出并重建

在出库源码仓根目录：

```powershell
.\export.ps1      # 仅导出头文件 / 二进制到 ROOT_DIR_CORE
.\rebuild.ps1     # 清理 + 导出 + 开 Debug/Release 构建窗口
```

### CAA 工程：编译与运行

```powershell
cd C:\MyCaaAddon
.\mk.ps1 -Workspace $PWD
.\run.ps1 -Workspace $PWD
```

### 代码格式检查（CI / 提交前）

```powershell
.\clangfile.ps1 -Check
```

---

## 7. 依赖关系简图

```text
envSet.ps1 / envSet-*.sh
    └── 设置 ROOT_DIR、ROOT_DIR_CORE、SDK_PREFIX ...

出库仓 export.ps1 / rebuild.ps1
    └── commonLoad.ps1
            ├── common.ps1
            ├── commonExport.ps1     → Invoke-Export / Export-*
            ├── commonCAAExport.ps1  → Export-CAAFramework / Publish-CAARuntime
            └── commonCmake.ps1      → Start-BuildAll / Invoke-CMakeBuild
                    └── buildFunction.ps1

出库仓 clangfile.ps1
    └── tools/clangfile.ps1

CAA 工程 mk.ps1
    └── tools/mk.ps1
            └── buildErrorSummary.ps1

CAA 工程 run.ps1
    └── tools/run.ps1
            └── common.ps1

LinkWin*.ps1（CAA 链接脚本，若有）
    └── LinkWinb64Common.ps1
```

---

## 8. 命名与约定

- 出库仓根目录**不要**再放 `buildAll.bat`、`export.bat` 等旧入口；统一用 `export.ps1` / `rebuild.ps1`。
- 子目录（如 `KtCore/`、`tests/`）**不要**再放同名 `export.ps1` / `clangfile.ps1`；根目录脚本已递归处理。
- `rebuild` 前缀建议用 `reb` Tab 补全，避免与 `README.md` 的 `re` 冲突。
- `ROOT_DIR` 必须指向 KtRoot（或公司 fork 的 SDK 根）；未设置时 dot-source `commonLoad.ps1` 会自然报错。
