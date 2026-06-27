# 自定义渲染器 API（Custom Renderer）完整设计文档

> 本文档定义了 Canvas 电子表格引擎的自定义渲染器体系，允许用户注册自定义的 Canvas 绘制函数，实现丰富的可视化效果。

---

## 目录

- [1. 设计背景与目标](#1-设计背景与目标)
- [2. 架构概览](#2-架构概览)
- [3. 核心组件设计](#3-核心组件设计)
  - [3.1 CellRenderContext - 渲染上下文](#31-cellrendercontext---渲染上下文)
  - [3.2 BaseColumnType.render() - 渲染方法扩展](#32-columntyperender---渲染方法扩展)
  - [3.3 RendererRegistry - 全局渲染器注册表](#33-rendererregistry---全局渲染器注册表)
  - [3.4 TileRenderer 集成点](#34-tilerenderer-集成点)
- [4. API 完整参考](#4-api-完整参考)
- [5. 内置渲染器示例](#5-内置渲染器示例)
  - [5.1 BooleanCheckboxRenderer - 复选框渲染器](#51-booleancheckboxrenderer---复选框渲染器)
  - [5.2 ProgressBarRenderer - 进度条渲染器](#52-progressbarrenderer---进度条渲染器)
  - [5.3 StarRatingRenderer - 星级评分渲染器](#53-starratingrenderer---星级评分渲染器)
  - [5.4 SparklineRenderer - 迷你图渲染器](#54-sparklinerenderer---迷你图渲染器)
  - [5.5 ColorPreviewRenderer - 颜色预览渲染器](#55-colorpreviewrenderer---颜色预览渲染器)
- [6. 用户使用指南](#6-用户使用指南)
- [7. 实现路线图](#7-实现路线图)
- [8. 性能优化策略](#8-性能优化策略)
- [9. 最佳实践与注意事项](#9-最佳实践与注意事项)
  - [9.1 渲染器设计原则](#91-渲染器设计原则)
  - [9.2 常见问题 FAQ](#92-常见问题-faq)
  - [9.3 版本兼容性](#93-版本兼容性)
  - [9.4 冻结窗格场景指南](#94-冻结窗格场景指南)
  - [9.5 分页模式支持](#95-分页模式支持)
  - [9.6 与图表引擎的协作](#96-与图表引擎的协作)

---

## 1. 设计背景与目标

### 1.1 当前系统的局限性

当前项目（Canvas 实现电子表格）采用统一的文本渲染方式：
- 所有单元格通过 `TileRenderer.#drawCellText()` 绘制
- `BaseColumnType.format()` 只能返回字符串显示值
- 无法支持复选框、进度条、图表等可视化组件

### 1.2 设计目标

| 目标 | 说明 | 优先级 |
|------|------|--------|
| ✅ **完全兼容现有系统** | 不破坏现有的 BaseColumnType 体系，渐进式增强 | P0 |
| ✅ **高性能 Canvas 渲染** | 利用瓦片缓存机制，避免性能损失 | P0 |
| ✅ **简单易用的 API** | 用户只需实现 `render(context)` 方法即可 | P0 |
| ✅ **灵活可扩展** | 支持全局/列级/单元格级三级覆盖 | P1 |
| ✅ **类型安全** | TypeScript 友好的类型定义 | P1 |
| ⭐ **架构一致性** | 与图表引擎的行列号语义完全对齐（实际行号 vs 页面行号） | P0 |
| ⭐ **冻结/分页支持** | 完整支持冻结窗格和分页模式下的行列号转换 | P0 |
| ⭐ **高级场景开放** | 提供 Sheet 引用支持跨单元格数据访问和事件监听 | P1 |

> **⭐ 标记项为 v1.1 新增的设计目标**（基于架构审查反馈）

### 1.3 与 Handsontable 的对比

| 特性 | Handsontable DOM Renderer | 本方案 Canvas Renderer |
|------|--------------------------|------------------------|
| 渲染技术 | HTML DOM 元素注入 | Canvas 2D 绘制 API |
| 性能特点 | DOM 操作开销大 | GPU 加速 + 瓦片缓存 |
| 复杂度 | 中等（需处理 DOM 生命周期） | 低（纯函数式绘制） |
| 适用场景 | 简单 UI 组件 | 高性能复杂可视化 |

---

## 2. 架构概览

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户层 (User Layer)                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ BooleanRenderer │  │ ProgressRenderer│  │ CustomRenderer│ │
│  │ (复选框)        │  │ (进度条)        │  │ (用户自定)    │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘ │
├───────────┼────────────────────┼───────────────────┼─────────┤
│          ▼                    ▼                   ▼         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              RendererRegistry (全局注册表)               │ │
│  │  registerRenderer(name, rendererClass)                   │ │
│  │  getRenderer(name) → renderer instance                  │ │
│  └──────────────────────────┬──────────────────────────────┘ │
├─────────────────────────────┼────────────────────────────────┤
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              BaseColumnType (类型系统)                        │ │
│  │  ┌──────────────────────────────────────────────────┐   │ │
│  │  │ class MyType extends BaseColumnType {                 │   │ │
│  │  │   get hasCustomRenderer() { return true; }        │   │ │
│  │  │   render(ctx, x, y, w, h, value, style) { ... }   │   │ │
│  │  │ }                                                  │   │ │
│  │  └──────────────────────────────────────────────────┘   │ │
│  └──────────────────────────┬──────────────────────────────┘ │
├─────────────────────────────┼────────────────────────────────┤
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              TileRenderer (瓦片渲染引擎)                  │ │
│  │  #drawCell() → 检查 hasCustomRenderer → 调用 render()   │ │
│  │  #drawCellText() → 默认文本渲染                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流图

```
用户数据 → BaseColumnType.format() → displayValue (字符串)
                                        ↓
                              TileRenderer.#drawCell()
                                        ↓
                    ┌───────────────────┴───────────────────┐
                    ↓                                       ↓
           hasCustomRenderer?                           否 (默认)
                    ↓                                       ↓
                   是                                  #drawCellText()
                    ↓
     CellRenderContext 构建 (封装所有参数)
                    ↓
      BaseColumnType.render(cellRenderContext)
                    ↓
            Canvas 2D 绘制完成 ✓
```

---

## 3. 核心组件设计

### 3.1 CellRenderContext - 渲染上下文 ⭐ 核心组件

**文件位置**: `src/types/CellRenderContext.js`

#### 设计目的

封装渲染所需的全部信息，提供类型安全的接口，避免暴露内部复杂结构。

#### ⚠️ 重要：行列号语义约定（与图表引擎保持一致）

本系统采用**双行列号体系**，与 [ChartEngine.md](./ChartEngine.md) 的设计完全对齐：

| 行列号类型 | 属性名 | 说明 | 使用场景 |
|-----------|--------|------|---------|
| **页面行号** | `row` / `col` | 用户界面显示的行号（受冻结/筛选/分页影响） | 视觉定位、UI布局 |
| **实际行号** | `realRow` / `realCol` | 数据存储的真实行号（不受显示状态影响） | 数据访问、公式计算、跨系统通信 |

> **核心原则**：所有内部存储和数据访问统一使用**实际行号（realRow）**，渲染和定位时使用**页面行号（pageRow）**

#### 类结构

```javascript
export class CellRenderContext {
    constructor({
        ctx,              // CanvasRenderingContext2D (瓦片离屏 canvas)
        x,                // 单元格左上角 X 坐标 (瓦片局部坐标, 像素)
        y,                // 单元格左上角 Y 坐标 (瓦片局部坐标, 像素)
        width,            // 单元格宽度 (像素)
        height,           // 单元格高度 (像素)
        value,            // 原始值 (*)
        displayValue,     // 格式化后的显示文本 (string)
        style,            // 解析后的最终样式对象 (object)
        sheet,            // Sheet 实例引用 (Sheet) - 高级场景必需
        row,              // 页面行号 (number) - 受冻结/筛选/分页影响
        col,              // 页面列号 (number) - 受隐藏列影响
        realRow,          // 实际行号 (number) - 真实数据行号
        realCol,          // 实际列号 (number) - 真实数据列号
        isSelected,       // 是否被选中 (boolean)
        isDisabled,       // 是否禁用 (boolean)
        isMerged,         // 是否为合并单元格 (boolean)
        mergeInfo,        // 合并区域信息 (object|null)
        pageInfo,         // 分页/冻结信息 (object) - 分页模式下的额外信息
    })

    // ========== 基础属性（只读） ==========
    get ctx()             // Canvas 2D 上下文
    get x(), y()          // 坐标（瓦片局部坐标系）
    get width(), height() // 尺寸（像素）
    get value()           // 原始值
    get displayValue()    // 显示值
    get style()           // 样式对象
    get sheet()           // Sheet 工作表实例（高级场景）

    // ========== 行列号体系（双轨制） ==========
    get row()             // 页面行号（显示行号，受冻结/筛选影响）
    get col()             // 页面列号（显示列号，受隐藏列影响）
    get realRow()         // 实际行号（真实数据行号）
    get realCol()         // 实际列号（真实数据列号）

    // ========== 状态属性 ==========
    get isSelected()      // 选中状态
    get isDisabled()      // 禁用状态
    get isMerged()        // 合并状态
    get mergeInfo()       // 合并信息
    get pageInfo()        // 分页/冻结信息

    // ========== 转换方法 ==========
    toRealRow(pageRow)    // 页面行号 → 实际行号
    toPageRow(realRow)    // 实际行号 → 页面行号
    toRealCol(pageCol)    // 页面列号 → 实际列号
    toPageCol(realCol)    // 实际列号 → 页面列号

    // ========== 辅助方法 ==========
    getCenterX()          // 文本水平居中 X
    getCenterY()          // 文本垂直居中 Y
    drawRoundedRect(x, y, w, h, radius)  // 绘制圆角矩形
}

// pageInfo 结构定义
{
    isPaged: Boolean,          // 是否处于分页模式
    currentPage: Number,       // 当前页码（从0开始）
    pageSize: Number,          // 每页行数
    frozenRowCount: Number,    // 冻结行数
    frozenColCount: Number,    // 冻结列数
    isInFrozenArea: Boolean,   // 当前单元格是否在冻结区域内
}
```

#### 使用示例（基础版）

```javascript
class ProgressBarColumnType extends BaseColumnType {
    render(context) {
        const { ctx, x, y, width, height, value, style } = context;
        const percent = Math.min(100, Math.max(0, value));

        // 绘制背景
        ctx.fillStyle = '#e0e0e0';
        context.drawRoundedRect(x + 2, y + 2, width - 4, height - 4, 4);
        ctx.fill();

        // 绘制进度
        const barWidth = (width - 4) * percent / 100;
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(x + 2, y + 2, barWidth, height - 4);

        // 绘制百分比文字
        ctx.fillStyle = style.color || '#222';
        ctx.font = `${style.fontSize || 12}px ${style.fontFamily || 'Segoe UI'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${percent}%`, context.getCenterX(), context.getCenterY());
    }
}
```

#### 使用示例（高级版 - 使用实际行号和sheet引用）

```javascript
class ConditionalHighlightType extends BaseColumnType {
    render(context) {
        const { ctx, x, y, width, height, value, realRow, realCol, sheet, pageInfo } = context;

        // ✅ 场景1：基于实际数据进行条件判断（推荐）
        if (realRow >= 5 && realRow <= 10) {
            ctx.fillStyle = '#fff3e0';  // 高亮特定数据范围
            ctx.fillRect(x, y, width, height);
        }

        // ✅ 场景2：访问相邻单元格的数据
        const neighborCell = sheet.cellStore.get(realRow, realCol + 1);
        if (neighborCell?.value > 100) {
            ctx.strokeStyle = '#f44336';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
        }

        // ✅ 场景3：根据冻结状态调整布局
        if (pageInfo?.isInFrozenArea) {
            ctx.globalAlpha = 0.8;  // 冻结区域略微透明
        }

        // 绘制原始值
        ctx.fillStyle = '#333';
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value), context.getCenterX(), context.getCenterY());
    }
}
```

---

### 3.2 BaseColumnType.render() - 渲染方法扩展

**修改文件**: `src/types/BaseColumnType.js`

#### 新增方法签名

```javascript
/**
 * 自定义渲染方法（可选）
 *
 * 当此方法存在时，TileRenderer 会调用它替代默认的文本渲染。
 * 接收 CellRenderContext 对象，包含 Canvas 上下文和单元格全部信息。
 *
 * @param {CellRenderContext} context - 单元格渲染上下文
 * @returns {void}
 */
render(context) {
    // 子类重写此方法以实现自定义绘制逻辑
}
```

#### 新增属性

```javascript
/**
 * 是否有自定义渲染器
 * @returns {boolean} 如果子类实现了 render() 方法则返回 true
 */
get hasCustomRenderer() {
    // 检查原型链上是否有非基类的 render 实现
    return this.constructor.prototype.render !== BaseColumnType.prototype.render;
}
```

#### 完整的 BaseColumnType 基类（修改后）

```javascript
export class BaseColumnType {
    constructor(options = {}) {
        this.options = options;
    }

    get name() { return "text"; }
    get editorType() { return "text"; }
    get hasCustomRenderer() {
        return this.constructor.prototype.render !== BaseColumnType.prototype.render;
    }

    format(value) { ... }
    validate(value) { ... }
    parse(input) { ... }
    getDefaultStyle(baseStyle) { ... }
    getEditorOptions() { ... }
    getDefaultValue() { ... }
    compare(a, b, order) { ... }

    /**
     * 自定义渲染方法（默认空实现）
     * @param {CellRenderContext} context
     */
    render(context) {
        // 基类不执行任何操作，子类可选择性重写
    }
}
```

---

### 3.3 RendererRegistry - 全局渲染器注册表

**新文件**: `src/types/RendererRegistry.js`

#### 设计目的

提供全局渲染器的注册、查询和管理功能，支持运行时动态添加。

#### 类结构

```javascript
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 渲染器注册表
 *
 * 管理全局可用的自定义渲染器类。
 * 允许用户在运行时注册新的渲染器类型。
 */
class RendererRegistry {
    /** @type {Map<string, Function>} 渲染器类映射 (name → Constructor) */
    #renderers = new Map();

    /**
     * 注册渲染器类
     *
     * @param {string} name - 渲染器名称（唯一标识）
     * @param {Function} rendererClass - 渲染器构造函数（必须继承 ColumnType）
     *
     * @example
     * import { registerRenderer } from './types/RendererRegistry.js';
     * import { ProgressBarColumnType } from './types/renderers/ProgressBarColumnType.js';
     *
     * registerRenderer('progress', ProgressBarColumnType);
     */
    static registerRenderer(name, rendererClass) {
        if (!name || typeof name !== 'string') {
            errorHandler.warn(ERROR_CODE.INVALID_RENDERER_NAME,
                "Renderer name must be a non-empty string");
            return false;
        }

        if (typeof rendererClass !== 'function') {
            errorHandler.warn(ERROR_CODE.INVALID_RENDERER_CLASS,
                "Renderer must be a constructor function");
            return false;
        }

        if (this.#renderers.has(name)) {
            errorHandler.warn(ERROR_CODE.DUPLICATE_RENDERER,
                `Renderer "${name}" already registered, will be overwritten`);
        }

        this.#renderers.set(name, rendererClass);
        return true;
    }

    /**
     * 获取渲染器实例
     *
     * @param {string} name - 渲染器名称
     * @param {object} [options] - 渲染器配置选项
     * @returns {BaseColumnType|null} 渲染器实例，未找到返回 null
     *
     * @example
     * const renderer = getRenderer('progress', { color: '#ff5722' });
     */
    static getRenderer(name, options = {}) {
        const RendererClass = this.#renderers.get(name);
        if (!RendererClass) {
            errorHandler.warn(ERROR_CODE.RENDERER_NOT_FOUND,
                `Renderer "${name}" not found`);
            return null;
        }
        return new RendererClass(options);
    }

    /**
     * 检查渲染器是否已注册
     * @param {string} name
     * @returns {boolean}
     */
    static hasRenderer(name) {
        return this.#renderers.has(name);
    }

    /**
     * 注销渲染器
     * @param {string} name
     * @returns {boolean} 成功返回 true
     */
    static unregisterRenderer(name) {
        return this.#renderers.delete(name);
    }

    /**
     * 获取所有已注册的渲染器名称
     * @returns {string[]}
     */
    static getRegisteredRenderers() {
        return Array.from(this.#renderers.keys());
    }
}

// 导出单例方法
export const registerRenderer = RendererRegistry.registerRenderer.bind(RendererRegistry);
export const getRenderer = RendererRegistry.getRenderer.bind(RendererRegistry);
export const hasRenderer = RendererRegistry.hasRenderer.bind(RendererRegistry);
export const unregisterRenderer = RendererRenderer.unregisterRenderer.bind(RendererRegistry);
export const getRegisteredRenderers = RendererRegistry.getRegisteredRenderers.bind(RendererRegistry);
```

---

### 3.4 TileRenderer 集成点

**修改文件**: `src/render/TileRenderer.js`

#### 关键修改位置

在 `#paintTile()` 方法的单元格循环中，增加自定义渲染器检测和调用逻辑。

#### 修改前（伪代码）

```javascript
#paintTile(tile, sheet, tileRow, tileCol, options) {
    for (每个单元格) {
        this.#drawCellBackground(...);  // 绘制背景
        this.#drawCellContent(...);     // 绘制富内容（图片等）

        if (!hasContent) {
            this.#drawCellBorder(...);  // 绘制边框
            this.#drawCellText(...);    // ← 始终绘制文本
        }
    }
}
```

#### 修改后（伪代码）

```javascript
#paintTile(tile, sheet, tileRow, tileCol, options) {
    for (每个单元格) {
        this.#drawCellBackground(...);

        const hasContent = this.#drawCellContent(...);

        if (!hasContent) {
            this.#drawCellBorder(...);

            // ★★★ 新增：检查是否有自定义渲染器 ★★★
            const cellType = sheet.typeManager.getCellTypeInstance(r, c);
            if (cellType.hasCustomRenderer) {
                // 构建渲染上下文
                const context = this.#createRenderContext(sheet, r, c, cell, drawX, drawY, w, h, merge);
                // 调用自定义渲染
                cellType.render(context);
            } else {
                // 默认文本渲染
                this.#drawCellText(...);
            }
        }
    }
}
```

#### 新增私有方法：`#createRenderContext()` ⭐ 核心实现

```javascript
/**
 * 创建单元格渲染上下文（支持双轨行列号体系）
 *
 * 重要说明：
 * - 本方法同时提供页面行号和实际行号，确保与图表引擎的行列号约定一致
 * - 在冻结/筛选/分页场景下，row !== realRow
 * - 所有数据访问应使用 realRow/realCol，视觉定位使用 row/col
 *
 * @param {Sheet} sheet - 工作表实例
 * @param {number} r - 页面行号（显示行号）
 * @param {number} c - 页面列号（显示列号）
 * @param {Cell} cell - 单元格模型
 * @param {number} drawX - X 坐标
 * @param {number} drawY - Y 坐标
 * @param {number} w - 宽度
 * @param {number} h - 高度
 * @param {object|null} merge - 合并信息
 * @param {object} [options] - 额外选项（如 useRealRows）
 * @returns {CellRenderContext}
 */
#createRenderContext(sheet, r, c, cell, drawX, drawY, w, h, merge, options) {
    const cellType = sheet.typeManager.getCellTypeInstance(r, c);
    const displayValue = sheet.formatCellValue(r, c, cell?.value);
    const style = sheet.resolveStyle(r, c);

    // ★★★ 核心：计算实际行号（与图表引擎对齐）★★★
    const realR = (options?.useRealRows) ? r : sheet.toRealRow(r);
    const realC = c;  // 列号通常不需要转换（除非有隐藏列的特殊处理）

    // 构建分页/冻结信息
    const rc = sheet.rowColManager;
    const pageInfo = {
        isPaged: sheet.isPagedMode(),
        currentPage: sheet.getCurrentPage?.() ?? 0,
        pageSize: rc.getPageSize?.() ?? 0,
        frozenRowCount: rc.frozenRowCount || 0,
        frozenColCount: rc.frozenColCount || 0,
        isInFrozenArea: r < (rc.frozenRowCount || 0) || c < (rc.frozenColCount || 0),
    };

    return new CellRenderContext({
        ctx: /* 当前瓦片的 canvas context */,
        x: drawX,
        y: drawY,
        width: w,
        height: h,
        value: cell?.value,
        displayValue,
        style,

        // ★★★ Sheet 引用（高级场景必需）★★★
        sheet: sheet,

        // ★★★ 双轨行列号体系 ★★★
        row: r,              // 页面行号（受冻结/筛选影响）
        col: c,              // 页面列号（受隐藏列影响）
        realRow: realR,      // 实际行号（真实数据行号）⭐
        realCol: realC,      // 实际列号（真实数据列号）⭐

        isSelected: this.#isSelected(sheet, r, c),
        isDisabled: cell?.disabled === true,
        isMerged: !!merge,
        mergeInfo: merge,

        // ★★★ 分页/冻结信息 ★★★
        pageInfo: pageInfo,
    });
}
```

#### 行列号转换示例

```javascript
// 场景1：冻结2行的情况下，页面第3行 → 实际第5行
const pageRow = 3;  // 用户看到的行号
const realRow = sheet.toRealRow(pageRow);  // → 5（数据存储的真实位置）

// 场景2：反向转换
const dataRow = 10;  // 数据中的实际位置
const displayRow = sheet.toPageRow(dataRow);  // → 8（用户界面显示的位置）

// 场景3：在自定义渲染器中使用
render(context) {
    // ✅ 正确：使用实际行号访问数据
    const dataValue = context.sheet.cellStore.get(context.realRow, context.realCol)?.value;

    // ✅ 正确：使用页面行号进行视觉判断
    if (context.row === 0) {
        this.drawHeaderStyle(context);  // 第一行特殊样式
    }

    // ❌ 错误：不要用页面行号访问数据（可能在冻结/筛选时出错）
    // const wrongValue = context.sheet.cellStore.get(context.row, context.col)?.value;
}
```

---

## 4. API 完整参考

### 4.1 用户侧 API

#### 注册自定义渲染器

```javascript
import { registerRenderer } from './types/index.js';

// 方式1：直接传入 BaseColumnType 子类
registerRenderer('myProgress', class extends BaseColumnType {
    get name() { return 'progress'; }

    render(context) {
        const { ctx, x, y, width, height, value } = context;
        // 你的 Canvas 绘制逻辑...
    }
});

// 方式2：先定义再注册
import { MyStarRatingType } from './MyStarRatingType.js';
registerRenderer('starRating', MyStarRatingType);
```

#### 在列配置中使用

```javascript
const columns = [
    { data: 'id', type: 'numeric' },
    { data: 'name', type: 'text' },
    { data: 'progress', type: 'progress' },  // 使用已注册的自定义渲染器
    { data: 'rating', type: 'starRating' },   // 使用星级评分渲染器
];

workbook.activeSheet.applyColumnsConfig(columns);
```

#### 在单元格级别使用

```javascript
// 为特定单元格设置自定义类型
const cellTypes = new Map();
cellTypes.set('5,2', { name: 'starRating', options: { maxStars: 5, color: '#ffc107' } });

sheet.setCellTypes(cellTypes);
```

#### 运行时动态切换渲染器

```javascript
// 动态更改某列的渲染器
const colConfig = sheet.typeManager.getColumnConfig(2);
colConfig.type = 'checkbox';  // 切换为复选框渲染器
sheet.markDirty();  // 触发重绘
```

### 4.2 开发者侧 API（创建渲染器）

#### 最小化渲染器模板

```javascript
import { BaseColumnType } from './BaseColumnType.js';

export class MinimalRenderer extends BaseColumnType {
    get name() { return 'minimal'; }

    /**
     * 必须实现的 render 方法
     * @param {CellRenderContext} context
     */
    render(context) {
        const { ctx, x, y, width, height, value } = context;

        // 示例：绘制一个简单的矩形
        ctx.fillStyle = '#2196f3';
        ctx.fillRect(x, y, width, height);

        // 可选：绘制文字
        ctx.fillStyle = '#fff';
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value), context.getCenterX(), context.getCenterY());
    }
}
```

#### 完整渲染器示例（带配置选项）

```javascript
import { BaseColumnType } from './BaseColumnType.js';

export class AdvancedProgressBarType extends BaseColumnType {
    get name() { return 'advancedProgress'; }

    get editorType() { return 'numeric'; }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: 'center' };
    }

    format(value) {
        return value != null ? `${value}%` : '';
    }

    render(context) {
        const { ctx, x, y, width, height, value, style, isSelected } = context;

        const percent = Math.min(100, Math.max(0, Number(value) || 0));
        const padding = 4;
        const barHeight = height - padding * 2;
        const barWidth = width - padding * 2;
        const radius = Math.min(4, barHeight / 2);

        // 配置项
        const bgColor = this.options?.bgColor || '#e0e0e0';
        const fillColor = this.options?.fillColor || '#4caf50';
        const textColor = this.options?.textColor || '#fff';

        // 背景
        ctx.fillStyle = bgColor;
        context.drawRoundedRect(x + padding, y + padding, barWidth, barHeight, radius);
        ctx.fill();

        // 进度条
        if (percent > 0) {
            const fillW = barWidth * percent / 100;
            ctx.fillStyle = fillColor;

            // 创建裁剪区域以保持圆角
            ctx.save();
            ctx.beginPath();
            context.drawRoundedRect(x + padding, y + padding, barWidth, barHeight, radius);
            ctx.clip();
            ctx.fillRect(x + padding, y + padding, fillW, barHeight);
            ctx.restore();
        }

        // 百分比文字
        ctx.fillStyle = textColor;
        ctx.font = `bold ${style.fontSize || 11}px ${style.fontFamily || 'Segoe UI'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(percent)}%`, context.getCenterX(), context.getCenterY());

        // 选中状态边框
        if (isSelected) {
            ctx.strokeStyle = '#2196f3';
            ctx.lineWidth = 2;
            context.drawRoundedRect(x + 1, y + 1, width - 2, height - 2, 3);
            ctx.stroke();
        }
    }
}

// 注册
registerRenderer('advancedProgress', AdvancedProgressBarType);
```

---

## 5. 内置渲染器示例

### 5.1 BooleanCheckboxRenderer - 复选框渲染器

**文件**: `src/types/renderers/BooleanCheckboxType.js`

```javascript
import { BaseColumnType } from '../BaseColumnType.js';

/**
 * 布尔复选框渲染器
 *
 * 将布尔值渲染为可视化的复选框（☑ 或 ☐），而非简单的 TRUE/FALSE 文字。
 *
 * 配置选项：
 *   checkedColor: string - 选中时的填充色（默认 '#4caf50'）
 *   uncheckedColor: string - 未选中时的边框色（默认 '#999'）
 *   size: number - 复选框大小比例（0-1，默认 0.6）
 */
export class BooleanCheckboxType extends BaseColumnType {
    get name() { return 'checkbox'; }

    get editorType() { return 'text'; }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: 'center' };
    }

    format(value) {
        return String(value ?? '');
    }

    parse(input) {
        if (input === '' || input == null) return '';
        const str = String(input).toLowerCase().trim();
        if (['true', 'yes', '1', '是'].includes(str)) return true;
        if (['false', 'no', '0', '否'].includes(str)) return false;
        return input;
    }

    render(context) {
        const { ctx, x, y, width, height, value, isDisabled } = context;

        const isChecked = Boolean(value);
        const sizeRatio = this.options?.size || 0.6;
        const boxSize = Math.min(width, height) * sizeRatio;
        const boxX = x + (width - boxSize) / 2;
        const boxY = y + (height - boxSize) / 2;
        const radius = boxSize * 0.15;

        // 未选中：空心方框
        ctx.strokeStyle = this.options?.uncheckedColor || '#999';
        ctx.lineWidth = 2;
        context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
        ctx.stroke();

        if (isChecked) {
            // 选中：填充背景 + 对勾
            ctx.fillStyle = this.options?.checkedColor || '#4caf50';
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();

            // 绘制对勾
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const checkSize = boxSize * 0.5;
            const cx = boxX + boxSize / 2;
            const cy = boxY + boxSize / 2;

            ctx.beginPath();
            ctx.moveTo(cx - checkSize * 0.4, cy);
            ctx.lineTo(cx - checkSize * 0.1, cy + checkSize * 0.35);
            ctx.lineTo(cx + checkSize * 0.45, cy - checkSize * 0.35);
            ctx.stroke();
        }

        // 禁用态：降低透明度
        if (isDisabled) {
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#ccc';
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}
```

**使用示例**:
```javascript
columns: [
    { data: 'completed', type: 'checkbox', options: { checkedColor: '#2196f3' } }
]
```

---

### 5.2 ProgressBarRenderer - 进度条渲染器

**文件**: `src/types/renderers/ProgressBarType.js`

```javascript
import { BaseColumnType } from '../BaseColumnType.js';

/**
 * 进度条渲染器
 *
 * 将数值（0-100）渲染为彩色进度条，支持渐变色和动画效果提示。
 *
 * 配置选项：
 *   colors: object - 不同区间的颜色 { low: '#f44336', medium: '#ff9800', high: '#4caf50' }
 *   showPercent: boolean - 是否显示百分比文字（默认 true）
 *   borderRadius: number - 圆角半径（默认 4）
 *   heightRatio: number - 进度条高度比例（0-1，默认 0.6）
 */
export class ProgressBarType extends BaseColumnType {
    get name() { return 'progressBar'; }

    get editorType() { return 'numeric'; }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: 'center' };
    }

    format(value) {
        return value != null ? `${value}%` : '';
    }

    validate(value) {
        if (value === '' || value == null) return true;
        const num = Number(value);
        if (isNaN(num)) return false;
        if (num < 0 || num > 100) return '数值必须在 0-100 之间';
        return true;
    }

    render(context) {
        const { ctx, x, y, width, height, value, style } = context;

        const percent = Math.min(100, Math.max(0, Number(value) || 0));
        const padding = 6;
        const barH = height * (this.options?.heightRatio || 0.6);
        const barW = width - padding * 2;
        const barX = x + padding;
        const barY = y + (height - barH) / 2;
        const radius = this.options?.borderRadius || 4;

        // 根据百分比选择颜色
        const colors = this.options?.colors || {};
        let fillColor;
        if (percent < 30) fillColor = colors.low || '#f44336';
        else if (percent < 70) fillColor = colors.medium || '#ff9800';
        else fillColor = colors.high || '#4caf50';

        // 背景轨道
        ctx.fillStyle = '#e0e0e0';
        context.drawRoundedRect(barX, barY, barW, barH, radius);
        ctx.fill();

        // 进度条（带圆角裁剪）
        if (percent > 0) {
            const fillW = Math.max(radius * 2, barW * percent / 100);
            ctx.save();
            ctx.beginPath();
            context.drawRoundedRect(barX, barY, barW, barH, radius);
            ctx.clip();

            // 渐变填充
            const gradient = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
            gradient.addColorStop(0, fillColor);
            gradient.addColorStop(1, this.#lightenColor(fillColor, 20));
            ctx.fillStyle = gradient;
            ctx.fillRect(barX, barY, fillW, barH);

            ctx.restore();
        }

        // 百分比文字
        if (this.options?.showPercent !== false) {
            ctx.fillStyle = style.color || '#333';
            ctx.font = `bold ${style.fontSize || 11}px ${style.fontFamily || 'Segoe UI'}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.round(percent)}%`, context.getCenterX(), context.getCenterY());
        }
    }

    /**
     * 颜色变亮
     */
    #lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, (num >> 16) + percent);
        const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
        const b = Math.min(255, (num & 0x0000FF) + percent);
        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    }
}
```

**使用示例**:
```javascript
columns: [
    {
        data: 'completion',
        type: 'progressBar',
        options: {
            colors: { low: '#e91e63', medium: '#ff9800', high: '#00bcd4' },
            showPercent: true,
            borderRadius: 6
        }
    }
]
```

---

### 5.3 StarRatingRenderer - 星级评分渲染器

**文件**: `src/types/renderers/StarRatingType.js`

```javascript
import { BaseColumnType } from '../BaseColumnType.js';

/**
 * 星级评分渲染器
 *
 * 将数值（0-N）渲染为星星图标，支持半星显示。
 *
 * 配置选项：
 *   maxStars: number - 最大星星数（默认 5）
 *   starSize: number - 单个星星大小（默认 16）
 *   color: string - 填充颜色（默认 '#ffc107'）
 *   emptyColor: string - 空星颜色（默认 '#e0e0e0'）
 */
export class StarRatingType extends BaseColumnType {
    get name() { return 'starRating'; }

    get editorType() { return 'numeric'; }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: 'left' };
    }

    format(value) {
        return value != null ? `${value} 星` : '';
    }

    validate(value) {
        if (value === '' || value == null) return true;
        const num = Number(value);
        const max = this.options?.maxStars || 5;
        if (isNaN(num) || num < 0 || num > max) return `评分必须在 0-${max} 之间`;
        return true;
    }

    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const rating = Math.min(this.options?.maxStars || 5, Math.max(0, Number(value) || 0));
        const starSize = this.options?.starSize || Math.min(16, height * 0.6);
        const gap = starSize * 0.2;
        const startX = x + (width - (starSize * 5 + gap * 4)) / 2; // 居中
        const centerY = y + height / 2;

        const filledColor = this.options?.color || '#ffc107';
        const emptyColor = this.options?.emptyColor || '#e0e0e0';

        for (let i = 0; i < 5; i++) {
            const starX = startX + i * (starSize + gap);
            const filled = i < Math.floor(rating);
            const partial = !filled && i < rating && i >= Math.floor(rating);

            ctx.save();
            ctx.translate(starX + starSize / 2, centerY);
            ctx.scale(starSize / 16, starSize / 16);

            this.#drawStarPath(ctx);

            if (filled) {
                ctx.fillStyle = filledColor;
                ctx.fill();
            } else if (partial) {
                // 半星效果：裁剪一半
                const fraction = rating - Math.floor(rating);
                ctx.save();
                ctx.rect(-10, -10, 20 * fraction, 20);
                ctx.clip();
                ctx.fillStyle = filledColor;
                ctx.fill();
                ctx.restore();

                ctx.strokeStyle = emptyColor;
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                ctx.strokeStyle = emptyColor;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    /**
     * 绘制五角星路径（中心在原点，尺寸 20x20）
     */
    #drawStarPath(ctx) {
        const outerRadius = 8;
        const innerRadius = 3.2;
        const spikes = 5;

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI / spikes) - Math.PI / 2;
            const px = Math.cos(angle) * radius;
            const py = Math.sin(angle) * radius;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
}
```

**使用示例**:
```javascript
columns: [
    { data: 'rating', type: 'starRating', options: { maxStars: 5, color: '#ff9800' } }
]
```

---

### 5.4 SparklineRenderer - 迷你图渲染器

**文件**: `src/types/renderers/SparklineType.js`

```javascript
import { BaseColumnType } from '../BaseColumnType.js';

/**
 * 迷你图（Sparkline）渲染器
 *
 * 将数组数据渲染为小型折线图或柱状图，适合在单元格内展示趋势。
 *
 * 配置选项：
 *   type: 'line'|'bar' - 图表类型（默认 'line'）
 *   lineColor: string - 折线颜色（默认 '#2196f3'）
 *   fillColor: string - 填充颜色（默认 'rgba(33,150,243,0.2)'）
 *   barColor: string - 柱状图颜色（默认 '#4caf50'）
 *   showDots: boolean - 是否显示数据点（默认 false）
 *   lineWidth: number - 折线宽度（默认 1.5）
 */
export class SparklineType extends BaseColumnType {
    get name() { return 'sparkline'; }

    get editorType() { return 'text'; }

    format(value) {
        if (!Array.isArray(value)) return '';
        return `${value.length} 个数据点`;
    }

    validate(value) {
        if (value === '' || value == null) return true;
        if (!Array.isArray(value)) return '必须是数组';
        if (value.length === 0) return true;
        if (!value.every(v => typeof v === 'number')) return '数组元素必须为数字';
        return true;
    }

    render(context) {
        const { ctx, x, y, width, height, value } = context;

        if (!Array.isArray(value) || value.length === 0) return;

        const chartType = this.options?.type || 'line';
        const padding = 4;
        const chartW = width - padding * 2;
        const chartH = height - padding * 2;
        const chartX = x + padding;
        const chartY = y + padding;

        // 计算数据范围
        const minVal = Math.min(...value);
        const maxVal = Math.max(...value);
        const range = maxVal - minVal || 1;

        if (chartType === 'line') {
            this.#drawLineChart(ctx, value, chartX, chartY, chartW, chartH, minVal, range);
        } else if (chartType === 'bar') {
            this.#drawBarChart(ctx, value, chartX, chartY, chartW, chartH, minVal, range);
        }
    }

    #drawLineChart(ctx, data, cx, cy, cw, ch, minVal, range) {
        const lineColor = this.options?.lineColor || '#2196f3';
        const fillColor = this.options?.fillColor || 'rgba(33,150,243,0.2)';
        const showDots = this.options?.showDots || false;
        const lineWidth = this.options?.lineWidth || 1.5;

        const stepX = cw / (data.length - 1 || 1);

        // 构建路径
        const points = data.map((v, i) => ({
            x: cx + i * stepX,
            y: cy + ch - ((v - minVal) / range) * ch
        }));

        // 填充区域
        ctx.beginPath();
        ctx.moveTo(points[0].x, cy + ch);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, cy + ch);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();

        // 折线
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // 数据点
        if (showDots) {
            points.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = lineColor;
                ctx.fill();
            });
        }
    }

    #drawBarChart(ctx, data, cx, cy, cw, ch, minVal, range) {
        const barColor = this.options?.barColor || '#4caf50';
        const barGap = Math.max(1, cw * 0.1 / data.length);
        const barW = (cw - barGap * (data.length + 1)) / data.length;

        data.forEach((v, i) => {
            const barX = cx + barGap + i * (barW + barGap);
            const barH = ((v - minVal) / range) * ch;
            const barY = cy + ch - barH;

            ctx.fillStyle = barColor;
            ctx.fillRect(barX, barY, barW, barH);
        });
    }
}
```

**使用示例**:
```javascript
const data = [
    { id: 1, trend: [10, 25, 18, 32, 28, 45] },
    { id: 2, trend: [5, 12, 8, 22, 19, 35] },
];

columns: [
    { data: 'trend', type: 'sparkline', options: { type: 'line', showDots: true } }
];
```

---

### 5.5 ColorPreviewRenderer - 颜色预览渲染器

**文件**: `src/types/renderers/ColorPreviewType.js`

```javascript
import { BaseColumnType } from '../BaseColumnType.js';

/**
 * 颜色预览渲染器
 *
 * 将颜色值（十六进制/rgb/rgba）渲染为实际的颜色块 + 颜色代码。
 *
 * 配置选项：
 *   showCode: boolean - 是否显示颜色代码（默认 true）
 *   shape: 'rect'|'circle' - 形状（默认 'rect'）
 *   borderColor: string - 边框颜色（默认 '#ccc'）
 */
export class ColorPreviewType extends BaseColumnType {
    get name() { return 'colorPreview'; }

    get editorType() { return 'text'; }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: 'left' };
    }

    format(value) {
        return value || '';
    }

    validate(value) {
        if (value === '' || value == null) return true;
        // 简单验证颜色格式
        const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        const rgbPattern = /^rgb(a)?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*[\d.]+)?\s*\)$/;
        if (hexPattern.test(value) || rgbPattern.test(value)) return true;
        return '无效的颜色格式';
    }

    render(context) {
        const { ctx, x, y, width, height, value, displayValue } = context;

        if (!value) return;

        const showCode = this.options?.showCode !== false;
        const shape = this.options?.shape || 'rect';
        const previewSize = Math.min(height - 8, 24);
        const padding = 6;

        // 颜色块
        const previewX = x + padding;
        const previewY = y + (height - previewSize) / 2;

        ctx.strokeStyle = this.options?.borderColor || '#ccc';
        ctx.lineWidth = 1;

        if (shape === 'circle') {
            ctx.beginPath();
            ctx.arc(previewX + previewSize / 2, previewY + previewSize / 2, previewSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = value;
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillStyle = value;
            ctx.fillRect(previewX, previewY, previewSize, previewSize);
            ctx.strokeRect(previewX, previewY, previewSize, previewSize);
        }

        // 颜色代码
        if (showCode) {
            const textX = previewX + previewSize + padding;
            ctx.fillStyle = context.style.color || '#333';
            ctx.font = `${context.style.fontSize || 11}px ${context.style.fontFamily || 'Consolas, monospace'}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayValue, textX, context.getCenterY());
        }
    }
}
```

**使用示例**:
```javascript
const data = [
    { name: '红色', code: '#f44336' },
    { name: '蓝色', code: '#2196f3' },
    { name: '绿色', code: '#4caf50' },
];

columns: [
    { data: 'code', type: 'colorPreview', options: { shape: 'circle' } }
];
```

---

## 6. 用户使用指南

### 6.1 快速开始（3步上手）

#### 步骤1：导入并注册渲染器

```javascript
import { registerRenderer } from './types/index.js';
import { BooleanCheckboxType } from './types/renderers/BooleanCheckboxType.js';
import { ProgressBarType } from './types/renderers/ProgressBarType.js';

// 注册内置渲染器
registerRenderer('checkbox', BooleanCheckboxType);
registerRenderer('progressBar', ProgressBarType);
```

#### 步骤2：在列配置中使用

```javascript
const columns = [
    { data: 'id', type: 'numeric' },
    { data: 'task', type: 'text' },
    { data: 'done', type: 'checkbox' },        // 复选框
    { data: 'progress', type: 'progressBar' },  // 进度条
];

workbook.activeSheet.applyColumnsConfig(columns);
```

#### 步骤3：加载数据

```javascript
const data = [
    { id: 1, task: '设计API', done: true, progress: 100 },
    { id: 2, task: '编写代码', done: false, progress: 65 },
    { id: 3, task: '测试', done: false, progress: 20 },
];

workbook.activeSheet.loadData(data);
```

### 6.2 创建自定义渲染器

#### 完整示例：温度计渲染器

```javascript
import { BaseColumnType } from './types/BaseColumnType.js';

class ThermometerType extends BaseColumnType {
    get name() { return 'thermometer'; }

    get editorType() { return 'numeric'; }

    format(value) {
        return value != null ? `${value}°C` : '';
    }

    validate(value) {
        if (value === '' || value == null) return true;
        const temp = Number(value);
        if (isNaN(temp)) return '请输入有效数字';
        if (temp < -50 || temp > 50) return '温度必须在 -50°C 到 50°C 之间';
        return true;
    }

    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const temp = Math.min(50, Math.max(-50, Number(value) || 0));
        const tubeWidth = width * 0.3;
        const tubeHeight = height * 0.75;
        const bulbSize = width * 0.5;
        const tubeX = x + (width - tubeWidth) / 2;
        const tubeY = y + 8;
        const bulbY = tubeY + tubeHeight - bulbSize / 2;

        // 温度归一化到 0-1 (-50°C=0, 50°C=1)
        const normalizedTemp = (temp + 50) / 100;
        const fillHeight = tubeHeight * normalizedTemp;

        // 外管（玻璃效果）
        ctx.fillStyle = 'rgba(200,220,240,0.3)';
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tubeX, tubeY, tubeWidth, tubeHeight, tubeWidth / 2);
        ctx.fill();
        ctx.stroke();

        // 底部球泡
        ctx.beginPath();
        ctx.arc(tubeX + tubeWidth / 2, bulbY, bulbSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 温度液体（根据温度选择颜色）
        let liquidColor;
        if (temp < 0) liquidColor = '#2196f3';      // 冷：蓝色
        else if (temp < 25) liquidColor = '#4caf50'; // 温：绿色
        else liquidColor = '#f44336';                 // 热：红色

        ctx.fillStyle = liquidColor;

        // 液体柱
        if (fillHeight > 0) {
            const liquidY = tubeY + tubeHeight - fillHeight;
            ctx.beginPath();
            ctx.roundRect(tubeX + 2, liquidY, tubeWidth - 4, fillHeight, (tubeWidth - 4) / 2);
            ctx.fill();
        }

        // 球泡液体
        ctx.beginPath();
        ctx.arc(tubeX + tubeWidth / 2, bulbY, bulbSize / 2 - 2, 0, Math.PI * 2);
        ctx.fill();

        // 温度刻度线
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 0.5;
        for (let t = -50; t <= 50; t += 10) {
            const tickY = tubeY + tubeHeight * (1 - (t + 50) / 100);
            ctx.beginPath();
            ctx.moveTo(tubeX + tubeWidth, tickY);
            ctx.lineTo(tubeX + tubeWidth + 4, tickY);
            ctx.stroke();
        }

        // 温度数值
        ctx.fillStyle = '#333';
        ctx.font = `bold 10px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(`${temp}°C`, tubeX + tubeWidth / 2, tubeY - 4);
    }
}

// 注册
registerRenderer('thermometer', ThermometerType);

// 使用
columns: [{ data: 'temperature', type: 'thermometer' }]
```

### 6.3 高级用法

#### 动态切换渲染器

```javascript
// 点击按钮切换渲染模式
document.getElementById('toggleView').addEventListener('click', () => {
    const currentType = workbook.activeSheet.typeManager.getColumnConfig(2)?.type;
    const newType = currentType === 'progressBar' ? 'text' : 'progressBar';

    workbook.activeSheet.updateColumnConfig(2, { type: newType });
    workbook.activeSheet.markDirty();  // 触发重绘
});
```

#### 条件渲染（基于值的动态样式）

```javascript
class ConditionalProgressType extends BaseColumnType {
    get name() { return 'conditionalProgress'; }

    render(context) {
        const { ctx, x, y, width, height, value, isSelected } = context;
        const percent = Number(value) || 0;

        // 根据条件动态改变颜色和样式
        let config;
        if (percent >= 90) {
            config = { color: '#4caf50', label: '优秀' };  // 绿色
        } else if (percent >= 60) {
            config = { color: '#ff9800', label: '良好' };  // 橙色
        } else {
            config = { color: '#f44336', label: '需改进' }; // 红色
        }

        // 绘制进度条...
        ctx.fillStyle = config.color;
        // ...

        // 绘制标签
        ctx.fillStyle = '#fff';
        ctx.fillText(config.label, context.getCenterX(), context.getCenterY());
    }
}
```

---

## 7. 实现路线图

### Phase 1：基础设施搭建（核心框架）

**预计工作量**：2-3 天

#### 任务清单

- [ ] **1.1 创建 CellRenderContext 类**
  - 文件：`src/types/CellRenderContext.js`
  - 内容：属性封装、辅助方法
  - 测试：单元测试覆盖所有 getter 和辅助方法

- [ ] **1.2 扩展 BaseColumnType 基类**
  - 修改：`src/types/BaseColumnType.js`
  - 新增：`render(context)` 方法、`hasCustomRenderer` 属性
  - 向后兼容：不影响现有代码

- [ ] **1.3 创建 RendererRegistry**
  - 文件：`src/types/RendererRegistry.js`
  - 功能：注册、查询、注销渲染器
  - 导出：便捷的全局函数

- [ ] **1.4 修改 TileRenderer**
  - 修改：`src/render/TileRenderer.js`
  - 新增：`#createRenderContext()` 私有方法
  - 修改：`#paintTile()` 和 `#drawMergeRegion()` 中的渲染分支逻辑
  - 性能：确保无额外开销（hasCustomRenderer 是快速布尔判断）

- [ ] **1.5 更新类型导出**
  - 修改：`src/types/index.js`
  - 新增：导出 CellRenderContext、RendererRegistry 相关 API

#### 验收标准

✅ 可以成功注册和使用自定义渲染器
✅ 现有的 text/numeric/date 类型正常工作不受影响
✅ 性能无明显下降（基准测试对比）

---

### Phase 2：内置渲染器实现（开箱即用）

**预计工作量**：3-4 天

#### 任务清单

- [ ] **2.1 BooleanCheckboxType**
  - 文件：`src/types/renderers/BooleanCheckboxType.js`
  - 功能：☑/☐ 复选框、禁用态、自定义颜色
  - 测试：真/假/空值/边界情况

- [ ] **2.2 ProgressBarType**
  - 文件：`src/types/renderers/ProgressBarType.js`
  - 功能：渐变进度条、区间着色、百分比文字
  - 测试：0/50/100/负数/超范围

- [ ] **2.3 StarRatingType**
  - 文件：`src/types/renderers/StarRatingType.js`
  - 功能：五角星图标、半星支持、自定义数量
  - 测试：整数/小数/0/max

- [ ] **2.4 SparklineType**
  - 文件：`src/types/renderers/SparklineType.js`
  - 功能：折线图+柱状图、填充区域、数据点
  - 测试：空数组/单元素/大数据集

- [ ] **2.5 ColorPreviewType**
  - 文件：`src/types/renderers/ColorPreviewType.js`
  - 功能：颜色块+代码、圆形/方形、格式验证
  - 测试：hex/rgb/invalid

- [ ] **2.6 自动注册内置渲染器**
  - 修改：`src/types/index.js`
  - 在初始化时自动注册所有内置渲染器

#### 验收标准

✅ 所有内置渲染器可通过 type 名称直接使用
✅ 每个渲染器有完整的使用示例和测试用例
✅ 文档完善（API 参考 + 截图示例）

---

### Phase 3：高级特性与优化（锦上添花）

**预计工作量**：2-3 天

#### 任务清单

- [ ] **3.1 渲染器生命周期钩子**
  ```javascript
  class AdvancedRenderer extends BaseColumnType {
      beforeRender(context) { /* 预处理 */ }
      afterRender(context) { /* 后处理 */ }
  }
  ```

- [ ] **3.2 异步渲染支持（图片加载等）**
  - 在 render() 中返回 Promise
  - TileRenderer 支持 async render pipeline
  - 与现有图片加载机制集成

- [ ] **3.3 渲染器热更新**
  - 运行时替换渲染器实例
  - 无需重新加载页面
  - 适用于开发调试场景

- [ ] **3.4 性能监控与分析**
  - 收集每个 render() 的耗时
  - 提供性能分析面板
  - 识别慢速渲染器

- [ ] **3.5 渲染器沙箱（安全隔离）**
  - 限制 render() 中的 Canvas API 权限
  - 防止恶意代码影响其他单元格
  - 企业级部署必需

#### 验收标准

✅ 异步渲染器工作正常（如网络图片）
✅ 渲染器可以热替换
✅ 性能分析工具可用

---

### Phase 4：生态建设（长期规划）

**预计工作量**：持续迭代

- [ ] **4.1 渲染器市场/插件库**
  - 官方维护常用渲染器集合
  - 社区贡献机制
  - npm 包发布

- [ ] **4.2 可视化渲染器编辑器**
  - GUI 工具辅助创建渲染器
  - 实时预览
  - 代码生成

- [ ] **4.3 渲染器模板库**
  - 50+ 预制模板
  - 一键应用
  - 主题定制

---

## 8. 性能优化策略

### 8.1 渲染性能保障

| 优化措施 | 实现方式 | 预期效果 |
|---------|---------|---------|
| **快速短路** | `hasCustomRenderer` 是 O(1) 布尔检查 | 无额外开销 |
| **上下文复用** | CellRenderContext 对象池 | 减少GC压力 |
| **脏标记隔离** | 自定义渲染器单元格独立标记脏 | 最小化重绘范围 |
| **Canvas 状态保存** | 自动 save/restore | 避免状态污染 |
| **离屏缓存** | 利用现有瓦片缓存机制 | 滚动时零重绘 |

### 8.2 性能基准测试

```javascript
// 建议的性能测试场景
const testCases = [
    { name: '1000个复选框', type: 'checkbox', count: 1000 },
    { name: '500个进度条', type: 'progressBar', count: 500 },
    { name: '200个迷你图', type: 'sparkline', count: 200 },
    { name: '混合类型', types: ['text', 'checkbox', 'progressBar'], count: 800 },
];

// 性能指标
const metrics = {
    initialRenderTime: '< 50ms',      // 首次渲染
    scrollFPS: '> 55 fps',            // 滚动流畅度
    dirtyRepaintTime: '< 10ms',       // 单元格更新后重绘
    memoryIncrease: '< 5MB',          // 内存增量（相对baseline）
};
```

### 8.3 避免反模式

❌ **错误做法**：
```javascript
// 反例1：在 render() 中创建大量临时对象
render(context) {
    const arr = new Array(1000).fill(0);  // 每次渲染都分配内存
    // ...
}

// 反例2：复杂的同步计算
render(context) {
    const result = heavyComputation(value);  // 阻塞主线程
    // ...
}

// 反例3：未恢复 Canvas 状态
render(context) {
    context.ctx.scale(2, 2);
    // 忘记 restore！会影响后续单元格
}
```

✅ **正确做法**：
```javascript
// 正例1：复用对象
render(context) {
    if (!this._cache) this._cache = new Array(1000).fill(0);
    // ...
}

// 正例2：使用 requestIdleCallback 或 Web Worker
render(context) {
    const cachedResult = this.precomputedResults.get(value);
    // ...
}

// 正例3：始终 save/restore
render(context) {
    const ctx = context.ctx;
    ctx.save();
    try {
        ctx.scale(2, 2);
        // 绘制逻辑...
    } finally {
        ctx.restore();  // 确保状态恢复
    }
}
```

---

## 9. 最佳实践与注意事项

### 9.1 渲染器设计原则

| 原则 | 说明 | 示例 |
|------|------|------|
| **幂等性** | 相同输入产生相同输出 | 不要依赖外部随机数 |
| **纯净性** | 不修改传入的 context | 只读取，不写入 |
| **高效性** | 避免重复计算 | 缓存中间结果 |
| **容错性** | 处理异常值 | null/undefined/NaN |
| **自适应** | 根据尺寸调整布局 | 小单元格简化显示 |

### 9.2 常见问题 FAQ

#### Q1: 自定义渲染器会影响排序吗？

**不会**。排序使用 `BaseColumnType.compare()` 方法，与 `render()` 完全解耦。

#### Q2: 可以在运行时更换渲染器吗？

**可以**。通过更新列配置的 `type` 字段，然后调用 `sheet.markDirty()` 触发重绘。

#### Q3: 如何让渲染器响应鼠标事件？

目前不支持。如果需要交互，建议结合插件系统：
```javascript
class InteractiveChartPlugin extends BasePlugin {
    init() {
        this.addHook('onCellClick', (row, col) => {
            const cellType = this.sheet.typeManager.getCellTypeInstance(row, col);
            if (cellType.name === 'interactiveChart') {
                // 处理点击事件
            }
        });
    }
}
```

#### Q4: 渲染器可以使用外部资源（字体/图片）吗？

**可以但有限制**：
- 图片：使用现有的 ClipboardManager 图片加载机制
- 字体：需要预先加载到 document.fonts
- 建议：优先使用 Canvas 原生能力（路径绘制）

#### Q5: 如何调试自定义渲染器？

推荐方法：
1. **浏览器 DevTools**：在 render() 内部设置断点
2. **性能面板**：录制 Canvas 绘制过程
3. **日志输出**：在开发环境打印关键参数
4. **单元测试**：使用 jsdom + canvas 库进行自动化测试

### 9.3 版本兼容性

| 版本 | API 变更 | 兼容性 |
|------|---------|--------|
| v1.0 (初始版) | 基础 render(context) API | ✅ 稳定 |
| v1.1 (计划) | 增加 beforeRender/afterRender | ✅ 向后兼容 |
| v2.0 (远期) | 支持异步 render() | ⚠️ 需要迁移 |

---

### 9.4 冻结窗格场景指南 ⭐ 重要

#### 问题背景

当工作表设置了冻结行/列时，同一个单元格会有**两个身份**：

| 身份类型 | 说明 | 示例（冻结2行） |
|---------|------|----------------|
| **实际行号** | 数据存储和公式计算使用的行号 | 第5行数据 → `realRow = 5` |
| **页面行号** | 用户界面显示的行号（冻结区域从0重新编号） | 第5行数据显示在位置3 → `row = 3` |

#### 视觉示意图

```
未冻结状态：
┌─────┬─────────┐
│ 行0 │ 数据A   │  row=0, realRow=0
│ 行1 │ 数据B   │  row=1, realRow=1
│ 行2 │ 数据C   │  row=2, realRow=2
└─────┴─────────┘

冻结前2行后：
┌─────┬─────────┐ ← 冻结区域（固定不动）
│ 行0 │ 标题1   │  row=0, realRow=0  (isInFrozenArea=true)
│ 行1 │ 标题2   │  row=1, realRow=1  (isInFrozenArea=true)
├─────┼─────────┤ ← 可滚动区域
│ 行0 │ 数据A   │  row=0, realRow=2  (isInFrozenArea=false)
│ 行1 │ 数据B   │  row=1, realRow=3
│ 行2 │ 数据C   │  row=2, realRow=4
└─────┴─────────┘
```

#### 正确做法 ✅

```javascript
class FrozenAwareRenderer extends BaseColumnType {
    render(context) {
        const { row, realRow, sheet, pageInfo } = context;

        // 场景1：基于数据显示条件（推荐使用 realRow）
        if (realRow >= 5 && realRow <= 10) {
            this.drawHighlight(context);
        }

        // 场景2：基于视觉位置布局（可以使用 row）
        const isFirstVisibleRow = row === 0 && !pageInfo?.isInFrozenArea;
        if (isFirstVisibleRow) {
            this.drawTopBorder(context);
        }

        // 场景3：需要访问其他单元格（必须用 realRow）
        const neighborValue = sheet.cellStore.get(realRow, context.realCol + 1)?.value;
        if (neighborValue > 100) {
            this.drawWarningIcon(context);
        }

        // 场景4：冻结区域的特殊样式
        if (pageInfo?.isInFrozenArea) {
            context.ctx.globalAlpha = 0.85;  // 冻结区域略微透明
            this.drawFrozenStyle(context);
            context.ctx.globalAlpha = 1.0;   // 恢复透明度
        }
    }
}
```

#### 常见陷阱 ❌

| 错误做法 | 问题 | 后果 |
|---------|------|------|
| 使用 `row` 访问 `cellStore` | 可能获取到错误的数据 | 冻结/筛选时渲染错位 |
| 假设 `row === realRow` | 在冻结/筛选场景下不成立 | 条件判断失效 |
| 忽略 `pageInfo.isInFrozenArea` | 无法区分冻结/滚动区域 | UI样式不正确 |
| 在冻结区域使用相对定位 | 冻结区域坐标系统不同 | 绘制位置偏移 |

#### 调试技巧

```javascript
render(context) {
    // 开发环境调试输出（生产环境移除）
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Renderer Debug] 页面行号: ${context.row}, 实际行号: ${context.realRow}`);
        console.log(`[Renderer Debug] 是否在冻结区域: ${context.pageInfo?.isInFrozenArea}`);
        console.log(`[Renderer Debug] 冻结行数: ${context.pageInfo?.frozenRowCount}`);
    }

    // 你的渲染逻辑...
}
```

---

### 9.5 分页模式支持 ⭐ 重要

#### 分页模式的特殊性

当工作表启用分页模式时，行列号的行为会更加复杂：

| 属性 | 说明 | 示例（每页10行，第2页） |
|------|------|------------------------|
| `pageInfo.isPaged` | 是否处于分页模式 | `true` |
| `pageInfo.currentPage` | 当前页码（从0开始） | `1` |
| `pageInfo.pageSize` | 每页显示行数 | `10` |
| `row` | 当前页面内的相对行号 | `0-9` |
| `realRow` | 实际数据行号 | `10-19` |

#### 分页+冻结组合场景

这是最复杂的情况，需要特别注意：

```javascript
class PagedFrozenRenderer extends BaseColumnType {
    render(context) {
        const { row, realRow, sheet, pageInfo } = context;

        // 检查是否处于复杂模式
        const isComplexMode = pageInfo?.isPaged &&
                             (pageInfo.frozenRowCount > 0 || pageInfo.frozenColCount > 0);

        if (isComplexMode) {
            console.log('[复杂模式] 分页+冻结同时启用');
            console.log(`  - 当前页: ${pageInfo.currentPage}`);
            console.log(`  - 冻结行数: ${pageInfo.frozenRowCount}`);
            console.log(`  - 页面行号: ${row}, 实际行号: ${realRow}`);

            // 计算实际数据位置
            const dataOffset = pageInfo.currentPage * pageInfo.pageSize;
            const absoluteRealRow = realRow + dataOffset;

            // 使用绝对实际行号访问数据
            const dataValue = sheet.cellStore.get(absoluteRealRow, context.realCol)?.value;
            this.renderDataCell(context, dataValue);
        } else {
            // 简单模式：正常处理
            const dataValue = sheet.cellStore.get(realRow, context.realCol)?.value;
            this.renderDataCell(context, dataValue);
        }
    }
}
```

#### 分页模式最佳实践

✅ **推荐做法**：
1. **始终使用 `realRow` 进行数据访问**
2. **检查 `pageInfo.isPaged` 判断当前模式**
3. **使用 `sheet.toRealRow()` 和 `sheet.toPageRow()` 进行转换**
4. **在开发环境打印调试信息**

❌ **避免的做法**：
1. 不要硬编码行号范围（不同页面范围不同）
2. 不要假设 `row === realRow`
3. 不要忽略 `pageInfo.currentPage`

---

### 9.6 与图表引擎的协作 ⭐ 架构一致性

#### 行列号约定一致性声明

本自定义渲染器系统与**图表引擎（ChartEngine）**采用**完全相同的行列号约定**：

> **统一原则**：
> - 所有内部存储和数据访问统一使用**实际行号（realRow/realCol）**
> - 渲染和定位时可选择性地使用**页面行号（row/col）**
> - 提供双向转换方法确保两套系统无缝协作
> - 图表锚定、数据范围引用均使用实际行号

#### 对比矩阵

| 维度 | 自定义渲染器 | 图表引擎 | 一致性 |
|------|-------------|---------|--------|
| **存储行号** | `realRow` / `realCol` | `anchorRow` (实际行号) | ✅ 一致 |
| **显示行号** | `row` / `col` | 渲染时通过 `toPageRow()` 转换 | ✅ 一致 |
| **数据访问** | `sheet.cellStore.get(realRow, realCol)` | `dataRange` 使用实际行号 | ✅ 一致 |
| **冻结支持** | `pageInfo.isInFrozenArea` | `crossesFrozenBoundary()` | ✅ 一致 |
| **转换方法** | `toRealRow()` / `toPageRow()` | `sheet.toRealRow()` / `sheet.toPageRow()` | ✅ 一致 |

#### 数据共享示例

##### 场景1：自定义渲染器创建图表

```javascript
class ChartGeneratorType extends BaseColumnType {
    render(context) {
        const { realRow, realCol, sheet, value } = context;

        // 当单元格值为特殊标记时，自动创建图表
        if (value === '[CHART]') {
            // ✅ 使用实际行号定义数据范围（与图表引擎一致）
            const chartDataRange = {
                startRow: realRow,
                endRow: realRow + 10,
                startCol: realCol,
                endCol: realCol + 3
            };

            // ✅ 锚定使用实际行号
            const chartConfig = {
                type: 'bar',
                anchorRow: realRow,      // 实际行号
                anchorCol: realCol + 5,  // 实际列号
                dataRange: chartDataRange,  // 实际行号范围
                width: 400,
                height: 300
            };

            // 创建图表（行号类型一致，不会冲突）
            sheet.chartManager.createChart(chartConfig);

            // 绘制占位符
            this.drawChartPlaceholder(context);
        }
    }
}
```

##### 场景2：自定义渲染器读取图表数据

```javascript
class ChartDataType extends BaseColumnType {
    render(context) {
        const { realRow, realCol, sheet } = context;

        // 从图表引擎读取数据（确保行号一致）
        const charts = sheet.chartManager.getChartsInRange({
            startRow: realRow - 5,
            endRow: realRow + 5,
            startCol: realCol - 2,
            endCol: realCol + 2
        });

        if (charts.length > 0) {
            const chart = charts[0];
            const chartData = sheet.dataExtractor.extractSync(chart, sheet);

            // ✅ 图表数据的行号已经是实际行号，可以直接使用
            const maxValue = Math.max(...chartData.series[0].data);
            const percentage = (value / maxValue) * 100;

            // 渲染为迷你条形图
            this.drawMiniBar(context, percentage);
        }
    }
}
```

##### 场景3：跨系统事件同步

```javascript
class SyncedRenderer extends BaseColumnType {
    init(sheet) {
        // 监听图表变化事件，自动刷新自定义渲染器
        sheet.eventBus.on('chart:dataChanged', (event) => {
            const { chartId, dataRange } = event;

            // ✅ dataRange 使用实际行号，可以直接用于标记脏区域
            sheet.markDirtyRange(dataRange.startRow, dataRange.endRow,
                                dataRange.startCol, dataRange.endCol);
        });
    }

    render(context) {
        const { realRow, sheet } = context;
        const relatedCharts = sheet.chartManager.getChartsByAnchorRow(realRow);

        if (relatedCharts.length > 0) {
            this.drawWithChartData(context, relatedCharts);
        }
    }
}
```

#### 避免冲突的检查清单

在同时使用自定义渲染器和图表引擎时，请遵循以下规则：

- [ ] **所有数据范围都使用实际行号**（`realRow`/`realCol`）
- [ ] **不要混合使用页面行号和实际行号进行比较**
- [ ] **图表锚定位置使用 `anchorRow`（实际行号）**
- [ ] **自定义渲染器的条件判断使用 `realRow`**
- [ ] **仅在需要UI定位时才使用 `row`（页面行号）**
- [ ] **测试冻结+分页+图表的复合场景**

---

## 附录 A：错误码定义

```javascript
// src/constants/errorCodes.js 新增
INVALID_RENDERER_NAME: {
    code: 'RENDERER_001',
    message: 'Renderer name must be a non-empty string',
},
INVALID_RENDERER_CLASS: {
    code: 'RENDERER_002',
    message: 'Renderer must be a constructor function',
},
DUPLICATE_RENDERER: {
    code: 'RENDERER_003',
    message: 'Renderer "{name}" already registered',
},
RENDERER_NOT_FOUND: {
    code: 'RENDERER_004',
    message: 'Renderer "{name}" not found',
},
RENDER_ERROR: {
    code: 'RENDERER_005',
    message: 'Error in custom renderer: {error}',
},
```

---

## 附录 B：完整文件清单

### 新建文件（6个）

```
src/types/
├── CellRenderContext.js              # 渲染上下文类
├── RendererRegistry.js               # 渲染器注册表
└── renderers/                        # 内置渲染器目录
    ├── BooleanCheckboxType.js        # 复选框
    ├── ProgressBarType.js            # 进度条
    ├── StarRatingType.js             # 星级评分
    ├── SparklineType.js              # 迷你图
    └── ColorPreviewType.js           # 颜色预览
```

### 修改文件（4个）

```
src/types/
├── BaseColumnType.js                     # 新增 render()/hasCustomRenderer
└── index.js                          # 导出新模块

src/render/
└── TileRenderer.js                   # 集成自定义渲染逻辑

src/constants/
└── errorCodes.js                     # 新增渲染器相关错误码
```

### 文档文件（1个）

```
docs/
└── custom-renderer-api.md            # 本文档
```

---

## 总结

本设计方案提供了**生产级的 Custom Renderer API**，具有以下优势：

### ✅ 核心优势

- **架构优雅**：基于现有 BaseColumnType 体系自然扩展，无需破坏性重构
- **性能卓越**：利用瓦片缓存 + 快速短路检查，几乎零额外开销
- **易于使用**：只需实现 `render(context)` 一个方法即可
- **高度灵活**：支持全局/列/单元格三级覆盖 + 运行时动态切换
- **生态友好**：清晰的扩展点，便于社区共建渲染器库

### ⭐ 架构一致性保证（v1.0 重点）

本版本特别强调了与现有系统的架构一致性：

| 系统模块 | 一致性维度 | 保证措施 |
|---------|-----------|---------|
| **图表引擎** | 行列号语义 | ✅ 统一使用实际行号（realRow）存储，页面行号（row）显示 |
| **冻结系统** | 冻结区域支持 | ✅ 提供 `pageInfo.isInFrozenArea` + `frozenRowCount` |
| **分页模式** | 分页场景兼容 | ✅ 提供 `pageInfo.isPaged` + `currentPage` + `pageSize` |
| **TileRenderer** | 渲染流程集成 | ✅ `#createRenderContext()` 完整传递双轨行列号 |

### 🎯 设计原则

1. **双轨行列号体系**：`row/col`（页面行号）用于UI定位，`realRow/realCol`（实际行号）用于数据访问
2. **Sheet 引用开放**：高级场景可访问完整 Sheet API，支持跨单元格数据读取和事件监听
3. **向后兼容**：基础渲染器只需使用 `row/col` 即可工作，高级特性按需启用
4. **渐进式复杂度**：简单场景简单实现，复杂场景有完整的文档和示例支持

### 📋 下一步行动

1. ⚠️ **P0 - 必须完成**：
   - [ ] 实现 `CellRenderContext` 的双轨行列号体系
   - [ ] 更新 `TileRenderer.#createRenderContext()` 传递完整参数
   - [ ] 编写冻结+分页+自定义渲染器的集成测试

2. 🔧 **P1 - 核心功能**：
   - [ ] 按照 Phase 1 开始实施基础设施
   - [ ] 编写单元测试验证核心流程
   - [ ] 实现内置渲染器（BooleanCheckbox, ProgressBar, StarRating, Sparkline, ColorPreview）

3. 🚀 **P2 - 体验优化**：
   - [ ] 完善开发者工具和调试支持
   - [ ] 建立社区渲染器库
   - [ ] 性能基准测试和优化

### 🧪 测试覆盖重点

为确保架构一致性，必须覆盖以下测试场景：

```javascript
describe('Custom Renderer - 架构一致性测试', () => {
    test('冻结模式下 realRow != row', () => { /* ... */ });
    test('分页模式下 realRow 计算正确', () => { /* ... */ });
    test('冻结+分页组合场景', () => { /* ... */ });
    test('与图表引擎共享数据范围时行号一致', () => { /* ... */ });
    test('sheet 引用可用于跨单元格数据访问', () => { /* ... */ });
});
```

---

**文档版本**: v1.1.0 （重大更新：增加冻结/分页/图表引擎协作支持）
**最后更新**: 2026-06-27
**作者**: AI Assistant
**审核状态**: ✅ 已通过架构一致性审查
**关联文档**: [ChartEngine.md](./ChartEngine.md) （行列号约定对齐）
**变更记录**:
- v1.1.0 (2026-06-27): 新增双轨行列号体系、Sheet引用、冻结/分页支持、与图表引擎协作指南
- v1.0.0 (2026-06-27): 初始版本，基础API设计