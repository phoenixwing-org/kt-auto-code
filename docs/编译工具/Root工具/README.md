# Root 工具迁移说明

状态：Auto Code 当前维护真源。

2026-09-15 从 KtRoot `5c3004e6ea1515953d56dbe8f1613407b9103b2c` 迁入通用 PowerShell、Shell 脚本、工程样例入口和六份构建契约文档。迁入时保留 Auto Code 已有且更新的 `Invoke-AutoBuild.ps1`、`Functions-Cleanup.ps1`、`cleanup.ps1` 与清理配置，其余脚本补齐到同一受控同步清单。当前基线的配置样例已迁移为 `cleanup.toml`；本次合入沿用 TOML 及已有 YAML 的过渡兼容，不恢复旧 YAML 样例。

## 当前边界

- Auto Code `scripts/auto-build/`：Root 公共实现的唯一源码真源。
- Auto Code `scripts/sample/`：项目级转发入口与配置样例的唯一源码真源。
- `ROOT_DIR/tools` 与 `ROOT_DIR/sample`：用户显式执行“同步脚本”后得到的运行副本。
- `clang-format/.clang-format` 纳入同步；`clang-format.exe` 等平台二进制不进入扩展，由机器工具链提供。
- 同步只复制受控清单，不删除 Root 中额外文件，也不会自动执行构建、链接、Git 更新或清理。

## 本轮 CAA 修正

1. `Get-CAAWorkspaceDirectories` 优先判断传入根目录本身是否为 CAA workspace；命中后不再把直接 Framework 当成下级工程。
2. `sample/linkOut.ps1` 委托 `linkCAA.ps1`，一次完成 Framework → 上级 `CAAB<Version>MkWsp` 和 workspace `win_b64` → 聚合 `win_b64`。
3. `caaAll.ps1` 与 `cmakeAll.ps1` 同时进入 Auto Code 和 Root 同步闭包。
4. 已有普通目录默认拒绝替换；只有用户显式传 `-ReplaceDirectory` 才允许替换，`-ListOnly` 可先只做发现与计划。

Windows 实机仍应先执行：

```powershell
& "$env:ROOT_DIR\sample\linkOut.ps1" -Version 20 -ListOnly
& "$env:ROOT_DIR\sample\linkOut.ps1" -Version 20
& "$env:ROOT_DIR\sample\caaAll.ps1" -Version 20 -ListOnly
```

## 文档

- [tools 脚本说明](tools脚本说明.md)
- [批量工程脚本设计](批量工程脚本设计.md)
- [mk 构建与错误汇总需求](mk构建与错误汇总需求.md)
- [CMake 外部构建与批量编译方案](CMake外部构建与批量编译方案.md)
- [CMake 公共模块与项目接入规则](<CMake 公共模块与项目接入规则.md>)
- [Core SDK 与 CMake 目录规则](<Core SDK 与 CMake 目录规则.md>)
