import * as crypto from 'crypto';
import { env } from '../config/env';

const ALGO = 'aes-256-gcm';
const KEY = crypto.scryptSync(env.appSecret, 'bidstrat.secret.v1', 32);

/**
 * 使用 AES-256-GCM 加密敏感信息（如模型 API Key）。
 * 输出格式：v1:<iv b64>:<tag b64>:<ciphertext b64>
 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const data = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** 仅展示末 4 位，其余用 * 代替 */
export function maskSecret(plain: string | null | undefined): string {
  if (!plain) return '';
  if (plain.length <= 4) return '*'.repeat(plain.length);
  return `${'*'.repeat(Math.max(4, plain.length - 4))}${plain.slice(-4)}`;
}
