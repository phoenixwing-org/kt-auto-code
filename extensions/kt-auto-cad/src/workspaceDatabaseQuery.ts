import path from "node:path";
import {
  pnwQueryCadWorkspaceSummaryV1,
  type PnwCadWorkspaceSummaryV1,
} from "@phoenix-wing/cad-contracts";
import { PNW_WORKSPACE_DATABASE_FILENAME } from "@phoenix-wing/workspace-schema";

export interface KtcSqliteRunResult {
  readonly changes: number | bigint;
  readonly lastInsertRowid: number | bigint;
}

export interface KtcSqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): KtcSqliteRunResult;
}

export interface KtcSqliteDatabase {
  prepare(sql: string): KtcSqliteStatement;
  exec(sql: string): void;
  close(): void;
}

export interface KtcNodeSqliteModule {
  DatabaseSync: new (databasePath: string, options?: { readOnly?: boolean }) => KtcSqliteDatabase;
}

export type KtcNodeSqliteLoader = () => Promise<KtcNodeSqliteModule>;
export type KtcCadDatabaseSummary = PnwCadWorkspaceSummaryV1;

export const loadNodeSqlite: KtcNodeSqliteLoader = async () => (
  await import("node:sqlite") as unknown as KtcNodeSqliteModule
);

/** Opens an existing workspace database strictly read-only and closes it after the query. */
export async function queryCadWorkspaceSummary(
  databasePath: string,
  relativePath: string,
  loader: KtcNodeSqliteLoader = loadNodeSqlite,
): Promise<KtcCadDatabaseSummary> {
  if (!path.isAbsolute(databasePath) || path.basename(databasePath) !== PNW_WORKSPACE_DATABASE_FILENAME) {
    throw new Error(`数据库必须是绝对路径的 ${PNW_WORKSPACE_DATABASE_FILENAME}`);
  }
  let sqliteModule: KtcNodeSqliteModule;
  try {
    sqliteModule = await loader();
  } catch (error) {
    throw new Error("当前 VS Code Extension Host 不支持内置 SQLite；请升级 VS Code 后重试数据库查询。", {
      cause: error,
    });
  }
  const { DatabaseSync } = sqliteModule;
  const sqlite = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return pnwQueryCadWorkspaceSummaryV1({
      get: <T>(sql: string, params: readonly unknown[] = []) => (
        sqlite.prepare(sql).get(...params) as T | undefined
      ),
      all: <T>(sql: string, params: readonly unknown[] = []) => (
        sqlite.prepare(sql).all(...params) as T[]
      ),
    }, relativePath);
  } finally {
    sqlite.close();
  }
}
