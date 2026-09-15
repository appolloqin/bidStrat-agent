import { config } from 'dotenv';

config();

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbType: (process.env.DB_TYPE || 'sqlite').toLowerCase(),
  sqliteFile: process.env.SQLITE_FILE || 'data/dev.db',
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: parseInt(process.env.DB_PORT || '3306', 10),
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: process.env.DB_NAME || 'bidstrat',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  appSecret: process.env.APP_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me',
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  /** 单次请求基础超时（分级递增的起点） */
  llmTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '120000', 10),
  /** 超时后重试次数上限 */
  llmMaxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3', 10),
  /** 每多试一次，超时时间放大倍数（应对"请求时间不够"逐步放宽） */
  llmTimeoutMul: parseFloat(process.env.LLM_TIMEOUT_MUL || '2'),
  /** 单次 chat() 全部分支的总时长硬预算；超过即抛异常，不再无限等待 */
  llmMaxTotalMs: parseInt(process.env.LLM_MAX_TOTAL_MS || '2400000', 10),
  /** LLM 并发上限（默认 1 = 串行）。观测到连续超时时自动降级为串行 */
  llmConcurrency: parseInt(process.env.LLM_CONCURRENCY || '1', 10),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  webDist: process.env.WEB_DIST || '',
  autoContinue: (process.env.AGENT_AUTO_CONTINUE || 'true') === 'true',
};
