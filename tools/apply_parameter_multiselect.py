from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


# frontend/src/backend.ts
path = Path("frontend/src/backend.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    """export type LineActionResult = {
  section: SectionData
  dirty: boolean
}

export type CatalogOption = {""",
    """export type LineActionResult = {
  section: SectionData
  dirty: boolean
}

export type CopiedParameterPayload = {
  key: string
  value: string
  suffix?: string
  disabled?: boolean
}

export type PasteOptionsResult = LineActionResult & {
  added: number
  overwritten: number
  line_ids: number[]
}

export type CatalogOption = {""",
    "backend result types",
)
text = replace_once(
    text,
    """  addOption: async (section: string, key: string, value?: string) => {
    await flushPendingValues()
    return call('add_option', { section, key, value })
  },
  createUnit: async (request: CreateUnitRequest) => {""",
    """  addOption: async (section: string, key: string, value?: string) => {
    await flushPendingValues()
    return call('add_option', { section, key, value })
  },
  pasteOptions: async (section: string, items: CopiedParameterPayload[]) => {
    await flushPendingValues()
    return call<PasteOptionsResult>('paste_options', { section, items })
  },
  createUnit: async (request: CreateUnitRequest) => {""",
    "backend paste api",
)
path.write_text(text, encoding="utf-8")


# src/rulesmd_editor/bridge.py
path = Path("src/rulesmd_editor/bridge.py")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    """    def rpc_add_option(self, section: str, key: str, value: str | None = None) -> dict:
        return self.workspace.add_option(section, key, value)

    def rpc_create_unit(""",
    """    def rpc_add_option(self, section: str, key: str, value: str | None = None) -> dict:
        return self.workspace.add_option(section, key, value)

    def rpc_paste_options(self, section: str, items: list[dict] | None = None) -> dict:
        target = section.strip()
        if not target:
            raise ValueError("Section 不能为空")
        if is_global_rule_section(target):
            raise ValueError("全局规则暂不支持参数批量粘贴")

        doc = self.workspace._doc()
        actual = doc._section_name(target)
        if actual is None:
            raise KeyError(f"Unknown section: {section}")

        states = {state.key.casefold(): state for state in section_option_states(doc, actual)}
        added = 0
        overwritten = 0
        line_ids: list[int] = []

        for payload in items or []:
            key = str(payload.get("key") or "").strip()
            if not key:
                continue
            value = str(payload.get("value") or "")
            suffix = str(payload.get("suffix") or "")
            disabled = bool(payload.get("disabled", False))
            existing = states.get(key.casefold())

            if existing is None:
                line_id = doc.set(actual, key, value)
                line = doc.line(line_id)
                if line is None:
                    raise KeyError(f"Unable to create parameter: {key}")
                line.suffix = suffix
                if disabled:
                    set_line_disabled(doc, line_id, True)
                added += 1
            else:
                line_id = existing.line_id
                apply_option_state(doc, line_id, OptionLineState(
                    line_id=line_id,
                    section=actual,
                    key=key,
                    value=value,
                    prefix=existing.prefix,
                    separator=existing.separator,
                    suffix=suffix,
                    disabled=disabled,
                ))
                overwritten += 1

            line_ids.append(line_id)
            refreshed = option_line_state(doc.line(line_id)) if doc.line(line_id) is not None else None
            if refreshed is not None:
                states[key.casefold()] = refreshed

        self.workspace._changed_value_ids = {
            line.line_id
            for line in doc.lines
            if line.kind == "key"
            and line.line_id in self.workspace._original_values
            and (line.value or "") != self.workspace._original_values[line.line_id]
        }
        self.workspace._rebuild_indexes()
        self._sync_structural_dirty()
        result = self._line_action_result(actual)
        result.update({
            "added": added,
            "overwritten": overwritten,
            "line_ids": line_ids,
        })
        return result

    def rpc_create_unit(""",
    "bridge paste rpc",
)
path.write_text(text, encoding="utf-8")


# frontend/src/main.tsx
path = Path("frontend/src/main.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    """type ObservedValueIndex = { byKey: Record<string, string[]>; audio: string[] }
type LocalEditorSettings = {""",
    """type ObservedValueIndex = { byKey: Record<string, string[]>; audio: string[] }
type CopiedParameter = { key: string; value: string; suffix: string; disabled: boolean }
type ParameterClipboard = { sourceSection: string; items: CopiedParameter[] }
type LocalEditorSettings = {""",
    "main clipboard types",
)
text = replace_once(
    text,
    """  const [sectionData, setSectionData] = useState<SectionData>(EMPTY_SECTION)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [unitSearch, setUnitSearch] = useState('')""",
    """  const [sectionData, setSectionData] = useState<SectionData>(EMPTY_SECTION)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<number>>(() => new Set())
  const [selectionAnchorId, setSelectionAnchorId] = useState<number | null>(null)
  const [unitSearch, setUnitSearch] = useState('')""",
    "main selection states",
)
text = replace_once(
    text,
    """  const [viewMode, setViewMode] = useState<EditorViewMode>('table')
  const [parameterMenu, setParameterMenu] = useState<ParameterContextMenuState | null>(null)
  const [pendingDeleteLineId, setPendingDeleteLineId] = useState<number | null>(null)
  const [leftPane, setLeftPane] = useState(() => storedPaneWidth('rulesmd.leftPane', 230))""",
    """  const [viewMode, setViewMode] = useState<EditorViewMode>('table')
  const [parameterMenu, setParameterMenu] = useState<ParameterContextMenuState | null>(null)
  const [parameterClipboard, setParameterClipboard] = useState<ParameterClipboard | null>(null)
  const [pendingDeleteLineIds, setPendingDeleteLineIds] = useState<number[]>([])
  const [leftPane, setLeftPane] = useState(() => storedPaneWidth('rulesmd.leftPane', 230))""",
    "main menu states",
)
text = replace_once(
    text,
    """  }, [groups, sectionData.section, visibleFields])
  const selectedOption = sectionData.options.find(option => option.line_id === selectedOptionId) ?? sectionData.options[0]
  const contextOption = parameterMenu ? sectionData.options.find(option => option.line_id === parameterMenu.lineId) ?? null : null
  const pendingDeleteOption = pendingDeleteLineId == null ? null : sectionData.options.find(option => option.line_id === pendingDeleteLineId) ?? null
  const previousSection = navigation.index > 0 ? navigation.items[navigation.index - 1] : null""",
    """  }, [groups, sectionData.section, visibleFields])
  const selectableOptions = useMemo(() => groupedFields.flatMap(([group, list]) =>
    activeGroup !== '全部' || !collapsed[group] ? list : []
  ), [activeGroup, collapsed, groupedFields])
  const selectedOption = sectionData.options.find(option => option.line_id === selectedOptionId) ?? sectionData.options[0]
  const selectedOptions = sectionData.options.filter(option => selectedOptionIds.has(option.line_id))
  const contextOption = parameterMenu?.lineId != null ? sectionData.options.find(option => option.line_id === parameterMenu.lineId) ?? null : null
  const contextOptions = parameterMenu
    ? (contextOption && selectedOptionIds.has(contextOption.line_id) ? selectedOptions : contextOption ? [contextOption] : [])
    : []
  const pendingDeleteOptions = pendingDeleteLineIds
    .map(lineId => sectionData.options.find(option => option.line_id === lineId) ?? null)
    .filter((option): option is SectionOption => option !== null)
  const pendingDeleteOption = pendingDeleteOptions[0] ?? null
  const previousSection = navigation.index > 0 ? navigation.items[navigation.index - 1] : null""",
    "main derived selection",
)
text = replace_once(
    text,
    """  async function loadSection(row: SectionRow) {
""",
    """  function setSingleParameterSelection(lineId: number | null) {
    setSelectedOptionId(lineId)
    setSelectedOptionIds(lineId == null ? new Set() : new Set([lineId]))
    setSelectionAnchorId(lineId)
  }

  function selectParameterRow(event: React.MouseEvent, option: SectionOption) {
    const lineId = option.line_id
    setSelectedOptionId(lineId)

    if (event.shiftKey && selectionAnchorId != null) {
      const anchorIndex = selectableOptions.findIndex(item => item.line_id === selectionAnchorId)
      const currentIndex = selectableOptions.findIndex(item => item.line_id === lineId)
      if (anchorIndex >= 0 && currentIndex >= 0) {
        const start = Math.min(anchorIndex, currentIndex)
        const end = Math.max(anchorIndex, currentIndex)
        const range = selectableOptions.slice(start, end + 1).map(item => item.line_id)
        setSelectedOptionIds(current => (event.ctrlKey || event.metaKey) ? new Set([...current, ...range]) : new Set(range))
        return
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedOptionIds(current => {
        const next = new Set(current)
        if (next.has(lineId)) next.delete(lineId)
        else next.add(lineId)
        return next
      })
      setSelectionAnchorId(lineId)
      return
    }

    setSingleParameterSelection(lineId)
  }

  function openParameterRowMenu(event: React.MouseEvent, option: SectionOption) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedOptionId(option.line_id)
    if (!selectedOptionIds.has(option.line_id)) {
      setSelectedOptionIds(new Set([option.line_id]))
      setSelectionAnchorId(option.line_id)
    }
    setParameterMenu({ lineId: option.line_id, x: event.clientX, y: event.clientY })
  }

  function openParameterPaneMenu(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest('.parameterTableRow')) return
    event.preventDefault()
    setParameterMenu({ lineId: null, x: event.clientX, y: event.clientY })
  }

  async function loadSection(row: SectionRow) {
""",
    "main selection helpers",
)
text = text.replace(
    "setSelectedOptionId(cached.options[0]?.line_id ?? null)",
    "setSingleParameterSelection(cached.options[0]?.line_id ?? null)",
)
text = text.replace(
    "setSelectedOptionId(data.options[0]?.line_id ?? null)",
    "setSingleParameterSelection(data.options[0]?.line_id ?? null)",
)
text = replace_once(
    text,
    """    setActiveGroup('全部')
    setParameterMenu(null)
    setPendingDeleteLineId(null)
    setNavigation({ items: [], index: -1 })
    setSelected(null)
    setSectionData(EMPTY_SECTION)
    setRawDraft('')
    setSelectedOptionId(null)
    setDocumentEpoch(value => value + 1)""",
    """    setActiveGroup('全部')
    setParameterMenu(null)
    setParameterClipboard(null)
    setPendingDeleteLineIds([])
    setNavigation({ items: [], index: -1 })
    setSelected(null)
    setSectionData(EMPTY_SECTION)
    setRawDraft('')
    setSingleParameterSelection(null)
    setDocumentEpoch(value => value + 1)""",
    "main document reset",
)
text = replace_once(
    text,
    """    setSelectedOptionId(current => {
      if (preferredLineId != null && result.section.options.some(option => option.line_id === preferredLineId)) return preferredLineId
      if (current != null && result.section.options.some(option => option.line_id === current)) return current
      return result.section.options[0]?.line_id ?? null
    })
    const next = await workspaceApi.snapshot()""",
    """    setSelectedOptionId(current => {
      if (preferredLineId != null && result.section.options.some(option => option.line_id === preferredLineId)) return preferredLineId
      if (current != null && result.section.options.some(option => option.line_id === current)) return current
      return result.section.options[0]?.line_id ?? null
    })
    setSelectedOptionIds(current => {
      const valid = new Set(result.section.options.map(option => option.line_id))
      return new Set([...current].filter(lineId => valid.has(lineId)))
    })
    setSelectionAnchorId(current => current != null && result.section.options.some(option => option.line_id === current) ? current : null)
    const next = await workspaceApi.snapshot()""",
    "main preserve selection",
)

old_actions = """  async function toggleParameterDisabled(option: SectionOption) {
    try {
      const result = await workspaceApi.setLineDisabled(option.line_id, !option.disabled)
      await applyLineActionResult(result, option.line_id)
      setStatus(`${option.disabled ? '已启用' : '已禁用'} ${sectionData.section}.${option.key}`)
    } catch (error) {
      setStatus(`参数状态修改失败：${String(error)}`)
    }
  }

  async function restoreParameter(option: SectionOption) {
    try {
      const result = await workspaceApi.restoreLine(option.line_id)
      await applyLineActionResult(result, option.line_id)
      setStatus(`已还原 ${sectionData.section}.${option.key} 到打开文件时的状态`)
    } catch (error) {
      setStatus(`还原参数失败：${String(error)}`)
    }
  }

  async function deletePendingParameter() {
    const option = pendingDeleteOption
    if (!option) return
    try {
      const result = await workspaceApi.removeLine(option.line_id)
      setPendingDeleteLineId(null)
      await applyLineActionResult(result, null)
      setStatus(`已删除 ${sectionData.section}.${option.key}`)
    } catch (error) {
      setStatus(`删除参数失败：${String(error)}`)
    }
  }
"""
new_actions = """  async function setParametersDisabled(options: SectionOption[], disabled: boolean) {
    if (!options.length) return
    try {
      let result: LineActionResult | null = null
      for (const option of options) {
        if (Boolean(option.disabled) === disabled) continue
        result = await workspaceApi.setLineDisabled(option.line_id, disabled)
      }
      if (result) await applyLineActionResult(result, options[0]?.line_id ?? null)
      setStatus(`${disabled ? '已禁用' : '已启用'} ${options.length} 个参数`)
    } catch (error) {
      setStatus(`参数状态修改失败：${String(error)}`)
    }
  }

  async function restoreParameters(options: SectionOption[]) {
    if (!options.length) return
    try {
      let result: LineActionResult | null = null
      for (const option of options) result = await workspaceApi.restoreLine(option.line_id)
      if (result) await applyLineActionResult(result, null)
      setStatus(`已还原 ${options.length} 个参数到打开文件时的状态`)
    } catch (error) {
      setStatus(`还原参数失败：${String(error)}`)
    }
  }

  function copyParameters(options: SectionOption[]) {
    if (!options.length) return
    const ids = new Set(options.map(option => option.line_id))
    const ordered = sectionData.options.filter(option => ids.has(option.line_id))
    const items = ordered.map(option => ({
      key: option.key,
      value: option.value,
      suffix: option.suffix || '',
      disabled: Boolean(option.disabled),
    }))
    setParameterClipboard({ sourceSection: sectionData.section, items })
    const plainText = items.map(item => `${item.disabled ? ';@rulesmd-disabled ' : ''}${item.key}=${item.value}${item.suffix}`).join('\n')
    void navigator.clipboard?.writeText(plainText).catch(() => undefined)
    setStatus(`已复制 ${items.length} 个参数，可切换到其他单位后右键粘贴`)
  }

  async function pasteParameters() {
    if (!selected || !parameterClipboard?.items.length) return
    try {
      const result = await workspaceApi.pasteOptions(selected.id, parameterClipboard.items)
      await applyLineActionResult(result, result.line_ids[0] ?? null)
      setSelectedOptionIds(new Set(result.line_ids))
      setSelectionAnchorId(result.line_ids[0] ?? null)
      if (result.line_ids[0] != null) setSelectedOptionId(result.line_ids[0])
      setStatus(`已从 [${parameterClipboard.sourceSection}] 粘贴 ${result.line_ids.length} 个参数：新增 ${result.added}，覆盖 ${result.overwritten}`)
    } catch (error) {
      setStatus(`粘贴参数失败：${String(error)}`)
    }
  }

  async function deletePendingParameters() {
    if (!pendingDeleteLineIds.length) return
    try {
      let result: LineActionResult | null = null
      for (const lineId of pendingDeleteLineIds) result = await workspaceApi.removeLine(lineId)
      const count = pendingDeleteLineIds.length
      setPendingDeleteLineIds([])
      if (result) await applyLineActionResult(result, null)
      setStatus(`已删除 ${count} 个参数`)
    } catch (error) {
      setStatus(`删除参数失败：${String(error)}`)
    }
  }
"""
text = replace_once(text, old_actions, new_actions, "main context actions")
text = replace_once(
    text,
    """      const added = [...data.options].reverse().find(item => item.key === option.key)
      setSelectedOptionId(added?.line_id ?? data.options[0]?.line_id ?? null)""",
    """      const added = [...data.options].reverse().find(item => item.key === option.key)
      setSingleParameterSelection(added?.line_id ?? data.options[0]?.line_id ?? null)""",
    "main added option selection",
)
text = replace_once(
    text,
    """      setSectionData(result.section)
      setRawDraft(result.section.raw)
      setSelectedOptionId(result.section.options[0]?.line_id ?? null)
      setActiveGroup('全部')""",
    """      setSectionData(result.section)
      setRawDraft(result.section.raw)
      setSingleParameterSelection(result.section.options[0]?.line_id ?? null)
      setActiveGroup('全部')""",
    "main created unit selection",
)
text = replace_once(
    text,
    """          {viewMode === 'table' ? <section className="fieldsPane parameterTablePane" onContextMenu={event => { if (!(event.target as HTMLElement).closest('.parameterTableRow')) event.preventDefault() }}>""",
    """          {viewMode === 'table' ? <section className="fieldsPane parameterTablePane" onContextMenu={openParameterPaneMenu}>""",
    "main pane context menu",
)
text = replace_once(
    text,
    """                const changed = option.raw_value == null
                  ? true
                  : option.value !== option.raw_value || Boolean(option.disabled) !== Boolean(option.raw_disabled)
                const focused = selectedOption?.line_id === option.line_id
                const target = referenceTarget(option)
                const candidates = referenceRows(option)
                return <div
                  className={`parameterTableRow ${focused ? 'focused' : ''} ${changed ? 'changed' : ''} ${option.disabled ? 'disabled' : ''}`}
                  key={option.line_id}
                  onClick={() => setSelectedOptionId(option.line_id)}
                  onContextMenu={event => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSelectedOptionId(option.line_id)
                    setParameterMenu({ lineId: option.line_id, x: event.clientX, y: event.clientY })
                  }}
                >""",
    """                const changed = option.raw_value == null
                  ? true
                  : option.value !== option.raw_value || Boolean(option.disabled) !== Boolean(option.raw_disabled)
                const focused = selectedOption?.line_id === option.line_id
                const selectedRow = selectedOptionIds.has(option.line_id)
                const target = referenceTarget(option)
                const candidates = referenceRows(option)
                return <div
                  className={`parameterTableRow ${selectedRow ? 'selected' : ''} ${focused ? 'focused' : ''} ${changed ? 'changed' : ''} ${option.disabled ? 'disabled' : ''}`}
                  key={option.line_id}
                  onClick={event => selectParameterRow(event, option)}
                  onContextMenu={event => openParameterRowMenu(event, option)}
                >""",
    "main row selection",
)
text = replace_once(
    text,
    """    <ParameterContextMenu
      state={parameterMenu}
      option={contextOption}
      onClose={() => setParameterMenu(null)}
      onToggleDisabled={option => void toggleParameterDisabled(option)}
      onRestore={option => void restoreParameter(option)}
      onDelete={option => setPendingDeleteLineId(option.line_id)}
    />""",
    """    <ParameterContextMenu
      state={parameterMenu}
      options={contextOptions}
      section={sectionData.section}
      clipboardCount={parameterClipboard?.items.length ?? 0}
      onClose={() => setParameterMenu(null)}
      onSetDisabled={(options, disabled) => void setParametersDisabled(options, disabled)}
      onRestore={options => void restoreParameters(options)}
      onDelete={options => setPendingDeleteLineIds(options.map(option => option.line_id))}
      onCopy={copyParameters}
      onPaste={() => void pasteParameters()}
    />""",
    "main context component",
)
text = replace_once(
    text,
    """    <Dialog open={Boolean(pendingDeleteOption)} title="删除参数" icon={<Trash2 size={18}/>} onClose={() => setPendingDeleteLineId(null)}>
      <div className="closePrompt"><p>确定从 [{sectionData.section}] 删除参数 <strong>{pendingDeleteOption?.label || pendingDeleteOption?.key}</strong>（{pendingDeleteOption?.key}）吗？</p><div className="closePromptActions"><Button className="quietDanger" onClick={() => void deletePendingParameter()}>删除</Button><Button className="quietButton" onClick={() => setPendingDeleteLineId(null)}>取消</Button></div></div>
    </Dialog>""",
    """    <Dialog open={pendingDeleteLineIds.length > 0} title="删除参数" icon={<Trash2 size={18}/>} onClose={() => setPendingDeleteLineIds([])}>
      <div className="closePrompt"><p>{pendingDeleteOptions.length > 1 ? <>确定从 [{sectionData.section}] 删除所选 <strong>{pendingDeleteOptions.length}</strong> 个参数吗？</> : <>确定从 [{sectionData.section}] 删除参数 <strong>{pendingDeleteOption?.label || pendingDeleteOption?.key}</strong>（{pendingDeleteOption?.key}）吗？</>}</p><div className="closePromptActions"><Button className="quietDanger" onClick={() => void deletePendingParameters()}>删除</Button><Button className="quietButton" onClick={() => setPendingDeleteLineIds([])}>取消</Button></div></div>
    </Dialog>""",
    "main delete dialog",
)
path.write_text(text, encoding="utf-8")


# frontend/src/parameter-context-menu.css
path = Path("frontend/src/parameter-context-menu.css")
text = path.read_text(encoding="utf-8")
text = text.replace("width:220px", "width:236px", 1)
text += """
.parameterTableRow.selected{background:linear-gradient(90deg,color-mix(in srgb,var(--theme-effect) 17%,var(--theme-surface-1)),color-mix(in srgb,var(--theme-effect) 8%,var(--theme-surface-1)))!important;box-shadow:inset 3px 0 0 color-mix(in srgb,var(--theme-effect) 74%,transparent)!important}
.parameterTableRow.selected.focused{background:linear-gradient(90deg,color-mix(in srgb,var(--theme-effect) 26%,var(--theme-surface-1)),color-mix(in srgb,var(--theme-effect) 13%,var(--theme-surface-1)) 58%,var(--theme-accent-soft))!important;box-shadow:inset 4px 0 0 var(--theme-effect),0 4px 13px var(--theme-shadow)!important}
"""
path.write_text(text, encoding="utf-8")


# tests/test_line_actions.py
path = Path("tests/test_line_actions.py")
text = path.read_text(encoding="utf-8")
text += r'''


def test_paste_options_adds_overwrites_and_preserves_disabled_state(tmp_path):
    path = tmp_path / "rulesmd.ini"
    path.write_text(
        "[Source]\nCost=100 ; copied\nSpeed=7\n[Target]\nCost=50 ; old\nName=Target\n",
        encoding="utf-8",
    )

    bridge = Bridge()
    bridge.rpc_open_file(str(path))
    result = bridge.rpc_paste_options("Target", [
        {"key": "Cost", "value": "100", "suffix": " ; copied", "disabled": False},
        {"key": "Speed", "value": "7", "suffix": "", "disabled": True},
    ])

    assert result["added"] == 1
    assert result["overwritten"] == 1
    assert len(result["line_ids"]) == 2
    rows = {row["key"]: row for row in result["section"]["options"]}
    assert rows["Cost"]["value"] == "100"
    assert rows["Cost"]["suffix"] == " ; copied"
    assert rows["Speed"]["value"] == "7"
    assert rows["Speed"]["disabled"] is True
    raw = bridge.rpc_raw_text()
    assert "Cost=100 ; copied" in raw
    assert ";@rulesmd-disabled Speed=7" in raw
    assert result["dirty"] is True
'''
path.write_text(text, encoding="utf-8")
