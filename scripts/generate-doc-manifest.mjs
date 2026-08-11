import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(root, "docs/document-policy.json");
const outputPath = path.join(root, "docs/document-manifest.json");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const files = execFileSync(
  "git",
  ["-c", "core.quotePath=false", "ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((file) => fs.existsSync(path.join(root, file)))
  .sort((left, right) => left.localeCompare(right, "zh-CN"));

const entries = files.map((file) => {
  const rule = policy.rules.find(({ match }) => new RegExp(match, "u").test(file));
  if (!rule) throw new Error(`Unclassified Markdown document: ${file}`);
  const entry = {
    path: file,
    status: rule.status,
    owner: rule.owner ?? policy.owner,
    appliesTo: rule.status === "archived" ? "historical" : policy.appliesTo,
    lastVerified: policy.lastVerified,
  };
  if (rule.sourceOfTruth) entry.sourceOfTruth = rule.sourceOfTruth;
  if (rule.reason) entry.reason = rule.reason;
  if (entry.status === "superseded" && !entry.sourceOfTruth) {
    throw new Error(`Superseded document must declare sourceOfTruth: ${file}`);
  }
  return entry;
});

const manifest = {
  schemaVersion: policy.schemaVersion,
  generatedBy: "pnpm docs:manifest",
  statuses: ["current", "draft", "superseded", "archived", "generated"],
  entries,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

function verifyCurrentLinks() {
  const failures = [];
  for (const entry of entries.filter(({ status }) => status === "current")) {
    const sourcePath = path.join(root, entry.path);
    const markdown = fs.readFileSync(sourcePath, "utf8");
    for (const match of markdown.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/gu)) {
      let target = match[1].trim().replace(/^<|>$/gu, "").split("#", 1)[0];
      if (!target || /^(?:https?:|mailto:)/u.test(target)) continue;
      try {
        target = decodeURIComponent(target);
      } catch {
        failures.push(`${entry.path}: invalid encoded link ${target}`);
        continue;
      }
      const resolved = path.resolve(path.dirname(sourcePath), target);
      if (!fs.existsSync(resolved)) failures.push(`${entry.path}: missing link target ${target}`);
    }
  }
  if (failures.length > 0) throw new Error(`Current document link check failed:\n${failures.join("\n")}`);
}

if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialized) {
    throw new Error("docs/document-manifest.json is stale; run pnpm docs:manifest");
  }
  verifyCurrentLinks();
  process.stdout.write(`[docs] ${entries.length} Markdown documents classified; current links are valid\n`);
} else {
  fs.writeFileSync(outputPath, serialized);
  verifyCurrentLinks();
  process.stdout.write(`[docs] wrote ${entries.length} entries to docs/document-manifest.json\n`);
}
