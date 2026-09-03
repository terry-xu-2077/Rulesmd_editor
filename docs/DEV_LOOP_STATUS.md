# rulesmd.ini 编辑闭环状态

本文件补充 `DEVELOPMENT.md`，记录当前闭环实现的实际落地状态；后续稳定后可合并回主开发文档。

## 当前实现

- `RulesWorkspace.new_document()` 优先加载 `resources/generated/rulesmd.template.ini`，即由原版 `rulesmd.pre` 清洗生成的完整默认规则；模板本身不会被保存覆盖，新文档 `path=None`。
- 原版 YR 与 Ares 数据源物理分离：`schema.py + rules_schema.json` 只负责 YR，`ares_schema.py + ares_schema.json` 只负责 Ares；`RuntimeSchemaCatalog` 仅在运行时把两套数据合并成前端统一体验。
- Python Workspace 在打开/新建时按 `line_id` 建立原值基线，并通过 `raw_value` 返回给前端；修改回原值会清除 dirty，保存后当前值成为新的基线。
- React 不再根据 Key 自行猜控件，优先服从后端 `widget`：`boolean / select / multi-select / slider / text`，分别映射到 `Terry_React_UI_Library` 的组件。
- `Owner / RequiredHouses / ForbiddenHouses / SecretHouses` 使用国家 `MultiSelect`；`VeteranAbilities / EliteAbilities` 使用能力多选；`Prerequisite / PrerequisiteOverride / Dock` 使用建筑多选并融合当前文件动态建筑。
- `Warhead / Projectile / Spawns / DeploysInto / Enslaves / UndeploysInto / SuperWeapon` 等菜单从当前打开的 rules 文档动态取候选对象。
- UI Library 不再提供业务布局型 `PropertyRow`；还原按钮属于具体控件，并且只有 `value != raw_value` 时出现。
- `BoolSwitch` 在 UI Library 内固定为短宽度开关，不由 Rulesmd Editor CSS 拉伸。
- 右侧帮助显示参数中文名、完整说明、来源、控件类型、当前值和候选值；YR 与 Ares 虽然后端数据源分离，前端帮助体验保持一致。
- 引用关系不在帮助栏堆列表。值直接指向另一个 Section 时，在值控件右侧显示跳转按钮。
- 右侧帮助始终可见；Section 原文是帮助下方的可折叠参考区，不再通过 Tab 替换帮助内容。
- `set_value` 返回当前 Section 的最新无损 raw 文本，参数修改与还原后原文区同步更新。
- 保存后刷新 Section 元数据，再次打开同一文件时应保持值、控件类型和帮助信息一致。

## 启动时资源生成

`scripts/start-dev.ps1` 在规则运行资源缺失时自动运行 `tools/build_rule_resources.py`。构建器同步旧版文本资源并生成：

- `rules_schema.json`（只含 YR）
- `section_names.json`
- `identify_rules.json`
- `mod_metadata.json`
- `rulesmd.template.ini`
- `build_report.json`

另外：

- `control_schema.json` 由旧 Web 的 `OptionsDesc.ini` 控件 DSL 编译而来并随项目维护。
- `ares_schema.json` 是独立的 Ares 官方规则数据库，不混入 `rules_schema.json`。

## YR 参数分类

旧桌面版 `OptionCategory.ini` 只覆盖少量 Key，大量条目落入笼统的“特殊”。当前由 `category_rules.py` 对原版 YR Key 重新做功能分类，运行时也会覆盖旧生成缓存中的旧分类，因此无需删除本地资源缓存即可生效。

当前主要分类包括：基础、阵营与科技、经济与建造、生存与防御、武器与伤害、火控与AI、运动、部署与运输、生产与工厂、资源与采集、隐形与侦测、经验与升级、视觉、声音、特殊能力、其他。

“其他”只作为尚未人工校准的中性兜底，不再使用具有误导性的“特殊”大桶。Ares 分类完全由独立 `ares_schema.json` 管理，不经过 YR 分类器。

## Ares 规则库

Ares 规则只能在 `ares_schema.py + resources/generated/ares_schema.json` 中维护。新增条目要求以 Ares 官方文档为依据，并记录：Key、中文名、帮助、功能分类、值类型、适用对象、默认值、候选值和官方文档路径。

当前除 AttachEffect、EMP、赏金、建造时间、前置、InitialPayload 等基础条目外，已继续加入官方文档确认的学院、AI 建筑、Operator、隐形声音、武器光束、弹头通用效果、超级武器可用性和被盗科技前置等规则。仍应持续扩充，不能把“当前已收录”理解为“完整 Ares 规则集”。

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
9. 点击参数值控件本身也会选中该参数，右侧帮助同步切换。
10. 参数修改后右侧 Section 原文与文档模型同步，不显示旧值。

## 交互性能约束

完整 `rulesmd.ini` 不能在每次点击对象时重新扫描全文件。当前实现采用两层缓存：

- Python Workspace 在 `open/new/save` 后建立对象分类、动态候选、最后值和反向引用索引。
- `section()` 切换对象只读取当前 Section，并从索引 O(1) 获取引用和动态菜单候选。
- React 保存已经访问过的 `SectionData` 缓存；返回已看过的对象直接本地显示。
- 首次访问新对象时，左侧选择状态立即更新；旧参数面板保持显示，直到新 Section 数据到达后一次替换，不显示“正在读取参数…”闪屏。
- 快速连续点击对象使用请求序号丢弃过期响应，避免旧请求后返回覆盖新选择。

Windows 文件选择器不再启动 PowerShell/WinForms 子进程。Tauri 壳使用 Rust 原生文件对话框，并绑定当前应用窗口为 parent。

## 左侧对象层级浏览

参考旧 Qt 编辑器的高信息密度，左侧对象树保持简单，不使用国家层级：

```text
阵营
  → 单位类型
    → 单位
```

一级仅保留盟军、苏军、尤里、其他；二级使用步兵、载具、飞机、建筑、超级武器、武器、弹头、弹体等对象类型。每一级均可折叠，类型默认只展开当前选中对象所在分支，搜索时自动展开命中路径。

## 主界面空间与导航策略

主工作区参考旧 Qt 版本的桌面编辑效率，而不是复刻旧视觉：

- 左侧对象目录、中央编辑区、右侧帮助区之间提供拖拽分隔条。
- 左侧宽度与右侧帮助宽度分别记忆到 `localStorage`；右侧默认更宽，用于承载完整帮助。
- 中央参数编辑区仍是主工作区域。
- 顶部主命令使用“图标 + 名称”，不使用只有图标、依赖 tooltip 猜功能的按钮。
- 当前对象渐变 Header 内置轻量引用浏览历史。**用户手动在左侧选择单位时，历史重置为该单位**；之后由引用跳转形成连续历史链。
- 后退/前进按钮显示对应目标对象名；后退/前进本身不重复写入历史。
- 手动选择新单位相当于新的浏览起点，不保留上一条引用链，避免历史被普通单位浏览污染。
- 中央参数表只保留 `Key / 参数名 / 值` 三列，长说明只进入右侧帮助。
- 当前参数行使用 4px 左侧强调线和轻微浮层阴影，不使用位移动画。
- 点参数行文字区域或值控件区域都会更新当前参数选择；值控件阻止行 click 冒泡时必须在 pointer-down 阶段主动同步选择。

## 引用跳转

对 `Primary / Secondary / ElitePrimary / Warhead / Projectile / DeploysInto / Spawns` 等实际值可解析为已有 Section 的参数，在值控件右侧显示直接跳转按钮。点击后：

1. 目标 Section 进入当前编辑器。
2. 左侧对象树同步当前 Section。
3. 该跳转进入顶部历史导航，可直接后退回来源对象。

手动从左侧选择任意其他对象会重置这条引用历史。右侧帮助栏不显示长篇“引用关系链”。

## 帮助与原文

右侧栏不是“帮助 / 原文”互斥 Tab。帮助是编辑时的持续上下文，必须一直保留：

- 顶部固定显示当前参数帮助、来源、类型、当前值、候选值等。
- 下方提供可折叠的 `Section 原文` 区域，用于核对真实 INI 文本。
- 参数修改、还原后，Python `set_value` 返回 `clone_section_text(section)` 的真实结果，React 同步更新 `SectionData.raw` 和缓存。
- 原文区只作为参考，不应阻止用户同时查看参数帮助。

## 数值滑块

普通数值默认恢复旧 Web 编辑器的范围启发式，但范围必须以 `raw_value` 为固定基线，禁止拖动过程中不断重新扩张：

- 整数：初始/基线值 × 4
- 小数：初始/基线值 × 6
- 有官方明确范围的参数由规则 schema 覆盖默认启发式。
- UI Library 的 Slider 实际 range 轨道必须填满控件可用宽度，禁止视觉宽度与真实拖动宽度不一致。

## 添加参数安全策略

“添加参数”不是完整 Key 浏览器，而是针对当前对象类型的安全规则浏览器。

1. 当前 Section 已存在的 Key 不再显示。
2. 有明确 `applies_to` 的参数，只有当前对象类型或其 `TechnoType` 家族匹配时才显示。
3. 旧 YR 元数据若没有明确 `applies_to`，只有当该 Key 已在当前文档/原版模板的同类对象中实际使用过时才允许推荐。
4. 未确认适用范围的 Key 默认不进入一键添加列表；用户手写/已有未知标签仍保持无损编辑和保存能力。
5. Ares 关闭时仅隐藏 Ares 推荐，不删除或拒绝现有 Ares 标签。

参数浏览器固定为“来源/多层分类 → 当前分类参数列表 → 参数详情 + 确认添加”。点击参数列表只进行选择，不立即写入 INI；必须在右侧确认后才添加。`ParameterPicker` 使用 UI Library `Dialog size="wide"`，外层不滚动，内部各栏分别拥有自己的纵向滚动。

## UI 架构约束

Rulesmd Editor 不维护 UI Library 副本。通用控件的尺寸、视觉、动效、Reset、Dialog、Slider 等问题统一在 `Terry_React_UI_Library` 修复；项目只保留业务布局和必要尺寸接入。

- 参数行不使用 transform 型入场动画或 hover 位移动画。
- 参数行默认不做整行 hover 染色；选中状态属于业务层，可以使用 4px 左侧强调线和轻微静态阴影。
- `Select / MultiSelect` 弹层统一使用 UI Library 高层级 popover。
- `BoolSwitch` 固定 104px，滑块位移使用 transform。
- 下拉/弹窗只使用短时 `opacity + translate`，不使用大比例 bounce。
- 设置页等业务表单负责说明文字与固定宽控件的布局，通用组件不应被父容器错误拉伸。
