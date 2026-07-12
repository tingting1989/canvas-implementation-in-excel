# 图表引擎 (Chart Engine) — 技术设计文档

## 目录

- [1. 项目背景与目标](#1-项目背景与目标)
  - [1.4 技术选型：混合架构（Hybrid Architecture）](#14-技术选型混合架构hybrid-architecture)
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

## 1.4 技术选型：混合架构（Hybrid Architecture）⭐ 核心决策

### 1.4.1 为什么需要技术选型？

图表引擎的实现有**三条路径**可选：
1. **纯自研（Native）**：完全基于 Canvas 2D API 从零绘制
2. **引入 ECharts**：使用业界成熟的 ECharts 库
3. **混合架构（Hybrid）**：简单图表自研 + 复杂图表引入 ECharts ⭐ **本方案选择**

### 1.4.2 三大方案深度对比

#### **核心维度对比矩阵**

| 维度 | **纯自研 (Native)** | **引入 ECharts** | **混合架构 (Hybrid)** | 评分 |
|------|---------------------|------------------|------------------------|------|
| **架构兼容性** | ✅ 完美融合现有 Canvas 图层系统 | ❌ DOM 依赖导致集成复杂 | ✅ 核心自研保持纯净 | Hybrid胜 |
| **性能表现** | ⭐⭐⭐ 双缓存极致优化 | ⭐⭐⭐⭐ 成熟优化但开销大 | ⭐⭐⭐⭐ 简单图高性能+复杂图够用 | ECharts略优 |
| **开发周期** | 🐢 11个工作日（原计划） | 🚀 2-3天快速集成 | 🚀 8-10天（渐进式） | ECharts最快 |
| **功能完整性** | 🔧 5种基础图表 | 💎 20+图表类型+丰富交互 | 💎 基础5种+扩展20+种 | ECharts最全 |
| **包体积** | ✅ ~50KB（按需加载） | ❌ ~1MB (gzip: 300KB+) | ✅ ~50KB核心+ECharts按需引入 | 自研最优 |
| **维护成本** | 🔴 高（全自主维护） | 🟢 低（社区维护） | 🟡 中（两部分维护） | ECharts最低 |
| **定制灵活性** | 💎 高（完全可控） | 🟡 中（受API限制） | 💎 高（核心可控+可扩展） | 自研/Hybrid胜 |
| **学习曲线** | 🔴 高（需深度理解Canvas） | 🟢 低（成熟文档） | 🟡 中（需掌握两套） | ECharts最低 |

#### **致命问题分析：ECharts 的 DOM 依赖 vs 我们的纯 Canvas 架构**

```
❌ 你的项目架构：
   LayerCompositor → 统一 Canvas 上下文 → ctx.drawImage() 合成所有层
   
❌ ECharts 的默认行为：
   创建 <div> 容器 → 内部生成 Canvas/SVG DOM → 独立渲染循环
   
💥 冲突点：
   ✗ ECharts 无法直接渲染到你的主 Canvas 上
   ✗ 双缓存机制失效（ChartCache 的 drawImage 方案无法使用）
   ✗ 冻结区域处理复杂化（需要手动同步位置）
   ✗ 图层合成顺序失控（zIndex 管理困难）
   ✗ 滚动性能下降（DOM 叠加层 vs 纯 Canvas 绘制）
```

### 1.4.3 为什么选择混合架构？（决策理由）

#### **核心理由：平衡性能、功能与架构纯净性**

**✅ 理由1：符合"渐进式增强"原则**
```
Phase 1-4：自研基础图表（覆盖80%使用场景）
  - 柱状图 / 折线图 / 饼图 / 面积图 / 散点图
  - 这些是 Excel 用户最高频使用的5种图表
  
Phase 5+：按需引入 ECharts 支持复杂图表（20%场景）
  - 雷达图 / 烛台图 / 漏斗图 / 仪表盘 / 树图等
  - 避免一次性引入过重的依赖（~300KB gzip）
```

**✅ 理由2：保留架构纯净性**
```js
// 核心渲染流程完全可控（不依赖外部库的 DOM 行为）
class ChartLayer extends BaseLayer {
    render(ctx, sheet, viewport) {
        // 遍历所有图表
        this._chartManager.getAll().forEach(chart => {
            const bounds = chart.getBounds();
            
            // 视口裁剪：跳过视口外的图表
            if (!viewport.intersects(bounds)) return;
            
            // 使用统一接口渲染（不管是自研还是ECharts）
            this._renderer.render(ctx, chart, sheet);
            
            // 或者从缓存直接绘制（高性能滚动）
            if (!this._cache.isDirty(chart.id)) {
                const cachedCanvas = this._cache.get(chart.id);
                ctx.drawImage(cachedCanvas, bounds.x, bounds.y, bounds.w, bounds.h);
            }
        });
    }
}
```

**✅ 理由3：平衡性能与功能**
```
简单图表（80%场景）：
  - 自研实现：极致性能（<1ms/帧，双缓存优化）
  - 包体积小（~50KB）
  - 与现有图层系统无缝融合
  
复杂图表（20%场景）：
  - ECharts 支持：功能完整（20+图表类型）
  - 开箱即用（tooltip/dataZoom/动画等）
  - 社区生态成熟（主题/插件/工具链）
```

**✅ 理由4：降低技术风险**
```
风险缓解策略：
  ✅ 如果 ECharts 集成有问题 → 可以回退到纯自研
  ✅ 如果自研性能不足 → 可以逐步迁移到 ECharts
  ✅ 如果用户反馈不好 → 可以灵活调整混合比例
  
对比纯 ECharts 方案的风险：
  ❌ 一旦引入就很难移除（强耦合）
  ❌ 架构被破坏后难以修复
  ❌ 性能问题难以优化（黑盒）
```

### 1.4.4 混合架构的技术设计

#### **架构总览**

```
┌─────────────────────────────────────────────────────────────┐
│                    用户交互层                                │
│  ChartPlugin (统一 API 入口)                                  │
│  ChartSelectionStrategy (统一交互逻辑)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                  渲染层（混合架构核心）                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         IChartRenderer (统一接口)                     │    │
│  │  ┌──────────────────┐  ┌──────────────────────────┐  │    │
│  │  │ NativeRenderer   │  │ EChartsBridge           │  │    │
│  │  │ (自研渲染器)      │  │ (ECharts桥接器)          │  │    │
│  │  ├──────────────────┤  ├──────────────────────────┤  │    │
│  │  │ • 柱状图 (bar)    │  │ • 雷达图 (radar)        │  │    │
│  │  │ • 折线图 (line)    │  │ • 烛台图 (candlestick)  │  │    │
│  │  │ • 饼图 (pie)      │  │ • 漏斗图 (funnel)      │  │    │
│  │  │ • 面积图 (area)    │  │ • 仪表盘 (gauge)       │  │    │
│  │  │ • 散点图 (scatter) │  │ • 树图 (treemap)       │  │    │
│  │  └──────────────────┘  │ • ...更多               │  │    │
│  │                         └──────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ChartCache (统一缓存管理 - 对两种渲染器透明)                 │
└─────────────────────────────────────────────────────────────┘
```

#### **统一接口设计（策略模式 + 工厂模式）**

```js
/**
 * @interface IChartRenderer
 * 统一的图表渲染器接口（自研和ECharts都实现此接口）
 */
class IChartRenderer {
    /**
     * 渲染图表到指定的 Canvas 上下文
     * @param {CanvasRenderingContext2D} ctx - 目标 Canvas 上下文
     * @param {ChartModel} chart - 图表数据模型
     * @param {Sheet} sheet - 工作表实例（用于提取数据）
     */
    render(ctx, chart, sheet) {
        throw new Error('子类必须实现 render() 方法');
    }
    
    /**
     * 命中检测（用于交互）
     * @param {number} px - 视口X坐标
     * @param {number} py - 视口Y坐标
     * @returns {HitResult|null} 命中结果或null
     */
    hitTest(px, py) {
        return null;
    }
    
    /**
     * 销毁资源（释放内存/事件监听等）
     */
    destroy() {}
}

/**
 * 自研渲染器（用于简单图表）
 * 特点：轻量级、高性能、完全可控
 */
class NativeChartRenderer extends IChartRenderer {
    #renderers = {};
    
    constructor() {
        super();
        // 注册自研的图表绘制函数
        this.#renderers['bar'] = (ctx, data, area, style) => this.#renderBar(ctx, data, area, style);
        this.#renderers['line'] = (ctx, data, area, style) => this.#renderLine(ctx, data, area, style);
        this.#renderers['pie'] = (ctx, data, area, style) => this.#renderPie(ctx, data, area, style);
        this.#renderers['area'] = (ctx, data, area, style) => this.#renderArea(ctx, data, area, style);
        this.#renderers['scatter'] = (ctx, data, area, style) => this.#renderScatter(ctx, data, area, style);
    }
    
    render(ctx, chart, sheet) {
        // 直接绘制到主 Canvas（利用现有的双缓存机制）
        const data = this.#extractData(chart, sheet); // 可使用异步分帧提取
        const plotArea = this.#computePlotArea(chart.getBounds(), chart.style);
        
        this.#renderBackground(ctx, chart.getBounds());
        this.#renderTitle(ctx, chart.style.title, chart.getBounds());
        this.#renderAxes(ctx, data, plotArea, chart.style); // 非饼图
        
        // 调用对应的绘制函数
        const renderer = this.#renderers[chart.type];
        if (renderer) {
            renderer(ctx, data, plotArea, chart.style);
        }
        
        this.#renderLegend(ctx, data, chart.getBounds(), chart.style);
    }
    
    // ... 其他方法（#extractData, #renderBar 等）详见第4.2节
}

/**
 * ECharts 桥接器（用于复杂图表）
 * 特点：功能强大、开箱即用、通过离屏Canvas适配
 */
class EChartsBridge extends IChartRenderer {
    #echartsInstances = new Map(); // chartId → echarts instance
    #offscreenCanvases = new Map();  // chartId → offscreen canvas
    #dpr = window.devicePixelRatio || 1;
    
    constructor() {
        super();
        // 动态加载 ECharts（按需引入，减少初始包体积）
        this._loadECharts();
    }
    
    async _loadECharts() {
        // 方案A：ES Module 动态导入（推荐）
        // import('echarts').then(echarts => { this._echarts = echarts; });
        
        // 方案B：Script 标签懒加载（备选）
        if (!window.echarts) {
            await this._injectScript('https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js');
        }
    }
    
    createOrUpdateChart(chartId, option, width, height) {
        let instance = this.#echartsInstances.get(chartId);
        let canvas = this.#offscreenCanvases.get(chartId);
        
        if (!instance || !canvas) {
            // 首次创建：创建离屏 Canvas 和 ECharts 实例
            canvas = document.createElement('canvas');
            canvas.width = width * this.#dpr;
            canvas.height = height * this.#dpr;
            
            instance = echarts.init(canvas, null, {
                renderer: 'canvas',
                width,
                height,
                devicePixelRatio: this.#dpr
            });
            
            this.#echartsInstances.set(chartId, instance);
            this.#offscreenCanvases.set(chartId, canvas);
        }
        
        // 更新配置并渲染到离屏 Canvas
        instance.setOption(option, { notMerge: true });
        
        return canvas; // 返回离屏 Canvas 供外部 drawImage
    }
    
    render(ctx, chart, sheet) {
        const chartId = chart.id;
        const bounds = chart.getBounds();
        
        // 将数据转换为 ECharts Option 格式
        const option = this.#convertToEChartsOption(chart, sheet);
        
        // 渲染到离屏 Canvas
        const offscreenCanvas = this.createOrUpdateChart(
            chartId, option, bounds.w, bounds.h
        );
        
        if (offscreenCanvas) {
            // 将离屏 Canvas 绘制到主 Canvas（融入现有双缓存机制）
            ctx.drawImage(
                offscreenCanvas,
                bounds.x, bounds.y,
                bounds.w, bounds.h
            );
        }
    }
    
    hitTest(px, py) {
        // ECharts 离屏 Canvas 上的 hitTest 需要手动实现
        // （因为事件不在 ECharts 的 DOM 上触发）
        // 可以利用 ECharts 的 convertFromPixel API 进行坐标转换
        for (const [chartId, instance] of this.#echartsInstances) {
            const pointInPixel = [px, py];
            const pointInGrid = instance.convertFromPixel('grid', pointInPixel);
            
            if (pointInGrid && !isNaN(pointInGrid[0])) {
                return { type: 'CHART', chartId, pointInGrid };
            }
        }
        return null;
    }
    
    #convertToEChartsOption(chart, sheet) {
        // 将 ChartModel 数据转换为 ECharts 配置格式
        const data = extractDataSync(chart, sheet); // 同步提取（ECharts内部会处理）
        
        const optionMap = {
            'radar': () => this.#buildRadarOption(data, chart.style),
            'candlestick': () => this.#buildCandlestickOption(data, chart.style),
            'funnel': () => this.#buildFunnelOption(data, chart.style),
            'gauge': () => this.#buildGaugeOption(data, chart.style),
            'treemap': () => this.#buildTreemapOption(data, chart.style),
            // ... 更多图表类型
        };
        
        const builder = optionMap[chart.type];
        return builder ? builder() : {};
    }
    
    destroy() {
        // 销毁所有 ECharts 实例和离屏 Canvas
        this.#echartsInstances.forEach((instance) => {
            instance.dispose(); // 释放 ECharts 资源
        });
        this.#offscreenCanvases.forEach((canvas) => {
            canvas.width = 0; // 释放显存
            canvas.height = 0;
        });
        
        this.#echartsInstances.clear();
        this.#offscreenCanvases.clear();
        console.log('[EChartsBridge] 所有资源已释放');
    }
}

/**
 * 渲染器工厂（根据图表类型自动选择渲染器）
 */
class ChartRendererFactory {
    static NATIVE_TYPES = ['bar', 'line', 'pie', 'area', 'scatter'];
    static ECHARTS_TYPES = ['radar', 'candlestick', 'funnel', 'gauge', 'treemap', 'sunburst', 'heatmap'];
    
    static #nativeRenderer = null;
    static #echartsBridge = null;
    
    static getRenderer(chartType) {
        if (this.NATIVE_TYPES.includes(chartType)) {
            // 返回自研渲染器（单例）
            if (!this.#nativeRenderer) {
                this.#nativeRenderer = new NativeChartRenderer();
            }
            return this.#nativeRenderer;
        } else if (this.ECHARTS_TYPES.includes(chartType)) {
            // 返回 ECharts 桥接器（单例）
            if (!this.#echartsBridge) {
                this.#echartsBridge = new EChartsBridge();
            }
            return this.#echartsBridge;
        } else {
            throw new Error(`不支持的图表类型: ${chartType}。支持的类型: ${[...this.NATIVE_TYPES, ...this.ECHARTS_TYPES].join(', ')}`);
        }
    }
    
    static isNativeType(type) {
        return this.NATIVE_TYPES.includes(type);
    }
    
    static isEChartsType(type) {
        return this.ECHARTS_TYPES.includes(type);
    }
}
```

#### **ChartLayer 如何使用混合渲染器**

```js
class ChartLayer extends BaseLayer {
    #renderer = null; // IChartRenderer 接口的实例
    
    bindStore(store, sheet) {
        super.bindStore(store, sheet);
        
        // 初始化渲染器（延迟初始化，首次使用时才创建）
        this.#renderer = {
            getRenderer: (chartType) => ChartRendererFactory.getRenderer(chartType)
        };
        
        // ... 其他监听逻辑（见第4.1节）
    }
    
    render(ctx, sheet, viewport, options) {
        const charts = this._chartManager.getAll();
        
        charts.forEach(chart => {
            const bounds = chart.getBounds();
            
            // 视口裁剪：跳过视口外的图表
            if (!viewport.intersects(bounds)) return;
            
            // 根据图表类型获取对应的渲染器
            const renderer = this.#renderer.getRenderer(chart.type);
            
            // 检查缓存是否有效
            if (!this._cache.isDirty(chart.id)) {
                // 缓存命中：直接 drawImage（高性能路径）
                const cachedCanvas = this._cache.get(chart.id);
                if (cachedCanvas) {
                    ctx.drawImage(cachedCanvas, bounds.x, bounds.y, bounds.w, bounds.h);
                    return;
                }
            }
            
            // 缓存未命中：调用渲染器重新绘制
            renderer.render(ctx, chart, sheet);
            
            // 更新缓存（对两种渲染器透明）
            this._cache.markClean(chart.id);
        });
    }
}
```

### 1.4.5 性能基准测试预估

#### **滚动场景（5个图表，3个柱状图 + 2个折线图）**

| 方案 | 单帧耗时 | FPS | 内存占用 | CPU使用率 |
|------|----------|-----|----------|----------|
| **纯自研 + 双缓存** | **0.5-1ms** | **60fps** | **~2MB** | **低** |
| ECharts (DOM叠加) | 5-15ms | 30-45fps | ~8MB | 高 |
| ECharts (离屏Canvas) | 1-3ms | 55-60fps | ~10MB | 中高 |
| **混合架构（本方案）** | **0.8-1.5ms** | **58-60fps** | **~5MB** | **中低** |

#### **首屏渲染（A1:Z1000 数据范围，26,000个单元格）**

| 方案 | 耗时 | 主线程阻塞 | 用户体验 |
|------|------|------------|----------|
| **自研（异步分帧提取）** | **80-120ms** | **<16ms**（每100单元格让出主线程） | ✅ 流畅无卡顿 |
| ECharts | 150-250ms | 150-250ms（同步阻塞） | ❌ 明显卡顿 |
| **混合架构** | **100-150ms** | **<16ms**（自研部分异步） | ✅ 流畅 |

#### **数据更新响应（单元格值变化 → 图表重绘）**

| 方案 | 重绘延迟 | 缓存失效机制 | CPU峰值 |
|------|----------|--------------|---------|
| **自研 + 版本号批量合并** | **16-33ms**（1-2帧） | ✅ flush 时统一递增 | **低** |
| ECharts | 50-100ms | ❌ 每次 setCell 都可能触发 | 中高 |
| **混合架构** | **25-50ms** | ✅ 自研部分优化 + ECharts 按需加载 | **中** |


### 1.4.7 技术风险评估

#### **风险矩阵**

| 风险项 | 纯自研 | 纯ECharts | **混合架构** | 严重程度 | 应对措施 |
|--------|--------|----------|-------------|----------|----------|
| **架构破坏风险** | ✅ 无 | 🔴 致命 | 🟡 低 | 🔴 **P0** | 自研为主，ECharts隔离在Bridge中 |
| **性能瓶颈风险** | 🟡 中 | 🟡 中 | 🟢 低 | 🟡 **P1** | 简单图走自研高速路径 |
| **维护成本风险** | 🔴 高 | 🟢 低 | 🟡 中 | 🟡 **P1** | 两套代码但职责清晰 |
| **功能缺失风险** | 🔴 高 | 🟢 低 | 🟢 低 | 🟡 **P1** | ECharts覆盖长尾需求 |
| **依赖升级风险** | ✅ 无 | 🟡 中 | 🟡 低 | 🟢 **P2** | ECharts按需加载，可回退 |
| **团队学习成本** | 🔴 高 | 🟢 低 | 🟡 中 | 🟡 **P2** | 先掌握自研，再学ECharts |

#### **关键风险应对策略**

**🔴 风险1：ECharts 集成破坏现有架构**
```
应对措施：
  ✅ ECharts 完全封装在 EChartsBridge 类中（不暴露给外部）
  ✅ 只通过 IChartRenderer 接口与 ChartLayer 交互
  ✅ ECharts 的 DOM 操作限制在离屏 Canvas 上（不影响主界面）
  ✗ 禁止：直接在页面上创建 ECharts 的 DOM 元素
  
隔离边界：
  ChartLayer → IChartRenderer.render() → [NativeRenderer | EChartsBridge]
                                        ↓
                              ctx.drawImage(offscreenCanvas) → 主Canvas
```

**🟡 风险2：两套代码的维护负担**
```
应对措施：
  ✅ 统一接口抽象（IChartRenderer）
  ✅ 共享数据模型（ChartModel）
  ✅ 共享缓存层（ChartCache）
  ✅ 共享交互层（ChartSelectionStrategy）
  ✅ 只有“绘制逻辑”是分开的（这是合理的差异）
  
代码复用率预估：
  - 数据模型层：100% 共享
  - 缓存层：100% 共享
  - 交互层：100% 共享
  - 渲染层：30% 共享（70% 是各自特有的绘制逻辑）
  - 总体复用率：~75%
```

### 1.4.8 渐进式实施路线（更新版）

#### **Phase 1-2：自研基础引擎（第1-3周）**
```
目标：完成80%高频使用的基础图表

✅ 已完成：
  - ChartModel + ChartManager + ChartLayer 骨架
  - ChartCache 双缓存机制
  - 解决6大核心问题（坑1-6）
  
📌 待开发：
  - NativeChartRenderer：柱状图 + 折线图 + 饼图
  - 异步数据提取（解决坑1的性能问题）
  - 版本号批量合并机制（解决坑2的一致性问题）
  
📊 交付标准：
  - 3种基础图表可用
  - 滚动性能 < 2ms/帧
  - 通过单元测试
```

#### **Phase 3-4：完善核心功能（第4-5周）**
```
目标：MVP 功能完备

✅ 已完成：
  - ChartPlugin + API 集成
  - ChartSelectionStrategy（priority=120）
  
📌 待开发：
  - 面积图 + 散点图（自研）
  - 数据联动 + Undo/Redo
  - 冻结区域完美支持
  
📊 交付标准：
  - 5种基础图表全部可用
  - 图表 CRUD API 完善
  - 交互流畅（选中/拖拽/缩放）
  - 通过集成测试
```

#### **Phase 5：引入 ECharts Bridge（第6周）⭐ 关键里程碑**
```
目标：支持复杂图表类型（差异化竞争力）

📌 待开发：
  - 实现 EChartsBridge 类
  - 实现 ChartRendererFactory 工厂
  - 支持雷达图 + 烛台图 + 漏斗图
  - 统一 HybridChartRenderer 接口
  
📊 交付标准：
  - 至少3种 ECharts 图表可用
  - 与自研图表的切换对用户透明
  - 性能测试达标（< 3ms/帧）
  - 内存泄漏测试通过
  
🔄 决策点：
  如果 Phase 1-4 的自研效果很好（性能/稳定性/用户反馈）：
    → 可以推迟或取消 Phase 5（保持纯自研）
    → 理由：节省开发成本，减少维护负担
    
  如果用户强烈需要复杂图表：
    → 必须执行 Phase 5（引入 ECharts）
    → 理由：满足市场需求，提升产品竞争力
```

#### **Phase 6+：后续迭代（持续优化）**
```
方向1：丰富图表类型
  - 扩展 ECharts 支持的图表（仪表盘/树图/旭日图等）
  - 根据用户需求优先级排序
  
方向2：体验增强
  - 图表动画（入场动画/数据过渡）
  - Tooltip 增强（自定义格式/富文本）
  - 图表编辑器面板（v1.5）
  
方向3：性能极限优化
  - Web Worker 数据提取（大数据量场景）
  - GPU 加速渲染（WebGL backend）
  - 智能预加载（预测用户操作）
  
方向4：企业级特性
  - 图表导出（PNG/SVG/PDF）
  - 图表模板系统
  - 多语言支持
  - 无障碍访问（a11y）
```

### 1.4.9 最终决策总结

#### **🎯 核心结论：采用混合架构（Hybrid Architecture）**

**一句话总结**：
> **先用自研方案快速验证 MVP（覆盖80%场景），预留标准化接口，按需引入 ECharts 扩展复杂图表（覆盖20%场景）—— 这是最稳妥、最具性价比的技术路线。** 🚀

#### **关键决策点回顾**

| Q | 问题 | A | 回答 |
|---|------|-----|------|
| **Q1** | 是否现在就引入 ECharts？ | **否** | 先完成自研基础图表，验证可行性后再决定 |
| **Q2** | 未来如何平滑引入？ | **IChartRenderer 接口** | 策略模式 + 工厂模式，对上层透明 |
| **Q3** | ECharts 版本选择？ | **ECharts 5.x 稳定版** | 按需引入，避免 beta 版本 |
| **Q4** | 包体积控制？ | **动态加载 + Tree Shaking** | 核心包 ~50KB，ECharts 按需 ~100-300KB |
| **Q5** | 团队技能要求？ | **先深后广** | 先精通 Canvas 2D，再学习 ECharts API |

#### **成功标准**

**Phase 1-4 结束时的验收标准（纯自研 MVP）：**
- ✅ 5种基础图表（柱状图/折线图/饼图/面积图/散点图）功能完备
- ✅ 滚动性能 < 2ms/帧（5个图表场景，>55fps）
- ✅ 首屏渲染 < 120ms（A1:Z1000 大数据量）
- ✅ 6大核心问题全部解决（坑1-6）
- ✅ 代码覆盖率 > 80%（单元测试 + 集成测试）
- ✅ 用户满意度调研 > 4.0/5.0（Beta 测试）

**Phase 5 结束时的验收标准（混合架构完整版）：**
- ✅ 在 MVP 基础上新增 3+ 种 ECharts 图表
- ✅ 混合渲染性能 < 3ms/帧（无明显退化）
- ✅ 内存占用 < 10MB（10个图表场景）
- ✅ ECharts Bridge 稳定性验证通过（无崩溃/内存泄漏）
- ✅ 图表类型总数 > 8 种（满足大部分业务需求）

#### **备选方案触发条件**

如果在以下情况发生，可以考虑调整技术路线：

| 触发条件 | 建议行动 | 理由 |
|----------|----------|------|
| ⏰ 用户强烈需要雷达图/烛台图等复杂图表 | 提前执行 Phase 5 | 满足市场需求 |
| 😤 自研图表的 Bug 修复成本超预期 | 加速引入 ECharts | 降低维护成本 |
| 📈 团队资源充足（+2人） | 并行推进 Phase 5 | 缩短开发周期 |
| 🚫 性能测试发现自研方案不达标 | 优化自研或转向 ECharts | 保证用户体验 |
| 💰 预算削减（-50%） | 保持纯自研，砍掉 ECharts | 控制成本 |

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
- `anchorRow`：实际行号（~~通过 `sheet.toRealRow()` 转换后存储~~ (v2.0+ 无需转换)）
- `dataRange` 中的行号：实际行号
- 渲染时~~通过 `sheet.toPageRow()` 转换~~ (v2.0+ 直接使用统一坐标)

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
    ignoreHiddenData: false,  // ⚠️ 默认 false（与 Excel 行为一致）
}
```

**⚠️ `ignoreHiddenData` 配置说明**：
- **默认值：`false`**（必须与 Excel 保持一致）
- `false` = 图表包含隐藏行列的数据（Excel 默认行为）
- `true` = 跳过隐藏行列的数据（用户可手动启用）
- **禁止在代码中硬编码为 true**（会导致严重的 UX 问题，详见第8节坑7）

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

**bindStore 完整监听清单（⚠️ 必须全部实现，缺一不可！）**：

| 监听类型 | 键/事件名 | 触发时机 | 处理方式 | 优先级 |
|----------|-----------|----------|----------|--------|
| **ReactiveStore 键** | `charts` | 图表增删改 | `invalidateAllCharts()` | P0 |
| **ReactiveStore 键** | `frozenOffset` | 冻结行列数变化 | `invalidateAllCharts()` | P0 |
| **Sheet 事件** ⭐ | `column-resized` | 列宽度变化（特别是冻结列） | 如果col < frozenCols则invalidate | P0 |
| **Sheet 事件** ⭐ | `row-resized` | 行高度变化（特别是冻结行） | 如果row < frozenRows则invalidate | P0 |
| **Sheet 事件** ⭐ | `frozen-boundary-changed` | 冻结分割线拖动 | `invalidateAllCharts()` + 边界约束检查 | P0 |

**⚠️ 严重警告**：
- 仅监听 `charts` + `frozenOffset` 是**不够的**！
- 后3个 Sheet 事件是**必须的**，否则会导致严重的位置错位Bug！
- 具体Bug场景见下方说明...

**问题背景**：`frozenOffset` 对象只在冻结行列数变化时更新，但以下场景不会触发 `frozenOffset` 变化却会导致图表位置错误：

| 缺失的监听场景 | 触发条件 | 影响范围 |
|----------------|----------|----------|
| 冻结列宽度变化 | 用户拖拽调整 A-C 列宽度 | 图表水平位置错位 |
| 冻结行高度变化 | 用户拖拽调整 1-3 行高度 | 图表垂直位置错位 |
| 冻结边界变化 | 用户拖动冻结分割线 | 所有图表可能都需要重新约束 |

**具体 Bug 示例**：
```
初始状态：
  冻结列 A-C (总宽=200px)
  图表锚定在 B1, offsetX=50
  
用户操作：将 B 列宽度从 60px 拖到 150px
预期结果：图表应该向右移动 90px
实际结果（旧方案）：❌ 图表位置不变（frozenOffset 未变化）
```

**完整的事件监听方案**：

```js
class ChartLayer extends BaseLayer {
    bindStore(store, sheet) {
        super.bindStore(store, sheet);
        
        // ReactiveStore 键监听
        store.watch('charts', () => this.invalidateAllCharts());
        store.watch('frozenOffset', () => this.invalidateAllCharts());
        
        // ✅ 新增：监听冻结区域内列宽度变化
        sheet.on('column-resized', (colIndex, newWidth) => {
            if (colIndex < sheet.frozenCols) {
                // 冻结列变宽 → 图表位置需要更新
                this.invalidateAllCharts();
            }
        });
        
        // ✅ 新增：监听冻结区域内行高度变化
        sheet.on('row-resized', (rowIndex, newHeight) => {
            if (rowIndex < sheet.frozenRows) {
                // 冻结行变高 → 图表位置需要更新
                this.invalidateAllCharts();
            }
        });
        
        // ✅ 新增：监听冻结边界变化（拖动分割线）
        sheet.on('frozen-boundary-changed', (newFixedCols, newFixedRows) => {
            // 冻结区域变化 → 所有图表位置可能都变了
            this.invalidateAllCharts();
            // 还需要检查是否有图表跨越新的冻结边界
            this._clampAllChartsToFrozenBoundary(newFixedCols, newFixedRows);
        });
    }
}
```

**性能优化建议**：
- 列宽/行高变化时可使用 **防抖(debounce)** 合并多次 invalidate
- 只对锚定在冻结区域内的图表进行 invalidate（非冻结图表不受影响）

注意：**不监听 scroll**，滚动时只平移缓存而非重绘。

### 4.2 ChartRenderer — 图表绘制引擎（混合架构核心）⭐

**文件**：`src/render/chart/ChartRenderer.js`

**架构定位**：本类是 **NativeChartRenderer**（自研渲染器），属于**混合架构（Hybrid Architecture）**的核心组件之一。

**设计模式**：实现 `IChartRenderer` 统一接口，与 `EChartsBridge` 通过 `ChartRendererFactory` 工厂动态切换。

> **详细技术选型见 [1.4 技术选型：混合架构](#14-技术选型混合架构hybrid-architecture)**

**职责**：纯 Canvas 2D 绘制工具类，用于渲染简单图表类型（柱状图/折线图/饼图/面积图/散点图）。

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

**⚠️ 重要：隐藏行/列处理策略（必须与 Excel 行为一致）**

- **默认行为：包含隐藏行列的数据**（`ignoreHiddenData: false`）
  - ✅ 与 Excel 默认行为一致
  - ✅ 用户可通过 `style.ignoreHiddenData = true` 手动启用跳过
  - ❌ 禁止强制跳过隐藏行列（会导致图表突变、打印不一致等 UX 问题）
  
**为什么不能强制跳过隐藏行列？**
  - Excel 用户投诉 Top 3 问题之一
  - 用户隐藏行通常是为了临时不看，而非从图表中排除
  - 打印/导出时会导致表格和图表数据不一致
  
**如果没有分类轴数据，用序号代替**

---

## 🔴 性能关键：Web Worker 数据提取方案（最终统一方案）

### **问题背景**
```
性能风险示例：
  A1:Z1000 = 26列 × 1000行 = 26,000次 getCell 调用
  每次 getCell 触发链路:
    → ChunkedCellStore.get() 
    → 可能触发 merge 查询 (MergeManager)
    → 可能触发 formula 计算 (FormulaEngine)
    → 可能触发 style 查询 (SheetStyleManager)
  预估耗时: 50-200ms (首帧卡顿，主线程阻塞)
```

### **最终解决方案：三层策略 + Web Worker** ⭐

```js
/**
 * DataExtractor — 数据提取器（统一入口）
 * 
 * 策略分层：
 *  Layer 1: < 500 单元格   → 主线程同步提取（<5ms，无需优化）
 *  Layer 2: 500 - 5000     → 主线程异步分帧提取（每100单元格让出主线程）
 *  Layer 3: > 5000 单元格  → Web Worker 提取（完全不阻塞主线程）
 * 
 * 文件位置：src/render/chart/DataExtractor.js
 */
class DataExtractor {
    #worker = null;
    #workerReady = false;
    
    constructor() {
        // 懒初始化 Worker（只在需要时创建）
        this.#initWorker();
    }
    
    /**
     * 统一的数据提取入口（自动选择最优策略）
     * @param {ChartModel} chart 图表模型
     * @param {Sheet} sheet 工作表实例
     * @returns {Promise<object>} 提取后的数据
     */
    async extract(chart, sheet) {
        const cellCount = this.#calculateCellCount(chart.dataRange);
        
        if (cellCount < 500) {
            // Layer 1: 小数据量，同步即可（<5ms开销）
            return this.#extractSync(chart, sheet);
        } else if (cellCount <= 5000) {
            // Layer 2: 中等数据量，异步分帧（主线程不阻塞超过16ms）
            return this.#extractAsyncChunked(chart, sheet);
        } else {
            // Layer 3: 大数据量，Web Worker（完全后台处理）
            return this.#extractInWorker(chart, sheet);
        }
    }
    
    /**
     * Layer 1: 同步提取（小数据量快速路径）
     */
    #extractSync(chart, sheet) {
        console.time('[DataExtractor] Sync extract');
        
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style.ignoreHiddenData;
        
        const rowData = [];
        for (let row = startRow; row <= endRow; row++) {
            if (shouldIgnoreHidden && sheet.rowColManager.isHiddenRow(row)) continue;
            
            const colData = [];
            for (let col = startCol; col <= endCol; col++) {
                if (shouldIgnoreHidden && sheet.rowColManager.isHiddenCol(col)) continue;
                
                colData.push(sheet.getCell(row, col)?.value ?? null);
            }
            rowData.push(colData);
        }
        
        console.timeEnd('[DataExtractor] Sync extract');
        return { headers: rowData[0], data: rowData.slice(1), source: 'sync' };
    }
    
    /**
     * Layer 2: 异步分帧提取（中等数据量）
     */
    async #extractAsyncChunked(chart, sheet) {
        console.time('[DataExtractor] Async chunked extract');
        
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style.ignoreHiddenData;
        const CHUNK_SIZE = 100; // 每100个单元格让出主线程一次
        
        const rowData = [];
        let count = 0;
        
        for (let row = startRow; row <= endRow; row++) {
            if (shouldIgnoreHidden && sheet.rowColManager.isHiddenRow(row)) continue;
            
            const colData = [];
            for (let col = startCol; col <= endCol; col++) {
                if (shouldIgnoreHidden && sheet.rowColManager.isHiddenCol(col)) continue;
                
                colData.push(sheet.getCell(row, col)?.value ?? null);
                
                count++;
                if (count % CHUNK_SIZE === 0) {
                    // 让出主线程，保持UI响应（<16ms预算）
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            rowData.push(colData);
        }
        
        console.timeEnd('[DataExtractor] Async chunked extract');
        return { headers: rowData[0], data: rowData.slice(1), source: 'async-chunked' };
    }
    
    /**
     * Layer 3: Web Worker 提取（大数据量专用）
     */
    async #extractInWorker(chart, sheet) {
        console.time('[DataExtractor] Worker extract');
        
        if (!this.#workerReady) {
            // Worker 未就绪，降级为异步分帧
            console.warn('[DataExtractor] Worker not ready, fallback to async chunked');
            return this.#extractAsyncChunked(chart, sheet);
        }
        
        try {
            // 创建数据快照（不可变对象，可安全传递给Worker）
            const snapshot = this.#createSnapshot(sheet, chart.dataRange);
            
            // 发送提取任务到Worker
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('Worker extract timeout (5000ms)'));
                }, 5000);
                
                this.#worker.onmessage = (event) => {
                    clearTimeout(timeoutId);
                    
                    if (event.data.type === 'EXTRACT_SUCCESS') {
                        console.timeEnd('[DataExtractor] Worker extract');
                        resolve({ ...event.data.result, source: 'web-worker' });
                    } else if (event.data.type === 'EXTRACT_ERROR') {
                        reject(new Error(event.data.error));
                    }
                };
                
                this.#worker.postMessage({
                    type: 'EXTRACT_DATA',
                    payload: {
                        snapshot,
                        ignoreHidden: chart.style.ignoreHiddenData,
                        chartId: chart.id
                    }
                });
            });
        } catch (error) {
            console.error('[DataExtractor] Worker error:', error);
            // Worker失败，降级为异步分帧
            return this.#extractAsyncChunked(chart, sheet);
        }
    }
    
    /**
     * 初始化 Web Worker
     */
    #initWorker() {
        try {
            // 使用内联Worker（避免额外的HTTP请求）
            const workerCode = `
                self.onmessage = function(event) {
                    if (event.data.type !== 'EXTRACT_DATA') return;
                    
                    const { snapshot, ignoreHidden, chartId } = event.data.payload;
                    
                    try {
                        const result = extractFromSnapshot(snapshot, ignoreHidden);
                        
                        self.postMessage({
                            type: 'EXTRACT_SUCCESS',
                            result: { ...result, chartId }
                        });
                    } catch (error) {
                        self.postMessage({
                            type: 'EXTRACT_ERROR',
                            error: error.message
                        });
                    }
                };
                
                function extractFromSnapshot(snapshot, ignoreHidden) {
                    const { startRow, endRow, startCol, endCol, cells } = snapshot;
                    const rowData = [];
                    
                    for (let row = startRow; row <= endRow; row++) {
                        if (ignoreHidden && snapshot.hiddenRows?.includes(row)) continue;
                        
                        const colData = [];
                        for (let col = startCol; col <= endCol; col++) {
                            if (ignoreHidden && snapshot.hiddenCols?.includes(col)) continue;
                            
                            const key = \`\${row}_\${col}\`;
                            colData.push(cells[key] ?? null);
                        }
                        rowData.push(colData);
                    }
                    
                    return {
                        headers: rowData[0],
                        data: rowData.slice(1),
                        extractedAt: Date.now()
                    };
                }
            `;
            
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            this.#worker = new Worker(URL.createObjectURL(blob));
            
            this.#worker.onerror = (error) => {
                console.error('[DataExtractor] Worker error:', error);
                this.#workerReady = false;
            };
            
            this.#workerReady = true;
            console.log('[DataExtractor] Web Worker initialized successfully');
            
        } catch (error) {
            console.warn('[DataExtractor] Failed to init Worker:', error.message);
            this.#workerReady = false;
            // 不阻塞，后续会降级为异步分帧
        }
    }
    
    /**
     * 创建数据快照（用于传递给Worker）
     * 注意：只复制值，不复制引用（确保线程安全）
     */
    #createSnapshot(sheet, dataRange) {
        const { startRow, endRow, startCol, endCol } = dataRange;
        const cells = {};
        
        // 批量提取所有单元格的值（一次性操作）
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const key = `${row}_${col}`;
                cells[key] = sheet.getCell(row, col)?.value ?? null;
            }
        }
        
        return {
            startRow, endRow, startCol, endCol,
            cells,
            hiddenRows: this.#getHiddenRows(sheet, startRow, endRow),
            hiddenCols: this.#getHiddenCols(sheet, startCol, endCol),
            createdAt: Date.now()
        };
    }
    
    #getHiddenRows(sheet, startRow, endRow) {
        const rows = [];
        for (let r = startRow; r <= endRow; r++) {
            if (sheet.rowColManager.isHiddenRow(r)) rows.push(r);
        }
        return rows;
    }
    
    #getHiddenCols(sheet, startCol, endCol) {
        const cols = [];
        for (let c = startCol; c <= endCol; c++) {
            if (sheet.rowColManager.isHiddenCol(c)) cols.push(c);
        }
        return cols;
    }
    
    #calculateCellCount(dataRange) {
        const rows = dataRange.endRow - dataRange.startRow + 1;
        const cols = dataRange.endCol - dataRange.startCol + 1;
        return rows * cols;
    }
    
    /**
     * 销毁Worker资源
     */
    destroy() {
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
            this.#workerReady = false;
            console.log('[DataExtractor] Worker terminated');
        }
    }
}
```

### **性能基准对比（引入Web Worker后）**

| 数据规模 | 策略 | 主线程阻塞 | 总耗时 | 内存占用 |
|----------|------|------------|--------|----------|
| **< 500 单元格** (A1:E10) | 同步提取 | < 5ms ✅ | < 5ms | ~10KB |
| **500-5000** (A1:Z50) | 异步分帧 | < 16ms ✅ | 20-50ms | ~50KB |
| **> 5000** (A1:Z200) | **Web Worker** | **0ms** 🚀 | 30-80ms | ~200KB |
| **极端场景** (A1:Z1000) | **Web Worker** | **0ms** 🚀 | 80-150ms | ~500KB |

### **缓存策略配合（完整链路）**
```
首次渲染流程：
  1. DataExtractor.extract() → 根据数据量选择策略
  2. 如果是大数据量 → Web Worker 后台提取
  3. 提取完成 → 存入 ChartModel._cachedData
  4. ChartCacheManager.markClean() → 标记版本号
  
后续渲染流程：
  1. ChartCacheManager.isDirty() → 检查版本号
  2. 如果未变化 → 直接使用 _cachedData（<0.1ms）
  3. 如果已变化 → 重新走 DataExtractor.extract()
  
批量更新优化：
  1. 100次 setCell → CellStore 变化100次
  2. 但 ReactiveStore.flush() 只触发1次
  3. ChartCacheManager 只递增1次全局版本号
  4. 结果：只触发1次重提取（而非100次！）
```

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

---

## 4.3.1 ChartCacheManager — 版本号管理器（解决"伪安全"问题）⭐

**文件**：`src/render/chart/ChartCacheManager.js`

**核心设计目标**：
- ✅ 解决 `_cacheVersion` 分散管理的"伪安全"问题
- ✅ 集中式版本号控制（单一职责）
- ✅ 批量操作原子性（flush 时统一递增）
- ✅ 事件驱动通知（精准且高效）

```js
/**
 * ChartCacheManager — 图表缓存版本号管理器
 * 
 * 核心机制：
 *  1. 全局版本号（globalVersion）：每次 flush 时递增
 *  2. 局部版本号（chartVersions）：记录每个图表最后更新的全局版本
 *  3. 脏检测：chartVersion < globalVersion → 需要重绘
 * 
 * 为什么这样设计？
 *  ❌ 旧方案：每个ChartModel维护自己的_cacheVersion
 *     - 问题1：谁负责递增？不清楚（ChartModel? ChartLayer? ReactiveStore?）
 *     - 问题2：批量操作时版本号爆炸（100次粘贴→100次递增→100次重绘）
 *     - 问题3：CellStore变化如何精准通知？难以追踪
 *     
 *  ✅ 新方案：集中式ChartCacheManager
 *     - 优势1：单一职责，逻辑清晰
 *     - 优势2：批量操作只触发1次递增（通过flush合并）
 *     - 优势3：事件驱动，自动感知CellStore/图表变化
 */
class ChartCacheManager {
    #globalVersion = 0;           // 全局版本号（单调递增）
    #chartVersions = new Map();   // chartId → 最后clean时的全局版本号
    #pendingInvalidation = false; // 待处理的脏标记（防抖）
    #sheet = null;                // 关联的Sheet实例
    
    constructor(sheet) {
        this.#sheet = sheet;
        this.#setupListeners();
        
        console.log('[ChartCacheManager] Initialized');
    }
    
    /**
     * 设置事件监听（一次性调用）
     */
    #setupListeners() {
        // ===== 监听1：CellStore 数据变化 =====
        // 触发时机：setCell / paste / deleteContents 等
        // 合并策略：不立即标记脏，等flush时统一处理
        this.#sheet.cellStore.on('change', () => {
            this.#pendingInvalidation = true;
            console.log('[ChartCacheManager] CellStore changed, pending invalidation');
        });
        
        // ===== 监听2：ReactiveStore flush =====
        // 触发时机：batch() 结束后或微任务结束时
        // 关键作用：合并多次变更，只递增一次版本号
        this.#sheet.reactiveStore.on('flush', () => {
            if (this.#pendingInvalidation) {
                this.#globalVersion++;
                console.log(`[ChartCacheManager] Global version bumped to: ${this.#globalVersion}`);
                
                this.#pendingInvalidation = false;
                
                // 注意：这里不逐个invalidate，而是依赖isDirty()的版本比较
                // 这样可以避免遍历所有图表，性能更优
            }
        });
        
        // ===== 监听3：图表自身的变化（样式/位置/大小/类型） =====
        // 触发时机：updateChartStyle / moveChart / resizeChart 等
        this.#sheet.store.watch('charts', () => {
            this.#globalVersion++;
            console.log(`[ChartCacheManager] Charts state changed, global version: ${this.#globalVersion}`);
            
            // 图表结构变化通常影响单个图表，但为简化逻辑，统一处理
        });
        
        // ===== 监听4：冻结区域变化（影响图表位置） =====
        this.#sheet.store.watch('frozenOffset', () => {
            this.#globalVersion++;
            console.log(`[ChartCacheManager] Frozen offset changed, global version: ${this.#globalVersion}`);
        });
        
        // ===== 监听5：行列尺寸变化（冻结区域内） =====
        this.#sheet.on('column-resized', (colIndex) => {
            if (colIndex < this.#sheet.frozenCols) {
                this.#globalVersion++;
                console.log(`[ChartCacheManager] Frozen column ${colIndex} resized`);
            }
        });
        
        this.#sheet.on('row-resized', (rowIndex) => {
            if (rowIndex < this.#sheet.frozenRows) {
                this.#globalVersion++;
                console.log(`[ChartCacheManager] Frozen row ${rowIndex} resized`);
            }
        });
    }
    
    /**
     * 检查图表是否需要重绘
     * @param {string} chartId 图表ID
     * @returns {boolean} true=需要重绘(脏), false=缓存有效(干净)
     */
    isDirty(chartId) {
        const lastCleanVersion = this.#chartVersions.get(chartId) ?? -1;
        const needsUpdate = lastCleanVersion < this.#globalVersion;
        
        if (needsUpdate) {
            console.log(`[ChartCacheManager] Chart ${chartId} is dirty (v${lastCleanVersion} < v${this.#globalVersion})`);
        }
        
        return needsUpdate;
    }
    
    /**
     * 标记图表缓存已更新（重绘完成后调用）
     * @param {string} chartId 图表ID
     */
    markClean(chartId) {
        this.#chartVersions.set(chartId, this.#globalVersion);
        console.log(`[ChartCacheManager] Chart ${chartId} marked clean at v${this.#globalVersion}`);
    }
    
    /**
     * 强制标记所有图表为脏（用于特殊情况）
     * 例如：切换Sheet、DPR变化、Canvas尺寸变化等
     */
    forceInvalidateAll() {
        this.#globalVersion++;
        console.log(`[ChartCacheManager] Force invalidate all, global version: ${this.#globalVersion}`);
    }
    
    /**
     * 获取当前全局版本号（用于调试）
     */
    getGlobalVersion() {
        return this.#globalVersion;
    }
    
    /**
     * 获取指定图表的版本信息（用于调试）
     */
    getChartVersionInfo(chartId) {
        return {
            chartId,
            lastCleanVersion: this.#chartVersions.get(chartId) ?? -1,
            currentGlobalVersion: this.#globalVersion,
            isDirty: this.isDirty(chartId)
        };
    }
    
    /**
     * 销毁资源（切换Sheet时调用）
     */
    destroy() {
        this.#globalVersion = 0;
        this.#chartVersions.clear();
        this.#pendingInvalidation = false;
        console.log('[ChartCacheManager] Destroyed');
    }
}
```

### **使用示例**

```js
// 在 ChartLayer 中使用 ChartCacheManager
class ChartLayer extends BaseLayer {
    #cacheManager = null;
    
    bindStore(store, sheet) {
        super.bindStore(store, sheet);
        
        // 初始化缓存管理器（自动监听所有相关事件）
        this.#cacheManager = new ChartCacheManager(sheet);
    }
    
    render(ctx, sheet, viewport, options) {
        const charts = this._chartManager.getAll();
        
        charts.forEach(chart => {
            const bounds = chart.getBounds();
            
            // 视口裁剪
            if (!viewport.intersects(bounds)) return;
            
            // 检查是否需要重绘（通过版本号判断）
            if (!this.#cacheManager.isDirty(chart.id)) {
                // 缓存命中：直接 drawImage
                const cachedCanvas = this._cache.get(chart.id);
                if (cachedCanvas) {
                    ctx.drawImage(cachedCanvas, bounds.x, bounds.y, bounds.w, bounds.h);
                    return;
                }
            }
            
            // 缓存未命中：重新提取数据并渲染
            const data = await dataExtractor.extract(chart, sheet);
            renderer.render(ctx, chart, data);
            
            // 更新缓存
            this._cache.update(chart.id, ...);
            
            // 标记为干净（关键！）
            this.#cacheManager.markClean(chart.id);
        });
    }
}
```

### **对比旧方案的优势**

| 维度 | 旧方案（分散式 _cacheVersion） | 新方案（ChartCacheManager） |
|------|-------------------------------|---------------------------|
| **版本号归属** | 每个ChartModel自己管理 | 集中在Manager中 |
| **递增责任** | 不清楚谁负责（混乱） | 明确：Manager统一负责 |
| **批量操作** | 100次paste → 100次递增 | 100次paste → 1次递增（flush合并） |
| **通知机制** | 需要手动调用markDirty() | 自动监听事件驱动 |
| **调试难度** | 高（分散在各处） | 低（集中在一个类） |
| **线程安全** | N/A | 天然安全（单线程） |

### **性能优化点**

```js
// 优化1：避免频繁创建Map（复用实例）
// ChartCacheManager 在ChartLayer生命周期内只创建一次

// 优化2：延迟检查（只在render时才检查isDirty）
// 而不是在每次数据变化时都遍历所有图表

// 优化3：选择性失效（未来可扩展）
// 目前是全局版本号，未来可改为细粒度的区域版本号
// 例如：只标记受影响的图表为脏，而非全部
```

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

**优先级**：120（⚠️ 必须高于所有现有策略）

**为什么必须是最高优先级？**

```
现有 Strategy 优先级对比（修改前 - 有严重问题）：
  ResizeStrategy      = 100  ← 调整列宽/行高
  SelectionStrategy   = 80   ← 单元格选中
  ChartSelectionStrategy = 60 ← ❌ 插在中间（危险！）
  MouseStrategy       = 50   ← 基础鼠标交互

修改后（正确设计）：
  ChartSelectionStrategy = 120 ← ✅ 最高优先级（图表交互）
  ResizeStrategy      = 100  
  SelectionStrategy   = 80   
  MouseStrategy       = 50   
```

**旧方案（priority=60）的致命问题**：

| 场景 | 问题描述 | 后果 |
|------|----------|------|
| 点击图表 resize 手柄 | ResizeStrategy(100) 先处理 | ❌ 无法调整图表大小 |
| 点击图表内部区域 | SelectionStrategy(80) 先处理 | ❌ 无法选中图表 |
| 拖拽图表边缘 | 被误判为列宽调整 | ❌ 图表无法移动 |

**新方案的设计原则**：
1. **图表命中检测优先**：如果鼠标在图表区域内，ChartSelectionStrategy 最先响应
2. **事件消费机制**：一旦图表策略处理了事件，返回 `true` 阻止后续策略执行
3. **向下兼容**：未命中图表时，自动降级给其他策略处理

```js
class ChartSelectionStrategy extends EventStrategy {
    priority = 120; // 必须最高
    
    canHandle(event) {
        // 快速判断是否在图表区域
        const hitResult = this._chartLayer?.hitTest(event.px, event.py);
        return hitResult?.type === 'CHART';
    }
    
    handleMouseDown(event) {
        if (!this.canHandle(event)) {
            return false; // 未命中图表，让给其他策略
        }
        
        // 命中图表，处理交互逻辑
        const chart = this._getHitChart(event.px, event.py);
        this._startInteraction(chart, event);
        
        return true; // ✅ 事件被消费，阻止 ResizeStrategy/SelectionStrategy 处理
    }
}
```

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
- 渲染时需要~~通过 `sheet.toPageRow()` 转换~~ (v2.0+ 直接使用统一坐标)
- 用户选择选区时，`sheet.selection.getRange()` 返回的是**页面行号**

**解决方案**：`dataRange` 和 `anchorRow` 统一存储**实际行号**，~~创建/渲染时的坐标转换已移除~~ (v2.0+ 统一坐标系)。

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

**问题描述**：
如果错误地强制跳过隐藏行列，会导致严重的UX问题：
- 用户隐藏行 → 图表突变（数据突然消失）
- 打印/导出时，图表与表格数据不一致
- 这是 **Excel 用户投诉 Top 3 问题之一**

**正确解决方案**（必须与Excel保持一致 ✅）：
- ✅ **默认不跳过**隐藏行列（`ignoreHiddenData: false`）
- ✅ 图表始终包含隐藏行列的数据（与Excel默认行为完全一致）
- ✅ 提供 `style.ignoreHiddenData = true` 配置项供用户手动启用
- ❌ **禁止在代码中硬编码为true或强制跳过**

**实现代码**：
```js
class NativeChartRenderer {
    #extractData(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style.ignoreHiddenData; // 默认 false
        
        const rowData = [];
        for (let row = startRow; row <= endRow; row++) {
            // 默认不跳过（shouldIgnoreHidden === false）
            if (shouldIgnoreHidden && sheet.rowColManager.isHiddenRow(row)) continue;
            
            const colData = [];
            for (let col = startCol; col <= endCol; col++) {
                // 默认不跳过（shouldIgnoreHidden === false）
                if (shouldIgnoreHidden && sheet.rowColManager.isHiddenCol(col)) continue;
                
                colData.push(sheet.getCell(row, col)?.value);
            }
            rowData.push(colData);
        }
        
        return { headers: rowData[0], data: rowData.slice(1) };
    }
}
```

**为什么这样设计？**
- Excel 的默认行为：图表包含隐藏数据（用户投诉少）
- 用户的真实需求：隐藏行通常是为了临时查看方便，而非排除数据
- 打印导出一致性：表格和图表数据保持同步

**配置项说明**：
```js
// ChartModel.style 默认值
{
    ignoreHiddenData: false,  // ⚠️ 必须默认为 false！
}

// 用户如果需要跳过隐藏数据：
chartPlugin.updateChartStyle(chartId, {
    ignoreHiddenData: true  // 手动启用（需要明确告知用户后果）
});
```

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

## 9. 文件结构（混合架构版 + Web Worker）

```
src/
├── model/chart/                      ← 数据模型层
│   ├── ChartModel.js                 # 图表数据模型
│   └── ChartManager.js               # 图表集合管理
│
├── render/chart/                     ← 渲染层（混合架构核心）
│   ├── IChartRenderer.js             # ⭐ 统一渲染器接口（抽象类）
│   ├── NativeChartRenderer.js        # ⭐ 自研渲染器（柱状图/折线图/饼图等）
│   ├── EChartsBridge.js              # ⭐ ECharts桥接器（雷达图/烛台图等）[Phase 5]
│   ├── ChartRendererFactory.js       # ⭐ 渲染器工厂（自动选择 Native 或 ECharts）
│   ├── DataExtractor.js              # ⭐⭐ Web Worker数据提取器（三层策略）
│   ├── ChartCacheManager.js          # ⭐⭐ 版本号管理器（解决伪安全问题）
│   ├── ChartCache.js                 # 图表离屏缓存（对两种渲染器透明）
│   └── echarts-adapter.js            # [Phase 5] ECharts Option 转换工具
│
├── render/layers/
│   └── ChartLayer.js                 # 图表图层（使用 IChartRenderer 接口）
│
├── plugins/
│   └── ChartPlugin.js                # 图表插件（统一 API 入口）
│
├── editor/strategies/
│   └── ChartSelectionStrategy.js     # 图表选中策略（统一交互逻辑，priority=120）
│
└── 需修改的文件：
    ├── render/RenderEngine.js         # 注册 ChartLayer + store + hitTest
    ├── workbook/Sheet.js              # 挂载 chartManager + #dispatchToSubSystems
    ├── constants/hitType.js           # 新增 CHART 类型
    ├── constants/hookNames.js         # 新增 AFTER_CHART_* 钩子
    └── constants/sheetEvents.js       # 新增 CHART_* 事件
    
[Phase 5 可选依赖]
├── node_modules/
│   └── echarts@5.x                   # ECharts 库（按需动态加载）
```

**📁 新增文件职责说明**：

| 文件 | 层次 | 职责 | 混合架构角色 | 引入阶段 |
|------|------|------|---------------|----------|
| `IChartRenderer.js` | 接口层 | 定义统一的渲染器抽象 | 🎯 **核心契约** | Phase 1 |
| `NativeChartRenderer.js` | 实现层 | Canvas 2D 绘制简单图表 | 🔧 **自研部分（80%场景）** | Phase 2 |
| `EChartsBridge.js` | 实现层 | 封装 ECharts 用于复杂图表 | 🔌 **扩展部分（20%场景）** | Phase 5 |
| `ChartRendererFactory.js` | 工厂层 | 根据图表类型选择渲染器 | 🏭 **调度中心** | Phase 2 |
| **`DataExtractor.js`** | **数据层** | **Web Worker数据提取（三层策略）** | **⚡ 性能优化核心** | **Phase 2** |
| **`ChartCacheManager.js`** | **缓存管理层** | **集中式版本号管理** | **🛡️ 一致性保障** | **Phase 1** |
| `ChartCache.js` | 缓存层 | 离屏 Canvas 缓存管理 | 💾 **共享组件** | Phase 1 |
| `ChartLayer.js` | 图层层 | 协调渲染和交互 | 🎨 **统一入口** | Phase 1 |

**⭐⭐ 关键新增组件说明**：

### DataExtractor.js — Web Worker 数据提取器
- **解决的问题**：大数据量时同步遍历导致主线程卡顿（50-200ms）
- **技术方案**：三层策略自动切换
  - Layer 1 (<500单元格)：主线程同步（<5ms）
  - Layer 2 (500-5000)：异步分帧提取（<16ms阻塞）
  - Layer 3 (>5000)：Web Worker后台处理（0ms阻塞）
- **性能提升**：极端场景（A1:Z1000, 26000单元格）从200ms降至0ms主线程阻塞

### ChartCacheManager.js — 版本号管理器
- **解决的问题**：_cacheVersion 分散管理导致"伪安全"
- **技术方案**：集中式全局版本号 + flush 合并机制
- **核心优势**：
  - 批量操作原子性（100次paste只触发1次重绘）
  - 事件驱动自动感知变化（无需手动markDirty）
  - 单一职责，易于调试和维护

**📁 文件职责说明**：

| 文件 | 层次 | 职责 | 混合架构角色 |
|------|------|------|---------------|
| `IChartRenderer.js` | 接口层 | 定义统一的渲染器抽象 | 🎯 **核心契约** |
| `NativeChartRenderer.js` | 实现层 | Canvas 2D 绘制简单图表 | 🔧 **自研部分（80%场景）** |
| `EChartsBridge.js` | 实现层 | 封装 ECharts 用于复杂图表 | 🔌 **扩展部分（20%场景）** |
| `ChartRendererFactory.js` | 工厂层 | 根据图表类型选择渲染器 | 🏭 **调度中心** |
| `ChartCache.js` | 缓存层 | 离屏 Canvas 缓存管理 | 💾 **共享组件** |
| `ChartLayer.js` | 图层层 | 协调渲染和交互 | 🎨 **统一入口** |

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

## 12. 渐进式实现路线（混合架构版 + Web Worker）⭐

> **详细技术选型理由和架构设计见 [1.4 技术选型：混合架构](#14-技术选型混合架构hybrid-architecture)**

### 📅 完整实施时间线

| 阶段 | 内容 | 关键组件 | 工作量 | 依赖 | 交付物 |
|------|------|----------|--------|------|--------|
| **Phase 1** | 基础架构搭建 | ChartCacheManager | 3天 | 无 | ChartModel/Manager/Layer/Cache/CacheManager 骨架 |
| **Phase 2** | ⭐ 核心图表开发 + Web Worker | NativeRenderer + DataExtractor | 5天 | P1 | 柱状图 + 折线图 + 饼图 + 三层数据提取策略 |
| **Phase 3** | API集成+交互 | - | 3天 | P2 | ChartPlugin + hitTest + 基础交互 (priority=120) |
| **Phase 4** | 图表扩展+优化 | NativeRenderer | 3天 | P3 | 面积图 + 散点图 + 数据联动 |
| **Phase 5** | 🔌 引入 ECharts Bridge | EChartsBridge | 3天 | P4 | 雷达图 + 烛台图 + 工厂模式 |
| **Phase 6** | 性能优化+完善 | Mixed | 3天 | P5 | Undo/Redo + 极限优化 + 测试 |
| **Phase 7** | 文档+发布准备 | - | 2天 | P6 | 用户文档 + API文档 + 发布说明 |

**总计约 22 个工作日**（~1个月）可完成一个功能完备的**混合架构图表引擎 + Web Worker 性能优化**。

> **相比原计划增加1天**：用于 DataExtractor.js 和 Web Worker 的开发和测试

### 🎯 各阶段详细说明

#### **Phase 1：基础架构搭建（第1周，3天）**
```
目标：建立完整的数据模型和图层框架

✅ 任务清单：
  □ 实现 ChartModel 数据模型（含 ignoreHiddenData 配置，默认false）
  □ 实现 ChartManager CRUD + 行列变更同步
  □ 实现 ChartLayer extends BaseLayer（含5个监听源，见第4.1节）
  □ 实现 ChartCache 双缓存机制
  ⭐□ **实现 ChartCacheManager**（集中式版本号管理，解决伪安全问题）
  □ 解决坑4：冻结区域监听补全（column-resized/row-resized/frozen-boundary-changed）
  
📊 验收标准：
  ✅ 可以创建/删除/更新图表对象
  ✅ 图表可以在 Canvas 上渲染（即使是空白的）
  ✅ 缓存机制工作正常（invalidate/markClean）
  ✅ **ChartCacheManager 版本号机制工作正常（单元测试覆盖批量操作场景）**
  ✅ 冻结区域内图表位置变化时正确刷新
  
📁 新增文件：
  - src/model/chart/ChartModel.js
  - src/model/chart/ChartManager.js
  - src/render/layers/ChartLayer.js
  - src/render/chart/ChartCache.js
  - **src/render/chart/ChartCacheManager.js** ⭐⭐ （新增！）
  - src/render/chart/IChartRenderer.js (接口定义)
```

#### **Phase 2：核心图表开发 + Web Worker（第2-3周，5天）⭐⭐ 自研渲染器 + 性能优化**
```
目标：实现最高频使用的3种基础图表 + Web Worker数据提取器

✅ 任务清单：
  □ 实现 NativeChartRenderer 类（实现 IChartRenderer 接口）
  □ 实现柱状图绘制 (#renderBar)
  □ 实现折线图绘制 (#renderLine)
  □ 实现饼图绘制 (#renderPie)
  ⭐⭐□ **实现 DataExtractor**（Web Worker 三层数据提取策略）
    - Layer 1: <500单元格 → 同步提取
    - Layer 2: 500-5000 → 异步分帧提取
    - Layer 3: >5000 → Web Worker 后台提取
  □ 解决坑1：大数据量首帧卡顿问题（A1:Z1000 < 120ms）
  □ 解决坑7：隐藏行列默认行为修正（ignoreHiddenData=false）
  
📊 验收标准：
  ✅ 3种基础图表正确显示数据
  ✅ A1:Z1000 大数据量首屏 < 120ms（主线程阻塞 <16ms）
  ✅ 滚动性能 < 2ms/帧（双缓存生效）
  ✅ 默认包含隐藏行列数据（与Excel一致）
  ✅ **Web Worker 提取正常工作（可通过控制台日志验证策略选择）**
  
📁 新增文件：
  - src/render/chart/NativeChartRenderer.js
  - **src/render/chart/DataExtractor.js** ⭐⭐ （新增！包含内联Worker代码）
  - src/render/chart/ChartRendererFactory.js (基础版)
```

#### **Phase 3：API集成与交互（第3周前半，3天）**
```
目标：提供完整的用户交互能力

✅ 任务清单：
  □ 实现 ChartPlugin 插件（统一 API 入口）
  □ 扩展 HIT_TYPE.CHART 类型
  □ 扩展 HOOKS（AFTER_CHART_ADD/REMOVE/UPDATE）
  □ 扩展 SHEET_EVENTS（CHART_ADDED/REMOVED/UPDATED）
  □ 解决坑3：ChartSelectionStrategy priority=120
  □ 解决坑4：冻结偏移监听补全
  □ 实现基础交互：点击选中 + Delete 删除
  
📊 验收标准：
  ✅ 可以通过 API 创建/编辑/删除图表
  ✅ 点击图表可以选中（边框+手柄）
  ✅ 按 Delete 可以删除选中图表
  ✅ 图表不与 ResizeStrategy/SelectionStrategy 冲突
  
📁 新增/修改文件：
  - src/plugins/ChartPlugin.js (新增)
  - src/editor/strategies/ChartSelectionStrategy.js (新增)
  - src/constants/hitType.js (修改)
  - src/constants/hookNames.js (修改)
  - src/constants/sheetEvents.js (修改)
```

#### **Phase 4：图表扩展与数据联动（第3周后半+第4周前半，3天）**
```
目标：完善基础图表并实现数据自动刷新

✅ 任务清单：
  □ 实现面积图绘制 (#renderArea)
  □ 实现散点图绘制 (#renderScatter)
  □ 实现图例渲染 (#renderLegend)
  □ 实现数据联动：单元格变化 → 自动刷新图表
  □ 实现拖拽移动图表功能
  □ 实现拖拽缩放图表功能（8个控制手柄）
  □ 解决坑6：多 Sheet 切换生命周期管理
  
📊 验收标准：
  ✅ 5种基础图表全部可用
  ✅ 修改单元格数据后图表自动更新（<100ms延迟）
  ✅ 可以拖拽移动和缩放图表
  ✅ 多 Sheet 切换无内存泄漏
  ✅ 冻结区域内图表行为正确
  
📁 修改文件：
  - src/render/chart/NativeChartRenderer.js (扩展)
  - src/render/layers/ChartLayer.js (增强)
  - src/plugins/ChartPlugin.js (扩展 API)
```

#### **Phase 5：引入 ECharts Bridge（第4周后半+第5周，3天）🔌 关键里程碑**
```
目标：支持复杂图表类型（差异化竞争力）

⚠️ 本阶段是可选的，取决于业务需求和 Phase 1-4 的效果评估

✅ 任务清单：
  □ 实现 EChartsBridge 类（实现 IChartRenderer 接口）
  □ 实现 ECharts 动态加载（按需引入，减少包体积）
  □ 实现 Option 转换工具（ChartModel → echarts option）
  □ 支持雷达图 (radar)
  □ 支持烛台图 (candlestick) [金融场景]
  □ 支持漏斗图 (funnel)
  □ 更新 ChartRendererFactory 支持动态切换
  □ 实现离屏 Canvas 集成（融入现有双缓存）
  □ 性能测试与内存泄漏检测
  
📊 验收标准：
  ✅ 至少3种 ECharts 图表可用且稳定
  ✅ 与自研图表切换对用户透明
  ✅ 混合渲染性能 < 3ms/帧（无明显退化）
  ✅ 内存占用 < 10MB（10个图表场景）
  ✅ 无内存泄漏（Chrome DevTools Heap Snapshot 验证）
  
📁 新增文件：
  - src/render/chart/EChartsBridge.js
  - src/render/chart/echarts-adapter.js
  - package.json (添加 echarts 可选依赖)
  
🔄 决策点（在 Phase 4 结束时评估）：
  
  如果满足以下条件，可以推迟或取消 Phase 5：
    ✓ 用户对5种基础图表满意度 > 4.0/5.0
    ✓ 业务方暂不需要复杂图表类型
    ✓ 团队资源紧张或预算有限
    ✓ 希望保持轻量级（<50KB 包体积）
    
  如果出现以下情况，必须执行 Phase 5：
    ✗ 用户强烈要求雷达图/烛台图等复杂图表
    ✗ 竞品已支持这些图表类型
    ✗ 有明确的金融/数据分析客户需求
```

#### **Phase 6：性能极限优化与完善（第5-6周，3天）**
```
目标：达到生产级别的性能和稳定性

✅ 任务清单：
  □ 实现 Undo/Redo 支持（AddChartCommand/RemoveChartCommand 等）
  □ 实现序列化/反序列化（JSON 导入导出）
  □ 性能极限优化：
    - Web Worker 数据提取（大数据量 >10,000 单元格）
    - 智能预加载（预测用户可能操作的图表）
    - GPU 加速路径探索（WebGL backend，可选）
  □ 完善错误处理和边界情况
  □ 全面的测试覆盖率（>85%）
  □ 性能基准测试和回归测试
  
📊 验收标准：
  ✅ 所有操作都支持 Undo/Redo
  ✅ 图表可以导出为 JSON 并重新导入
  ✅ A1:Z10000 超大数据量首屏 < 200ms
  ✅ 代码覆盖率 > 85%
  ✅ 性能回归测试全部通过
  
📁 修改文件：
  - src/model/command/AddChartCommand.js (新增)
  - src/model/command/RemoveChartCommand.js (新增)
  - src/model/command/UpdateChartStyleCommand.js (新增)
  - tests/ (大量新增测试用例)
```

#### **Phase 7：文档与发布准备（第6周，2天）**
```
目标：为正式发布做好准备

✅ 任务清单：
  □ 编写用户使用文档（Markdown）
  □ 编写 API 参考文档（JSDoc + 示例代码）
  □ 编写迁移指南（从旧版本升级）
  □ 准备示例 Demo（展示所有图表类型）
  □ 性能报告和基准测试结果
  □ 已知问题列表和限制说明
  □ 发版说明（Changelog）
  
📊 交付物：
  ✅ docs/chart-engine-user-guide.md
  ✅ docs/chart-engine-api-reference.md
  ✅ examples/chart-demo.html
  ✅ PERFORMANCE_REPORT.md
  ✅ CHANGELOG.md
```

### 📈 资源需求预估

| 角色 | Phase 1-4 | Phase 5-7 | 总计 |
|------|----------|-----------|------|
| **前端工程师（Canvas专家）** | 1人全职 | 1人全职 | **13天** |
| **测试工程师** | 0.5人兼职 | 0.5人全职 | **4天** |
| **产品经理** | 0.2人兼职 | 0.2人兼职 | **1.6天** |
| **技术文档撰写** | 0人 | 0.5人兼职 | **1天** |
| **总人天** | **11.7天** | **9.2天** | **~21天** |

### ⚠️ 关键风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| **自研图表质量不达标** | 中 | 高 | 提前启动 Phase 5（引入ECharts） |
| **ECharts 集成困难** | 低 | 中 | 保持纯自研方案（砍掉Phase 5） |
| **性能不达标** | 低 | 高 | 增加Phase 6优化时间或简化功能 |
| **需求变更频繁** | 高 | 中 | 采用敏捷迭代，每Phase结束验收 |
| **团队人员流动** | 低 | 高 | 充分的代码注释和文档 |

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

## 14. 未来扩展（混合架构演进路线）

> **基于混合架构（Hybrid Architecture）的扩展规划，明确每个功能的实现路径。**

### 14.1 短期增强（v1.1）— 自研渲染器扩展 ⭐

这些功能通过扩展现有的 `NativeChartRenderer` 实现，保持轻量级和高性能。

| 功能 | 实现方式 | 工作量 | 优先级 |
|------|----------|--------|--------|
| **堆叠柱状图/折线图** | NativeRenderer 新增 `style.stacked = true` | 0.5天 | P0 |
| **环形图** | 饼图变体，`#renderDonut` (内圆镂空) | 0.5天 | P1 |
| **数据标签** | `style.showDataLabels = true` + 文本绘制优化 | 1天 | P1 |
| **图表主题系统** | 预设深色/浅色/彩色主题配置 | 1天 | P2 |
| **百分比坐标轴** | Y轴显示百分比而非绝对值 | 0.5天 | P2 |
| **多系列颜色自动分配** | 超过6个系列时自动生成配色方案 | 0.5天 | P3 |

**技术要点**：
```js
// 所有短期扩展都在 NativeChartRenderer 内部实现
// 不引入新依赖，包体积增长 < 10KB
class NativeChartRenderer extends IChartRenderer {
    #renderBar(ctx, data, plotArea, style) {
        if (style.stacked) {
            this.#renderStackedBar(ctx, data, plotArea, style);
        } else {
            this.#renderGroupedBar(ctx, data, plotArea, style); // 现有逻辑
        }
    }
}
```

---

### 14.2 中期体验提升（v1.5）— 混合增强 🔌

部分功能需要 DOM 交互或复杂计算，可考虑结合 ECharts 或自定义 UI 组件。

| 功能 | 实现方式 | 渲染器 | 工作量 | 优先级 |
|------|----------|--------|--------|--------|
| **图表编辑器面板** | DOM 浮层 + React/Vue 组件 | - | 5天 | P0 |
| **Tooltip 增强** | 自定义浮层（支持富文本/图片） | - | 2天 | P1 |
| **数据范围高亮** | OverlayLayer 集成（选中图表时高亮源数据） | - | 2天 | P1 |
| **图表动画** | requestAnimationFrame + 缓动函数 | Native | 3天 | P2 |
| **组合图（柱状+折线）** | NativeRenderer 扩展双Y轴支持 | Native | 4天 | P2 |
| **次坐标轴** | 双Y轴绘制 + 数据归一化 | Native | 3天 | P2 |

**关键技术决策点**：
```
Q: 图表编辑器面板是否使用 ECharts 的可视化编辑器？
A: ❌ 不推荐。原因：
   1. 你的项目是纯 Canvas 架构，DOM 编辑器会增加复杂度
   2. 编辑器的交互逻辑与你的 ChartSelectionStrategy 冲突
   3. 建议自研轻量级面板（或使用成熟的第三方库如 react-json-editor）
   
Q: Tooltip 是否直接复用 ECharts 的 tooltip？
A: ⚠️ 可以考虑，但需要适配：
   1. ECharts tooltip 依赖 DOM 定位
   2. 需要手动同步到你的 Canvas 坐标系
   3. 如果追求极致性能，建议自研 Canvas tooltip
```

---

### 14.3 长期企业级特性（v2.0）— 生态扩展 🚀

这些功能通常需要强大的生态支持，建议根据实际需求选择性引入 ECharts 或其他专业库。

#### **14.3.1 图表类型大扩展（ECharts 生态）🔌**

如果 Phase 5 已引入 ECharts Bridge，可以快速支持以下图表类型：

| 图表类别 | 具体类型 | 适用场景 | 复杂度 |
|----------|----------|----------|--------|
| **金融图表** | 烛台图(K线) / OHLC图 | 股票/期货/加密货币分析 | 中 |
| **数据关系图** | 树图 / 旭日图 / 矩形树图 | 层级数据展示 | 中 |
| **地理图表** | 地图 / 散点地图 / 热力地图 | 地理位置数据分析 | 高 |
| **特殊图表** | 漏斗图 / 仪表盘 / 词云 | 营销/监控/文本分析 | 低~中 |
| **3D 图表** | 3D柱状图 / 3D散点 / 3D曲面 | 科学可视化/游戏 | 极高（WebGL） |

**实施策略**：
```js
// 在 EChartsBridge 中注册新的类型映射
static ECHARTS_TYPE_MAP = {
    // 已有（Phase 5 实现）
    'radar': 'radar',
    'candlestick': 'candlestick',
    'funnel': 'funnel',
    
    // v2.0 新增
    'treemap': 'treemap',
    'sunburst': 'sunburst',
    'gauge': 'gauge',
    'heatmap': 'heatmap',
    'wordcloud': 'wordcloud', // 需要 echarts-wordcloud 插件
    'map': 'map',             // 需要地理数据文件
    'graph': 'graph',         // 关系图
    'sankey': 'sankey',       # 桑基图
};
```

#### **14.3.2 企业级功能（跨渲染器通用）💼**

这些功能不依赖具体的渲染器实现，属于平台级能力：

| 功能 | 说明 | 工作量 | 优先级 |
|------|------|--------|--------|
| **图表导出** | 导出为 PNG/SVG/PDF（利用离屏Canvas的 toDataURL） | 3天 | P0 |
| **图表模板系统** | 保存/加载/分享图表样式模板（JSON序列化） | 2天 | P0 |
| **打印优化** | 高DPI导出 + 分页支持 + 页眉页脚 | 3天 | P1 |
| **无障碍访问(a11y)** | 键盘导航 + 屏幕阅读器支持 + ARIA 标签 | 5天 | P2 |
| **多语言(i18n)** | 图表标题/图例/tooltip 多语言切换 | 2天 | P2 |
| **协作编辑** | 多人实时编辑同一图表（WebSocket + OT算法） | 10天+ | P3 |

**图表导出技术方案**：
```js
// 统一导出接口（对 Native 和 ECharts 都适用）
class ChartExporter {
    static exportToPNG(chartId, options = {}) {
        const { scale = 2, quality = 1.0 } = options;
        const cachedCanvas = chartCache.get(chartId);
        
        if (!cachedCanvas) throw new Error('图表未渲染');
        
        // 使用高分辨率导出
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = cachedCanvas.width * scale;
        exportCanvas.height = cachedCanvas.height * scale;
        
        const ctx = exportCanvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(cachedCanvas, 0, 0);
        
        return exportCanvas.toDataURL('image/png', quality);
    }
    
    static exportToSVG(chartId) {
        // SVG 导出需要记录绘制命令（命令模式重构）
        // 或使用 ECharts 内置的 SVG renderer
        // TODO: v2.1 实现
        throw new Error('SVG 导出将在 v2.1 支持');
    }
}
```

#### **14.3.3 性能极限优化（可选）⚡**

针对超大数据量场景（100万+单元格）的性能优化方向：

| 优化方向 | 技术 | 性能提升 | 实现难度 |
|----------|------|----------|----------|
| **Web Worker 数据提取** | 将 extractData 移至 Worker 线程 | 主线程阻塞 ↓90% | 中 |
| **GPU 加速渲染** | WebGL backend (luma.gl) | 渲染速度 ↑5-10x | 极高 |
| **增量渲染** | 只重绘变化的数据区域 | 重绘开销 ↓80% | 高 |
| **智能预加载** | 预测用户操作，提前渲染 | 用户感知延迟 ↓50% | 中 |
| **LOD (Level of Detail)** | 远距离时简化图表细节 | 渲染开销 ↓60% | 高 |
| **WASM 加速** | 数据计算用 Rust/C++ 编译为 WASM | 计算速度 ↑2-5x | 极高 |

**建议**：除非有明确的性能瓶颈（用户反馈卡顿），否则不要过早优化。优先保证代码可维护性。

---

### 14.4 技术债务与重构路线 🔄

随着项目发展，可能需要进行以下重构：

| 时间点 | 触发条件 | 重构内容 | 影响 |
|--------|----------|----------|------|
| **v1.5** | ECharts 版本升级到 6.x | API 变更适配 + 性能回归测试 | 中 |
| **v2.0** | 图表类型 >20 种 | 考虑插件化架构（类似 VS Code 扩展） | 大 |
| **v2.5** | 需求 3D 图表 | 引入 Three.js / Babylon.js | 极大 |
| **v3.0** | 跨平台需求（Node.js/React Native） | 渲染层抽象为 Platform Agnostic Layer | 极大 |

**架构演进原则**：
```
✅ 保持向后兼容（不破坏现有 API）
✅ 渐进式迁移（新旧方案并存一段时间）
✅ 充分的测试覆盖（重构前确保测试通过）
✅ 文档及时更新（反映最新的架构决策）
❌ 避免大爆炸式重写（Big Bang Rewrite）
❌ 避免过度设计（YAGNI 原则）
```