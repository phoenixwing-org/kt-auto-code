import { dirname, join } from "node:path";
import {
  ktcCodegenApplyReceiptRelativePath,
  ktcSerializeCodegenApplyReceipt,
  type KtcCodegenApplyReceipt,
} from "./applyReceipt.js";

export interface KtcCodegenApplyReceiptStorePort {
  createDirectory(path: string): PromiseLike<void>;
  writeFile(path: string, content: Uint8Array): PromiseLike<void>;
  rename(source: string, target: string): PromiseLike<void>;
  deleteFile(path: string): PromiseLike<void>;
}

/** 先写临时文件再替换；失败时尽力删除临时文件，不触碰已存在的有效回执。 */
export async function ktcWriteCodegenApplyReceipt(
  port: KtcCodegenApplyReceiptStorePort,
  workspaceRoot: string,
  preflightCachePath: string,
  receipt: KtcCodegenApplyReceipt,
): Promise<string> {
  const target = join(workspaceRoot, ktcCodegenApplyReceiptRelativePath(preflightCachePath));
  const temporary = `${target}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let temporaryWritten = false;
  try {
    await port.createDirectory(dirname(target));
    await port.writeFile(temporary, ktcSerializeCodegenApplyReceipt(receipt));
    temporaryWritten = true;
    await port.rename(temporary, target);
    temporaryWritten = false;
    return target;
  } finally {
    if (temporaryWritten) {
      try { await port.deleteFile(temporary); } catch { /* 保留原始写入错误。 */ }
    }
  }
}
