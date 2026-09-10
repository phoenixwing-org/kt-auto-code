# Codegen 生成规则版本

状态：0.9.2 本地候选采用规则 `1.0.2`；不代表插件或 Wing 包版本，也不代表 Registry 已发布

最后核验：2026-09-10

## 输出标记

参数声明区原有版本注释改为：

```cpp
// @app Kt Auto Code
// @codegen-rules-version 1.0.2
```

旧 `@version 5.0.0, (2024)` 是迁移保留的 Windows App 输出，不能重新解释为独立格式版本；用户也回忆过旧 App 的 `0.5.0`。本轮不追溯重命名历史发布号，从新规则基线 `1.0.0` 开始。

版本戳只替换参数声明区已有版本注释，不为所有生成块额外插入版本戳，不批量改写旧源码。标记解析仍识别原有 START/END、类名和 block key；旧 `@version` 注释不阻碍识别。

## 版本边界

- 插件、Wing 根包及 scoped 包、输入 JSON `4.0` 与 Plan schema 各自独立，不因本字段变化而同步升级。
- `codegen-rules-version` 覆盖生成代码的语义与格式规则，不只表示排版。兼容性修错升 patch，兼容新增能力升 minor，破坏性规则变化升 major。
- UI、文案或打包调整不升级生成规则版本。影响解析/生成结果的修订必须审查规则版本及缓存失效；结束标记对齐属于生成规则变化，即使只改变空白也需升级。
- [构造函数结束标记缩进](../bug/自动代码-构造函数结束标记缩进.md) 已在用户重新授权后以 `1.0.1` 修复并完成本机回归；Windows clang-format 实机复验仍未执行。
- [Combo 参数回填注释](../bug/自动代码-Combo参数回填缺少注释行.md) 在用户授权后以 `1.0.2` 补齐：CAA `UPDATE DIALOG` 的受支持 Combo 输出当前字段元数据注释；不改变赋值语句或反向回填。Windows/CAA 实机复验仍需单独记录。

AI 判断标准：**相同输入下，控制符区内部生成内容变了，就升级**。包括 CAA Combo 通知调用等语义修正、声明/默认值、模板、输出注释与缩进空白；START/END/clang-format 边界输出变化同样算。纯界面文案与生成到源码的注释是两类，后者必须升级。

## 已确认版本

| 规则版本 | 变更依据 | 缓存要求 |
| --- | --- | --- |
| `1.0.0` | 建立独立规则系列，固化已完成的生成修正（含 Combo 选择通知）；不是旧 App 版本的重命名 | 拒绝旧 `0.3.3` 及缺少 runtime 身份的计划 |
| `1.0.1` | 构造函数 `clang-format on` / END 由固定顶格改为跟随后续语义行缩进；无后续行则保留旧 END 缩进 | 即使源码、JSON 与索引未变，也拒绝 `1.0.0` 计划；声明输出同步标记 `1.0.1` |
| `1.0.2` | CAA `UPDATE DIALOG` 的 `int` / `double` / `CATUnicodeString` Combo 在 `SetSelect` / `SetField` 前补齐自身字段的单条 `id,paramString,notes` 注释；不借用前字段注释 | 即使源码、JSON 与索引未变，也拒绝 `1.0.1` 计划及其 runtime 身份；声明输出同步标记 `1.0.2` |

此次不改变 Marker/Analyze/Apply 算法、输入 JSON schema 或用户区域外内容；不批量重写源文件。`1.0.2` 只更新 CAA UPDATE DIALOG golden 的三条 Combo 注释，声明 golden 只更新版本戳，跨 Host fixture 只更新该声明 artifact 的内容哈希；不刷新其他金样本。未支持的 Combo 类型、零组件 `NO ACTION`、`UPDATE INFORS` 及 Qt 输出保持不变。

每次修改清单：

1. 更新 Wing 公开规则常量与 Auto 缓存规则版本。
2. 新增改变输出的回归，并证明前一版本缓存被拒绝。
3. 更新缓存 JSON 样例、版本说明和变更记录；保留不相关旧 golden。
4. 验证真实运行时标识隔离和本地 Wing 一致性门禁；记录实际来源 commit。制品门禁会实际执行声明 renderer、构造函数尾行缩进解析和结束标记 renderer，以及三类 Combo 在主/More Dialog 的注释与赋值输出；缺失或重复注释均拒绝，不能只修改常量冒充新规则。完成本地检查不代表 Registry 已含新规则。

## 缓存与来源

Wing 公开规则版本常量用于生成注释。本地构建门禁核对它与 Auto 的预检缓存规则版本一致；Auto 不为旧 Registry 添加虚构导出或修改依赖锁。

[预检缓存](../../src/tools/codegen/preflightCache.ts) 同时核对规则版本与实际运行时标识。旧缓存版本或缺少来源标识的缓存需重新预检；旧 Registry 的未版本化生成器不能伪装成当前本地 Wing，也不能复用后者缓存。缓存失效只负责重新生成计划，仍不绕过 Apply 的源码指纹、冲突及确认门禁。
