# 发布 VS Code 插件

本文记录将 **KT Auto Code** 发布到 [Visual Studio Marketplace](https://marketplace.visualstudio.com/) 的操作流程，以及发布时应保留的版权与许可信息。

## 项目信息

- 扩展目录：[`extension/`](../extension/)
- 当前扩展标识：`kuntai.kt-auto-code`
- Marketplace 发布者 ID：`kuntai`
- Marketplace 发布者名称：`Shanghai Kuntai`
- 当前版本：以 [`extension/package.json`](../extension/package.json) 的 `version` 为准
- Marketplace 当前公开版本为 `0.5.0`；本轮 `0.5.1` 是 Wing 0.4.3 消费与既有 Codegen 缺陷改进的 patch 版本。
- 开源许可：[Apache License 2.0](../LICENSE)

当前扩展标识由下列清单字段组成：

```json
{
  "publisher": "kuntai",
  "name": "kt-auto-code"
}
```

## 0.5.1 发布回执（2026-07-19）

0.5.1 定位为既有 Codegen 流程的 patch：不新增公共命令或扩展 API。根 workspace 与 Code 扩展版本均为 0.5.1；KT Auto CAD 继续保持 0.1.0，但 Code/CAD 七个 Wing manifest 引用已全部精确升级到 Registry 0.4.3，Codegen 缓存生成器为 0.3.3。

自动门禁结果：

- `pnpm verify:ci`：68 份 Markdown、137 个生产源文件、24 个 pure graph、13 个 View root、105 个测试文件与 515 项测试全部通过；Code/CAD 双 typecheck 通过。
- `kt-auto-code-0.5.1.vsix`：30 个文件、448,030 bytes，SHA-256 为 `3829b5436972b101785f6688cbbfdad7c93896da813057c604d4ecd58092bfcf`。
- 用户已在 VS Code 中手工安装上述 `kt-auto-code-0.5.1.vsix`，确认加载的是本轮最新版本；真实安装回执通过。
- `kt-auto-cad-0.1.0.vsix`：9 个文件、40,148 bytes，SHA-256 为 `b9778df10c9e25c8e3de6db4849489396e716681974b2f765261d15f382708b8`；本轮不重复发布该同版本制品。
- 隔离 macOS VS Code Extension Host 回执通过扩展激活以及 open、preview、conflict、apply、saveReload、rollback 六条代表流程；Windows 仍由用户手工验证，本文不宣称通过。
- 中文候选提交为 `4abdbc3`，本地注释标签 `0.5.1` 正确解引用到该提交。

Marketplace 当前公开版本仍为 0.5.0。上传 0.5.1 时本机保存的 VSCE Personal Access Token 返回 `TF400813`，上传未发生；更新 `kuntai` 登录凭据后，应直接上传上述已验证 Code VSIX，不重新构建或改动标签。上传完成后必须用 `vsce show kuntai.kt-auto-code --json` 确认 0.5.1 已出现在版本列表，再把本段改为完成态。

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
