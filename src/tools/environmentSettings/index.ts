import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { ktcOpenPluginSettings } from "../../caaSettings.js";
import {
  ktcClearProjectEnvironmentVariable,
  ktcReadProjectEnvironmentStatus,
  ktcSetProjectEnvironmentVariable,
  type KtcProjectEnvironmentVariable,
} from "../../projectEnvironment.js";

const VARIABLE_BY_KEY = {
  customRoot: "ROOT_DIR",
  thirdPartyRoot: "ROOT_DIR_3rdParty",
  coreRoot: "ROOT_DIR_CORE",
  caaMkVersion: "CAA_MK_VERSION",
} as const satisfies Record<string, KtcProjectEnvironmentVariable>;

export const environmentSettingsTool: KtTool = {
  id: "environmentSettings",
  title: "设置",
  description: "管理 Ignore、工程环境和插件配置。",
  icon: "media/tools/environment-settings.svg",

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.environment.open", () => {
        void vscode.commands.executeCommand("ktAutoCode.tool.show", this.id);
      }),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) {
      await this.runAction(message.action, ctx);
    } else if (message.type === "environmentAction" && message.toolId === this.id) {
      try {
        if (message.action === "openSystemSettings") await openSystemEnvironmentSettings();
        else if (message.action === "openPluginSettings") await ktcOpenPluginSettings();
        else if (message.action === "set") {
          await ktcSetProjectEnvironmentVariable(VARIABLE_BY_KEY[message.key], message.value);
        } else if (message.action === "pick") {
          const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: `设为 ${VARIABLE_BY_KEY[message.key]}`,
            title: `选择 ${VARIABLE_BY_KEY[message.key]} 的目录或文件`,
          });
          if (!selected?.[0]) return;
          await ktcSetProjectEnvironmentVariable(VARIABLE_BY_KEY[message.key], selected[0].fsPath);
        } else if (message.action === "clear") {
          const variable = VARIABLE_BY_KEY[message.key];
          const confirmed = await vscode.window.showWarningMessage(
            `清除当前用户的 ${variable}？机器级同名值不会被修改。`,
            { modal: true },
            "清除用户变量",
          );
          if (confirmed !== "清除用户变量") return;
          await ktcClearProjectEnvironmentVariable(variable);
        }
        await refreshEnvironment(ctx, message.action === "set" || message.action === "pick" || message.action === "clear"
          ? "用户环境变量已更新；新终端和其他应用需要重新启动后才会继承新值。"
          : undefined);
      } catch (error) {
        ctx.postState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
  },

  async runAction(_action: string, ctx: ToolRunContext): Promise<void> {
    await refreshEnvironment(ctx);
  },
};

async function refreshEnvironment(ctx: ToolRunContext, updateMessage?: string): Promise<void> {
  ctx.postState({ status: "running", message: "正在读取操作系统工程环境变量…" });
  try {
    const environment = await ktcReadProjectEnvironmentStatus();
    const missingRequired = environment.values.filter((value) => value.required && !value.value).length;
    const invalidRequired = environment.values.filter((value) => value.required && value.value && !existsSync(value.value)).length;
    ctx.postState({
      status: missingRequired || invalidRequired ? "error" : "done",
      message: updateMessage ?? (missingRequired
        ? `缺少 ${missingRequired} 个必需工程环境变量；请在操作系统环境变量中创建后刷新。`
        : invalidRequired
          ? `${invalidRequired} 个必需工程路径当前无法访问，请检查路径或磁盘。`
          : "工程环境变量已就绪。"),
      environmentValues: environment.values.map((value) => ({
        key: value.key,
        environmentVariable: value.environmentVariable,
        required: value.required,
        source: value.value ? "system" : "missing",
        value: value.value,
        suggestedValue: value.suggestedValue,
        pathExists: value.key === "caaMkVersion" || !value.value ? undefined : existsSync(value.value),
      })),
    });
  } catch (error) {
    ctx.postState({ status: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

async function openSystemEnvironmentSettings(): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("rundll32.exe", ["sysdm.cpl,EditEnvironmentVariables"], {
        detached: true,
        windowsHide: false,
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("spawn", () => { child.unref(); resolve(); });
    });
    return;
  }
  void vscode.window.showInformationMessage(
    "请在操作系统或登录 shell 中设置 ROOT_DIR、ROOT_DIR_3rdParty、ROOT_DIR_CORE 与可选的 CAA_MK_VERSION，然后返回此 Block 刷新。",
  );
}
