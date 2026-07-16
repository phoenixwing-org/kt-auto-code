import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import {
  pnwInferBomFieldsFromFilename,
  type PnwCadBomFields,
  type PnwCadXlinkRef,
  type PnwCadXlinkResolveStatus,
} from "@phoenix-wing/cad-core";
import {
  PNW_WORKSPACE_DATABASE_FILENAME,
  PNW_WORKSPACE_SCHEMA_V13_DDL,
  PNW_WORKSPACE_SCHEMA_VERSION,
  PNW_WORKSPACE_SCHEMA_VERSION_UPSERT_SQL,
} from "@phoenix-wing/workspace-schema";
import { diagnoseCadXlinks } from "./xlinkDiagnostics.js";
import {
  loadNodeSqlite,
  type KtcNodeSqliteLoader,
  type KtcSqliteDatabase,
} from "./workspaceDatabaseQuery.js";

export interface KtcCadIndexRecord {
  readonly relativePath: string;
  readonly filename: string;
  readonly documentKind: string;
  readonly sizeBytes: number;
  readonly objectCount: number;
  readonly xlinks: readonly PnwCadXlinkRef[];
  readonly parseError?: string;
}

export interface KtcCadIndexAsset extends KtcCadIndexRecord {
  readonly fields: PnwCadBomFields;
}

export interface KtcCadIndexReference {
  readonly hostRelativePath: string;
  readonly file: string;
  readonly label: string;
  readonly status: PnwCadXlinkResolveStatus;
  readonly targetRelativePath: string | null;
  readonly targetFields: PnwCadBomFields;
}

export interface KtcCadBomLine {
  readonly assemblyRelativePath: string;
  readonly partRelativePath: string;
  readonly depth: number;
  readonly bomPath: string;
  readonly partKey: string;
  readonly quantity: number;
  readonly cycleDetected: boolean;
}

export interface KtcCadWorkspaceIndexPlan {
  readonly assets: readonly KtcCadIndexAsset[];
  readonly references: readonly KtcCadIndexReference[];
  readonly bomLines: readonly KtcCadBomLine[];
  readonly parseFailures: number;
}

export interface KtcCadWorkspaceIndexResult {
  readonly databasePath: string;
  readonly files: number;
  readonly parsedFiles: number;
  readonly references: number;
  readonly bomLines: number;
}

export interface KtcCadIndexSearchRow {
  readonly repo_rel_path: string;
  readonly filename: string;
  readonly asset_kind: string | null;
  readonly part_number: string | null;
  readonly part_version: string | null;
  readonly part_name: string | null;
  readonly label: string | null;
}

export function buildCadWorkspaceIndex(records: readonly KtcCadIndexRecord[]): KtcCadWorkspaceIndexPlan {
  const assets = records.map((record) => Object.freeze({
    ...record,
    fields: pnwInferBomFieldsFromFilename(record.relativePath),
  }));
  const knownPaths = assets.map((asset) => asset.relativePath);
  const references = assets.flatMap((asset) => diagnoseCadXlinks(
    asset.relativePath,
    asset.xlinks,
    knownPaths,
  ).items.map((item) => {
    const targetPath = item.targetRelativePath || item.file;
    return Object.freeze({
      hostRelativePath: asset.relativePath,
      file: item.file,
      label: item.label,
      status: item.status,
      targetRelativePath: item.targetRelativePath,
      targetFields: pnwInferBomFieldsFromFilename(safeFcstdRelativePath(targetPath)),
    });
  }));
  const bomLines = buildBomLines(assets, references);
  return Object.freeze({
    assets: Object.freeze(assets),
    references: Object.freeze(references),
    bomLines: Object.freeze(bomLines),
    parseFailures: assets.filter((asset) => Boolean(asset.parseError)).length,
  });
}

export async function writeCadWorkspaceIndex(
  databasePath: string,
  scanRoot: string,
  plan: KtcCadWorkspaceIndexPlan,
  loader: KtcNodeSqliteLoader = loadNodeSqlite,
): Promise<KtcCadWorkspaceIndexResult> {
  assertDatabasePath(databasePath);
  let sqliteModule;
  try {
    sqliteModule = await loader();
  } catch (error) {
    throw new Error("当前 VS Code Extension Host 不支持内置 SQLite；文件扫描仍可用，但入库需要升级 VS Code。", { cause: error });
  }
  const existingDatabase = existsSync(databasePath) && statSync(databasePath).size > 0;
  const database = new sqliteModule.DatabaseSync(databasePath);
  const now = new Date().toISOString();
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    if (existingDatabase) {
      try {
        assertSchemaV13(database);
      } catch (error) {
        throw new Error("已有工作区数据库不是兼容的 Schema v13；插件不会自动迁移或覆盖它。", { cause: error });
      }
    }
    database.exec(PNW_WORKSPACE_SCHEMA_V13_DDL);
    if (!existingDatabase) {
      database.prepare(PNW_WORKSPACE_SCHEMA_VERSION_UPSERT_SQL).run(String(PNW_WORKSPACE_SCHEMA_VERSION));
    }
    database.exec("BEGIN IMMEDIATE;");
    try {
      const scanId = insertScan(database, scanRoot, plan, now);
      replaceAssets(database, plan.assets, now);
      replaceGraph(database, scanId, plan, now);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  } finally {
    database.close();
  }
  return Object.freeze({
    databasePath,
    files: plan.assets.length,
    parsedFiles: plan.assets.length - plan.parseFailures,
    references: plan.references.length,
    bomLines: plan.bomLines.length,
  });
}

export async function searchCadWorkspaceIndex(
  databasePath: string,
  searchText: string,
  loader: KtcNodeSqliteLoader = loadNodeSqlite,
): Promise<readonly KtcCadIndexSearchRow[]> {
  assertDatabasePath(databasePath);
  const sqliteModule = await loader().catch((error: unknown) => {
    throw new Error("当前 VS Code Extension Host 不支持内置 SQLite；请升级 VS Code 后搜索索引。", { cause: error });
  });
  const database = new sqliteModule.DatabaseSync(databasePath, { readOnly: true });
  try {
    assertSchemaV13(database);
    const term = searchText.trim().toLocaleLowerCase("en-US");
    if (!term) return database.prepare(`
      SELECT repo_rel_path, filename, asset_kind, part_number, part_version, part_name, label
      FROM phoenix_cad_file_asset
      WHERE file_status = 'present'
      ORDER BY repo_rel_path
      LIMIT 200
    `).all() as KtcCadIndexSearchRow[];
    const like = `%${term}%`;
    return database.prepare(`
      SELECT repo_rel_path, filename, asset_kind, part_number, part_version, part_name, label
      FROM phoenix_cad_file_asset
      WHERE file_status = 'present' AND (
        lower(repo_rel_path) LIKE ? OR lower(filename) LIKE ? OR
        lower(COALESCE(part_number, '')) LIKE ? OR lower(COALESCE(part_version, '')) LIKE ? OR
        lower(COALESCE(part_name, '')) LIKE ? OR lower(COALESCE(label, '')) LIKE ?
      )
      ORDER BY repo_rel_path
      LIMIT 200
    `).all(like, like, like, like, like, like) as KtcCadIndexSearchRow[];
  } finally {
    database.close();
  }
}

function insertScan(
  database: KtcSqliteDatabase,
  scanRoot: string,
  plan: KtcCadWorkspaceIndexPlan,
  now: string,
): number {
  const stats = JSON.stringify({
    source: "kt-auto-cad-ts",
    files: plan.assets.length,
    parsed_files: plan.assets.length - plan.parseFailures,
    parse_failures: plan.parseFailures,
    references: plan.references.length,
    bom_lines: plan.bomLines.length,
  });
  const result = database.prepare(`
    INSERT INTO phoenix_cad_scan(scan_uuid, scanned_at, scan_root, stats_json, status, phase, started_at, finished_at)
    VALUES (?, ?, ?, ?, 'done', 'ts-light-index', ?, ?)
  `).run(randomUUID(), now, scanRoot, stats, now, now);
  return Number(result.lastInsertRowid);
}

function replaceAssets(database: KtcSqliteDatabase, assets: readonly KtcCadIndexAsset[], now: string): void {
  database.prepare("UPDATE phoenix_cad_file_asset SET file_status = 'missing', updated_at = ?").run(now);
  const upsertAsset = database.prepare(`
    INSERT INTO phoenix_cad_file_asset(
      repo_rel_path, filename, asset_kind, part_number, part_version, type_code,
      model_series, part_name, label, file_status, last_seen_at, bom_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'present', ?, ?, ?)
    ON CONFLICT(repo_rel_path) DO UPDATE SET
      filename = excluded.filename, asset_kind = excluded.asset_kind,
      part_number = excluded.part_number, part_version = excluded.part_version,
      type_code = excluded.type_code, model_series = excluded.model_series,
      part_name = excluded.part_name, label = excluded.label, file_status = 'present',
      last_seen_at = excluded.last_seen_at, bom_json = excluded.bom_json, updated_at = excluded.updated_at
  `);
  const upsertPart = database.prepare(`
    INSERT INTO phoenix_cad_part_key(part_number, part_version, type_code, model_series, part_name, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(part_number, part_version) DO UPDATE SET
      type_code = excluded.type_code, model_series = excluded.model_series,
      part_name = excluded.part_name, label = excluded.label, updated_at = excluded.updated_at
  `);
  const selectAsset = database.prepare("SELECT id FROM phoenix_cad_file_asset WHERE repo_rel_path = ?");
  const selectPart = database.prepare("SELECT id FROM phoenix_cad_part_key WHERE part_number = ? AND part_version = ?");
  const linkPart = database.prepare(`
    INSERT INTO phoenix_cad_part_file_link(part_key_id, file_asset_id, file_role, link_status, linked_at)
    VALUES (?, ?, ?, 'active', ?)
    ON CONFLICT(file_asset_id) DO UPDATE SET
      part_key_id = excluded.part_key_id, file_role = excluded.file_role,
      link_status = 'active', linked_at = excluded.linked_at
  `);
  for (const asset of assets) {
    const fields = asset.fields;
    upsertAsset.run(
      asset.relativePath, asset.filename, asset.documentKind.toLocaleLowerCase("en-US"),
      fields.PartNumber || null, fields.PartVersion || null, fields.TypeCode || null,
      fields.ModelSeries || null, fields.PartName || null, fields.label || null,
      now,
      JSON.stringify({
        protocol: "kt-auto-cad-ts-index",
        version: 1,
        size_bytes: asset.sizeBytes,
        document_xml_objects: asset.objectCount,
        xlinks: asset.xlinks,
        parse_error: asset.parseError || null,
      }),
      now,
    );
    if (!fields.PartNumber || !fields.PartVersion) continue;
    upsertPart.run(
      fields.PartNumber, fields.PartVersion, fields.TypeCode || null, fields.ModelSeries || null,
      fields.PartName || null, fields.label || null, now, now,
    );
    const assetId = Number((selectAsset.get(asset.relativePath) as { id?: unknown } | undefined)?.id);
    const partId = Number((selectPart.get(fields.PartNumber, fields.PartVersion) as { id?: unknown } | undefined)?.id);
    if (Number.isInteger(assetId) && Number.isInteger(partId)) {
      linkPart.run(partId, assetId, asset.documentKind.toLocaleLowerCase("en-US"), now);
    }
  }
}

function replaceGraph(database: KtcSqliteDatabase, scanId: number, plan: KtcCadWorkspaceIndexPlan, now: string): void {
  database.exec(`
    DELETE FROM phoenix_cad_bom_tree_occurrence;
    DELETE FROM phoenix_cad_bom_line;
    DELETE FROM phoenix_cad_xref_flat;
    DELETE FROM phoenix_cad_bom_xref;
    DELETE FROM phoenix_cad_bom_assembly_cache;
  `);
  const assetIds = new Map<string, number>();
  const selectAsset = database.prepare("SELECT id FROM phoenix_cad_file_asset WHERE repo_rel_path = ?");
  for (const asset of plan.assets) {
    const id = Number((selectAsset.get(asset.relativePath) as { id?: unknown } | undefined)?.id);
    if (Number.isInteger(id)) assetIds.set(asset.relativePath, id);
  }
  const insertReference = database.prepare(`
    INSERT INTO phoenix_cad_bom_xref(
      scan_id, host_file_asset_id, host_repo_rel_path, ref_kind, locator,
      xlink_file_attr, link_label, rule_label, target_basename, target_file_asset_id,
      target_repo_rel_path, target_part_number, target_part_version, target_type_code,
      target_model_series, target_part_name, target_asset_label, resolve_status, detail_json, last_seen_at
    ) VALUES (?, ?, ?, 'xlink_file_attr', 'Document.xml', ?, ?, 'ts-light-index', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFlat = database.prepare(`
    INSERT INTO phoenix_cad_xref_flat(scan_id, host_rel, target_rel, link_label, is_direct, built_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `);
  for (const reference of plan.references) {
    const hostId = assetIds.get(reference.hostRelativePath);
    if (!hostId) continue;
    const fields = reference.targetFields;
    insertReference.run(
      scanId, hostId, reference.hostRelativePath, reference.file, reference.label,
      path.posix.basename(reference.file.replaceAll("\\", "/")),
      reference.targetRelativePath ? assetIds.get(reference.targetRelativePath) ?? null : null,
      reference.targetRelativePath,
      fields.PartNumber, fields.PartVersion, fields.TypeCode, fields.ModelSeries,
      fields.PartName, fields.label, reference.status,
      JSON.stringify({ source: "kt-auto-cad-ts", basic_bom: true }), now,
    );
    if (reference.targetRelativePath && reference.status === "resolved") {
      insertFlat.run(scanId, reference.hostRelativePath, reference.targetRelativePath, reference.label, now);
    }
  }
  const insertBomLine = database.prepare(`
    INSERT INTO phoenix_cad_bom_line(
      scan_id, assembly_rel, part_rel, depth, bom_path, part_key, quantity, cycle_detected, built_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOccurrence = database.prepare(`
    INSERT INTO phoenix_cad_bom_tree_occurrence(
      root_host_repo_rel_path, tree_path, depth, host_repo_rel_path,
      target_repo_rel_path, xlink_file_attr, link_label, built_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of plan.bomLines) {
    insertBomLine.run(
      scanId, line.assemblyRelativePath, line.partRelativePath, line.depth,
      line.bomPath, line.partKey, line.quantity, line.cycleDetected ? 1 : 0, now,
    );
    const parent = line.bomPath.split(" > ").at(-2) || line.assemblyRelativePath;
    insertOccurrence.run(
      line.assemblyRelativePath, line.bomPath, line.depth, parent,
      line.partRelativePath, line.partRelativePath, "", now,
    );
  }
}

function buildBomLines(
  assets: readonly KtcCadIndexAsset[],
  references: readonly KtcCadIndexReference[],
): KtcCadBomLine[] {
  const adjacency = new Map<string, KtcCadIndexReference[]>();
  for (const reference of references) {
    const current = adjacency.get(reference.hostRelativePath) ?? [];
    current.push(reference);
    adjacency.set(reference.hostRelativePath, current);
  }
  const lines: KtcCadBomLine[] = [];
  for (const root of assets.filter((asset) => adjacency.has(asset.relativePath))) {
    const visit = (host: string, depth: number, ancestors: ReadonlySet<string>, pathParts: readonly string[]): void => {
      if (depth > 32) return;
      for (const edge of adjacency.get(host) ?? []) {
        const target = edge.targetRelativePath || safeFcstdRelativePath(edge.file);
        const cycleDetected = ancestors.has(target);
        const nextPath = [...pathParts, target];
        lines.push(Object.freeze({
          assemblyRelativePath: root.relativePath,
          partRelativePath: target,
          depth,
          bomPath: nextPath.join(" > "),
          partKey: [edge.targetFields.PartNumber, edge.targetFields.PartVersion].filter(Boolean).join("."),
          quantity: 1,
          cycleDetected,
        }));
        if (edge.targetRelativePath && edge.status === "resolved" && !cycleDetected) {
          visit(target, depth + 1, new Set([...ancestors, target]), nextPath);
        }
      }
    };
    visit(root.relativePath, 1, new Set([root.relativePath]), [root.relativePath]);
  }
  return lines;
}

function safeFcstdRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const basename = path.posix.basename(normalized) || "unknown.FCStd";
  return /\.fcstd$/i.test(normalized) && !normalized.startsWith("/") && !normalized.split("/").includes("..")
    ? normalized
    : /\.fcstd$/i.test(basename)
      ? basename
      : `${basename}.FCStd`;
}

function assertDatabasePath(databasePath: string): void {
  if (!path.isAbsolute(databasePath) || path.basename(databasePath) !== PNW_WORKSPACE_DATABASE_FILENAME) {
    throw new Error(`数据库必须是绝对路径的 ${PNW_WORKSPACE_DATABASE_FILENAME}`);
  }
}

function assertSchemaV13(database: KtcSqliteDatabase): void {
  const row = database.prepare("SELECT value FROM phoenix_meta WHERE key = ?").get("schema_version") as { value?: unknown } | undefined;
  if (String(row?.value ?? "") !== String(PNW_WORKSPACE_SCHEMA_VERSION)) {
    throw new Error(`工作区数据库不是 Schema v${PNW_WORKSPACE_SCHEMA_VERSION}`);
  }
}
