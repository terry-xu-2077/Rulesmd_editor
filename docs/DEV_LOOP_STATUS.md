# rulesmd.ini 编辑闭环状态

本文件补充 `DEVELOPMENT.md`，记录 2026-09-03 这一轮闭环实现的实际落地状态；后续稳定后可合并回主开发文档。

## 当前实现

- `RulesWorkspace.new_document()` 优先加载 `resources/generated/rulesmd.template.ini`，即由原版 `rulesmd.pre` 清洗生成的完整默认规则；模板本身不会被保存覆盖，新文档 `path=None`。
- 原版 YR 与 Ares 数据源物理分离：`schema.py + rules_schema.json` 只负责 YR，`ares_schema.py + ares_schema.json` 只负责 Ares；`RuntimeSchemaCatalog` 仅在运行时把两套数据合并成前端统一体验。
- Python Workspace 在打开/新建时按 `line_id` 建立原值基线，并通过 `raw_value` 返回给前端；修改回原值会清除 dirty，保存后当前值成为新的基线。
- React 不再根据 Key 自行猜控件，优先服从后端 `widget`：`boolean / select / multi-select / slider / text`，分别映射到 `Terry_React_UI_Library` 的组件。
- `Owner / RequiredHouses / ForbiddenHouses / SecretHouses` 使用国家 `MultiSelect`；`VeteranAbilities / EliteAbilities` 使用能力多选；`Prerequisite / PrerequisiteOverride / Dock` 使用建筑多选并融合当前文件动态建筑。
- `Warhead / Projectile / Spawns / DeploysInto / Enslaves / UndeploysInto / SuperWeapon` 等菜单从当前打开的 rules 文档动态取候选对象。
- UI Library 的 `PropertyRow` 不包含 Copy/onCopy 等业务操作；还原按钮属于具体控件，并且只有 `value != raw_value` 时出现。
- `BoolSwitch` 在 UI Library 内固定为短宽度开关，不由 Rulesmd Editor CSS 拉伸。
- 右侧帮助显示参数中文名、详细帮助、来源、控件类型、当前值、候选值和引用关系；YR 与 Ares 虽然后端数据源分离，前端帮助体验保持一致。
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

## 交互性能约束

完整 `rulesmd.ini` 不能在每次点击对象时重新扫描全文件。当前实现采用两层缓存：

- Python Workspace 在 `open/new/save` 后建立对象分类、动态候选、最后值和反向引用索引。
- `section()` 切换对象只读取当前 Section，并从索引 O(1) 获取引用和动态菜单候选，不再调用全文件 `references_to()` 或重复 `categorized_sections()`。
- React 保存已经访问过的 `SectionData` 缓存；返回已看过的对象直接本地显示。
- 首次访问新对象时，左侧选择状态立即更新；旧参数面板保持显示，直到新 Section 数据到达后一次替换，不显示“正在读取参数…”闪屏。
- 快速连续点击对象使用请求序号丢弃过期响应，避免旧请求后返回覆盖新选择。

Windows 文件选择器不再启动 PowerShell/WinForms 子进程。Tauri 壳使用 Rust 原生文件对话框，并绑定当前应用窗口为 parent，目标是点击立即出现且不会落到应用背后。

## 左侧对象层级浏览

参考旧 Qt 编辑器的高信息密度，左侧对象树保持简单，不再使用国家层级：

```text
阵营
  → 单位类型
    → 单位
```

具体规则：

1. 一级仅保留盟军、苏军、尤里、其他。
2. 二级使用步兵、载具、飞机、建筑、超级武器、武器、弹头、弹体等对象类型。
3. 不根据 `Owner / RequiredHouses / ForbiddenHouses` 再创建国家层，避免同阵营对象被过度拆分，也避免为了导航额外解析完整 raw text。
4. 每一级均可折叠；阵营默认展开，类型默认只展开当前选中单位所在分支。
5. 搜索时自动展开命中路径。
6. 单位行保持紧凑，目标是在相同侧栏高度内显示更多对象。

## 主界面空间策略

主工作区参考旧 Qt 版本的桌面编辑效率，而不是复刻旧视觉：

- 左侧对象目录缩窄，主要用于快速定位。
- 中央参数编辑区占据绝大部分横向空间，是主操作区域。
- 右侧帮助区缩窄，只承担说明、来源、候选值和引用关系。
- 当前对象 Header、搜索栏、分类栏和参数行均降低高度，提高单屏参数数量。
- 参数行继续使用 UI Library 控件，但业务布局改成更紧凑的“参数名 / 中文说明 / 控件”桌面编辑密度。

## 添加参数安全策略

“添加参数”不是完整 Key 浏览器，而是针对当前对象类型的安全规则浏览器。

规则：

1. 当前 Section 已存在的 Key 不再显示。
2. 有明确 `applies_to` 的参数，只有当前对象类型或其 `TechnoType` 家族匹配时才显示。
3. 旧 YR 元数据若没有明确 `applies_to`，只有当该 Key 已在当前文档/原版模板的同类对象中实际使用过时才允许推荐。
4. 未确认适用范围的 Key 默认不进入一键添加列表；用户手写/已有未知标签仍保持无损编辑和保存能力。
5. Ares 关闭时仅隐藏 Ares 推荐，不删除或拒绝现有 Ares 标签。

参数浏览器交互固定为：

```text
左侧：
  Yuri 原版
    → 参数用途分类
  Ares 扩展
    → AttachEffect / EMP / 赏金 / 建造 / ...

中间：
  当前分类的参数列表

右侧：
  选中参数的完整说明
  Key / 来源 / 值类型 / 默认值 / 适用对象 / 可选值 / 文档来源
  → “添加此参数”
```

点击参数列表只进行选择，不立即写入 INI；必须在右侧确认后才添加。顶部搜索只搜索已经通过安全过滤的结果集。

`ParameterPicker` 使用 UI Library `Dialog size="wide"`。宽 Dialog 的外层不滚动；参数分类树、参数列表、详情区域分别拥有自己的纵向滚动，禁止出现整个弹窗的横向滚动条。

这套策略优先避免错误 Key 被添加到不兼容对象后导致游戏加载异常或崩溃；后续随着 YR/Ares 规则元数据补全，可逐步扩大白名单，而不是先全量放行再补黑名单。

## UI 架构约束

Rulesmd Editor 不再维护 `frontend/src/ui` 形式的 UI Library 副本。通用控件的尺寸、视觉、动效、Reset、Dialog 尺寸模式等问题统一在 `Terry_React_UI_Library` 修复；项目只保留业务布局和必要的尺寸接入规则。

### 浮层与动画约束

- `PropertyRow` 不应使用 `transform` 型入场动画或 hover 位移动画。大量参数行同时动画会造成明显重绘开销，而且 `transform` 会创建 stacking context，使行内 `Select / MultiSelect` 的高 `z-index` 仍可能被后续参数行或 sticky 分组标题盖住。
- 参数行默认不做整行 hover 染色或阴影；交互反馈由具体控件自身承担。
- `Select / MultiSelect` 弹层统一使用 UI Library 的高层级 popover，不在业务页面自行覆盖层级。
- `BoolSwitch` 使用固定 104px 宽度；滑块位移使用 `transform`，避免用 `left` 做动画导致布局重算和错位。
- 下拉/弹窗动画只使用短时 `opacity + translate`，不使用大比例 scale bounce；参数列表本身保持静态。
- Rulesmd Editor 当前参数焦点线属于业务选中状态，使用 6px 左侧强调线；这不是 UI Library 通用 PropertyRow hover 状态。
- 设置页等业务表单负责为说明文字与固定宽控件提供明确网格布局，通用 BoolSwitch 不应被父容器拉伸。