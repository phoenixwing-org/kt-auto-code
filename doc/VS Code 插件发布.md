# 发布 VS Code 插件

本文记录将 **KT Auto Code** 发布到 [Visual Studio Marketplace](https://marketplace.visualstudio.com/) 的操作流程，以及发布时应保留的版权与许可信息。

## 项目信息

- 扩展目录：[`extension/`](../extension/)
- 当前扩展标识：`kuntai.kt-auto-code`
- Marketplace 发布者 ID：`kuntai`
- Marketplace 发布者名称：`Shanghai Kuntai`
- 当前版本：以 [`extension/package.json`](../extension/package.json) 的 `version` 为准
- Marketplace 当前公开版本为 KT Auto Code `0.5.1`、KT Auto CAD `0.1.0`；两者均由 `kuntai` 发布并已通过人工审查。
- 开源许可：[Apache License 2.0](../LICENSE)

当前扩展标识由下列清单字段组成：

```json
{
  "publisher": "kuntai",
  "name": "kt-auto-code"
}
```

## 0.6.1 已发布（2026-07-24）

0.6.1 收口三库共享 Code/Codegen 界面与宿主边界，补齐 Git Primary 的多仓库选择，并为未打开 Block 的下方区域增加 Welcome。根 workspace 与 Code 扩展同步升级到 0.6.1，KT Auto CAD 保持 0.1.0；Code 与 CAD 的 15 处 Wing manifest 引用精确使用 Registry 0.5.1。

- 下方工具 View 改为常驻：没有打开 Block 时显示紧凑 Welcome，列出 Code/CAD 的安装状态和版本，缺失插件可直接安装，底部提供 Gitee、安装说明、快速开始和插件设置入口；打开功能后仍只显示原有单 Block 内容。
- Git remote、manifest、README、VSIX 内容链接与 Welcome 外部链接统一迁移到 `https://gitee.com/phoenixwing/kt-auto-code.git`；“安装说明”使用 VS Code 内置扩展搜索，不再打开可能进入异常登录页的 Marketplace 网页。
- Git 仓库发现合并多根 VS Code 工作区、Git API、嵌套子模块和活动文件来源，按真实仓库根去重；简报草稿、合并预检、执行与撤销均绑定当前仓库。
- Codegen Primary、控制符目录、应用报告、成员排序、UUID 和搜索替换结果复用 Wing 共享状态模型与 Host-neutral Web Component，Auto Code 继续拥有 VS Code Host、权限和工作区编排。
- 适配 Wing 0.5.1 扩宽的报告构造返回类型，并按 Primary 内含控制符目录、独立预检结果面板的新边界更新 VSIX 制品门禁。
- 正式候选必须使用 Node 22、当前 `pnpm-lock.yaml` 与 npm Registry 依赖执行 `pnpm ext:dev:registry:prepare` 和 `pnpm verify:ci`；不得使用本地并列 Wing 制品替代发布包。
- 2026-07-24 使用 Node 22.23.1 完成正式门禁：78 份 Markdown、160 个生产源文件、25 个 pure graph、17 个 View root、129 个测试文件与 585 项测试通过；Code/CAD 双 typecheck、Registry 0.5.1 构建和双 VSIX 制品内容门禁通过。VS Code 1.130.0 真实 Extension Host 完成激活、命令注册、Codegen open/preview/conflict/apply/saveReload/rollback 及 Git/Run Block 代表流程。
- 正式候选 `extension/kt-auto-code-0.6.1.vsix` 为 38 个文件、534363 bytes，SHA-256 `d74472c55c4fd7dd845f607b47745511dfcec11c23c55f8b8a8083c60f100e6d`；辅助复核的 CAD 0.1.0 制品为 9 个文件、40332 bytes，SHA-256 `6c55065fd14683c77a4b7e2a5518e076a0554f413651d2e0490393b2a63ac603`。
- 2026-07-24 用户使用上述本地候选完成 Marketplace 上传，并确认人工审查通过；`kuntai.kt-auto-code@0.6.1` 的公开发布闭环完成。本地制品哈希作为上传源归档，未额外下载 Marketplace 制品复算哈希。
- 本地代理未执行 `vsce publish`、Marketplace 上传、Git push 或标签创建；发布操作与审查结果均来自用户回执。

### 0.6.1 发布后开发状态（2026-07-31）

工作树已将 Code/CAD 的全部 Phoenix Wing 依赖精确升级到 Registry 0.6.0，并接入 Git 轻量 summary、expected HEAD + OID 游标分页与取消接口；完整 Git 仓库快照只在合并预检中读取。无 Git 工作区新增“新建 / 搜索所有子目录 / 停止”空状态。此段是下一次候选的开发记录，不改写 2026-07-24 已发布制品的依赖、哈希或验证回执。

## 0.6.0 发布候选（2026-07-22）

0.6.0 新增 Git 与 Run 两个 Code Primary Block，根 workspace 与 Code 扩展同步升级到 0.6.0，KT Auto CAD 保持 0.1.0。Git/Run 的共享实现来自 Phoenix Wing 新包 `git-core`、`git-node`、`run-core`、`run-node`；Code 与 CAD 的 15 处 Wing manifest 引用统一精确升级到 Registry 0.5.0。

- Git 支持勾选一个或多个 commit 生成简报；可选顶部一次 remote URL、时间与 `@`。连续提交合并在共享历史时要求确认，但只改写当前本地分支，不做 stage、push、force push 或引用删除。
- Run 发现多根工作区内的 Task、脚本、可执行文件、CMake 与 CAA 工程；CAA 固定提供 MK/Run、项目版本和关联工程/Preq，并由 VSIX 内置只读 runner 调用厂商批处理链。
- 本地构建必须通过 `pnpm ext:dev:prepare` 的 metafile 来源门禁，证明六个 Wing 包全部来自并列 `phoenix-wing`，没有从 Auto Code `node_modules` 混入旧实现。
- Phoenix Wing 0.5.0 的 12 个 npm 包已发布并完成隔离 Registry 消费验证；Auto Code manifest 与 lockfile 已闭环到正式包，禁止提交 `link:`、`file:`、workspace override 或本地路径。
- 2026-07-21 的并列 Wing 本地候选仅作为历史验证证据，不作为发布制品；0.6.0 最终 VSIX 必须由 Registry 依赖路径重新构建并通过制品门禁。
- 2026-07-22 使用 Node 22.14.0 完成正式门禁：77 份 Markdown、158 个生产源文件、26 个 pure graph、17 个 View root、122 个测试文件与 583 项测试通过；Code/CAD 双 typecheck、Registry 0.5.0 构建、并列 Wing 六包来源门禁及 VS Code 1.129.1 Extension Host smoke 通过，Git/Run 命令均已真实注册和激活。
- 正式归档 `extension/kt-auto-code-0.6.0.vsix`：35 个文件、525810 bytes、SHA-256 `378ac17b78b0aefb62d0d4aeb970842b61ee3882f86ee97df2c7490a442b523c`。制品不包含本地 Wing 回执或外部 Wing runtime require；辅助复核的 CAD 0.1.0 制品为 9 个文件、40342 bytes。
- 未经用户明确授权，不执行 `vsce publish` 或 Marketplace 上传；本轮由 AI 完成本地打包，用户手动发布。

## 0.5.3 发布候选（2026-07-21）

0.5.3 是 Auto Code 的高对比度可访问性 patch；根 workspace 与 Code 扩展同步升级到 0.5.3，KT Auto CAD 保持 0.1.0，七个 Wing manifest 引用继续精确使用 Registry 0.4.3。本轮不新增公共命令或扩展 API。

候选范围：

- Sidebar Primary 的 Ribbon、功能 Block、主次操作按钮、图标按钮与状态标签在高对比度/高对比度浅色主题下统一使用宿主 `contrastBorder`；hover 使用 `contrastActiveBorder` 并回退到 `focusBorder`。
- Codegen Primary、JSON View 预检工具栏、控制符目录和预检详情通过可继承变量把同一对比度规则传入 Shadow DOM；成员排序与关联规则对话框同步覆盖。
- 普通浅色/深色主题继续沿用既有按钮、面板和 hover 背景色；新增回归断言防止发布 bundle 丢失高对比度边框契约。

候选门禁使用 Node 22.14.0 完成：71 份 Markdown 分类/链接、142 个生产源文件、24 个 pure graph、13 个 View root、114 个测试文件与 563 项测试全部通过；Code/CAD 双 typecheck、Registry 0.4.3 对照构建、本地并列 Wing 来源门禁和双 VSIX 制品内容门禁均通过。

- `kt-auto-code-0.5.3.vsix`：29 个文件、469,479 bytes，SHA-256 为 `571685722057901072f22d9f29e49c1e18f72a6e70108ef1aaea1fd70d501f2a`。
- 本轮不重新发布 CAD；辅助门禁重新打包并复核 `kt-auto-cad-0.1.0.vsix` 为 9 个文件、40,342 bytes，SHA-256 为 `95af3574518f54949d7045a188ec3a8ca51ea2ba51f3138ad0e87135cd6cadf7`。
- 用户已确认高对比度模式下的边框与 hover 效果测试通过；上传 Marketplace 前仍应从本地 VSIX 完成一次安装/激活复核。
- Marketplace 发布状态与公开制品哈希将在 `kuntai.kt-auto-code@0.5.3` 发布成功后补入本节。

## 0.5.2 发布候选（2026-07-20）

0.5.2 是 Auto Code 的 patch 发布；根 workspace 与 Code 扩展同步升级到 0.5.2，KT Auto CAD 保持 0.1.0，七个 Wing manifest 引用继续精确使用 Registry 0.4.3。本轮不新增公共命令或扩展 API。

候选范围：

- Codegen single/batch Apply 报告原子写入工作区 `.phoenix/reports/codegen/`，Primary 可重开；报告 JSON 进入 Codegen View，问题位置继续定位源码，批量后台 session 不创建大量 Panel，也不关闭用户原有 View。
- 报告用健康度与源码变化双轴区分“正常 · 内容一致”“有错误 · 部分更新”等结果；汇总标签支持前端筛选，JSON Combo 显示状态并循环切换，选中单项时始终显示且不受残留筛选影响，问题表长路径自动换行。
- 编码修正增加工作区默认 UTF-8/GBK 和头文件、源文件、Markdown 的 ASCII/UTF-8/GBK 覆盖；只执行可无损表示的转换。UTF-8/GBK 扫描、上下文显示与头文件修正保持原文档编码。
- 自动代码标题菜单、共享工具页面滚动位置和 Primary 工具栏 24px 图标完成真实宿主点检。

候选门禁：107 个测试文件、540 项测试，Code/CAD 双 typecheck，140 个生产源文件、24 个 pure graph、13 个 View root，69 份 Markdown 分类/链接均通过；本地并列 Wing 构建、Registry 依赖与制品内容门禁通过。

- `kt-auto-code-0.5.2.vsix`：30 个文件、461,770 bytes，SHA-256 为 `c0064f9ebcbf57a18ac1128501632294508e9a1e74a1d92b7d33aafea9619ca6`。
- 本轮不重新发布 CAD；门禁同时复核既有 `kt-auto-cad-0.1.0.vsix` 为 9 个文件、40,193 bytes。
- Marketplace 发布状态与公开制品哈希将在 `kuntai.kt-auto-code@0.5.2` 发布成功后补入本节。

## 0.5.1 发布回执（2026-07-19）

0.5.1 定位为既有 Codegen 流程的 patch：不新增公共命令或扩展 API。根 workspace 与 Code 扩展版本均为 0.5.1；KT Auto CAD 继续保持 0.1.0，但 Code/CAD 七个 Wing manifest 引用已全部精确升级到 Registry 0.4.3，Codegen 缓存生成器为 0.3.3。

自动门禁结果：

- `pnpm verify:ci`：68 份 Markdown、137 个生产源文件、24 个 pure graph、13 个 View root、105 个测试文件与 515 项测试全部通过；Code/CAD 双 typecheck 通过。
- `kt-auto-code-0.5.1.vsix`：30 个文件、448,030 bytes，SHA-256 为 `3829b5436972b101785f6688cbbfdad7c93896da813057c604d4ecd58092bfcf`。
- 用户已在 VS Code 中手工安装上述 `kt-auto-code-0.5.1.vsix`，确认加载的是本轮最新版本；真实安装回执通过。
- `kt-auto-cad-0.1.0.vsix`：9 个文件、40,148 bytes，SHA-256 为 `b9778df10c9e25c8e3de6db4849489396e716681974b2f765261d15f382708b8`；已作为 `kuntai.kt-auto-cad@0.1.0` 首次公开发布，并声明依赖 `kuntai.kt-auto-code`。
- 隔离 macOS VS Code Extension Host 回执通过扩展激活以及 open、preview、conflict、apply、saveReload、rollback 六条代表流程；Windows 仍由用户手工验证，本文不宣称通过。
- 中文候选提交为 `4abdbc3`；发布、手工安装回执归档后，注释标签 `0.5.1` 解引用到 `0445e5a`，该提交与远端分支一致。

Marketplace 机器回执已确认发布完成：`kuntai.kt-auto-code@0.5.1` 的公开 VSIX SHA-256 为 `3829b5436972b101785f6688cbbfdad7c93896da813057c604d4ecd58092bfcf`，`kuntai.kt-auto-cad@0.1.0` 为 `b9778df10c9e25c8e3de6db4849489396e716681974b2f765261d15f382708b8`，均与本地已验证制品逐字一致；用户同时确认 Marketplace 人工审查通过。本轮公开发布闭环完成。

发布前须确认 Marketplace 中已存在 `kuntai` 发布者；若使用新的发布者 ID，必须先同步修改 `extension/package.json` 的 `publisher` 字段。发布者 ID 创建后不可修改，建议使用公司或品牌的长期唯一标识。

## 首次发布准备

1. 先访问 [Azure DevOps](https://dev.azure.com/)，使用同一 Microsoft 账户登录并创建或选择一个 Azure DevOps **Organization**。未进入任一 Organization 时，通常看不到 PAT 入口。
2. 在 Azure DevOps 页面右上角点击头像，依次选择 **User settings → Personal access tokens → + New Token**。
3. 在 **Create a new personal access token** 窗口填写：
   - **Name**：例如 `VS Code Marketplace publish`。
   - **Organization**：选择 `All accessible organizations`。
   - **Expiration**：按需要设置较短的有效期。
   - **Scopes**：选择 **Custom defined**；点击 Scopes 区域下方的 **Show all scopes**，向下滚动到 **Marketplace**，勾选 **Manage**。
4. 点击 **Create**，立即复制 PAT 并保存到密码管理器。页面关闭后不会再次显示该值；不要提交到仓库或发送给他人。
5. 使用同一 Microsoft 账户登录 [Marketplace 管理页](https://marketplace.visualstudio.com/manage)，在左侧选择 **Create publisher**：
   - **ID**：`kuntai`。
   - **Name**：`Shanghai Kuntai`。

若 **Personal access tokens** 菜单本身不存在，或 Scope 中没有 Marketplace，通常是尚未创建/选择 Azure DevOps Organization，或该 Organization 的管理员限制了 PAT 创建权限；此时需要由管理员将该账户加入允许名单。

首次使用 `vsce login` 时输入该 PAT。PAT 是短期兼容方案；发布自动化应逐步改用 Microsoft Entra ID 的无密钥发布方式。具体以 [VS Code 官方发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) 的最新要求为准。

## 本地构建、验证与发布

从仓库根目录执行，`<发布者ID>` 替换为 Marketplace 发布者 ID：

```bash
pnpm -C extension build
pnpm -C extension exec vsce login <发布者ID>
pnpm -C extension exec vsce package --no-dependencies
pnpm -C extension exec vsce publish
```

建议先执行打包命令，再在 VS Code 中使用 **Extensions: Install from VSIX…** 安装生成的 `.vsix` 文件进行验证。确认扩展可正常激活、各工具可用且市场展示信息正确后，再执行 `publish`。

也可以在 Marketplace 管理页上传 VSIX；打包和发布的命令说明见 [官方文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。

## 每次发布检查清单

- 更新 `extension/package.json` 中的 `version`。
- 更新或创建 `extension/CHANGELOG.md`，说明本次变更。
- 执行构建与测试，并安装 VSIX 完成一次本地验证。
- 检查 README：功能简介、使用方法、截图、隐私说明和支持渠道应准确可用。
- Marketplace 图标位于 `extension/media/cn.kt.doc.AutoCode.Color.128.png`（128 × 128 PNG），由扩展清单顶层字段 `"icon": "media/cn.kt.doc.AutoCode.Color.128.png"` 声明；Activity Bar 的 `kt-auto-code.svg` 不是 Marketplace 图标。替换图标后必须递增 `version`、重新打包 VSIX，再上传新包。
- 补齐 `repository`、`homepage`、`bugs`、`keywords` 和合适的 `categories` 等上架元数据。
- 确认 README 与 CHANGELOG 使用的远程图片均为 HTTPS 地址。
- 确认许可证、版权声明和第三方通知随发布包一同保留。

## 版权与技术来源

KT Auto Code 由上海锟钛开发，面向 CAA / MSVC C++ 工作流提供编码治理、Ignore 配置和工作区搜索替换能力。

其中，名称替换与关联替换算法源自上海锟钛于 2024 年开发的 Windows 应用程序（采用 C++、Qt 与 .NET 技术），并针对 VS Code 插件场景进行了重新设计和实现。

- 软件著作权登记号：`2024SR1374380`
- Copyright © 2024–2026 上海锟钛。
- 本项目采用 [Apache License 2.0](../LICENSE) 开源。

English notice:

> KT Auto Code<br>
> Copyright 2024–2026 Shanghai Kuntai Co.
>
> This product is licensed under the Apache License, Version 2.0.
>
> The rename and replacement algorithms in this product were derived from a Windows application developed by Shanghai Kuntai Co. in 2024, involving C++, Qt, and .NET technologies.
>
> Software Copyright Registration No.: 2024SR1374380
