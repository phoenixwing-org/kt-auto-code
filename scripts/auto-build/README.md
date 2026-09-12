# 固化的通用脚本

本目录只保存运行脚本和说明；清理回归脚本位于 `../tests/`，运行方式见该目录的 README，不同步到 Root。

本目录统一保存需要固化、复用和随 Auto Code 维护的通用实现，包括自动构建、清理以及后续其他脚本。可复用实现放在 scripts/auto-build；示例入口、配置和样本统一放在 scripts/sample。

自动构建脚本以 Windows PowerShell 5.1、MSVC 和 Windows 版 CAA 为运行基线；CAA 编译仅支持 Windows。macOS/Linux 可通过编译工具 View 编辑、探测本机路径、预检和生成脚本，非 Windows 上的运行尝试仅用于开发检查，不能替代 Windows 构建验收；Windows/UNC Root 不会被当成本机目标直接写入。Invoke-AutoBuild.ps1 只接受带盘符或完整 UNC 共享根的绝对路径，并拒绝清理文件系统根。

- `Invoke-AutoBuild.ps1`：仓库预检、更新、清理与批量构建的主编排入口。

项目自己的 `mk.ps1`、`export.ps1` 仍由项目维护；`linkCAA.ps1` 当前仍从 `ROOT_DIR/sample` 获取。本目录也接纳独立拷贝使用的通用脚本，不要求必须由插件直接调用。

## 清理脚本

顶层 `ignore` 节点已支持按文件夹名或文件名忽略，可使用完整名称和 `*`、`?` 通配符。内置 `.git` 硬保护始终生效，与 `ignore` 是否配置无关。

用户实测确认（2026-09-12）：相对路径支持同步到 Root 后，Root 下目录删除以及 DLL、LIB 等文件清理测试通过。此前已确认 CAA 清理、link 目标中的 Objects 清理及脚本同步通过。新增 `ignore` 已通过 Windows PowerShell 5.1 临时目录回归，用户现场验证另行确认。

**绝对规则：任何清理都必须跳过 `.git` 本身及其全部内容（包括 LFS 和 `.git` 文件）。该保护不可通过配置、通配符、递归参数或 Force 关闭；链接实际目标和底层删除入口同样受保护。待删父目录中包含 `.git` 时，整项拒绝删除。**

`Functions-Cleanup.ps1` 是共享实现，保存在本目录并部署到 `ROOT/tools`；`../sample/cleanup.ps1` 是示例入口，与 `../sample/cleanup.yaml` 一起部署到 `ROOT/sample`。进入目标 sample 目录、修改配置后运行：

```powershell
.\cleanup.ps1
```

在仓库根目录预览 sample 配置：

```powershell
. "$env:ROOT_DIR\tools\Functions-Cleanup.ps1"
Invoke-Cleanup -Directory .\scripts\sample -ConfigPath .\scripts\sample\cleanup.yaml -WhatIf
```

也可以指定目标目录和配置文件：

```powershell
. "$env:ROOT_DIR\tools\Functions-Cleanup.ps1"
Invoke-Cleanup -Directory 'D:\DemoWorkspace' -ConfigPath '.\scripts\sample\cleanup.yaml' -WhatIf
```

执行顺序为取消链接、删除目录、删除文件。默认目标为入口脚本所在目录，默认配置为目标目录中的 cleanup.yaml。

- unlinkDirectories：匹配目标目录的直接子项，支持 * 和 ?；仅取消目录链接，重复匹配只处理一次。
- delete.directories：按精确目录名默认递归搜索，包括进入 Junction 和目录符号链接的实际目标（可以位于入口目录之外）。匹配普通目录后删除目录及内容，不再单独匹配其后代。若链接自身的名称直接命中目录规则，仍只删除该链接；删除已匹配目录树时，其内部链接也只删除链接本身。
- delete.files：默认递归搜索普通子目录和目录链接的实际目标，按 PowerShell 文件名通配符匹配；文件链接不跟随、不删除。`test_*.exe` 匹配文件名，不代表 `test` 目录中的所有 EXE。结果显示实际目标的完整路径。
- 目录遍历按解析后的实际路径去重，重复联接只扫描一次，指回已遍历目录的联接不会无限循环。无法解析、失效或不支持的目录链接会报告失败。
- 版本控制元数据受保护：不搜索或删除 `.git`（含 LFS）、`.hg`、`.svn`，并识别包含 HEAD、config 及 objects/refs 的 Git 管理目录。链接解析后的实际路径同样检查。待删目录树内含仓库元数据时，整项拒绝删除，避免先删部分文件再发现仓库。
- `-Confirm` 的确认发生在删除任何子内容之前；取消记为跳过。目录收尾使用非递归空目录删除，非空则报错，不再出现先删内容后询问是否递归的问题；仅成功删除后计入已删除。
- 空列表可写为 []，也可只保留节点。读取器仅支持示例中的缩进结构、单行字符串、空行和注释，不是通用 YAML 解析器。
- 绿色为成功，黄色为未找到或跳过，红色为失败，青色为统计标题。单项失败继续处理，共享函数最终返回 1；否则返回 0。简写入口不将返回值转换为进程退出码。
- -WhatIf 只预览，预览项计入跳过。示例中的 Demo 和 Sample 名称均为通用占位名称。

sample 仅包含配置样本，不附带待删除的构建文件。

### ignore 忽略规则

```yaml
ignore:
  - cache          # 只匹配完整名称 cache，不匹配 cacheExtra
  - 'README.md'    # 任意层级同名文件或文件夹
  - '*.log'        # * 匹配零个或多个字符
  - 'temp?.obj'    # ? 匹配一个字符
```

- 名称匹配不区分大小写，不做子串匹配；仅 `*`、`?` 为通配符，其他字符按字面匹配。不支持相对路径、绝对路径或反向排除规则。
- `ignore` 优先于 `unlinkDirectories` 和所有 `delete` 规则，包括精确相对路径。忽略文件夹后不遍历其内容；忽略的链接不会被取消，也不会从其他链接别名清理其实际目标。
- 删除父目录前检查整棵树；含忽略项时跳过该目录的整树删除并记录原因。独立文件删除规则仍可处理其中未被忽略的文件。
- 省略 `ignore`、写 `ignore: []` 或只写空节点均表示没有额外忽略项，不影响 `.git` 等内置保护。非法 ignore 规则会在任何取消链接或删除操作前报错。
- 直接调用 `Remove-CleanupDirectories`、`Remove-CleanupFiles` 或 `Remove-ExcludedDirectoryLinks` 时，也可传 `-Ignore @('cache', '*.log')`。

`Invoke-Cleanup` 的 `[bool]$Recurse` 默认是 `$true`，同时控制 `delete.directories` 和 `delete.files` 的搜索范围。传 `-Recurse:$false` 时仅匹配目标目录的直接子项；已匹配目录仍删除整棵目录树。`unlinkDirectories` 始终只匹配当前层，不受该参数影响。

`delete` 也支持相对于 `-Directory`（通常为 Root）的路径，接受 `/` 或 `\` 分隔符。带路径的目录规则只删除指定目录；带路径的文件规则只匹配指定父目录当前层，不随 `Recurse` 扩大范围。纯名称规则（如 `Objects`、`*.obj`）仍遵循原有递归设置。

```yaml
delete:
  directories:
    - 'xy/core/include'
    - 'xy/core/image'
  files:
    - 'xy/core/lib/*.lib'
```

不支持绝对路径、`.` / `..` 路径段、空路径段或目录部分的通配符；文件名部分可使用通配符。全部 delete 规则先校验，再执行清理，避免无效规则导致部分执行。相对路径经过目录链接时仍检查实际目标及 `.git` 保护；目标不存在则记录为未找到，不在其他位置搜索同名项。

执行顺序仍是先 `unlinkDirectories`，再 `delete`。已经按取消链接规则移除的入口不会再被递归进入；需要清理其目标内容的链接不要同时列入取消链接规则。这里的目录链接指 Junction / SymbolicLink，不是 Windows `.lnk` 快捷方式文件。

```powershell
. "$env:ROOT_DIR\tools\Functions-Cleanup.ps1"
Invoke-Cleanup -Directory $PSScriptRoot -ConfigPath "$PSScriptRoot\cleanup.yaml" -Recurse:$false -WhatIf
```

### 插件内手动清理

编译工具 Primary 中的“手动清理 Root”由 Extension Host 的 TypeScript 实现负责预览、确认和删除，不会启动 `cleanup.ps1`。规则文本保存在当前 AutoBuild schema-v2 JSON 的 `rootCleanupYaml` 字段；旧配置没有该字段时使用 `scripts/sample/cleanup.yaml` 同款默认规则，保存配置后再显式写回。

插件内 TypeScript 实现的规则范围由自身的预览和清理实现控制；本次独立 PowerShell 脚本的文件递归修改不代表插件内清理同步变更。插件执行前会冻结 Root、顶层目标和目录树身份，整体复验通过后才删除；PowerShell 文件继续作为独立部署工具保留。

### 从插件同步到 ROOT

也可以在本目录运行独立同步命令，默认目标为 `$env:ROOT_DIR`：

```powershell
.\Sync-RootScripts.ps1
# 显式指定 Root，或先预览：
.\Sync-RootScripts.ps1 -RootDirectory 'E:\XyRoot' -WhatIf
.\Sync-RootScripts.ps1 -RootDirectory 'E:\XyRoot'
```

该命令覆盖 `tools/Invoke-AutoBuild.ps1`、`tools/Functions-Cleanup.ps1` 和 `sample/cleanup.ps1`，并逐个校验 SHA256。`sample/cleanup.yaml` 仅在不存在时复制，已有配置保留。Root 必须已存在；命令只复制文件，不执行构建、清理或仓库恢复，也不修改 Root 根目录的自定义入口和配置。

Primary 的“脚本”动作会直接同步下列文件，不另行询问是否覆盖：

- `scripts/auto-build/Invoke-AutoBuild.ps1` → `ROOT/tools/Invoke-AutoBuild.ps1`
- `scripts/auto-build/Functions-Cleanup.ps1` → `ROOT/tools/Functions-Cleanup.ps1`
- `scripts/sample/cleanup.ps1` → `ROOT/sample/cleanup.ps1`
- `scripts/sample/cleanup.yaml` → `ROOT/sample/cleanup.yaml`

每个文件在原生 Output 中单独记录一行，格式为 `新建 <目标路径>` 或 `替换 <目标路径>`。VSIX 制品门禁会校验四个源文件均已打包。


### 创建测试用例

在当前运行目录直接创建两个测试目录和四个文件：

```powershell
. "$env:ROOT_DIR\tools\Functions-Cleanup.ps1"
Invoke-Cleanup -CreateTestCases
Invoke-Cleanup -Directory . -ConfigPath .\cleanup-test.yaml -WhatIf
Invoke-Cleanup -Directory . -ConfigPath .\cleanup-test.yaml
```

创建操作默认使用当前工作目录；可用 -Directory 指定其他已存在的目录，或加 -WhatIf 仅预览。
创建不执行清理，同名测试项已存在时拒绝覆盖；测试配置单独保存为 cleanup-test.yaml，不能同时指定 -ConfigPath。
生成 objects、build 目录，以及 sample.obj、sample.exp、sample.pdb、test_demo.exe 零字节空文件；不创建目录链接。
测试配置的 unlinkDirectories 为空，delete 中包含上述目录和文件规则。创建中途出错会报告失败，保留已生成内容。
### 共享函数文件

Functions-Cleanup.ps1 统一部署到 $env:ROOT_DIR\tools；cleanup.ps1 与 cleanup.yaml 部署到 $env:ROOT_DIR\sample。cleanup.ps1 是两句调用的简写入口，直接加载 $env:ROOT_DIR\tools\Functions-Cleanup.ps1；运行前必须正确设置 ROOT_DIR 并部署共享实现。
简写入口固定清理脚本所在目录，并读取同目录的 cleanup.yaml，不接收命令行参数。需要 -WhatIf、指定目录或创建测试用例时，先加载共享实现，再直接调用 Invoke-Cleanup，如上文所示。
