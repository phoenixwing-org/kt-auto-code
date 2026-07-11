# PNXCaaStudy CAA 命名规则调查

## 1. 调查范围

本调查只读分析同级项目 `../PNXCaaStudy` 中受 Git 管理的源码、接口、TIE、字典和资源文件，用于校正 KT Auto Code 的 CAA 关联规则。没有读取或修改构建产物，也不把 PNXCaaStudy 源码复制进本项目。

重点样例：

| 业务族 | 基础名称 | I 接口 | E 实现/扩展 |
| --- | --- | --- | --- |
| Template Feature | `PNXTemplateFeature` | `PNXITemplateFeature` | `PNXETemplateFeature` |
| Combined Curve | `PNXCombinedCurve` | `PNXICombinedCurve` | `PNXECombinedCurve` |

证据分布在以下位置：

- `PNXTemplateFeatureInterfaces.dico` 将业务对象与 `PNXITemplateFeature` 关联。
- `PNXITemplateFeature.h/.cpp` 和 `TIE_PNXITemplateFeature.tsrc` 使用相同 I 名称。
- `PNXETemplateFeature.cpp` 以 `DataExtension` 实现对应业务对象。
- `PNXICombinedCurve.h`、`PNXECombinedCurve.cpp`、`TIE_PNXICombinedCurve.tsrc` 形成同样结构。
- `PNXECombinedCurveBuild`、`PNXECombinedCurveFactory` 等名称在 E 业务名后继续追加职责后缀。

## 2. 命名结构

对当前项目样例，名称可拆为：

```text
组织前缀 + CAA 类型标记 + 业务名称 + 可选职责后缀
PNX      + I/E          + CombinedCurve + Factory
```

- `PNX` 是项目/组织前缀，可在重命名时变为其他前缀。
- `I` 通常对应接口名称，`E` 通常对应实现或扩展类名称。
- `I/E` 位于组织前缀之后、业务名称之前，不是业务词段本身。
- 图标名中的 `I_`、普通单词内部的 I/E、第三方 `CATI*`/`CATE*` 不应被自动当成本项目的 I/E 关系。

## 3. 两种替换意图

真实工程和既有 AutoCode 样例表达了两种不同意图，必须由用户明确选择。

### 3.1 完整名称模式

业务名称整体从 Source 改为 Target：

```text
TemplateFeature → CurveDivision
PNXITemplateFeature → PNXICurveDivision
PNXETemplateFeature → PNXECurveDivision
```

公式：

```text
sourcePrefix + I/E + sourceName
  → targetPrefix + I/E + targetName
```

这是 PNXCaaStudy 中 Framework、接口、实现、TIE 和 dico 整体改名时更常见的模式。

### 3.2 末词段模式

保留 Source 的前部词段，只将最后词段换成 Target 的最后词段：

```text
AutoCode → TomBuild
KTCIAutoCode → KTCIAutoBuild
KTCEAutoCode → KTCEAutoBuild
```

公式：

```text
sourcePrefix + I/E + sourceHead + sourceTail
  → targetPrefix + I/E + sourceHead + targetTail
```

这是现有 AutoCode 业务样例要求的专用模式，不能作为所有 CAA 重命名的默认推断。

## 4. 产品决策

- Side Bar 使用 `CAA 规则 ▾`，先选择“完整名称 I/E”或“仅替换末词段 I/E”。
- 完整名称模式作为常规 CAA 重命名选项排在前面；末词段模式保留 AutoCode 兼容行为。
- 两种模式会产生相同 Source、不同 Target，不能同时启用。切换批量模式时替换旧的自动生成 CAA 行。
- 用户手工编辑过的行仍按自定义规则保留，不静默覆盖。
- 每行关联菜单明确显示模式名称，并隐藏已存在或当前行无法生成的选项。
- 只有用户明确选择 CAA 关系时才插入 I/E；通用规则不猜测 CAA 语义。

## 5. 后续样例

当前证据足以区分两种模式并建立回归测试。后续仍需补充：

- 目标名称只有一个词段时的项目约定。
- 组织前缀被移除时，I/E 是否保留。
- 带数字、缩写和下划线的 CAA 业务名。
- 非 Feature 类 Framework 是否采用不同的 I/E 位置约定。
