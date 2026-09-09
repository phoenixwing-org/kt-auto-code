# CAA Combo 选择通知生成错误

状态：生成器已修复、自动回归通过；CAA 实际运行待验。

## 问题与原因

用户反馈：Combo 切换条目后，读到的参数仍为第 0 行。

生成器使用 `GetComboModifyNotification()`，但参数通过 `SetSelect()` / `GetSelect()` 读写行索引，应绑定列表选择通知 `GetComboSelectNotification()`。依据为 B20 `CATDlgCombo.h`；“始终第 0 行”的具体运行过程仍待实机验证。

## 修复（仅一行）

位置：`phoenix-wing/packages/kt-codegen/src/renderer/caa-dialog-family.ts`，提交 `5e5649e`。

```ts
`${prefix}ipDialogAgent->AcceptOnNotify(${component}, ${component}->GetComboSelectNotification());`,
```

参数回填与读取保持不变：

```cpp
dialogMore->_ComboPartCount->SetSelect(parameter->PartCount, 0);
parameter->PartCount = dialogMore->_ComboPartCount->GetSelect();
```

`SetSelect` 的第二个参数 `0` 表示回填不发通知，不是选择第 0 行。保存的是行索引，不是条目文字对应的数量。本次不改控件创建、可编辑 Combo 文本处理或用户 C++ 示例。

## 验证

- [x] 通知改为 Select；`SetSelect(..., 0)`、`GetSelect()` 及非 Combo 输出保持。
- [x] kt-codegen 31 文件 / 139 项测试、构建通过；新增 7 例覆盖 Combo 变体、主/More dialog、count 及禁用分支。

macOS 未执行 CAA 编译/交互验证。问题示例：`PNXBomAnalysisUI.m/src/PNXBomAnalysisDlg.cpp`；接口：`CAA_SDK/Dialog/PublicInterfaces/CATDlgCombo.h`。
