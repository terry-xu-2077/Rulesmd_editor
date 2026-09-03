# Rulesmd Editor

现代化的《红色警戒 2：尤里的复仇》`rulesmd.ini` 桌面辅助工具，兼容 **Ares** 扩展规则。

这是旧仓库 `terry-xu-2077/RulesmdEditor` 的重写版。新版采用 **React + TypeScript + Tauri** 作为桌面 UI，Python 继续负责 rulesmd/Ares 规则解析、数据处理与后续游戏辅助逻辑。

## 产品原则

- **傻瓜式优先**：软件主动替用户处理能可靠自动处理的事情，减少设置、确认、解释和额外界面。
- 只有在无法可靠判断、可能改变 MOD 作者意图或可能造成数据损失时才提示用户。
- 保留旧版主要工作流：单位分类、Section/参数搜索、参数说明、添加/删除、Section 备份与替换、引用查找/跳转、全局查找、游戏启动、辅助值编辑等。
- 参考并继承 `RulesmdEditorWeb` 的深色视觉、阵营色、参数类型配色和微动效，但重新实现为组件化、响应式的现代桌面界面。
- 支持 Ares 与大型 MOD 的未知标签、自定义标签和点号标签。
- **无损编辑优先**：尽可能保留原始注释、顺序、空行、重复键、行尾注释、换行格式和文件编码。

## 原版 INI 静默修正

ModEnc `Rules.ini` 提供的原版 INI 清理/修正逻辑会作为内部兼容步骤使用，而不是做成独立的“修复工具”界面。

设计原则：

1. 打开或导入游戏原始规则文件时，后台识别并静默修正已知、确定性的原版 INI 问题。
2. 用户不需要理解为什么要修复，也不需要逐项确认。
3. 对源文件进行可能影响内容的处理前自动保留备份/恢复点。
4. 对 Ares 与 MOD 自定义内容采用更保守策略；未知字段、重复键和作者注释不会因为“清理”而被随意删除。
5. 只有无法自动判断的冲突才向用户展示简短、明确的选择。

目标不是让用户管理 INI，而是让软件替用户处理 INI。

## Ares 兼容策略

Ares 对 Yuri's Revenge 的规则系统加入了大量扩展。编辑器采用两层支持：

1. **数据层完全开放**：任意未知 Section、任意未知 Key、Ares 点号标签、MOD 自定义标签均被保留。
2. **元数据层可扩展**：已知 Ares 字段提供名称、说明、类型与候选值；未收录字段仍然可以正常显示、编辑和保存。

因此，即使某个 Ares 标签暂时没有中文说明，也不会影响文件正确编辑。

## UI 方向

- React + TypeScript + Vite
- Tauri 桌面壳
- Python 后端/sidecar
- 深蓝黑主背景
- 联盟蓝 / 苏军红 / 尤里紫作为阵营识别
- 青色作为主要交互强调色
- 数值、布尔值、引用、Ares 扩展字段使用克制的类型色
- 保留旧 Web 版的参数入场、hover 浮起、状态反馈、图钉等动效语言，但降低位移和缩放幅度，统一为现代微动效
- 优先高信息密度与低认知成本，不堆叠“高级设置”式界面

## 参考资料

- 旧 Python 版：https://github.com/terry-xu-2077/RulesmdEditor
- 旧 Web 版：https://github.com/terry-xu-2077/RulesmdEditorWeb
- ModEnc `Rules.ini`: https://modenc.renegadeprojects.com/Rules.ini
- Ares Docs: https://ares-developers.github.io/Ares-docs/

## 当前开发分支

React/Tauri UI 重写工作位于：`react-tauri-ui`
