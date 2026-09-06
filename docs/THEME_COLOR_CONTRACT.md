# Rulesmd Editor 主题颜色契约

这是项目 UI 的强制颜色所有权规则。

## 核心原则

任何业务组件、共享组件、弹窗、下拉菜单、表格、导航、树、标题栏都**不能拥有独立配色表**。

组件只接收语义颜色输入，然后在组件内部根据用途派生：

- 色相
- 明暗
- 饱和度
- 透明度
- 混色
- hover / active / focus / disabled 等状态

禁止组件直接保存“自己的蓝色 / 灰色 / 墨蓝 / 绿色”等固定色板。

## 唯一五个用户可编辑源颜色

```text
--theme-base
--theme-accent
--theme-effect
--theme-text
--theme-text-bright
```

设置页只负责修改这五个源颜色。

`theme-customizer.ts` 不允许直接设置 `--bg`、`--panel`、`--tc-panel` 等派生变量。

## 派生层

所有业务与 UI Library 兼容变量都集中在：

```text
frontend/src/theme-contract.css
```

例如：

```css
--theme-surface-1: color-mix(in srgb, var(--theme-base) 92%, var(--theme-text) 8%);
--theme-surface-focus: color-mix(in srgb, var(--theme-base) 82%, var(--theme-accent) 18%);
```

旧业务变量和 Terry UI Library 变量只能在该契约层映射：

```text
--bg
--panel
--control
--tc-base
--tc-panel
--tc-border-color
...
```

组件本身只能消费这些变量，不能重新定义它们形成第二套主题。

## 语义阵营色

盟军、苏军、尤里等业务色也不能由组件写死。它们从公开源颜色派生，再作为语义色传给组件：

```text
--theme-allied
--theme-soviet
--theme-yuri
--theme-neutral
```

因此 `EntityHeader`、渐变背景、选中态只消费语义颜色，不保存自己的蓝/红/紫色板。

## 允许与禁止

允许：

```css
background: color-mix(in srgb, var(--theme-base) 88%, var(--theme-text) 12%);
border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
```

禁止：

```css
background: #0d1b2a;
border-color: #31506b;
box-shadow: 0 0 8px rgba(31, 92, 140, .4);
```

黑、白、透明可以作为明暗/透明度派生的数学端点，但不能成为组件独立色板。

## 自动检查

`npm run check:ui-css` 现在会检查主题契约层：

- `theme-contract.css` 必须存在五个源颜色。
- `theme-customizer.ts` 只能发布五个源颜色。
- `ui-library-integration.css` 不能再定义 UI Library 的独立色板。
- 契约管理的组件 CSS 禁止硬编码 hex / rgb / hsl 颜色。
- `ui-library-integration.css` 仍必须保持 late layer 最后一层。

违反这些规则会在开发启动和构建前直接失败。
