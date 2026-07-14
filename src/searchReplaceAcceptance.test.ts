import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KTC_CAA_RELATION_KINDS,
  ktcMergeAssociatedReplacementRules,
  ktcSuggestAssociatedReplacementRules,
} from "./associatedReplacementRules.js";
import { detectFileEncoding } from "./fileEncoding.js";
import {
  ktcLoadWorkspaceSearchReplaceProfiles,
  ktcWriteWorkspaceSearchReplaceProfiles,
} from "./searchReplaceProfileRepository.js";
import {
  ktcCreateSearchReplaceProfile,
  ktcEmptySearchReplaceProfileDocument,
  ktcUpsertSearchReplaceProfile,
} from "./searchReplaceProfiles.js";
import { runWorkspaceRename } from "./workspaceRename.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("search replace write acceptance", () => {
  it("从工作区档案加载规则后按文本、文件和目录顺序写盘且保持编码", () => {
    const container = mkdtempSync(join(tmpdir(), "ktc-write-acceptance-"));
    tempDirectories.push(container);
    const root = join(container, "KTCAutoCodeWorkspace");
    mkdirSync(join(root, "src", "KTCAutoCodeModule"), { recursive: true });
    mkdirSync(join(root, "legacy"), { recursive: true });

    const bomSource = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("KTCAutoCode KTCIAutoCode\r\n", "utf8"),
    ]);
    writeFileSync(join(root, "src", "KTCAutoCodeModule", "KTCAutoCode.cpp"), bomSource);
    const gbkSource = Buffer.concat([
      Buffer.from([0xb2, 0xe2, 0xca, 0xd4]),
      Buffer.from(" KTCEAutoCode AutoCode\r\n", "ascii"),
    ]);
    writeFileSync(join(root, "legacy", "KTCEAutoCode.txt"), gbkSource);

    const common = ktcSuggestAssociatedReplacementRules(
      "AutoCode",
      "TomBuild",
      "KTC",
      "KTC",
      "common",
    ).rules;
    const caa = ktcSuggestAssociatedReplacementRules(
      "AutoCode",
      "TomBuild",
      "KTC",
      "KTC",
      "caa-tail",
    ).rules;
    const associatedRules = ktcMergeAssociatedReplacementRules(
      caa,
      ktcMergeAssociatedReplacementRules(common, [], ["spaced", "prefix"]),
      KTC_CAA_RELATION_KINDS,
    );
    const profile = ktcCreateSearchReplaceProfile({
      search: "AutoCode",
      replace: "TomBuild",
      sourcePrefix: "KTC",
      targetPrefix: "KTC",
      associatedRules,
      options: {
        preserveCase: true,
        text: true,
        file: true,
        dir: true,
        includeIgnored: false,
        scope: "",
      },
    }, {
      id: "write-acceptance",
      label: "Write acceptance",
      updatedAt: "2026-07-11T12:00:00.000Z",
    });
    ktcWriteWorkspaceSearchReplaceProfiles(
      root,
      ktcUpsertSearchReplaceProfile(ktcEmptySearchReplaceProfileDocument(), profile),
    );

    const loaded = ktcLoadWorkspaceSearchReplaceProfiles(root).document.profiles[0]!;
    const options = {
      root,
      rules: [
        { id: "primary", search: loaded.search, replace: loaded.replace, enabled: true },
        ...loaded.associatedRules,
      ],
      preserveCase: loaded.options.preserveCase,
      levels: ["dir", "file", "text"] as const,
      includeIgnored: loaded.options.includeIgnored,
    };
    const preview = runWorkspaceRename(options);
    expect(preview.applied).toBe(false);
    expect(preview.summary).toMatchObject({
      directories: 1,
      files: 2,
      textFiles: 2,
      errors: 0,
    });
    expect(readdirSync(root).sort()).toEqual([".phoenix", "legacy", "src"]);

    const applied = runWorkspaceRename({ ...options, apply: true });
    expect(applied.summary).toEqual(preview.summary);
    expect(applied.summary).toMatchObject({ directories: 1, files: 2, textFiles: 2 });
    expect(basename(root)).toBe("KTCAutoCodeWorkspace");

    const bomTarget = join(root, "src", "KTCTomBuildModule", "KTCTomBuild.cpp");
    const bomOutput = readFileSync(bomTarget);
    expect(detectFileEncoding(bomOutput).detected).toBe("utf8-bom");
    expect(bomOutput).toEqual(Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("KTCTomBuild KTCIAutoBuild\r\n", "utf8"),
    ]));

    const gbkTarget = join(root, "legacy", "KTCEAutoBuild.txt");
    const gbkOutput = readFileSync(gbkTarget);
    expect(detectFileEncoding(gbkOutput).detected).toBe("gbk");
    expect(gbkOutput).toEqual(Buffer.concat([
      Buffer.from([0xb2, 0xe2, 0xca, 0xd4]),
      Buffer.from(" KTCEAutoBuild TomBuild\r\n", "ascii"),
    ]));
    expect(ktcLoadWorkspaceSearchReplaceProfiles(root).document.profiles[0]?.search)
      .toBe("AutoCode");
  });
});
