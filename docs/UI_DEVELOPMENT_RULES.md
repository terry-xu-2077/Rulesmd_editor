# Rulesmd Editor UI 开发规则

本文是 Rulesmd Editor 前端 UI 的强制开发规范。它不是建议清单，而是组件边界、CSS 作用域和调试流程的维护契约。

> **红线事件：BoolSwitch / Select 被 `.settingRow span` 污染导致垂直错位。**
>
> 这次问题连续多轮表现为“组件内部差几像素”，实际根因却是业务 CSS 的宽泛 descendant selector 穿透 UI Library DOM。以后任何代码不得重新引入同类结构。

相关复盘：`docs/UI_COMPONENT_INTEGRATION_PITFALLS.md`。

## 1. UI 所有权分层

### Terry_React_UI_Library 拥有

- `BoolSwitch`、`Select`、`TextField`、`Slider`、`MultiSelect`、`Dialog`、`Button` 等通用原子组件。
- 原子组件内部 DOM。
- Track / Knob / 输入框 / 下拉按钮 / 菜单项 / Reset 等内部几何。
- 组件自身 dark / light 主题。
- 组件内部 `margin`、`padding`、`line-height`、`height`、`transform`、动画等。

### Rulesmd Editor 拥有

- 工作区布局。
- 参数表列宽。
- 设置页卡片、间距、说明文字和响应式布局。
- 业务按钮、业务导航、帮助面板、对象树等。
- UI Library 的公开主题通道与明确的业务槽位。

### 专用文件归属

```text
frontend/src/settings-panel.css
```

是设置窗口布局的**唯一所有者**。

```text
frontend/src/ui-library-integration.css
```

是 Rulesmd Editor 与 UI Library 的集中接入层。只有确实属于“业务槽位尺寸 / 公共主题通道”的规则才能放在这里。

`polish.css`、`theme-final.css`、`qt-density.css` 等业务样式文件不得再次维护 settings layout。

## 2. 红线：禁止宽泛 descendant 标签选择器

### 绝对禁止

```css
.settingRow span { ... }
.settingRow button { ... }
.settingRow input { ... }
.settingsDialogBody div { ... }
.panel span { ... }
.dialog button { ... }
```

原因：业务容器里的 UI Library 组件同样包含 `span`、`button`、`input`、`div`。这种规则会越过组件边界，且通常比组件自身 selector 更具体。

本次 BoolSwitch / Select 错位就是由：

```css
.settingRow span {
  margin-top: 6px;
}
```

直接触发。

### 允许

必须命中明确的业务语义节点，优先使用类名；临时情况下至少使用 direct child：

```css
.settingsDialogBody .settingRow > div:first-child > strong { ... }
.settingsDialogBody .settingRow > div:first-child > span { ... }
```

更推荐 JSX 明确语义类：

```text
settingsItem
settingsCopy
settingsControl
```

然后 CSS 只针对这些业务类。

## 3. 红线：业务 CSS 禁止进入 UI Library 内部

设置页和普通业务 CSS 禁止修改以下类型的内部节点：

```text
.tc-legacy-switch
.tc-legacy-switch-knob
.tc-select-button
.tc-select-current
.tc-select-item
.tc-option-icon
.tc-range
.tc-number
.tc-reset
.tc-pop
.tc-picker
```

尤其禁止：

```css
.settingRow .tc-select-button { ... }
.settingRow .tc-legacy-switch-knob { ... }
.app[data-mode="light"] .tc-range { ... }
```

如果需要改变这些节点的几何、主题或行为，必须回到 `Terry_React_UI_Library` 修复。

Rulesmd Editor 可以放置 UI Library 的**外层组件根节点**，但不能通过业务 CSS重新定义内部实现。

## 4. 红线：禁止“像素补偿式修复”掩盖根因

出现错位时，禁止先写：

```css
top:-2px;
margin-top:-3px;
transform:translateY(-1px);
```

除非已经证明该位移就是组件设计的一部分。

任何“修了几轮只是往正确方向爬一点”的现象，都必须停止继续补偿，转入边界排查：

1. UI Library Showcase 是否正常。
2. 实际运行的 UI Library SHA 是否是最新。
3. DevTools / WebView2 Computed Style 中最终是谁写入了 margin / padding / line-height / transform。
4. 是否有父级业务 selector 命中组件内部 DOM。
5. 是否存在多个文件同时维护同一块 UI。

## 5. 红线：一个区域只能有一个 CSS 所有者

设置窗口只能由 `settings-panel.css` 负责。

禁止在以下文件重新添加设置页规则：

```text
polish.css
theme-final.css
ui-library-integration.css
qt-density.css
workspace-polish.css
workspace-final-fixes.css
```

历史文件里若存在旧规则，应逐步删除，而不是靠后加载文件反复覆盖。

同一个控件也只能有一个尺寸所有者。例如 BoolSwitch 不允许同时出现：

```text
React width prop
UI Library 默认宽度
业务 CSS !important 再覆盖一次
```

## 6. 主题规则

`.app.tc-theme` 只通过 UI Library 的公开主题通道提供颜色：

```text
--tc-base
--tc-accent
--tc-effect
--tc-text-main
--tc-text-bright
```

通用控件的 dark / light 细节由 UI Library 自己处理。

`theme-final.css` 只允许维护 Rulesmd Editor 的业务 UI，不允许再出现 `.tc-*` 选择器。

## 7. 设置页特别规则

设置页可以控制：

- 卡片背景和边框。
- 两列 / 单列响应式布局。
- 标题和说明文字。
- 业务控制区的对齐。
- 设置内容区滚动。

设置页不可以控制：

- BoolSwitch Knob / Track。
- Select button / current label / option item。
- TextField input 内部高度和 padding。
- Slider track / thumb。
- Reset button 的内部几何。

如果组件在设置页不适合当前尺寸，优先：

1. 使用组件公开 prop；
2. 如果缺少合理公开 API，则回 UI Library 增加 API；
3. 禁止在业务页直接钻入组件内部改 CSS。

## 8. UI Library 版本验证

Rulesmd Editor 跟随：

```text
Terry_React_UI_Library#main
```

启动 / build 前由同步脚本检查实际 SHA。

排查 UI 组件问题前，必须确认日志出现：

```text
Synchronizing UI library main -> <sha>
Vite optimized dependency cache invalidated after UI library update.
UI library synchronized successfully: <sha>
```

如果运行 SHA 不正确，不允许继续根据截图修改组件 CSS。

## 9. 自动红线检查

前端提供：

```bash
npm run check:ui-css
```

开发和构建都会自动执行：

```text
npm run dev
npm run build
```

检查器当前强制阻止：

- `polish.css` / `theme-final.css` / `ui-library-integration.css` 重新接管设置窗口。
- 设置页重新出现危险的宽泛 descendant 标签 selector。
- 设置页直接修改 UI Library 内部节点。
- `theme-final.css` 重新出现 `.tc-*` 控件覆盖。

遇到：

```text
[UI CSS RED LINE] Boundary violations found
```

不得绕过检查或删掉检查器；应修改违反边界的 CSS / 组件归属。

## 10. 提交前 UI 检查清单

UI 相关提交至少确认：

- [ ] 我修改的是正确责任层。
- [ ] 没有用裸 `span/button/input/div` descendant selector 包围共享组件。
- [ ] 没有在业务 CSS 修改 UI Library 内部几何。
- [ ] 没有用负 margin / top / translate 作为未知根因的补偿。
- [ ] 同一块 UI 没有多个 CSS 文件同时维护。
- [ ] UI Library 修改先在 Showcase 验证。
- [ ] 实际运行 SHA 与 UI Library main 一致。
- [ ] `npm run check:ui-css` 通过。
- [ ] dark / light 两种模式都检查。

## 11. 本次红线事件的永久结论

Web、React、Tauri、WebView2 都可以稳定实现像素级控件对齐。

当一个原子组件在不同业务容器中出现几像素漂移，第一怀疑对象不再是“Web 技术限制”，而是：

```text
CSS 作用域污染
组件边界失守
重复样式所有权
实际依赖版本不一致
```

**禁止再用业务 CSS 修共享组件内部位置。**

这条规则属于项目 UI 开发红线，不因“只差 1～2px”而例外。
