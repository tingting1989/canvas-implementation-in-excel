# 瓦片渲染系统（Tile Rendering System）技术文档

> 本文档详细介绍了 Canvas 电子表格引擎中瓦片渲染系统的架构设计、核心类、渲染流程和性能优化策略。

---

## 目录

- [1. 架构概览](#1-架构概览)
- [2. Tile — 瓦片基本单元](#2-tile--瓦片基本单元)
- [3. TileCache — 瓦片缓存管理](#3-tilecache--瓦片缓存管理)
- [4. TileRenderer — 瓦片绘制引擎](#4-tilerenderer--瓦片绘制引擎)
- [5. 渲染流程详解](#5-渲染流程详解)
- [6. 高清屏适配（DPR）](#6-高清屏适配dpr)
- [7. 合并单元格处理](#7-合并单元格处理)
- [8. 性能优化策略](#8-性能优化策略)
- [9. API 参考](#9-api-参考)
- [10. 配置常量](#10-配置常量)

---

## 1. 架构概览

瓦片渲染系统是整个 Canvas 电子表格的核心渲染管线，由三个类协作完成：

```mermaid
+--------------+     +--------------+     +--------------+
| TileRenderer  |---->|  TileCache   |---->|    Tile      |
| (绘制逻辑)    |     | (缓存管理)    |     | (离屏Canvas)  |
+--------------+     +--------------+     +--------------+
       |                   |                    |
       |                   |                    v
       |                   |           +--------------+
       |                   +--------->|  离屏Canvas   |
       |                               |  (像素数据)   |
       v                               +--------------+
+--------------+
|  主 Canvas    |  <-- drawImage(tile.canvas)
|  (屏幕显示)   |
+--------------+
```

### 核心思想

将整个表格区域按 **TILE_SIZE x TILE_SIZE**（默认 256x256）像素切割为若干瓦片（Tile），每个瓦片拥有独立的离屏 Canvas，独立渲染和缓存。滚动时只重绘脏（dirty）瓦片，避免全量重绘。

### 为什么需要瓦片渲染？

| 方案 | 10万单元格重绘耗时 | 内存占用 |
|------|-------------------|--------|
| 全量重绘 | ~200ms | 低 |
| 瓦片缓存（脏标记） | ~5ms（仅重绘脏瓦片） | 中（缓存开销） |

瓦片渲染将 O(所有单元格) 的重绘开销降低到 O(可视区域单元格)。

---

## 2. Tile — 瓦片基本单元

**源文件**：src/render/Tile.js

### 类图

```mermaid
+----------------------------------+
|            Tile                  |
+----------------------------------+
| + tileRow: number               |  瓦片行号（瓦片网格坐标）
| + tileCol: number               |  瓦片列号（瓦片网格坐标）
| + dirty: boolean                |  脏标记
| + lastUsed: number              |  最后访问时间戳
| + dpr: number                   |  设备像素比
| + canvas: HTMLCanvasElement     |  离屏 Canvas
| + ctx: CanvasRenderingContext2D |  2D 渲染上下文
+----------------------------------+
| + getKey(): string              |  获取缓存键
| + markDirty(): void             |  标记为脏
| + touch(): void                 |  更新访问时间
| + clear(): void                 |  清空内容
| + destroy(): void               |  销毁释放资源
+----------------------------------+
```

### 瓦片坐标系

瓦片坐标与单元格坐标是两套独立的坐标系：

```mermaid
单元格坐标：  (row=0, col=0)  (row=0, col=1)  ...
瓦片坐标：    (tileRow=0, tileCol=0)  覆盖像素 [0, 256) x [0, 256)
              (tileRow=0, tileCol=1)  覆盖像素 [256, 512) x [0, 256)
              (tileRow=1, tileCol=0)  覆盖像素 [0, 256) x [256, 512)
```

转换公式：
```mermaid
tileRow = Math.floor(pixelY / TILE_SIZE)
tileCol = Math.floor(pixelX / TILE_SIZE)
```

### 脏标记机制（Dirty Flag）

```mermaid
dirty = true  -->  瓦片内容已过期，需要重新绘制
dirty = false -->  瓦片内容是最新的，可以直接复用缓存

触发脏标记的场景：
+-- 单元格数据变化 --> TileCache.markDirty()
+-- 单元格样式变化 --> TileCache.markDirty()
+-- 行列插入/删除  --> TileCache.invalidateRegion()
+-- 切换工作表     --> TileCache.markAllDirty()
```



### 资源销毁

```javascript
destroy() {
    this.canvas.width = 0;   // 立即释放 GPU 内存
    this.canvas.height = 0;
    this.ctx = null;          // 解除引用，帮助 GC
    this.canvas = null;
}
`

将 Canvas 宽高设为 0 是释放 GPU 内存的标准做法，比等待 GC 更高效。

---

## 3. TileCache — 瓦片缓存管理

**源文件**：src/render/TileCache.js

### 类图

```mermaid
+----------------------------------------------+
|            TileCache                          |
+----------------------------------------------+
| + tiles: Map<string, Tile>           |  瓦片映射表
| + maxSize: number                    |  最大缓存数量
| + dpr: number                        |  设备像素比
+----------------------------------------------+
| + get(tileRow, tileCol): Tile|null   |  获取缓存瓦片
| + getOrCreate(tileRow, tileCol): Tile|  获取或创建
| + markDirty(tileRow, tileCol): void  |  标记单个脏
| + markAllDirty(): void               |  标记全部脏
| + invalidateRegion(...): void        |  标记区域脏
| + remove(tileRow, tileCol): void     |  移除瓦片
| + clear(): void                      |  清空所有
| + get size(): number                 |  缓存数量
| - #evictIfNeeded(): void             |  LRU 淘汰
+----------------------------------------------+
```

### LRU 缓存淘汰

当缓存数量达到上限（默认 512）时，触发淘汰：

```mermaid
getOrCreate()
    |
    +-- 缓存命中 --> touch() 更新时间戳 --> 返回
    |
    +-- 缓存未命中 --> #evictIfNeeded()
                        |
                        +-- size < maxSize --> 不淘汰
                        |
                        +-- size >= maxSize
                              |
                              +-- 按 lastUsed 升序排序
                              +-- 淘汰前 25% 瓦片（至少 1 个）
                              +-- tile.destroy() 释放资源
```

淘汰 25% 而非 1 个的原因：避免频繁触发淘汰排序，一次淘汰多个可减少排序开销。

### 脏标记传播

| 方法 | 参数 | 场景 | 实现方式 |
|------|------|------|--------|
| markDirty | tileRow, tileCol | 单元格数据/样式变化 | 直接标记单个瓦片 |
| invalidateRegion | startRow, startCol, endRow, endCol | 行列插入/删除 | 矩形相交测试 |
| markAllDirty | 无 | 切换工作表/修改默认样式 | 遍历所有瓦片 |

### 矩形相交测试

invalidateRegion 使用 AABB（轴对齐包围盒）相交测试：

```mermaid
两个矩形相交 <==> X 方向重叠 AND Y 方向重叠

tileEndRow >= startRow AND tileStartRow <= endRow
AND
tileEndCol >= startCol AND tileStartCol <= endCol
```

---

## 4. TileRenderer — 瓦片绘制引擎

**源文件**：src/render/TileRenderer.js

### 类图

```mermaid
+--------------------------------------------------+
|            TileRenderer                            |
+--------------------------------------------------+
| + tileCache: TileCache                             |
+--------------------------------------------------+
| + render(ctx, sheet, scrollX, ...): void           |  渲染可视区域
| - #paintTile(tile, sheet, tr, tc): void            |  绘制单个瓦片
| - #drawCellBackground(...): void                   |  绘制单元格背景
| - #drawCellBorder(...): void                       |  绘制单元格边框
| - #drawCellText(...): void                         |  绘制单元格文字
| + invalidateCell(row, col, rc): void               |  标记单元格脏
| + invalidateAll(): void                            |  标记全部脏
| + destroy(): void                                  |  销毁
+--------------------------------------------------+
```



### 绘制层次（从底到顶）

```mermaid
+---------------------------+
| 7. 下划线装饰             |  <-- 最顶层
+---------------------------+
| 6. 单元格文字             |
+---------------------------+
| 5. 网格线（边框）          |
+---------------------------+
| 4. 禁用单元格灰色背景      |  <-- 背景层
+---------------------------+
| 3. 数据绑定样式背景色      |
+---------------------------+
| 2. 条件样式背景色          |
+---------------------------+
| 1. 单元格自定义背景色      |
+---------------------------+
| 0. 斑马纹（奇偶行交替色）  |  <-- 最底层
+---------------------------+
```

背景绘制采用**覆盖策略**：高优先级背景直接覆盖低优先级，而非混合。

---

## 5. 渲染流程详解

### 5.1 主渲染循环

```mermaid
render(ctx, sheet, scrollX, scrollY, viewW, viewH)
|
+-- 1. 计算单元格可视区域
|     cellViewW = viewW - HEADER_WIDTH
|     cellViewH = viewH - HEADER_HEIGHT
|
+-- 2. 计算可视区域覆盖的瓦片范围
|     startTileCol = floor(scrollX / TILE_SIZE)
|     startTileRow = floor(scrollY / TILE_SIZE)
|     endTileCol   = ceil((scrollX + cellViewW) / TILE_SIZE)
|     endTileRow   = ceil((scrollY + cellViewH) / TILE_SIZE)
|
+-- 3. 遍历每个瓦片
|     for (tr = startTileRow; tr <= endTileRow; tr++)
|       for (tc = startTileCol; tc <= endTileCol; tc++)
|         |
|         +-- tile = tileCache.getOrCreate(tr, tc)
|         +-- if (tile.dirty) --> #paintTile() --> tile.dirty = false
|         +-- tile.touch()  // 更新 LRU 时间戳
|         |
|         +-- ctx.drawImage(tile.canvas, ...)
|              // 将离屏 Canvas 绘制到主 Canvas
|
+-- 完成
```



### 5.2 瓦片绘制流程

```mermaid
#paintTile(tile, sheet, tileRow, tileCol)
|
+-- 1. 清空瓦片
|     tileCtx.clearRect(0, 0, TILE_SIZE, TILE_SIZE)
|
+-- 2. 计算瓦片全局像素范围
|     pixelY0 = tileRow x TILE_SIZE
|     pixelX0 = tileCol x TILE_SIZE
|
+-- 3. 前缀和二分查找定位单元格范围
|     sr = rowAt(pixelY0)     // 起始行
|     sc = colAt(pixelX0)     // 起始列
|     er = rowAt(pixelY1) + 1 // 结束行
|     ec = colAt(pixelX1) + 1 // 结束列
|
+-- 4. 遍历每个单元格
      for (r = sr; r < er; r++)
        for (c = sc; c < ec; c++)
          |
          +-- 跳过检查
          |   +-- 不可见行：localY + rowH <= 0 || localY >= tileSize
          |   +-- 隐藏列：colW <= 0
          |   +-- 合并单元格：isMergedCell(realR, c)
          |
          +-- 坐标转换
          |   localX = colX - pixelX0  (全局 --> 瓦片局部)
          |   localY = rowY - pixelY0
          |
          +-- 合并单元格尺寸计算
          |   if (merge) --> w/h/drawX/drawY 跨越整个合并区域
          |
          +-- 依次绘制
              +-- #drawCellBackground()  背景层
              +-- #drawCellBorder()      边框层
              +-- #drawCellText()        文字层
```



### 5.3 坐标转换

```mermaid
全局像素坐标系（整张表格）：
+----------------------------------------------+
| (0,0)                                        |
|    +-------------+                           |
|    |  瓦片(0,0)   |                           |
|    |  pixelX0=0  |                           |
|    |  pixelY0=0  |                           |
|    +-------------+                           |
|         +-------------+                      |
|         |  瓦片(0,1)   |                      |
|         |  pixelX0=256|                      |
|         |  pixelY0=0  |                      |
|         +-------------+                      |
+----------------------------------------------+

瓦片局部坐标系（单个瓦片内）：
+-------------+
| (0,0)        |
|  localX/Y    |  <-- 单元格在瓦片内的位置
|              |
| localX = colX - pixelX0
| localY = rowY - pixelY0
+-------------+
```

---

## 6. 高清屏适配（DPR）

### 原理

```mermaid
设备像素比（DPR）= 物理像素 / 逻辑像素

普通屏 DPR=1：1 个逻辑像素 = 1 个物理像素
高清屏 DPR=2：1 个逻辑像素 = 4 个物理像素（2x2）
```



### 实现方式

```javascript
// 1. Canvas 物理像素尺寸 = 逻辑尺寸 x DPR
canvas.width  = TILE_SIZE * DPR;  // 256 x 2 = 512
canvas.height = TILE_SIZE * DPR;

// 2. 缩放上下文，绘制代码仍用逻辑坐标
ctx.scale(DPR, DPR);
// 此时 ctx.fillRect(0, 0, 256, 256) 实际填充 512x512 物理像素

// 3. drawImage 时缩放回逻辑尺寸
ctx.drawImage(tile.canvas,
    0, 0, tile.canvas.width, tile.canvas.height,  // 源：512x512
    drawX, drawY, TILE_SIZE, TILE_SIZE              // 目标：256x256
);
// 浏览器自动将 512x512 的内容缩放到 256x256 逻辑像素
// 在 DPR=2 的屏幕上，256 逻辑像素 = 512 物理像素 --> 1:1 映射 --> 清晰
```



### DPR 配置

DPR 从 CONFIG.DPR 全局读取，定义在 src/constants/config.js：

```javascript
DPR: window.devicePixelRatio || 1
```

---

## 7. 合并单元格处理

### 绘制策略

合并区域只在**左上角单元格**位置绘制一次，非左上角单元格跳过绘制。

```mermaid
+-------+-------+-------+
| A1    | A1合并 | A1合并 |  <-- 只在 A1 位置绘制整个合并区域
+-------+-------+-------+
| A2    | A1合并 | A1合并 |  <-- isMergedCell() = true，跳过
+-------+-------+-------+
| A3    | B3    | C3    |  <-- 正常绘制
+-------+-------+-------+
```



### 尺寸计算

```javascript
if (merge) {
    // 合并区域宽度 = 右下角列右边界 - 左上角列左边界
    w = getColX(merge.bottomCol) + getColWidth(merge.bottomCol) - getColX(merge.topCol);
    // 合并区域高度 = 右下角行下边界 - 左上角行上边界
    h = getRowY(merge.bottomRow) + getRowHeight(merge.bottomRow) - getRowY(merge.topRow);
    // 绘制位置 = 左上角单元格在瓦片内的位置
    drawX = getColX(merge.topCol) - pixelX0;
    drawY = getRowY(merge.topRow) - pixelY0;
}
```



### 边框处理

合并单元格不绘制内部网格线（if (merge) return;），避免网格线穿过合并区域。

---

## 8. 性能优化策略

### 8.1 脏标记（Dirty Flag）

只重绘内容发生变化的瓦片，未变化的瓦片直接从缓存读取。

```javascript
// 修改单个单元格
sheet.setCellValue(0, 0, "Hello");
// tileCache.markDirty(0, 0)  只标记一个瓦片
// render() 只重绘 1 个瓦片而非全部
```

### 8.2 前缀和二分查找

通过 RowColManager 的前缀和数组，O(log n) 定位瓦片覆盖的单元格范围：

```javascript
sr = rowAt(pixelY0)  // 二分查找，O(log n)
er = rowAt(pixelY1)  // 而非遍历所有行 O(n)
```

### 8.3 跳过不可见单元格

```javascript
// 行完全在瓦片上方或下方
if (localY + rowH <= 0 || localY >= tileSize) continue;
// 列完全在瓦片左侧或右侧
if (localX + colW <= 0 || localX >= tileSize) continue;
// 隐藏列（宽度为 0）
if (colW <= 0) continue;
// 被合并的单元格
if (sheet.isMergedCell(realR, c)) continue;
```

### 8.4 LRU 缓存淘汰

限制瓦片缓存数量，避免内存无限增长：

```
maxSize = 512  // 最多缓存 512 个瓦片
每个瓦片 = 256x256x4 bytes = 256KB（DPR=1）
512 个瓦片 = 128MB 内存上限
```

### 8.5 边框绘制优化

只绘制右边框和下边框，避免相邻单元格重复绘制同一条线：

```javascript
// 右边框
ctx.moveTo(drawX + w - 0.5, drawY);
ctx.lineTo(drawX + w - 0.5, drawY + h);
// 下边框
ctx.moveTo(drawX, drawY + h - 0.5);
ctx.lineTo(drawX + w, drawY + h - 0.5);
```

0.5 像素偏移是 Canvas 像素对齐技巧，确保 1px 线条不模糊。

---
## 9. API 参考

### Tile

| 方法 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `constructor` | tileRow, tileCol | Tile | 创建瓦片实例 |
| `getKey` | - | string | 获取缓存键 "tileRow:tileCol" |
| `markDirty` | - | void | 标记为脏 |
| `touch` | - | void | 更新访问时间戳 |
| `clear` | - | void | 清空内容并标记为脏 |
| `destroy` | - | void | 销毁释放资源 |

### TileCache

| 方法 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `constructor` | - | TileCache | 创建缓存实例 |
| `get` | tileRow, tileCol | Tile|null | 获取缓存瓦片 |
| `getOrCreate` | tileRow, tileCol | Tile | 获取或创建瓦片 |
| `markDirty` | tileRow, tileCol | void | 标记单个瓦片脏 |
| `markAllDirty` | - | void | 标记全部脏 |
| `invalidateRegion` | startRow, startCol, endRow, endCol | void | 标记区域脏 |
| `remove` | tileRow, tileCol | void | 移除并销毁瓦片 |
| `clear` | - | void | 清空所有瓦片 |
| `get size` | - | number | 缓存数量 |

### TileRenderer

| 方法 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `constructor` | tileCache | TileRenderer | 创建渲染器 |
| `render` | ctx, sheet, scrollX, scrollY, viewW, viewH | void | 渲染可视区域 |
| `invalidateCell` | row, col, rc | void | 标记单元格脏 |
| `invalidateAll` | - | void | 标记全部脏 |
| `destroy` | - | void | 销毁渲染器 |

---
## 10. 配置常量

a**常量定义在 `src/constants/config.js`**：

| 常量 | 默认值 | 说明 |
| --- | --- | --- |
| `TILE_SIZE` | 256 | 瓦片逻辑像素尺寸 |
| `TILE_CACHE_MAX` | 512 | 最大缓存瓦片数量 |
| `DPR` | window.devicePixelRatio || 1 | 设备像素比 |
| `HEADER_WIDTH` | 50 | 行头宽度 |
| `HEADER_HEIGHT` | 25 | 列头高度 |
| `GRID_COLOR` | "#e0e0e0" | 网格线颜色 |
| `ZEBRA_LIGHT` | "#ffffff" | 斑马纹浅色 |
| `ZEBRA_DARK` | "#fafafa" | 斑马纹深色 |
| `DISABLED_BG` | "#f0f0f0" | 禁用单元格背景色 |
| `DISABLED_COLOR` | "#aaa" | 禁用单元格文字颜色 |

---

*文档生成时间：2026-06-16*  
*项目地址：canvas-implementation-in-excel*
