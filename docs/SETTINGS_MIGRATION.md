# 旧版设置迁移

旧 Qt 版 `Resources/Config.ini` 包含：

- `lastFile`
- `gamePath`
- `tableMode`
- `useTheme`
- `autoSaveRules`
- `autoSaveDesc`

当前编辑器迁移策略：

- `lastFile`：内部自动记忆最近打开/保存路径，不作为用户手工配置项。
- `gamePath`：设置页“游戏路径”，为后续“启动游戏”动作提供可执行文件位置。
- `tableMode`：设置页“紧凑表格视图”。当前主编辑器默认已经采用高密度表格布局，保留此偏好用于后续视图切换。
- `useTheme`：升级为“外观”，支持深色 / 浅色 / 跟随系统，而不是单一布尔值。
- `autoSaveRules`：已有文件保存路径时，参数修改后可自动保存 rules。
- `autoSaveDesc`：保留为描述编辑功能的自动保存偏好，待描述编辑闭环启用后使用。
- Ares 支持：新版本新增，控制 Ares 参数推荐；不会删除或拒绝已有 Ares 标签。

这些编辑器偏好与 rulesmd.ini 内容分离，不写入用户规则文件。
