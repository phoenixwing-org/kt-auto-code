import * as vscode from "vscode";
import {
  appendIgnorePresetToDocument,
  mergeGitIgnoreIntoDocument,
  openIgnoreConfigFile,
  refreshIgnoreConfig,
  removeIgnorePresetFromDocument,
} from "./ignoreConfig.js";
import { KtcIgnoreRecommendationController } from "./ignoreRecommendationController.js";
import type { IgnoreConfigSummary, WebviewInboundMessage } from "./tools/types.js";

type KtcIgnoreMessageType =
  | "openIgnoreFile"
  | "syncIgnoreFromGit"
  | "applyIgnorePreset"
  | "analyzeIgnore";

export type KtcIgnoreMessage = Extract<WebviewInboundMessage, { type: KtcIgnoreMessageType }>;

export interface KtcIgnoreControllerResult {
  summary?: IgnoreConfigSummary;
  error?: string;
}

const ignoreMessageTypes = new Set<KtcIgnoreMessageType>([
  "openIgnoreFile",
  "syncIgnoreFromGit",
  "applyIgnorePreset",
  "analyzeIgnore",
]);

export function ktcIsIgnoreMessage(message: WebviewInboundMessage): message is KtcIgnoreMessage {
  return ignoreMessageTypes.has(message.type as KtcIgnoreMessageType);
}

export class KtcIgnoreController {
  private readonly recommendations = new KtcIgnoreRecommendationController();

  snapshot(root: string | undefined): IgnoreConfigSummary | undefined {
    return refreshIgnoreConfig(root);
  }

  async handle(
    message: KtcIgnoreMessage,
    root: string | undefined,
    onSummary: (summary: IgnoreConfigSummary) => void = () => {},
  ): Promise<KtcIgnoreControllerResult> {
    if (!root) return this.fail("请先打开工作区文件夹。", true);
    try {
      let summary: IgnoreConfigSummary | undefined;
      if (message.type === "openIgnoreFile") {
        await openIgnoreConfigFile(root);
        summary = this.snapshot(root);
      } else if (message.type === "syncIgnoreFromGit") {
        summary = await mergeGitIgnoreIntoDocument(root);
      } else if (message.type === "applyIgnorePreset") {
        summary = message.action === "append"
          ? await appendIgnorePresetToDocument(root, message.presetId)
          : await removeIgnorePresetFromDocument(root, message.presetId);
      } else {
        await this.recommendations.analyze(root, onSummary);
      }
      if (summary) onSummary(summary);
      return { summary };
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(text: string, warning = false): KtcIgnoreControllerResult {
    if (warning) void vscode.window.showWarningMessage(text);
    else void vscode.window.showErrorMessage(text);
    return { error: text };
  }
}

export const ktcIgnoreController = new KtcIgnoreController();
