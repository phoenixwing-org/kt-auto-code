import { describe, expect, it } from "vitest";
import {
  createPreviewStateStore,
  defaultPreviewPersistedState,
  PREVIEW_STATE_SCHEMA_VERSION,
  PREVIEW_STATE_STORAGE_KEY,
  type PreviewStateStorage,
} from "../../ui-preview/src/previewStateStore.js";

class MemoryStorage implements PreviewStateStorage {
  readonly values = new Map<string, string>();
  readonly removed: string[] = [];

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removed.push(key);
    this.values.delete(key);
  }
}

describe("Primary UI preview persisted state", () => {
  it("损坏 JSON 安全回退到默认状态", () => {
    const storage = new MemoryStorage();
    storage.values.set(PREVIEW_STATE_STORAGE_KEY, "{ definitely-not-json");

    const store = createPreviewStateStore({ storage });

    expect(store.load()).toEqual(defaultPreviewPersistedState());
  });

  it("拒绝旧 schema，避免用新代码猜测旧数据", () => {
    const storage = new MemoryStorage();
    storage.values.set(PREVIEW_STATE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 0,
      state: { theme: "light", directoryIndex: 2 },
    }));

    const store = createPreviewStateStore({ storage });

    expect(store.load()).toEqual(defaultPreviewPersistedState());
  });

  it("兼容原型早期的 Right-only 状态为 Primary 隐藏", () => {
    const storage = new MemoryStorage();
    storage.values.set(PREVIEW_STATE_STORAGE_KEY, JSON.stringify({
      schemaVersion: PREVIEW_STATE_SCHEMA_VERSION,
      state: { hostMode: "editor" },
    }));

    expect(createPreviewStateStore({ storage }).load().primaryVisible).toBe(false);
  });

  it("恢复合法 UI 状态，并对白名单字段和值做归一", () => {
    const storage = new MemoryStorage();
    storage.values.set(PREVIEW_STATE_STORAGE_KEY, JSON.stringify({
      schemaVersion: PREVIEW_STATE_SCHEMA_VERSION,
      state: {
        theme: "light",
        primaryWidth: "custom",
        customPrimaryWidth: 511.6,
        primaryVisible: false,
        directoryVisible: false,
        directoryIndex: 2,
        ribbonExpanded: false,
        navigatorExpanded: false,
        navigatorShowLabels: false,
        // Removed prototype field is ignored when restoring an early v1 snapshot.
        surfaceExpanded: false,
        outputVisible: false,
        activeGroupId: "replace",
        activeToolId: "projectRename",
        activeNavigatorToolId: "headerAscii",
        activeEditorId: "projectRename",
        activeItemId: "editor:projectRename",
        openToolIds: ["projectRename", "projectRename", "/Users/example/private.txt"],
        mruItemIds: ["editor:projectRename", "editor:packageIncludes", "file:/secret"],
        surfaceMruToolIds: ["projectRename", "packageIncludes", "/Users/example/private.txt"],
        directoryPath: "/Users/example/phoenix/customer-project",
        scanResult: { files: ["secret.cpp"] },
      },
    }));

    const store = createPreviewStateStore({ storage });

    expect(store.load()).toEqual({
      theme: "light",
      primaryWidth: "custom",
      customPrimaryWidth: 512,
      primaryVisible: false,
      directoryVisible: false,
      directoryIndex: 2,
      ribbonExpanded: false,
      navigatorExpanded: false,
      navigatorShowLabels: false,
      activeGroupId: "replace",
      activeToolId: "projectRename",
      activeNavigatorToolId: "",
      activeEditorId: "projectRename",
      activeItemId: "tool:projectRename",
      openToolIds: ["projectRename"],
      mruItemIds: ["tool:projectRename"],
      surfaceMruToolIds: ["projectRename"],
      outputVisible: false,
    });

    store.save({ theme: "hc" });
    const saved = JSON.parse(storage.values.get(PREVIEW_STATE_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    const serialized = JSON.stringify(saved);
    expect(saved).not.toHaveProperty("directoryPath");
    expect(saved).not.toHaveProperty("scanResult");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("secret.cpp");
    expect(saved).toMatchObject({ schemaVersion: 1, state: { theme: "hc" } });
  });

  it("把不一致的打开项、宿主选择和 MRU 修复为同一逻辑工具快照", () => {
    const store = createPreviewStateStore({ storage: new MemoryStorage() });

    const state = store.save({
      openToolIds: ["autoBuild"],
      mruItemIds: [],
      surfaceMruToolIds: [],
      activeItemId: "tool:packageIncludes",
      activeToolId: "packageIncludes",
      activeGroupId: "git",
      activeNavigatorToolId: "packageIncludes",
      activeEditorId: null,
    });

    expect(state).toMatchObject({
      openToolIds: ["autoBuild"],
      mruItemIds: ["tool:autoBuild"],
      surfaceMruToolIds: ["autoBuild"],
      activeItemId: "tool:autoBuild",
      activeToolId: "autoBuild",
      activeGroupId: "codeAssistant",
      activeNavigatorToolId: "autoBuild",
      activeEditorId: "autoBuild",
    });
  });

  it("只兼容已知的早期 item 前缀，并忽略已移除的折叠字段", () => {
    const storage = new MemoryStorage();
    storage.values.set(PREVIEW_STATE_STORAGE_KEY, JSON.stringify({
      schemaVersion: PREVIEW_STATE_SCHEMA_VERSION,
      state: {
        openToolIds: ["projectRename", "autoBuild"],
        activeItemId: "anything:projectRename",
        activeToolId: "autoBuild",
        mruItemIds: ["anything:projectRename", "editor:autoBuild"],
        surfaceExpanded: false,
        outputExpanded: false,
      },
    }));

    const store = createPreviewStateStore({ storage });
    const restored = store.load();
    expect(restored.activeItemId).toBe("tool:autoBuild");
    expect(restored.mruItemIds).toEqual(["tool:projectRename", "tool:autoBuild"]);
    expect(restored.outputVisible).toBe(false);
    expect(restored).not.toHaveProperty("surfaceExpanded");

    store.save();
    expect(storage.values.get(PREVIEW_STATE_STORAGE_KEY)).not.toContain("surfaceExpanded");
    expect(storage.values.get(PREVIEW_STATE_STORAGE_KEY)).not.toContain("outputExpanded");
  });

  it("拒绝未来 schema，避免旧代码误读新状态", () => {
    const storage = new MemoryStorage();
    storage.values.set(PREVIEW_STATE_STORAGE_KEY, JSON.stringify({
      schemaVersion: PREVIEW_STATE_SCHEMA_VERSION + 1,
      state: { theme: "light" },
    }));

    expect(createPreviewStateStore({ storage }).load()).toEqual(defaultPreviewPersistedState());
  });

  it("reset 清除持久化值并恢复独立的默认快照", () => {
    const storage = new MemoryStorage();
    const store = createPreviewStateStore({ storage });
    store.save({ theme: "light", openToolIds: ["autoBuild"] });

    const reset = store.reset();

    expect(reset).toEqual(defaultPreviewPersistedState());
    expect(storage.values.has(PREVIEW_STATE_STORAGE_KEY)).toBe(false);
    expect(storage.removed).toEqual([PREVIEW_STATE_STORAGE_KEY]);
    expect(store.state).not.toBe(reset);
  });

  it("存储读写和清除均失败时仍保持可用的内存状态", () => {
    const storage: PreviewStateStorage = {
      getItem() { throw new Error("blocked read"); },
      setItem() { throw new Error("quota exceeded"); },
      removeItem() { throw new Error("blocked remove"); },
    };
    const store = createPreviewStateStore({ storage });

    expect(store.load()).toEqual(defaultPreviewPersistedState());
    expect(store.save({ theme: "light", primaryWidth: "wide" })).toMatchObject({
      theme: "light",
      primaryWidth: "wide",
    });
    expect(store.state.theme).toBe("light");
    expect(store.reset()).toEqual(defaultPreviewPersistedState());
  });
});
