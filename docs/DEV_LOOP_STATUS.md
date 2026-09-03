# rulesmd.ini 编辑闭环状态

本文件补充 `DEVELOPMENT.md`，记录 2026-09-03 这一轮闭环实现的实际落地状态；后续稳定后可合并回主开发文档。

## 当前实现

- `RulesWorkspace.new_document()` 优先加载 `resources/generated/rulesmd.template.ini`，即由原版 `rulesmd.pre` 清洗生成的完整默认规则；模板本身不会被保存覆盖，新文档 `path=None`。
- `RuntimeSchemaCatalog` 负责加载编译后的 `rules_schema.json` 与 `section_names.json`，旧版 `OptionsDesc.ini / HelpInfor.ini / NamesDesc.ini` 的信息进入统一运行时元数据；Ares 元数据与 YR 使用同一套目录。
- Python Workspace 在打开/新建时按 `line_id` 建立原值基线，并通过 `raw_value` 返回给前端；修改回原值会清除 dirty，保存后当前值成为新的基线。
- React 不再根据 Key 自行猜控件，优先服从后端 `widget`：`boolean / select / multi-select / slider / text`，分别映射到 `Terry_React_UI_Library` 的组件。
- `Owner / RequiredHouses / ForbiddenHouses / SecretHouses` 使用国家 `MultiSelect`；`VeteranAbilities / EliteAbilities` 使用能力多选；`Prerequisite / PrerequisiteOverride / Dock` 使用建筑多选并融合当前文件动态建筑。
- `Warhead / Projectile / Spawns / DeploysInto / Enslaves / UndeploysInto / SuperWeapon` 等菜单从当前打开的 rules 文档动态取候选对象。
- UI Library 的 `PropertyRow` 不包含 Copy/onCopy 等业务操作；还原按钮属于具体控件，并且只有 `value != raw_value` 时出现。
- `BoolSwitch` 在 UI Library 内固定为短宽度开关，不由 Rulesmd Editor CSS 拉伸。
- 右侧帮助显示参数中文名、详细帮助、来源、控件类型、当前值、候选值和引用关系；数据来自编译后的旧版资料与 Ares 元数据。
- 保存后刷新 Section 元数据，再次打开同一文件时应保持值、控件类型和帮助信息一致。

## 启动时资源生成

`scripts/start-dev.ps1` 在规则运行资源缺失时自动运行 `tools/build_rule_resources.py`。构建器同步旧版文本资源并生成：

- `rules_schema.json`
- `section_names.json`
- `identify_rules.json`
- `mod_metadata.json`
- `rulesmd.template.ini`
- `build_report.json`

`control_schema.json` 由旧 Web 的 `OptionsDesc.ini` 控件 DSL 编译而来并随项目维护。

## 当前闭环验收

需要同时满足：

1. 新建得到完整原版模板，而不是空 `[General]`。
2. 打开已有 rulesmd.ini 使用无损解析，不自动清洗用户文件。
3. `Owner` 等旧 Web 多选字段显示为真正的 `MultiSelect`。
4. 布尔、单选、多选、数值、文本控件都能把修改写回 Python 文档模型。
5. 未修改项没有还原按钮；修改后出现；还原后消失。
6. 保存清空修改状态并建立新的原值基线。
7. 保存文件重新打开后数据与控件保持一致。
8. 右侧帮助来自实际资源库，而不是示例占位数据。

## UI 架构约束

Rulesmd Editor 不再维护 `frontend/src/ui` 形式的 UI Library 副本。通用控件的尺寸、视觉、动效、Reset 行为等问题统一在 `Terry_React_UI_Library` 修复；项目只保留业务布局和必要的尺寸接入规则。
