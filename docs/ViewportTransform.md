# 视口坐标转换器（ViewportTransform）技术文档

> 本文档介绍了 Canvas 电子表格引擎中统一管理「行列号 ↔ 视口像素坐标」双向转换的核心工具类，消除散落在多个渲染器中的重复坐标计算逻辑。

---

## 目录

- [1. 设计背景](#1-设计背景)
- [2. 坐标体系](#2-坐标体系)
- [3. 冻结区域处理](#3-冻结区域处理)
- [4. API 参考](#4-api-参考)
- [5. 使用示例](#5-使用示例)
- [6. 性能优化](#6-性能优化)
- [7. 迁移指南](#7-迁移指南)

---

## 1. 设计背景

### 问题

在引入 `ViewportTransform` 之前，坐标转换逻辑散落在 7+ 个文件中，存在严重的重复和一致性问题：

| 文件 | 重复的坐标计算 | 出现次数 |
|------|--------------|---------|
| `RenderEngine.js` | `headerW + getColX(col) - (col<fixedCols?0:sx)` | ~12 |
| `HeaderRenderer.js` | `headerW + getColX(c) - scrollX` | ~9 |
| `OverlayRenderer.js` | `headerW + x1 - scrollX` | ~8 |
| `DragIndicatorLayer.js` | `headerW + getColX(col) - scrollX` | ~4 |
| `Workbook.js` | 手写冻结区域可见性判断 | ~30行 |

**后果**：每次新增功能或调整冻结逻辑，需要同步修改多处，容易遗漏导致坐标系不一致的 bug。历史上多次出现的"拖拽列宽后错位"、"冻结列右侧空白"、"列头与单元格不对齐"等 bug，根因都是某处忘记同步冻结区域的 `effectiveSx = col < fixedCols ? 0 : sx` 判断。

### 解决方案

提取 `ViewportTransform` 公共类，将冻结区域判断内聚，调用方无需关心冻结细节：

```mermaid
+-------------------+        +-------------------+
|   RenderEngine    |------->|                   |
| (hitTest/getCell) |        |  ViewportTransform|
+-------------------+        |  (统一坐标转换)    |
+-------------------+        |                   |
|    Workbook       |------->|  - 冻结判断内聚    |
| (scroll callback) |        |  - 纯计算无副作用  |
+-------------------+        +-------------------+
+-------------------+                 |
| HeaderRenderer    |------->         |
+-------------------+                 v
+-------------------+        +-------------------+
| OverlayRenderer   |------->|   RowColManager   |
+-------------------+        |  (行列像素计算)    |
+-------------------+        +-------------------+
| DragIndicatorRend.|------->
+-------------------+
```

---

## 2. 坐标体系

`ViewportTransform` 涉及两套坐标系：

### 数据坐标（dataX / dataY）

- **原点**：单元格区域左上角（不含表头）
- **含义**：从表格数据区域左上角算起的像素坐标
- **用途**：`RowColManager.getColX(col)` 返回的就是数据坐标

### 视口坐标（viewX / viewY）

- **原点**：Canvas 左上角
- **含义**：包含表头偏移的像素坐标，用于实际绘制和命中检测
- **转换关系**：`viewX = headerW + dataX - effectiveScrollX`

```
Canvas 左上角
  ┌──────────────────────────────────────┐
  │ 表头区域    │  数据区域                │
  │ (headerW)  │  (viewX - headerW)      │
  │            │                          │
  │  viewX=0   │  viewX = headerW + dataX │
  └──────────────────────────────────────┘
```

---

## 3. 冻结区域处理

### 冻结列/行的行为

冻结列（`fixedColumnsStart`）和冻结行（`fixedRowsTop`）始终固定显示在左侧/顶部，不随滚动移动。

### effectiveScroll 机制

对于冻结区域内的列/行，滚动偏移视为 0：

```javascript
// 冻结列：effectiveSx = 0，列位置不受 scrollX 影响
const effectiveSx = col < this.fixedCols ? 0 : this.scrollX;
return this.headerW + this.rc.getColX(col) - effectiveSx;
```

### 命中检测的路径选择

视口坐标转行列号时，需判断鼠标是否在冻结区域，选择不同的转换路径：

```javascript
viewXToDataX(viewX) {
    const inFrozenCols = this.frozenColsW > 0 && viewX <= this.headerW + this.frozenColsW;
    // 冻结区域：不加上 scrollX
    // 非冻结区域：加上 scrollX 还原数据坐标
    return inFrozenCols ? viewX - this.headerW : viewX - this.headerW + this.scrollX;
}
```

### 为什么内聚冻结判断？

| 之前（散落各处） | 之后（ViewportTransform 内聚） |
|----------------|---------------------------|
| 每个渲染器手写 `col < fixedCols ? 0 : sx` | 调用方只需 `vt.colToViewX(col)` |
| 容易漏写导致坐标系不一致 | 冻结逻辑集中在类内部，单点维护 |
| 新增冻结相关功能需改多处 | 只需修改 `ViewportTransform` 一处 |

---

## 4. API 参考

### 构造函数

```javascript
new ViewportTransform(sheet, scrollX, scrollY)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `sheet` | `Sheet` | 当前工作表 |
| `scrollX` | `number` | 水平滚动偏移（像素） |
| `scrollY` | `number` | 垂直滚动偏移（像素） |

### 实例属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `sheet` | `Sheet` | 当前工作表 |
| `rc` | `RowColManager` | 行列管理器（`sheet.rowColManager` 的快捷引用） |
| `scrollX` | `number` | 水平滚动偏移 |
| `scrollY` | `number` | 垂直滚动偏移 |
| `headerW` | `number` | 行头宽度 |
| `headerH` | `number` | 列头高度 |
| `fixedCols` | `number` | 冻结列数 |
| `fixedRows` | `number` | 冻结行数 |
| `frozenColsW` | `number` | 冻结列像素宽度 |
| `frozenRowsH` | `number` | 冻结行像素高度 |

### 列坐标转换

| 方法 | 签名 | 说明 |
|------|------|------|
| `colToViewX` | `(col: number) => number` | 列左边缘 → 视口 X 坐标（自动处理冻结） |
| `colRightToViewX` | `(col: number) => number` | 列右边缘 → 视口 X 坐标 |
| `viewXToDataX` | `(viewX: number) => number` | 视口 X → 数据 X（自动判断冻结区域） |
| `viewXToCol` | `(viewX: number) => number` | 视口 X → 列号（命中检测） |
| `colRightToDataX` | `(col: number) => number` | 列右边缘 → 数据 X 坐标 |

### 行坐标转换

| 方法 | 签名 | 说明 |
|------|------|------|
| `rowToViewY` | `(row: number) => number` | 行顶边缘 → 视口 Y 坐标（自动处理冻结） |
| `rowBottomToViewY` | `(row: number) => number` | 行底边缘 → 视口 Y 坐标 |
| `viewYToDataY` | `(viewY: number) => number` | 视口 Y → 数据 Y（自动判断冻结区域） |
| `viewYToRow` | `(viewY: number) => number` | 视口 Y → 行号（命中检测） |
| `rowBottomToDataY` | `(row: number) => number` | 行底边缘 → 数据 Y 坐标 |

### 单元格矩形

| 方法 | 签名 | 说明 |
|------|------|------|
| `cellToViewRect` | `(row: number, col: number) => {x, y, w, h}` | 单元格 → 视口矩形 |
| `mergeToViewRect` | `(merge: {topRow, topCol, bottomRow, bottomCol}) => {x, y, w, h}` | 合并区域 → 视口矩形 |

### 冻结区域判定

| 方法 | 签名 | 说明 |
|------|------|------|
| `isInFrozenCols` | `(col: number) => boolean` | 列是否在冻结区域 |
| `isInFrozenRows` | `(row: number) => boolean` | 行是否在冻结区域 |
| `isViewXInFrozenCols` | `(viewX: number) => boolean` | 视口 X 是否落在冻结列区域 |
| `isViewYInFrozenRows` | `(viewY: number) => boolean` | 视口 Y 是否落在冻结行区域 |

### 可见性判断

| 方法 | 签名 | 说明 |
|------|------|------|
| `isCellVisible` | `(row, col, canvasW, canvasH, tabH=0) => boolean` | 单元格是否在可视区域内（用于编辑器滚动隐藏等场景） |

---

## 5. 使用示例

### 基本用法

```javascript
import { ViewportTransform } from "../render/ViewportTransform.js";

// 在渲染或命中检测时实例化
const vt = new ViewportTransform(sheet, scrollX, scrollY);

// 单元格 → 视口矩形
const rect = vt.cellToViewRect(row, col);
ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

// 视口坐标 → 列号（命中检测）
const col = vt.viewXToCol(mouseX);

// 列右边缘位置（用于绘制分隔线）
const lineX = vt.colRightToViewX(col);
```

### 合并单元格

```javascript
// mergeInfo 的行号为实际行号，需先转为页面行号
const pageMerge = {
    topRow: merge.topRow,
    topCol: merge.topCol,
    bottomRow: merge.bottomRow,
    bottomCol: merge.bottomCol,
};
const rect = vt.mergeToViewRect(pageMerge);
```

### 编辑器可见性判断

```javascript
const vt = new ViewportTransform(sheet, scrollX, scrollY);
const visible = vt.isCellVisible(
    activeRow, activeCol,
    canvasW, canvasH,
    CONFIG.SHEET_TAB_HEIGHT  // 标签栏高度
);
if (visible) {
    activeEditor.restoreFromScroll();
} else {
    activeEditor.hideForScroll();
}
```

### 命中检测

```javascript
const vt = new ViewportTransform(sheet, scrollX, scrollY);
const rect = canvas.getBoundingClientRect();
const px = clientX - rect.left;
const py = clientY - rect.top;

if (vt.isViewXInFrozenCols(px)) {
    // 鼠标在冻结列区域
    const col = vt.viewXToCol(px);
}
```

---

## 6. 性能优化

### 实例缓存

`ViewportTransform` 是轻量、无副作用的纯计算对象，但 `RenderEngine` 在高频方法（`hitTest`、`getCellRect`）中通过缓存复用实例，避免频繁创建：

```javascript
// RenderEngine 内部缓存
#getViewportTransform() {
    const sx = this.scrollMgr.scrollX;
    const sy = this.scrollMgr.scrollY;
    const sheetKey = `${sheet.name}:${frozenColsW}:${frozenRowsH}:${headerW}:${headerH}`;
    // 仅在 sheet/scroll 变化时重建
    if (!this.#cachedVT || this.#cachedVTSheetKey !== sheetKey
        || this.#cachedVT.scrollX !== sx || this.#cachedVT.scrollY !== sy) {
        this.#cachedVT = new ViewportTransform(sheet, sx, sy);
        this.#cachedVTSheetKey = sheetKey;
    }
    return this.#cachedVT;
}
```

### 缓存失效条件

| 变化场景 | 失效依据 |
|---------|---------|
| 滚动 | `scrollX` / `scrollY` 变化 |
| 拖拽列宽/行高 | `frozenColsW` / `frozenRowsH` 变化 |
| 切换工作表 | `sheet.name` 变化 |
| 表头尺寸变化 | `headerW` / `headerH` 变化 |

### 性能对比

| 场景 | 之前（手写计算） | 之后（ViewportTransform + 缓存） |
|------|---------------|---------------------------|
| 鼠标移动 hitTest | 每次重新计算多个变量 | 复用缓存实例，直接调用方法 |
| 滚动回调 | 30+ 行可见性判断 | 一行 `isCellVisible` 调用 |
| 代码维护 | 改冻结逻辑需同步多处 | 只改 `ViewportTransform` 一处 |

---

## 7. 迁移指南

### 从手写坐标计算迁移

**之前（散落各处的手写计算）：**

```javascript
const headerW = sheet.getHeaderWidth();
const frozenColsW = sheet.frozenColsWidth;
const fixedCols = sheet.fixedColumnsStart;
const sx = this.scrollMgr.scrollX;

const effectiveSx = col < fixedCols ? 0 : sx;
const x = headerW + rc.getColX(col) - effectiveSx;
const w = rc.getColWidth(col);
```

**之后（使用 ViewportTransform）：**

```javascript
const vt = this.#getViewportTransform();
const { x, w } = vt.cellToViewRect(row, col);
```

### 迁移清单

以下文件已迁移完成：

| 文件 | 迁移的方法 | 状态 |
|------|----------|------|
| `RenderEngine.getCellRect` | 合并/普通单元格矩形 | ✅ 完成 |
| `RenderEngine.hitTest` | 列头/行头/单元格命中 | ✅ 完成 |
| `RenderEngine.headerHitTest` | 调整手柄命中 | ✅ 完成 |
| `RenderEngine.fillHandleHitTest` | 填充手柄命中 | ✅ 完成 |
| `Workbook.#setupScrollCallback` | 编辑器可见性判断 | ✅ 完成 |

以下文件可后续逐步迁移（当前公式与 ViewportTransform 一致，风险可控）：

| 文件 | 待迁移内容 |
|------|-----------|
| `HeaderRenderer` | 列头/行头坐标计算 |
| `OverlayRenderer` | 选区/合并边框坐标 |
| `DragIndicatorLayer` | 移动指示线坐标 |

### 注意事项

1. **行号转换**：`ViewportTransform` 的 `rowToViewY` 等方法接收**页面行号**。若持有实际行号，直接使用实际行号即可。
2. **合并单元格**：`mergeToViewRect` 接收的 merge 对象的行号也应是页面行号。
3. **缓存实例的线程安全**：`RenderEngine` 的缓存是实例级别的，同一时刻只有一个 sheet 在渲染，无需考虑并发。