# PNXCaaStudy Ignore 规则总结

> 调查范围：`PNXCaaStudy` 根目录、`.phoenix/.ignore`、`KtCore` 和 5 个带子级 `.gitignore` 的 CAA Wsp。
> 目的：提炼可复用规则，不把单个工程的临时习惯直接变成通用默认值。

## 1. 文件分组

| 来源 | 特征 | 结论 |
| --- | --- | --- |
| 根 `.gitignore` | CAA 平台目录、CMake build、用户本地工具配置 | 项目级组合规则 |
| 根 `.phoenix/.ignore` | 与根 `.gitignore` 内容相同 | 同步镜像，不是第二套规则源 |
| `PNXBomAnalysisWsp`、`PNXCurveDivisionWsp`、`PNXV5V6AdapterWsp` | 相同的原生编译产物和 CAA mkmk 目录 | 可提炼为稳定的 CAA/native-build 基线 |
| `PNXTemplateBaseWsp` | 标准 Wsp 规则外增加 `*.bat`、`.vscode` | 模板项目特例，存在误忽略风险 |
| `PNXCombinedCurveWsp` | 只含 5 条 CAA 目录/文件规则 | 最小 CAA 基线样例 |
| `KtCore` | CMake、Wasm、缓存、图像、归档和临时文档 | KtCore 项目特有规则 |

根规则中 `build_debug` 和 `build_release` 各重复一次；结构化目录和受管预设必须去重。

## 2. 稳定的 CAA 基线

以下规则在多个 Wsp 重复出现，适合进入通用 CAA 分类：

```gitignore
Install_config_win_b64/
win_b64/
intel_a/
ToolsData/
CATEnv/
ImportedInterfaces/
various/
ProtectedGenerated/
LocalGenerated/
Objects/
.vs/
```

`CATIAV5Level.lvl` 出现在根和最小 Wsp 中；通用模板还包含 `*.lvl`。两者可同时保留：前者表达特定 Level 标识文件，后者覆盖其他 Level 生成文件。

## 3. 原生编译产物

标准 Wsp 模板覆盖以下阶段：

| 阶段 | 规则 |
| --- | --- |
| 依赖关系 | `*.d` |
| 对象文件 | `*.slo`、`*.lo`、`*.o`、`*.obj` |
| 预编译头 | `*.gch`、`*.pch` |
| 动态库 | `*.so`、`*.dylib`、`*.dll` |
| Fortran 模块 | `*.mod`、`*.smod` |
| 静态库 | `*.lai`、`*.la`、`*.a`、`*.lib` |
| 可执行/Level 产物 | `*.exe`、`*.out`、`*.app`、`*.lvl` |

这些规则可由 `caa`、`cpp`、`native-build`、操作系统和产物类型等标签组合选择。

## 4. 项目特有规则

以下规则收入 JSON 目录供选择，但不进入通用 CAA 默认预设：

| 规则 | 分类 | 原因 |
| --- | --- | --- |
| `error.md`、`temp.md` | `user-local`、`project-specific` | 用户自己的记录或临时文档 |
| `.obsidian/`、`.phoenix/` | 工具配置 | 与 CAA 本身无关 |
| `.cache/`、`wasm/`、`output/*.*` | KtCore 缓存/输出 | 只在 KtCore 样例出现 |
| `*.bigray`、`*.history.obj` | KtCore 自定义生成物 | 需要项目语义 |
| `my.cmake` | 用户本地 CMake 配置 | 不应影响其他工程 |
| `*.zip`、`*.ppm` | `review-required` | 可能是生成物，也可能是应提交的资源 |
| `*.bat` | `review-required` | 批处理通常属于源码或构建脚本，不能默认全忽略 |
| `.vscode/` | `review-required` | 可能含团队共享的 tasks、launch 和 settings |

## 5. 产品落点

- `CAA`、`C++`、`Web` 继续作为安全快捷预设。
- JSON 目录支持多标签查询和工作区扩展；分析 View 已按证据推荐独立小组，所有小组默认未选。
- `review-required` 分类必须由用户显式选择，并在追加前显示规则摘要。
- 从 `.gitignore` 追加仍按原文合并；结构化预设不应擅自删除用户已有规则。
