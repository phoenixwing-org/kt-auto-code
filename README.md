# Kt Auto Code

面向 **CAA / MSVC C++** 的小工具集合：核心在 `src/`，通过 **CLI** 或 **VS Code / Cursor 插件** 使用。

首期工具 **头文件 ASCII 修正**：预检并清理 `.h` 等头文件中的弯引号、NBSP、BOM、非 ASCII 字节，减少 **C4819**，便于跨国协作。

## 快速开始

```bash
pnpm install && pnpm -C extension install

pnpm test
pnpm scan-encoding --headers --ascii tests/fixtures/multiChar   # 预检
pnpm fix-headers tests/fixtures/multiChar                         # 修复（慎用）
```

**插件**：`pnpm ext:watch` → 本仓库 **F5** → Host 窗口打开 CAA 工程 → Side Bar **Kt Auto Code**。

## 文档

| 文档 | 内容 |
| --- | --- |
| [doc/README.md](doc/README.md) | 文档索引 |
| [源文件编码扫描](doc/源文件编码扫描.md) | CLI、扫描范围；**CP1252 / 全角标点映射表** |
| [编码修正](doc/编码修正.md) | 整文件编码检测与转换（`encodingFix`） |
| [vscode插件规划](doc/vscode插件规划.md) | 插件架构、多工具扩展 |
| [开发与测试](doc/开发与测试.md) | F5、测试、选项与检查清单 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm ext:watch` | 监听编译扩展 |
| `pnpm ext:launch` | 启动 Extension Host（同 F5） |
| `pnpm fix-headers` | 头文件纯 ASCII 修复 |
| `pnpm scan-file-encoding` | 整文件编码预检（GBK / BOM / UTF-16） |
| `pnpm convert-file-encoding` | 转换为 UTF-8 无 BOM |
| `pnpm scan-encoding --headers --ascii` | 头文件预检（含 GBK / BOM） |

## 仓库结构

```text
src/           # 核心（无 vscode 依赖）
extension/     # VS Code 插件壳
scripts/       # CLI
tests/fixtures/
doc/           # 中文文档
```

## 许可证

内部项目（`private`）。
