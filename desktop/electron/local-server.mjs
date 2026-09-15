import { app } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createServer } from 'node:net'
import { dataDir, loadSettings } from './settings.mjs'

let child = null
let activePort = null

/** 运行时根目录：打包后为 resources/runtime，开发时为 desktop/runtime */
export function runtimeRoot() {
  const packaged = path.join(process.resourcesPath || '', 'runtime')
  if (process.resourcesPath && fs.existsSync(packaged)) return packaged
  return path.resolve(app.getAppPath(), 'runtime')
}

/** 内嵌 Node 可执行文件；缺失时回退系统 node（仅开发态） */
export function nodeBinary() {
  const root = runtimeRoot()
  const candidates = process.platform === 'win32'
    ? [path.join(root, 'node', 'node.exe')]
    : [path.join(root, 'node', 'bin', 'node'), path.join(root, 'node', 'node')]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return 'node'
}

function findFreePort(start = 3210, end = 3400) {
  return new Promise((resolve) => {
    let port = start
    const tryNext = () => {
      if (port > end) return resolve(start)
      const srv = createServer()
      srv.once('error', () => tryNext())
      srv.once('listening', () => srv.close(() => resolve(port)))
      srv.listen(port, '127.0.0.1')
      port += 1
    }
    tryNext()
  })
}

function waitHealth(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/v1/health', timeout: 2000 }, (res) => {
        res.resume()
        if (res.statusCode === 200) return resolve()
        retry()
      })
      req.on('timeout', () => req.destroy())
      req.on('error', retry)
    }
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`本地服务健康检查超时 (端口 ${port})`))
      setTimeout(ping, 500)
    }
    ping()
  })
}

export async function startLocalServer() {
  if (child && activePort) return { url: localUrl(), port: activePort }
  const root = runtimeRoot()
  const serverDir = path.join(root, 'server')
  const entry = path.join(serverDir, 'dist', 'main.js')
  if (!fs.existsSync(entry)) {
    throw new Error(`未找到本地服务入口：${entry}\n请先执行 pnpm desktop:prepare 生成运行时。`)
  }
  const webDir = path.join(root, 'web')
  const data = dataDir()
  const settings = loadSettings()
  const dbFile = path.join(data, 'bidstrat.db')
  fs.mkdirSync(data, { recursive: true })
  if (!fs.existsSync(dbFile)) fs.closeSync(fs.openSync(dbFile, 'a'))
  console.log(`[desktop] SQLite 数据库: ${dbFile}`)
  const port = await findFreePort()
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DB_TYPE: 'sqlite',
    SQLITE_FILE: dbFile,
    UPLOAD_DIR: path.join(data, 'uploads'),
    WEB_DIST: fs.existsSync(path.join(webDir, 'index.html')) ? webDir : '',
    JWT_SECRET: settings.jwtSecret || 'desktop-secret',
    AGENT_AUTO_CONTINUE: 'true',
  }
  child = spawn(nodeBinary(), [entry], { cwd: serverDir, env, windowsHide: true })
  child.stdout?.on('data', (b) => process.stdout.write(`[server] ${b}`))
  child.stderr?.on('data', (b) => process.stderr.write(`[server] ${b}`))
  child.on('exit', (code, signal) => {
    console.warn(`[desktop] 本地服务退出 code=${code} signal=${signal}`)
    child = null
    activePort = null
  })
  await waitHealth(port)
  activePort = port
  return { url: localUrl(), port }
}

export function localUrl() {
  return `http://127.0.0.1:${activePort ?? 0}`
}

export function stopLocalServer() {
  if (!child) return
  const pid = child.pid
  try {
    if (process.platform === 'win32' && pid) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGTERM')
      setTimeout(() => {
        try {
          child?.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }, 3000)
    }
  } catch (err) {
    console.warn('[desktop] 停止本地服务失败:', err)
  } finally {
    child = null
    activePort = null
  }
}
