import { basename } from "node:path";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";

export interface KtcCheckoutScriptOptions { includeRoots?: boolean; includeBranch?: boolean; includeCommit?: boolean; }
const ps = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export function ktcCreateRepositoryCheckoutScript(configuration: KtcAutoBuildConfiguration, options: KtcCheckoutScriptOptions = {}): string {
  const includeBranch = options.includeBranch !== false;
  const repositories = (configuration.repositorySnapshot?.repositories || []).filter((item) => {
    const root = item.role === "ROOT_DIR" || item.role === "ROOT_DIR_3rdParty";
    return !item.error && item.origin && item.origin !== "(无 origin)" && (options.includeRoots || !root);
  });
  const commands = repositories.map((item) => {
    const directory = basename(item.path.replace(/[\\/]+$/, ""));
    const inferred = basename(item.origin.replace(/[\\/]+$/, "")).replace(/\.git$/i, "");
    const target = directory.toLocaleLowerCase() === inferred.toLocaleLowerCase() ? "" : ` ${ps(directory)}`;
    const branch = includeBranch && item.branch && item.branch !== "(detached)" ? ` --branch ${ps(item.branch)}` : "";
    const steps = [`git clone${branch} ${ps(item.origin)}${target}`];
    if (options.includeCommit && item.commit) steps.push("if ($LASTEXITCODE -ne 0) { throw 'git clone 失败' }", `git -C ${ps(directory)} reset --hard ${ps(item.commit)}`);
    if (item.role === "ROOT_DIR" || item.role === "ROOT_DIR_3rdParty") steps.push("if ($LASTEXITCODE -ne 0) { throw '检出失败' }", `git -C ${ps(directory)} lfs pull`, `git -C ${ps(directory)} submodule update --init --recursive`);
    return `    ${steps.join("; ")}`;
  }).join("\n");
  return `#Requires -Version 5.1
# license     MIT
# brief       Git clone commands exported from Auto Code Compile Tool.
[CmdletBinding()]
param()

${commands}
`;
}
