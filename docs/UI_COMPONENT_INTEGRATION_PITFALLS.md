# UI 组件集成踩坑记录

本文记录 Rulesmd Editor 接入 `Terry_React_UI_Library` 时已经验证过的高风险问题和处理原则。目标不是记录某一次视觉微调，而是避免以后再次出现“组件在 UI Library 中正常、放进业务页面后错位，并连续多轮靠位置补丁修不干净”的情况。

## 1. BoolSwitch 垂直错位事件

### 症状

设置窗口中的 `BoolSwitch` 出现明显的 Knob 下沉：

- 外轨位置正常；
- ON/OFF Knob 贴近下沿；
- 先后尝试 Grid、绝对定位、`top:50% + translateY(-50%)`、Flex 后，只能看到 Knob 一点点“往上爬”，始终无法稳定居中；
- 同一组件在不同业务容器里表现可能不同。

### 真正根因

Rulesmd Editor 旧业务 CSS 存在过宽选择器：

```css
.settingRow span {
  margin-top: 6px;
  ...
}
```

UI Library 的 `BoolSwitch` Knob 本身也是一个 `<span>`。因此业务页本来只想给“设置说明文字”增加间距，却把同一条规则穿透到了 UI Library 组件内部，给 Knob 额外增加了 `margin-top`。

这类问题的危险点是：

1. 组件内部几何看起来像错了，但真正错误来自父业务页面；
2. 继续修改组件 `top/left/transform/grid/flex` 会产生“似乎有改善”的假象；
3. 每一轮局部补偿都会掩盖污染源，让后续调试越来越困难；
4. Web / WebView2 并不存在“无法把开关居中”的技术限制，问题是 CSS 作用域和组件边界失守。

最终修复分两层：

- UI Library 的原子组件对自身关键几何属性做边界加固，避免普通业务 descendant selector 轻易改变 Knob 的 margin / padding / line-height 等；
- Rulesmd Editor 侧禁止再使用 `.settingRow span`、`.xxx button` 这类会穿透通用组件内部的宽泛标签选择器，只允许命中明确的业务语义节点或 direct child。

## 2. 调试顺序：先判断是谁的责任

以后遇到 UI Library 组件在业务页面异常，固定按以下顺序排查：

```text
组件在 UI Library Showcase 是否正常？
        ↓
正常 -> 查业务 CSS 污染 / 布局约束
异常 -> 回 UI Library 修组件本身
```

禁止一上来就在 Rulesmd Editor 写“临时版组件”或用 `top:-2px`、`margin-top:-3px` 等方式补偿。

建议同时检查浏览器 / WebView2 计算后的最终样式，而不是只读源码。重点观察：

- margin / padding
- width / height / min-width / max-width
- line-height
- display / align-items / justify-content
- position / top / left / transform
- box-sizing
- 哪个 selector 最终赢得优先级

如果视觉上只有几像素偏差，先确认是否有父页面的裸标签规则命中了组件内部元素。

## 3. CSS 作用域规则

### 禁止

```css
.settingRow span { ... }
.settingRow button { ... }
.panel div { ... }
.dialog input { ... }
```

这些规则都会无意命中第三方 / UI Library 组件内部 DOM。

### 推荐

业务文本使用明确语义类或 direct child：

```css
.settingRow > .settingCopy > .settingDescription { ... }
```

当前设置页在尚未完全语义化 DOM 前，至少应使用：

```css
.settingsDialogBody .settingRow > div:first-child > strong { ... }
.settingsDialogBody .settingRow > div:first-child > span { ... }
```

不要为了设置说明文字去修改 `.tc-*` 内部节点。

## 4. 组件尺寸所有权只能有一个

曾出现过以下三层同时决定 BoolSwitch 宽度的情况：

```text
React prop: width={180}
UI Library default: 78px
Rulesmd Editor CSS: !important -> 78px
```

这属于架构异味。原则固定为：

- Track / Knob 内部几何：只归 UI Library；
- 组件公开 `width` prop：由业务在确有上下文需求时使用；
- 同一实例不要再由业务 CSS `!important` 二次改写公开 prop 的结果；
- 设置页优先使用 BoolSwitch 的 UI Library 默认紧凑宽度；
- 参数表若需要更宽的上下文槽位，应通过公开 API，而不是覆盖 Knob 内部 CSS。

## 5. UI Library 版本必须确认“实际运行版本”

Rulesmd Editor 过去把 UI Library 固定到 tarball commit，造成一个常见误区：UI Library 仓库已经修复，但业务程序实际仍运行旧 `node_modules` / Vite 优化缓存。

现在开发链路改为跟随 `Terry_React_UI_Library#main`，启动 / build 前执行同步脚本：

```text
scripts/sync-ui.ps1
```

判断同步真正完成，至少要看到：

```text
Synchronizing UI library main -> <sha>
Vite optimized dependency cache invalidated after UI library update.
UI library synchronized successfully: <sha>
```

只有在确认实际运行 SHA 与 UI Library `main` 一致后，才继续判断 CSS / 组件问题。

## 6. 设置页样式归属

设置窗口的业务布局统一由：

```text
frontend/src/settings-panel.css
```

负责。

`ui-library-integration.css` 只负责 UI Library 在工作区中的通用接入变量和业务槽位，不再重复维护 settings layout。

后续修改设置页时：

- 可以控制卡片、列宽、间距、响应式、说明文字；
- 不修改 `.tc-legacy-switch-knob`、`.tc-select-*` 等组件内部几何；
- 不新增针对裸 `span/button/input/div` 的 descendant selector；
- 如果某个 UI Library 原子组件本身有 bug，回 `Terry_React_UI_Library` 修复并在 Showcase 验证。

## 7. 本次事件的结论

这次问题不是 Web 技术或 Tauri/WebView2 的局限，而是典型的 CSS 全局作用域污染。

以后遇到“修了十几轮还差几像素”的情况，应优先怀疑：

1. 是否在修错责任层；
2. 是否存在业务 CSS 穿透组件内部；
3. 是否同时存在多个尺寸所有者；
4. 实际运行的依赖 SHA 是否真的是刚修的版本；
5. 是否被 Vite / node_modules 缓存混入旧 CSS。

先证明组件边界，再做视觉微调。不要用更多补丁掩盖边界问题。
