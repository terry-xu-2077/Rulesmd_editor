# Ares 规则数据架构

Ares 在前端体验上与原版 Yuri's Revenge rulesmd 参数保持一体，但数据源、校验和维护必须与原版规则物理分离。

## 设计原则

```text
原版 YR / rulesmd                       Ares
──────────────────                     ──────────────────
schema.py                              ares_schema.py
rules_schema.json                      ares_schema.json
旧 Resources / Web 元数据              Ares 官方文档审计数据
        │                                      │
        └──────────── RuntimeSchemaCatalog ────┘
                           │
                           ↓
                    统一前端参数体验
```

前端不创建“Ares 编辑器”或独立 Ares 参数页。玩家仍然使用同一个对象属性面板、同一个“添加参数”窗口、同一个帮助区；Ares 仅通过来源徽标、帮助来源和设置开关进行轻量区分。

## 文件职责

### `src/rulesmd_editor/schema.py`

只定义原版 Yuri's Revenge / rulesmd 元数据模型和旧资源加载逻辑。不得内置 Ares Key、Ares 默认值、Ares applicability 或 Ares 文档路径。

### `src/rulesmd_editor/resources/generated/rules_schema.json`

只保存原版 YR 规则元数据。`tools/build_rule_resources.py` 只从旧版 Resources / Web 资料构建该文件，不再合并 Ares。

### `src/rulesmd_editor/ares_schema.py`

只负责 Ares 数据加载、Key 匹配、通配/编号 Key 解析及 Ares applicability 查询。后续 Ares 版本判断和条件规则也统一放在此模块，而不是塞回 `schema.py`。

### `src/rulesmd_editor/resources/generated/ares_schema.json`

Ares 独立规则数据库。目标字段至少包括：

- Key
- 中文名称
- 中文帮助
- 参数分类
- 值类型
- 默认值
- 合法候选值
- `applies_to`
- Ares 文档路径
- 后续增加：官方确认状态、版本范围、依赖条件、互斥条件和危险提示

此文件的最终权威来源应为 Ares 官方文档，而不是 rulesmd 原版资料或旧 Web 猜测。

### `RuntimeSchemaCatalog`

运行时负责把 YR 与 Ares 两套 catalog 合成一个前端视图。合并只发生在运行时，不把两种规则重新写回同一个 JSON。

共享 Key（例如原版已有、但 Ares 又扩展语义的 Key）不得在前端重复出现。原版 Key 保持原版身份，Ares 扩展信息后续通过增强元数据表达。

## Ares 设置的含义

关闭 Ares 支持时：

- 不推荐 Ares 专属参数。
- 不显示 Ares 专属一键添加项。
- 已存在或用户手写的 Ares / 第三方标签仍然无损读取、编辑和保存。
- 原版 YR 参数不会因为 Ares 对同名 Key 有扩展而消失。

## 安全添加策略

Ares 参数进入“添加参数”窗口前必须有明确适用范围。原则为白名单：

1. 官方文档明确适用于当前 Section / 对象类型，才允许主动推荐。
2. 有额外条件限制时，条件满足才显示。
3. 尚未完成官方审计的 Ares Key 可以被读取和手工编辑，但不应进入安全一键添加列表。
4. 不以“Key 看起来像 TechnoType 参数”为理由自动放行。

## 当前迁移状态

当前高频 Ares 元数据已经迁移到独立 `ares_schema.json`，包括 AttachEffect、EMP、Bounty、BuildTime、EnemyUIName、InitialPayload、Prerequisite、FactoryOwners 等组。后续继续以 Ares 官方文档逐 Key 审计并扩大覆盖范围。

`tests/test_ares_schema.py` 用于防止未来重新把 Ares 数据塞回 `schema.py` 或 `rules_schema.json`。
