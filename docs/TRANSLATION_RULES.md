# 中文翻译与术语规则

Rulesmd Editor 的中文仅属于**展示层元数据**，绝不能改写实际 Rules/Ares 引擎 Key、Section ID 或用户文件中的原始值。

## 来源优先级

1. 游戏/引擎实际 Key、Section ID：只作为机器标识，不翻译、不改名。
2. `RulesmdEditor/Resources/OptionsDesc.ini`、`HelpInfor.ini`、`NamesDesc.ini`：旧桌面编辑器的原始资料。
3. `RulesmdEditorWeb/desc/OptionsDesc.ini`、`HelpInfor.ini`、`NamesDesc.ini`：旧网站编辑器补充的控件名称、单位名称与说明。
4. Ares 参数：`ares_schema.json` 中维护的中文说明，并以 Ares 官方文档链接为语义依据。
5. `translations_zh.py`：只处理历史资料中的空白、明显误译、术语不统一以及仍为英文 Key 的展示名称。

## 红线

- 禁止为了中文显示修改真实 Key，例如 `CanPassiveAquire` 即使原拼写有误也必须保持原样。
- 禁止把中文名称写回 `rulesmd.ini` 的 Key/Section。
- 禁止用“看起来像”的含义猜测陌生参数；没有资料依据时宁可暂时显示 Key。
- 禁止用长篇帮助文本直接替代短参数名。参数名负责识别，帮助区负责解释。
- 原版 YR 与 Ares 的数据源保持物理分离；只在运行时展示层合并。

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

只对空白、明显英文展示名或已知错误项进行覆盖；已经存在且可信的中文名称保持不变。常见单位名修订同样只作用于 `name_desc` 展示字典。
