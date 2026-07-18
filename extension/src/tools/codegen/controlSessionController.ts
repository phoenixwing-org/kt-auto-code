import {
  KT_CODEGEN_BLOCK_PRESENTATIONS,
  KT_CODEGEN_LEGACY_BLOCKS,
  ktCodegenBlockKeysForPreset,
  ktCodegenIsBlockKey,
  type KtCodegenBlockKey,
} from "@phoenix-wing/kt-codegen";
import type {
  KtcCodegenControlCatalogViewModel,
  KtcCodegenControlViewModel,
} from "./controlViewModel.js";
import type { KtcCodegenDocumentModel } from "./documentModel.js";
import {
  ktcCodegenControlTemplateLogLines,
  ktcCodegenControlTemplates,
  ktcCodegenMissingControlTemplates,
} from "./controlTemplates.js";

export type KtcCodegenControlCommand =
  | {
      readonly type: "codegenControlSelection";
      readonly blockKeys: readonly KtCodegenBlockKey[];
      readonly singleMode: boolean;
    }
  | { readonly type: "codegenControlDisplay"; readonly showMissingTemplates: boolean }
  | {
      readonly type: "codegenControlOutput";
      readonly scope: "all" | "block";
      readonly blockKey?: KtCodegenBlockKey;
    };

export interface KtcCodegenControlCommandResult {
  readonly modelChanged: boolean;
  readonly statusMessage?: string;
  readonly editorStatusMessage?: string;
  readonly logLines?: readonly string[];
}

const PRESENTATION_BY_KEY = new Map(
  KT_CODEGEN_BLOCK_PRESENTATIONS.map((item) => [item.key, item]),
);

const CONTROL_BLOCKS = KT_CODEGEN_LEGACY_BLOCKS.map((block) => ({
  ...block,
  title: PRESENTATION_BY_KEY.get(block.key)?.title ?? block.key,
  controlWords: block.key,
  notes: PRESENTATION_BY_KEY.get(block.key)?.notes ?? block.legacyCall,
}));

/** UI-neutral 的控制符会话投影与命令状态机；不访问 VS Code、DOM、Output 或文件。 */
export class KtcCodegenControlSessionController {
  catalogModel(session: KtcCodegenDocumentModel): KtcCodegenControlCatalogViewModel {
    return {
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: session.identity.uri,
      fileName: session.identity.fileName,
      blocks: CONTROL_BLOCKS,
      selectedBlockKeys: session.selectedBlockKeys,
      singleSelectionMode: session.singleSelectionMode,
      showMissingTemplates: session.showMissingTemplates,
      preflightAvailable: Boolean(session.preflight),
      missingTemplates: session.showMissingTemplates
        ? ktcCodegenMissingControlTemplates(
            session.controller.param,
            session.selectedBlockKeys,
            session.preflight?.plan,
          )
        : [],
      presets: {
        all: ktCodegenBlockKeysForPreset("all"),
        none: ktCodegenBlockKeysForPreset("none"),
        cppOnly: ktCodegenBlockKeysForPreset("cpp-only"),
        fieldCode: ktCodegenBlockKeysForPreset("field-code"),
      },
    };
  }

  viewModel(session: KtcCodegenDocumentModel): KtcCodegenControlViewModel {
    return {
      ...this.catalogModel(session),
      ...(session.preflight ? {
        preflight: {
          plan: session.preflight.plan,
          reused: session.preflight.reused,
          createdAt: session.preflight.createdAt,
        },
      } : {}),
    };
  }

  handle(
    session: KtcCodegenDocumentModel,
    command: KtcCodegenControlCommand,
  ): KtcCodegenControlCommandResult {
    if (command.type === "codegenControlDisplay") {
      const modelChanged = session.setShowMissingTemplates(Boolean(command.showMissingTemplates));
      return modelChanged ? {
        modelChanged,
        statusMessage: session.showMissingTemplates
          ? "已显示当前预检未命中的控制符模板。"
          : "已隐藏未命中的控制符模板。",
      } : { modelChanged };
    }

    if (command.type === "codegenControlOutput") {
      const blockKeys = command.scope === "block" && command.blockKey && ktCodegenIsBlockKey(command.blockKey)
        ? [command.blockKey]
        : command.scope === "all"
          ? KT_CODEGEN_LEGACY_BLOCKS.map((block) => block.key)
          : [];
      const templates = ktcCodegenControlTemplates(session.controller.param, blockKeys);
      return {
        modelChanged: false,
        logLines: ktcCodegenControlTemplateLogLines(session.identity.fileName, command.scope, templates),
        statusMessage: templates.length
          ? `已输出 ${templates.length} 组控制符模板到 KT Auto Code 日志。`
          : "当前参数表没有可输出的 classId，说明已写入 KT Auto Code 日志。",
      };
    }

    const selected: KtCodegenBlockKey[] = [];
    for (const key of command.blockKeys) {
      if (ktCodegenIsBlockKey(key)) selected.push(key);
    }
    const change = session.setSelectedBlockKeys(selected, command.singleMode);
    const modelChanged = change.selectionChanged || change.modeChanged;
    if (!modelChanged) return { modelChanged };
    const statusMessage = change.selectionChanged
      ? `已选择 ${session.selectedBlockKeys.length} / ${KT_CODEGEN_LEGACY_BLOCKS.length} 个控制符；请重新预检。`
      : `已${session.singleSelectionMode ? "开启" : "关闭"}控制符单选模式。`;
    return { modelChanged, statusMessage, editorStatusMessage: statusMessage };
  }
}
