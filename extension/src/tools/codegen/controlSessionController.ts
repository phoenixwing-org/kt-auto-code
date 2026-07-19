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
  ktcCodegenControlTemplateClipboardText,
  ktcCodegenControlTemplateLogLines,
  ktcCodegenControlTemplatesForOutput,
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
      readonly scope: "all";
    }
  | {
      readonly type: "codegenControlOutput";
      readonly scope: "visible";
      readonly blockKeys: readonly KtCodegenBlockKey[];
    }
  | {
      readonly type: "codegenControlOutput";
      readonly scope: "block";
      readonly blockKey?: KtCodegenBlockKey;
    };

export interface KtcCodegenControlCommandResult {
  readonly modelChanged: boolean;
  readonly statusMessage?: string;
  readonly editorStatusMessage?: string;
  readonly logLines?: readonly string[];
  /** 可直接粘贴的源码块；由 Host adapter 写入系统剪贴板。 */
  readonly clipboardText?: string;
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

/** Wing 0.4.3+ 的可选 marker 诊断上下文；intersection 保持 Registry 0.4.2 可编译。 */
interface KtcStructuredMarkerDiagnostic {
  readonly marker?: {
    readonly kind: "start" | "end";
    readonly classId: string;
    readonly blockKey: string;
    readonly boundary?: {
      readonly kind: "start" | "end";
      readonly line: number;
    };
  };
}

function unclosedForBlock(
  diagnostics: NonNullable<KtcCodegenDocumentModel["preflight"]>["plan"]["diagnostics"],
  blockKey: KtCodegenBlockKey,
) {
  return diagnostics.flatMap((diagnostic) => {
    const marker = (diagnostic as typeof diagnostic & KtcStructuredMarkerDiagnostic).marker;
    if (diagnostic.code !== "marker.missing-end"
      || !diagnostic.path?.file
      || !Number.isInteger(diagnostic.path.row)
      || marker?.kind !== "start"
      || marker.blockKey !== blockKey
      || !ktCodegenIsBlockKey(marker.blockKey)
      || !marker.classId.trim()) return [];
    return [{
      code: "marker.missing-end" as const,
      path: diagnostic.path.file,
      line: diagnostic.path.row!,
      column: Math.max(0, diagnostic.path.column ?? 0),
      classId: marker.classId,
      expectedEnd: `// END KEVIN CAA WIZARD SECTION ${marker.classId} ${blockKey}`,
      ...(marker.boundary ? { boundary: marker.boundary } : {}),
      message: diagnostic.message,
    }];
  });
}

/** UI-neutral 的控制符会话投影与命令状态机；不访问 VS Code、DOM、Output 或文件。 */
export class KtcCodegenControlSessionController {
  catalogModel(session: KtcCodegenDocumentModel): KtcCodegenControlCatalogViewModel {
    const snapshot = session.preflightSnapshot;
    const displayPlan = snapshot?.result.plan;
    const selected = new Set(session.selectedBlockKeys);
    const hitCount = new Map<KtCodegenBlockKey, number>();
    const artifactCount = new Map<KtCodegenBlockKey, number>();
    for (const region of displayPlan?.markerRegions ?? []) {
      hitCount.set(region.blockKey, (hitCount.get(region.blockKey) ?? 0) + 1);
    }
    for (const artifact of displayPlan?.artifacts ?? []) {
      artifactCount.set(artifact.blockKey, (artifactCount.get(artifact.blockKey) ?? 0) + 1);
    }
    return {
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: session.identity.uri,
      fileName: session.identity.fileName,
      blocks: CONTROL_BLOCKS.map((block) => {
        const blockHitCount = hitCount.get(block.key) ?? 0;
        const unclosed = unclosedForBlock(displayPlan?.diagnostics ?? [], block.key);
        return {
          ...block,
          status: !snapshot
            ? selected.has(block.key) ? "pending" as const : "unselected" as const
            : unclosed.length > 0
              ? "unclosed" as const
              : blockHitCount > 0
                ? "hit" as const
                : "missing" as const,
          hitCount: blockHitCount,
          artifactCount: artifactCount.get(block.key) ?? 0,
          unclosed,
        };
      }),
      selectedBlockKeys: session.selectedBlockKeys,
      singleSelectionMode: session.singleSelectionMode,
      showMissingTemplates: session.showMissingTemplates,
      preflightAvailable: Boolean(snapshot),
      missingTemplates: session.showMissingTemplates
        ? ktcCodegenMissingControlTemplates(
            session.controller.param,
            session.selectedBlockKeys,
            displayPlan,
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
    const snapshot = session.preflightSnapshot;
    return {
      ...this.catalogModel(session),
      ...(snapshot ? {
        preflight: {
          plan: snapshot.result.plan,
          reused: snapshot.result.reused,
          createdAt: snapshot.result.createdAt,
          state: snapshot.state,
          message: snapshot.message,
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
      const requested = command.scope === "visible"
        ? new Set(command.blockKeys.filter(ktCodegenIsBlockKey))
        : undefined;
      const blockKeys = command.scope === "block" && command.blockKey && ktCodegenIsBlockKey(command.blockKey)
        ? [command.blockKey]
        : command.scope === "all"
          ? KT_CODEGEN_LEGACY_BLOCKS.map((block) => block.key)
          : requested
            ? KT_CODEGEN_LEGACY_BLOCKS.filter((block) => requested.has(block.key)).map((block) => block.key)
            : [];
      if (command.scope === "visible" && !blockKeys.length) {
        return {
          modelChanged: false,
          logLines: [`[Codegen][ControlTemplates][info] filter.empty：当前筛选没有可输出的控制符；json=${session.identity.fileName}`],
          statusMessage: "当前筛选没有可输出的控制符。",
        };
      }
      const templates = ktcCodegenControlTemplatesForOutput(
        session.controller.param,
        blockKeys,
        session.controller,
      );
      const renderedCount = templates.filter((template) => Boolean(template.content)).length;
      return {
        modelChanged: false,
        logLines: ktcCodegenControlTemplateLogLines(session.identity.fileName, command.scope, templates),
        clipboardText: ktcCodegenControlTemplateClipboardText(templates) || undefined,
        statusMessage: templates.length
          ? `已输出 ${templates.length} 组控制符到 KT Auto Code 日志，其中 ${renderedCount} 组使用当前 JSON 真实生成内容。`
          : "当前参数表没有可输出的 classId，说明已写入 KT Auto Code 日志。",
      };
    }

    const requested = new Set(command.blockKeys.filter(ktCodegenIsBlockKey));
    const selected = KT_CODEGEN_LEGACY_BLOCKS
      .filter((block) => requested.has(block.key))
      .map((block) => block.key);
    const change = session.setSelectedBlockKeys(selected, command.singleMode);
    const modelChanged = change.selectionChanged || change.modeChanged;
    if (!modelChanged) return { modelChanged };
    const statusMessage = change.selectionChanged
      ? `已选择 ${session.selectedBlockKeys.length} / ${KT_CODEGEN_LEGACY_BLOCKS.length} 个控制符；请重新预检。`
      : `已${session.singleSelectionMode ? "开启" : "关闭"}控制符单选模式。`;
    return { modelChanged, statusMessage, editorStatusMessage: statusMessage };
  }
}
