import { describe, expect, it } from "vitest";
import type {
  PreviewToolDescriptor,
  PreviewToolSurfaces,
} from "../../ui-preview/src/previewToolCatalog.js";
import { resolvePreviewToolRoute } from "../../ui-preview/src/previewToolRouting.js";

describe("Primary UI preview Tool Surface routing", () => {
  it("将 Primary-only Tool 路由到完整 Primary Surface", () => {
    expect(resolvePreviewToolRoute(descriptor(
      "ignoreSettings",
      { primary: { kind: "full" } },
    ))).toEqual({
      primaryKind: "full",
      rightPanelId: null,
      openItemKind: "primary",
    });
  });

  it("允许完整 Primary 同时声明由消费者使用的 Right panel", () => {
    expect(resolvePreviewToolRoute(descriptor(
      "fullWithDetails",
      {
        primary: { kind: "full" },
        right: { panelId: "details-panel" },
      },
    ))).toEqual({
      primaryKind: "full",
      rightPanelId: "details-panel",
      openItemKind: "right",
    });
  });

  it("将双 Surface Tool 路由到 Primary companion 与声明的 Right panel", () => {
    const route = resolvePreviewToolRoute(descriptor(
      "autoBuild",
      {
        primary: { kind: "companion" },
        right: { panelId: "build-dashboard" },
      },
    ));

    expect(route).toEqual({
      primaryKind: "companion",
      rightPanelId: "build-dashboard",
      openItemKind: "right",
    });
    expect(route.rightPanelId).not.toBe("autoBuild");
    expect(Object.isFrozen(route)).toBe(true);
  });
});

function descriptor(
  toolId: string,
  surfaces: PreviewToolSurfaces,
): PreviewToolDescriptor {
  return {
    toolId,
    title: toolId,
    shortTitle: toolId,
    description: `${toolId} preview`,
    icon: "tool",
    groupId: "sample",
    instancePolicy: { kind: "single" },
    surfaces,
  };
}
