import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { allowedOriginFor, resolveRemoteConsoleUrl } from './config.mjs'
import { loadSettings, saveSettings, dataDir } from './settings.mjs'
import { startLocalServer, stopLocalServer } from './local-server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

/** @type {BrowserWindow | null} */
let mainWindow = null

async function applyMode() {
  const settings = loadSettings()
  if (!mainWindow) return
  if (settings.mode === 'remote') {
    const url = resolveRemoteConsoleUrl(settings.remoteUrl)
    await mainWindow.loadURL(url)
    return
  }
  await mainWindow.loadFile(path.join(__dirname, 'loading.html'))
  try {
    const { url } = await startLocalServer()
    await mainWindow.loadURL(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await mainWindow.loadFile(path.join(__dirname, 'error.html'), { query: { message } })
  }
}

function buildMenu() {
  const settings = loadSettings()
  const template = [
    {
      label: '模式',
      submenu: [
        {
          label: '本地一体化（默认）',
          type: 'radio',
          checked: settings.mode === 'local',
          click: async () => {
            saveSettings({ mode: 'local' })
            await applyMode()
          },
        },
        {
          label: `远程控制台（${settings.remoteUrl}）`,
          type: 'radio',
          checked: settings.mode === 'remote',
          click: async () => {
            saveSettings({ mode: 'remote' })
            await applyMode()
          },
        },
        { type: 'separator' },
        {
          label: '设置远程控制台地址…',
          click: async () => {
            const value = await promptRemoteUrl(settings.remoteUrl)
            if (value) {
              saveSettings({ mode: 'remote', remoteUrl: value })
              await applyMode()
            }
          },
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开数据目录',
          click: () => shell.openPath(dataDir()),
        },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于 竞策智能体',
              message: '竞策智能体 · 自进化标书 Agent',
              detail: `桌面端 v${app.getVersion()}\n一个 Agent + 工具集 + 自进化闭环\n\n本地模式数据目录：${dataDir()}`,
              buttons: ['好的'],
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function promptRemoteUrl(current) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 220,
      parent: mainWindow ?? undefined,
      modal: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: '设置远程控制台地址',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    })
    win.removeMenu()
    ipcMain.once('prompt-result', (_e, value) => {
      if (!win.isDestroyed()) win.close()
      resolve(typeof value === 'string' && value.trim() ? value.trim() : null)
    })
    win.on('closed', () => resolve(null))
    win.loadFile(path.join(__dirname, 'prompt.html'), { query: { value: current || '' } })
  })
}

ipcMain.on('desktop-retry', () => {
  applyMode().catch((err) => console.warn('[desktop] 重试失败:', err))
})
ipcMain.on('desktop-open-datadir', () => shell.openPath(dataDir()))

app.whenReady().then(async () => {
  buildMenu()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '竞策智能体',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const settings = loadSettings()
    const origin = settings.mode === 'remote' ? allowedOriginFor(resolveRemoteConsoleUrl(settings.remoteUrl)) : 'http://127.0.0.1'
    if (!url.startsWith(origin)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  await applyMode()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = new BrowserWindow({ width: 1440, height: 900, show: false })
      mainWindow.once('ready-to-show', () => mainWindow?.show())
      await applyMode()
    }
  })
})

app.on('window-all-closed', () => {
  stopLocalServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => stopLocalServer())
