export interface KtcCodegenOperationTimer {
  /** 返回自创建计时器以来的非负整数毫秒，便于日志和测试使用同一口径。 */
  elapsedMilliseconds(): number;
  /** 返回适合用户日志的一段短耗时文本。 */
  elapsedText(): string;
}

export function ktcFormatCodegenDuration(milliseconds: number): string {
  const duration = Number.isFinite(milliseconds)
    ? Math.max(0, Math.round(milliseconds))
    : 0;
  if (duration < 1_000) return `${duration} ms`;
  if (duration < 10_000) return `${(duration / 1_000).toFixed(2)} s`;
  return `${(duration / 1_000).toFixed(1)} s`;
}

/**
 * 从用户动作进入 Host 时开始计时。时钟可注入，避免测试依赖真实等待。
 */
export function ktcStartCodegenOperationTimer(
  now: () => number = Date.now,
): KtcCodegenOperationTimer {
  const startedAt = now();
  const elapsedMilliseconds = (): number => {
    const current = now();
    if (!Number.isFinite(startedAt) || !Number.isFinite(current)) return 0;
    return Math.max(0, Math.round(current - startedAt));
  };
  return {
    elapsedMilliseconds,
    elapsedText: () => ktcFormatCodegenDuration(elapsedMilliseconds()),
  };
}
