import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { env } from './config/env';
import { ensureDatabaseReady } from './config/database';

/** 解析前端构建目录：优先 WEB_DIST，其次自动探测常见位置（开发态单端口） */
function resolveWebDist(): string {
  if (env.webDist) return path.resolve(env.webDist);
  const candidates = [
    path.resolve(process.cwd(), '..', 'web', 'dist'),
    path.resolve(process.cwd(), '..', '..', 'apps', 'web', 'dist'),
    path.resolve(process.cwd(), 'apps', 'web', 'dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return '';
}

function mountWeb(app: Awaited<ReturnType<typeof NestFactory.create>>): void {
  const root = resolveWebDist();
  if (!root) return;
  const indexHtml = path.join(root, 'index.html');
  if (!fs.existsSync(indexHtml)) return;
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    const rel = decodeURIComponent(req.path).replace(/^\/+/, '');
    const filePath = path.resolve(root, rel);
    if (filePath === root || filePath.startsWith(root + path.sep)) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
      }
    }
    if (path.extname(rel)) return next();
    return res.sendFile(indexHtml);
  });
  Logger.log(`已挂载前端静态资源: ${root}（访问 http://localhost:${env.port}/ 即前端页面）`, 'Bootstrap');
}

async function bootstrap() {
  fs.mkdirSync(env.uploadDir, { recursive: true });

  const db = ensureDatabaseReady();
  if (db.type === 'better-sqlite3') {
    Logger.log(`SQLite 数据库已就绪（自动创建）: ${db.file}`, 'Bootstrap');
  } else {
    Logger.log(`数据库: MySQL ${env.dbHost}:${env.dbPort}/${env.dbName}`, 'Bootstrap');
  }

  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  mountWeb(app);

  const port = env.port;
  await app.listen(port);
  Logger.log(`竞策智能体服务启动: 前端 http://localhost:${port}/ · API http://localhost:${port}/api/v1`, 'Bootstrap');
}
bootstrap();