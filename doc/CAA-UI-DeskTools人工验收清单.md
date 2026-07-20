# CAA UI / Desk Tools 人工验收清单

状态：current

Owner：KT Auto Code maintainers

适用版本：Auto Code 0.5.x、Auto CAD 0.1.x、Desk Tools 0.2.x

最后核验：2026-07-20

## 准备

- [ ] 安装最新 KT Auto Code、可选 KT Auto CAD 与 Desk Tools。
- [ ] 在本地 VS Code 工作区放入一个 `.CATDlg` 和一个可读取的 `.FCStd`。
- [ ] 确认 `KT Auto Code › Desk Tools › Discovery Mode` 为 `auto`，其余覆盖保持空白。

## CAA UI 动态服务发现

- [ ] 完全退出 Desk Tools 后打开 CAA UI，状态显示未启动或不可连接；VS Code 不冻结。
- [ ] 启动 Desk Tools，CAA UI 点击“连接 Desk Tools”后显示 `127.0.0.1:<实际端口>`。
- [ ] 打开 `service.v1.json`，确认端口与 UI 一致且位于 `48375..48406`。
- [ ] 占用 `48375` 后重启 Desk Tools，确认它选择后续端口，CAA UI 不需要修改设置即可重连。
- [ ] 从结果行选择“在 Desk Tools 中打开”，确认 Desk Tools 切换到正确工作区并打开正确 CATDlg。
- [ ] 退出 Desk Tools 后重新检测，状态回到离线；正常退出后 `service.v1.json` 已清理。

## 设置兼容迁移

- [ ] 在旧版扩展设置一个自定义 CAA command、args 或 endpoint，再安装新版；确认值只迁入 `KT Auto Code › Desk Tools` 一次。
- [ ] 预先填写任一新设置，再保留不同的旧值；确认新版不覆盖新值。
- [ ] 只有旧 endpoint 时，迁移后 `Discovery Mode` 为 `custom`；恢复 `auto` 后重新使用服务注册。

## Auto CAD 深度读取

- [ ] Desk Tools 至少成功启动一次，使 `installation.v1.json` 记录已安装的 `native-provider.json`。
- [ ] 完全退出 Desk Tools，确认 Auto CAD Ribbon 不出现独立“连接”工具。
- [ ] 在“读取”中执行 CAD 深度分析，确认读取器校验与 FCStd 读取成功，且不要求 Desk Tools 窗口或 HTTP 服务运行。
- [ ] 手动填写错误读取器路径，确认显示校验失败且不会绕过平台、Schema、SHA-256 或 protocol v1 门禁。

## 记录

记录 Windows/macOS、VS Code、三个产品版本、实际端口、注册文件路径及失败日志。动态端口和安装读取器是两项独立能力，不用“Desk Tools 已连接”替代 CAD 读取器状态。
