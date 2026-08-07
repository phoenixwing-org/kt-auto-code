import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface ExtensionManifest {
  icon?: string;
  scripts?: Record<string, string>;
  extensionDependencies?: string[];
  activationEvents?: string[];
  engines: { vscode: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  ktAutoCodeModule?: {
    id: string;
    title?: string;
    order?: number;
    commandPrefix?: string;
    tools: Array<{ id: string; command: string; description: string; requirement: string }>;
  };
  contributes: {
    viewsContainers?: unknown;
    views?: Record<string, Array<{ id: string; when?: string }>>;
    commands: Array<{ command: string; title?: string }>;
    menus?: Record<string, Array<{ command: string; when?: string; group?: string; toggled?: string }>>;
  };
}

function readManifest(relativePath: string): ExtensionManifest {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as ExtensionManifest;
}

describe("KT Auto CAD extension manifest", () => {
  it("depends on KT Auto Code and contributes to its existing container", () => {
    const cad = readManifest("../extensions/kt-auto-cad/package.json");
    expect(cad.extensionDependencies).toEqual(["kuntai.kt-auto-code"]);
    expect(cad.icon).toBe("media/cn.kt.doc.AutoCode.Color.128.png");
    expect(cad.scripts?.package).toContain("../../extension/kt-auto-cad-${npm_package_version}.vsix");
    expect(cad.activationEvents).not.toContain("onStartupFinished");
    expect(cad.activationEvents).toEqual(expect.arrayContaining([
      "onCommand:ktAutoCad.open",
      "onCommand:ktAutoCad.module.show",
      "onCommand:ktAutoCad.module.hide",
      "onCommand:ktAutoCad.readFcstdLight",
      "onCommand:ktAutoCad.readFcstd",
      "onCommand:ktAutoCad.scanWorkspace",
      "onCommand:ktAutoCad.searchWorkspaceIndex",
      "onCommand:ktAutoCad.diagnostics",
      "onCommand:ktAutoCad.selectDeskToolsProvider",
    ]));
    expect(cad.contributes.viewsContainers).toBeUndefined();
    expect(cad.contributes.views).toBeUndefined();
    expect(cad.ktAutoCodeModule?.id).toBe("cad");
    expect(cad.ktAutoCodeModule).toMatchObject({
      title: "CAD",
      order: 20,
      commandPrefix: "ktAutoCad.",
    });
    expect(cad.ktAutoCodeModule?.tools.map((tool) => tool.requirement)).toEqual([
      "none",
      "none",
      "optional-desk-provider",
      "workspace-database",
      "none",
    ]);
    expect(cad.ktAutoCodeModule?.tools.some((tool) => tool.id === "cadProvider")).toBe(false);
    expect(cad.ktAutoCodeModule?.tools.every((tool) => tool.command.startsWith("ktAutoCad.block."))).toBe(true);
    expect(cad.ktAutoCodeModule?.tools.find((tool) => tool.id === "cadQuery")?.description)
      .toMatch(/基础 BOM.*无需 Desk Tools/);

    const code = readManifest("../extension/package.json");
    const codeTitleCommands = code.contributes.menus?.["view/title"] ?? [];
    const cadTitleCommands = cad.contributes.menus?.["view/title"] ?? [];
    expect(codeTitleCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        command: "ktAutoCode.module.code.show",
        group: "navigation@1",
        when: expect.stringContaining("!ktAutoCode.module.code.visible"),
      }),
      expect.objectContaining({
        command: "ktAutoCode.module.code.hide",
        group: "navigation@1",
        when: expect.stringContaining("ktAutoCode.module.code.visible"),
      }),
      expect.objectContaining({
        command: "ktAutoCode.searchReplace.preview",
        group: "navigation@20",
      }),
    ]));
    expect(cadTitleCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        command: "ktAutoCad.module.show",
        group: "navigation@2",
        when: expect.stringContaining("!ktAutoCode.module.cad.visible"),
      }),
      expect.objectContaining({
        command: "ktAutoCad.module.hide",
        group: "navigation@2",
        when: expect.stringContaining("ktAutoCode.module.cad.visible"),
      }),
    ]));
    expect(code.contributes.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "ktAutoCode.module.code.show", title: "☐ Code" }),
      expect.objectContaining({ command: "ktAutoCode.module.code.hide", title: "☑ Code" }),
    ]));
    expect(cad.contributes.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "ktAutoCad.module.show", title: "☐ CAD" }),
      expect.objectContaining({ command: "ktAutoCad.module.hide", title: "☑ CAD" }),
    ]));
  });

  it("keeps product-owned IDs separate and leaves the Activity Bar to the base extension", () => {
    const cad = readManifest("../extensions/kt-auto-cad/package.json");
    const code = readManifest("../extension/package.json");
    expect(cad.contributes.commands.every(({ command }) => command.startsWith("ktAutoCad."))).toBe(true);
    expect(code.contributes.viewsContainers).toBeDefined();
    expect(cad.engines.vscode).toBe("^1.85.0");
    expect(code.engines.vscode).toBe(cad.engines.vscode);
    expect(cad.devDependencies?.["@types/vscode"]).toBe("1.85.0");
    expect(cad.devDependencies?.["@phoenix-wing/cad-core"]).toBe("0.6.2");
    expect(cad.devDependencies?.["@phoenix-wing/cad-contracts"]).toBe("0.6.2");
    expect(cad.devDependencies?.["@phoenix-wing/workspace-schema"]).toBe("0.6.2");
    expect(cad.devDependencies?.["@phoenix-wing/cad-rust-source"]).toBeUndefined();
    expect(cad.devDependencies?.["@phoenix-wing/db-node"]).toBeUndefined();
    expect(code.devDependencies?.["@types/vscode"]).toBe("1.85.0");
    expect(code.dependencies?.["@phoenix-wing/code-core"]).toBe("0.6.2");
    expect(code.dependencies?.["@phoenix-wing/git-core"]).toBe("0.6.2");
    expect(code.dependencies?.["@phoenix-wing/git-node"]).toBe("0.6.2");
    expect(code.dependencies?.["@phoenix-wing/kt-codegen"]).toBe("0.6.2");
    expect(code.dependencies?.["@phoenix-wing/run-core"]).toBe("0.6.2");
    expect(code.dependencies?.["@phoenix-wing/run-node"]).toBe("0.6.2");
    expect(code.dependencies?.["phoenix-wing"]).toBeUndefined();
  });
});
