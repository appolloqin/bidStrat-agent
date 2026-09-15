import { DataSourceOptions } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { env } from './env';
import { entities } from '../entities';

export type DbKind = 'mysql' | 'better-sqlite3';

/** 归一化数据库类型：sqlite/sqlite3/better-sqlite3 均映射到 better-sqlite3 */
export function normalizeDbType(raw?: string): DbKind {
  const v = (raw ?? '').trim().toLowerCase();
  if (['mysql', 'mysql8', 'mysql2', 'mariadb'].includes(v)) return 'mysql';
  return 'better-sqlite3';
}

/** 解析 SQLite 文件的绝对路径（相对路径基于进程工作目录） */
export function resolveSqliteFile(): string {
  return path.isAbsolute(env.sqliteFile) ? env.sqliteFile : path.resolve(process.cwd(), env.sqliteFile);
}

/** 自动创建数据库目录与数据库文件（若不存在） */
export function ensureSqliteFile(): string {
  const file = resolveSqliteFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.closeSync(fs.openSync(file, 'a'));
  }
  return file;
}

/** 启动前确保数据库就绪，返回可读的诊断信息 */
export function ensureDatabaseReady(): { type: DbKind; file?: string } {
  const type = normalizeDbType(env.dbType);
  if (type === 'mysql') return { type };
  return { type, file: ensureSqliteFile() };
}

export function buildDataSourceOptions(): DataSourceOptions {
  const type = normalizeDbType(env.dbType);
  if (type === 'mysql') {
    return {
      type: 'mysql',
      host: env.dbHost,
      port: env.dbPort,
      username: env.dbUser,
      password: env.dbPassword,
      database: env.dbName,
      charset: 'utf8mb4',
      entities,
      synchronize: true,
    };
  }
  return {
    type: 'better-sqlite3',
    database: ensureSqliteFile(),
    entities,
    synchronize: true,
    prepareDatabase: (db: {
      pragma: (stmt: string) => unknown;
    }) => {
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
    },
  };
}
