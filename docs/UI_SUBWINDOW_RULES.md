# Rulesmd Editor 子窗口 / 模态窗口开发规则

本文是 `docs/UI_DEVELOPMENT_RULES.md` 的补充红线，专门约束所有弹窗、子窗口、模态编辑器和覆盖层。

## 1. 统一入口

所有**新建的 React 模态窗口**必须使用：

```text
frontend/src/AppDialog.tsx
```

业务组件不得直接重新实现整套遮罩层、`position: fixed`、`role="dialog"`、`aria-modal`、关闭按钮和 z-index。

原因：业务组件经常位于表格、滚动区、`overflow` 容器或新的 stacking context 中。直接在当前组件树里渲染模态层，容易被裁切、被其他层覆盖或因为父级 transform/filter 改变 fixed 定位参照。`AppDialog` 统一把 UI Library 的 `Dialog` portal 到 `document.body`，让模态窗口脱离业务布局层级。

## 2. UI 所有权

- `Terry_React_UI_Library/Dialog`：拥有模态窗口本体、标题栏、遮罩、基础 z-index、关闭按钮、dark/light 基础行为。
- `AppDialog`：只负责 portal 和主题变量桥接，不重新实现 Dialog 外观。
- 业务组件：只负责弹窗里的业务内容，例如 Verses 的 11 路伤害倍率编辑器。
- `ui-library-integration.css`：只有在某个业务弹窗确实需要 Dialog 宿主尺寸适配时，才允许做上下文级集成；不得重写 Dialog 内部实现。

## 3. 禁止事项

禁止新代码出现以下模式：

```tsx
<div className="xxxDialogLayer">
  <section role="dialog" aria-modal="true">...</section>
</div>
```

禁止业务功能自己维护独立的遮罩层 z-index，例如：

```css
.myDialogLayer { z-index: 99999; }
```

禁止因为窗口被裁切或看不到，就不断提高 z-index、添加负 margin、transform 或把 overflow 改成 visible。先检查弹窗是否经过 `AppDialog`。

## 4. 主题

Portal 会离开 `.app.tc-theme` 的 DOM 继承链，因此 `AppDialog` 必须把当前应用计算后的主题变量桥接到 portal 子树。业务弹窗不得为此复制一套独立颜色。

## 5. 新增弹窗前的固定检查

新增或修改任何子窗口前：

1. 先阅读 `docs/UI_DEVELOPMENT_RULES.md` 与本文。
2. 确认是否可直接使用 `AppDialog`。
3. 确认没有手写 `role="dialog"` / `aria-modal` 外壳。
4. 在参数表、滚动区和普通页面入口都验证弹窗可见。
5. 检查窗口缩放后仍完整落在视口内。
6. 检查深色与浅色模式。
7. 运行 `npm run check:ui-css`。

## 6. 自动红线

`frontend/scripts/check-ui-css.mjs` 会阻止：

- 新文件直接从 `terry-react-ui-library` 导入 `Dialog`；
- 新业务文件手写 `role="dialog"` 或 `aria-modal` 模态外壳；
- 删除统一的 `AppDialog.tsx`。

当前少数历史根级 Dialog 文件暂时在明确 allowlist 中。新增功能不得继续扩大 allowlist；后续重构时应逐步迁移到 `AppDialog`。

## 7. Verses 事件结论

伤害百分比调整窗口过去由 `VersesControl` 自己实现 portal、遮罩、窗口 shell 和 z-index。虽然局部能够工作，但它形成了第二套模态窗口体系，导致此类“子窗口突然不显示/被裁切/样式丢失”的问题缺少统一保障。

现在 Verses 只保留业务内容，窗口本体统一交给 `AppDialog + Terry_React_UI_Library/Dialog`。以后所有新增子窗口都按同一模式处理。
