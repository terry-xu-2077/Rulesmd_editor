# UI CSS 级联加载红线

这是 `docs/UI_DEVELOPMENT_RULES.md` 的补充红线，记录 2026-09-04 主界面回归事件。

## 事件

清理 CSS 污染后，主界面出现两类明显回归：

- `EntityHeader` 实际高度大于编辑器第一行，红色对象标题区压到下方搜索 / 历史导航 / “+ 参数”工具栏；
- `Select` 下拉菜单虽然自身有高 `z-index`，但后续参数组的 sticky header、Reset / 跳转按钮仍绘制在菜单上方。

这次根因不只是单条 selector，而是项目同时存在两条全局 CSS 加载路径：

```text
index.html <link href="/src/*.css">
main.tsx import './styles.css' / './polish.css'
```

Vite 的模块 CSS 会在运行时进入级联，导致 `styles.css` / `polish.css` 可能位于原本标成 `final` 的 HTML link 样式之后。于是源码文件名和 HTML 排序看起来正确，实际浏览器级联顺序却不是维护者以为的顺序。

## 永久规则

### 红线 1：禁止混用 HTML link 与模块 CSS

`frontend/index.html` 禁止加载 `/src/*.css`：

```html
<!-- 禁止 -->
<link rel="stylesheet" href="/src/theme-final.css" />
```

全局样式必须进入同一模块级联链。

当前加载契约：

```text
main.tsx
  -> styles.css        基础层
  -> polish.css        终端业务层；文件顶部导入 app.css
       -> app.css      purpose-specific late-layer manifest
```

`app.css` 的顺序是维护契约，不是随意排列：

```text
catalog-browser.css
qt-density.css
settings-panel.css
inspector-combined.css
navigation-polish.css
workspace-polish.css
editor-control-grid.css
workspace-final-fixes.css
theme-final.css
ui-library-integration.css
```

`ui-library-integration.css` 位于 late layers 最后，用于保证共享控件的业务宿主尺寸和层级协调不会再被早期历史 CSS 反向覆盖。

### 红线 2：禁止“final 文件名”替代真实级联保证

`theme-final.css`、`workspace-final-fixes.css` 之类名称不提供任何浏览器优先级。

维护者必须依据**真实加载顺序 + selector specificity + stacking context**判断结果，不能因为文件名带 `final` 就假设它最后生效。

### 红线 3：共享浮层必须验证跨业务行 stacking context

Select / MultiSelect popup 在普通 Showcase 中正常，并不代表放进带 sticky header 的滚动表格后一定正常。

业务表格可以协调：

- 当前打开菜单所在参数行的 stacking level；
- 其他参数行和 sticky group header 在菜单打开期间的业务层级；
- popup 所处业务宿主允许 overflow visible。

但禁止因此进入 Select 内部修改文字、图标、padding、Knob 等实现细节。

### 红线 4：Header 宿主高度与共享 EntityHeader 高度必须一致

如果业务编辑器第一行是 `66px`，则 `EntityHeader` 的业务宿主集成也必须是 `66px`。

禁止出现：

```text
.editor first row = 66px
EntityHeader host/component = 82px
```

否则即使没有明显 overflow 属性错误，也会形成视觉覆盖和命中区域错位。

## 自动检查

`npm run check:ui-css` 现在会阻止：

- `index.html` 再次通过 `<link>` 加载 `/src/*.css`；
- `polish.css` 不再以 `@import './app.css'` 开始；
- `app.css` late-layer 顺序被随意改变；
- 之前已经定义的 settings / `.tc-*` 组件边界红线被破坏。

发现检查失败时不得删除检查器、弱化规则或通过更多 `!important` 绕过。

## 结论

本次回归与 BoolSwitch / Select 的 `.settingRow span` 事件属于同一类架构问题：**浏览器实际级联和组件边界才是真相，文件命名和肉眼猜测不是。**

以后 UI 修复先确认真实加载链、最终 computed style 和 stacking context，再改视觉代码。
