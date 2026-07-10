# 测试样例数据

本目录存放单元测试与回归用的样例文件。

## 编码扫描（CP936 / C4819）

| 路径 | 用途 |
| --- | --- |
| `multiChar/MultiCharSample.h` | 第 18 行 Windows-1252 弯引号（`0x94`），触发 MSVC「代码页 936 无法表示」告警 |

用法与 CLI 说明见 [`doc/源文件编码扫描.md`](../../doc/源文件编码扫描.md)。

```bash
# 在仓库根目录
pnpm scan-encoding --headers tests/fixtures/multiChar
pnpm fix-headers tests/fixtures/multiChar   # 修复样例（慎用，会改文件）
pnpm test
```

## 布局（规划）

| 路径 | 用途 |
| --- | --- |
| `reorder_members/` | 最小 `.h` 片段（锁定段用例） |
| `uuid/` | UUID / GUID / CAA IID 形态小样本 |
| `caa/` | CAA 对话框样例（CATDlg / expected） |
| `workspaces/` | 最小工作空间 DB 和 Document.xml 片段 |
