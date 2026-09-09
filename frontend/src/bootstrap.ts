import { workspaceApi, type AppConfig, type UserDescriptions } from './backend'
import './user-descriptions.css'

const CONFIG_KEYS = {
  gamePath: 'rulesmd.gamePath',
  appearance: 'rulesmd.appearance',
  leftPane: 'rulesmd.leftPane',
  rightPane: 'rulesmd.rightPane',
  lastFile: 'rulesmd.lastFile',
} as const

const DEFAULT_CONFIG: AppConfig = {
  gamePath: '',
  appearance: 'dark',
  leftPane: 230,
  rightPane: 390,
  lastFile: '',
  aresEnabled: true,
}

type LocalConfigFields = Pick<AppConfig, 'gamePath' | 'appearance' | 'leftPane' | 'rightPane' | 'lastFile'>

function applyConfigToLocalStorage(config: AppConfig) {
  localStorage.setItem(CONFIG_KEYS.gamePath, config.gamePath || '')
  localStorage.setItem(CONFIG_KEYS.appearance, config.appearance || 'dark')
  localStorage.setItem(CONFIG_KEYS.leftPane, String(config.leftPane || 230))
  localStorage.setItem(CONFIG_KEYS.rightPane, String(config.rightPane || 390))
  localStorage.setItem(CONFIG_KEYS.lastFile, config.lastFile || '')
}

function configFromLocalStorage(): LocalConfigFields {
  const leftPane = Number.parseInt(localStorage.getItem(CONFIG_KEYS.leftPane) || '', 10)
  const rightPane = Number.parseInt(localStorage.getItem(CONFIG_KEYS.rightPane) || '', 10)
  const appearance = localStorage.getItem(CONFIG_KEYS.appearance)
  return {
    gamePath: localStorage.getItem(CONFIG_KEYS.gamePath) || '',
    appearance: appearance === 'light' || appearance === 'system' ? appearance : 'dark',
    leftPane: Number.isFinite(leftPane) ? leftPane : 230,
    rightPane: Number.isFinite(rightPane) ? rightPane : 390,
    lastFile: localStorage.getItem(CONFIG_KEYS.lastFile) || '',
  }
}

function foldedLookup(rows: UserDescriptions, key: string) {
  const folded = key.trim().toLowerCase()
  const entry = Object.entries(rows).find(([name]) => name.toLowerCase() === folded)
  return entry?.[1]?.trim() || ''
}

function installDescriptionEditing(initial: UserDescriptions) {
  let descriptions = { ...initial }
  let applying = false

  async function saveDescription(key: string, value: string, element: HTMLElement) {
    try {
      descriptions = await workspaceApi.setUserDescription(key, value)
      applyOverrides()
    } catch (error) {
      const builtin = element.dataset.builtinLabel || key
      element.textContent = foldedLookup(descriptions, key) || builtin
      element.title = `保存自定义描述失败：${String(error)}`
    }
  }

  function prepareEditableLabel(element: HTMLElement, key: string) {
    if (!element.dataset.builtinLabel) element.dataset.builtinLabel = (element.textContent || key).trim()
    if (!element.dataset.userDescriptionBound) {
      element.dataset.userDescriptionBound = '1'
      element.contentEditable = 'true'
      element.spellcheck = false
      element.setAttribute('role', 'textbox')
      element.setAttribute('aria-label', `${key} 中文描述`)
      element.addEventListener('pointerdown', event => event.stopPropagation())
      element.addEventListener('click', event => event.stopPropagation())
      element.addEventListener('focus', () => {
        element.dataset.editStart = element.textContent || ''
        element.classList.add('editing')
      })
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          element.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          element.textContent = element.dataset.editStart || element.dataset.builtinLabel || key
          element.dataset.cancelEdit = '1'
          element.blur()
        }
      })
      element.addEventListener('blur', () => {
        element.classList.remove('editing')
        if (element.dataset.cancelEdit === '1') {
          delete element.dataset.cancelEdit
          applyOverrides()
          return
        }
        const value = (element.textContent || '').replace(/\s+/g, ' ').trim()
        void saveDescription(key, value, element)
      })
    }
    element.title = '可修改中文描述；修改内容保存到 resources/user-descriptions.json'
  }

  function applyHelpLabel() {
    const focused = document.querySelector('.fieldsPane .parameterTableRow.focused') as HTMLElement | null
    if (!focused) return
    const key = focused.querySelector('.parameterKeyCell code')?.textContent?.trim() || ''
    if (!key) return
    const label = focused.querySelector('.parameterLabelCell strong')?.textContent?.trim() || ''
    const title = document.querySelector('.helpDescriptionCard h3') as HTMLElement | null
    if (title && label && title.textContent !== label) title.textContent = label
  }

  function applyOverrides() {
    if (applying) return
    applying = true
    try {
      const rows = document.querySelectorAll('.fieldsPane .parameterTableRow')
      rows.forEach(row => {
        const key = row.querySelector('.parameterKeyCell code')?.textContent?.trim() || ''
        const label = row.querySelector('.parameterLabelCell strong') as HTMLElement | null
        if (!key || !label) return
        prepareEditableLabel(label, key)
        if (document.activeElement === label) return
        const builtin = label.dataset.builtinLabel || key
        const override = foldedLookup(descriptions, key)
        const wanted = override || builtin
        if (label.textContent !== wanted) label.textContent = wanted
        label.classList.toggle('userDescriptionOverride', Boolean(override))
      })
      applyHelpLabel()
    } finally {
      applying = false
    }
  }

  const observer = new MutationObserver(() => queueMicrotask(applyOverrides))
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  document.addEventListener('click', () => queueMicrotask(applyOverrides), true)
  applyOverrides()
}

async function bootstrap() {
  let config = DEFAULT_CONFIG
  let descriptions: UserDescriptions = {}

  try {
    config = await workspaceApi.getAppConfig()
    applyConfigToLocalStorage(config)
    await workspaceApi.setSettings(config.aresEnabled)
  } catch (error) {
    console.warn('Unable to load resources/app-config.json', error)
  }

  try {
    descriptions = await workspaceApi.getUserDescriptions()
  } catch (error) {
    console.warn('Unable to load resources/user-descriptions.json', error)
  }

  await import('./main')
  installDescriptionEditing(descriptions)

  let lastSerialized = JSON.stringify(configFromLocalStorage())
  window.setInterval(() => {
    const next = configFromLocalStorage()
    const serialized = JSON.stringify(next)
    if (serialized === lastSerialized) return
    lastSerialized = serialized
    void workspaceApi.setAppConfig(next).catch(error => console.warn('Unable to persist resources/app-config.json', error))
  }, 250)
}

void bootstrap()
