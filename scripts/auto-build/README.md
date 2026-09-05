# Auto Build 运行时脚本

本目录保存随 Auto Code 版本发布、由插件直接调用的自动构建脚本。

实际构建以 Windows PowerShell 5.1、MSVC 和 Windows 版 CAA 为运行基线；CAA 编译仅支持 Windows。macOS/Linux 可通过编译工具 View 编辑、探测本机路径、预检和生成脚本，非 Windows 上的运行尝试仅用于开发检查，不能替代 Windows 构建验收；Windows/UNC Root 不会被当成本机目标直接写入。脚本自身只接受带盘符或完整 UNC 共享根的绝对路径，并拒绝清理文件系统根。

- `Invoke-AutoBuild.ps1`：仓库预检、更新、清理与批量构建的主编排入口。

项目自己的 `mk.ps1`、`export.ps1` 仍由项目维护；`linkCAA.ps1` 当前仍从 `ROOT_DIR/sample` 获取。后续只有需要与插件行为锁定版本的通用脚本才放入本目录。
