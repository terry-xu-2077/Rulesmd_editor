# UI CSS 级联加载红线

这是 `docs/UI_DEVELOPMENT_RULES.md` 的补充红线，记录 2026-09-04 主界面回归事件，以及随后“合法新增 CSS 层却被红线检查器误拦截”的第二次事故。

## 事件一：双重 CSS 加载链导致级联失真

清理 CSS 污染后，主界面出现两类明显回归：

- `EntityHeader` 实际高度大于编辑器第一行，红色对象标题区压到下方搜索 / 历史导航 / “+ 参数”工具栏；
- `Select` 下拉菜单虽然自身有高 `z-index`，但后续参数组的 sticky header、Reset / 跳转按钮仍绘制在菜单上方。

根因不只是单条 selector，而是项目同时存在两条全局 CSS 加载路径：

```text
index.html <link href="/src/*.css">
main.tsx import './styles.css' / './polish.css'
```

Vite 的模块 CSS 会在运行时进入级联，导致 `styles.css` / `polish.css` 可能位于原本标成 `final` 的 HTML link 样式之后。于是源码文件名和 HTML 排序看起来正确，实际浏览器级联顺序却不是维护者以为的顺序。

## 事件二：检查器复制完整 manifest 导致合法启动失败

后来为了优化按钮、浅色模式和表格对齐，`app.css` 合法新增：

```text
button-polish.css
light-polish.css
table-alignment.css
```

但 `frontend/scripts/check-ui-css.mjs` 又维护了一份完整、硬编码的 late-layer 列表。结果 `app.css` 本身是正确的，检查器却因为自己的副本没有同步而阻止启动。

这类设计等价于同时维护两份 source of truth：

```text
app.css                    = 实际 manifest
check-ui-css.mjs           = 第二份 manifest 副本
```

它与之前“多个 CSS 文件共同拥有同一区域”的问题本质相同：**重复所有权最终一定会漂移。**

因此新增永久红线：检查器只能验证 manifest 的架构不变量，不能复制整个 manifest 作为第二份配置。

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

### 红线 2：`app.css` 是 late-layer 顺序的唯一 source of truth

当前实际 manifest 为：

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
button-polish.css
light-polish.css
table-alignment.css
ui-library-integration.css
```

以后新增合法的 purpose-specific CSS 层，只需要在 `app.css` 中明确插入正确位置。

**禁止**再在检查器、文档脚本或其他配置文件中复制一份完整列表并要求逐项完全相等。

检查器只允许验证这些不变量：

- 每个 import 的文件真实存在；
- 不允许重复 import；
- 架构核心层必须存在；
- 核心层之间的相对先后关系不能被破坏；
- `ui-library-integration.css` 必须保持为最后一个 late layer。

这样既能保持红线强度，也不会因为新增一个合法 CSS 文件而让开发环境无法启动。

### 红线 3：禁止“final 文件名”替代真实级联保证

`theme-final.css`、`workspace-final-fixes.css` 之类名称不提供任何浏览器优先级。

维护者必须依据**真实加载顺序 + selector specificity + stacking context**判断结果，不能因为文件名带 `final` 就假设它最后生效。

### 红线 4：共享浮层必须验证跨业务行 stacking context

Select / MultiSelect popup 在普通 Showcase 中正常，并不代表放进带 sticky header 的滚动表格后一定正常。

业务表格可以协调：

- 当前打开菜单所在参数行的 stacking level；
- 其他参数行和 sticky group header 在菜单打开期间的业务层级；
- popup 所处业务宿主允许 overflow visible。

但禁止因此进入 Select 内部修改文字、图标、padding、Knob 等实现细节。

### 红线 5：Header 宿主高度与共享 EntityHeader 高度必须一致

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
- `app.css` 引用了不存在或重复的 CSS 文件；
- 核心 late-layer 相对顺序被破坏；
- `ui-library-integration.css` 不再位于最后；
- 之前已经定义的 settings / `.tc-*` 组件边界红线被破坏。

但检查器**不得**因为 `app.css` 新增一个合法 purpose-specific layer 就失败。

发现检查失败时不得删除检查器、弱化组件边界规则或通过更多 `!important` 绕过；应判断失败的是“真实架构违规”还是“检查器自身复制了第二份配置”。

## 结论

本次两次回归与 BoolSwitch / Select 的 `.settingRow span` 事件属于同一类架构问题：**真实运行链和单一所有权才是真相，重复配置、文件命名和肉眼猜测都不是。**

以后 UI 修复先确认真实加载链、最终 computed style 和 stacking context；开发工具本身也必须遵守 single source of truth，不能为了防回归再制造第二个状态源。
