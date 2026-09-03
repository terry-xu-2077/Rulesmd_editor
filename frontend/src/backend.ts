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
    items: Array<{ section: string; registration_id: string | null }>
  }>
}

export type OptionValue = { value: string; label: string }
export type WidgetType = 'boolean' | 'select' | 'multi-select' | 'slider' | 'text'

export type SectionOption = {
  line_id: number
  key: string
  value: string
  suffix: string
  label: string
  description: string
  category: string
  source: string
  value_type: string
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
}

async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

export const workspaceApi = {
  status: () => invoke<{ desktop: string; python: string }>('backend_status'),
  pickFile: () => invoke<string | null>('pick_rules_file'),
  pickSaveFile: (defaultName = 'rulesmd.ini') => invoke<string | null>('pick_save_file', { defaultName }),
  openFile: (path: string) => call<WorkspaceSnapshot>('open_file', { path }),
  newDocument: () => call<WorkspaceSnapshot>('new_document'),
  snapshot: () => call<WorkspaceSnapshot>('snapshot'),
  section: (section: string) => call<SectionData>('section', { section }),
  setValue: (lineId: number, value: string) => call('set_value', { line_id: lineId, value }),
  addOption: (section: string, key: string, value?: string) => call('add_option', { section, key, value }),
  removeLine: (lineId: number) => call('remove_line', { line_id: lineId }),
  save: (path?: string) => call<{ path: string; dirty: boolean }>('save', { path }),
  rawText: () => call<string>('raw_text'),
  optionCatalog: (query = '', appliesTo?: string) => call<CatalogOption[]>('option_catalog', { query, applies_to: appliesTo }),
  setSettings: (aresEnabled: boolean) => call<{ ares_enabled: boolean }>('set_settings', { ares_enabled: aresEnabled }),
}
