# ChunkedCellStore — 分块单元格存储

## 概述

`ChunkedCellStore` 是表格的核心数据存储层，将千万级单元格按二维网格切分为固定大小的数据块（Chunk）进行管理。它是 `Chunk` 和 `Cell` 的上层管理器，对外暴露统一的 CRUD 和行列操作接口。

## 文件位置

```
src/model/store/ChunkedCellStore.js
```

## 设计意图

- **分块管理**：每个 Chunk 覆盖 `CHUNK_ROW_SIZE × CHUNK_COL_SIZE` 个逻辑位置（默认 1024 × 256 = 262,144），通过 Map 索引实现 O(1) 定位。
- **稀疏存储**：Chunk 内部使用 Map 而非二维数组，未写入的单元格不占用内存。
- **懒分配**：Chunk 按需创建（lazy allocation），只有写入数据时才实例化。
- **行列操作优化**：插入/删除/移动行列时仅遍历受影响的 Chunk，避免全量遍历。

## 配置常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `CONFIG.CHUNK_ROW_SIZE` | 1024 | 每个 Chunk 覆盖的行数 |
| `CONFIG.CHUNK_COL_SIZE` | 256 | 每个 Chunk 覆盖的列数 |
| `CONFIG.MAX_ROWS` | 10,000,000 | 最大行数（一千万行） |
| `CONFIG.MAX_COLS` | 70,000 | 最大列数（七万列） |

## 容量分析

| 指标 | 值 |
|------|-----|
| 每 Chunk 容量 | 262,144 个逻辑位置 |
| 理论最大 Chunk 数 | ~267 万个（9,766 × 274） |
| Map 容量 | 支持数百万 key，受内存限制 |
| 典型场景（100 万 Cell） | 约 100 个 Chunk，填充率 ~3.8% |

## 类结构

```js
class ChunkedCellStore {
    #chunks: Map<"chunkRow:chunkCol", Chunk>  // Chunk 映射表
}
```

## 坐标系

```
全局逻辑坐标 (row, col)
    │
    │  #chunkKey(row, col) = "⌊row/1024⌋:⌊col/256⌋"
    │
    ▼
Chunk 网格坐标 "chunkRowIndex:chunkColIndex"
    │
    │  Chunk.rowStart = chunkRowIndex × 1024
    │  Chunk.colStart = chunkColIndex × 256
    │
    ▼
Chunk 内部偏移量 "rowOffset:colOffset"
    │
    │  Chunk.#key(row, col) = (row - rowStart) + ":" + (col - colStart)
    │
    ▼
Cell 实例
```

示例：
- 逻辑坐标 `(1050, 10)` → `#chunkKey` → `"1:0"` → `Chunk(1024, 0)` → `#key` → `"26:10"` → Cell

## API 参考

### CRUD 操作

#### get(row, col) → Cell | undefined

获取指定位置的单元格。O(1)，两次哈希查找。

```js
const cell = store.get(1050, 10); // Cell 或 undefined
```

#### set(row, col, cell)

设置指定位置的单元格。O(1)，自动创建 Chunk（如不存在）。

```js
store.set(1050, 10, new Cell("hello", 0, false));
```

#### delete(row, col)

删除指定位置的单元格。O(1)。

```js
store.delete(1050, 10);
```

### 行列插入

#### insertRow(atRow)

在 `atRow` 位置插入一行，`atRow` 及以下的 Cell 全部下移一行。

```
插入前：              插入后（atRow=1）：
  行0: [A, B, C]       行0: [A, B, C]
  行1: [D, E, F]   →   行1: []          ← 新空行
  行2: [G, H, I]       行2: [D, E, F]
                       行3: [G, H, I]
```

**实现策略**：
1. 筛选 `rowStart >= atRow` 的 Chunk（仅受影响 Chunk）。
2. 从下往上处理，避免数据覆盖。
3. 遍历 Chunk 内全部 Cell，写入 `row+1` 位置。

**性能**（典型场景：100 Chunk，100 万 Cell）：

| atRow 位置 | 受影响 Chunk 数 | 遍历 Cell 数 | 相比全量减少 |
|-----------|:-------------:|:----------:|:---------:|
| 数据顶部 (atRow=0) | 100 | ~100 万 | 0% |
| 数据中间 | ~50 | ~50 万 | ~50% |
| 数据底部 | ~2 | ~2 万 | ~98% |

#### insertCol(atCol)

在 `atCol` 位置插入一列，与 `insertRow` 对称。

```js
store.insertCol(3); // 在列 3 位置插入空列
```

### 行列删除

#### deleteRow(atRow)

删除 `atRow` 行，分两步：
1. **删除目标行**：遍历包含 `atRow` 的 Chunk，删除 `row === atRow` 的 Cell。
2. **上移数据**：遍历 `rowStart > atRow` 的 Chunk，将全部 Cell 写入 `row-1` 位置。

```js
store.deleteRow(2); // 删除第 2 行
```

#### deleteCol(atCol)

删除 `atCol` 列，与 `deleteRow` 对称。

```js
store.deleteCol(5); // 删除第 5 列
```

### 行列移动

#### moveRow(fromRow, toRow)

将 `fromRow` 整行移动到 `toRow` 位置，中间行顺移。

三步操作：
1. 收集 `fromRow` 的 Cell，从原位置删除。
2. 中间行逐行移动（通过 `#shiftRowUp` / `#shiftRowDown`）。
3. 将 Cell 写入 `toRow` 位置。

```js
store.moveRow(5, 2);  // 将第 5 行移到第 2 行（其余行下移）
store.moveRow(2, 5);  // 将第 2 行移到第 5 行（其余行上移）
```

#### moveCol(fromCol, toCol)

与 `moveRow` 对称。

```js
store.moveCol(3, 7);  // 将第 3 列移到第 7 列
```

### 遍历与查询

#### *chunks()

遍历所有 Chunk（生成器）。

```js
for (const chunk of store.chunks()) {
    // chunk.rowStart, chunk.colStart, chunk.cells
}
```

#### getMaxRow() → number

获取当前数据区域的最大行号。遍历所有非空 Chunk，返回 `rowStart + 1024 - 1` 的最大值。无数据时返回 `-1`。

> 注意：返回的是 Chunk 覆盖范围的最大行号，而非精确的"最后一个有数据行"。

#### getMaxCol() → number

与 `getMaxRow` 对称。无数据时返回 `-1`。

## 内部辅助方法

### #shiftColLeft(col) / #shiftColRight(col)

将指定列的所有 Cell 左移/右移一列。用于 `moveCol` 中间列的移动。
仅遍历 `colStart` 区间包含目标列的 Chunk。

### #shiftRowUp(row) / #shiftRowDown(row)

将指定行的所有 Cell 上移/下移一行。用于 `moveRow` 中间行的移动。
仅遍历 `rowStart` 区间包含目标行的 Chunk。

## 性能总结

### 基本操作复杂度

| 操作 | 时间复杂度 | 说明 |
|------|-----------|------|
| `get()` | O(1) | chunkKey 哈希 + cell key 哈希 |
| `set()` | O(1) | 同上 + 可能的 Chunk 懒创建 |
| `delete()` | O(1) | 同上 |
| `chunks()` | O(C) | C = Chunk 总数 |
| `getMaxRow/MaxCol()` | O(C) | 遍历所有 Chunk |

### 行列操作复杂度（典型场景：100 Chunk，100 万 Cell）

| 操作 | 优化前 | 优化后（中间位置） | 优化后（底部位置） |
|------|:-----:|:---------------:|:---------------:|
| `insertRow` | O(100 万) | O(50 万) | O(2 万) |
| `insertCol` | O(100 万) | O(50 万) | O(2 万) |
| `deleteRow` | O(100 万) | O(50 万) | O(2 万) |
| `deleteCol` | O(100 万) | O(50 万) | O(2 万) |
| `moveRow` | O(100 万) | O(受影响的 Chunk × 移动范围) | O(少量) |
| `moveCol` | O(100 万) | O(受影响的 Chunk × 移动范围) | O(少量) |

### 已知限制

1. **Chunk 内粗粒度遍历**：受影响 Chunk 内部仍遍历全部 Cell（而非仅遍历需要移动的行/列）。在典型场景中，`insertRow(atRow)` 可能遍历约 50 万 Cell，而实际只需移动约 25 万。
2. **`getMaxRow/MaxCol` 返回 Chunk 边界**：返回的是 Chunk 覆盖范围的最大行号，而非精确的数据边界。

### 优化方向

- **Chunk 内部二级索引**：改用 `Map<rowOffset, Map<colOffset, Cell>>` 结构，支持按行范围高效查询。
- **精确最大行号**：维护一个计数器或缓存，避免每次遍历所有 Chunk。

## 与相关模块的关系

```
Sheet
  └── ChunkedCellStore
        ├── #chunks: Map<key, Chunk>
        │     ├── Chunk(0, 0)
        │     │     └── cells: Map<"offset:offset", Cell>
        │     ├── Chunk(0, 256)
        │     └── ...
        ├── CRUD: get / set / delete
        ├── 行列: insertRow / insertCol / deleteRow / deleteCol
        └── 移动: moveRow / moveCol
```
