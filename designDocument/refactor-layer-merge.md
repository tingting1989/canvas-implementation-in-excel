# 图层合并重构设计文档

## 1. 背景

### 1.1 当前架构

```
RenderEngine
  └── LayerCompositor
        ├── TileLayer        (z=10)  ← 离屏 canvas + 瓦片缓存
        ├── OverlayLayer     (z=20)  ← 离屏 canvas
        ├── FrozenLayer      (z=30)  ← 离屏 canvas + 独立瓦片缓存
        ├── ResizeLayer      (z=40)  ← 离屏 canvas
        ├── HeaderLayer      (z=50)  ← 离屏 canvas
        ├── DragIndicatorLayer (z=60) ← 离屏 canvas
        ├── UILayer          (z=70)  ← 离屏 canvas
        └── EditorLayer      (z=80)  ← 离屏 canvas
```

8 个图层，每个拥有独立离屏 canvas，由 LayerCompositor 按 z-index 顺序合成到主画布。

### 1.2 问题

| 问题 | 数据 |
|------|------|
| 缓存命中率极低 | 7/8 图层每次滚动都变脏，离屏 canvas 缓存几乎无效 |
| 内存浪费 | 8 个全视口离屏 canvas，1200×800 DPR=2 时约 122MB |
| 合成开销 | 每帧 8 次 `drawImage` 比直接绘制多一次内存拷贝 |
| 轻量图层过多 | ResizeLayer/EditorLayer/UILayer 各只有 1~2 条线的绘制量 |

### 1.3 各图层渲染复杂度

| 图层 | 渲染操作数 | 复杂度 | 离屏 canvas 价值 |
|------|-----------|--------|-----------------|
| TileLayer | 数百~数千 | 重 | **高** — 瓦片缓存核心依赖 |
| FrozenLayer | 数百~数千 | 重 | **高** — 独立瓦片缓存 |
| HeaderLayer | 数十~数百 | 中 | 低 — 每帧都变脏 |
| OverlayLayer | ~10 | 轻 | 无 — 每帧都变脏 |
| DragIndicatorLayer | 1~2 矩形 | 轻 | 无 — 每帧都变脏 |
| ResizeLayer | 1 条线 | 极轻 | 无 — 每帧都变脏 |
| UILayer | 1~2 条线 | 极轻 | 低 — 很少变脏 |
| EditorLayer | 1 个矩形 | 极轻 | 无 — 每帧都变脏 |

---

## 2. 重构目标

- **图层数**：8 → 5
- **离屏 canvas 数**：8 → 2（仅 TileLayer、FrozenLayer 保留）
- **内存占用**：~122MB → ~30MB
- **每帧 drawImage 次数**：8 → 2
- **消除向后兼容负担**：直接修改所有引用点，不保留代理层

---

## 3. 合并方案

### 3.1 合并映射

| 原图层 | 合并到 | 新 z-index |
|--------|--------|-----------|
| TileLayer | **TileLayer**（不变） | 10 |
| OverlayLayer | **SelectionLayer** | 20 |
| DragIndicatorLayer | **SelectionLayer** | 20 |
| FrozenLayer | **FrozenLayer**（不变） | 30 |
| ResizeLayer | **InteractionLayer** | 40 |
| UILayer | **InteractionLayer** | 40 |
| EditorLayer | **InteractionLayer** | 40 |
| HeaderLayer | **HeaderLayer**（不变） | 50 |

### 3.2 重构后架构

```
RenderEngine
  └── LayerCompositor
        ├── TileLayer        (z=10)  ← 离屏 canvas + 瓦片缓存
        ├── SelectionLayer   (z=20)  ← 直接渲染
        ├── FrozenLayer      (z=30)  ← 离屏 canvas + 独立瓦片缓存
        ├── InteractionLayer (z=40)  ← 直接渲染
        └── HeaderLayer      (z=50)  ← 直接渲染
```

### 3.3 渲染流程

```
每帧 compose()：
1. TileLayer.dirty?
     是 → 重绘到离屏 canvas → mainCtx.drawImage(tileLayer.canvas)
     否 → mainCtx.drawImage(tileLayer.canvas)  // 缓存命中

2. SelectionLayer → 直接在 mainCtx 上绘制选区+拖拽指示器

3. FrozenLayer.dirty?
     是 → 重绘到离屏 canvas → mainCtx.drawImage(frozenLayer.canvas)
     否 → mainCtx.drawImage(frozenLayer.canvas)  // 缓存命中

4. InteractionLayer → 直接在 mainCtx 上绘制冻结线+调整线+编辑框

5. HeaderLayer → 直接在 mainCtx 上绘制表头
```

---

## 4. 新图层详细设计

### 4.1 SelectionLayer

**合并**：OverlayLayer + DragIndicatorLayer

**职责**：渲染所有选区相关的视觉效果

**渲染顺序**（自底向上）：
1. 选区范围高亮（浅蓝背景）
2. 行列头高亮
3. 活动单元格高亮
4. 合并单元格边框
5. 选区边框
6. 填充手柄
7. 拖拽幽灵 + 插入指示线（DragIndicator）

**监听状态**：`selection`, `scroll`, `frozen`, `frozenOffset`

**文件**：`src/render/layers/SelectionLayer.js`

```javascript
export class SelectionLayer extends BaseLayer {
    constructor() {
        super("selection", LAYER_Z_INDEX.SELECTION);
        this.overlayRenderer = new OverlayRenderer();
        this.#columnMoveState = null;
        this.#rowMoveState = null;
    }

    render(ctx, sheet, viewport, options = {}) {
        // 1. clip 到非冻结区域
        // 2. overlayRenderer.renderMerges()
        // 3. overlayRenderer.renderSelection()
        // 4. restore clip
        // 5. 渲染拖拽指示器（如果有）
    }

    // DragIndicatorLayer 的 API 迁移
    setColumnMoveState(state) { ... }
    setRowMoveState(state) { ... }
    hasColumnMove() { ... }
    hasRowMove() { ... }
    isColumnSource(col) { ... }
    isRowSource(row) { ... }
}
```

**冻结区域裁剪**：从 OverlayLayer 迁移的 clip 逻辑，限制选区渲染到非冻结区域。

### 4.2 InteractionLayer

**合并**：ResizeLayer + UILayer + EditorLayer

**职责**：渲染所有临时交互反馈和 UI 装饰元素

**渲染顺序**（自底向上）：
1. 冻结分割线（UILayer 的冻结线）
2. 调整大小指示线（ResizeLayer 的虚线）
3. 编辑框（EditorLayer 的矩形）
4. 调试信息（UILayer 的 debugMode）

**监听状态**：`scroll`, `frozenOffset`, `frozen`, `editor`, `selection`

**文件**：`src/render/layers/InteractionLayer.js`

```javascript
export class InteractionLayer extends BaseLayer {
    constructor() {
        super("interaction", LAYER_Z_INDEX.INTERACTION);
        this.#resizeLine = null;
        this.debugMode = false;
    }

    render(ctx, sheet, viewport, options = {}) {
        // 1. 冻结分割线
        // 2. 调整大小指示线
        // 3. 编辑框
        // 4. 调试信息
    }

    // ResizeLayer 的 API 迁移
    setResizeLine(type, index, position) { ... }
    clearResizeLine() { ... }
    getResizeLine() { ... }
}
```

---

## 5. 离屏 Canvas 策略变更

### 5.1 当前策略

所有图层统一使用离屏 canvas：

```
BaseLayer.initCanvas() → 创建离屏 canvas
LayerCompositor.compose() → layer.render(layer.ctx) → mainCtx.drawImage(layer.canvas)
```

### 5.2 新策略

仅 TileLayer 和 FrozenLayer 使用离屏 canvas（瓦片缓存依赖），其余图层直接渲染到主 canvas。

**BaseLayer 新增属性**：

```javascript
class BaseLayer {
    constructor(name, zIndex, options = {}) {
        // ...
        this.offscreen = options.offscreen ?? true;  // 是否使用离屏 canvas
    }
}
```

**LayerCompositor.compose() 变更**：

```javascript
compose(mainCtx, sheet, viewport, viewW, viewH, options = {}) {
    for (const layer of sortedLayers) {
        if (layer.offscreen) {
            // 离屏模式：渲染到离屏 canvas，再 drawImage 合成
            layer.initCanvas(viewW, viewH);
            if (layer.dirty) {
                layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                layer.ctx.clearRect(0, 0, viewW, viewH);
                layer.render(layer.ctx, sheet, viewport, renderOptions);
                layer.clearDirty();
            }
            mainCtx.drawImage(layer.canvas, 0, 0, ...);
        } else {
            // 直接模式：渲染到主 canvas
            if (layer.dirty) {
                mainCtx.save();
                layer.render(mainCtx, sheet, viewport, renderOptions);
                mainCtx.restore();
                layer.clearDirty();
            }
        }
    }
}
```

**各图层 offscreen 配置**：

| 图层 | offscreen | 原因 |
|------|-----------|------|
| TileLayer | `true` | 瓦片缓存依赖离屏 canvas |
| SelectionLayer | `false` | 轻量渲染，无缓存收益 |
| FrozenLayer | `true` | 独立瓦片缓存依赖离屏 canvas |
| InteractionLayer | `false` | 极轻量渲染，无缓存收益 |
| HeaderLayer | `false` | 每帧变脏，无缓存收益 |

---

## 6. Z-Index 常量变更

### 6.1 修改文件

`src/constants/layerZIndex.js`

### 6.2 变更

```javascript
// 删除
OVERLAY: 20,
RESIZE: 40,
DRAG_INDICATOR: 60,
UI: 70,
EDITOR: 80,

// 新增
SELECTION: 20,       // 合并 Overlay + DragIndicator
INTERACTION: 40,     // 合并 Resize + UI + Editor

// 保留
TILE: 10,
FROZEN: 30,
HEADER: 50,
```

---

## 7. RenderEngine 变更

### 7.1 修改文件

`src/render/RenderEngine.js`

### 7.2 图层初始化

```javascript
// 删除
this.overlayLayer = new OverlayLayer();
this.resizeLayer = new ResizeLayer();
this.dragIndicatorLayer = new DragIndicatorLayer();
this.uiLayer = new UILayer();
this.editorLayer = new EditorLayer();

// 新增
this.selectionLayer = new SelectionLayer();
this.interactionLayer = new InteractionLayer();
```

### 7.3 注册顺序

```javascript
this.compositor.register(this.tileLayer);
this.compositor.register(this.selectionLayer);
this.compositor.register(this.frozenLayer);
this.compositor.register(this.interactionLayer);
this.compositor.register(this.headerLayer);
```

### 7.4 外部 API 变更

```javascript
// 删除
get overlayRenderer()              → return this.overlayLayer.overlayRenderer;
setResizeLine(type, index, pos)    → this.resizeLayer.setResizeLine(...)
clearResizeLine()                  → this.resizeLayer.clearResizeLine()

// 新增
get selectionLayer()              → 选区图层引用
get interactionLayer()            → 交互图层引用

// 保留（内部转发到新图层）
setResizeLine(type, index, pos)   → this.interactionLayer.setResizeLine(...)
clearResizeLine()                 → this.interactionLayer.clearResizeLine()
```

### 7.5 invalidateAll 变更

```javascript
invalidateAll() {
    this.tileLayer.markAllDirty();
    this.frozenLayer.markAllDirty();
    this.selectionLayer.markDirty();
    this.interactionLayer.markDirty();
    this.headerLayer.markDirty();
    this.requestRender();
}
```

### 7.6 HeaderLayer 拖拽指示器

```javascript
// 修改前
this.headerLayer.setDragIndicator(this.dragIndicatorLayer);

// 修改后
this.headerLayer.setDragIndicator(this.selectionLayer);
```

---

## 8. 外部引用变更

### 8.1 ColumnMoveStrategy / RowMoveStrategy

```javascript
// 修改前
this.handler.renderEngine.dragIndicatorLayer.setColumnMoveState(...)
this.handler.renderEngine.dragIndicatorLayer.setRowMoveState(...)

// 修改后
this.handler.renderEngine.selectionLayer.setColumnMoveState(...)
this.handler.renderEngine.selectionLayer.setRowMoveState(...)
```

### 8.2 RenderEngineViewportService

无需变更。`setResizeLine` / `clearResizeLine` 仍通过 `this.#renderEngine` 调用，RenderEngine 内部转发到 InteractionLayer。

---

## 9. 删除的文件

| 文件 | 原因 |
|------|------|
| `src/render/layers/OverlayLayer.js` | 合并到 SelectionLayer |
| `src/render/layers/ResizeLayer.js` | 合并到 InteractionLayer |
| `src/render/layers/UILayer.js` | 合并到 InteractionLayer |
| `src/render/layers/EditorLayer.js` | 合并到 InteractionLayer |
| `src/render/layers/DragIndicatorLayer.js` | 合并到 SelectionLayer |
| `tests/render/layers/OverlayLayer.test.js` | 重写为 SelectionLayer 测试 |
| `tests/render/layers/ResizeLayer.test.js` | 重写为 InteractionLayer 测试 |
| `tests/render/layers/UILayer.test.js` | 重写为 InteractionLayer 测试 |
| `tests/render/layers/EditorLayer.test.js` | 重写为 InteractionLayer 测试 |
| `tests/render/layers/DragIndicatorLayer.test.js` | 重写为 SelectionLayer 测试 |

---

## 10. 新增的文件

| 文件 | 说明 |
|------|------|
| `src/render/layers/SelectionLayer.js` | 选区+拖拽指示器图层 |
| `src/render/layers/InteractionLayer.js` | 冻结线+调整线+编辑框+调试信息图层 |
| `tests/render/layers/SelectionLayer.test.js` | SelectionLayer 测试 |
| `tests/render/layers/InteractionLayer.test.js` | InteractionLayer 测试 |

---

## 11. 修改的文件清单

| 文件 | 变更内容 |
|------|---------|
| `src/constants/layerZIndex.js` | 删除 5 个常量，新增 2 个常量 |
| `src/render/BaseLayer.js` | 新增 `offscreen` 属性，`initCanvas` 仅 offscreen=true 时执行 |
| `src/render/LayerCompositor.js` | `compose()` 区分离屏/直接渲染模式 |
| `src/render/RenderEngine.js` | 替换图层实例化和注册，更新 API |
| `src/render/layers/TileLayer.js` | 构造函数传入 `offscreen: true` |
| `src/render/layers/FrozenLayer.js` | 构造函数传入 `offscreen: true` |
| `src/render/layers/HeaderLayer.js` | 构造函数传入 `offscreen: false`，setDragIndicator 类型更新 |
| `src/render/index.js` | 更新导出 |
| `src/editor/strategies/ColumnMoveStrategy.js` | `dragIndicatorLayer` → `selectionLayer` |
| `src/editor/strategies/RowMoveStrategy.js` | `dragIndicatorLayer` → `selectionLayer` |
| `tests/render/layers/LayerIntegration.test.js` | 更新图层引用和断言 |
| `tests/render/layers/TileLayer.test.js` | 适配 offscreen 属性 |
| `tests/render/layers/FrozenLayer.test.js` | 适配 offscreen 属性 |
| `tests/render/layers/HeaderLayer.test.js` | 适配 offscreen 属性 |

---

## 12. 测试策略

### 12.1 SelectionLayer 测试

从 OverlayLayer.test.js 和 DragIndicatorLayer.test.js 迁移：

- 构造函数：name、zIndex、offscreen
- bindStore：监听正确状态
- render：选区渲染 + 冻结区域裁剪
- render：拖拽指示器渲染
- setColumnMoveState / setRowMoveState API
- hasColumnMove / hasRowMove / isColumnSource / isRowSource API

### 12.2 InteractionLayer 测试

从 ResizeLayer.test.js、UILayer.test.js、EditorLayer.test.js 迁移：

- 构造函数：name、zIndex、offscreen
- bindStore：监听正确状态
- render：冻结分割线
- render：调整大小指示线
- render：编辑框
- render：调试信息
- setResizeLine / clearResizeLine / getResizeLine API

### 12.3 LayerCompositor 测试

- offscreen=true 图层使用离屏 canvas 合成
- offscreen=false 图层直接渲染到 mainCtx
- 混合模式（部分离屏 + 部分直接）正确叠加

### 12.4 LayerIntegration 测试

- 5 个图层的排序正确
- 状态变化触发正确的图层变脏
- compose 输出正确的统计信息

---

## 13. 执行顺序

```
Phase 1: 基础设施
  ├── 修改 BaseLayer：新增 offscreen 属性
  ├── 修改 layerZIndex.js：新增 SELECTION、INTERACTION 常量
  └── 修改 LayerCompositor：支持直接渲染模式

Phase 2: 新图层
  ├── 创建 SelectionLayer.js
  ├── 创建 InteractionLayer.js
  └── 更新 render/index.js 导出

Phase 3: 集成
  ├── 修改 RenderEngine.js：替换图层实例化和注册
  ├── 修改 HeaderLayer.js：setDragIndicator 类型
  ├── 修改 TileLayer/FrozenLayer：offscreen: true
  ├── 修改 ColumnMoveStrategy/RowMoveStrategy：引用路径
  └── 删除旧图层文件

Phase 4: 测试
  ├── 创建 SelectionLayer.test.js
  ├── 创建 InteractionLayer.test.js
  ├── 更新 LayerIntegration.test.js
  ├── 更新 TileLayer/FrozenLayer/HeaderLayer 测试
  └── 删除旧测试文件

Phase 5: 清理
  ├── 删除 layerZIndex.js 中废弃的常量
  ├── 更新所有文档注释
  └── 运行全量测试验证
```

---

## 14. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 直接渲染模式下 mainCtx 状态污染 | 中 | InteractionLayer/SelectionLayer 的 render() 内使用 ctx.save()/ctx.restore() |
| HeaderLayer 直接渲染时被后续图层覆盖 | 低 | HeaderLayer z=50 最高，无后续图层覆盖 |
| 合并后脏标记粒度变粗 | 低 | 合并的图层都是轻量级，全量重绘开销可忽略 |
| FrozenLayer 选区渲染与 SelectionLayer 不一致 | 低 | 两者都使用 OverlayRenderer，逻辑一致 |

---

## 15. 预期收益

| 指标 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| 图层数 | 8 | 5 | -37.5% |
| 离屏 canvas 数 | 8 | 2 | -75% |
| 内存占用（1200×800 DPR2） | ~122MB | ~30MB | -75% |
| 每帧 drawImage 次数 | 8 | 2 | -75% |
| ReactiveStore watcher 数 | 27 | ~15 | -44% |
| 图层文件数 | 8 | 5 | -37.5% |


---

## 16. 长期演进策略

### 16.1 InteractionLayer 的"上帝图层"风险

当前合并方案中，InteractionLayer 承载了 3 个原图层的职责（Resize + UI + Editor），
存在演变为"上帝图层"的风险。短期合并完全合理，保持 5 层架构简洁，
但需要设立拆分阈值，防止长期腐化。

### 16.2 拆分阈值

当 InteractionLayer 满足以下**任一**条件时，应拆分为两个图层：

| 条件 | 阈值 | 检测方式 |
|------|------|---------|
| 代码行数 | > 300 行 | `wc -l InteractionLayer.js` |
| render() 内子渲染方法数 | > 5 个 | 代码审查 |
| 需要独立测试的子功能 | > 3 个 | 测试文件审查 |
| 子功能间存在状态依赖 | 有 | 代码审查 |

### 16.3 拆分方案

```
InteractionLayer (z=40)
  ├── FeedbackLayer (z=40)   — 交互反馈：调整线 + 编辑框
  └── UILayer (z=45)         — 装饰元素：冻结线 + 调试信息
```

| 新图层 | 职责 | 原图层来源 |
|--------|------|-----------|
| FeedbackLayer | 调整大小指示线、编辑框 | ResizeLayer + EditorLayer |
| UILayer | 冻结分割线、调试信息 | 原 UILayer |

**关键约束**：拆分后的两个图层**都不使用离屏 canvas**（`offscreen: false`），
直接渲染到主 canvas。这是与重构前 8 个独立离屏 canvas 架构的本质区别。

### 16.4 演进路线图

```
当前（8 层，8 离屏 canvas）
  │
  ▼ Phase 1：本次重构
5 层，2 离屏 canvas
  │
  ▼ Phase 2：InteractionLayer 超过阈值时
6 层，2 离屏 canvas（FeedbackLayer + UILayer 均为直接渲染）
  │
  ▼ Phase 3：SelectionLayer 超过阈值时（可选）
7 层，2 离屏 canvas（拆出 DragIndicatorLayer，直接渲染）
```

**不变量**：无论图层数如何增减，**离屏 canvas 始终只有 2 个**（TileLayer + FrozenLayer），
这是瓦片缓存架构的硬约束。其他图层的增减只影响直接渲染的调用次数，
不影响内存和合成开销。