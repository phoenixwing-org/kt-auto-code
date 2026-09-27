# CMake 外部构建与批量编译方案

> 维护边界：本文与对应脚本已迁入 KT Auto Code。源码真源为 `scripts/auto-build/` 与 `scripts/sample/`；`ROOT_DIR/tools`、`ROOT_DIR/sample` 只是由 Auto Code 显式同步产生的运行副本，不再反向维护。

## 1. 文档状态

本文是分阶段实施计划。第一阶段先统一根工具中的工程发现规则并补充脱敏测试；项目自身的 CMake 文件和 VS Code workspace 暂不修改。

## 2. 目标

1. CMake 的缓存、工程文件、中间文件和编译结果统一放到源码项目外部。
2. VS Code CMake Tools、`mk.ps1`、`rebuild.ps1` 使用相同的构建目录规则。
3. CMake 与 CAA 项目可以在同一个上级目录中并列，也允许同一个 Git 仓库同时包含两类项目。
4. 一个项目失败不能阻止其他项目继续编译。
5. 暂不分析跨项目依赖和编译顺序；依赖图与顺序调度留给后续 Web 工具。

## 3. 当前情况

- `tools/commonCmake.ps1` 已使用外部目录：`<源码上级>/build/<项目名><Debug|Release>`。
- 例如 `E:\out\ExampleLibrary` 的目标目录是：
  - `E:\out\build\ExampleLibraryDebug`
  - `E:\out\build\ExampleLibraryRelease`
- 多数项目的 `.vscode/settings.json` 没有设置 `cmake.buildDirectory`，VS Code CMake Tools 仍可能使用项目内部默认目录。
- 集合根的 VS Code 设置如果把 `cmake.sourceDirectory` 固定为某一个具体项目，就不适合作为多个并列项目的统一入口。
- 一个混合仓库可能在根目录包含 `CMakeLists.txt`，同时在子目录包含多个具有 `IdentityCard/IdentityCard.h` 和模块级 `Imakefile.mk` 的 CAA workspace，不能按 Git 仓库二选一分类。

构建目录不是由 `CMakeLists.txt` 决定的，而是由调用 CMake 时的 `-B`、CMake Presets 的 `binaryDir` 或 VS Code 的 `cmake.buildDirectory` 决定。

## 4. 统一目录规则

推荐固定为：

```text
<SourceParent>/build/<SourceName><Configuration>
```

示例：

```text
E:\out\ExampleCore
  -> E:\out\build\ExampleCoreDebug
  -> E:\out\build\ExampleCoreRelease

E:\workspace\MixedRepository
  -> E:\workspace\build\MixedRepositoryDebug
  -> E:\workspace\build\MixedRepositoryRelease
```

规则要求：

- 不在源码目录中创建 `build`、`out` 或生成器目录。
- Debug 和 Release 使用不同目录，不能共用 `CMakeCache.txt`。
- 项目名进入目录名，避免多个并列项目互相覆盖。
- CAA 的 `win_b64` 与 `CAAB<Version>MkWsp` 保持现有规则，不与 CMake 构建目录合并。

## 5. VS Code 快速统一方案

当 VS Code 直接打开一个 CMake 项目目录时，在项目的 `.vscode/settings.json` 中加入：

```json
{
  "cmake.sourceDirectory": "${workspaceFolder}",
  "cmake.buildDirectory": "${workspaceFolder}/../build/${workspaceRootFolderName}${buildType}"
}
```

这与现有 `commonCmake.ps1` 的目录规则一致。CMake Tools 官方文档确认 `cmake.buildDirectory` 用于指定生成 `CMakeCache.txt` 的根目录，并支持 `${workspaceFolder}`、`${workspaceRootFolderName}` 和 `${buildType}` 等替换变量：[CMake Tools settings](https://github.com/microsoft/vscode-cmake-tools/blob/main/docs/cmake-settings.md)。

注意事项：

- 该设置适合“每个 CMake 项目作为一个 VS Code workspace folder”。
- 多项目建议使用 multi-root `.code-workspace`，把每个源码项目作为独立 folder 加入。
- 不建议继续在 `E:\out` 单目录 workspace 中把 `cmake.sourceDirectory` 写死为某一个项目。
- CMake Tools 切换 Debug/Release 后，应检查状态栏显示的 build directory 是否同步切换。

## 6. 长期推荐：CMake Presets

长期建议每个 CMake 项目提交 `CMakePresets.json`，使 VS Code、命令行和 CI 使用同一构建目录。基础示例：

```json
{
  "version": 3,
  "configurePresets": [
    {
      "name": "debug",
      "displayName": "Debug",
      "binaryDir": "${sourceParentDir}/build/${sourceDirName}Debug",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug"
      }
    },
    {
      "name": "release",
      "displayName": "Release",
      "binaryDir": "${sourceParentDir}/build/${sourceDirName}Release",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release"
      }
    }
  ],
  "buildPresets": [
    {
      "name": "debug",
      "configurePreset": "debug",
      "configuration": "Debug"
    },
    {
      "name": "release",
      "configurePreset": "release",
      "configuration": "Release"
    }
  ]
}
```

CMake 官方文档确认 `binaryDir` 支持宏展开，`${sourceParentDir}` 是源码目录的上级目录，`${sourceDirName}` 是源码目录名：[cmake-presets(7)](https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html)。

实施 Presets 时：

- `CMakePresets.json` 保存团队共享规则并提交 Git。
- 机器特有的生成器、工具链和本地路径放入不提交的 `CMakeUserPresets.json`。
- VS Code 设置 `"cmake.useCMakePresets": "always"`。
- Visual Studio 多配置生成器仍通过 build preset 的 `configuration` 区分 Debug/Release。
- 在确认所有项目使用的 CMake 版本支持 preset version 3 后再批量推广。

## 7. 脚本职责与实施状态

### 7.1 `commonCmake.ps1`

- 已新增最浅层 CMake 项目发现函数；命中项目根后不再把内部 `CMakeLists.txt` 当成独立项目。
- `Invoke-CMakeBuild`、清理函数和批量脚本共用外部构建目录规则。
- 输出中明确显示源码目录、构建目录和配置类型。

### 7.2 `mk.ps1`

- 保持现有 CAA 参数兼容。
- 自动识别当前目录或 `-Project` 指定目录：
  - 有 CAA workspace 标记时走 CAA。
  - 有根 `CMakeLists.txt` 时走 CMake。
- CMake 单项目默认 Debug、Release 串行执行。
- 项目根目录存在 `export.ps1` 时先执行导出，再开始 CMake 构建；导出失败会在构建结束后报告，但不会跳过后续配置。
- 一个配置失败后仍尝试另一个配置，最后汇总该项目结果。

### 7.3 `cmakeAll.ps1`（CMake 专用启动器）

- 独立扫描 CMake 项目，不依赖 Git 仓库边界。
- 发现某目录的根 `CMakeLists.txt` 后，不再把它内部的子级 `CMakeLists.txt` 当成独立项目。
- 项目之间默认独立弹窗并行；每个窗口内部先执行已有的 `export.ps1`，再串行执行 Debug、Release。
- 一个项目失败不关闭或停止其他项目窗口。
- 支持 `-ListOnly`，先展示识别结果而不编译。
- 作为 `mkAll.ps1` 的内部能力，同时保留直接调用方式，便于只编译 CMake 项目和单独点检。

### 7.4 CAA 专用启动器

- 原 `mkAll.ps1` 中的 CAA workspace 扫描、链接和并行弹窗能力已下沉到 `caaAll.ps1`。
- `caaAll.ps1` 保留直接调用方式，但不是普通用户的首选入口。
- CMake 和 CAA 使用两套独立扫描结果，同一 Git 可以同时出现在两组中。

### 7.5 `mkAll.ps1`（混合总入口）

- `mkAll.ps1` 已改为用户面对的统一总入口，同时调用 CMake 与 CAA 两组启动器。
- 默认扫描调用位置或 `-Folder` 指定目录，不把工具仓库位置误当成项目扫描范围。
- 先完成两类项目发现并展示清单，再启动编译；同一 Git 可以同时贡献一个 CMake 根和若干 CAA workspace。
- 支持只运行一类工程，例如 `-Type CMake`、`-Type CAA`；默认值为 `All`。
- `-ListOnly` 只展示 CMake、CAA 两组识别结果，不创建链接、不打开窗口、不执行编译。
- 当前阶段只负责全部启动，不引入项目依赖顺序。
- 某项目失败只影响该项目的最终状态，不阻止其他项目。
- 总入口报告“启动成功数”，不把“窗口已启动”误报成“项目编译成功”。
- 现有只编译 CAA 的 `mkAll.ps1` 行为在迁移后由 CAA 专用启动器承接，避免功能丢失。

## 8. 项目识别规则

### CMake

- 识别根 `CMakeLists.txt`。
- 从扫描根开始广度优先查找，选择最浅层项目。
- 选中一个 CMake 项目根后停止向其内部继续查找，避免把 `tests`、库子目录等重复编译。

### CAA

- Framework 级主要标记为 `IdentityCard/IdentityCard.h`。命中后，Framework 的父目录视为候选 CAA workspace。
- Module 级主要标记为 `Imakefile.mk`。命中后，从 Module 目录回溯到 Framework，再以 Framework 的父目录作为候选 workspace。
- Framework 和 Module 的名称没有固定后缀，不使用 `*Frm`、`*Interfaces`、`*Tlb`、`*.edu` 等名称判断工程类型。
- `CATIAV5Level.lvl` 可能在尚未编译时不存在，只能作为展示信息，不参与 workspace 身份判定，也不能成为发现 workspace 的必要条件。
- 来自多个 Framework 或 Module 的结果按规范化 workspace 路径去重；命中 workspace 后不把其内部 Framework、Module 当成独立 workspace。
- CAA 扫描不因为同一个 Git 已被识别为 CMake 而停止。

公共 `common.ps1` 负责统一识别 `IdentityCard/IdentityCard.h`、Framework 根部 `IdentityCard.h` 和 Module 级 `Imakefile.mk`；链接与编译脚本必须共用该发现结果，避免两套扫描规则不一致。脱敏单元测试只保存在根工具仓库，运行时在系统临时目录构造虚拟工程树，不在真实项目中写入测试结构。

### 通用忽略目录

```text
.git
.hg
.svn
.vs
.vscode
.clone
.worktrees
build
cmake-build-*
CMakeFiles
win_b64
CAAB*MkWsp
node_modules
```

同时跳过 junction 和 symbolic link，避免循环扫描和重复项目。

## 9. 失败隔离规则

- 批量脚本必须对每个项目单独记录退出码。
- 串行模式中，一个项目失败后继续下一个项目。
- 并行模式中，每个项目使用独立 PowerShell 窗口和工作目录。
- Debug 失败不阻止同一项目继续尝试 Release。
- 最终汇总区分：发现、启动、成功、失败，不能只显示一个总退出码。
- 不因一次失败自动清理构建目录；允许用户重复执行，使已完成的依赖逐步收敛。

## 10. 迁移步骤

1. 选一个小型 CMake 项目验证外部 Debug/Release 目录。
2. 给项目添加 workspace `cmake.buildDirectory`，确认 VS Code 与 `rebuild.ps1` 指向相同位置。
3. 验证 Configure、Build、CTest、调试和 `compile_commands.json`。
4. 实现统一构建目录函数，并让 `mk.ps1`、`rebuild.ps1` 共用。
5. 用脱敏 fixture 验证 CAA workspace 发现规则，并以实际集合根做只读点检；真实目录名和产品名不得进入 fixture 或测试输出。
6. 实现 `cmakeAll.ps1 -ListOnly`，用真实混合目录点检 CMake 识别结果。
7. 把原 `mkAll.ps1` 的 CAA 批量能力下沉，并用原有用例验证行为没有退化。
8. 将 `mkAll.ps1` 改造成混合总入口，验证 `All`、`CMake`、`CAA` 和 `ListOnly` 四种调用路径。
9. 实现并行启动与失败隔离，不加入依赖顺序。
10. 在所有项目验证通过后，再清理源码目录内的旧构建目录。
11. 最后评估是否从 workspace 设置迁移到 CMake Presets。

## 11. 验收标准

- 源码 Git 状态不会因为编译新增构建文件。
- VS Code 和 PowerShell 对同一项目、同一配置使用完全相同的构建目录。
- Debug、Release 缓存互不污染。
- `E:\out` 能正确识别并列的 CMake 和 CAA 项目。
- 脱敏混合仓库样例能识别一个顶层 CMake 项目和多个 CAA workspace，不重复识别内部 CMake 子目录。
- `mkAll.ps1` 默认同时列出并启动 CMake 与 CAA 两组工程，`-Type` 可以限制工程类型。
- 直接调用 `cmakeAll.ps1` 或 CAA 专用启动器时，结果与 `mkAll.ps1` 对应分组一致。
- 任意一个项目失败后，其余项目仍继续运行。
- `-ListOnly` 不创建目录、不修改链接、不启动编译。

## 12. 后续 TODO

- 用 Web 工具展示项目依赖图、分支信息和构建状态。
- 在依赖图稳定后再增加拓扑排序、分层并行和增量重试。
- 评估是否输出机器可读的 JSON 构建报告，供 Web 页面读取。
