# Auto Build 运行时脚本

本目录保存随 Auto Code 版本发布、由插件直接调用的自动构建脚本。

- `Invoke-AutoBuild.ps1`：仓库预检、更新、清理与批量构建的主编排入口。

项目自己的 `mk.ps1`、`export.ps1` 仍由项目维护；`linkCAA.ps1` 当前仍从 `ROOT_DIR/sample` 获取。后续只有需要与插件行为锁定版本的通用脚本才放入本目录。
