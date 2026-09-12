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

function clamp(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)))
}

async function backendCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

async function persistWindowSize() {
  const appWindow = getCurrentWindow()
  if (await appWindow.isMaximized()) return

  const width = clamp(window.innerWidth, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH)
  const height = clamp(window.innerHeight, DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT)

  localStorage.setItem(WIDTH_KEY, String(width))
  localStorage.setItem(HEIGHT_KEY, String(height))

  await backendCall<WindowConfig>('set_app_config', {
    values: { windowWidth: width, windowHeight: height },
  })
}

async function installWindowState() {
  const appWindow = getCurrentWindow()
  const config = await backendCall<WindowConfig>('get_app_config')
  const width = clamp(config.windowWidth, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH)
  const height = clamp(config.windowHeight, DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT)

  localStorage.setItem(WIDTH_KEY, String(width))
  localStorage.setItem(HEIGHT_KEY, String(height))
  await appWindow.setSize(new LogicalSize(width, height))

  let resizeTimer: ReturnType<typeof window.setTimeout> | null = null
  const schedulePersist = () => {
    if (resizeTimer != null) window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null
      void persistWindowSize().catch(error => console.warn('Unable to persist window size', error))
    }, 120)
  }

  window.addEventListener('resize', schedulePersist, { passive: true })
  window.addEventListener('focus', schedulePersist, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void persistWindowSize().catch(error => console.warn('Unable to persist window size', error))
    }
  })
  await appWindow.onCloseRequested(() => {
    void persistWindowSize().catch(error => console.warn('Unable to persist window size before close', error))
  })
}

void installWindowState().catch(error => console.warn('Unable to restore window size', error))
