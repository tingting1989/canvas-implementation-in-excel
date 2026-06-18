# ResizeHandleRenderer — 调整手柄渲染器

## 概述

`ResizeHandleRenderer` 负责列宽/行高拖拽调整时虚线参考线的状态管理与绘制。它从 `HeaderRenderer` 中独立出来，遵循单一职责原则。

## 文件位置

```
src/render/ResizeHandleRenderer.js
```

## 设计意图

- **职责分离**：将调整虚线逻辑从 `HeaderRenderer` 的 558 行中剥离，使表头绘制与交互反馈解耦。
- **极简 API**：仅 2 个公开方法 — `setResizeLine` 设状态 + `render` 画虚线。
- **自包含状态**：独立管理 `#resizeLine`，不依赖外部状态机。

## 工作原理

### 列宽调整流程

```
ResizeStrategy.onDrag()
  → resizeRenderer.setResizeLine(HIT_TYPE.COL_RESIZE, colIndex, lineX)
  → resizeRenderer.render(ctx, viewW, viewH)
    → 绘制从 (lineX, 0) 到 (lineX, viewH) 的垂直虚线
  → 拖拽结束时 resizeRenderer.setResizeLine(null) 清除
```

### 行高调整流程

```
ResizeStrategy.onDrag()
  → resizeRenderer.setResizeLine(HIT_TYPE.ROW_RESIZE, rowIndex, lineY)
  → resizeRenderer.render(ctx, viewW, viewH)
    → 绘制从 (0, lineY) 到 (viewW, lineY) 的水平虚线
  → 拖拽结束时 resizeRenderer.setResizeLine(null) 清除
```

## API

| 方法 | 签名 | 说明 |
|------|------|------|
| `setResizeLine` | `(type: string \| null, index: number, position: number) => void` | 设置或清除调整线状态 |
| `render` | `(ctx, viewW, viewH) => void` | 绘制调整线虚线 |

### setResizeLine 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | `string \| null` | `HIT_TYPE.COL_RESIZE` 或 `HIT_TYPE.ROW_RESIZE`，`null` 清除 |
| `index` | `number` | 被调整的行/列索引（仅记录，不影响绘制） |
| `position` | `number` | 虚线在 canvas 上的像素位置（x 或 y） |

### 视觉样式

| 属性 | 值 |
|------|-----|
| 颜色 | `CONFIG.SELECTION_COLOR` |
| 线宽 | `2px` |
| 线型 | 虚线 `[4, 3]`（4px 实线 + 3px 空白） |

## 生命周期

```
setResizeLine(COL_RESIZE, idx, x) → render() → setResizeLine(null) → 清除
                                    [每帧重复渲染]
```

拖拽开始时 `ResizeStrategy` 调用 `setResizeLine()` 设置虚线位置；拖拽过程中每帧由 `HeaderRenderer.render()` 调用 `render()` 绘制；拖拽结束时策略调用 `setResizeLine(null)` 清除。

## 调用方

| 模块 | 调用方法 | 场景 |
|------|----------|------|
| `ResizeStrategy` | `setResizeLine()` | 列宽/行高拖拽开始、更新、结束 |
| `HeaderRenderer` | `render()` | 每次 `render()` 末尾委托绘制 |

## 与 HeaderRenderer 的关系

`HeaderRenderer` 持有 `resizeRenderer` 属性，在 `render()` 末尾调用：

```js
// HeaderRenderer.render() 末尾
this.resizeRenderer.render(ctx, viewW, viewH);
this.dragRenderer.renderColumnMoveIndicator(ctx, sheet, ...);
this.dragRenderer.renderRowMoveIndicator(ctx, sheet, viewW, viewH);
```

调整线绘制在拖拽指示器之前，确保虚线和幽灵效果按正确的 z-order 叠加。
