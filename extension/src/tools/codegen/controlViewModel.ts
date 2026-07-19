import type {
  KtCodegenBlockKey,
  KtCodegenLegacyBlockState,
  KtCodegenPlan,
  KtCodegenPlatform,
} from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlTemplate } from "./controlTemplates.js";

export interface KtcCodegenControlBlockViewModel {
  readonly key: KtCodegenBlockKey;
  readonly legacyId: number;
  readonly platform: KtCodegenPlatform;
  readonly legacyState: KtCodegenLegacyBlockState;
  readonly legacyCall: string;
  readonly title: string;
  readonly controlWords: string;
  readonly notes: string;
  /** 当前 Host session 的预检状态；筛选只消费该投影，不在 Webview 猜测。 */
  readonly status: "unselected" | "pending" | "hit" | "unclosed" | "missing";
  readonly hitCount: number;
  readonly artifactCount: number;
  /** missing-end 的安全 UI 投影；诊断码保持不变，行号仍为 0-based。 */
  readonly unclosed?: readonly KtcCodegenUnclosedControl[];
}

export interface KtcCodegenUnclosedControl {
  readonly code: "marker.missing-end";
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly classId: string;
  readonly expectedEnd: string;
  readonly boundary?: {
    readonly kind: "start" | "end";
    /** Wing 诊断文案中的用户可见 1-based 行号。 */
    readonly line: number;
  };
  readonly message: string;
}

/** Primary / JSON View 共用的控制符目录与会话状态投影。 */
export interface KtcCodegenControlCatalogViewModel {
  readonly kind: "kt.codegen.control-view-model";
  readonly schemaVersion: 1;
  readonly uri: string;
  readonly fileName: string;
  readonly blocks: readonly KtcCodegenControlBlockViewModel[];
  readonly selectedBlockKeys: readonly KtCodegenBlockKey[];
  readonly singleSelectionMode: boolean;
  readonly showMissingTemplates: boolean;
  readonly preflightAvailable: boolean;
  readonly missingTemplates: readonly KtcCodegenControlTemplate[];
  readonly presets: {
    readonly all: readonly KtCodegenBlockKey[];
    readonly none: readonly KtCodegenBlockKey[];
    readonly cppOnly: readonly KtCodegenBlockKey[];
    readonly fieldCode: readonly KtCodegenBlockKey[];
  };
}

/** JSON View 在共享目录投影上附加完整预检结果。 */
export interface KtcCodegenControlViewModel extends KtcCodegenControlCatalogViewModel {
  readonly preflight?: {
    readonly plan: KtCodegenPlan;
    readonly reused: boolean;
    readonly createdAt: string;
    /** ready 才有可执行 plan；applied/stale 只是最近结果的只读快照。 */
    readonly state: "ready" | "applied" | "stale";
    readonly message: string;
  };
}
