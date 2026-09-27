# CMake 公共模块与项目接入规则

> 维护边界：本文与对应脚本已迁入 KT Auto Code。源码真源为 `scripts/auto-build/` 与 `scripts/sample/`；`ROOT_DIR/tools`、`ROOT_DIR/sample` 只是由 Auto Code 显式同步产生的运行副本，不再反向维护。

本文档说明 `KtRoot/cmake/` 中可复用的 CMake 文件和函数，以及
`KtCore`、`KtAlarmClock-qwidget` 的接入边界。

## 公共模块

### `SdkCommon.cmake`

用于一般 C++ 项目，提供：

- `sdk_enable_cxx_utf8(target)`：为目标启用 UTF-8 编译。MSVC 使用 `/utf-8`，Clang/GCC 使用 UTF-8 输入和执行字符集选项。
- `sdk_enable_global_cxx_utf8()`：在项目入口统一为所有 C++ 目标启用 UTF-8。
- `sdk_set_config_output_dirs(target, output_root)`：将 Debug 输出到 `debug/`，其他配置输出到 `bin/`；运行库和链接库统一放在对应配置目录。
- `sdk_set_global_config_output_dirs(output_root)`：在项目入口统一设置各配置的输出目录。
- `sdk_load_third_party_root(var)`：读取 `ROOT_DIR_3rdParty`。
- `sdk_enable_ctest()`：启用 CTest。
- `sdk_find_catch2_single()`：按 `ROOT_DIR_3rdParty/Catch2_Single/cmake` 查找 Catch2。
- `sdk_add_catch2_test(target, SOURCES ..., LIBRARIES ...)`：创建 Catch2 测试目标，支持多个源文件和多个本地/导入库，并注册 CTest。

### `SdkCore.cmake`

仅供 KtCore 或同类 SDK 项目使用，提供：

- `ROOT_DIR`、`ROOT_DIR_CORE` 环境变量读取。
- `KTCORE_OUTPUT_ROOT` 平台输出目录推断。
- `KTCORE_INCLUDE_ROOT` 头文件目录处理。
- `KTCORE_INCLUDE_INSTALL_DIR` 相对安装路径计算。
- `sdk_configure_core_target(target)`：Core 库的 Debug/Release 输出目录配置。

`ROOT_DIR_CORE` 是环境变量，默认表示 `ROOT_DIR/kt/core`，不是 macOS/Linux
平台输出目录。平台输出由 `KTCORE_OUTPUT_ROOT` 根据系统自动推断。

## 接入方式

项目通过 `ROOT_DIR` 引用 KtRoot 公共模块：

```cmake
include("$ENV{ROOT_DIR}/cmake/SdkCommon.cmake")
```

KtCore 使用：

```cmake
include("$ENV{ROOT_DIR}/cmake/SdkCore.cmake")
```

项目内部不复制公共模块，也不在 `KtRoot` 中保存项目源码。

## UTF-8 与 CAA 头文件约束

所有 C++ target 应调用 `kt_enable_cxx_utf8(target)`。

面向 CAA 的公共头文件必须只使用 ASCII 字符，包括注释、宏、字符串和文件内容；
普通实现源码、测试源码和 CMake 文件可以使用 UTF-8 中文内容。

## 项目职责边界

`KtAlarmClock-qwidget` 继续在自身 CMake 中维护 Qt 的：

```cmake
find_package(Qt5 REQUIRED COMPONENTS Core Widgets Network Svg)
```

Qt 组件和业务目标不能下沉到 `SdkCommon.cmake`。

`KtCore` 的 CMake package、安装目录和平台库输出由 `SdkCore.cmake` 及
KtCore 自身的目标定义负责。

## 推荐结构

```text
KtRoot/
├── cmake/
│   ├── SdkCommon.cmake
│   └── SdkCore.cmake
└── docs/
    └── CMake 公共模块与项目接入规则.md
```
