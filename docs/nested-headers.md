# 嵌套表头（Nested Headers）

> 参考 [Handsontable nestedHeaders API](https://handsontable.com/docs/javascript-data-grid/api/nested-headers/)，支持多层列头渲染，每层均可通过 `colspan` 实现跨列合并。

---

## 目录

- [1. 功能概览](#1-功能概览)
- [2. 快速开始](#2-快速开始)
- [3. 数据结构](#3-数据结构)
- [4. API 参考](#4-api-参考)
- [5. 渲染架构](#5-渲染架构)
- [6. 布局与尺寸计算](#6-布局与尺寸计算)
- [7. 各模块改动详解](#7-各模块改动详解)
- [8. 与普通表头的交互](#8-与普通表头的交互)
- [9. 完整示例](#9-完整示例)
- [10. 注意事项](#10-注意事项)

---

## 1. 功能概览

### 效果展示

```
┌─────────┬───────────────┬──────────────────────────────────────┐
│  行头   │    基本信息    │              工作信息                │
│  (1)    ├───────┬───────┼────────┬────────┬─────────┬─────────┤
│         │  姓名  │  年龄  │  城市   │  部门  │    薪酬            │
│         ├───────┼───────┼────────┼────────┼─────────┼─────────┤
│         │ Name  │  Age  │  City  │  Dept  │ Salary  │Hire Date│
├─────────┼───────┼───────┼────────┼────────┼─────────┼─────────┤
│    1    │Zhang S│   25  │Beijing │  Tech  │ $15,000 │2020-03  │
│    2    │ Li Si │   30  │Shanghai│  Mkt   │ $18,000 │2019-07  │
└─────────┴───────┴───────┴────────┴────────┴─────────┴─────────┘
```

### 核心特性

| 特性 | 说明 |
|------|------|
| **多层表头** | 支持任意层数的列头，每层独立渲染 |
| **colspan 跨列** | 上层表头单元格可跨越多列，自动合并绘制 |
| **动态高度** | 表头总高度 = `嵌套层数 × HEADER_HEIGHT`，自动适配 |
| **CSS 变量联动** | 垂直滚动条 top 位置跟随表头高度动态调整 |
| **与 colHeaders 兼容** | 最底层叶子层可继续使用 `colHeaders` 配置 |

---

## 2. 快速开始

```js
const wb = new Workbook("grid", {
    data: [
        ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
        ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
    ],
    nestedHeaders: [
        [{ label: "基本信息", colspan: 2 }, { label: "工作信息", colspan: 4 }],
        ["姓名", "年龄", "城市", "部门", { label: "薪酬", colspan: 2 }],
        ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
    ],
});

wb.initRender();
wb.render();
```

---

## 3. 数据结构

### `nestedHeaders` 配置格式

```typescript
type NestedHeaders = Array<Array<string | NestedHeaderCell>>;

interface NestedHeaderCell {
    label: string;       // 该表头单元格显示的文本
    colspan: number;     // 该单元格跨越的列数，默认 1
}
```

### 二维数组结构说明

```mermaid
nestedHeaders: [
    [第0层 - 顶层],
    [第1层],
    [第2层 - 叶子层],
]
```

- **外层数组**：每一行对应一层表头，从顶层（第 0 层）到叶子层。
- **内层数组**：每层从左到右的列定义，元素按顺序消费列号。
- **`colspan`**：当前元素占据的列数，后续列被跳过直到 `colspan` 消费完毕。
- **字符串元素**：等价于 `{ label: "xxx", colspan: 1 }`。
- **叶子层**：通常不设 `colspan`，每列一一对应。也可使用 `colHeaders` 配置兜底。

### 列号消费示例

```js
nestedHeaders: [
    ["A", { label: "B-C", colspan: 2 }, "D"],  // 消费 4 列
]
// 列号映射：
// col 0 → "A"
// col 1 → "B-C" (colspan=2, 覆盖 col 1~2)
// col 2 → "B-C" 覆盖范围内
// col 3 → "D"
```

---

## 4. API 参考

### 构造选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `nestedHeaders` | `Array<Array>` | `null` | 嵌套表头配置，二维数组 |

### Sheet 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getNestedHeaderRowCount()` | — | `number` | 获取嵌套表头总层数，未配置返回 `0` |
| `getNestedColHeader(rowIndex, col)` | `number, number` | `{label, colspan}\|null` | 获取指定层、指定列的表头信息 |
| `getHeaderHeight()` | — | `number` | 获取表头总高度（px），`nestedCount × HEADER_HEIGHT` |

### Sheet 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `nestedHeaders` | `Array<Array>\|null` | `null` | 嵌套表头配置，读写均可 |

### CONFIG 常量

| 常量 | 默认值 | 说明 |
|------|--------|------|
| `HEADER_HEIGHT` | `28` | 每层表头高度（px） |
| `NESTED_HEADER_ROWS` | `1` | 未配置 nestedHeaders 时的默认层数 |

---

## 5. 渲染架构

### 渲染流程图

```mermaid
HeaderRenderer.render()
    |
    +-- #renderColumnHeaders()
    |       |
    |       +-- nestedCount > 0 ?
    |       |       |
    |       |       YES --> #renderNestedColumnHeaders()
    |       |       |         |
    |       |       |         +-- for layerIdx = 0..nestedCount-1
    |       |       |               |
    |       |       |               +-- 遍历该层定义，逐项消费列号
    |       |       |               +-- 处理 colspan 跨列
    |       |       |               +-- 计算可视区域裁剪
    |       |       |               +-- #drawHeaderCell() 背景
    |       |       |               +-- #drawHeaderText() 文字
    |       |       |               +-- #drawSeparator() 分隔线
    |       |       |
    |       |       NO --> 单层表头（原有逻辑）
    |       |
    |       +-- #drawSelectionLine() 选区高亮底线
    |
    +-- #renderRowHeaders()  使用 sheet.getHeaderHeight()
    +-- #renderCorner()      使用 sheet.getHeaderHeight()
    +-- #renderResizeLine()
    +-- #renderColumnMoveIndicator()  使用 sheet.getHeaderHeight()
    +-- #renderRowMoveIndicator()     使用 sheet.getHeaderHeight()
```

### 渲染层次（从上到下）

```
┌──────────────────────────────────────────────────┐
│  第 0 层（顶层）  Y = 0                           │
│  ┌──────────────┬──────────────────────────────┐  │
│  │   基本信息    │          工作信息             │  │
│  └──────────────┴──────────────────────────────┘  │
├──────────────────────────────────────────────────┤
│  第 1 层        Y = HEADER_HEIGHT × 1             │
│  ┌──────┬──────┬──────┬──────┬────────────────┐  │
│  │ 姓名  │ 年龄  │ 城市  │ 部门  │      薪酬      │  │
│  └──────┴──────┴──────┴──────┴────────────────┘  │
├──────────────────────────────────────────────────┤
│  第 2 层（叶子） Y = HEADER_HEIGHT × 2             │
│  ┌──────┬──────┬──────┬──────┬──────┬─────────┐  │
│  │ Name  │ Age  │ City  │ Dept │Salary│Hire Date│  │
│  └──────┴──────┴──────┴──────┴──────┴─────────┘  │
├═══════════════════════════════════════════════════┤
│               数据区域                             │
```

---

## 6. 布局与尺寸计算

### 表头高度动态计算

```mermaid
getHeaderHeight() = getNestedHeaderRowCount() × HEADER_HEIGHT

未配置 nestedHeaders 时：
  getNestedHeaderRowCount() = 0
  → 回退到 CONFIG.NESTED_HEADER_ROWS (1)
  → getHeaderHeight() = 1 × 28 = 28px

配置 3 层 nestedHeaders 时：
  getNestedHeaderRowCount() = 3
  → getHeaderHeight() = 3 × 28 = 84px
```

### CSS 变量联动

垂直滚动条通过 CSS 变量 `--header-height` 实现 top 位置动态跟随：

```css
/* ScrollManager 注入的样式 */
.cs-scrollbar-v {
    top: var(--header-height, 28px);  /* 默认 28px，嵌套表头时动态更新 */
}
```

```js
// RenderEngine.render() 中动态设置
if (headerH !== CONFIG.HEADER_HEIGHT) {
    this.wrap.style.setProperty("--header-height", `${headerH}px`);
}
```

### 各区域位置计算

```
可视区域布局：
┌─────────┬────────────────────────────────────┐
│ Corner  │  Column Headers                    │
│ W×headerH│  W=(viewW-headerW)  H=headerH     │
│ (0,0)   │  (headerW, 0)                     │
├─────────┼────────────────────────────────────┤
│ Row     │  Data Area                         │
│ Headers │  W=(viewW-headerW)                 │
│ W×      │  H=(viewH-headerH)                 │
│ (0,headerH)│ (headerW, headerH)              │
└─────────┴────────────────────────────────────┘
```

| 区域 | X | Y | 宽 | 高 |
|------|---|---|----|-----|
| Corner | `0` | `0` | `HEADER_WIDTH` | `getHeaderHeight()` |
| Column Headers | `HEADER_WIDTH` | `0` | `viewW - HEADER_WIDTH` | `getHeaderHeight()` |
| Row Headers | `0` | `getHeaderHeight()` | `HEADER_WIDTH` | `viewH - getHeaderHeight()` |
| Data Area | `HEADER_WIDTH` | `getHeaderHeight()` | `viewW - HEADER_WIDTH` | `viewH - getHeaderHeight()` |

---

## 7. 各模块改动详解

### 7.1 `src/constants/config.js`

新增常量：

```js
HEADER_HEIGHT: 28,          // 每层表头高度（语义调整为"单层高度"）
NESTED_HEADER_ROWS: 1,      // 嵌套表头默认行数
```

### 7.2 `src/workbook/Sheet.js`

新增属性与方法：

#### 属性

```js
/** @type {Array<Array<string|{label:string, colspan:number}>>|null} */
this.nestedHeaders = null;
```

#### `getNestedHeaderRowCount()`

```js
getNestedHeaderRowCount() {
    return Array.isArray(this.nestedHeaders) ? this.nestedHeaders.length : 0;
}
```

#### `getNestedColHeader(rowIndex, col)`

遍历指定层的元素，按 `colspan` 消费列号，定位 `col` 对应的表头定义。返回 `{label, colspan}` 或 `null`（列超出范围或被上层 colspan 跨越）。

#### `getHeaderHeight()`

```js
getHeaderHeight() {
    const rows = this.getNestedHeaderRowCount() || CONFIG.NESTED_HEADER_ROWS;
    return rows * CONFIG.HEADER_HEIGHT;
}
```

### 7.3 `src/workbook/SettingsApplier.js`

在 `apply()` 方法中新增：

```js
if (Array.isArray(settings.nestedHeaders)) {
    sheet.nestedHeaders = settings.nestedHeaders;
}
```

### 7.4 `src/render/HeaderRenderer.js`

#### `#renderColumnHeaders()` 改造

- 判断 `sheet.getNestedHeaderRowCount() > 0` 分流到嵌套/单层渲染
- 嵌套模式下调用 `#renderNestedColumnHeaders()`
- 所有使用 `CONFIG.HEADER_HEIGHT` 的地方改为 `sheet.getHeaderHeight()`

#### 新增 `#renderNestedColumnHeaders()`

核心渲染逻辑：

```mermaid
for layerIdx = 0 to nestedCount-1:
    layerY = layerIdx × HEADER_HEIGHT
    consumed = 0

    for each item in nestedHeaders[layerIdx]:
        label = item.label || item (string)
        colspan = item.colspan || 1
        startCol = consumed
        endCol = consumed + colspan - 1
        consumed += colspan

        // 可视区域裁剪
        if endCol < sc || startCol > ec: continue

        // 跳过隐藏列
        while visibleStartCol <= endCol && colWidth <= 0: visibleStartCol++

        // 计算 canvas 坐标
        x = headerW + colX(max(startCol, sc)) - scrollX
        totalW = colX(min(endCol, ec)) + colWidth - colX(max(startCol, sc))

        // 绘制
        drawHeaderCell(x, layerY, totalW, HEADER_HEIGHT)
        drawHeaderText(label, x + 4, layerY + HEADER_HEIGHT - 8)
        drawSeparator(rightEdge, layerY, rightEdge, layerY + HEADER_HEIGHT)

    // 层间分隔线（非最后一层）
    if layerIdx < nestedCount - 1:
        drawSeparator(底部横线)
```

#### 所有方法适配动态高度

以下方法全部从 `CONFIG.HEADER_HEIGHT` 改为 `sheet.getHeaderHeight()`：

| 方法 | 说明 |
|------|------|
| `#renderRowHeaders()` | 行头起始 Y 坐标 |
| `#renderCorner()` | 左上角交叉区域高度 |
| `#renderColumnMoveIndicator()` | 列移动指示器表头区域高度 |
| `#renderRowMoveIndicator()` | 行移动指示器起始 Y |
| `#drawSelectionLine()` | 选区高亮线位置 |

### 7.5 `src/render/RenderEngine.js`

| 位置 | 改动 |
|------|------|
| `render()` | `headerH = sheet.getHeaderHeight()`，传入 `scrollMgr.updateScrollBounds()` |
| `render()` | 动态设置 CSS 变量 `--header-height` |
| `getCellRect()` | `headerH = sheet.getHeaderHeight()` |
| `hitTest()` | `headerH = sheet.getHeaderHeight()` |
| `headerHitTest()` | `headerH = sheet.getHeaderHeight()` |
| `fillHandleHitTest()` | `headerH = sheet.getHeaderHeight()` |

### 7.6 `src/render/ScrollManager.js`

| 位置 | 改动 |
|------|------|
| 新增 `#headerH` 字段 | 存储当前表头高度 |
| `updateScrollBounds()` | 接受 `headerH` 参数，用于计算 `maxScrollY` |
| CSS 样式 `.cs-scrollbar-v` | `top: var(--header-height, 28px)` 支持动态值 |
| `updateScrollbars()` | 使用 `#headerH` 计算垂直滚动条滑块 |
| `scrollToCell()` | 使用 `#headerH` 计算可视高度 |
| 拖拽滑块计算 | 使用 `#headerH` 计算垂直滚动条轨道高度 |

### 7.7 `src/render/OverlayRenderer.js`

`renderMerges()` 和 `renderSelection()` 中所有 `CONFIG.HEADER_HEIGHT` 改为 `sheet.getHeaderHeight()`。

### 7.8 `src/render/TileRenderer.js`

`render()` 方法中使用 `sheet.getHeaderHeight()` 计算数据区域高度。

### 7.9 `src/workbook/Workbook.js`

`#setupScrollCallback()` 中使用 `this.activeSheet.getHeaderHeight()`。

---

## 8. 与普通表头的交互

### 优先级规则

```
nestedHeaders 配置了 → 使用 nestedHeaders 渲染多层表头
nestedHeaders 未配置   → 使用 colHeaders 渲染单层表头（原有行为）
nestedHeaders + colHeaders → nestedHeaders 优先，colHeaders 作为叶子层兜底
```

### 混合使用示例

```js
{
    nestedHeaders: [
        [{ label: "基本信息", colspan: 2 }, { label: "工作信息", colspan: 4 }],
        ["姓名", "年龄", "城市", "部门", { label: "薪酬", colspan: 2 }],
    ],
    colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
}
```

此时渲染 3 层：
- 第 0 层：`nestedHeaders[0]`
- 第 1 层：`nestedHeaders[1]`
- 第 2 层（叶子层）：由 `colHeaders` 提供标签

> **注意**：`colHeaders` 仅影响叶子层标签，不影响 `getHeaderHeight()` 的层数计算。层数由 `nestedHeaders.length` 决定。

### 叶子层 colHeaders 行为

当 `nestedHeaders` 的最后一层定义的列数与数据列数不匹配时：
- 多余列：超出 `nestedHeaders` 定义范围的列，由 `colHeaders` 或默认 A/B/C 标签兜底
- 不足列：`nestedHeaders` 最后一层若未覆盖所有列，`colHeaders` 补齐剩余列

---

## 9. 完整示例

```js
import { Workbook } from "./workbook/Workbook.js";

const wb = new Workbook("grid", {
    data: [
        ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
        ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
        ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
    ],
    colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
    rowHeaders: false,

    // 嵌套表头配置
    nestedHeaders: [
        [{ label: "基本信息", colspan: 2 }, { label: "工作信息", colspan: 4 }],
        ["姓名", "年龄", "城市", "部门", { label: "薪酬", colspan: 2 }],
        ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
    ],

    startRows: 100,
    startCols: 26,

    columns: [
        { type: "text", width: 120, style: { textAlign: "left" } },
        { type: "numeric", width: 80, style: { textAlign: "right" }, numericFormat: { pattern: "0" } },
        { type: "text", width: 100 },
        { type: "text", width: 100 },
        { type: "numeric", width: 100, style: { textAlign: "right" }, numericFormat: { pattern: "$0,0.00" } },
        { type: "date", width: 300 },
    ],

    defaultStyle: {
        fontSize: 14,
        fontFamily: "Microsoft YaHei",
        color: "#000",
    },
});

wb.initRender();
wb.render();
```

### 运行时动态修改

```js
const sheet = wb.getActiveSheet();

// 动态设置嵌套表头
sheet.nestedHeaders = [
    [{ label: "分组 A", colspan: 3 }, { label: "分组 B", colspan: 3 }],
    ["A1", "A2", "A3", "B1", "B2", "B3"],
];
wb.render();

// 清除嵌套表头，恢复单层
sheet.nestedHeaders = null;
wb.render();

// 动态添加一层
sheet.nestedHeaders = [
    [{ label: "总览", colspan: 6 }],
    ["A", "B", "C", "D", "E", "F"],
];
wb.render();
```

---

## 10. 注意事项

### 列数匹配

`nestedHeaders` 各层的总 `colspan` 应与数据列数一致，否则会出现空白表头或截断：

```js
// 数据有 6 列，但嵌套表头只覆盖 4 列
nestedHeaders: [
    [{ label: "基本信息", colspan: 2 }, { label: "工作信息", colspan: 2 }],
    // ⚠️ 第 4、5 列无表头定义，将使用 colHeaders 或默认标签兜底
]
```

### 隐藏列处理

嵌套表头渲染会自动跳过隐藏列（`colWidth <= 0`），但不会重新计算 colspan 的语义范围。隐藏列的宽度不参与跨列宽度计算。

### 性能

- 嵌套表头渲染仅在 `HeaderRenderer` 层面增加遍历开销，不影响 `TileRenderer` 的数据区域瓦片渲染性能
- 表头总高度增加会略微减小可视数据区域高度，但影响极小

### 兼容性

- 与 `colHeaders`、`rowHeaders`、列拖拽移动、行拖拽移动、列宽调整、选区高亮等功能完全兼容
- 列拖拽移动指示器（幽灵列头）当前仅使用叶子层标签（`colHeaders`），未来可扩展为多层幽灵渲染

### 选区高亮

当前版本嵌套表头层不支持选区高亮（`highlighted = false`），仅最底层表头下方绘制选区高亮底线。未来可扩展为多层高亮。

### CSS 变量

垂直滚动条的 `top` 位置通过 CSS 变量 `--header-height` 动态控制。在非嵌套表头模式下，该变量为默认值 `28px`，无需额外设置。

---

*文档生成时间：2026-06-16*  
*项目地址：canvas-implementation-in-excel*
