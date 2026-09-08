# 中文翻译与术语规则

Rulesmd Editor 的中文仅属于**展示层元数据**，绝不能改写实际 Rules/Ares 引擎 Key、Section ID 或用户文件中的原始值。

## 来源与覆盖优先级

翻译来源不是“写进 JSON 就永远正确”。历史资源和人工 JSON 都可能存在误译，因此运行时采用可审校的分层优先级：

1. 游戏/引擎实际 Key、Section ID：只作为机器标识，不改名、不写回中文。
2. **经过可靠资料核对的审校覆盖层**：`yr_translation_audit.py`、`ares_patterns_zh.audit_ares_meta()`。已确认的误译修正在这里覆盖历史 INI 或人工 JSON。
3. `RulesmdEditor/Resources/OptionsDesc.ini`、`HelpInfor.ini`、`NamesDesc.ini`：旧桌面编辑器的原始资料。
4. `RulesmdEditorWeb/desc/OptionsDesc.ini`、`HelpInfor.ini`、`NamesDesc.ini`：旧网站编辑器补充的控件名称、单位名称与说明。
5. 原版/YR `rulesmd.ini` 中可核对的对象 `Name=`、对象关系及可靠社区资料：用于补齐常见单位、武器、音频等展示名。
6. Ares 精确参数：`ares_schema.json` 中维护的中文说明，并以 Ares 官方文档为语义依据。
7. Ares 动态点号参数：`ares_patterns_zh.py` 按已知参数族生成展示元数据，例如 `Versus.<Armor>`、`ParaDrop.<Country>.Types`。其中 MOD 自定义 ID 必须原样保留。
8. `translations_zh.py` / `referenceLabels.ts`：处理历史资料中的空白、明显误译、术语不统一，以及缺少展示名的技术引用值。
9. 最后的未知 Key 回退：只在英文单词能被完整、保守地识别时生成中文**名称**；没有可靠资料时不编造玩法说明。

这意味着：人工 JSON 是重要数据源，但**已核实的审校修正优先于 JSON**。

## 两类翻译必须区分

### 参数语义

参数 Key 的含义影响玩法和写入结果，**禁止仅凭名字猜具体机制、默认值、范围或适用对象**。陌生参数没有可靠资料时，可以生成一个保守的中文短名称，但帮助区必须明确标记“名称自动推断”，并说明具体语义尚未核实。

例如未知的 `SomeWeaponRangeMultiplier` 可以在展示层尝试拆成“武器范围倍率”，但不能因此擅自断言它的默认值、数学公式或支持哪些 Section。

### 对象/引用值的展示名

单位、武器、音频、弹头、弹体等引用值本身仍以原始 ID 为真实值。为了让菜单可读，可以使用保守的中文展示猜测，但必须满足：

- 只改变界面 Label，不改变 `value`；
- 搜索仍能用原始 ID；
- 技术 ID 在菜单/详情中应保持可追溯；
- 已核实资料名优先于猜测；
- 无法可靠拆词时直接保留原始 ID，不强行翻译。

例如 `PsychicJab` 可以显示为“心灵冲击”，但写回仍然只能是 `PsychicJab`。

## Ares 动态点号参数

Ares 大量使用点号 Key。静态 JSON 不可能枚举 MOD 作者定义的所有中间 ID，因此必须区分“固定 Ares 语法”与“MOD 自定义实例”。

典型规则：

- `Versus.<Armor>=` → “对 `<Armor>` 护甲伤害倍率”；`<Armor>` 保持原始护甲 ID。
- `Versus.<Armor>.PassiveAcquire=` / `.Retaliate=` / `.ForceFire=` → 使用固定 Ares 行为语义，护甲 ID 原样保留。
- `ParaDrop.<Country>.Types=` / `.Num=` / `.Aircraft=` → 固定解释空降字段，`<Country>` 原样保留，因为 MOD 可以新增任意国家。
- 其他已知前缀如 `AttachEffect.*`、`Missile.*`、`SW.*`、`SpyEffect.*` 等，优先使用精确 Ares schema；只有 schema 缺项时才由参数族规则生成保守名称和提示。
- 完全未知的点号前缀仍按 Ares 风格标识，但不得仅凭 Key 编造具体语义。

## 审校规则

每次发现旧翻译或人工 JSON 有问题时，优先新增小型、可测试的审校覆盖，而不是直接相信任一历史来源。审校至少应满足一项可靠依据：

- Ares 官方文档；
- 原版/YR 实际 `rulesmd.ini` 注释与可复现游戏行为；
- 维护较好的技术资料（用于原版机制交叉核对）；
- 明确可验证的对象注册关系、国家列表或枚举语义。

如果资料之间冲突，保留原始 Key，并在帮助中说明不确定性，不用一个未经验证的中文解释覆盖另一个。

## 红线

- 禁止为了中文显示修改真实 Key，例如 `CanPassiveAquire` 即使原拼写有误也必须保持原样。
- 禁止把中文名称写回 `rulesmd.ini` 的 Key、Section 或引用值。
- 禁止用“看起来像”的含义猜测陌生参数的具体玩法机制；自动拆词仅允许作为展示名称回退。
- 禁止用长篇帮助文本直接替代短参数名。参数名负责识别，帮助区负责解释。
- 原版 YR 与 Ares 的数据源保持物理分离；只在运行时展示层合并。
- 禁止因为中文化而破坏 Mod 自定义 ID；未知自定义对象必须可原样读取、显示、搜索、保存。

## 术语约定

- `TechnoType`：对象类型（在具体语境中可细分为步兵/载具/飞机/建筑）。
- `Warhead`：弹头。
- `Projectile`：抛射体/弹体；界面短标签优先“抛射体”。
- `ROF`：实际是攻击间隔；短标签可写“射速”，涉及倍率时必须说明数值变大/变小对攻击间隔的真实影响，避免把 ROF 当作“每秒射击次数”。
- `Psionics`：心灵控制/心灵能力，根据具体参数语义选择。
- `Cloak`：隐形。
- `Limbo`：保留英文 Limbo，并在帮助文本解释，不擅自翻成会误导的游戏机制名。
- `Owner/House`：国家/阵营；涉及具体可建造方时优先“国家”。
- `Armor`：原版护甲代码与中文展示名要区分；不能仅凭旧编辑器历史译名推断真实材质含义。

## 运行时补齐

`src/rulesmd_editor/translations_zh.py` 在 legacy/generated 元数据载入后执行，因此旧机器上已经生成的 `rules_schema.json` 也会立即获得基础修订，不要求删除缓存或重新生成资源。之后 `yr_translation_audit.py` 再应用已核实审校覆盖，因此人工 JSON 或旧缓存都不能重新覆盖已确认修正。

常见单位和武器优先由这里维护稳定映射；缺少映射、但技术 ID 能被安全拆词时，`guess_section_name()` 可以生成展示层回退名称。未知非点号参数也允许在所有单词都能识别时生成短中文名，但帮助区会明确标记这是“名称自动推断”。

`ares_patterns_zh.py` 负责 Ares 动态点号参数；`frontend/src/referenceLabels.ts` 负责音频和前端引用菜单的展示翻译，其中音频会优先使用已知单位前缀 + `Select/Move/Attack/Die` 等动作后缀生成可读中文。

所有这些逻辑都只影响界面 Label/Help，不改变真实 Rules 值。
