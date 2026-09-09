import type { KtcCodegenDocumentModel, KtcCodegenSaveSnapshot } from "./documentModel.js";
import { KtcCodegenFileEventQueue } from "./fileEventQueue.js";

export type KtcCodegenSaveCompletion = "saved" | "cancelled" | "stale" | "written-stale";

/** 保存与外部 JSON/reload 共用资源队列；编辑仍可继续，不受 IO 队列锁定。 */
export class KtcCodegenDocumentSaveController {
  constructor(private readonly events: KtcCodegenFileEventQueue) {}

  async save(
    session: KtcCodegenDocumentModel,
    snapshot: KtcCodegenSaveSnapshot,
    port: {
      readonly isCurrent: () => boolean;
      readonly write: () => Promise<{ readonly fingerprint: string; readonly diagnosticCount: number } | undefined>;
      readonly saved: () => void;
    },
  ): Promise<KtcCodegenSaveCompletion> {
    let completion: KtcCodegenSaveCompletion = "cancelled";
    await this.events.enqueue(session.identity.uri, async () => {
      if (!port.isCurrent() || session.revision !== snapshot.revision) {
        completion = "stale";
        return;
      }
      const saved = await port.write();
      if (!saved) return;
      if (!port.isCurrent() || session.revision !== snapshot.revision) {
        // IO 已完成，但不能用旧保存覆盖重建/重载后的会话 checkpoint。
        if (port.isCurrent()) session.markExternalChanged();
        completion = "written-stale";
        return;
      }
      session.markSaved(saved.diagnosticCount, saved.fingerprint, snapshot);
      // 回执也是资源操作的一部分，必须先于队列里后续的 reload/保存发布。
      port.saved();
      completion = "saved";
    });
    return completion;
  }
}
