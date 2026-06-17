# Cell — 单元格数据模型

## 概述

`Cell` 是表格最轻量的数据载体，存储单元格的值、样式引用和禁用状态。Cell 本身是"纯数据"对象，不包含坐标信息——坐标由 `ChunkedCellStore` / `Chunk` 层级管理。

## 文件位置

```
src/model/store/Cell.js
```

## 设计意图

- **极简设计**：仅 3 个字段（value / styleId / disabled），避免数据膨胀。
- **关注分离**：格式（StyleManager）、合并（MergeManager）、条件规则（ConditionalRule）等由独立模块管理，Cell 只持有对它们的引用。
- **值类型灵活**：`value` 可以是字符串、数字、布尔值等，类型由使用方决定。

## 类结构

```js
class Cell {
    value: any       // 单元格的值
    styleId: number  // 样式 ID，0 表示默认样式
    disabled: boolean // 是否禁用
}
```

### 字段说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | `any` | `""` | 单元格的值，可以是字符串、数字等 |
| `styleId` | `number` | `0` | 指向 StyleManager 中样式表的索引，0 为默认样式 |
| `disabled` | `boolean` | `false` | 是否为禁用单元格（禁用后不可编辑，渲染灰色背景） |

## API 参考

### constructor(value, styleId, disabled)

```js
new Cell(value, styleId, disabled)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | `any` | `""` | 单元格值 |
| `styleId` | `number` | `0` | 样式 ID |
| `disabled` | `boolean` | `false` | 是否禁用 |

### 使用示例

```js
// 默认单元格
const cell = new Cell("hello");

// 带样式的单元格
const styledCell = new Cell("world", 3);

// 禁用单元格（不可编辑）
const disabledCell = new Cell("", 0, true);
```

## 构造场景

通常由 `Sheet` 的方法创建，而非手动 `new Cell()`：

| 场景 | 代码 | 说明 |
|------|------|------|
| 设置单元格值 | `new Cell(value, styleId)` | Sheet.setCell() 内调用 |
| 清空单元格 | `new Cell("", 0, true)` | Sheet.clearCell() 内调用 |
| 设置样式 | `new Cell(value, newStyleId, cell?.disabled)` | 保留 disabled 状态 |
| 批量设置 | `new Cell(row[c], 0)` | Sheet.setCellData() 内调用 |
| 条件禁用 | `new Cell(value, styleId, isDisabled)` | 条件规则触发时 |

## 生命周期

```
创建（Sheet.setCell 等）
  → 存入 Chunk.cells Map（key = "rowOffset:colOffset"）
    → 读取（Chunk.get / iterate）
      → 删除（Chunk.delete，移除 Map 条目）
        → GC 回收
```

- Cell 实例存储在 `Chunk.cells` Map 中，由 `ChunkedCellStore` 统一管理。
- 删除单元格时调用 `Chunk.delete(row, col)` 移除 Map 条目，Cell 实例失去引用后被 GC 回收。
- Cell 不持有对 Store 或 Chunk 的引用，生命周期完全由外部控制。

## 与其他模块的关系

```
Cell
 ├── 被 Chunk 持有（cells Map 的 value）
 ├── 被 ChunkedCellStore 管理（通过 Chunk 间接访问）
 ├── styleId 引用 StyleManager 中的样式表
 ├── disabled 状态影响：
 │   ├── 渲染层（TileRenderer）：灰色背景 + 灰色文字
 │   └── 编辑层（编辑器策略）：跳过/阻止编辑
 └── value 被：
     ├── 渲染层：绘制到 Canvas
     ├── 公式引擎：（未来扩展）
     └── 导入/导出：（未来扩展）
```
