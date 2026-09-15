/** 桌面远程模式默认控制台地址（可通过 BIDSTRAT_CONSOLE_URL 或设置中的 remoteUrl 覆盖） */
export const DEFAULT_CONSOLE_URL = 'http://localhost:3000'

export function resolveRemoteConsoleUrl(preferred) {
  const fromEnv = process.env.BIDSTRAT_CONSOLE_URL?.trim()
  const candidate = (fromEnv || preferred || DEFAULT_CONSOLE_URL).trim()
  try {
    return new URL(candidate).href
  } catch {
    console.warn('[desktop] 无效的控制台地址，使用默认值')
    return DEFAULT_CONSOLE_URL
  }
}

/** 允许在应用内跳转的 origin（与起始 URL 一致，避免外链在 WebView 内打开） */
export function allowedOriginFor(urlString) {
  try {
    return new URL(urlString).origin
  } catch {
    return new URL(DEFAULT_CONSOLE_URL).origin
  }
}
