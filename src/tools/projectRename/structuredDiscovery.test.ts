import { describe, expect, it } from "vitest";
import { KtcStructuredNameDiscoveryCollector } from "./structuredDiscovery.js";

describe("project rename structured discovery", () => {
  it("只读发现空格、连接符、点号和 camel/Pascal 写法，并保留命中形态", () => {
    const collector = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue");
    collector.record([
      "Phoenix Open Issue",
      "phoenix-open-issue",
      "phoenix_open_issue",
      "PHOENIX.OPEN.ISSUE",
      "phoenixOpenIssue",
      "MyPhoenixOpenIssueHandler",
    ].join("\n"), "README.md");

    const snapshot = collector.snapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.occurrences).toBe(6);
    expect(snapshot.matchedItems).toBe(1);
    expect(snapshot.candidates.map(({ sourceText, targetText }) => [sourceText, targetText])).toEqual(expect.arrayContaining([
      ["Phoenix Open Issue", "Phoenix Issue"],
      ["phoenix-open-issue", "phoenix-issue"],
      ["phoenix_open_issue", "phoenix_issue"],
      ["PHOENIX.OPEN.ISSUE", "PHOENIX.ISSUE"],
      ["phoenixOpenIssue", "phoenixIssue"],
    ]));
  });

  it("同词段数量下逐词改名，并覆盖 Web 通用前缀的大小写形态", () => {
    const collector = new KtcStructuredNameDiscoveryCollector("Pnx Auto Code", "Phx Tom Create");
    collector.record("PnxAutoCode pnx-auto-code PNX_AUTO_CODE", "src/names.ts");

    expect(collector.snapshot().candidates.map(({ sourceText, targetText }) => [sourceText, targetText])).toEqual([
      ["PNX_AUTO_CODE", "PHX_TOM_CREATE"],
      ["pnx-auto-code", "phx-tom-create"],
      ["PnxAutoCode", "PhxTomCreate"],
    ]);
  });

  it("不跨路径、标点或换行拼接词段，也不把短契约默认为完整项目名", () => {
    const collector = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue");
    collector.record("phoenix/open/issue phoenix::open::issue phoenix\nopen\nissue open-issue", "contracts.txt");

    expect(collector.snapshot()).toMatchObject({
      status: "ready",
      occurrences: 0,
      candidates: [],
    });
  });

  it("只接受连续空白或单个受控标点，不接受重复和混合连接符", () => {
    const collector = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue");
    collector.record([
      "phoenix\topen\tissue",
      "phoenix\u00a0open\u00a0issue",
      "phoenix--open--issue",
      "phoenix-._open-._issue",
      "phoenix _ open _ issue",
    ].join(" "), "separators.txt");

    expect(collector.snapshot().candidates.map(({ sourceText, targetText }) => [sourceText, targetText])).toEqual([
      ["phoenix\topen\tissue", "phoenix\tissue"],
      ["phoenix\u00a0open\u00a0issue", "phoenix\u00a0issue"],
    ]);
  });

  it("从候选中排除已由显式精确规则覆盖的写法", () => {
    const excluded = new Set(["phoenix-open-issue\u0000phoenix-issue"]);
    const collector = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue", excluded);
    collector.record("phoenix-open-issue phoenix.Open-Issue", "README.md");

    expect(collector.snapshot().candidates.map(({ sourceText }) => sourceText)).toEqual(["phoenix.Open-Issue"]);
  });

  it("不猜测新增词段或无法对齐的删词改名", () => {
    expect(new KtcStructuredNameDiscoveryCollector("Phoenix Issue", "Phoenix Open Issue").snapshot())
      .toMatchObject({ status: "unsupported", occurrences: 0 });
    expect(new KtcStructuredNameDiscoveryCollector("Alpha Beta Gamma", "Nova Ticket").snapshot())
      .toMatchObject({ status: "unsupported", occurrences: 0 });
  });

  it.each([
    ["源名称重音字符", "Café Open Issue", "Café Issue"],
    ["源名称非 ASCII 大写", "ÜBER Open Issue", "ÜBER Issue"],
    ["源名称表意字符", "凤凰 Open Issue", "凤凰 Issue"],
    ["目标名称重音字符", "Phoenix Open Issue", "Phoenix Café"],
    ["未受控标点", "Phoenix C++ Issue", "Phoenix Issue"],
  ])("明确拒绝无法无损分词的%s", (_label, sourceName, targetName) => {
    const collector = new KtcStructuredNameDiscoveryCollector(sourceName, targetName);
    collector.record("CafOpenIssue BEROpenIssue PhoenixIssue", "src/false-positive.ts");

    expect(collector.snapshot()).toMatchObject({
      status: "unsupported",
      scannedItems: 0,
      occurrences: 0,
      candidates: [],
    });
    expect(collector.unsupportedReason).toMatch(/无法无损分词/u);
  });

  it("不把 Unicode 大小写等价字符冒充 ASCII 词段", () => {
    const collector = new KtcStructuredNameDiscoveryCollector("K Auto Code", "X Tom Create");
    collector.record("KAutoCode KAutoCode", "src/unicode-case-fold.ts");

    expect(collector.snapshot().candidates.map(({ sourceText, targetText }) => [sourceText, targetText])).toEqual([
      ["KAutoCode", "XTomCreate"],
    ]);
  });

  it("只在第 201 个单项命中确实存在时标记截断", () => {
    const exact = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue");
    exact.record(Array.from({ length: 200 }, () => "phoenix-open-issue").join(" "), "exact.txt");
    exact.record("PhoenixOpenIssue", "next.ts");
    expect(exact.snapshot()).toMatchObject({
      status: "ready",
      scannedItems: 2,
      matchedItems: 2,
      occurrences: 201,
      truncated: false,
    });

    const overflow = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue");
    overflow.record(Array.from({ length: 201 }, () => "phoenix-open-issue").join(" "), "overflow.txt");
    overflow.record("PhoenixOpenIssue", "not-scanned.ts");
    expect(overflow.snapshot()).toMatchObject({
      status: "ready",
      scannedItems: 1,
      matchedItems: 1,
      occurrences: 200,
      truncated: true,
    });
  });

  it("使用与系统 locale 无关的固定顺序生成候选 ID 和示例", () => {
    const ordered = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue");
    ordered.record("Phoenix.Open.Issue Phoenix-Open-Issue", "order.ts");

    const snapshot = ordered.snapshot();
    expect(snapshot.candidates.map(({ id, sourceText }) => [id, sourceText])).toEqual([
      ["structured-1", "Phoenix-Open-Issue"],
      ["structured-2", "Phoenix.Open.Issue"],
    ]);

    const examples = new KtcStructuredNameDiscoveryCollector("Phoenix Open Issue", "Phoenix Issue");
    examples.record("Phoenix-Open-Issue", "z-last.ts");
    examples.record("Phoenix-Open-Issue", "A-first.ts");
    expect(examples.snapshot().candidates[0]?.examples).toEqual(["A-first.ts", "z-last.ts"]);
  });
});
