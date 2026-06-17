# Chunk — 数据分块

## 概述

`Chunk` 是 `ChunkedCellStore` 的基本存储单元，将千万级单元格按二维网格切分为固定大小的数据块。每个 Chunk 覆盖 `CHUNK_ROW_SIZE × CHUNK_COL_SIZE` 个逻辑单元格位置（默认 **1024 × 256 = 262,144** 个位置）。

## 设计意图

- **稀疏存储**：内部使用 `Map<string, Cell>` 而非二维数组，仅记录"实际有数据"的单元格，未写入的位置不占用内存。
- **空间换时间**：通过分块将 O(n) 全量遍历降为 O(k)（k = 受影响 Chunk 数），大幅减少行列操作时的遍历量。
- **逻辑坐标不变性**：外部始终使用全局逻辑坐标 (row, col) 访问，Chunk 内部自动转换为相对偏移量。

## 文件位置

```
src/model/store/Chunk.js
```

## 配置常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `CONFIG.CHUNK_ROW_SIZE` | 1024 | 每个 Chunk 覆盖的行数 |
| `CONFIG.CHUNK_COL_SIZE` | 256 | 每个 Chunk 覆盖的列数 |
| 每 Chunk 最大容量 | 262,144 | 1024 × 256 个逻辑单元格位置 |

## 类结构

```js
class Chunk {
    rowStart: number    // Chunk 在逻辑坐标系中的起始行号（含）
    colStart: number    // Chunk 在逻辑坐标系中的起始列号（含）
    cells: Map<string, Cell>  // 单元格存储，key = "rowOffset:colOffset"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `rowStart` | `number` | 起始行号，如 Chunk(0, 0) 覆盖行 [0, 1023] |
| `colStart` | `number` | 起始列号，如 Chunk(1024, 0) 覆盖行 [1024, 2047] |
| `cells` | `Map<string, Cell>` | 公开属性，被 `ChunkedCellStore` 的行列操作直接访问（如 `clear()`） |

## API 参考

### constructor(rowStart, colStart)

创建覆盖指定起始位置的数据块。

```js
// 覆盖行 [0, 1023]、列 [0, 255] 的 Chunk
const chunk = new Chunk(0, 0);

// 覆盖行 [1024, 2047]、列 [0, 255] 的 Chunk
const chunk2 = new Chunk(1024, 0);
```

### #key(row, col) → string

将全局逻辑坐标转换为 Chunk 内部的相对偏移量 key。

- 示例：`Chunk(1024, 0)` 中，逻辑行 1050 → 偏移量 26 → key = `"26:0"`
- 格式：`"rowOffset:colOffset"`，范围 `[0, 1023]:[0, 255]`

### get(row, col) → Cell | undefined

获取指定逻辑位置的单元格。无数据时返回 `undefined`。

```js
const cell = chunk.get(1050, 10); // 返回 Cell 或 undefined
```

### set(row, col, cell)

设置指定逻辑位置的单元格。会自动转换为内部相对坐标存储。

```js
chunk.set(1050, 10, new Cell({ value: "hello" }));
```

### delete(row, col)

删除指定逻辑位置的单元格。对不存在的 key 为无操作（Map.delete 语义）。

```js
chunk.delete(1050, 10);
```

### *iterate() → Generator

生成器方法，遍历 Chunk 内所有已存储的单元格。每次 yield 返回：

```js
{ row: number, col: number, cell: Cell }
```

其中 `row` / `col` 为还原后的全局逻辑坐标。

```js
for (const { row, col, cell } of chunk.iterate()) {
    console.log(`(${row}, ${col}): ${cell.value}`);
}
```

## 内存特性

### 典型场景分析

以 **100 万 Cell 分布在 100 个 Chunk** 为例：

| 指标 | 值 |
|------|-----|
| 每 Chunk 最大容量 | 262,144 个位置 |
| 每 Chunk 平均 Cell 数 | 10,000 |
| 填充率 | ~3.8% |
| 内存开销 | 仅存储 10,000 个 Map 条目 / Chunk（而非 262,144 个数组槽位） |

### 稀疏矩阵优势

在典型 Excel 使用场景中，用户通常只在部分行列区域填写数据（如 A1:G1000），其余大量位置为空。Map 天然适合此场景——只有有数据的单元格才占用内存。

## 性能特性

### 基本操作

| 操作 | 时间复杂度 | 说明 |
|------|-----------|------|
| `get()` | O(1) | Map 哈希查找 |
| `set()` | O(1) | Map 哈希插入 |
| `delete()` | O(1) | Map 哈希删除 |
| `iterate()` | O(k) | k = Chunk 内实际 Cell 数 |

### 遍历限制

`iterate()` 遍历 Chunk 内**所有**已存储的 Cell，不支持按行列范围过滤。这意味着在 `ChunkedCellStore` 的行列操作中：

- `insertRow(atRow)`：若某 Chunk 的 `rowStart >= atRow`，会遍历该 Chunk 内**全部** Cell，而非仅遍历 `row >= atRow` 的 Cell。
- 同理，`deleteRow`、`moveCol` 等操作也存在类似的"粗粒度遍历"问题。

**影响**：在典型场景（100 Chunk、100 万 Cell）中，`insertRow(atRow)` 在 `atRow` 位于数据中间时需遍历约 50 个 Chunk 的约 50 万 Cell，而非仅遍历需要移动的约 25 万 Cell。

**优化方向**：可考虑内部改用按行分组的二级 Map（`Map<rowOffset, Map<colOffset, Cell>>`），以支持按行范围高效查询。

## 与 ChunkedCellStore 的关系

```
ChunkedCellStore
├── #chunks: Map<"chunkRow:chunkCol", Chunk>
│   ├── Chunk(0, 0)     → cells: Map { "0:0"→Cell, "0:1"→Cell, ... }
│   ├── Chunk(0, 256)   → cells: Map { "0:0"→Cell, ... }
│   ├── Chunk(1024, 0)  → cells: Map { ... }
│   └── ...
└── #chunkKey(row, col) → "chunkRowIndex:chunkColIndex"
```

- `ChunkedCellStore` 负责按行列定位到正确的 Chunk，并处理跨 Chunk 的行列操作。
- `Chunk` 仅负责单个数据块内的 CRUD 和遍历，不关心全局坐标系的变换。
