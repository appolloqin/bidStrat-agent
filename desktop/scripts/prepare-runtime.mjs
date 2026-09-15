import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')
const runtimeRoot = path.join(desktopDir, 'runtime')
const cacheDir = path.join(desktopDir, '.cache')

function log(...args) {
  console.log('[prepare-runtime]', ...args)
}

function run(cmd, args, cwd = repoRoot) {
  log('$', cmd, args.join(' '))
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function copyDir(from, to) {
  rmrf(to)
  ensureDir(path.dirname(to))
  fs.cpSync(from, to, { recursive: true })
}

async function download(url, dest) {
  ensureDir(path.dirname(dest))
  if (fs.existsSync(dest)) return dest
  log('下载', url)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return dest
}

function buildProject() {
  run('pnpm', ['--filter', '@bidstrat/shared', 'build'])
  run('pnpm', ['--filter', '@bidstrat/server', 'build'])
  run('pnpm', ['--filter', '@bidstrat/web', 'build'])
}

function stageWeb() {
  const from = path.join(repoRoot, 'apps', 'web', 'dist')
  if (!fs.existsSync(path.join(from, 'index.html'))) throw new Error('前端构建产物缺失，请先 build:web')
  copyDir(from, path.join(runtimeRoot, 'web'))
  log('已暂存前端 → runtime/web')
}

function stageServer() {
  const serverDir = path.join(runtimeRoot, 'server')
  const srcPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps', 'server', 'package.json'), 'utf8'))
  const deps = {}
  for (const [name, range] of Object.entries(srcPkg.dependencies || {})) {
    if (String(range).startsWith('workspace:')) continue
    deps[name] = range
  }
  const stagedPkg = {
    name: 'bidstrat-server-runtime',
    version: srcPkg.version || '1.0.0',
    private: true,
    main: 'dist/main.js',
    dependencies: deps,
  }
  ensureDir(serverDir)
  const pkgJson = JSON.stringify(stagedPkg, null, 2)
  fs.writeFileSync(path.join(serverDir, 'package.json'), pkgJson)
  copyDir(path.join(repoRoot, 'apps', 'server', 'dist'), path.join(serverDir, 'dist'))

  const modulesDir = path.join(serverDir, 'node_modules')
  const depsMarker = path.join(modulesDir, '.deps.json')
  const prevDeps = fs.existsSync(depsMarker) ? fs.readFileSync(depsMarker, 'utf8') : ''
  if (!fs.existsSync(modulesDir) || prevDeps !== pkgJson) {
    log('安装后端生产依赖（依赖有变化时执行，首次较慢）…')
    run('npm', ['install', '--omit=dev', '--no-package-lock', '--legacy-peer-deps', '--no-audit', '--no-fund'], serverDir)
    ensureDir(modulesDir)
    fs.writeFileSync(depsMarker, pkgJson)
  } else {
    log('后端生产依赖无变化，跳过安装')
  }

  const sharedSrc = path.join(repoRoot, 'packages', 'shared')
  const sharedDest = path.join(modulesDir, '@bidstrat', 'shared')
  rmrf(sharedDest)
  ensureDir(sharedDest)
  copyDir(path.join(sharedSrc, 'dist'), path.join(sharedDest, 'dist'))
  fs.writeFileSync(
    path.join(sharedDest, 'package.json'),
    JSON.stringify(
      { name: '@bidstrat/shared', version: '1.0.0', main: './dist/index.js', types: './dist/index.d.ts' },
      null,
      2,
    ),
  )
  log('已暂存后端 → runtime/server')
}

function nodeDistName(version) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'win32') return { file: `node-v${version}-win-${arch}.zip`, inner: `node-v${version}-win-${arch}` }
  if (process.platform === 'darwin') return { file: `node-v${version}-darwin-${arch}.tar.gz`, inner: `node-v${version}-darwin-${arch}` }
  return { file: `node-v${version}-linux-${arch}.tar.gz`, inner: `node-v${version}-linux-${arch}` }
}

async function prepareNode() {
  if (process.env.BIDSTRAT_SKIP_NODE === '1') {
    log('跳过内嵌 Node（BIDSTRAT_SKIP_NODE=1），运行时将使用系统 node')
    return
  }
  const version = process.env.BIDSTRAT_NODE_VERSION?.trim() || '22.14.0'
  const { file, inner } = nodeDistName(version)
  const mirrors = process.env.BIDSTRAT_NODE_MIRROR
    ? [`${process.env.BIDSTRAT_NODE_MIRROR.replace(/\/$/, '')}/v${version}/${file}`]
    : [
        `https://nodejs.org/dist/v${version}/${file}`,
        `https://npmmirror.com/mirrors/node/v${version}/${file}`,
      ]
  let archive = null
  for (const url of mirrors) {
    try {
      archive = await download(url, path.join(cacheDir, file))
      break
    } catch (err) {
      log('镜像失败:', err instanceof Error ? err.message : err)
    }
  }
  if (!archive) throw new Error(`无法下载 Node v${version}（${file}）`)
  const extractDir = path.join(cacheDir, 'node-extract')
  rmrf(extractDir)
  ensureDir(extractDir)
  run('tar', ['-xf', archive, '-C', extractDir])
  const extracted = path.join(extractDir, inner)
  if (!fs.existsSync(extracted)) throw new Error(`解压后未找到 Node 目录: ${extracted}`)
  copyDir(extracted, path.join(runtimeRoot, 'node'))
  log(`已内嵌 Node v${version} → runtime/node`)
}

function writeManifest() {
  const manifest = {
    name: 'bidstrat-agent-runtime',
    version: JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version || '1.0.0',
    node: process.env.BIDSTRAT_SKIP_NODE === '1' ? null : process.env.BIDSTRAT_NODE_VERSION?.trim() || '22.14.0',
    builtAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
  }
  fs.writeFileSync(path.join(runtimeRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

async function main() {
  ensureDir(runtimeRoot)
  buildProject()
  stageWeb()
  stageServer()
  await prepareNode()
  writeManifest()
  log('完成 →', runtimeRoot)
}

main().catch((err) => {
  console.error('[prepare-runtime] 失败:', err)
  process.exit(1)
})
