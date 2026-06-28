# FrozenLayer — 冻结层

## 概述

`FrozenLayer` 是渲染引擎的核心图层之一，负责渲染 **Excel 冻结区域** 的单元格数据和叠加效果。当用户配置了 `freeze.fixedColumnsStart` 或 `freeze.fixedRowsTop` 时，该图层会在视口的固定位置显示冻结区域的内容，使其在滚动时保持静止。

## 类结构

```
BaseLayer
  └── FrozenLayer (zIndex: 40)
        ├── tileRenderer: TileRenderer      // 冻结区域瓦片渲染器
        └── overlayRenderer: OverlayRenderer // 叠加效果渲染器
```

## 核心职责

| 职责 | 说明 |
|------|------|
| 冻结列渲染 | 固定左侧 N 列，仅垂直方向跟随滚动 |
| 冻结行渲染 | 固定顶部 M 行，仅水平方向跟随滚动 |
| 冻结角渲染 | 左上角交叉区域，完全静止不滚动 |
| 叠加效果 | 在冻结区域内渲染合并边框和选区 |

## 渲染区域划分

```
┌──────────┬─────────────────────┐
│  Header   │     Col Header       │
├──────────┼─────────────────────┤
│          │                      │
│ Frozen   │   Scrollable Area    │
│ Cols     │   (TileLayer)        │
│(Region 1) │                      │
├──────────┤                      │
│ Frozen   │                      │
│ Rows     │                      │
│(Region 2)│                      │
│          │                      │
└──────────┴─────────────────────┘

Region 1: 冻结列区域 (scrollX=0, scrollY=当前)
Region 2: 冻结行区域 (scrollX=当前, scrollY=0)
左上角:   冻结角区域 (scrollX=0, scrollY=0)
```

## 关键方法

### `markCellDirty(row, col, rc)`
标记单个单元格脏，使对应瓦片在下一次渲染时重绘。

### `markAllDirty()`
标记所有冻结瓦片为脏，通常在冻结配置变更或全局刷新时调用。

### `render(ctx, sheet, viewport, options)`
主渲染入口，根据冻结配置分 3 个区域调用 `#renderClippedRegion()`：
- **冻结列区域**: `(headerW, headerH, frozenColsW, viewH-headerH)`，scrollX=0
- **冻结行区域**: `(headerW, headerH, viewW-headerW, frozenRowsH)`，scrollY=0
- **冻结角区域**: `(headerW, headerH, frozenColsW, frozenRowsH)`，scrollX=0, scrollY=0

### `#renderClippedRegion(...)`
使用 `ctx.clip()` 裁剪绘制区域，防止冻结内容溢出到非冻结区域。

## 状态监听

通过 `bindStore()` 监听以下状态键：

| 键 | 触发场景 |
|----|----------|
| `frozen` | 冻结行列数配置变更 |
| `frozenOffset` | 冻结偏移量变更（拖动调整后） |
| `scroll` | 滚动位置变更 |
| `selection` | 单元格选区变更 |

## 性能特性

- **独立缓存**: 使用独立的 `TileCache`，与 `TileLayer` 的缓存隔离
- **脏状态缓存**: `_cachedFrozenColsW` / `_cachedFrozenRowsH` 缓存冻结尺寸，避免每帧重复检测
- **按需渲染**: 无冻结配置时直接跳过 (`frozenColsW === 0 && frozenRowsH === 0`)
- **分页支持**: 支持 `isPaginationActive` 选项下的真实行号转换

## 使用示例

```js
const frozenLayer = new FrozenLayer();

// 绑定到 RenderEngine
engine.addLayer(frozenLayer);

// 外部触发脏标记
frozenLayer.markCellDirty(0, 0);  // 标记单个单元格
frozenLayer.markAllDirty();         // 标记全部

// RenderEngine 内部自动调用 render()
```