# TileLayer — 瓦片层

## 概述

`TileLayer` 是渲染引擎中 **最核心的数据图层**，负责渲染 Excel 主数据区域的全部单元格内容。它采用瓦片化（Tiling）渲染策略，将可视区域划分为固定大小的瓦片进行离屏缓存，大幅提升滚动性能。

## 类结构

```
BaseLayer
  └── TileLayer (zIndex: 1)
        ├── tileRenderer: TileRenderer   // 瓦片渲染核心
        │     └── cache: TileCache       // LRU 瓦片缓存池
        └── onContentReady: Function     // 异步资源就绪回调
```

## 瓦片化渲染原理

```
┌─────────────────────────────────────────┐
│                                         │
│    ┌───────┬───────┬───────┐           │
│    │ Tile  │ Tile  │ Tile  │           │  每个 Tile = 256×256 px
│    │ (0,0) │ (1,0) │ (2,0) │           │  独立的离屏 Canvas
│    ├───────┼───────┼───────┤           │
│    │ Tile  │ Tile  │ Tile  │           │  脏标记管理
│    │ (0,1) │ (1,1) │ (2,1) │           │  LRU 淘汰策略
│    ├───────┼───────┼───────┤           │
│    │ Tile  │ Tile  │ Tile  │           │
│    │ (0,2) │ (1,2) │ (2,2) │           │
│    └───────┴───────┴───────┘           │
│                                         │
│         Viewport (可视区域)              │
└─────────────────────────────────────────┘
```

## 核心优势

| 特性 | 传统逐单元格渲染 | 瓦片化渲染 |
|------|-----------------|-----------|
| 滚动性能 | O(n) 全部重绘 | O(1) 平移+边界补齐 |
| 内存占用 | 低 | 中（缓存池上限可控） |
| 实现复杂度 | 简单 | 中等 |
| 适用场景 | 小表格 | 大表格/高频滚动 |

## 图层位置

```
zIndex 4: UILayer         ← 最顶层
zIndex 3: HeaderLayer
zIndex 2.5: FrozenLayer
zIndex 1: TileLayer       ← 【本层】最底层
```

## 脏标记管理

```
外部调用                    内部处理
─────────                  ─────────
markCellDirty(r,c,rc)  →  invalidateCell()  →  定位瓦片 → 标记脏
markAllDirty()         →  invalidateAll()    →  所有瓦片标记脏
                        →  markDirty()       →  Layer 自身标记脏
```

## 异步资源回调链

```
图片加载完成
    ↓
TileRenderer.onContentReady()
    ↓
TileLayer: markDirty()          ← 自动触发重绘
    ↓
onContentReady() callback       ← 通知外部（可选）
    ↓
RenderEngine.requestRender()    →  下一帧重绘
```

## 状态监听

| 键 | 触发场景 |
|----|----------|
| `scroll` | 滚动位置变化，瓦片可见集改变 |
| `viewport` | 视口尺寸变化，瓦片覆盖范围改变 |
| `tile` | 瓦片配置变化（大小、缓存策略等）|

## 配置参数

| 参数 | 默认值 | 来源 | 说明 |
|------|--------|------|------|
| TILE_SIZE | 256px | CONFIG | 瓦片边长 |
| TILE_CACHE_MAX | 512 | CONFIG | 最大缓存瓦片数 |
| DPR | devicePixelRatio | CONFIG | 设备像素比 |

## 使用示例

```js
// 基础用法
const tileLayer = new TileLayer();
engine.addLayer(tileLayer);

// 共享缓存（高级用法）
const sharedCache = new TileCache();
const mainLayer = new TileLayer(sharedCache);
const previewLayer = new TileLayer(sharedCache);

// 细粒度脏标记
tileLayer.markCellDirty(5, 3, sheet.rowColManager);

// 全量刷新
tileLayer.markAllDirty();

// 异步资源回调
tileLayer.onContentReady = () => {
    console.log('图片加载完成');
};
```