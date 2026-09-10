# Combo 参数回填缺少注释行

> **状态：已获授权并以规则 `1.0.2` 修复；本机生成器、缓存与完整本地 Wing 门禁通过，Windows/CAA 实机待测。**
>
> 来源：`7e58f09e1f9be9d73c1da36d7e0f3f499adc8395`（2026-09-10，`部分bug`），用户反馈的 bug 2。摘入 `codex/v0.9.2` 并补充当前实现状态，不合并该提交的父历史。

## 当前分支核对（2026-09-10）

- 修复前本地 Wing `packages/kt-codegen/src/renderer/caa-dialog-family.ts` 的 Combo 参数回填分支直接输出 `SetSelect` / `SetField`，没有像相邻分支那样先追加当前字段的 `notes`。已修的 Combo 通知、UI 配色和构造函数对齐没有顺带修复本项。
- 摘录核对后，用户明确授权在当前任务修复。现仅在 CAA `UPDATE DIALOG` 的三类受支持 Combo 赋值前追加当前字段自身注释，`SetSelect` / `SetField` 原语句、未支持类型与其他块保持不变。真实 CAA/Windows 运行结果应另记，不能用 Mac 自动测试替代。
- 本次改变控制区域内部生成的注释，遵守 [生成规则版本约定](../codegen-plan/Codegen生成规则版本.md)：Wing 规则常量与 Auto 预检缓存同步升级 `1.0.1 → 1.0.2`，前一版本计划与 runtime 身份被拒绝；不因“只是注释”跳过升级。

## 问题现象

生成 Combo 参数回填代码时，`_ComboMyType` 的 `SetSelect()` 前缺少对应字段的注释行。

用户提供的生成结果：

```cpp
// 5,FinishCalc,,NO ACTION,,0

_ComboMyType->SetSelect( parameter->MyType, 0);
```

已有注释属于上一字段 `FinishCalc`，不能作为 `MyType` 的字段说明。缺少独立注释会使生成代码的字段对应关系不清晰。

## 预期表现

在 `_ComboMyType->SetSelect(...)` 前生成 `MyType` 对应的字段注释，与其他参数回填代码的注释格式保持一致。

字段序号和注释内容应取自 `MyType` 的实际元数据，不沿用上一字段，也不根据示例推定序号。

## 修正范围

- 检查生成器中 Combo 参数回填分支的注释输出，补齐缺失的字段注释。
- 保持 `SetSelect(parameter->MyType, 0)` 的参数回填行为不变。
- 本问题与 Combo 配色、CAA 通知绑定问题分别记录。

## Mac 无写盘复现与既有测试（修复前）

2026-09-10 使用当前本地 Wing `Controller.analyze`，内存输入为两个字段：`FinishCalc`（id `5`、无组件动作）后接 `MyType`（人工夹具 id `42`、`int`、`ComboBox`、组件数 `1`、notes 为 `fixture note`）。生成结果 `canApply=true`、无诊断，但 `UPDATE DIALOG` 输出仍为上文的 `FinishCalc` 注释和没有自身注释的 `MyType` `SetSelect`。未应用计划、未写入用户源码；`42` 仅用于确认应取当前字段元数据，不是用户真实字段序号。

定位与测试证据（Wing 仓库相对路径）：

- `packages/kt-codegen/src/renderer/caa-dialog-family.ts`：`caa.dialog` 的 `UPDATE DIALOG` 调用 `ktCodegenRenderCaaUpdateDialogLines`；函数已创建 `notes`，Combo 分支却未追加它。相反方向的 `UPDATE INFORS` 统一追加注释，不属于本项缺失。
- `packages/kt-codegen/tests/dialog-update-fixtures.ts`：现有 `Index` 字段含 id `6` 与 `integer combo` 注释。
- `packages/kt-codegen/tests/fixtures/expected/dialog-updates/caa-update-dialog.txt`：旧样本的 `_ComboIndex->SetSelect` 前没有 id `6` 注释；`Scale`、`Label` 的 Combo `SetField` 也缺注释。本次只补三处对应注释。
- `packages/kt-codegen/tests/dialog-update-renderer.test.ts`：原先逐字比较旧金样本，不能据此证明本 bug 已修。本次新增三种数据类型 × 主/More Dialog 的最小回归，核对前字段 `NO ACTION`、自身 id/字段名/notes、注释恰好一条、赋值原样和参数数据不被修改；原有四块完整 golden 对比继续约束其他输出。

## 修复结果与验证

- 人工夹具 `MyType`（id `42`、notes `整数选择`）现在输出 `// 42,MyType,整数选择`，紧邻原来的 `_ComboMyType->SetSelect( parameter->MyType, 0);`。字段序号仅来自夹具输入，不代表用户真实数据。
- `double` 与 `CATUnicodeString` 的 `SetField` 同样补齐各自元数据注释；带下划线的字段在注释中保留实际名称，控件名称仍按原规则去掉下划线。
- 定向生成器/声明/跨 Host 测试通过；Auto 缓存、文档样例与制品门禁测试通过。门禁实际执行三类 Combo 的主/More Dialog 生成输出，拒绝只有版本戳更新而仍缺失/重复注释的制品。
- 完整受控 `KTC_TEST_NATIVE_CMAKE=1 pnpm ext:dev:prepare` 通过：Auto 256 文件 / 1903 测试、类型检查、规则 `1.0.2` 实际输出与六包本地来源门禁通过，consumer node_modules Wing 命中为 0。
- 本轮没有应用计划或写入用户源码；没有修改 npm 包版本、发布/推送或冻结归档。Windows/CAA 实机结果尚未取得。

## 验收清单

- [x] 生成的 `MyType` Combo 回填语句前存在独立字段注释。
- [x] 注释的字段名、序号及其他内容与实际字段元数据一致。
- [x] 前一字段为 `NO ACTION` 时，后续 Combo 的注释仍完整输出。
- [x] 不重复输出字段注释，不改变原有参数回填语句的行为。
- [x] 同时覆盖 int 的 `SetSelect` 和 double/CATUnicodeString 的 `SetField`；`UPDATE INFORS` 等无关控制块保持不变。
- [x] 规则版本与 Auto 缓存版本同步升级，前一规则版本生成的旧计划被拒绝。

与 [Combo 下拉配色](自动代码-Combo深色配色问题.md) 和 [CAA Combo 通知生成](自动代码-CAA-combo的信号问题.md) 分开跟踪。
