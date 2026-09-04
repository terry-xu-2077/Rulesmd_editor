# 中文翻译与术语规则

Rulesmd Editor 的中文仅属于**展示层元数据**，绝不能改写实际 Rules/Ares 引擎 Key、Section ID 或用户文件中的原始值。

## 来源优先级

1. 游戏/引擎实际 Key、Section ID：只作为机器标识，不改名、不写回中文。
2. `RulesmdEditor/Resources/OptionsDesc.ini`、`HelpInfor.ini`、`NamesDesc.ini`：旧桌面编辑器的原始资料。
3. `RulesmdEditorWeb/desc/OptionsDesc.ini`、`HelpInfor.ini`、`NamesDesc.ini`：旧网站编辑器补充的控件名称、单位名称与说明。
4. 原版/YR `rulesmd.ini` 中可核对的对象 `Name=`、对象关系及官方/社区文档：用于补齐常见单位、武器、音频等展示名。
5. Ares 参数：`ares_schema.json` 中维护的中文说明，并以 Ares 官方文档链接为语义依据。
6. `translations_zh.py` / `referenceLabels.ts`：处理历史资料中的空白、明显误译、术语不统一，以及缺少展示名的技术引用值。

## 两类翻译必须区分

### 参数语义

参数 Key 的含义影响玩法和写入结果，**禁止凭名字猜语义**。陌生参数没有可靠资料时宁可显示 Key，并在帮助区注明暂无内置中文说明。

### 对象/引用值的展示名

单位、武器、音频、弹头、弹体等引用值本身仍以原始 ID 为真实值。为了让菜单可读，可以使用保守的中文展示猜测，但必须满足：

- 只改变界面 Label，不改变 `value`；
- 搜索仍能用原始 ID；
- 技术 ID 在菜单/详情中应保持可追溯；
- 已有资料名永远优先于猜测；
- 无法可靠拆词时直接保留原始 ID，不强行翻译。

例如 `PsychicJab` 可以显示为“心灵冲击”，但写回仍然只能是 `PsychicJab`。

## 红线

- 禁止为了中文显示修改真实 Key，例如 `CanPassiveAquire` 即使原拼写有误也必须保持原样。
- 禁止把中文名称写回 `rulesmd.ini` 的 Key、Section 或引用值。
- 禁止用“看起来像”的含义猜测陌生**参数语义**；对象/引用值仅允许按上一节规则做展示层保守猜测。
- 禁止用长篇帮助文本直接替代短参数名。参数名负责识别，帮助区负责解释。
- 原版 YR 与 Ares 的数据源保持物理分离；只在运行时展示层合并。
- 禁止因为中文化而破坏 Mod 自定义 ID；未知自定义对象必须可原样读取、显示、搜索、保存。

## 术语约定

- `TechnoType`：对象类型（在具体语境中可细分为步兵/载具/飞机/建筑）。
- `Warhead`：弹头。
- `Projectile`：抛射体/弹体；界面短标签优先“抛射体”。
- `ROF`：射速/攻击间隔；倍率类参数优先“射速倍率”。
- `Psionics`：心灵控制/心灵能力，根据具体参数语义选择。
- `Cloak`：隐形。
- `Limbo`：保留英文 Limbo，并在帮助文本解释，不擅自翻成会误导的游戏机制名。
- `Owner/House`：国家/阵营；涉及具体可建造方时优先“国家”。

## 运行时补齐

`src/rulesmd_editor/translations_zh.py` 在 legacy/generated 元数据载入后执行，因此旧机器上已经生成的 `rules_schema.json` 也会立即获得修订，不要求删除缓存或重新生成资源。

常见单位和武器优先由这里维护稳定映射；缺少映射、但技术 ID 能被安全拆词时，`guess_section_name()` 可以生成展示层回退名称。`frontend/src/referenceLabels.ts` 负责音频和前端引用菜单的展示翻译，其中音频会优先使用已知单位前缀 + `Select/Move/Attack/Die` 等动作后缀生成可读中文。

所有这些逻辑都只影响界面 Label，不改变真实 Rules 值。
