import { describe, expect, it } from "vitest";
import { ktcResolveToolSurfaceIntent } from "./toolSurfaceState.js";

describe("Tool Surface presentation state", () => {
  it("toggles only for a repeated click on the current open Ribbon tool", () => {
    expect(ktcResolveToolSurfaceIntent({
      requestedToolId: "git",
      activeToolId: "git",
      openToolIds: ["codeRename", "git"],
      source: "ribbon",
      collapsed: false,
    })).toEqual({ kind: "toggle", collapsed: true });
    expect(ktcResolveToolSurfaceIntent({
      requestedToolId: "git",
      activeToolId: "git",
      openToolIds: ["git"],
      source: "ribbon",
      collapsed: true,
    })).toEqual({ kind: "toggle", collapsed: false });
  });

  it("reveals the Surface for a different tool or menu activation", () => {
    expect(ktcResolveToolSurfaceIntent({
      requestedToolId: "codeRename",
      activeToolId: "git",
      openToolIds: ["git"],
      source: "ribbon",
      collapsed: true,
    })).toEqual({ kind: "activate", collapsed: false });
    expect(ktcResolveToolSurfaceIntent({
      requestedToolId: "git",
      activeToolId: "git",
      openToolIds: ["git"],
      source: "menu",
      collapsed: true,
    })).toEqual({ kind: "activate", collapsed: false });
  });

  it("does not treat a stale active id without an open logical tool as a repeat", () => {
    expect(ktcResolveToolSurfaceIntent({
      requestedToolId: "git",
      activeToolId: "git",
      openToolIds: [],
      source: "ribbon",
      collapsed: true,
    })).toEqual({ kind: "activate", collapsed: false });
  });
});
