# 图表引擎 (Chart Engine) — 技术设计文档

## 目录

- [1. 项目背景与目标](#1-项目背景与目标)
- [2. 整体架构](#2-整体架构)
- [3. 数据模型](#3-数据模型)
  - [3.1 ChartModel — 图表数据模型](#31-chartmodel--图表数据模型)
  - [3.2 ChartManager — 图表集合管理](#32-chartmanager--图表集合管理)
- [4. 渲染层](#4-渲染层)
  - [4.1 ChartLayer — 图表图层](#41-chartlayer--图表图层)
  - [4.2 ChartRenderer — 图表绘制引擎](#42-chartrenderer--图表绘制引擎)
  - [4.3 ChartCache — 图表离屏缓存](#43-chartcache--图表离屏缓存)
- [5. 插件层](#5-插件层)
  - [5.1 ChartPlugin — 图表插件](#51-chartplugin--图表插件)
- [6. 交互层](#6-交互层)
  - [6.1 ChartSelectionStrategy — 图表选中策略](#61-chartselectionstrategy--图表选中策略)
- [7. 集成改造](#7-集成改造)
  - [7.1 RenderEngine 改造](#71-renderengine-改造)
  - [7.2 Sheet 改造](#72-sheet-改造)
  - [7.3 HIT_TYPE 扩展](#73-hit_type-扩展)
  - [7.4 HOOKS 扩展](#74-hooks-扩展)
  - [7.5 SHEET_EVENTS 扩展](#75-sheet_events-扩展)
- [8. 已知坑与解决方案](#8-已知坑与解决方案)
  - [8.1 P0 — 必须先解决](#81-p0--必须先解决)
  - [8.2 P1 — 核心功能阶段解决](#82-p1--核心功能阶段解决)
  - [8.3 P2 — 体验优化阶段解决](#83-p2--体验优化阶段解决)
  - [8.4 P3 — 后续迭代解决](#84-p3--后续迭代解决)
- [9. 文件结构](#9-文件结构)
- [10. API 参考](#10-api-参考)
- [11. 使用示例](#11-使用示例)
- [12. 渐进式实现路线](#12-渐进式实现路线)
- [13. 测试方案](#13-测试方案)
- [14. 未来扩展](#14-未来扩展)

---

## 1. 项目背景与目标

### 1.1 为什么需要图表引擎

电子表格的核心价值在于**数据可视化**。当前项目已具备完整的单元格渲染、公式计算、冻结窗格等能力，但缺少将数据转化为图表的功能。图表引擎是补齐 Excel 核心体验的关键模块。

### 1.2 设计目标

| 目标 | 指标 | 说明 |
|------|------|------|
| **架构融合** | 零侵入现有图层 | 图表作为独立 Layer 插入，不修改现有图层逻辑 |
| **性能可控** | 滚动时 < 2ms 图表开销 | 双缓存 + 视口裁剪 + 仅数据变化时重绘 |
| **数据联动** | 单元格变化自动刷新图表 | 通过 ReactiveStore + Sheet 事件驱动 |
| **冻结兼容** | 冻结区域内图表正确显示 | 锚定规则 + 冻结边界约束 |
| **可交互** | 点击选中、拖拽移动、缩放 | 独立 Strategy + hitTest 扩展 |
| **可扩展** | 新增图表类型只需 1 个函数 | ChartRenderer 的策略映射模式 |

### 1.3 与现有架构的关系

```
现有架构：
  BaseLayer → TileLayer / OverlayLayer / FrozenLayer / HeaderLayer / UILayer / ...
  BasePlugin → FreezePlugin / HiddenRowsPlugin / ...
  ReactiveStore → watch / batch / flush
  LayerCompositor → compose (按 zIndex 合成)
  EventHandler → Strategy 模式 (MouseStrategy / ResizeStrategy / ...)

图表引擎复用以上所有机制：
  ChartLayer extends BaseLayer     ← 图层化渲染
  ChartPlugin extends BasePlugin   ← 插件化 API
  ChartSelectionStrategy           ← Strategy 模式交互
  ReactiveStore.state.charts       ← 响应式状态
```

---

## 2. 整体架构

```
┌───────────────────────────────────────────────────────────────┐
│                        用户交互层                              │
│  ChartPlugin (插件入口)                                        │
│  ← 键盘快捷键 / 右键菜单 / API 调用                            │
│  ChartSelectionStrategy (图表选中/拖拽/缩放)                    │
└───────────────────────┬───────────────────────────────────────┘
                        │ 创建/编辑/删除图表
┌───────────────────────▼───────────────────────────────────────┐
│                       数据模型层                               │
│  ChartModel (图表配置)                                         │
│  ← 数据源范围、图表类型、样式配置、锚定位置                      │
│  ChartManager (图表集合)                                       │
│  ← Sheet 级别的图表 CRUD、行列变更同步                          │
└───────────────────────┬───────────────────────────────────────┘
                        │ 数据变更通知 (ReactiveStore + EventBus)
┌───────────────────────▼───────────────────────────────────────┐
│                        渲染层                                  │
│  ChartLayer (zIndex=4.5)                                      │
│  ← 独立图层，在 FrozenLayer(4) 之上、HeaderLayer(5) 之下       │
│  ChartRenderer (绘制引擎)                                      │
│  ← 柱状图 / 折线图 / 饼图 / 面积图 / 散点图                     │
│  ChartCache (图表离屏缓存)                                     │
│  ← 每个图表独立 Canvas，滚动时只做 drawImage 平移               │
└───────────────────────┬───────────────────────────────────────┘
                        │ 图表位置/大小
┌───────────────────────▼───────────────────────────────────────┐
│                        交互层                                  │
│  ChartSelectionStrategy ← 点击选中 / 拖拽移动 / 缩放图表       │
│  ChartEditOverlay       ← 选中后的边框 + 8 个控制手柄           │
└───────────────────────────────────────────────────────────────┘
```

### 图层 Z-index 排序（新增 ChartLayer 后）

```
┌─────────────────────────────────────────────┐
│ Layer 8:  EditorLayer       (zIndex=8)      │ ← 最顶层
├─────────────────────────────────────────────┤
│ Layer 7:  UILayer           (zIndex=7)      │
├─────────────────────────────────────────────┤
│ Layer 6:  DragIndicatorLayer(zIndex=6)      │
├─────────────────────────────────────────────┤
│ Layer 5:  HeaderLayer       (zIndex=5)      │
├─────────────────────────────────────────────┤
│ Layer 4.5: ChartLayer       (zIndex=4.5) ⭐  │ ← 新增
├─────────────────────────────────────────────┤
│ Layer 4:  FrozenLayer       (zIndex=4)      │
├─────────────────────────────────────────────┤
│ Layer 3:  ResizeLayer       (zIndex=3)      │
├─────────────────────────────────────────────┤
│ Layer 2:  OverlayLayer      (zIndex=2)      │
├─────────────────────────────────────────────┤
│ Layer 1:  TileLayer         (zIndex=1)      │ ← 最底层
└─────────────────────────────────────────────┘
```

**为什么 ChartLayer 在 FrozenLayer 之上？**

FrozenLayer 会在冻结区域内重新绘制完整的单元格数据（Tile + Overlay），
如果 ChartLayer 在 FrozenLayer 之下，冻结区域内的图表会被覆盖。
将 ChartLayer 放在 FrozenLayer 之上，图表始终可见。

---

## 3. 数据模型

### 3.1 ChartModel — 图表数据模型

**文件**：`src/model/chart/ChartModel.js`

```js
export const CHART_TYPE = {
    BAR: "bar",
    LINE: "line",
    PIE: "pie",
    AREA: "area",
    SCATTER: "scatter",
};
```

**设计意图**：
- ChartModel 是纯数据对象，不包含渲染逻辑和 DOM 引用
- 使用锚定机制：图表绑定到某个单元格位置，行列增删时自动跟随
- 数据源使用范围引用而非值拷贝，单元格变化时图表自动刷新
- 所有行列号统一使用**实际行号**（realRow），渲染时转换为页面行号

**锚定机制**：
- `anchorRow` / `anchorCol`：图表左上角锚定的单元格位置（实际行号）
- `offsetX` / `offsetY`：相对锚单元格左上角的像素偏移
- 图表的视口位置 = `ViewportTransform.cellToViewRect(anchorRow, anchorCol)` + offset

**行列号约定**：
- `anchorRow`：实际行号（通过 `sheet.toRealRow()` 转换后存储）
- `dataRange` 中的行号：实际行号
- 渲染时通过 `sheet.toPageRow()` 转换为页面行号再传给 ViewportTransform

**完整属性列表**：

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | `string` | `crypto.randomUUID()` | 唯一标识 |
| `type` | `string` | `"bar"` | 图表类型 |
| `anchorRow` | `number` | `0` | 锚定行号（实际行号） |
| `anchorCol` | `number` | `0` | 锚定列号 |
| `offsetX` | `number` | `0` | 相对锚单元格的 X 偏移（px） |
| `offsetY` | `number` | `0` | 相对锚单元格的 Y 偏移（px） |
| `width` | `number` | `400` | 图表宽度（px） |
| `height` | `number` | `300` | 图表高度（px） |
| `dataRange` | `object\|null` | `null` | 数据源范围（实际行号） |
| `categoryRange` | `object\|null` | `null` | 分类轴数据范围 |
| `series` | `Array` | `[]` | 手动指定的系列配置 |
| `style` | `object` | 见下方 | 样式配置 |
| `_cachedData` | `object\|null` | `null` | 提取后的数据缓存 |
| `_cacheVersion` | `number` | `-1` | 缓存版本号 |

**style 默认值**：

```js
{
    title: "",
    showLegend: true,
    showGrid: true,
    colors: ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"],
}
```

**关键方法**：

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `getBounds()` | `{x, y, w, h}` | 图表边界矩形（偏移坐标系） |
| `crossesFrozenBoundary(fixedCols, fixedRows)` | `boolean` | 是否跨越冻结边界 |
| `toJSON()` | `object` | 序列化 |
| `ChartModel.fromJSON(json)` | `ChartModel` | 反序列化 |

### 3.2 ChartManager — 图表集合管理

**文件**：`src/model/chart/ChartManager.js`

**职责**：
- 管理 Sheet 级别的图表 CRUD
- 监听行列增删事件，同步更新图表的数据范围和锚定位置
- 通过 EventBus 通知外部图表变更

**行列变更同步规则**：

| 操作 | anchorRow 处理 | dataRange 处理 |
|------|----------------|----------------|
| `insertRow(atRow)` | `>= atRow` 则 +1 | `startRow >= atRow` 则整体 +1；`startRow < atRow <= endRow` 则 endRow +1 |
| `deleteRow(atRow)` | `> atRow` 则 -1；`== atRow` 则 max(0, -1) | 包含 atRow 的范围缩小；范围坍缩为单行则置 null |
| `insertCol(atCol)` | `>= atCol` 则 +1 | 同 insertRow 逻辑 |
| `deleteCol(atCol)` | `> atCol` 则 -1；`== atCol` 则 max(0, -1) | 同 deleteRow 逻辑 |

**关键方法**：

| 方法 | 说明 |
|------|------|
| `add(chart)` | 添加图表，触发 `CHART_ADDED` 事件 |
| `remove(id)` | 移除图表，触发 `CHART_REMOVED` 事件 |
| `get(id)` | 获取图表 |
| `getAll()` | 获取所有图表 |
| `getChartsInRegion(topRow, leftCol, bottomRow, rightCol)` | 获取指定区域内的图表 |
| `insertRow(atRow)` | 插入行时同步 |
| `deleteRow(atRow)` | 删除行时同步 |
| `insertCol(atCol)` | 插入列时同步 |
| `deleteCol(atCol)` | 删除列时同步 |
| `destroy()` | 销毁，清理事件监听 |

---

## 4. 渲染层

### 4.1 ChartLayer — 图表图层

**文件**：`src/render/layers/ChartLayer.js`

**继承**：`BaseLayer`

**zIndex**：4.5（FrozenLayer 之上、HeaderLayer 之下）

**渲染策略**：

1. 遍历 ChartManager 中的所有图表
2. 通过 ViewportTransform 将锚单元格转为视口坐标
3. 视口裁剪：跳过视口外的图表
4. 使用 ChartCache 双缓存：数据未变化时直接 drawImage，变化时重绘
5. 每个图表使用 `ctx.clip()` 裁剪，防止内容溢出

**冻结区域处理**：

图表的滚动行为由锚定位置决定：
- 锚在冻结列区域 → 整个图表不随水平滚动移动
- 锚在冻结行区域 → 整个图表不随垂直滚动移动
- 锚在可滚动区域 → 整体随滚动移动

规则约束：图表不允许跨越冻结边界。如果锚在冻结区域，图表宽度/高度不能超过冻结区域边界。

**性能优化**：

- ChartCache 双缓存：每个图表独立离屏 Canvas，滚动时只做 drawImage
- 视口裁剪：只处理视口内的图表
- 脏标记：只在 charts 状态变化时重绘图表内容
- **不监听 scroll**：滚动时只平移缓存而非重绘

**关键方法**：

| 方法 | 说明 |
|------|------|
| `render(ctx, sheet, viewport, options)` | 渲染所有图表 |
| `hitTest(px, py)` | 图表命中检测 |
| `selectChart(chartId)` | 选中图表 |
| `deselectChart()` | 取消选中图表 |
| `invalidateChart(chartId)` | 标记指定图表缓存为脏 |
| `invalidateAllCharts()` | 标记所有图表缓存为脏 |

**bindStore 监听的键**：

| 键 | 说明 |
|------|------|
| `charts` | 图表数据变更 → 需要重绘图表内容 |
| `frozenOffset` | 冻结偏移量变更 → 冻结区域图表位置可能变化 |

注意：**不监听 scroll**，滚动时只平移缓存而非重绘。

### 4.2 ChartRenderer — 图表绘制引擎

**文件**：`src/render/chart/ChartRenderer.js`

纯 Canvas 2D 绘制工具类，不持有状态，不管理生命周期，由 ChartLayer 调用。

**绘制流程**：

```
1. #extractData(chart, sheet)    → 从 Sheet 提取数据
2. #renderBackground(ctx, area)  → 绘制白色背景 + 边框
3. #renderTitle(ctx, title, area)→ 绘制标题
4. #computePlotArea(area, chart) → 计算绘图区（留出标题、图例、坐标轴空间）
5. #renderAxes(ctx, data, plotArea, style) → 绘制坐标轴（非饼图）
6. #renderers[type](ctx, data, plotArea, style) → 绘制数据图形
7. #renderLegend(ctx, data, area, style) → 绘制图例
```

**数据提取约定**（与 Excel 一致）：

```
| 分类  | 销售额 | 利润  |     ← 第一行为系列名称
| Q1    | 100    | 30    |     ← 后续行为数据值
| Q2    | 150    | 45    |
```

- 跳过隐藏行/列，避免图表显示用户看不到的数据
- 如果没有分类轴数据，用序号代替

**扩展新图表类型**：

在 `#renderers` 映射表中注册新的绘制函数即可：

```js
this.#renderers["radar"] = (ctx, data, area, style) => this.#renderRadar(ctx, data, area, style);
```

**支持的图表类型**：

| 类型 | 常量 | 渲染方法 | 说明 |
|------|------|----------|------|
| 柱状图 | `CHART_TYPE.BAR` | `#renderBar` | 分组柱状图 |
| 折线图 | `CHART_TYPE.LINE` | `#renderLine` | 多系列折线 + 数据点 |
| 饼图 | `CHART_TYPE.PIE` | `#renderPie` | 百分比标签 |
| 面积图 | `CHART_TYPE.AREA` | `#renderArea` | 半透明填充 + 描边 |
| 散点图 | `CHART_TYPE.SCATTER` | `#renderScatter` | X-Y 散点 |

### 4.3 ChartCache — 图表离屏缓存

**文件**：`src/render/chart/ChartCache.js`

为每个图表维护独立的离屏 Canvas，实现双缓存渲染：
- 数据未变化时：直接 `drawImage` 复制缓存，无需重绘
- 数据变化时：重绘图表内容到缓存 Canvas

**优势**：
- 滚动时图表不需要重新计算和绘制，只需 drawImage 平移
- 多个图表时，只重绘数据变化的图表

**DPR 处理**：

```js
const dpr = window.devicePixelRatio || 1;
canvas.width = Math.round(width * dpr);   // 物理像素
canvas.height = Math.round(height * dpr);
canvas.style.width = `${width}px`;         // CSS 像素
canvas.style.height = `${height}px`;
```

**关键方法**：

| 方法 | 说明 |
|------|------|
| `get(chartId)` | 获取缓存 Canvas |
| `getOrCreate(chartId, width, height)` | 获取或创建缓存 Canvas |
| `invalidate(chartId)` | 标记为脏 |
| `invalidateAll()` | 标记全部为脏 |
| `isDirty(chartId)` | 是否为脏 |
| `markClean(chartId)` | 标记为干净 |
| `delete(chartId)` | 删除缓存 |
| `destroy()` | 销毁所有缓存 |

---

## 5. 插件层

### 5.1 ChartPlugin — 图表插件

**文件**：`src/plugins/ChartPlugin.js`

**继承**：`BasePlugin`

**PLUGIN_NAME**：`"chart"`

**使用方式**：

```js
const wb = new Workbook('grid', {
    plugins: ['chart'],
    pluginOptions: {
        chart: { defaultType: 'bar' }
    }
});

const chart = wb.getPlugin('chart');
chart.addChart('bar', { startRow: 0, startCol: 0, endRow: 5, endCol: 3 });
```

**钩子**：

| 钩子 | 触发时机 | 参数 |
|------|----------|------|
| `AFTER_CHART_ADD` | 图表添加后 | `chart: ChartModel` |
| `AFTER_CHART_REMOVE` | 图表删除后 | `chartId: string` |
| `AFTER_CHART_UPDATE` | 图表更新后 | `chart: ChartModel` |

**API 方法**：

| 方法 | 说明 |
|------|------|
| `addChart(type, dataRange, options)` | 添加图表 |
| `addBarChart(dataRange, options)` | 快捷：添加柱状图 |
| `addLineChart(dataRange, options)` | 快捷：添加折线图 |
| `addPieChart(dataRange, options)` | 快捷：添加饼图 |
| `removeChart(id)` | 删除图表 |
| `updateChartStyle(id, styleUpdate)` | 更新图表样式 |
| `updateChartDataRange(id, dataRange)` | 更新图表数据范围 |
| `moveChart(id, anchorRow, anchorCol, offsetX, offsetY)` | 移动图表位置 |
| `resizeChart(id, width, height)` | 调整图表大小 |
| `getChart(id)` | 获取图表 |
| `getAllCharts()` | 获取所有图表 |
| `hasCharts()` | 是否存在图表 |
| `selectChart(id)` | 选中图表 |
| `deselectChart()` | 取消选中图表 |

**冻结边界约束**：

`addChart()` 和 `moveChart()` / `resizeChart()` 内部会调用 `#clampToFrozenBoundary()`：
- 如果图表锚在冻结列区域，宽度不超过 `frozenColsWidth - offsetX - 2`
- 如果图表锚在冻结行区域，高度不超过 `frozenRowsHeight - offsetY - 2`
- 最小尺寸：宽 100px、高 80px

**合并单元格锚点处理**：

`addChart()` 时如果锚单元格在合并区域内，自动调整到合并区域的左上角：

```js
const merge = sheet.getMerge(anchorRow, anchorCol);
if (merge) {
    anchorRow = merge.topRow;
    anchorCol = merge.topCol;
}
```

---

## 6. 交互层

### 6.1 ChartSelectionStrategy — 图表选中策略

**文件**：`src/editor/strategies/ChartSelectionStrategy.js`

**继承**：`EventStrategy`

**优先级**：60（在 MouseStrategy(50) 之前，在 ResizeStrategy(100) 之后）

**处理的操作**：

| 操作 | 行为 |
|------|------|
| 点击图表区域 | 选中图表，显示边框 + 8 个控制手柄 |
| 拖拽图表 | 移动图表位置 |
| 拖拽控制手柄 | 缩放图表大小 |
| 点击空白区域 | 取消选中图表 |
| Delete 键 | 删除选中图表 |

**事件处理**：

| 事件 | 处理 |
|------|------|
| `CANVAS_MOUSEDOWN` | 检测图表命中，选中并开始拖拽 |
| `DOCUMENT_MOUSEMOVE` | 拖拽移动/缩放 |
| `DOCUMENT_MOUSEUP` | 结束拖拽 |

**选中边框**：

- 绿色虚线边框（`#217346`，lineWidth=2，`setLineDash([4, 3])`）
- 8 个白色方形控制手柄（6×6px，绿色描边）
  - 四角：左上、右上、左下、右下
  - 四边中点：上、下、左、右

---

## 7. 集成改造

### 7.1 RenderEngine 改造

**文件**：`src/render/RenderEngine.js`

#### 7.1.1 导入 ChartLayer

```js
import { ChartLayer } from "./layers/ChartLayer.js";
```

#### 7.1.2 `#initLayerSystem()` 中注册

```js
this.chartLayer = new ChartLayer();

this.compositor.register(this.tileLayer);
this.compositor.register(this.frozenLayer);
this.compositor.register(this.chartLayer);     // ← 新增
this.compositor.register(this.overlayLayer);
// ... 其余图层
```

#### 7.1.3 ReactiveStore 初始状态增加

```js
this.store = new ReactiveStore({
    // ...现有状态
    charts: { version: 0 },  // ← 新增
});
```

#### 7.1.4 `render()` 中 batch 内增加

```js
this.store.batch(() => {
    // ...现有状态同步
    this.store.state.charts.version = (this.store.state.charts.version ?? 0) + 1;
});
```

#### 7.1.5 `hitTest()` 中增加图表命中检测

```js
hitTest(clientX, clientY) {
    // ...现有代码

    if (px > headerW && py > headerH) {
        // 先检测图表命中（优先级高于单元格）
        const chartHit = this.chartLayer?.hitTest(px, py);
        if (chartHit) {
            return { type: HIT_TYPE.CHART, ...chartHit };
        }

        // 再检测单元格命中
        const col = vt.viewXToCol(px);
        const row = vt.viewYToRow(py);
        return { type: HIT_TYPE.CELL, row, col };
    }
}
```

#### 7.1.6 `invalidateAll()` 中增加图表缓存清理

```js
invalidateAll() {
    // ...现有代码
    this.chartLayer?.invalidateAllCharts();
}
```

### 7.2 Sheet 改造

**文件**：`src/workbook/Sheet.js`

#### 7.2.1 新增属性

```js
/** @type {import("../model/chart/ChartManager.js").ChartManager|null} 图表管理器（由 ChartPlugin 初始化时注入） */
chartManager = null;
```

#### 7.2.2 `#dispatchToSubSystems()` 中增加图表同步

```js
#dispatchToSubSystems(sub, ...args) {
    // ...现有分发逻辑
    if (this.chartManager) {
        switch (sub) {
            case SUB.INSERT_ROW: this.chartManager.insertRow(args[0]); break;
            case SUB.DELETE_ROW: this.chartManager.deleteRow(args[0]); break;
            case SUB.INSERT_COL: this.chartManager.insertCol(args[0]); break;
            case SUB.DELETE_COL: this.chartManager.deleteCol(args[0]); break;
        }
    }
}
```

### 7.3 HIT_TYPE 扩展

**文件**：`src/constants/hitType.js`

```js
// 新增
CHART: "chart",
```

### 7.4 HOOKS 扩展

**文件**：`src/constants/hookNames.js`

```js
// 新增
AFTER_CHART_ADD: "afterChartAdd",
AFTER_CHART_REMOVE: "afterChartRemove",
AFTER_CHART_UPDATE: "afterChartUpdate",
```

### 7.5 SHEET_EVENTS 扩展

**文件**：`src/constants/sheetEvents.js`

```js
// 新增
CHART_ADDED: "chart:added",
CHART_REMOVED: "chart:removed",
CHART_UPDATED: "chart:updated",
```

---

## 8. 已知坑与解决方案

### 8.1 P0 — 必须先解决

#### 坑 1：冻结区域 + 图表的位置冲突（最致命）

**问题**：ViewportTransform 的坐标转换是分段的——冻结列用 `scrollX=0`，非冻结列用真实 `scrollX`。图表如果跨越冻结边界，会出现"撕裂"。

```
┌──────────┬─────────────────────┐
│ 冻结列    │  可滚动区域          │
│ (不滚动)  │  (跟随滚动)         │
└──────────┴─────────────────────┘
        ↑ 图表横跨这条线会怎样？
```

**ViewportTransform 的分段逻辑**：

```js
colToViewX(col) {
    const effectiveSx = col < this.fixedCols ? 0 : this.scrollX;
    return this.headerW + this.rc.getColX(col) - effectiveSx;
}
```

**解决方案**：禁止图表跨越冻结边界。如果锚在冻结区域，图表宽度/高度不能超过冻结区域边界。通过 `ChartPlugin.#clampToFrozenBoundary()` 实现。

#### 坑 2：FrozenLayer 会覆盖 ChartLayer

**问题**：FrozenLayer 会在冻结区域内重新绘制完整的单元格数据（Tile + Overlay），如果 ChartLayer 的 zIndex 小于 FrozenLayer，冻结区域内的图表会被覆盖。

**解决方案**：ChartLayer 的 zIndex 必须大于 FrozenLayer(4)，设为 4.5。图表自己绘制白色背景，覆盖下方的单元格数据是合理的。

#### 坑 3：图表数据源引用的行列号体系混乱

**问题**：分页模式下，页面行号和实际行号不同。图表的 `dataRange` 和 `anchorRow` 到底用哪套？

- `ChartModel.anchorRow` 应该用**实际行号**（因为 `sheet.getCell(realRow, col)` 需要实际行号）
- 渲染时需要通过 `sheet.toPageRow()` 转换为页面行号再传给 ViewportTransform
- 用户选择选区时，`sheet.selection.getRange()` 返回的是**页面行号**

**解决方案**：`dataRange` 和 `anchorRow` 统一存储**实际行号**，创建时通过 `sheet.toRealRow()` 转换，渲染时通过 `sheet.toPageRow()` 转换。

### 8.2 P1 — 核心功能阶段解决

#### 坑 4：行列增删时图表数据范围不同步

**问题**：Sheet 的 `insertRow()` / `deleteRow()` 通过 `#dispatchToSubSystems()` 通知 cellStore、mergeManager、rowColManager，但不会通知 ChartManager。

**解决方案**：在 `#dispatchToSubSystems()` 中增加对 `chartManager` 的调用。ChartManager 的 `insertRow()` / `deleteRow()` 方法精确处理范围偏移。

#### 坑 5：图表选中与单元格选中的交互冲突

**问题**：点击图表区域时，`RenderEngine.hitTest()` 返回的是 `CELL` 类型，MouseStrategy 会把图表区域当作单元格处理。

**解决方案**：在 `hitTest()` 中先检测图表命中，再检测单元格命中。新增 `ChartSelectionStrategy` 拦截图表区域的鼠标事件。

#### 坑 6：图表每帧重绘的性能问题

**问题**：如果 ChartLayer 监听 scroll，每次滚动都会 markDirty()，但图表绘制比单元格复杂得多。

**解决方案**：
- ChartLayer **不监听 scroll**，滚动时只平移缓存
- 使用 ChartCache 双缓存：每个图表独立离屏 Canvas
- 只在 `charts` 和 `frozenOffset` 状态变化时标记脏
- 视口裁剪：只处理视口内的图表

### 8.3 P2 — 体验优化阶段解决

#### 坑 7：隐藏行/列导致图表数据困惑

**问题**：图表的 dataRange 包含被隐藏的行，提取数据时 `sheet.getCell(hiddenRow, col)` 仍然能取到数据，但用户看不到那些行。

**解决方案**：提取数据时跳过隐藏行/列，通过 `rowColManager.isHiddenRow(r)` 判断。

#### 坑 8：DPR 缩放下的图表文字模糊

**问题**：ChartRenderer 内部如果使用了 `ctx.save()/restore()` 并重置了 transform，文字会在高 DPR 屏幕上模糊。

**解决方案**：ChartRenderer 不要自己设置 setTransform，依赖 LayerCompositor 的统一设置。ChartCache 的 `getOrCreate()` 中正确处理 DPR。

#### 坑 9：合并单元格作为图表锚点

**问题**：如果图表锚定在一个被合并的单元格（非左上角），`viewport.cellToViewRect()` 返回的是单个单元格的位置，而不是合并区域的位置。

**解决方案**：创建图表时，如果锚单元格在合并区域内，自动调整到合并区域的左上角。

#### 坑 10：Z-index 排序冲突

**问题**：`LayerCompositor.getSortedLayers()` 使用 `a.zIndex - b.zIndex` 排序，相同 zIndex 的图层顺序不确定。

**解决方案**：使用小数 zIndex（ChartLayer = 4.5），避免与现有整数 zIndex 冲突。

### 8.4 P3 — 后续迭代解决

#### 坑 11：图表数据提取的性能

**问题**：`ChartRenderer.#extractData()` 每次渲染都要遍历 dataRange 内的所有单元格。如果数据范围很大（A1:Z1000 = 26000 个单元格），有性能开销。

**解决方案**：缓存提取结果到 `ChartModel._cachedData`，只在 `_cacheVersion` 变化时重新提取。

#### 坑 12：Undo/Redo 不包含图表操作

**问题**：图表的添加/删除/修改没有走 Command 系统，无法 undo/redo。

**解决方案**：新增 `AddChartCommand` / `RemoveChartCommand` / `UpdateChartStyleCommand`，遵循现有的 Command 模式。

#### 坑 13：多 Sheet 切换时图表状态丢失

**问题**：切换 Sheet 时，ChartLayer 的 `_chartHitAreas` 缓存是上一帧的，hitTest 可能命中已不存在的图表。

**解决方案**：ChartLayer.render() 开头清空 `_chartHitAreas`；切换 Sheet 时调用 `chartLayer.markDirty()`。

#### 坑 14：Canvas clip 嵌套

**问题**：如果 ChartLayer 在渲染时使用了 `ctx.clip()`，而外层又有 FrozenLayer 的 clip，嵌套 clip 会取交集。

**解决方案**：由于 ChartLayer 是独立图层（zIndex > FrozenLayer），在 FrozenLayer 之上渲染，不会遇到嵌套 clip 问题。但未来如果要在 FrozenLayer 内渲染图表的冻结部分，需要注意 clip 嵌套。

---

## 9. 文件结构

```
src/
├── model/chart/                  ← 新增目录
│   ├── ChartModel.js             # 图表数据模型
│   └── ChartManager.js           # 图表集合管理
│
├── render/chart/                 ← 新增目录
│   ├── ChartRenderer.js          # 图表绘制引擎
│   └── ChartCache.js             # 图表离屏缓存
│
├── render/layers/
│   └── ChartLayer.js             ← 新增图层
│
├── plugins/
│   └── ChartPlugin.js            ← 新增插件
│
├── editor/strategies/
│   └── ChartSelectionStrategy.js ← 新增交互策略
│
└── 需修改的文件：
    ├── render/RenderEngine.js        # 注册 ChartLayer + store + hitTest
    ├── workbook/Sheet.js             # 挂载 chartManager + #dispatchToSubSystems
    ├── constants/hitType.js          # 新增 CHART 类型
    ├── constants/hookNames.js        # 新增 AFTER_CHART_* 钩子
    └── constants/sheetEvents.js      # 新增 CHART_* 事件
```

---

## 10. API 参考

### ChartPlugin API

```ts
interface ChartPluginAPI {
    addChart(type?: CHART_TYPE, dataRange?: Range, options?: ChartOptions): ChartModel | null;
    addBarChart(dataRange?: Range, options?: ChartOptions): ChartModel | null;
    addLineChart(dataRange?: Range, options?: ChartOptions): ChartModel | null;
    addPieChart(dataRange?: Range, options?: ChartOptions): ChartModel | null;
    removeChart(id: string): void;
    updateChartStyle(id: string, styleUpdate: Partial<ChartStyle>): void;
    updateChartDataRange(id: string, dataRange: Range): void;
    moveChart(id: string, anchorRow: number, anchorCol: number, offsetX?: number, offsetY?: number): void;
    resizeChart(id: string, width: number, height: number): void;
    getChart(id: string): ChartModel | undefined;
    getAllCharts(): ChartModel[];
    hasCharts(): boolean;
    selectChart(id: string): void;
    deselectChart(): void;
}

interface Range {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

interface ChartOptions {
    anchorRow?: number;
    anchorCol?: number;
    offsetX?: number;
    offsetY?: number;
    width?: number;
    height?: number;
    style?: Partial<ChartStyle>;
}

interface ChartStyle {
    title: string;
    showLegend: boolean;
    showGrid: boolean;
    colors: string[];
}
```

---

## 11. 使用示例

### 基本用法：创建柱状图

```js
const wb = new Workbook("grid", {
    plugins: ["chart"],
});

const chartPlugin = wb.getPlugin("chart");

// 选中 A1:D6 区域后创建柱状图
const chart = chartPlugin.addBarChart({
    startRow: 0, startCol: 0,
    endRow: 5, endCol: 3,
});

console.log(chart.id);    // "a1b2c3d4-..."
console.log(chart.type);  // "bar"
```

### 自定义样式

```js
chartPlugin.addChart("line", dataRange, {
    width: 600,
    height: 400,
    style: {
        title: "月度销售趋势",
        showLegend: true,
        showGrid: false,
        colors: ["#FF6384", "#36A2EB"],
    },
});
```

### 更新图表

```js
chartPlugin.updateChartStyle(chartId, {
    title: "更新后的标题",
    showGrid: true,
});

chartPlugin.updateChartDataRange(chartId, {
    startRow: 0, startCol: 0,
    endRow: 10, endCol: 3,
});
```

### 移动和缩放

```js
chartPlugin.moveChart(chartId, 5, 8, 20, 30);
chartPlugin.resizeChart(chartId, 500, 350);
```

### 删除图表

```js
chartPlugin.removeChart(chartId);
```

### 监听图表事件

```js
wb.hooks.addHook("afterChartAdd", (chart) => {
    console.log("图表已添加:", chart.id);
});

wb.hooks.addHook("afterChartRemove", (chartId) => {
    console.log("图表已删除:", chartId);
});
```

---

## 12. 渐进式实现路线

| 阶段 | 内容 | 工作量 | 依赖 |
|------|------|--------|------|
| **Phase 1** | ChartModel + ChartManager + ChartLayer 骨架 | 1 天 | 无 |
| **Phase 2** | ChartRenderer 柱状图 + 折线图 | 2 天 | Phase 1 |
| **Phase 3** | ChartPlugin + API 集成 + hitTest | 1 天 | Phase 2 |
| **Phase 4** | 饼图 + 面积图 + 散点图 + 图例 | 1 天 | Phase 3 |
| **Phase 5** | ChartSelectionStrategy 选中/拖拽/缩放 | 2 天 | Phase 3 |
| **Phase 6** | 数据联动（单元格变化自动刷新图表） | 1 天 | Phase 3 |
| **Phase 7** | ChartCache 双缓存性能优化 | 1 天 | Phase 6 |
| **Phase 8** | Undo/Redo + 序列化/反序列化 | 2 天 | Phase 5 |

**总计约 11 个工作日**可完成一个功能完备的图表引擎。

---

## 13. 测试方案

### 13.1 单元测试

| 测试文件 | 测试内容 |
|----------|----------|
| `ChartModel.test.js` | 构造函数默认值、getBounds()、crossesFrozenBoundary()、toJSON()/fromJSON() |
| `ChartManager.test.js` | CRUD、行列变更同步（insertRow/deleteRow/insertCol/deleteCol） |
| `ChartRenderer.test.js` | 各图表类型渲染输出（快照测试） |
| `ChartCache.test.js` | getOrCreate、invalidate、DPR 处理 |
| `ChartPlugin.test.js` | addChart/removeChart/updateChartStyle、冻结边界约束、合并单元格锚点 |

### 13.2 集成测试

| 测试场景 | 验证点 |
|----------|--------|
| 创建图表后渲染 | 图表出现在正确位置 |
| 滚动时图表位置 | 图表跟随滚动正确移动 |
| 冻结区域内图表 | 图表不随滚动移动，不超出冻结边界 |
| 单元格数据变化 | 图表自动刷新 |
| 插入/删除行 | 图表锚定位置和数据范围正确更新 |
| 点击图表 | 选中状态正确，边框和手柄显示 |
| 拖拽图表 | 图表位置正确更新 |
| 多 Sheet 切换 | 图表状态正确切换 |
| 高 DPR 屏幕 | 图表文字清晰不模糊 |

### 13.3 性能测试

| 测试场景 | 基准 |
|----------|------|
| 5 个图表滚动帧率 | > 55 fps |
| 1 个图表重绘耗时 | < 2ms |
| 20 个图表首次渲染 | < 50ms |
| ChartCache 命中率 | > 90%（滚动场景） |

---

## 14. 未来扩展

### 14.1 短期（v1.1）

- **雷达图**：在 ChartRenderer 中新增 `#renderRadar`
- **环形图**：饼图变体，内圆镂空
- **堆叠柱状图**：`style.stacked = true`
- **数据标签**：`style.showDataLabels = true`
- **图表主题**：预设深色/浅色主题

### 14.2 中期（v1.5）

- **图表编辑器面板**：DOM 浮层，配置图表类型/数据/样式
- **数据范围高亮**：选中图表时，在 OverlayLayer 高亮数据源范围
- **图表动画**：初始渲染时的入场动画
- **Tooltip**：鼠标悬停显示数据点详情

### 14.3 长期（v2.0）

- **组合图**：柱状图 + 折线图叠加
- **次坐标轴**：双 Y 轴
- **图表导出**：导出为 PNG / SVG
- **图表模板**：保存/加载图表样式模板
- **3D 图表**：WebGL 渲染