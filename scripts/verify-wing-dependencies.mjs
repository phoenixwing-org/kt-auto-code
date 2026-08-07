import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestFiles = [
  "package.json",
  "extension/package.json",
  "extensions/kt-auto-cad/package.json",
];
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const expectedWingVersion = "0.6.2";
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
const versions = new Set([...wingDependencies.values()].map(({ specifier }) => specifier));
if (versions.size !== 1) {
  throw new Error(`Wing dependencies must be lockstep, got ${[...versions].join(", ")}`);
}
if (![...versions].every((version) => version === expectedWingVersion)) {
  throw new Error(`Wing dependencies must use Registry ${expectedWingVersion}, got ${[...versions].join(", ")}`);
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
  `[verify] ${wingDependencies.size} Wing manifest references use Registry ${[...versions][0]} with no local overrides\n`,
);
