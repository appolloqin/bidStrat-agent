import { Controller, Get } from '@nestjs/common';
import * as fs from 'fs';
import { Public } from './common/public.decorator';
import { env } from './config/env';
import { normalizeDbType, resolveSqliteFile } from './config/database';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Public()
  @Get('system/db')
  db() {
    const type = normalizeDbType(env.dbType);
    if (type === 'better-sqlite3') {
      const file = resolveSqliteFile();
      const exists = fs.existsSync(file);
      return {
        driver: 'better-sqlite3',
        file,
        exists,
        sizeBytes: exists ? fs.statSync(file).size : 0,
      };
    }
    return { driver: 'mysql', host: env.dbHost, port: env.dbPort, database: env.dbName };
  }
}