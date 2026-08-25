# CAA UI：VS Code → Desk Tools 交接契约

## 边界

VS Code 插件只扫描 `.CATDlg` 文件并按用户点击交给 Desk Tools 或已配置的外部编辑器；不复制 Desk Tools 的 Vue 编辑器，不解析、patch 或写回 CAA 文件。真正的解析、布局编辑、NLS、Wizard 区域保护和 Git 审核继续由 Desk Tools 的 `catdlg-core` 与其宿主完成。

## v1 会话交接

用户从 CAA 结果列表通过外部编辑器图标打开文件后，扩展命令 `ktAutoCode.caaDialog.getHandoff` 返回最近一次该文件的 `phoenix-wing/code-core` 交接数据。该 v1 单文件兼容行为不代表外部编辑器已获得写盘授权：

```ts
type KtcCaaDialogHandoff = {
  protocol: "phoenix-desk-tools.caa-dialog.v1";
  workspaceUri: string;
  selectedFiles: Array<{ uri: string; relativePath: string }>;
};
```

- `uri` 是 VS Code 标准 URI，不能假设是本机 POSIX 路径；Desk bridge 必须只接受 `file:` URI，并在自己的信任边界内解码。
- `relativePath` 仅用于显示和审计，后端必须用 `uri` 重新验证它仍在 `workspaceUri` 内。
- 尚未从结果列表打开文件时命令返回 `undefined`，后端不得打开编辑窗口。
- 交接数据不包含文件内容、解析结果、鉴权 token 或写盘授权；Desk Tools 必须自行读取、解析、dry-run、确认和写盘。
- Desk bridge 在接收前必须调用 `pnwIsCaaDialogHandoff()` 做形状与 URI 基线校验；该函数不替代“文件仍在工作区内”的宿主级授权检查。

## 已实现的本地桥接

Desk Tools 本地 API 首选 `127.0.0.1:48375`，占用时顺序尝试至 `48406`。实际端口不由插件扫描猜测，而由运行中的 Desk Tools 写入当前用户的平台标准注册目录：

| 平台 | `service.v1.json` 目录 |
| --- | --- |
| Windows | `%LOCALAPPDATA%\\phoenix-wing\\phoenix\\services\\desk-tools\\` |
| macOS | `~/Library/Application Support/phoenix-wing/phoenix/services/desk-tools/` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/phoenix-wing/phoenix/services/desk-tools/` |

插件只接受 schema/protocol v1、`127.0.0.1`、有效端口和固定 CAA 路径，随后请求 `/api/caa/health` 二次确认。注册文件不是在线证明；异常退出留下的 stale 文件只会显示离线，不会被当作可用服务。

实际接口为 `POST http://127.0.0.1:<registered-port>/api/caa/dialog/open`。接口可直接接收上述 v1 handoff，也可接收单文件形式：

```json
{
  "workspaceRoot": "/absolute/workspace",
  "file": "/absolute/workspace/UI/Sample.CATDlg"
}
```

Desk Tools 会重新验证工作空间、扩展名、文件存在性与路径边界，随后把请求交给当前 UI，必要时切换工作空间并打开 CAA 编辑 Tab。插件默认自动发现此接口；若用户配置了自定义 executable，则改为启动该命令。Tauri EXE 支持 `--workspace <dir> --catdlg <file>`，也支持文件关联式的单个 `.CATDlg` 参数。

插件进入 CAA UI Block 时会重新读取注册并调用 `/api/caa/health`，只有响应包含 `service: "caa"` 与 `protocol_version: 1` 才显示为在线；端口被其他 HTTP 服务占用不会误判。用户也可以在 Block 内手动重新检测。

统一设置位于 `KT Auto Code › Desk Tools`。扩展首次激活时只迁移用户明确配置过的旧 `ktAutoCode.caa.externalEditor.*` 和 `ktAutoCad.deskToolsProviderManifest`；不会迁移默认值，也不会覆盖任何新设置。旧 key 暂时保留兼容读取。

`installation.v1.json` 与运行服务注册职责不同：它持久记录 Desk Tools 安装包中的 CAD 深度读取器。Auto CAD 可以在 Desk Tools 窗口和 HTTP 服务都未运行时直接校验并执行该读取器；CAA UI 打开 CATDlg 则必须有正在运行的桌面服务。

UI 对打开请求采用“读取后确认”语义：`GET /api/caa/dialog/open-requests` 不删除请求，只有 CATDlg 成功打开后才调用 `POST /api/caa/dialog/open-requests/ack`。这样切换工作区或打开页面失败时可以在下次轮询重试。当前插件侧验收步骤见 [CAA UI / Desk Tools 人工验收清单](CAA-UI-DeskTools人工验收清单.md)。
