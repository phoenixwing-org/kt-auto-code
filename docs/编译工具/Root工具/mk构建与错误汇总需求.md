# mk 构建与错误汇总需求

> 维护边界：本文与对应脚本已迁入 KT Auto Code。源码真源为 `scripts/auto-build/` 与 `scripts/sample/`；`ROOT_DIR/tools`、`ROOT_DIR/sample` 只是由 Auto Code 显式同步产生的运行副本，不再反向维护。

## 1. 目的

`tools/mk.ps1` 用于执行 CAA 工作区的标准构建流程，完整保留原始命令输出，并在构建结束时生成简洁、可信、可定位的错误摘要。

错误摘要必须优先回答两个问题：

1. 哪些源文件存在真实的编译错误？
2. 哪个 DLL 因缺少哪个 LIB 而链接失败？

CAA 工具产生的大写 `ERROR` 经常只是依赖或模块选择提示，不得与编译器真实错误混为一谈。

## 2. 适用范围

核心实现：

- `tools/mk.ps1`：执行构建并传递退出码。
- `tools/buildErrorSummary.ps1`：分类、去重和输出错误摘要。
- `tools/tests/Test-BuildErrorSummary.ps1`：回归测试。
- `tools/tests/fixtures/build-error-cases.psd1`：脱敏构建输出样板。

项目根目录的 `mk.ps1` 应保持为薄入口，核心逻辑不得复制到各项目。

## 3. 构建流程需求

`mk.ps1` 应在同一个 `cmd.exe` 环境中依次执行：

```text
tck_init
tck_profile
mkGetPreq
mkmk -au
mkrtv
```

基本要求：

- 保持 CAA 批处理设置的环境变量。
- 原始 stdout、stderr 必须实时输出到终端。
- 错误分类不得位于实时构建管道中；构建输出应同时写入临时日志，命令完成后再离线分类。
- 构建命令退出码非零时，`mk.ps1` 最终必须返回非零。
- 无论构建成功或失败，都应执行错误汇总。
- 摘要不得改变原始构建结果。
- 摘要分类或渲染异常只能显示警告，不得终止构建进程，也不得把成功构建改成失败。

## 4. 错误分类需求

### 4.1 Compiler errors：用户最关心的真实编译错误

内部分类值保持为 `Minor`。源码诊断对外使用 `Compiler errors`，链接诊断单独使用 `Link errors`；两者均使用 `[error]` 前缀。

使用不区分大小写的单词边界 `\berror\b` 识别，典型样板：

```text
C:\Work\ProductCore\ProductInterfaces\ProductItf.m\src\ProductCoreData.cpp(52) : error C2065: "value": undeclared identifier
C:\Work\ProductCore\ProductInterfaces\ProductItf.m\src\ProductCoreData.cpp(52) : error C2143: syntax error: missing ";" before "}"
LINK : fatal error LNK1181: cannot open input file "CoreRuntime.lib"
```

要求：

- C2065、C2143 等普通编译错误是用户最关心的信息，必须最先逐行列出。
- 完全相同的错误行只列一次。
- 在源码诊断原文前添加 `[error]`，并保留完整的 `文件(行): error ...`，便于终端识别文件位置。
- 已成功关联到目标 DLL 的 LNK1181 转入 Link errors，不在 Compiler errors 列表重复显示。
- 未能关联到 DLL 的 LNK1181 必须保留原文，避免漏报。

### 4.2 CAA ERRORs：CAA 大写错误标记

内部分类值保持为 `Major`，对外摘要使用 `CAA ERRORs`。

使用区分大小写的大写 `ERROR` 识别，典型样板：

```text
# make-ERROR: win_b64\code\bin\ProductGeometryUI.dll
# mkmk-ERROR: TEST_ProductToolkitFrm\TEST_ProductToolkit.m: Module [ObjectModel.m] in LINK_WITH is ignored because its framework is not a direct prerequisite.
# mkmk-ERROR: Algebra.mext: This module was previously found in another framework and is ignored.
```

要求：

- 默认只显示去重后的数量，不展开完整列表。
- `-ShowMajorErrors` 明确启用时才展开原文。
- CAA ERROR 数量用于观察 CAA 构建质量，但不能替代进程退出码。

### 4.3 None：普通输出与防误报

文件名或标识符内部包含 `Error`，不代表错误。以下内容必须分类为 `None`：

```text
Note: including file: C:\SDK\include\CATErrorDef.h
```

空行必须直接跳过分类，不能触发 PowerShell 参数绑定错误。以下已知的 legacy 环境提示也归为 `None`：

```text
ERROR: Java Development Kit v1.6 (...) not detected in registry.
ERROR: unable to set JavaROOT_PATH.
ERROR: unable to set JNIROOT_PATH.
```

禁止使用无边界的子字符串匹配：

```powershell
# 禁止：会误报 CATErrorDef.h
-SimpleMatch -Pattern 'error'
```

应使用单词边界：

```powershell
-Pattern '\berror\b' -CaseSensitive:$false
```

## 5. LNK1181 调用者关联

仅显示 LNK1181 无法判断哪个输出模块链接失败。CAA 日志通常先输出目标，再输出链接错误：

```text
# make: ProductGeometryInterfaces\ProductGeometryItf.m win_b64\code\bin\ProductGeometryItf.dll
LINK : fatal error LNK1181: cannot open input file "CoreRuntime.lib"
```

期望摘要：

```text
[error] LINK LNK1181: ProductGeometryItf.dll cannot link CoreRuntime.lib
```

关联规则：

- 从 `# make: ...dll/.exe` 提取当前目标文件名。
- 从后续 LNK1181 提取缺失的 `.lib` 文件名。
- 按 CAA 的三行组关联：`# make: ...目标`、`LNK1181 ...缺失库`、`# make-ERROR: ...同一目标`。
- 使用距离最近、尚未关联的目标和缺失 LIB 配对。
- 相同的 DLL/EXE 与 LIB 组合只显示一次。
- 同一个 LIB 导致多个 DLL/EXE 失败时，每个目标分别显示。
- 关联成功后，只显示友好摘要，不重复显示对应 LNK1181 原文。

多目标示例：

```text
[error] LINK LNK1181: ProductGeometryUI.dll cannot link CoreRuntime.lib
[error] LINK LNK1181: ProductSurfaceUI.dll cannot link CoreRuntime.lib
```

如果只有缺失 LIB 而没有 DLL/EXE 上下文，必须保留原始 LNK1181，不得猜测调用者。

如果单独出现：

```text
# make-ERROR: win_b64\code\bin\ProductBatch.exe
```

表示目标没有生成，期望摘要为：

```text
[ERROR] ProductBatch.exe: build failed
```

链接原因显示在 Link errors 中；同一目标的 `make-ERROR` 仍显示在 Build failures 中，分别表达“失败原因”和“未生成的目标”。

## 6. 期望输出

存在编译错误、链接错误和 CAA ERROR 标记时：

```text
=== BUILD ERROR SUMMARY ===
CAA ERRORs: 4 (hidden; use -ShowMajorErrors to display)
Compiler errors (2):
  [error] C:\Work\ProductCore\ProductInterfaces\ProductItf.m\src\ProductCoreData.cpp(52) : error C2065: "value": undeclared identifier
  [error] C:\Work\ProductCore\ProductInterfaces\ProductItf.m\src\ProductCoreData.cpp(52) : error C2143: syntax error: missing ";" before "}"
Link errors (2):
  [error] LINK LNK1181: ProductGeometryUI.dll cannot link CoreRuntime.lib
  [error] LINK LNK1181: ProductSurfaceUI.dll cannot link CoreRuntime.lib
Build failures (3):
  [ERROR] ProductGeometryUI.dll: build failed
  [ERROR] ProductSurfaceUI.dll: build failed
  [ERROR] ProductBatch.exe: build failed
Build exit code: 1
=== END ERROR SUMMARY ===
```

摘要颜色要求：

- `[ OK ]` 表示无错误或通过项，使用绿色。
- `[error]` 表示具体编译或链接诊断，使用红色。
- `[ERROR]` 表示 DLL/EXE 目标生成失败，使用红色。
- 默认隐藏的 CAA ERROR 数量使用深黄色。
- 默认的 CAA ERROR 数量放在摘要第一行，因为它不是主要关注项。
- 标题使用青色。

## 7. 脱敏要求

文档、fixture 和测试输出不得包含真实产品、客户或内部工程名称。

统一使用以下占位命名：

- 产品：`ProductCore`
- 接口模块：`ProductInterfaces` / `ProductItf.m`
- 输出 DLL：`ProductGeometryUI.dll`、`ProductSurfaceUI.dll`
- 依赖 LIB：`CoreRuntime.lib`
- 本地路径：`C:\Work\...`

`CATErrorDef.h` 是公开平台头文件名，用于防误报回归，可以保留。

## 8. 验收标准

运行：

```powershell
.\tools\tests\Test-BuildErrorSummary.ps1
```

必须满足：

- LNK1181 分类为 Minor。
- C2065、C2143 分类为 Minor。
- `make-ERROR`、`mkmk-ERROR` 分类为 Major。
- `CATErrorDef.h` 分类为 None。
- 重复错误能够去重。
- 关联成功的 LNK1181 不在 Compiler errors 摘要重复出现。
- 一个 LIB 对多个 DLL 的关联结果完整。
- DLL 与 EXE 目标均可关联。
- 单独的 `make-ERROR` 能显示目标生成失败。
- fixture 与文档不含真实产品标识。
- 测试退出码为 `0`。
