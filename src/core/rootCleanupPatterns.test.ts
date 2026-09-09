import { describe, expect, it } from "vitest";
import {
  KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
  ktcParseRootCleanupConfigurationYaml,
  ktcParseRootCleanupPatternsYaml,
  ktcRootCleanupFilenameMatches,
} from "./rootCleanupPatterns.js";

describe("Root cleanup YAML", () => {
  it("parses the approved structured defaults", () => {
    const rules = ktcParseRootCleanupConfigurationYaml(KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML);
    expect(rules).toEqual({
      unlinkDirectories: [],
      directories: ["objects", "build"],
      files: ["*.obj", "*.exp", "*.pdb", "test_*.exe"],
    });
    expect(ktcRootCleanupFilenameMatches("anything.OBJ", rules.files)).toBe(true);
    expect(ktcRootCleanupFilenameMatches("test_demo.exe", rules.files)).toBe(true);
    expect(ktcRootCleanupFilenameMatches("other.lib", rules.files)).toBe(false);
    expect(Object.isFrozen(rules)).toBe(true);
    expect(Object.isFrozen(rules.files)).toBe(true);
  });

  it("supports all three lists, comments, quoted scalars and case-insensitive de-duplication", () => {
    expect(ktcParseRootCleanupConfigurationYaml([
      "# direct children only",
      "unlinkDirectories:",
      "  - 'Demo*'",
      "delete:",
      "  directories:",
      "    - objects",
      "    - OBJECTS",
      "  files:",
      "    - '*.obj' # object output",
      "    - \"test_*.exe\"",
    ].join("\n"))).toEqual({
      unlinkDirectories: ["Demo*"],
      directories: ["objects"],
      files: ["*.obj", "test_*.exe"],
    });
  });

  it("keeps a legacy flat list as direct-child file rules", () => {
    expect(ktcParseRootCleanupPatternsYaml("# names\n- 'Kt*'\n- kt*\n- \"*.obj\"")).toEqual(["Kt*", "*.obj"]);
    expect(ktcParseRootCleanupConfigurationYaml("PNX*")).toEqual({
      unlinkDirectories: [],
      directories: [],
      files: ["PNX*"],
    });
  });

  it.each([
    "- *",
    "- **/*.obj",
    "- ../Kt*",
    "- path/Kt*",
    "- path\\Kt*",
    "- Kt*\nnot-a-list",
    "delete:\n  directories:\n    - bu*ld",
    "delete:\n  files:\n  - '*.obj'",
    "unknown:\n  - item",
  ])("rejects unsafe or malformed rule %s", (source) => {
    expect(() => ktcParseRootCleanupConfigurationYaml(source)).toThrow();
  });
});
