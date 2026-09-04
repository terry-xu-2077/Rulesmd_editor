import { invoke } from '@tauri-apps/api/core'

export type DocumentInfo = {
  path: string | null
  encoding: string
  newline: 'CRLF' | 'LF'
  final_newline: boolean
  dirty: boolean
  section_count: number
}

export type WorkspaceSnapshot = {
  document: DocumentInfo
  settings: { ares_enabled: boolean }
  categories: Array<{
    name: string
    items: Array<{ section: string; registration_id: string | null; label?: string; side?: 'allied' | 'soviet' | 'yuri' | 'neutral' }>
  }>
}

export type OptionValue = { value: string; label: string }
export type WidgetType = 'boolean' | 'select' | 'multi-select' | 'slider' | 'text'

export type SectionOption = {
  line_id: number
  key: string
  value: string
  raw_value?: string | null
  suffix: string
  label: string
  description: string
  category: string
  source: string
  value_type: string
  semantic_type?: string
  widget?: WidgetType
  values: OptionValue[]
  docs: string
}

export type SectionData = {
  section: string
  description: string
  options: SectionOption[]
  raw: string
  references: Array<{ section: string; key: string }>
}

export type SetValueResult = {
  line_id: number
  section: string
  key: string
  value: string
  raw_value?: string | null
  raw: string
  dirty: boolean
}

export type CatalogOption = {
  key: string
  label: string
  description: string
  category: string
  source: string
  value_type: string
  applies_to: string[]
  default: string
  values: OptionValue[]
  docs: string
  compatible?: boolean
}

async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

type PendingValueEdit = {
  value: string
  timer: ReturnType<typeof setTimeout> | null
  promise: Promise<SetValueResult>
  resolve: (result: SetValueResult) => void
  reject: (error: unknown) => void
}

const pendingValueEdits = new Map<number, PendingValueEdit>()

// A short coalescing window keeps slider drags from flooding the Python bridge while
// avoiding the old 120 ms debounce that made discrete controls feel delayed. This is a
// throttle window, not a debounce: repeated input never keeps pushing the write farther
// into the future.
const VALUE_EDIT_WINDOW_MS = 32

async function flushValueEdit(lineId: number): Promise<SetValueResult | null> {
  const pending = pendingValueEdits.get(lineId)
  if (!pending) return null
  pendingValueEdits.delete(lineId)
  if (pending.timer) clearTimeout(pending.timer)
  try {
    const result = await call<SetValueResult>('set_value', { line_id: lineId, value: pending.value })
    pending.resolve(result)
    return result
  } catch (error) {
    pending.reject(error)
    throw error
  }
}

export async function flushPendingValues(): Promise<void> {
  const lineIds = [...pendingValueEdits.keys()]
  if (!lineIds.length) return
  await Promise.all(lineIds.map(lineId => flushValueEdit(lineId)))
}

function queueValueEdit(lineId: number, value: string): Promise<SetValueResult> {
  const current = pendingValueEdits.get(lineId)
  if (current) {
    // Latest value wins inside the current fixed window. Do not reset the timer: that
    // was the source of the visible interaction latency in the previous debounce design.
    current.value = value
    return current.promise
  }

  let resolvePromise!: (result: SetValueResult) => void
  let rejectPromise!: (error: unknown) => void
  const promise = new Promise<SetValueResult>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  const pending: PendingValueEdit = {
    value,
    resolve: resolvePromise,
    reject: rejectPromise,
    promise,
    timer: null,
  }
  pending.timer = setTimeout(() => { void flushValueEdit(lineId) }, VALUE_EDIT_WINDOW_MS)
  pendingValueEdits.set(lineId, pending)
  return promise
}

export const workspaceApi = {
  status: () => invoke<{ desktop: string; python: string }>('backend_status'),
  pickFile: () => invoke<string | null>('pick_rules_file'),
  pickSaveFile: (defaultName = 'rulesmd.ini') => invoke<string | null>('pick_save_file', { defaultName }),
  pickGameExecutable: () => invoke<string | null>('pick_game_executable'),
  launchGame: (path: string) => invoke<void>('launch_game', { path }),
  openFile: async (path: string) => {
    await flushPendingValues()
    return call<WorkspaceSnapshot>('open_file', { path })
  },
  newDocument: async () => {
    await flushPendingValues()
    return call<WorkspaceSnapshot>('new_document')
  },
  snapshot: () => call<WorkspaceSnapshot>('snapshot'),
  section: async (section: string) => {
    await flushPendingValues()
    return call<SectionData>('section', { section })
  },
  setValue: (lineId: number, value: string) => queueValueEdit(lineId, value),
  flushPendingValues,
  addOption: async (section: string, key: string, value?: string) => {
    await flushPendingValues()
    return call('add_option', { section, key, value })
  },
  removeLine: async (lineId: number) => {
    await flushPendingValues()
    return call('remove_line', { line_id: lineId })
  },
  save: async (path?: string) => {
    await flushPendingValues()
    return call<{ path: string; dirty: boolean }>('save', { path })
  },
  rawText: async () => {
    await flushPendingValues()
    return call<string>('raw_text')
  },
  optionCatalog: (query = '', section?: string, appliesTo?: string) => call<CatalogOption[]>('option_catalog_all', { query, section, applies_to: appliesTo }),
  setSettings: (aresEnabled: boolean) => call<{ ares_enabled: boolean }>('set_settings', { ares_enabled: aresEnabled }),
}

// Hide Python/schema startup behind normal UI paint and the time the user spends choosing
// a file. Failure is intentionally silent here; the real command still reports a useful
// error if the backend is unavailable when the user actually needs it.
void workspaceApi.status().catch(() => undefined)
