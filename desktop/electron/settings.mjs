import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DEFAULT_CONSOLE_URL } from './config.mjs'

/**
 * @typedef {{ mode: 'local' | 'remote', remoteUrl: string, jwtSecret?: string }} DesktopSettings
 */

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json')
}

function newSecret() {
  return crypto.randomBytes(32).toString('hex')
}

/** @returns {DesktopSettings} */
export function loadSettings() {
  const fallback = { mode: 'local', remoteUrl: DEFAULT_CONSOLE_URL, jwtSecret: newSecret() }
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    const mode = parsed.mode === 'remote' ? 'remote' : 'local'
    let remoteUrl = typeof parsed.remoteUrl === 'string' ? parsed.remoteUrl.trim() : DEFAULT_CONSOLE_URL
    try {
      remoteUrl = new URL(remoteUrl).href
    } catch {
      remoteUrl = DEFAULT_CONSOLE_URL
    }
    const jwtSecret = typeof parsed.jwtSecret === 'string' && parsed.jwtSecret.length >= 16 ? parsed.jwtSecret : newSecret()
    return { mode, remoteUrl, jwtSecret }
  } catch {
    return fallback
  }
}

/** @param {Partial<DesktopSettings>} patch */
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  if (next.mode !== 'remote') next.mode = 'local'
  try {
    next.remoteUrl = new URL(String(next.remoteUrl || DEFAULT_CONSOLE_URL)).href
  } catch {
    next.remoteUrl = DEFAULT_CONSOLE_URL
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

export function dataDir() {
  const dir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true })
  return dir
}
