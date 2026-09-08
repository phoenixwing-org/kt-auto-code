# 固化的通用脚本

本目录统一保存需要固化、复用和随 Auto Code 维护的通用实现，包括自动构建、清理以及后续其他脚本。可复用实现放在 scripts/auto-build；示例入口、配置和样本统一放在 scripts/sample。

自动构建脚本以 Windows PowerShell 5.1、MSVC 和 Windows 版 CAA 为运行基线；CAA 编译仅支持 Windows。macOS/Linux 可通过编译工具 View 编辑、探测本机路径、预检和生成脚本，非 Windows 上的运行尝试仅用于开发检查，不能替代 Windows 构建验收；Windows/UNC Root 不会被当成本机目标直接写入。Invoke-AutoBuild.ps1 只接受带盘符或完整 UNC 共享根的绝对路径，并拒绝清理文件系统根。

- `Invoke-AutoBuild.ps1`：仓库预检、更新、清理与批量构建的主编排入口。

项目自己的 `mk.ps1`、`export.ps1` 仍由项目维护；`linkCAA.ps1` 当前仍从 `ROOT_DIR/sample` 获取。本目录也接纳独立拷贝使用的通用脚本，不要求必须由插件直接调用。

## 清理脚本

`Functions-Cleanup.ps1` 是共享实现，保存在本目录并部署到 `ROOT/tools`；`../sample/cleanup.ps1` 是示例入口，与 `../sample/cleanup.yaml` 一起部署到 `ROOT/sample`。进入目标 sample 目录、修改配置后运行：

```powershell
.\cleanup.ps1 -WhatIf
.\cleanup.ps1
```

在仓库根目录预览 sample 配置：

```powershell
.\scripts\sample\cleanup.ps1 -Directory .\scripts\sample -WhatIf
```

也可以指定目标目录和配置文件：

```powershell
.\scripts\sample\cleanup.ps1 -Directory 'D:\DemoWorkspace' -ConfigPath '.\scripts\sample\cleanup.yaml' -WhatIf
```

执行顺序为取消链接、删除目录、删除文件。默认目标为入口脚本所在目录，默认配置为目标目录中的 cleanup.yaml。

- unlinkDirectories：匹配目标目录的直接子项，支持 * 和 ?；仅取消目录链接，重复匹配只处理一次。
- delete.directories：精确的直接子目录名；删除目录及内容，遇到目录链接只删除链接本身。
- delete.files：匹配目标目录内的文件，支持 PowerShell 通配符，不递归搜索。
- 空列表可写为 []，也可只保留节点。读取器仅支持示例中的缩进结构、单行字符串、空行和注释，不是通用 YAML 解析器。
- 绿色为成功，黄色为未找到或跳过，红色为失败，青色为统计标题。单项失败继续处理，最终退出码为 1；否则为 0。
- -WhatIf 只预览，预览项计入跳过。示例中的 Demo 和 Sample 名称均为通用占位名称。

sample 仅包含配置样本，不附带待删除的构建文件。

### 插件内手动清理

编译工具 Primary 中的“手动清理 Root”由 Extension Host 的 TypeScript 实现负责预览、确认和删除，不会启动 `cleanup.ps1`。规则文本保存在当前 AutoBuild schema-v2 JSON 的 `rootCleanupYaml` 字段；旧配置没有该字段时使用 `scripts/sample/cleanup.yaml` 同款默认规则，保存配置后再显式写回。

TypeScript 实现与本页脚本采用相同的直属三类语义：`unlinkDirectories`、`delete.directories`、`delete.files`。执行前会冻结 Root、顶层目标和目录树身份，整体复验通过后才删除；PowerShell 文件继续作为独立部署工具、Windows 样例和行为对照保留。

### 从插件同步到 ROOT

Primary 的“脚本”动作会直接同步下列文件，不另行询问是否覆盖：

- `scripts/auto-build/Invoke-AutoBuild.ps1` → `ROOT/tools/Invoke-AutoBuild.ps1`
- `scripts/auto-build/Functions-Cleanup.ps1` → `ROOT/tools/Functions-Cleanup.ps1`
- `scripts/sample/cleanup.ps1` → `ROOT/sample/cleanup.ps1`
- `scripts/sample/cleanup.yaml` → `ROOT/sample/cleanup.yaml`

每个文件在原生 Output 中单独记录一行，格式为 `新建 <目标路径>` 或 `替换 <目标路径>`。VSIX 制品门禁会校验四个源文件均已打包。


### 创建测试用例

在当前运行目录直接创建两个测试目录和四个文件：

```powershell
.\cleanup.ps1 -CreateTestCases
.\cleanup.ps1 -Directory . -ConfigPath .\cleanup-test.yaml -WhatIf
.\cleanup.ps1 -Directory . -ConfigPath .\cleanup-test.yaml
```

创建操作默认使用当前工作目录；可用 -Directory 指定其他已存在的目录，或加 -WhatIf 仅预览。
创建不执行清理，同名测试项已存在时拒绝覆盖；测试配置单独保存为 cleanup-test.yaml，不能同时指定 -ConfigPath。
生成 objects、build 目录，以及 sample.obj、sample.exp、sample.pdb、test_demo.exe 零字节空文件；不创建目录链接。
测试配置的 unlinkDirectories 为空，delete 中包含上述目录和文件规则。创建中途出错会报告失败，保留已生成内容。
### 共享函数文件

Functions-Cleanup.ps1 统一部署到 $env:ROOT_DIR\tools；cleanup.ps1 与 cleanup.yaml 部署到 $env:ROOT_DIR\sample。cleanup.ps1 依次查找入口脚本同目录、仓库源码中的 `../auto-build/Functions-Cleanup.ps1`，最后使用 $env:ROOT_DIR\tools\Functions-Cleanup.ps1。
默认清理目录仍是入口脚本所在目录，不会因加载共享函数而转到 ROOT/tools；-CreateTestCases 默认在当前工作目录创建。
