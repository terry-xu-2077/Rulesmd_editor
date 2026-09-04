# 引用编辑与保存状态工作流

## 引用型参数

- 能解析为其他 Section 的单值参数不得继续显示为普通文本框。
- `Primary / Secondary / ElitePrimary / EliteSecondary / OccupyWeapon / EliteOccupyWeapon / OpenTransportWeapon / DeathWeapon` 使用武器单选菜单。
- Warhead / Projectile 引用使用对应对象的单选菜单。
- `DeploysInto / UndeploysInto / Enslaves / Spawns` 使用对应对象类型的单选菜单。
- 单选菜单支持搜索；候选项优先显示旧资源图标 + 中文名称，Section ID 作为次级信息。
- 值右侧保留跳转按钮，单选菜单负责修改引用，跳转按钮负责进入目标 Section。

## 文件状态

- 顶部右侧不再显示“已保存 / 有未保存修改”文字状态。
- 表格/原文切换位于窗口右上角。
- 保存按钮保持普通工具按钮视觉，不默认高亮；文件 dirty 时只在“保存”文字后增加一个亮色小点。
- 关闭窗口时若文件 dirty，阻止直接关闭并显示三选确认：保存并退出 / 不保存 / 取消。

## 还原按钮

- 还原只在值相对打开/保存基线发生变化时显示。
- 控件只显示回转箭头，不显示“还原”文字。
- 视觉属于次要操作：透明背景，hover 仅改变边框/轻微文字色，不使用 Accent 填充、强光或浮起动画。

## 亮色主题与开关

- 亮色主题必须覆盖主工作区、工具栏、对象树、参数表、帮助栏以及 UI Library 控件文本，禁止残留暗色模式下的低对比浅文字。
- BoolSwitch 的几何只由 Terry React UI Library 管理。当前固定为紧凑 78px 轨道，36px knob，设置页只负责右对齐，业务 CSS 不得修改内部轨道/knob 尺寸。
