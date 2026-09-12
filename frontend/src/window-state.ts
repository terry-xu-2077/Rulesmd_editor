import { LogicalSize } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

type WindowConfig = {
  windowWidth?: number
  windowHeight?: number
}

const DEFAULT_WIDTH = 1680
const DEFAULT_HEIGHT = 1020
const MIN_WIDTH = 1120
const MIN_HEIGHT = 680
const MAX_WIDTH = 7680
const MAX_HEIGHT = 4320
const WIDTH_KEY = 'rulesmd.windowWidth'
const HEIGHT_KEY = 'rulesmd.windowHeight'
const BACKEND_RETRY_MS = 150
const BACKEND_RETRY_COUNT = 80

function clamp(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)))
}

function sleep(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}

async function backendCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

async function backendCallWithRetry<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < BACKEND_RETRY_COUNT; attempt += 1) {
    try {
      return await backendCall<T>(method, params)
    } catch (error) {
      lastError = error
      await sleep(BACKEND_RETRY_MS)
    }
  }
  throw lastError ?? new Error(`Backend unavailable for ${method}`)
}

function readCurrentLogicalSize() {
  return {
    width: clamp(window.innerWidth, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH),
    height: clamp(window.innerHeight, DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT),
  }
}

function cacheSize(width: number, height: number) {
  localStorage.setItem(WIDTH_KEY, String(width))
  localStorage.setItem(HEIGHT_KEY, String(height))
}

async function persistWindowSize() {
  const appWindow = getCurrentWindow()
  if (await appWindow.isMaximized()) return

  const { width, height } = readCurrentLogicalSize()
  cacheSize(width, height)

  await backendCallWithRetry<WindowConfig>('set_app_config', {
    values: { windowWidth: width, windowHeight: height },
  })
}

async function installWindowState() {
  const appWindow = getCurrentWindow()
  let resizeTimer: ReturnType<typeof window.setTimeout> | null = null
  let readyForPersistence = false
  let userResizedBeforeRestore = false
  let suppressResize = false

  const schedulePersist = (delay = 180) => {
    if (resizeTimer != null) window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null
      void persistWindowSize().catch(error => console.warn('Unable to persist window size', error))
    }, delay)
  }

  // Install listeners before waiting for Python. In dev mode the WebView can be ready
  // before the backend RPC process; the old implementation awaited get_app_config first,
  // so one startup race permanently skipped every resize listener for that session.
  window.addEventListener('resize', () => {
    if (suppressResize) return
    if (!readyForPersistence) {
      userResizedBeforeRestore = true
      return
    }
    schedulePersist()
  }, { passive: true })

  window.addEventListener('focus', () => {
    if (readyForPersistence) schedulePersist(60)
  }, { passive: true })

  document.addEventListener('visibilitychange', () => {
    if (readyForPersistence && document.visibilityState === 'hidden') {
      void persistWindowSize().catch(error => console.warn('Unable to persist window size', error))
    }
  })

  await appWindow.onCloseRequested(() => {
    if (!readyForPersistence) return
    // Resize persistence normally completed long before close. Keep this as a final
    // best-effort flush, but correctness no longer depends on the close callback winning
    // a race against WebView teardown.
    void persistWindowSize().catch(error => console.warn('Unable to persist window size before close', error))
  })

  try {
    const config = await backendCallWithRetry<WindowConfig>('get_app_config')
    const width = clamp(config.windowWidth, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH)
    const height = clamp(config.windowHeight, DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT)

    if (!userResizedBeforeRestore) {
      cacheSize(width, height)
      suppressResize = true
      await appWindow.setSize(new LogicalSize(width, height))
      window.setTimeout(() => { suppressResize = false }, 300)
    }
  } catch (error) {
    console.warn('Unable to restore window size from backend config', error)
  } finally {
    readyForPersistence = true
    if (userResizedBeforeRestore) schedulePersist(0)
  }
}

void installWindowState().catch(error => console.warn('Unable to install window state handling', error))
