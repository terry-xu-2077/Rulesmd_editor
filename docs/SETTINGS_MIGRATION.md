# 设置与用户描述存储

当前桌面版把用户可修改的数据与应用自带规则元数据分开保存。

## resources/app-config.json

应用启动时由后端自动创建，保存：

- `gamePath`：游戏 / BAT / CMD 启动入口
- `appearance`：深色、浅色或跟随系统
- `leftPane` / `rightPane`：左右工作区宽度
- `lastFile`：最近打开/保存的规则文件
- `aresEnabled`：Ares 支持开关

便携版使用主程序旁边的 `resources` 目录；开发模式使用 `src/rulesmd_editor/resources`。前端仍会把少量值镜像到 WebView localStorage，供现有同步初始化逻辑读取，但 `app-config.json` 是跨启动保存的资源文件，也是应用启动时读取的持久配置来源。

## resources/user-descriptions.json

该文件对应旧版 Qt 的 `Resources/UserDesc.ini` 思路，只保存用户自己修改过的参数中文描述：

```json
{
  "OptionDesc": {
    "Sight": "自定义视野范围"
  }
}
```

用户描述不写回 `generated/rules_schema.json`、Ares schema 或其他应用自带描述文件，因此升级或重新生成内置规则资源时不会覆盖用户维护的中文名称。

参数表“参数名”列可直接编辑：Enter 或失焦保存，Esc 放弃。清空后保存会移除该 Key 的用户覆盖并恢复内置描述。自定义描述会同步反映到当前参数的帮助标题。

这两个用户文件属于运行时数据，源码模式下已加入 `.gitignore`，避免 `git pull` 与本地设置发生冲突。
