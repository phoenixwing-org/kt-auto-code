import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestFiles = [
  "package.json",
];
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const expectedWingVersions = new Map([
  ["@phoenix-wing/code-core", "0.6.4"],
  ["@phoenix-wing/git-core", "0.6.4"],
  ["@phoenix-wing/git-node", "0.6.4"],
  ["@phoenix-wing/kt-codegen", "0.6.4"],
  ["@phoenix-wing/run-core", "0.6.3"],
  ["@phoenix-wing/run-node", "0.6.3"],
]);
const wingDependencies = new Map();

for (const relative of manifestFiles) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  for (const section of dependencySections) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      if (name !== "phoenix-wing" && !name.startsWith("@phoenix-wing/")) continue;
      if (!/^\d+\.\d+\.\d+$/u.test(specifier)) {
        throw new Error(`${relative} ${section}.${name} must use an exact Registry version, got ${specifier}`);
      }
      wingDependencies.set(`${relative}:${name}`, { name, specifier });
    }
  }
  for (const [name, target] of Object.entries(manifest.pnpm?.overrides ?? {})) {
    if (name.includes("phoenix-wing") || String(target).includes("phoenix-wing")) {
      throw new Error(`${relative} must not override Wing through ${name}: ${target}`);
    }
  }
}

if (wingDependencies.size === 0) throw new Error("No Wing dependencies were found");
for (const { name, specifier } of wingDependencies.values()) {
  const expected = expectedWingVersions.get(name);
  if (!expected) throw new Error(`Unexpected Wing dependency ${name}; add an explicit expected Registry version`);
  if (specifier !== expected) throw new Error(`${name} must use Registry ${expected}, got ${specifier}`);
}
if (wingDependencies.size !== expectedWingVersions.size) {
  throw new Error(`Expected ${expectedWingVersions.size} Wing dependencies, found ${wingDependencies.size}`);
}

const lockfile = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
if (/(?:link|file):[^\n]*phoenix-wing/iu.test(lockfile)) {
  throw new Error("pnpm-lock.yaml must not resolve Wing from a local path");
}
for (const { name, specifier } of wingDependencies.values()) {
  if (!lockfile.includes(`'${name}@${specifier}':`)) {
    throw new Error(`pnpm-lock.yaml is missing Registry resolution ${name}@${specifier}`);
  }
}

process.stdout.write(
  `[verify] ${wingDependencies.size} Wing manifest references match the approved Registry version map with no local overrides\n`,
);
