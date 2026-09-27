# CMake 目录规则

> 维护边界：本文与对应脚本已迁入 KT Auto Code。源码真源为 `scripts/auto-build/` 与 `scripts/sample/`；`ROOT_DIR/tools`、`ROOT_DIR/sample` 只是由 Auto Code 显式同步产生的运行副本，不再反向维护。

本文档定义 `kt` SDK 的公共头文件、平台运行库、链接库和 CMake package 目录约定，适用于 Windows、macOS 和 Linux。

## 平台目录规则

当前 `kt/core/` 作为 Windows 平台 SDK 目录保留。其他平台使用同级平台目录：

```text
kt/
├── core/       # Windows
├── macos/
│   └── core/   # macOS
└── linux/
    └── core/   # Linux
```

- KtCore 头文件不区分操作系统，统一归档在 `kt/core/include/KtCore/`，以兼容 CAA 的固定引用路径。
- `ROOT_DIR_CORE` 是环境变量，默认表示 `<ROOT_DIR>/kt/core`，不是平台库输出目录。
- `ROOT_DIR_INCLUDE` 默认取 `<ROOT_DIR_CORE>/include`；显式设置后，CMake/export 使用指定目录。
- DLL、动态库和链接库按 Windows、macOS、Linux 分别归档。

## 组织目录前缀适配

示例中的 `kt` 只是当前组织使用的目录前缀，不是固定要求。其他组织可以将 `kt` 替换为自己的目录名称，并通过环境变量适配，不需要修改 CMake target 或头文件引用方式。

例如组织使用 `company` 作为目录前缀：

```text
<SDK_ROOT>/
└── company/
    ├── core/              # Windows
    ├── macos/core/        # macOS
    └── linux/core/        # Linux
```

对应配置：

```text
ROOT_DIR          = <SDK_ROOT>
ROOT_DIR_CORE     = <SDK_ROOT>/company/core        # 各系统共用的 Core 根目录
ROOT_DIR_INCLUDE  = <SDK_ROOT>/company/core/include
```

当目录前缀不是 `kt` 时，应显式设置 `ROOT_DIR_CORE` 和 `ROOT_DIR_INCLUDE`；CMake 会优先使用这两个变量。

## 平台适配规则

库名统一使用 CMake target 名称 `KtCore`，由 CMake 根据平台生成文件名：

| 平台 | 动态库 | 静态库 |
| --- | --- | --- |
| Windows | `KtCore.dll`，导入库 `KtCore.lib` | `KtCore.lib` |
| macOS | `libKtCore.dylib` | `libKtCore.a` |
| Linux | `libKtCore.so` | `libKtCore.a` |

源码和 CMake 文件不手动拼接平台后缀；下游项目通过 `Kt::Core` target 链接。

### package 的平台隔离

`KtCoreTargets.cmake` 及其 `debug`、`release` 配置文件由当前平台的 CMake 生成，里面包含实际库文件路径，不能跨平台直接复用。

- macOS 上生成的 package 只能指向 macOS 的 `.dylib` 或 `.a`。
- Windows 上需要重新运行 CMake，生成指向 `.dll`、`.lib` 的 package。
- Linux 上同样需要重新生成指向 `.so`、`.a` 的 package。

同一个通用 SDK 仓库中，各平台使用独立的库输出目录，例如：

```text
KtRoot/kt/core/        # Windows
KtRoot/kt/macos/core/  # macOS
KtRoot/kt/linux/core/  # Linux
```

不要把不同平台的 package 文件混放在同一个平台目录的 `lib/cmake/KtCore/` 中。`ROOT_DIR_CORE` 不用于替代这些平台输出目录。

## 推荐目录结构

```text
kt/
├── core/                       # Windows
│   ├── include/KtCore/       # KtCore 统一头文件
│   ├── bin/
│   ├── debug/
│   └── lib/
│       └── cmake/KtCore/
├── macos/core/                 # macOS，只有平台库文件
│   ├── bin/
│   ├── debug/
│   └── lib/
│       └── cmake/KtCore/
└── linux/core/                 # Linux，只有平台库文件
    ├── bin/
    ├── debug/
    └── lib/
        └── cmake/KtCore/
```

## 运行库固定规则

Windows 下的 DLL、macOS 下的 `.dylib`、Linux 下的 `.so`，都按构建配置固定放置：

如果定义了 `ROOT_DIR_INCLUDE`，头文件使用该目录下的 `KtCore/`；默认使用 `<ROOT_DIR>/kt/core/include/KtCore/`。KtCore 头文件不随操作系统复制，平台差异只体现在 DLL、动态库和链接库。

规则如下：

- Release 运行库固定放在 `bin/`。
- Debug 运行库固定放在 `debug/`。
- `bin/` 和 `debug/` 必须保持同级。
- Debug 运行库不放在 `debug/bin/` 等额外层级目录中。
- KtCore 不使用 `KtCored.dll`、`libKtCored.dylib` 等 Debug 后缀；Debug/Release 通过目录区分。

## 链接库目录规则

链接库与同一配置的运行库放在一起：

- Release 的 DLL、Windows `.lib`、macOS `.dylib`、Linux `.so` 和静态库放在 `bin/`。
- Debug 的对应文件放在 `debug/`。
- `lib/` 仅用于保存 `cmake/KtCore/` 等 CMake package 文件。

Windows 下 KtCore 的 Debug 和 Release 文件名都使用 `KtCore.lib`，不增加 `d` 后缀；DLL 与 `.lib` 位于同一个配置目录。macOS/Linux 的静态库文件名仍由平台工具链决定，例如 `libKtCore.a`，但也遵循 `bin/`、`debug/` 配置目录规则。

## 静态库兼容规则

该目录结构同时支持静态库和动态库：

- 仅发布一种库类型时，静态库或动态库的链接库都放在对应的 `bin/` 或 `debug/` 目录。
- 动态库的 `.lib` 是 DLL 的导入库；静态库的 `.lib` 是静态链接库。
- 如果静态库和动态库需要同时发布，不能让两个同名的 `KtCore.lib` 位于同一目录，应使用不同的安装前缀或增加库类型目录，例如：

```text
bin/
├── shared/
│   └── KtCore.lib
└── static/
    └── KtCore.lib
```

同时发布时，应为静态库和动态库提供不同的 CMake target，避免链接到错误的库文件。

## 第三方库兼容规则

第三方库可以沿用相同的配置目录；实际文件名按各平台和第三方库自身规则保留：

```text
bin/sqlite3.dll
debug/sqlite3.dll
bin/sqlite3.lib
debug/sqlite3.lib
```

第三方库的文件名不要求与 KtCore 保持一致，也不强制去除其 Debug 后缀。例如 SQLite 可以继续使用 `sqlite3d.dll`、`sqlite3d.lib`，或 Linux 下的 `libsqlite3.so`。

CMake 中应优先通过 imported target 引用第三方库，让 target 负责配置和文件名映射：

```cmake
target_link_libraries(MyApp PRIVATE SQLite::SQLite3)
```

如果第三方库同时提供静态库和动态库，应分别维护对应的 CMake target 或安装目录，避免同名 `.lib` 文件互相覆盖。

## CMake package 规则

CMake package 文件放在 `lib/cmake/KtCore/`，与 `.lib` 文件同属 `lib/` 目录：

```text
lib/cmake/KtCore/
```

其中：

- `KtCoreConfig.cmake`：package 入口文件。
- `KtCoreTargets.cmake`：导入 `Kt::Core` 等 CMake target。
- Debug/Release 的 DLL 和 `.lib` 路径由 imported target 按配置分别指定。

该位置符合常见的 CMake package 布局，便于使用：

```cmake
find_package(KtCore CONFIG REQUIRED)
target_link_libraries(MyApp PRIVATE Kt::Core)
```

## 构建与输出

CMake 工程位于源码仓库，不放在 `KtRoot` SDK 输出目录中。Windows 使用 `export.bat`，macOS/Linux 使用 `export.sh`；也可以直接使用 CMake 的 `install` 步骤输出 SDK。

```bat
cmake -S /path/to/ExampleWorkspace/CoreLibrary -B build ^
  -DKTCORE_OUTPUT_ROOT=E:\KtRoot\kt\core ^
  -DKTCORE_BUILD_SHARED=ON ^
  -DKTCORE_BUILD_TESTS=OFF

cmake --build build --config Release
cmake --install build --config Release

cmake --build build --config Debug
cmake --install build --config Debug
```

`cmake --build` 负责编译；`cmake --install` 负责将头文件、DLL、`.lib` 和 CMake package 输出到 `KtRoot`。`KtRoot` 本身只保存 SDK 输出内容，不保存源码和 CMake 工程。
