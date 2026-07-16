import { describe, expect, it } from "vitest";
import {
  ktcActivateModule,
  ktcCreateModuleState,
  ktcPersistedModuleState,
  ktcToggleModule,
} from "./moduleState.js";

describe("shared Primary Side Bar module state", () => {
  it("keeps Code as the only visible module before CAD is installed", () => {
    expect(ktcCreateModuleState(["code"])).toMatchObject({
      installed: ["code"],
      visible: ["code"],
      active: "code",
    });
  });

  it("enables a newly installed CAD module once", () => {
    const before = ktcCreateModuleState(["code"]);
    const after = ktcCreateModuleState(["code", "cad"], ktcPersistedModuleState(before));
    expect(after.visible).toEqual(["code", "cad"]);
  });

  it("respects an explicit CAD-off preference after CAD was already known", () => {
    const state = ktcCreateModuleState(["code", "cad"], {
      known: ["code", "cad"],
      enabled: ["code"],
      active: "code",
    });
    expect(state.visible).toEqual(["code"]);
  });

  it("does not enable CAD again after the user hid it and later reinstalled it", () => {
    const firstInstall = ktcCreateModuleState(["code", "cad"], {
      known: ["code"],
      enabled: ["code"],
      active: "code",
    });
    const cadHidden = ktcToggleModule(firstInstall, "cad").state;
    const withoutCad = ktcCreateModuleState(["code"], ktcPersistedModuleState(cadHidden));
    const reinstalled = ktcCreateModuleState(["code", "cad"], ktcPersistedModuleState(withoutCad));
    expect(reinstalled.visible).toEqual(["code"]);
  });

  it("temporarily falls back to Code without overwriting a Code-off preference", () => {
    const withoutCad = ktcCreateModuleState(["code"], {
      known: ["code", "cad"],
      enabled: ["cad"],
      active: "cad",
    });
    expect(withoutCad).toMatchObject({ enabled: ["cad"], visible: ["code"], active: "code" });

    const reinstalled = ktcCreateModuleState(["code", "cad"], ktcPersistedModuleState(withoutCad));
    expect(reinstalled).toMatchObject({ enabled: ["cad"], visible: ["cad"], active: "cad" });
  });

  it("does not allow the last visible module to be hidden", () => {
    const state = ktcCreateModuleState(["code"]);
    expect(ktcToggleModule(state, "code")).toMatchObject({ changed: false, reason: "last-visible" });
  });

  it("rejects toggling a module that is not installed", () => {
    const state = ktcCreateModuleState(["code"]);
    expect(ktcToggleModule(state, "cad")).toMatchObject({ changed: false, reason: "unavailable" });
  });

  it("shows both compact module entries but keeps one active detail module", () => {
    const both = ktcCreateModuleState(["code", "cad"]);
    const cadActive = ktcActivateModule(both, "cad");
    expect(cadActive.visible).toEqual(["code", "cad"]);
    expect(cadActive.active).toBe("cad");

    const cadHidden = ktcToggleModule(cadActive, "cad");
    expect(cadHidden.state.visible).toEqual(["code"]);
    expect(cadHidden.state.active).toBe("code");
  });

  it("accepts future module IDs without changing the Shell state implementation", () => {
    const state = ktcCreateModuleState(["code", "cad", "drawing-review"]);
    expect(state.installed).toEqual(["code", "cad", "drawing-review"]);
    expect(state.visible).toEqual(["code", "cad", "drawing-review"]);
    expect(ktcActivateModule(state, "drawing-review").active).toBe("drawing-review");
  });
});
