import { describe, expect, it } from "vitest";
import fixture from "@phoenix-wing/kt-codegen/fixtures/codegen-host-contract-v1.json";
import { ktcCodegenPrimaryUiModel } from "./primaryViewModel.js";

describe("Auto Code → Wing Primary UI adapter", () => {
  it("只把 Host 身份字段映射为共享 id，并声明可选模板输出能力", () => {
    const model = ktcCodegenPrimaryUiModel({
      documents: [{
        uri: "file:///workspace/Demo.json",
        fileName: "Demo.json",
        displayPath: "Demo.json",
        itemCount: 2,
        className: "Demo",
        namePrefix: "D",
        nameMiddle: "emo",
        nameSpace: "demo",
        appendFunction: "",
        open: true,
        active: true,
        dirty: false,
        externalConflict: false,
        externalState: "current",
        diagnosticCount: 0,
      }],
      activeUri: "file:///workspace/Demo.json",
      controls: undefined,
      candidates: [{
        uri: "file:///workspace/Demo.cpp",
        displayPath: "Demo.cpp",
        markerCount: 1,
        encoding: "utf8",
        eol: "lf",
      }],
      reports: [{
        reportId: "11111111-1111-1111-1111-111111111111",
        fileName: "report.json",
        applyKind: "single",
        startedAt: "2026-07-22T00:00:00.000Z",
        health: "success",
        change: "updated",
        itemCount: 1,
        subject: "Demo.json",
      }],
      reportInvalidCount: 0,
      operation: undefined,
      batch: undefined,
      running: false,
    });

    expect(model).toMatchObject({
      kind: "kt.codegen.primary-ui-model",
      schemaVersion: 1,
      activeId: "file:///workspace/Demo.json",
      documents: [{ id: "file:///workspace/Demo.json" }],
      candidates: [{ id: "file:///workspace/Demo.cpp" }],
      reports: [{ id: "11111111-1111-1111-1111-111111111111" }],
    });
    expect((model.capabilities as typeof model.capabilities & {
      outputControlTemplates?: boolean;
    }).outputControlTemplates).toBe(true);
  });

  it("把三库共用的 Wing Host fixture 投影为 Primary 文档摘要", () => {
    const documentId = "fixture://codegen-host-contract-v1.json";
    const fileName = "CodegenHostContractParam.json";
    const className = `${fixture.input.legacyJson.NamePrefix}${fixture.input.legacyJson.NameMiddle}`;
    const model = ktcCodegenPrimaryUiModel({
      documents: [{
        uri: documentId,
        fileName,
        displayPath: fileName,
        itemCount: fixture.input.legacyJson.data.length,
        className,
        namePrefix: fixture.input.legacyJson.NamePrefix,
        nameMiddle: fixture.input.legacyJson.NameMiddle,
        nameSpace: fixture.input.legacyJson.NameSpace,
        appendFunction: fixture.input.legacyJson.AppendFunction,
        open: false,
        active: false,
        dirty: false,
        externalConflict: false,
        externalState: "current",
        diagnosticCount: 0,
      }],
      activeUri: undefined,
      controls: undefined,
      candidates: [],
      reports: [],
      reportInvalidCount: 0,
      operation: "discovery",
      batch: undefined,
      running: false,
    });

    expect(model.documents[0]).toMatchObject({
      id: documentId,
      fileName,
      itemCount: 2,
      className: "KtCourseGuard",
      nameSpace: "Kt",
    });
    expect(model.operation).toBe("discovery");
  });
});
