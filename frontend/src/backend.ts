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

export type CreateUnitRequest = {
  template: string
  section: string
  comment: string
  values: Array<{ key: string; value: string }>
}

export type CreateUnitResult = {
  snapshot: WorkspaceSnapshot
  section: SectionData
  registration_id: string
  root: string
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
const inFlightValueWrites = new Map<number, Promise<SetValueResult>>()
const latestValuePromises = new Map<number, Promise<SetValueResult>>()

const VALUE_EDIT_WINDOW_MS = 32

async function flushValueEdit(lineId: number): Promise<SetValueResult | null> {
  const pending = pendingValueEdits.get(lineId)
  if (!pending) return null
  pendingValueEdits.delete(lineId)
  if (pending.timer) clearTimeout(pending.timer)

  const previous = inFlightValueWrites.get(lineId)
  const write = (previous ? previous.catch(() => undefined) : Promise.resolve(undefined))
    .then(() => call<SetValueResult>('set_value', { line_id: lineId, value: pending.value }))
  inFlightValueWrites.set(lineId, write)

  try {
    const result = await write
    if (inFlightValueWrites.get(lineId) === write) inFlightValueWrites.delete(lineId)

    const latestPromise = latestValuePromises.get(lineId)
    if (latestPromise && latestPromise !== pending.promise) {
      latestPromise.then(pending.resolve, pending.reject)
    } else {
      if (latestPromise === pending.promise) latestValuePromises.delete(lineId)
      pending.resolve(result)
    }
    return result
  } catch (error) {
    if (inFlightValueWrites.get(lineId) === write) inFlightValueWrites.delete(lineId)
    if (latestValuePromises.get(lineId) === pending.promise) latestValuePromises.delete(lineId)
    pending.reject(error)
    throw error
  }
}

export async function flushPendingValues(): Promise<void> {
  while (pendingValueEdits.size || inFlightValueWrites.size) {
    const lineIds = [...pendingValueEdits.keys()]
    if (lineIds.length) await Promise.all(lineIds.map(lineId => flushValueEdit(lineId)))
    const flights = [...inFlightValueWrites.values()]
    if (flights.length) await Promise.all(flights)
  }
}

function queueValueEdit(lineId: number, value: string): Promise<SetValueResult> {
  const current = pendingValueEdits.get(lineId)
  if (current) {
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
  latestValuePromises.set(lineId, promise)
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
  createUnit: async (request: CreateUnitRequest) => {
    await flushPendingValues()
    return call<CreateUnitResult>('create_unit', request)
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

void workspaceApi.status().catch(() => undefined)
