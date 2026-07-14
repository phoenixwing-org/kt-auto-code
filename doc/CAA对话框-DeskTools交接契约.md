# CAA 对话框：VS Code → Desk Tools 交接契约

## 边界

VS Code 插件只扫描 `.CATDlg` 文件并按用户点击调用已配置的外部编辑器；不复制 Desk Tools 的 Vue 编辑器，不解析、patch 或写回 CAA 文件。真正的解析、布局编辑、NLS、Wizard 区域保护和 Git 审核继续由 Desk Tools 的 `catdlg-core` 与其宿主完成。

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

## 后续桥接

未来本地桥接可通过 VS Code command/RPC 读取上述数据后，启动或激活 Desk Tools 编辑窗口。桥接协议的版本和兼容性检查由 Desk Tools 负责；若它不可用，插件只保留选择结果，不作降级写盘。
