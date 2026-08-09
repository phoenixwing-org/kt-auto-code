/** 同一资源事件串行、不同资源并行的轻量队列。 */
export class KtcCodegenFileEventQueue {
  private readonly tails = new Map<string, Promise<void>>();

  get pendingResourceCount(): number {
    return this.tails.size;
  }

  enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.tails.set(key, current);
    const cleanup = () => {
      if (this.tails.get(key) === current) this.tails.delete(key);
    };
    void current.then(cleanup, cleanup);
    return current;
  }
}
