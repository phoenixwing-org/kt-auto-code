import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

export const CODEGEN_QA_BASELINE_RELATIVE = ".phoenix/codegen-qa-baseline.json";
export const CODEGEN_QA_REPORT_RELATIVE = ".phoenix/codegen-qa-report.json";
export const CODEGEN_APPLY_RECEIPT_RELATIVE = ".phoenix/cache/codegen/apply-receipt-v1";
export const CODEGEN_QA_REQUIRED_CHECKPOINTS = Object.freeze(["A", "B", "C", "D", "E", "F"]);
const SOURCE_EXTENSIONS = new Set([".h", ".hpp", ".hh", ".hxx", ".c", ".cc", ".cpp", ".cxx"]);
const SKIPPED_DIRECTORIES = new Set([".git", ".phoenix", "node_modules", "dist", "build", "out", "target"]);
const MARKER_TEXT = Buffer.from("KEVIN CAA WIZARD SECTION", "utf8");
const EDITABLE_JSON_PATHS = Object.freeze([
  "PNXWidgetParam.json",
  "config/EmptyParam.json",
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function listSourceFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...listSourceFiles(root, join(current, entry.name)));
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(relative(root, join(current, entry.name)).replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

function pathInside(root, relativePath) {
  const target = resolve(root, relativePath);
  const path = relative(root, target);
  if (path.startsWith("..") || isAbsolute(path)) throw new Error(`验收基线路径越出工作区：${relativePath}`);
  return target;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function applyReceiptErrors(root, baseline, receipt) {
  const errors = [];
  if (receipt?.kind !== "kt.codegen.apply-receipt" || receipt?.schemaVersion !== 1) {
    return ["kind/schemaVersion 无效"];
  }
  if (!Array.isArray(receipt.files) || receipt.files.length === 0 || receipt.fileCount !== receipt.files.length) {
    errors.push("files/fileCount 无效");
  }
  const regions = Array.isArray(receipt.files)
    ? receipt.files.reduce((total, file) => total + (Array.isArray(file?.regions) ? file.regions.length : 0), 0)
    : 0;
  if (!Number.isInteger(receipt.regionCount) || receipt.regionCount <= 0 || receipt.regionCount !== regions) {
    errors.push("regionCount 与区域明细不一致");
  }
  try {
    const document = pathInside(root, receipt.documentPath);
    const config = existsSync(document) ? readJson(document) : undefined;
    if (String(config?.type ?? "") !== "100106") errors.push("documentPath 不是有效 Codegen JSON");
    const preflight = pathInside(root, receipt.preflightCachePath);
    if (!existsSync(preflight) || readJson(preflight)?.kind !== "kt.codegen.preflight-cache") {
      errors.push("preflightCachePath 不指向有效缓存");
    }
  } catch {
    errors.push("JSON 或 Preflight Cache 路径越界/无效");
  }
  const baselineByPath = new Map(baseline.protectedSources.map((source) => [source.path, source]));
  const paths = new Set();
  for (const file of Array.isArray(receipt.files) ? receipt.files : []) {
    if (!file || typeof file.path !== "string" || paths.has(file.path)) {
      errors.push("源码路径为空或重复");
      continue;
    }
    paths.add(file.path);
    const source = baselineByPath.get(file.path);
    if (!source) errors.push(`${file.path} 不属于验收基线控制符源码`);
    if (file.beforeFingerprint !== source?.fingerprint) errors.push(`${file.path} 的 Apply 前指纹与基线不符`);
    if (typeof file.afterFingerprint !== "string" || file.afterFingerprint === file.beforeFingerprint) {
      errors.push(`${file.path} 的 Apply 后指纹无效`);
    }
    if (!Array.isArray(file.regions) || file.regionCount !== file.regions.length || file.regionCount <= 0) {
      errors.push(`${file.path} 的区域数量无效`);
    } else if (file.regions.some((region) => (
      !region?.id || !region?.artifactId || !region?.blockKey || !Number.isInteger(region?.line) || region.line < 0
    ))) {
      errors.push(`${file.path} 的区域身份不完整`);
    }
    try {
      const target = pathInside(root, file.path);
      if (!existsSync(target)) errors.push(`${file.path} 已缺失`);
      else if (sha256(readFileSync(target)) !== file.afterFingerprint) {
        errors.push(`${file.path} 当前字节与 Apply 回执不符`);
      }
    } catch {
      errors.push(`${file.path} 路径越出工作区`);
    }
  }
  return errors;
}

export function writeCodegenFixtureBaseline(workspacePath) {
  const root = resolve(workspacePath);
  const sourceFiles = listSourceFiles(root);
  const protectedSources = sourceFiles.flatMap((path) => {
    const bytes = readFileSync(pathInside(root, path));
    return bytes.includes(MARKER_TEXT) ? [{ path, fingerprint: sha256(bytes) }] : [];
  });
  const editableJson = EDITABLE_JSON_PATHS.map((path) => {
    const filename = pathInside(root, path);
    const raw = readFileSync(filename);
    const value = JSON.parse(raw.toString("utf8"));
    return {
      path,
      fingerprint: sha256(raw),
      rootKeys: Object.keys(value),
      headers: Array.isArray(value?.headers) ? value.headers.map(String) : [],
    };
  });
  const baseline = {
    kind: "kt.codegen.qa-baseline",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceFileCount: sourceFiles.length,
    protectedSources,
    editableJson,
  };
  const manifestPath = pathInside(root, CODEGEN_QA_BASELINE_RELATIVE);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return baseline;
}

export function writeCodegenFixtureQaReport(workspacePath, extensionVersion = "unknown") {
  const root = resolve(workspacePath);
  const reportPath = pathInside(root, CODEGEN_QA_REPORT_RELATIVE);
  if (existsSync(reportPath)) return readJson(reportPath);
  const report = {
    kind: "kt.codegen.manual-qa-report",
    schemaVersion: 1,
    status: "pending",
    workspacePath: root,
    vscodeVersion: "",
    extensionVersion,
    startedAt: new Date().toISOString(),
    completedAt: "",
    themes: { dark: "", light: "", highContrast: "" },
    checkpoints: [
      { id: "A", title: "首次发现、诊断与 CSV", status: "pending", verifierCommand: `pnpm ext:verify:codegen -- ${root} --checkpoint-a`, verifierPassed: null, notes: "" },
      { id: "B", title: "一份 JSON 一个 View", status: "pending", notes: "" },
      { id: "C", title: "整表编辑、Save 与 Revert", status: "pending", verifierCommand: `pnpm ext:verify:codegen -- ${root} --checkpoint-c`, verifierPassed: null, notes: "" },
      { id: "D", title: "外部修改冲突", status: "pending", notes: "" },
      { id: "E", title: "候选、取消、预检、控制符与真实 Apply", status: "pending", verifierCommand: `pnpm ext:verify:codegen -- ${root} --checkpoint-e`, verifierPassed: null, notes: "" },
      { id: "F", title: "主题与窄窗口", status: "pending", notes: "" },
      { id: "G", title: "多根工作区（可选）", status: "skipped", notes: "" },
    ],
    diagnosticsCopied: false,
    sourceSafetyPassed: null,
    lastAutomatedVerificationAt: "",
    lastManualUpdateAt: "",
    issues: [],
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function readCodegenFixtureQaReport(workspacePath) {
  const root = resolve(workspacePath);
  const reportPath = pathInside(root, CODEGEN_QA_REPORT_RELATIVE);
  if (!existsSync(reportPath)) throw new Error(`缺少手工验收报告：${reportPath}`);
  const report = readJson(reportPath);
  if (
    report?.kind !== "kt.codegen.manual-qa-report"
    || report.schemaVersion !== 1
    || !Array.isArray(report.checkpoints)
  ) throw new Error(`手工验收报告格式无效：${reportPath}`);
  return report;
}

function refreshCodegenQaOverallStatus(report, now = new Date().toISOString()) {
  const required = CODEGEN_QA_REQUIRED_CHECKPOINTS.map((checkpointId) => (
    report.checkpoints.find((item) => item.id === checkpointId)
  ));
  const satisfied = (item) => item?.status === "passed"
    && (!item.verifierCommand || item.verifierPassed === true);
  const allPassed = required.every(satisfied);
  const anyFailed = required.some((item) => item?.status === "failed"
    || (item?.verifierCommand && item.verifierPassed === false));
  report.status = allPassed ? "passed" : anyFailed ? "failed" : "pending";
  report.completedAt = allPassed ? report.completedAt || now : "";
}

/**
 * 记录一次真正由用户确认的界面 checkpoint。A/C/E 必须先有对应机器验证，
 * A 必须确认复制过运行诊断，F 必须记录实际观察的深/浅主题。
 */
export function recordCodegenManualCheckpoint(workspacePath, update) {
  const root = resolve(workspacePath);
  const reportPath = pathInside(root, CODEGEN_QA_REPORT_RELATIVE);
  const report = readCodegenFixtureQaReport(root);
  const id = String(update?.id ?? "").toUpperCase();
  const status = String(update?.status ?? "");
  const checkpoint = report.checkpoints.find((item) => item.id === id);
  if (!checkpoint) throw new Error(`未知 Checkpoint：${id || "（空）"}`);
  if (!["pending", "passed", "failed", "skipped"].includes(status)) {
    throw new Error(`Checkpoint 状态无效：${status || "（空）"}`);
  }
  if (status === "skipped" && CODEGEN_QA_REQUIRED_CHECKPOINTS.includes(id)) {
    throw new Error(`Checkpoint ${id} 是必测项，不能标记为 skipped`);
  }

  if (typeof update.vscodeVersion === "string") report.vscodeVersion = update.vscodeVersion.trim();
  if (typeof update.diagnosticsCopied === "boolean") report.diagnosticsCopied = update.diagnosticsCopied;
  if (update.themes && typeof update.themes === "object") {
    for (const key of ["dark", "light", "highContrast"]) {
      if (typeof update.themes[key] === "string") report.themes[key] = update.themes[key].trim();
    }
  }

  if (status === "passed" && checkpoint.verifierCommand && checkpoint.verifierPassed !== true) {
    throw new Error(`Checkpoint ${id} 的机器验证尚未通过，请先执行报告中的 verifierCommand`);
  }
  if (status === "passed" && id === "A" && report.diagnosticsCopied !== true) {
    throw new Error("Checkpoint A 通过前必须确认已执行“复制诊断”");
  }
  if (status === "passed" && id === "F" && (!report.themes?.dark || !report.themes?.light)) {
    throw new Error("Checkpoint F 通过前必须记录实际点检的深色和浅色主题名称");
  }

  const now = new Date().toISOString();
  checkpoint.status = status;
  checkpoint.notes = typeof update.notes === "string" ? update.notes : checkpoint.notes ?? "";
  checkpoint.updatedAt = now;
  report.lastManualUpdateAt = now;
  refreshCodegenQaOverallStatus(report, now);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function formatCodegenFixtureQaSummary(report) {
  const required = new Set(CODEGEN_QA_REQUIRED_CHECKPOINTS);
  const satisfied = (item) => item.status === "passed"
    && (!item.verifierCommand || item.verifierPassed === true);
  const passed = report.checkpoints.filter((item) => required.has(item.id) && satisfied(item)).length;
  const icons = { passed: "✅", failed: "❌", skipped: "↷", pending: "⏳" };
  const lines = [
    `Codegen 手工验收：${passed}/${CODEGEN_QA_REQUIRED_CHECKPOINTS.length} 必测项通过 · overall=${report.status}`,
  ];
  for (const checkpoint of report.checkpoints) {
    const verifier = checkpoint.verifierCommand
      ? ` · verifier=${checkpoint.verifierPassed === true ? "passed" : checkpoint.verifierPassed === false ? "failed" : "pending"}`
      : "";
    const icon = checkpoint.status === "passed" && !satisfied(checkpoint)
      ? "⚠️"
      : icons[checkpoint.status] ?? "?";
    lines.push(`${icon} ${checkpoint.id} ${checkpoint.title}${verifier}`);
    if (checkpoint.notes) lines.push(`   ${checkpoint.notes}`);
  }
  const next = report.checkpoints.find((item) => required.has(item.id) && !satisfied(item));
  if (next) lines.push(`下一项：Checkpoint ${next.id} · ${next.title}`);
  else lines.push("A–F 已全部完成，可提交报告进行最终验收。 ");
  return lines.join("\n").trimEnd();
}

/** 只记录机器检查，不把需要人眼/交互确认的 checkpoint status 改为 passed。 */
export function recordCodegenFixtureVerification(workspacePath, verification) {
  const root = resolve(workspacePath);
  const reportPath = pathInside(root, CODEGEN_QA_REPORT_RELATIVE);
  const report = existsSync(reportPath)
    ? readJson(reportPath)
    : writeCodegenFixtureQaReport(root);
  report.lastAutomatedVerificationAt = new Date().toISOString();
  report.sourceSafetyPassed = verification.checks
    .filter((item) => item.id === "source-count" || item.id === "source-safety")
    .every((item) => item.ok);
  const checkpointId = verification.checkpoint === "a" ? "A"
    : verification.checkpoint === "c" ? "C"
      : verification.checkpoint === "e" ? "E"
        : undefined;
  if (checkpointId) {
    const checkpoint = report.checkpoints.find((item) => item.id === checkpointId);
    if (checkpoint) checkpoint.verifierPassed = verification.ok;
  }
  refreshCodegenQaOverallStatus(report, report.lastAutomatedVerificationAt);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function verifyCodegenFixture(workspacePath, checkpoint = "source") {
  const root = resolve(workspacePath);
  const checks = [];
  const check = (id, ok, message) => checks.push({ id, ok, message });
  const manifestPath = pathInside(root, CODEGEN_QA_BASELINE_RELATIVE);
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      checkpoint,
      checks: [{ id: "baseline", ok: false, message: `缺少验收基线：${manifestPath}` }],
    };
  }
  const baseline = readJson(manifestPath);
  const baselineValid = baseline?.kind === "kt.codegen.qa-baseline"
    && baseline.schemaVersion === 1
    && Array.isArray(baseline.protectedSources);
  check("baseline", baselineValid, baselineValid ? "验收基线有效" : "验收基线格式无效");
  if (!baselineValid) return { ok: false, checkpoint, checks };

  const currentSourceCount = listSourceFiles(root).length;
  check(
    "source-count",
    currentSourceCount === baseline.sourceFileCount,
    currentSourceCount === baseline.sourceFileCount
      ? `${currentSourceCount} 份源码文件数量保持不变`
      : `源码文件数量变化：准备时 ${baseline.sourceFileCount}，当前 ${currentSourceCount}`,
  );

  const changedSources = [];
  const missingSources = [];
  for (const source of baseline.protectedSources) {
    const path = pathInside(root, source.path);
    if (!existsSync(path)) {
      missingSources.push(source.path);
      continue;
    }
    if (sha256(readFileSync(path)) !== source.fingerprint) changedSources.push(source.path);
  }
  if (checkpoint === "e") {
    const malformedSources = baseline.protectedSources.flatMap((source) => {
      const path = pathInside(root, source.path);
      if (!existsSync(path)) return [];
      const text = readFileSync(path).toString("latin1");
      const starts = text.split("START KEVIN CAA WIZARD SECTION").length - 1;
      const ends = text.split("END KEVIN CAA WIZARD SECTION").length - 1;
      return starts > 0 && starts === ends ? [] : [source.path];
    });
    check(
      "source-safety",
      missingSources.length === 0 && malformedSources.length === 0 && changedSources.length > 0,
      missingSources.length || malformedSources.length || changedSources.length === 0
        ? `Apply 验证异常：缺失 ${missingSources.join("、") || "无"}；标记不配对 ${malformedSources.join("、") || "无"}；实际改变 ${changedSources.length} 份`
        : `真实 Apply 已修改 ${changedSources.length} 份源码，Start/End 标记仍完整配对`,
    );
  } else {
    check(
      "source-safety",
      missingSources.length === 0 && changedSources.length === 0,
      missingSources.length || changedSources.length
        ? `控制符源码异常：缺失 ${missingSources.join("、") || "无"}；改变 ${changedSources.join("、") || "无"}`
        : `${baseline.protectedSources.length} 份控制符源码字节保持不变`,
    );
  }

  if (checkpoint === "a") {
    const expectedJson = [
      ["PNXWidgetParam.json", "PNX", "Widget"],
      ["config/KtCourseGuardParam.json", "Kt", "CourseGuard"],
      ["config/EmptyParam.json", "PNX", "Empty"],
      ["legacy/PNXConflictParam.json", "PNX", "Conflict"],
      ["legacy/PNXLegacyPanelParam.json", "PNX", "LegacyPanel"],
    ];
    const missingJson = expectedJson.filter(([path]) => !existsSync(pathInside(root, path))).map(([path]) => path);
    const invalidJson = expectedJson.filter(([path, prefix, middle]) => {
      const target = pathInside(root, path);
      if (!existsSync(target)) return false;
      try {
        const value = readJson(target);
        return String(value?.type ?? "") !== "100106"
          || (String(value?.version ?? "") !== "4.0" && !Array.isArray(value?.data))
          || value?.NamePrefix !== prefix
          || value?.NameMiddle !== middle;
      } catch {
        return true;
      }
    }).map(([path]) => path);
    check("json-list", missingJson.length === 0 && invalidJson.length === 0,
      missingJson.length || invalidJson.length
        ? `JSON 异常：缺少 ${missingJson.join("、") || "无"}；无效 ${invalidJson.join("、") || "无"}`
        : "5 份预期 Codegen JSON 均存在且协议有效");
    check(
      "csv-converted",
      !existsSync(pathInside(root, "legacy/PNXLegacyPanelParam.csv"))
        && existsSync(pathInside(root, "legacy/PNXLegacyPanelParam.json")),
      "可转换 CSV 已删除且目标 JSON 存在",
    );
    check(
      "csv-conflict",
      existsSync(pathInside(root, "legacy/PNXConflictParam.csv"))
        && existsSync(pathInside(root, "legacy/PNXConflictParam.json")),
      "冲突 CSV 与 JSON 均保留",
    );
  }

  if (checkpoint === "c") {
    const editableJson = Array.isArray(baseline.editableJson) ? baseline.editableJson : [];
    check(
      "json-layout-baseline",
      editableJson.length === EDITABLE_JSON_PATHS.length,
      editableJson.length === EDITABLE_JSON_PATHS.length
        ? `${editableJson.length} 份可编辑 JSON 布局基线有效`
        : "JSON 布局基线缺失，请重新准备验收工作区",
    );
    const unchanged = [];
    const invalid = [];
    const layoutChanged = [];
    const nonCanonical = [];
    for (const item of editableJson) {
      const filename = pathInside(root, item.path);
      if (!existsSync(filename)) {
        invalid.push(`${item.path}（缺失）`);
        continue;
      }
      const raw = readFileSync(filename);
      let value;
      try {
        value = JSON.parse(raw.toString("utf8"));
      } catch {
        invalid.push(`${item.path}（JSON 无效）`);
        continue;
      }
      if (sha256(raw) === item.fingerprint) unchanged.push(item.path);
      const rootKeys = Object.keys(value);
      const headers = Array.isArray(value?.headers) ? value.headers.map(String) : [];
      if (JSON.stringify(rootKeys) !== JSON.stringify(item.rootKeys)
        || JSON.stringify(headers) !== JSON.stringify(item.headers)) {
        layoutChanged.push(item.path);
      }
      const canonical = `${JSON.stringify(value, null, 4)}\n`;
      if (raw.toString("utf8") !== canonical) nonCanonical.push(item.path);
    }
    check(
      "json-saved",
      invalid.length === 0 && unchanged.length === 0,
      invalid.length || unchanged.length
        ? `保存验证异常：无效 ${invalid.join("、") || "无"}；尚未写盘 ${unchanged.join("、") || "无"}`
        : `${editableJson.length} 份 JSON 均已产生实际写盘变化`,
    );
    check(
      "json-layout",
      invalid.length === 0 && layoutChanged.length === 0 && nonCanonical.length === 0,
      invalid.length || layoutChanged.length || nonCanonical.length
        ? `JSON 布局异常：无效 ${invalid.join("、") || "无"}；顺序变化 ${layoutChanged.join("、") || "无"}；非四格格式 ${nonCanonical.join("、") || "无"}`
        : "根字段与 headers 顺序保持，JSON 为 4 空格格式",
    );
  }

  if (checkpoint === "e") {
    const markerPath = pathInside(root, ".phoenix/cache/codegen/marker-index-v1.json");
    let markerValid = false;
    if (existsSync(markerPath)) {
      try { markerValid = readJson(markerPath)?.kind === "kt.codegen.marker-index"; } catch { markerValid = false; }
    }
    check("marker-index", markerValid, markerValid ? "Marker Index 已生成且类型正确" : "Marker Index 缺失或格式错误");

    const preflightRoot = pathInside(root, ".phoenix/cache/codegen/preflight-v1");
    let preflightCount = 0;
    if (existsSync(preflightRoot) && statSync(preflightRoot).isDirectory()) {
      for (const name of readdirSync(preflightRoot)) {
        if (!name.endsWith(".json")) continue;
        try {
          if (readJson(join(preflightRoot, name))?.kind === "kt.codegen.preflight-cache") preflightCount += 1;
        } catch {
          // 由下面的统一检查报告。
        }
      }
    }
    check("preflight-cache", preflightCount > 0, preflightCount
      ? `${preflightCount} 份 Preflight Cache 类型正确`
      : "没有找到有效 Preflight Cache");

    const receiptRoot = pathInside(root, CODEGEN_APPLY_RECEIPT_RELATIVE);
    const receipts = [];
    if (existsSync(receiptRoot) && statSync(receiptRoot).isDirectory()) {
      for (const name of readdirSync(receiptRoot)) {
        if (!name.endsWith(".json")) continue;
        try {
          const receipt = readJson(join(receiptRoot, name));
          const errors = applyReceiptErrors(root, baseline, receipt);
          receipts.push({ name, receipt, errors });
        } catch (error) {
          receipts.push({ name, errors: [`JSON 无法读取：${error instanceof Error ? error.message : String(error)}`] });
        }
      }
    }
    const validReceipts = receipts.filter((item) => item.errors.length === 0);
    const receiptRegions = validReceipts.reduce((total, item) => total + item.receipt.regionCount, 0);
    check(
      "apply-receipt",
      validReceipts.length > 0,
      validReceipts.length
        ? `${validReceipts.length} 份 Apply Receipt 已按当前源码字节验证，共 ${receiptRegions} 个区域`
        : receipts.length
          ? `Apply Receipt 无效：${receipts.map((item) => `${item.name}（${item.errors.join("；")}）`).join("、")}`
          : `没有找到 Apply Receipt；请用当前版本重新执行真实 Apply（目录 ${CODEGEN_APPLY_RECEIPT_RELATIVE}）`,
    );
  }

  return { ok: checks.every((item) => item.ok), checkpoint, checks };
}
