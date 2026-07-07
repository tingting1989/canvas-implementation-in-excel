# 表头渲染架构重构设计文档（嵌套 + 非嵌套统一）

> **版本**: v1.1  
> **日期**: 2026-07-03  
> **状态**: 设计阶段  
> **关联 Issue**: 嵌套 col header 与冻结列行边框绘制系列 bug  
> **v1.1 变更**: 将非嵌套表头纳入统一 Fragment 管线，消除代码重复

---

## 目录

1. [背景与动机](#1-背景与动机)
2. [问题根因分析](#2-问题根因分析)
3. [当前架构剖析](#3-当前架构剖析)
4. [目标架构设计](#4-目标架构设计)
5. [核心数据模型](#5-核心数据模型)
6. [类与接口详细设计](#6-类与接口详细设计)
7. [渲染管线流程](#7-渲染管线流程)
8. [边框规则引擎](#8-边框规则引擎)
9. [非嵌套表头统一方案](#9-非嵌套表头统一方案)
10. [迁移策略](#10-迁移策略)
11. [测试策略](#11-测试策略)

---

## 1. 背景与动机

### 1.1 已修复的 Bug 清单

| # | Bug 描述 | 根因 | 修复位置 |
|---|---------|------|---------|
| B01 | colspan 跨冻结边界时，冻结区域内部错误绘制垂直边框 | `crossesFrozenBoundary` 时仍画了 `rightX` 处分隔线 | `HeaderRenderer.js:329` |
| B02 | 横向滚动导致冻结列表头水平边框逐渐消失 | `#drawNestedLayerSeparator` 中循环用 `c <= ec`（包含性），ec 应为排他性 | `HeaderRenderer.js:452` |
| B03 | 嵌套表头最后一行缺少底部 cell border | 层间分隔线只在 `layerIdx < nestedCount - 1` 时绘制，最后一层被跳过 | `HeaderRenderer.js:333` |
| B04 | 非嵌套表头同样缺少底部 cell border | 与 B03 同理，非嵌套表头也未显式绘制底部边框 | `HeaderRenderer.js:163-181` |

### 1.2 共同特征

四个 bug（B01-B03 嵌套 + B04 非嵌套）共享同一模式：

> **布局决策（是否跨边界、边界列归属、层间 vs 单元格边框）散落在渲染循环的多个位置，每个位置独立做 ad-hoc 判断，缺乏统一的数据模型来承载这些信息。**

### 1.3 重构目标

1. **消除渲染循环中的 ad-hoc 冻结判断** — 冻结相关的布局决策在渲染前一次性完成
2. **统一边框语义** — "层间分隔线"和"单元格边框"不再混用同一个函数
3. **索引约定强制一致** — 全项目使用半开区间 `[start, end)`
4. **可测试性** — 布局计算与像素绘制分离，前者可纯函数单元测试
5. **非嵌套与嵌套表头统一管线** — 非嵌套是嵌套的特例（1层、colspan=1），走同一条 Fragment → Painter 路径，消除代码重复并自动修复 B04

---

## 2. 问题根因分析

### 2.1 当前渲染流程的问题链

```
用户配置 nestedHeaders + freeze
        │
        ▼
┌─────────────────────────────────┐
│ HeaderRenderer.render()          │
│   ├─ #renderColumnHeaders()     │
│   │   ├─ 非冻结区域 clip+render  │ ← 第一次遍历
│   │   └─ 冻结区域 clip+render    │ ← 第二次遍历
│   │       └─ #renderNested...() │
│   │           ├─ 遍历每层         │
│   │           │   ├─ 遍历每个item  │
│   │           │   │   ├─ 计算 startCol/endCol/colspan
│   │           │   │   ├─ ❌ ad-hoc: crossesFrozenBoundary?
│   │           │   │   ├─ ❌ ad-hoc: x/rightX 坐标分支
│   │           │   │   ├─ ❌ ad-hoc: 文字对齐分支
│   │           │   │   └─ ❌ ad-hoc: 边框跳过判断
│   │           │   └─ ❌ ad-hoc: 层间分隔线范围计算
│   │           └─ 返回              │
└─────────────────────────────────┘
```

**核心矛盾**：一个逻辑上的嵌套单元格（colspan=2 的"基本信息"）在视觉上是一个整体，但被冻结机制强制拆成两个独立渲染区域。当前代码在**每次绘制操作**（背景、文字、右边框、下边框）中都重复做了"这个单元格跨不跨边界"的判断。

### 2.2 问题分类矩阵

| 维度 | 现状 | 问题 |
|------|------|------|
| **渲染分区** | 冻结/非冻结分两次独立 render | 跨边界单元格被切分，但视觉需保持整体感 |
| **坐标系分裂** | VT 对冻结列用 scrollX=0，非冻结用真实 scrollX | 同一单元格左右边缘走不同坐标路径 |
| **边界列归属** | sc/ec 在不同方法中含义不一致（包含/排他） | off-by-one 错误 |
| **边框语义** | `#drawNestedLayerSeparator` 同时承担层间线和单元格底线职责 | 最后一层底线被条件跳过 |
| **布局决策分散** | 5+ 个 if 分支处理冻结相关逻辑 | 改一处容易漏另一处 |
| **嵌套/非嵌套双轨制** | 嵌套走 `#renderNestedColumnHeaders()`，非嵌套走内联 for 循环 | 两套代码重复绘制背景、文字、边框；B04 隐患未被覆盖 |

---

## 3. 当前架构剖析

### 3.1 类依赖关系

```
RenderEngine
  └── LayerCompositor
        ├── TileLayer (zIndex=10)       — 数据瓦片
        ├── SelectionLayer (zIndex=20)  — 选区高亮
        ├── FrozenLayer (zIndex=30)     — 冻结区域数据
        ├── InteractionLayer (zIndex=40)— 交互指示
        └── HeaderLayer (zIndex=50)     — 表头 ← 本次重构目标
              └── HeaderRenderer
                    ├─ #renderColumnHeaders()
                    │   ├─ #renderHeaderRegion() × 2 (冻结/非冻结)
                    │   │   └─ #renderNestedColumnHeaders()  ← 核心问题所在
                    │   └─ #drawColSelectionLines()
                    ├─ #renderRowHeaders()
                    └─ #renderCorner()

ViewportTransform  ← 坐标转换（已良好封装）
HeaderLabelManager ← 表头标签解析（已良好封装）
```

### 3.2 关键文件职责

| 文件 | 行数 | 职责 | 问题点 |
|------|------|------|--------|
| `HeaderRenderer.js` | ~740 | 所有表头绘制 | `#renderNestedColumnHeaders` 承担了过多职责：布局计算 + 坐标转换 + 背景绘制 + 文字绘制 + 边框绘制 + 冻结特判；非嵌套分支（L163-181）与嵌套分支存在大量重复绘制代码，且同样缺少底部边框 |
| `ViewportTransform.js` | ~263 | 行列号↔视口坐标 | 已良好封装，无问题 |
| `HeaderLabelManager.js` | ~206 | 标签解析与尺寸 | 已良好封装，无问题 |
| `FrozenLayer.js` | ~283 | 冻结区域数据渲染 | 只负责数据单元格，不涉及表头 |

### 3.3 `#renderNestedColumnHeaders` 方法复杂度分析

```javascript
// 当前方法签名（~100 行）
#renderNestedColumnHeaders(ctx, sheet, vt, rc, sc, ec, rowH, headerFont, defaultStyle)
// 参数数量: 8 个
// 嵌套层级: 4 层 (for → for → if → if)
// ad-hoc 判断: 5 处 (crossesFrozenBoundary × 3 + visStart/visEnd + 边框跳过)
// 违反原则:
//   - 单一职责: 同时做布局、坐标、背景、文字、边框
//   - 开闭原则: 新增一种"特殊情况"需要修改此方法内部
```

---

## 4. 目标架构设计

### 4.1 设计原则

```
┌─────────────────────────────────────────────────────┐
│                   设计原则                           │
├─────────────────────────────────────────────────────┤
│ 1. 两阶段分离                                        │
│    Phase 1: Layout  → 纯数据计算，输出 Fragment 列表  │
│    Phase 2: Render  → 无脑遍历 Fragment，执行绘制      │
│                                                     │
│ 2. Fragment 作为唯一中间表示                          │
│    每个 Fragment 携带完整的绘制信息和边框规则          │
│    渲染循环不做任何布局决策                            │
│                                                     │
│ 3. FrozenBoundary 作为一等公民                        │
│    在 Layout 阶段显式建模冻结边界切割                  │
│    Render 阶段通过 Fragment.isPartial 标记感知         │
│                                                     │
│ 4. 边框规则声明式                                    │
│    通过 BorderMask 位域声明四边可见性                  │
│    不再需要 if-else 判断"该不该画这条边"               │
└─────────────────────────────────────────────────────┘
```

### 4.2 架构对比

```
【当前架构】                                    【目标架构】

嵌套表头路径:                                    nestedHeaders 配置
  nestedHeaders 配置                                  │
       │                                              ▼
       ▼                                    HeaderLayoutBuilder.build()
  #renderNestedColumnHeaders()                       │
  (混合: 布局+坐标+绘制+冻结判断)              ┌─────┴─────┐
       │                                        ▼             ▼
       │                                   LogicalCell[]  FrozenBoundaryInfo
       │                                   (逻辑单元格)    (冻结边界)
       │                                        │             │
       │                                        ▼             ▼
非嵌套表头路径:                             Fragment[]  ←  Fragmentizer.split()
  内联 for 循环                             (可视片段,      每个片段携带完整绘制信息)
  (重复: 背景绘制+文字绘制+边框绘制)          含 BorderMask)
       │                                        │
       │                                        ▼
       │                                   HeaderPainter.paint()
       │                                   (无脑遍历 Fragment,
       │                                    执行 Canvas 绘制)
       │                                   ↑ 嵌套和非嵌套共用同一个 Painter
       │
       ▼
  Canvas 像素                                Canvas 像素
```

### 4.3 模块划分

```
src/render/header/                      ← 新建目录
├── HeaderLayoutBuilder.js              ← Phase 1: 布局构建器
├── models/
│   ├── LogicalCell.js                  ← 逻辑单元格模型
│   ├── Fragment.js                     ← 可视片段模型
│   ├── BorderMask.js                   ← 边框掩码（位域）
│   └── FrozenBoundaryInfo.js           ← 冻结边界信息
├── HeaderPainter.js                    ← Phase 2: 像素绘制器
└── index.js                            ← 导出

src/render/HeaderRenderer.js            ← 保留作为薄包装层
  (重构后仅 ~50 行，委托给新模块)
```

---

## 5. 核心数据模型

### 5.1 LogicalCell — 逻辑单元格

代表 nestedHeaders 配置中的一个表头单元格，不考虑冻结和视口裁剪。

```javascript
/**
 * 逻辑嵌套表头单元格
 * 
 * 对应 nestedHeaders[layer][i] 解析后的结果。
 * 是"用户配置层面"的概念，不含任何视口/冻结相关信息。
 */
class LogicalCell {
  /** @type {number} 所属层索引 */
  layerIndex;

  /** @type {number} 起始列号（含） */
  startCol;

  /** @type {number} 结束列号（含） */
  endCol;

  /** @type {number} 跨越列数 (endCol - startCol + 1) */
  colspan;

  /** @type {string} 显示文本 */
  label;

  /** @type {object|null} 用户自定义样式 */
  style;

  /** @type {boolean} 是否为 colspan > 1 的合并单元格 */
  get isMerged() { return this.colspan > 1; }

  /**
   * 判断是否跨越指定的列边界
   * @param {number} boundaryCol - 边界列号
   * @returns {boolean}
   */
  crossesBoundary(boundaryCol) {
    return this.startCol < boundaryCol && this.endCol >= boundaryCol;
  }
}
```

### 5.2 FrozenBoundaryInfo — 冻结边界信息

将冻结边界从隐式的 `vt.fixedCols` 判断提升为一等公民。

```javascript
/**
 * 冻结边界信息
 * 
 * 在 Layout 阶段预计算，供 Fragmentizer 使用。
 * 将"是否有冻结"、"冻结在哪"从渲染时的隐式判断变为显式数据。
 */
class FrozenBoundaryInfo {
  /** @type {number} 固定列数（来自 sheet.fixedColumnsStart） */
  fixedCols;

  /** @type {number} 固定行数（来自 sheet.fixedRowsTop） */
  fixedRows;

  /** @type {boolean} 是否存在水平冻结边界 */
  get hasHorizontalBoundary() { return this.fixedCols > 0; }

  /** @type {boolean} 是否存在垂直冻结边界 */
  get hasVerticalBoundary() { return this.fixedRows > 0; }

  /**
   * 判断逻辑单元格是否跨越水平冻结边界
   * @param {LogicalCell} cell
   * @returns {boolean}
   */
  splitsCellHorizontally(cell) {
    return this.hasHorizontalBoundary && cell.crossesBoundary(this.fixedCols);
  }

  /**
   * 判断逻辑单元格是否跨越垂直冻结边界
   * @param {LogicalCell} cell
   * @returns {boolean}
   */
  splitsCellVertically(cell) {
    return this.hasVerticalBoundary && cell.crossesBoundary(this.fixedRows);
  }
}
```

### 5.3 BorderMask — 边框掩码（位域）

用位运算替代 if-else 判断边框可见性。

```javascript
/**
 * 边框掩码（位域）
 * 
 * 使用位运算声明四边的可见性，避免散落的 if-else。
 * 
 * 用法：
 *   const mask = BorderMask.TOP | BorderMask.BOTTOM | BorderMask.LEFT;
 *   if (mask & BorderMask.RIGHT) { ... } // 不画右边框
 */
export const BorderMask = Object.freeze({
  NONE:   0b0000,
  TOP:    0b0001,
  RIGHT:  0b0010,
  BOTTOM: 0b0100,
  LEFT:   0b1000,

  ALL:    0b1111,

  /** 合并单元格默认边框：只保留外边框，去除内部边框 */
  MERGED_DEFAULT: 0b1011,  // TOP | BOTTOM | LEFT （右侧由下一个单元格或区域边界处理）

  /** 跨冻结边界-冻结侧片段：无右边界（延续到非冻结区） */
  FROZEN_SIDE: 0b1001,      // TOP | BOTTOM | LEFT

  /** 跨冻结边界-非冻结侧片段：无左边界（承接冻结区） */
  SCROLL_SIDE: 0b0110,      // TOP | BOTTOM | RIGHT
});
```

### 5.4 Fragment — 可视片段

**这是整个重构的核心数据结构。** 每个 Fragment 代表一个逻辑单元格在当前视口中的可见部分，携带完整的绘制信息。

```javascript
/**
 * 可视片段
 * 
 * 一个 LogicalCell 在当前视口中的可见部分。
 * 当单元格完全在视口内时，Fragment = LogicalCell 的 1:1 映射。
 * 当单元格被冻结边界切割时，产生 2 个 Fragment（冻结侧 + 非冻结侧）。
 * 当单元格被视口边缘裁剪时，Fragment 的 x/y/w/h 被限制在 clipRect 内。
 * 
 * 关键设计：Fragment 携带 BorderMask，渲染器无需再做任何边框判断。
 */
class Fragment {
  // ─── 身份标识 ──────────────────────────────

  /** @type {LogicalCell} 来源逻辑单元格 */
  sourceCell;

  /** @type {number} 片段在源单元格中的列范围 [visStart, visEnd]（半开区间） */
  visStartCol;
  visEndCol;

  // ─── 视口坐标（已通过 ViewportTransform 转换） ──

  /** @type {number} 视口 X 坐标（px） */
  x;

  /** @type {number} 视口 Y 坐标（px） */
  y;

  /** @type {number} 宽度（px） */
  w;

  /** @type {number} 高度（px） */
  h;

  // ─── 绘制属性 ──────────────────────────────

  /** @type {BorderMask} 边框掩码 */
  borderMask;

  /** @type {object} 合并后的样式（defaultStyle + cell.style） */
  mergedStyle;

  /** @type {string} 显示文本 */
  text;

  /** @type {string} 字体字符串 */
  font;

  /** @type {string} 文本对齐方式 */
  textAlign;

  /** @type {number} 文本 X 坐标（已计算好） */
  textX;

  /** @type {number} 文本 Y 坐标（已计算好） */
  textY;

  /** @type {number} 文本最大宽度（用于截断） */
  maxTextWidth;

  // ─── 状态标记 ──────────────────────────────

  /** @type {boolean} 是否为跨冻结边界截断产生的片段 */
  isPartial;

  /** @type {'frozen'|'scroll'|'full'} 片段类型 */
  partialType;

  /** @type {boolean} 是否为拖拽源高亮 */
  isSource;

  /** @type {boolean} 是否在选区内 */
  isHighlighted;
}
```

---

## 6. 类与接口详细设计

### 6.1 HeaderLayoutBuilder — 布局构建器（Phase 1）

**职责**：将 nestedHeaders 配置 + 冻结信息 + 视口范围转换为 Fragment 列表。  
**特性**：纯函数式，无 Canvas 操作，可独立单元测试。

```javascript
class HeaderLayoutBuilder {

  /**
   * 构建指定层的可视片段列表
   * 
   * @param {object} opts
   * @param {Array} opts.layerData - nestedHeaders[layer] 原始配置数组
   * @param {number} opts.layerIndex - 层索引
   * @param {number} opts.layerY - 该层在视口中的 Y 坐标（px）
   * @param {number} opts.rowH - 每层高度（px）
   * @param {number} opts.sc - 可见起始列（排他性起始，半开区间左端）
   * @param {number} opts.ec - 可见结束列（排他性结束，半开区间右端）
   * @param {FrozenBoundaryInfo} opts.frozenBoundary - 冻结边界信息
   * @param {import('../ViewportTransform.js').ViewportTransform} opts.vt - 视口转换器
   * @param {import('../../workbook/Sheet.js').Sheet} opts.sheet - 工作表
   * @param {object} opts.defaultStyle - 默认样式
   * @param {string} opts.headerFont - 基础字体
   * @returns {Fragment[]} 排序后的可视片段列表（按 x 坐标升序）
   */
  buildLayerFragments(opts) {
    const { layerData, layerIndex, layerY, rowH, sc, ec, frozenBoundary, vt, sheet, defaultStyle, headerFont } = opts;

    // Step 1: 解析 LogicalCell 列表
    const logicalCells = this.#parseLayerCells(layerData, layerIndex);

    // Step 2: 过滤出与可见范围有交集的单元格
    const visibleCells = logicalCells.filter(c => c.endCol >= sc && c.startCol < ec);

    // Step 3: 将每个可见单元格转换为 Fragment（可能产生 1 或 2 个）
    const fragments = [];
    for (const cell of visibleCells) {
      const cellFragments = this.#cellToFragments(cell, {
        layerY, rowH, sc, ec, frozenBoundary, vt, sheet, defaultStyle, headerFont
      });
      fragments.push(...cellFragments);
    }

    // Step 4: 按 x 坐标排序
    fragments.sort((a, b) => a.x - b.x);

    return fragments;
  }

  /**
   * 将单个 LogicalCell 转换为 Fragment 列表
   * 
   * 正常情况：返回 1 个 Fragment
   * 跨冻结边界：返回 2 个 Fragment（冻结侧 + 非冻结侧）
   * 
   * @private
   */
  #cellToFragments(cell, ctx) {
    const { frozenBoundary, sc, ec, vt, ...rest } = ctx;

    if (frozenBoundary.splitsCellHorizontally(cell) && sc < frozenBoundary.fixedCols) {
      // 跨冻结边界：拆分为两个片段
      return [
        this.#createFragment(cell, {
          ...rest,
          visStartCol: cell.startCol,
          visEndCol: frozenBoundary.fixedCols - 1,
          vt,
          borderOverride: BorderMask.FROZEN_SIDE,
          partialType: 'frozen',
        }),
        this.#createFragment(cell, {
          ...rest,
          visStartCol: frozenBoundary.fixedCols,
          visEndCol: Math.min(cell.endCol, ec - 1),
          vt,
          borderOverride: BorderMask.SCROLL_SIDE,
          partialType: 'scroll',
        }),
      ];
    }

    // 正常情况：单一片段
    return [this.#createFragment(cell, {
      ...rest,
      visStartCol: Math.max(cell.startCol, sc),
      visEndCol: Math.min(cell.endCol, ec - 1),
      vt,
      borderOverride: cell.isMerged ? BorderMask.MERGED_DEFAULT : BorderMask.ALL,
      partialType: 'full',
    })];
  }

  /**
   * 创建单个 Fragment（核心坐标计算）
   * 
   * @private
   */
  #createFragment(cell, opts) {
    const { visStartCol, visEndCol, layerY, rowH, vt, sheet, defaultStyle, headerFont, borderOverride, partialType } = opts;
    const rc = sheet.rowColManager;
    const cp = sheet.cellPadding;

    // 坐标计算（统一通过 VT）
    const x = vt.colToViewX(visStartCol);
    const rightX = vt.colRightToViewX(visEndCol);
    const totalW = rightX - x;

    if (totalW <= 0) return null;

    // 样式合并
    const mergedStyle = this.#mergeStyle(defaultStyle, cell.style);

    // 文字属性计算
    const textAlign = cell.style?.textAlign || 'left';
    const effectiveW = partialType === 'frozen' ? rc.getColWidth(cell.startCol) : totalW;
    const textX = this.#calcTextX(x, effectiveW, textAlign, cp);
    const font = this.#buildFont(headerFont, cell.style);

    return new Fragment({
      sourceCell: cell,
      visStartCol,
      visEndCol,
      x, y: layerY, w: totalW, h: rowH,
      borderMask: borderOverride,
      mergedStyle,
      text: cell.label,
      font, textAlign,
      textX, textY: layerY + rowH - 8,
      maxTextWidth: effectiveW - cp * 2,
      isPartial: partialType !== 'full',
      partialType,
    });
  }
}
```

### 6.2 HeaderPainter — 像素绘制器（Phase 2）

**职责**：遍历 Fragment 列表，执行 Canvas 绘制操作。**不做任何布局决策。**

```javascript
class HeaderPainter {

  /**
   * 绘制所有片段
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {Fragment[]} fragments - 来自 HeaderLayoutBuilder 的输出
   * @param {object} extras - 外部扩展（选区线、插件渲染器等）
   */
  paintAll(ctx, fragments, extras = {}) {
    for (const frag of fragments) {
      if (!frag) continue;
      this.#paintBackground(ctx, frag);
      this.#paintText(ctx, frag);
      this.#paintBorders(ctx, frag);
    }

    // 层底边框（始终绘制，不受 fragment 循环影响）
    if (extras.layerBottomY != null) {
      this.#paintLayerBottomBorder(ctx, fragments, extras.layerBottomY, extras.vt, extras.rc);
    }

    // 插件扩展渲染器
    if (extras.columnHeaderRenderers) {
      for (const frag of fragments) {
        if (!frag || !frag.sourceCell) continue;
        for (const renderer of extras.columnHeaderRenderers) {
          try {
            renderer(ctx, frag.visStartCol, frag.x, frag.y, frag.w, frag.h);
          } catch (e) { /* warn */ }
        }
      }
    }
  }

  /** 绘制背景 */
  #paintBackground(ctx, frag) {
    const { x, y, w, h, isSource, isHighlighted, mergedStyle } = frag;
    
    if (isSource) {
      ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
      ctx.fillRect(x, y, w, h);
    } else if (isHighlighted) {
      ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
      ctx.fillRect(x, y, w, h);
    } else if (mergedStyle?.backgroundColor) {
      ctx.fillStyle = mergedStyle.backgroundColor;
      ctx.fillRect(x, y, w, h);
    }
  }

  /** 绘制文字 */
  #paintText(ctx, frag) {
    const { text, textX, textY, font, textAlign, mergedStyle, maxTextWidth } = frag;
    if (!text) return;

    ctx.font = font;
    ctx.textAlign = textAlign;
    if (mergedStyle?.color) ctx.fillStyle = mergedStyle.color;

    // 截断逻辑（复用现有实现）
    if (ctx.measureText(text).width > maxTextWidth) {
      const ellipsis = '...';
      let truncated = text;
      while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxTextWidth) {
        truncated = truncated.slice(0, -1);
      }
      ctx.fillText(truncated + ellipsis, textX, textY);
    } else {
      ctx.fillText(text, textX, textY);
    }
  }

  /** 绘制边框（根据 BorderMask） */
  #paintBorders(ctx, frag) {
    const { x, y, w, h, borderMask } = frag;
    const { TOP, RIGHT, BOTTOM, LEFT } = BorderMask;

    ctx.strokeStyle = CONFIG.GRID_COLOR;
    ctx.lineWidth = 1;

    if (borderMask & RIGHT)  this.#drawVLine(ctx, x + w, y, y + h);
    if (borderMask & BOTTOM) this.#drawHLine(ctx, x, y + h, x + w);
    if (borderMask & LEFT)   this.#drawVLine(ctx, x, y, y + h);
    if (borderMask & TOP)    this.#drawHLine(ctx, x, y, x + w);
  }

  /** 绘制层底边框线（覆盖整行的可见范围） */
  #paintLayerBottomBorder(ctx, fragments, bottomY, vt, rc) {
    if (fragments.length === 0) return;

    let leftmostX = Infinity;
    let rightmostX = -Infinity;

    for (const frag of fragments) {
      if (!frag) continue;
      leftmostX = Math.min(leftmostX, frag.x);
      rightmostX = Math.max(rightmostX, frag.x + frag.w);
    }

    if (rightmostX > leftmostX) {
      this.#drawHLine(ctx, leftmostX, bottomY, rightmostX);
    }
  }

  #drawVLine(ctx, x, y1, y2) {
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  }

  #drawHLine(ctx, x1, y, x2) {
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  }
}
```

### 6.3 重构后的 HeaderRenderer（薄包装层）

```javascript
class HeaderRenderer {
  #layoutBuilder = new HeaderLayoutBuilder();
  #painter = new HeaderPainter();

  render(ctx, sheet, vt, viewW, viewH, dragIndicator = null) {
    this._dragIndicator = dragIndicator;
    const range = sheet.selection.getRange();

    this.#renderColumnHeaders(ctx, sheet, vt, viewW, range);
    this.#renderRowHeaders(ctx, sheet, vt, viewH, range);
    this.#renderCorner(ctx, vt, range);
  }

  #renderColumnHeaders(ctx, sheet, vt, viewW, range) {
    const rc = sheet.rowColManager;
    const headerW = vt.headerW;
    const rowH = CONFIG.HEADER_HEIGHT;
    const defaultStyle = sheet.getDefaultStyle();
    const headerFont = this.#buildHeaderFont(defaultStyle);
    const nestedCount = sheet.getNestedHeaderRowCount();
    const totalHeaderH = vt.headerH;
    const frozenColsW = vt.frozenColsW;
    const fixedCols = vt.fixedCols;

    // 背景填充
    ctx.fillStyle = CONFIG.HEADER_BG;
    ctx.fillRect(headerW, 0, viewW - headerW, totalHeaderH);

    // 冻结/非冻结区域分别渲染
    const regions = [
      { isFrozen: false, clipX: headerW + frozenColsW, clipW: viewW - headerW - frozenColsW },
    ];
    if (frozenColsW > 0) {
      regions.unshift({ isFrozen: true, clipX: headerW, clipW: frozenColsW });
    }

    for (const region of regions) {
      this.#renderHeaderRegion(ctx, sheet, vt, region, {
        rowH, defaultStyle, headerFont, nestedCount, range, fixedCols,
      });
    }

    // 选区高亮线（保持不变）
    if (!this._dragIndicator?.hasColumnMove()) {
      this.#drawColSelectionLines(ctx, sheet, vt, totalHeaderH, viewW, range, frozenColsW, fixedCols);
    }
  }

  #renderHeaderRegion(ctx, sheet, vt, region, sharedOpts) {
    const { isFrozen, clipX, clipW } = region;
    const { rowH, defaultStyle, headerFont, nestedCount, range, fixedCols } = sharedOpts;
    const rc = sheet.rowColManager;
    const clipH = vt.headerH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, 0, clipW, clipH);
    ctx.clip();

    if (nestedCount > 0) {
      const sc = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
      const ec = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);
      const frozenBoundary = new FrozenBoundaryInfo({ fixedCols, fixedRows: 0 });

      for (let layerIdx = 0; layerIdx < nestedCount; layerIdx++) {
        const layerY = layerIdx * rowH;
        const layerData = sheet.nestedHeaders[layerIdx];
        if (!Array.isArray(layerData)) continue;

        const fragments = this.#layoutBuilder.buildLayerFragments({
          layerData, layerIndex: layerIdx, layerY, rowH, sc, ec,
          frozenBoundary, vt, sheet, defaultStyle, headerFont,
        });
        this.#enrichFragmentsWithState(fragments, range);
        this.#painter.paintAll(ctx, fragments, {
          layerBottomY: layerY + rowH,
          vt, rc,
          columnHeaderRenderers: this.#columnHeaderRenderers,
        });
      }
    } else {
      // ★ 非嵌套表头：统一走 Fragment 管线（详见第 9 节）
      const sc = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
      const ec = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);

      const fragments = this.#layoutBuilder.buildSimpleLayerFragments({
        sc, ec, layerY: 0, rowH, vt, sheet, defaultStyle, headerFont,
      });
      this.#enrichFragmentsWithState(fragments, range);
      this.#painter.paintAll(ctx, fragments, {
        layerBottomY: rowH,
        vt, rc,
        columnHeaderRenderers: this.#columnHeaderRenderers,
      });
    }

    ctx.restore();
  }
}
```

---

## 7. 渲染管线流程

### 7.1 完整数据流

```
┌──────────────────────────────────────────────────────────────────┐
│                        渲染帧开始                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  HeaderRenderer.render()                                          │
│                                                                    │
│  ① 准备共享参数                                                    │
│     - vt (ViewportTransform)                                      │
│     - defaultStyle, headerFont                                     │
│     - nestedCount, rowH                                            │
│     - frozenBoundary = new FrozenBoundaryInfo({fixedCols})        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  ② 对每个渲染区域（冻结 / 非冻结）执行：                             │
│                                                                    │
│     ┌────────────────────────────────────────────────────────┐   │
│     │ ctx.save() → clip(clipRect)                             │   │
│     │                                                          │   │
│     │   ③ 对每一层 (layerIdx = 0..nestedCount-1):              │   │
│     │                                                          │   │
│     │   ┌──────────────────────────────────────────────────┐  │   │
│     │   │ Phase 1: Layout (HeaderLayoutBuilder)            │  │   │
│     │   │                                                  │  │   │
│     │   │  buildLayerFragments({                           │  │   │
│     │   │    layerData, layerIndex, layerY,                │  │   │
│     │   │    sc, ec,  ← 半开区间 [sc, ec)                 │  │   │
│     │   │    frozenBoundary,                               │  │   │
│     │   │    vt, sheet, defaultStyle, headerFont            │  │   │
│     │   │  })                                              │  │   │
│     │   │                                                  │  │   │
│     │   │  返回: Fragment[]                                │  │   │
│     │   │  例: [frag_基本信息_frozen, frag_工作信息,        │  │   │
│     │   │       frag_姓名, frag_年龄, frag_城市, ...]       │  │   │
│     │   └──────────────────────────────────────────────────┘  │   │
│     │                       │                                  │   │
│     │                       ▼                                  │   │
│     │   ┌──────────────────────────────────────────────────┐  │   │
│     │   │ Phase 1.5: State Enrichment                      │  │   │
│     │   │                                                  │  │   │
│     │   │  enrichFragmentsWithState(fragments, range)      │  │   │
│     │   │  → 设置 isSource, isHighlighted                  │  │   │
│     │   └──────────────────────────────────────────────────┘  │   │
│     │                       │                                  │   │
│     │                       ▼                                  │   │
│     │   ┌──────────────────────────────────────────────────┐  │   │
│     │   │ Phase 2: Render (HeaderPainter)                  │  │   │
│     │   │                                                  │  │   │
│     │   │  paintAll(ctx, fragments, {                      │  │   │
│     │   │    layerBottomY, vt, rc,                         │  │   │
│     │   │    columnHeaderRenderers,                        │  │   │
│     │   │  })                                              │  │   │
│     │   │                                                  │  │   │
│     │   │  内部循环:                                       │  │   │
│     │   │    for each fragment:                            │  │   │
│     │   │      paintBackground()  ← 无判断                 │  │   │
│     │   │      paintText()         ← 无判断                 │  │   │
│     │   │      paintBorders()      ← 读 BorderMask 位域    │  │   │
│     │   │    paintLayerBottomBorder() ← 层底线              │  │   │
│     │   │    pluginRenderers()                            │  │   │
│     │   └──────────────────────────────────────────────────┘  │   │
│     │                                                          │   │
│     │ ctx.restore()                                           │   │
│     └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  ④ 选区高亮线 (#drawColSelectionLines) — 保持不变                 │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 具体示例：Bug 场景下的 Fragment 生成

**场景**：第一列冻结（fixedCols=1），基本信息 colspan=2（startCol=0, endCol=1），scrollX=200（第二列即将滚出视野）

#### 冻结区域（sc=0, ec=1）：

```
Layer 0 ("基本信息", "工作信息"):

LogicalCell[0]: { label:"基本信息", startCol:0, endCol:1, colspan:2 }
  → crossesFrozenBoundary? YES (0 < 1 <= 1)
  → 拆分为 2 个 Fragment:

  Fragment A (冻结侧):
    visStartCol: 0,  visEndCol: 0
    x: vt.colToViewX(0)        = headerW + 0 - 0 = headerW
    w: vt.colRight(0) - x       = 列0宽度 (常量)
    borderMask: FROZEN_SIDE     = TOP | BOTTOM | LEFT  (无右边框 ✓)
    partialType: 'frozen'
    textX: 基于 frozen 列宽对齐

  Fragment B (非冻结侧):
    visStartCol: 1,  visEndCol: 0  → visStart > visEnd → 跳过 ✗
    (因为 ec=1，visEnd = min(1, 0) = 0 < visStart=1)

LogicalCell[1]: { label:"工作信息", startCol:2, endCol:5, colspan:4 }
  → startCol(2) >= ec(1) → 跳过 ✗

最终 Fragment 列表: [Fragment A]
```

**关键**：Fragment A 的 `borderMask = FROZEN_SIDE`（无右边框），所以 `#paintBorders` 不会在冻结边界处画线 → **B01 Bug 自动解决**。

#### 非冻结区域（sc=1, ec=lastVisibleCol+1）：

```
Layer 0:

LogicalCell[0]: { label:"基本信息", startCol:0, endCol:1 }
  → endCol(1) < sc(1)? NO (1 < 1 为 false)
  → startCol(0) >= ec? 取决于 ec
  → 如果 ec > 1: 可见
  → crossesFrozenBoundary? YES 但 sc >= fixedCols → 不拆分
  → 生成 1 个 Fragment:

  Fragment C:
    visStartCol: 1,  visEndCol: min(1, ec-1)
    x: vt.colToViewX(1)       = headerW + colX(1) - scrollX  (随滚动变化)
    borderMask: SCROLL_SIDE    = TOP | BOTTOM | RIGHT  (无左边框 ✓)
    partialType: 'scroll'
```

**关键**：Fragment C 的 `borderMask = SCROLL_SIDE`（无左边框），不会在冻结边界处重复画线。

---

## 8. 边框规则引擎

### 8.1 BorderMask 生成规则表

| 单元格类型 | 条件 | BorderMask | 说明 |
|-----------|------|------------|------|
| **普通单元格** | colspan=1, 不跨边界 | `ALL` (0b1111) | 四边全画 |
| **合并单元格** | colspan>1, 不跨边界 | `MERGED_DEFAULT` (0b1011) | 无右边框（由下一列或区域边界补） |
| **跨边界-冻结侧** | colspan>1, startCol<FB, endCol>=FB, sc<FB | `FROZEN_SIDE` (0b1001) | 无右边框（延续到非冻结区） |
| **跨边界-非冻结侧** | colspan>1, startCol<FB, endCol>=FB, sc>=FB | `SCROLL_SIDE` (0b0110) | 无左边框（承接冻结区） |
| **层最后一个单元格** | i === row.length-1 | `MERGED_DEFAULT \| RIGHT` (0b1111) | 补回右边框（区域边界） |

### 8.2 特殊情况：层最右侧单元格

当某个单元格是某一行的最后一个时，即使它是 colspan 合并单元格，也需要画右边框（因为它是该行的物理边界）。这在 `#cellToFragments` 中处理：

```javascript
if (isLastCellInRow) {
  borderMask |= BorderMask.RIGHT;  // 强制添加右边框
}
```

### 8.3 层底边框

层底边框不再由每个 Fragment 的 `BOTTOM` 位控制（那会导致每个片段都画一条短线，可能不连续），而是由 `HeaderPainter.paintAll` 在所有片段绘制完毕后统一画一条横贯线：

```javascript
// 在 paintAll 末尾：
if (extras.layerBottomY != null) {
  this.#paintLayerBottomBorder(ctx, fragments, extras.layerBottomY, extras.vt, extras.rc);
}
```

这确保了：
- **B02 Bug 解决**：层底线范围基于实际绘制的 Fragment 计算，不依赖 sc/ec 的包含性
- **B03 Bug 解决**：每一层都调用 `paintLayerBottomBorder`，无条件跳过

---

## 9. 非嵌套表头统一方案

### 9.1 为什么非嵌套也要纳入 Fragment 管线

当前代码中，非嵌套表头和嵌套表头走两条完全独立的渲染路径：

```
当前 HeaderRenderer.#renderHeaderRegion():

if (nestedCount > 0) {
    // 嵌套路径: ~100 行，含冻结特判、边框规则、层间分隔线
    this.#renderNestedColumnHeaders(...);
} else {
    // 非嵌套路径: ~20 行，简单的 for 循环
    for (let c = startCol; c < endCol; c++) {
        // 绘制背景、文字、右边框
    }
}
```

这种双轨制存在以下问题：

| 问题 | 说明 |
|------|------|
| **代码重复** | 背景绘制、文字绘制、边框绘制在两条路径中各实现一遍 |
| **B04 隐患** | 非嵌套路径同样缺少底部边框，只是视觉上不太明显 |
| **维护成本** | 修改绘制逻辑（如新增样式属性）需要同时改两处 |
| **扩展性差** | 如果未来非嵌套表头也要支持合并/样式，需要大改 |

**核心洞察**：非嵌套表头等价于"1 层、每个单元格 colspan=1"的嵌套表头。在 Fragment 模型下，它只是 `buildSimpleLayerFragments` 的特例。

### 9.2 非嵌套表头与嵌套表头的差异矩阵

| 特性 | 非嵌套表头 | 嵌套表头 | Fragment 管线处理方式 |
|------|-----------|---------|---------------------|
| 层数 | 1 | N (≥1) | `buildSimpleLayerFragments` 只生成 1 层 |
| colspan | 恒为 1 | 可 >1 | 每列生成独立 Fragment，`borderMask = ALL` |
| 跨冻结边界 | **不可能**（每列独立） | 可能 | 无需拆分，每个 Fragment 的 `partialType = 'full'` |
| 层间分隔线 | 无 | 有 | `paintLayerBottomBorder` 仍然执行（画底线） |
| 文字对齐 | 默认左对齐 | 可配置 | Fragment.textAlign 统一处理 |
| 样式来源 | `sheet.getColHeaderStyle(c)` | `cell.style` | `buildSimpleLayerFragments` 从 sheet 读取 |

### 9.3 `buildSimpleLayerFragments` 接口设计

```javascript
class HeaderLayoutBuilder {

  /**
   * 构建非嵌套表头的 Fragment 列表
   * 
   * 非嵌套表头等价于"单层、colspan=1"的嵌套表头。
   * 每个 Fragment 的 borderMask = ALL（四边全画），
   * 因为不存在跨列合并，不存在跨冻结边界问题。
   * 
   * @param {object} opts
   * @param {number} opts.sc - 可见起始列（半开区间左端）
   * @param {number} opts.ec - 可见结束列（半开区间右端）
   * @param {number} opts.layerY - 表头 Y 坐标（px）
   * @param {number} opts.rowH - 表头高度（px）
   * @param {ViewportTransform} opts.vt
   * @param {Sheet} opts.sheet
   * @param {object} opts.defaultStyle
   * @param {string} opts.headerFont
   * @returns {Fragment[]}
   */
  buildSimpleLayerFragments(opts) {
    const { sc, ec, layerY, rowH, vt, sheet, defaultStyle, headerFont } = opts;
    const rc = sheet.rowColManager;
    const cp = sheet.cellPadding;
    const fragments = [];

    for (let c = sc; c < ec; c++) {
      const w = rc.getColWidth(c);
      if (w <= 0) continue;

      const x = vt.colToViewX(c);
      const colStyle = sheet.getColHeaderStyle(c);
      const mergedStyle = this.#mergeStyle(defaultStyle, colStyle);
      const textAlign = colStyle?.textAlign || 'left';
      const font = this.#buildFont(headerFont, colStyle);

      fragments.push(new Fragment({
        sourceCell: null,
        visStartCol: c,
        visEndCol: c,
        x, y: layerY, w, h: rowH,
        borderMask: BorderMask.ALL,
        mergedStyle,
        text: sheet.getColHeader(c),
        font, textAlign,
        textX: this.#calcTextX(x, w, textAlign, cp),
        textY: layerY + rowH - 8,
        maxTextWidth: w - cp * 2,
        isPartial: false,
        partialType: 'full',
      }));
    }

    return fragments;
  }
}
```

### 9.4 非嵌套表头在 Fragment 管线中的渲染流程

```
非嵌套表头 (nestedCount === 0):

  buildSimpleLayerFragments({ sc, ec, ... })
       │
       ▼
  Fragment[]  (每个 Fragment: colspan=1, borderMask=ALL, partialType='full')
       │
       ▼
  enrichFragmentsWithState(fragments, range)
       │
       ▼
  HeaderPainter.paintAll(ctx, fragments, { layerBottomY: rowH })
       │
       ├─ for each fragment:
       │    paintBackground()   ← 与嵌套共用
       │    paintText()         ← 与嵌套共用
       │    paintBorders()      ← 与嵌套共用，borderMask=ALL → 四边全画
       │
       └─ paintLayerBottomBorder()  ← ★ B04 自动修复：非嵌套也有了底线
```

### 9.5 统一后的 HeaderRenderer 分支简化

```javascript
// 重构前：两条完全独立的代码路径
if (nestedCount > 0) {
    this.#renderNestedColumnHeaders(...);  // ~100 行
} else {
    for (let c = startCol; c < endCol; c++) { ... }  // ~20 行
}

// 重构后：统一入口，仅 LayoutBuilder 方法不同
const fragments = nestedCount > 0
    ? this.#layoutBuilder.buildLayerFragments({...})
    : this.#layoutBuilder.buildSimpleLayerFragments({...});

this.#enrichFragmentsWithState(fragments, range);
this.#painter.paintAll(ctx, fragments, extras);
```

**关键变化**：
- `if/else` 分支从"两套完整渲染逻辑"简化为"选择不同的 LayoutBuilder 方法"
- Painter 完全相同，零分支
- B04（非嵌套缺少底线）自动修复

### 9.6 非嵌套表头不需要 FrozenBoundaryInfo 的原因

非嵌套表头每个单元格恰好占 1 列，不存在 colspan > 1 的情况，因此：

- **不可能跨越冻结边界** — 列 c 要么在冻结区（c < fixedCols），要么在非冻结区（c >= fixedCols）
- **不需要拆分 Fragment** — 每个 Fragment 天然对应一个完整的列
- **borderMask 恒为 ALL** — 无需 FROZEN_SIDE / SCROLL_SIDE

所以 `buildSimpleLayerFragments` 不需要 `frozenBoundary` 参数，冻结裁剪完全由外层的 `ctx.clip()` 处理（冻结区域和非冻结区域分别调用 `#renderHeaderRegion`，各自 clip 后渲染）。

---

## 10. 迁移策略

### 10.1 分步迁移计划

```
Phase 0: 基础设施（预计 2 天）
  ├─ 创建 src/render/header/ 目录结构
  ├─ 实现 BorderMask 常量
  ├─ 实现 LogicalCell / Fragment / FrozenBoundaryInfo 数据模型
  └─ 编写单元测试（数据模型的构造、属性访问、边界判断）

Phase 1: LayoutBuilder（预计 3 天）
  ├─ 实现 HeaderLayoutBuilder.buildLayerFragments()
  ├─ 实现 #parseLayerCells() — 从 nestedHeaders 配置解析 LogicalCell[]
  ├─ 实现 #cellToFragments() — 核心拆分逻辑
  ├─ 实现 #createFragment() — 坐标计算
  └─ 编写单元测试（各种 colspan/frozen/scroll 组合）

Phase 2: Painter（预计 2 天）
  ├─ 实现 HeaderPainter.paintAll()
  ├─ 实现 #paintBackground / #paintText / #paintBorders
  ├─ 实现 #paintLayerBottomBorder
  └─ 编写可视化快照测试（对比截图）

Phase 3: 集成（预计 2 天）
  ├─ 修改 HeaderRenderer，委托给 LayoutBuilder + Painter
  ├─ 保持 #renderColumnHeaders / #renderHeaderRegion 作为薄包装
  ├─ 非嵌套表头也走 buildSimpleLayerFragments → Painter 管线
  └─ 回归测试全部 existing 功能（含非嵌套场景）

Phase 4: 清理（预计 1 天）
  ├─ 删除 HeaderRenderer 中的旧方法（#renderNestedColumnHeaders 等）
  ├─ 更新 JSDoc
  └─ 性能基准测试（确保无回归）
```

### 10.2 向后兼容

- `HeaderRenderer` 的公开 API (`render`, `registerColumnHeaderRenderer`) 保持不变
- `HeaderLayer` 和 `LayerCompositor` 无需修改
- `ViewportTransform` 和 `HeaderLabelManager` 无需修改
- 新增的类均为内部模块，不改变外部接口

### 10.3 回滚方案

每个 Phase 都可以独立回滚：

- Phase 0-2：新增代码，不影响现有功能
- Phase 3：通过 feature flag 控制新旧路径
  ```javascript
  const USE_NEW_HEADER_PIPELINE = true; // 切换开关
  
  if (USE_NEW_HEADER_PIPELINE) {
    // 新路径: LayoutBuilder → Painter
  } else {
    // 旧路径: #renderNestedColumnHeaders
  }
  ```

---

## 11. 测试策略

### 11.1 单元测试：LayoutBuilder

```javascript
describe('HeaderLayoutBuilder', () => {
  describe('buildLayerFragments - 基本场景', () => {
    it('普通单列单元格生成 1 个 Fragment，borderMask=ALL', () => { });
    it('colspan=2 单元格生成 1 个 Fragment，borderMask 无 RIGHT', () => { });
    it('隐藏列被自动跳过', () => { });
  });

  describe('buildLayerFragments - 冻结场景', () => {
    it('colspan 跨冻结边界，冻结区域只看到冻结侧片段', () => {
      // fixedCols=1, cell=[0,1], sc=0, ec=1
      // 期望: 1 个 fragment, partialType='frozen', borderMask 无 RIGHT
    });

    it('colspan 跨冻结边界，非冻结区域只看到非冻结侧片段', () => {
      // fixedCols=1, cell=[0,1], sc=1, ec=5
      // 期望: 1 个 fragment, partialType='scroll', borderMask 无 LEFT
    });

    it('colspan 完全在冻结区域内，正常生成', () => {
      // fixedCols=2, cell=[0,1], sc=0, ec=2
      // 期望: 1 个 fragment, partialType='full', borderMask=MERGED_DEFAULT
    });

    it('colspan 完全在非冻结区域内，正常生成', () => {
      // fixedCols=1, cell=[2,3], sc=1, ec=5
      // 期望: 1 个 fragment, partialType='full'
    });

    it('scrollX 变化时，非冻结区域 fragment.x 正确偏移', () => {
      // 同一配置，不同 scrollX，验证 x 坐标差异
    });
  });

  describe('buildLayerFragments - 边界条件', () => {
    it('sc=ec 时返回空数组', () => { });
    it('所有列都隐藏时返回空数组', () => { });
    it('colspan 超出 ec 时正确截断', () => { });
  });

  describe('buildSimpleLayerFragments - 非嵌套表头', () => {
    it('每列生成 1 个 Fragment，borderMask=ALL', () => { });
    it('隐藏列被自动跳过', () => { });
    it('冻结列和非冻结列的 x 坐标正确', () => {
      // fixedCols=1, sc=0, ec=5
      // Fragment[0].x = vt.colToViewX(0) (冻结路径)
      // Fragment[1].x = vt.colToViewX(1) (非冻结路径)
    });
    it('列样式正确合并到 Fragment.mergedStyle', () => { });
    it('返回的 Fragment 数量 = ec - sc - hiddenCount', () => { });
  });
});
```

### 11.2 视觉回归测试

```javascript
describe('表头 + 冻结 视觉回归', () => {
  const nestedTestCases = [
    { name: '无冻结', fixedCols: 0, scrollX: 0 },
    { name: '冻结1列-初始', fixedCols: 1, scrollX: 0 },
    { name: '冻结1列-滚动50px', fixedCols: 1, scrollX: 50 },
    { name: '冻结1列-滚动200px(列2消失)', fixedCols: 1, scrollX: 200 },
    { name: '冻结1列-滚动500px', fixedCols: 1, scrollX: 500 },
    { name: '冻结2列', fixedCols: 2, scrollX: 0 },
    { name: '冻结2列-滚动', fixedCols: 2, scrollX: 300 },
    { name: '冻结+嵌套3层', fixedCols: 1, nestedLayers: 3, scrollX: 100 },
  ];

  const simpleTestCases = [
    { name: '非嵌套-无冻结', fixedCols: 0, scrollX: 0, nested: false },
    { name: '非嵌套-冻结1列', fixedCols: 1, scrollX: 0, nested: false },
    { name: '非嵌套-冻结1列-滚动', fixedCols: 1, scrollX: 200, nested: false },
  ];

  const allCases = [...nestedTestCases.map(c => ({ ...c, nested: true })), ...simpleTestCases];

  for (const tc of allCases) {
    it(`边框正确: ${tc.name}`, async () => {
      const sheet = createTestSheet(tc);
      const canvas = renderToCanvas(sheet, tc.scrollX, 0);
      const snapshot = canvas.toDataURL();
      
      await expect(snapshot).toMatchImageSnapshot(`header-${tc.name}`);
    });
  }
});
```

### 11.3 性能基准

```javascript
describe('性能基准', () => {
  it('LayoutBuilder.buildLayerFragments 在 100 列 5 层嵌套下 < 1ms', () => {
    const largeConfig = generateLargeNestedHeader(100, 5);
    const start = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      builder.buildLayerFragments({...largeConfig});
    }
    
    const avgMs = (performance.now() - start) / 1000;
    expect(avgMs).toBeLessThan(1); // 平均每次 < 1ms
  });
});
```

---

## 附录 A: 关键设计决策记录 (ADR)

### ADR-001: 为什么选择 Fragment 中间表示而非直接优化原代码？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A: 直接修补原代码** | 改动最小 | 仍有 5+ 处 ad-hoc 判断，未来加功能容易引入新 bug |
| **B: Fragment 中间表示** | 布局/绘制彻底分离，渲染循环零判断 | 新增 ~400 行代码，需要迁移期 |
| **C: CSS Grid 思路的布局引擎** | 最灵活 | 过度设计，Canvas 渲染不需要完整的布局引擎 |

**决策**: 选择 B。理由：(1) 当前 bug 的本质是"布局决策分散"，Fragment 是针对此问题的精准解；(2) 新增代码量可控（~400 行替换原来 ~100 行的高复杂度代码）；(3) 可渐进迁移，风险低。

### ADR-002: 为什么 BorderMask 使用位域而非对象？

```javascript
// 方案 A: 位域（采用）
const mask = BorderMask.TOP | BorderMask.BOTTOM;
if (mask & BorderMask.RIGHT) { /* skip */ }

// 方案 B: 对象（备选）
const borders = { top: true, right: false, bottom: true, left: true };
if (borders.right) { /* draw */ }
```

**决策**: 选择 A。理由：(1) 位域支持组合操作（`MERGED_DEFAULT = TOP | BOTTOM | LEFT`）；(2) 与 Canvas API 的 bitmask 传统一致；(3) 序列化更紧凑。

### ADR-003: 为什么不把 FrozenLayer 的表头也纳入重构？

FrozenLayer 只负责冻结区域的**数据单元格**（非表头），表头始终由 HeaderLayer 渲染。两者的冻结裁剪逻辑类似但职责不同，强行统一会增加耦合度。本次重构聚焦于 HeaderRenderer，Future work 可考虑提取通用的 `ClippedRegionRenderer`。

---

## 附录 B: 文件变更清单

| 文件 | 操作 | 预估行数变化 |
|------|------|-------------|
| `src/render/header/HeaderLayoutBuilder.js` | **新增** | ~300 (+50 行 buildSimpleLayerFragments) |
| `src/render/header/models/LogicalCell.js` | **新增** | ~50 |
| `src/render/header/models/Fragment.js` | **新增** | ~80 |
| `src/render/header/models/BorderMask.js` | **新增** | ~20 |
| `src/render/header/models/FrozenBoundaryInfo.js` | **新增** | ~40 |
| `src/render/header/HeaderPainter.js` | **新增** | ~150 |
| `src/render/header/index.js` | **新增** | ~10 |
| `src/render/HeaderRenderer.js` | **修改** | ~740 → ~300 (删除 ~440 行旧逻辑，含非嵌套分支) |
| `tests/unit/header/LayoutBuilder.test.js` | **新增** | ~350 (含非嵌套测试) |
| `tests/unit/header/BorderMask.test.js` | **新增** | ~50 |
| `tests/e2e/header-frozen-visual.test.js` | **新增** | ~180 (含非嵌套视觉回归) |
| **合计** | | **净增 ~650 行（含测试）** |