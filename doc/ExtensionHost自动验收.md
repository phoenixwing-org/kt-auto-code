# KT Auto Code Extension Host 自动验收

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-17

## 入口

```bash
pnpm ext:test:host
```

命令先构建扩展和专用测试 bundle，再用独立 user-data、extensions 目录与临时 Codegen fixture 启动本机真实 Visual Studio Code Extension Host。macOS 默认使用 `/Applications/Visual Studio Code.app`；其他平台可用 `KTC_VSCODE_EXECUTABLE` 指定 `code` 可执行文件。

测试 bundle 位于 `dist/test/`，由 `.vscodeignore` 排除，不进入 VSIX。

## 自动判定范围

- 发现并激活 `kuntai.kt-auto-code`，验证 Shell API v2 与代表命令已在真实 Extension Host 注册。
- 打开 Codegen Block，使用真实 `vscode.workspace.fs` 打开并规范化 fixture JSON。
- 执行安全保存和复读；制造外部 JSON 变化，确认旧 checkpoint 不能覆盖新字节。
- 建立真实 Marker Index/Preflight Cache，执行 Wing Analyze/Apply，并通过 VS Code 文件端口写入源码。
- 在第二个文件写入后注入失败，确认已尝试文件按真实磁盘字节逆序恢复。
- Extension Host 在临时工作区写入 `extension-host-smoke-v1.json`；外层进程再次验证所有 flow 字段，缺项即失败。

视觉主题、取消按钮、交互弹窗和 VSIX 安装仍由 A–F 人工矩阵承担；自动 smoke 不把这些未观察事实标成通过。
