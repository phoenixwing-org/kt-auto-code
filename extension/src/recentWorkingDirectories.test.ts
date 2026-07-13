import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KtcRecentWorkingDirectoryStore,
  KtcRecentWorkspaceDirectoryStore,
  type KtcMementoLike,
} from "./recentWorkingDirectories.js";

class TestMemento implements KtcMementoLike {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T;
  }

  update(key: string, value: unknown): PromiseLike<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

describe("recentWorkingDirectories", () => {
  it("把最近使用目录放在最前并去重", async () => {
    const store = new KtcRecentWorkingDirectoryStore(new TestMemento());
    const first = resolve("project-a");
    const second = resolve("project-b");

    await store.remember(first);
    await store.remember(second);
    await store.remember(first);

    expect(store.list()).toEqual([first, second]);
  });

  it("最多保留十二个绝对目录", async () => {
    const store = new KtcRecentWorkingDirectoryStore(new TestMemento());
    for (let index = 0; index < 15; index++) await store.remember(resolve(`project-${index}`));

    expect(store.list()).toHaveLength(12);
    expect(store.list()[0]).toBe(resolve("project-14"));
    expect(store.list().at(-1)).toBe(resolve("project-3"));
  });

  it("工作区缓存只保存规范化相对路径", async () => {
    const store = new KtcRecentWorkspaceDirectoryStore(new TestMemento());
    await store.remember("src/feature");
    await store.remember("src/other/../feature");
    await store.remember(resolve("outside"));
    await store.remember("../outside");

    expect(store.list()).toEqual(["src/feature"]);
  });
});
