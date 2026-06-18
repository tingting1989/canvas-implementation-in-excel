# DragIndicatorRenderer — 拖拽指示器渲染器

## 概述

`DragIndicatorRenderer` 负责列/行拖拽移动时的视觉反馈渲染，包含幽灵元素（半透明跟随矩形）、幽灵头标签（源位置标识）和插入指示线（目标位置标记）。它从 `HeaderRenderer` 中独立出来，使表头绘制与拖拽反馈分离。

## 文件位置

```
src/render/DragIndicatorRenderer.js
```

## 设计意图

- **职责分离**：将拖拽视觉反馈从 `HeaderRenderer` 的 558 行中剥离，`HeaderRenderer` 回归纯表头绘制。
- **自包含状态**：独立管理 `#columnMoveState` / `#rowMoveState`，无需依赖外部状态机。
- **查询接口**：对外暴露 `hasColumnMove()` / `hasRowMove()` / `isColumnSource()` / `isRowSource()` 供 `HeaderRenderer` 在绘制时判断是否需要高亮源列/行。
- **三层视觉反馈**：每种拖拽（列/行）都包含幽灵区域 + 幽灵头标签 + 插入指示线三个层级。

## 工作原理

### 列拖拽流程

```
ColumnMoveStrategy.onDrag()
  → dragRenderer.setColumnMoveState({ sourceCol, targetCol, colX, colW, dragX, dragStartX, scrollX })
  → HeaderRenderer.render()
    → dragRenderer.renderColumnMoveIndicator(ctx, sheet, scrollX, viewW, viewH)
      → 1. 幽灵列：半透明矩形 (GHOST_FILL) + 描边 (SELECTION_COLOR)
      → 2. 幽灵列头：深色底 (MOVE_SOURCE_FILL) + 白色文字
      → 3. 插入指示线：3px 竖线标记目标位置
```

### 行拖拽流程

```
RowMoveStrategy.onDrag()
  → dragRenderer.setRowMoveState({ sourceRow, targetRow, rowY, rowH, dragY, dragStartY, scrollY })
  → HeaderRenderer.render()
    → dragRenderer.renderRowMoveIndicator(ctx, sheet, scrollY, viewW, viewH)
      → 1. 幽灵行：半透明矩形 (GHOST_FILL) + 描边
      → 2. 幽灵行头：深色底 (MOVE_SOURCE_FILL) + 白色文字
      → 3. 插入指示线：3px 横线标记目标位置
```

### 插入指示器位置计算

```
target > source → 指示器位于目标列/行的右侧/下侧（含其宽度/高度）
target < source → 指示器位于目标列/行的左侧/上侧
```

## API

### 状态设置

| 方法 | 签名 | 说明 |
|------|------|------|
| `setColumnMoveState` | `(state: object \| null) => void` | 设置或清除列拖拽状态 |
| `setRowMoveState` | `(state: object \| null) => void` | 设置或清除行拖拽状态 |

**state 对象结构（列拖拽）**：
```js
{
    sourceCol: 3,       // 拖拽源列索引
    targetCol: 5,       // 目标插入位置列索引（可能等于 sourceCol）
    colX: 200,          // 源列在数据区域的 x 偏移
    colW: 100,          // 源列宽度
    dragX: 350,         // 当前鼠标 x 坐标（世界坐标）
    dragStartX: 200,    // 拖拽开始时鼠标 x 坐标（世界坐标）
    scrollX: 0,         // 当前水平滚动偏移
}
```

**state 对象结构（行拖拽）**：
```js
{
    sourceRow: 2,
    targetRow: 6,
    rowY: 60,
    rowH: 30,
    dragY: 180,
    dragStartY: 60,
    scrollY: 0,
}
```

### 查询方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `hasColumnMove()` | `boolean` | 当前是否有列拖拽进行中 |
| `hasRowMove()` | `boolean` | 当前是否有行拖拽进行中 |
| `isColumnSource(col)` | `boolean` | 指定列是否为拖拽源列 |
| `isRowSource(row)` | `boolean` | 指定行是否为拖拽源行 |

### 渲染方法

| 方法 | 说明 |
|------|------|
| `renderColumnMoveIndicator(ctx, sheet, scrollX, viewW, viewH)` | 渲染列拖拽三件套（幽灵列 + 幽灵头 + 指示线） |
| `renderRowMoveIndicator(ctx, sheet, scrollY, viewW, viewH)` | 渲染行拖拽三件套（幽灵行 + 幽灵头 + 指示线） |

这两个方法由 `HeaderRenderer.render()` 内部调用，外部无需直接调用。

## 视觉常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `GHOST_FILL` | `rgba(76, 139, 245, 0.15)` | 幽灵列/行半透明填充 |
| `MOVE_SOURCE_FILL` | `rgba(76, 139, 245, 0.3)` | 幽灵头深色底 |
| `GHOST_TEXT_COLOR` | `#fff` | 幽灵头文字颜色 |
| `INDICATOR_WIDTH` | `3` | 插入指示线宽度（px） |

## 生命周期

```
setColumnMoveState(state) → renderColumnMoveIndicator() → setColumnMoveState(null) → 清除
                                 [每帧重复渲染]

setRowMoveState(state)    → renderRowMoveIndicator()    → setRowMoveState(null)    → 清除
```

拖拽开始时 `ColumnMoveStrategy` / `RowMoveStrategy` 调用 `setXMoveState(state)`；拖拽过程中每帧渲染时 `HeaderRenderer.render()` 调用对应的 `renderXMoveIndicator()`；拖拽结束时策略调用 `setXMoveState(null)` 清除状态。

## 调用方

| 模块 | 调用方法 | 场景 |
|------|----------|------|
| `ColumnMoveStrategy` | `setColumnMoveState()` | 列拖拽开始/更新/结束 |
| `RowMoveStrategy` | `setRowMoveState()` | 行拖拽开始/更新/结束 |
| `HeaderRenderer` | `hasColumnMove()` / `hasRowMove()` / `isColumnSource()` / `isRowSource()` | 绘制表头时判断是否跳过源列/行 |
| `HeaderRenderer` | `renderColumnMoveIndicator()` / `renderRowMoveIndicator()` | 绘制拖拽指示器 |

## 与 HeaderRenderer 的关系

`HeaderRenderer` 持有 `dragRenderer` 属性，在 `render()` 中按顺序调用：

```js
// 伪代码
render() {
    this.renderColumnHeaders(ctx, sheet);  // 跳过 isColumnSource 的列
    this.renderRowHeaders(ctx, sheet);     // 跳过 isRowSource 的行
    this.renderCorner(ctx, sheet);

    // 委托子渲染器
    this.dragRenderer.renderColumnMoveIndicator(ctx, sheet, ...);
    this.dragRenderer.renderRowMoveIndicator(ctx, sheet, ...);
    this.resizeRenderer.render(ctx, sheet, ...);
}
```
