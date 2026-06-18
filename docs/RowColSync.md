# RowColSync — 行列同步器

## 概述

`RowColSync` 统一管理行列 insert/delete/move 时所有附属状态的同步。将原来分散在 6 个行列操作方法中的同步逻辑（数组、Map、cellTypes、嵌套表头）收敛到一处，通过 `#remapMapKeys` 和 `#remapCellTypesKeys` 两个通用方法替代原来 6 套独立的移位代码。

## 文件位置

```
src/core/RowColSync.js
```

## 设计意图

- **消除重复**：insert/delete/move 三种操作各自需要同步 6 种附属状态，原来在 `Sheet.js` 中分散为 3×N 组重复逻辑，现已统一。
- **通用化移位**：通过 `shiftFn` 函数模式，`#remapMapKeys` 可处理任意 Map 的键重映射，避免为每种 Map 写一套循环。
- **轴抽象**：通过 `#axis` (`"row"`/`"col"`) 和 `#headers`/`#maps` getter 动态切换操作对象，行/列共享同一套逻辑。
- **独立可测**：从 `Sheet.js` 私有类提取为独立模块后，可 mock Sheet 引用进行单元测试。

## 同步范围

每次行列变更时，`RowColSync` 需同步以下 6 种附属状态：

| 状态 | 类型 | 轴 | 说明 |
|------|------|-----|------|
| `rowHeaders` | `string[]` | 行 | 行头标签数组 |
| `colHeaders` | `string[]` | 列 | 列头标签数组 |
| `rowStyles` | `Map<number, number>` | 行 | 行级样式映射 |
| `colStyles` | `Map<number, number>` | 列 | 列级样式映射 |
| `columnsConfig` | `Map<number, object>` | 列 | 列配置映射 |
| `dataBindings` | `Map<number, Function>` | 列 | 数据绑定映射 |
| `cellTypes` | `Map<string, object>` | 两者 | 单元格类型映射（键格式 `"r,c"`） |
| `nestedHeaders` | `object[][]` | 列 | 嵌套表头（含 colspan） |

## 工作原理

### insert 流程

```
Sheet.insertRow(atRow) / Sheet.insertCol(atCol)
  → RowColSync.insert(atIndex)
    → 1. #headers 数组：splice(atIndex, 0, "")       插入空标签
    → 2. #maps：所有 Map 键 ≥ atIndex 的 +1         向右平移
    → 3. cellTypes："r,c" 键 ≥ atIndex 的 +1         向右平移
    → 4. [仅列] 嵌套表头：扩展目标 colspan 或插入空项
```

### delete 流程

```
Sheet.deleteRow(atRow) / Sheet.deleteCol(atCol)
  → RowColSync.delete(atIndex)
    → 1. #headers 数组：splice(atIndex, 1)            删除一个标签
    → 2. #maps：先 delete(atIndex)，> atIndex 的键 -1  向左平移
    → 3. cellTypes：= atIndex 的删除，> atIndex 的 -1  向左平移
    → 4. [仅列] 嵌套表头：缩减 colspan 或删除该项
```

### move 流程

```
Sheet.moveRow(from, to) / Sheet.moveCol(from, to)
  → RowColSync.move(from, to)
    → 1. #headers 数组：splice(from,1) → splice(to,0,item)  移动标签
    → 2. #maps：所有受影响键按 #calcShiftedIndex 重映射
    → 3. cellTypes：所有受影响键按 #calcShiftedIndex 重映射
    → 4. [仅列] 嵌套表头：展平→移动→重新打包
```

### #calcShiftedIndex 索引计算

```
index === from           → to          （源位置移到目标）
from < to（右移）:
  index ∈ (from, to]     → index - 1   （中间元素左移）
  其他                   → index       （不受影响）
from > to（左移）:
  index ∈ [to, from)     → index + 1   （中间元素右移）
  其他                   → index       （不受影响）
```

## API

### 构造函数

```js
new RowColSync(sheet, "row")   // 行同步器
new RowColSync(sheet, "col")   // 列同步器
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `sheet` | `Sheet` | 所属工作表实例 |
| `axis` | `"row" \| "col"` | 同步轴 |

### 公开方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `insert` | `(atIndex: number) => void` | 在 atIndex 插入行/列时同步所有附属状态 |
| `delete` | `(atIndex: number) => void` | 删除 atIndex 行/列时同步所有附属状态 |
| `move` | `(from: number, to: number) => void` | 从 from 移到 to 时同步所有附属状态 |

### 内部私有方法

| 方法 | 说明 |
|------|------|
| `#headers` (getter) | 根据 axis 返回 `rowHeaders` 或 `colHeaders` 数组 |
| `#maps` (getter) | 根据 axis 返回需同步的 Map 列表 |
| `#insertArrayAt` | 数组插入空元素 |
| `#deleteArrayAt` | 数组删除元素 |
| `#shiftArray` | 数组元素位移 |
| `#remapMapKeys` | Map 键批量重映射 |
| `#remapCellTypesKeys` | cellTypes Map 键批量重映射（处理 `"r,c"` 格式） |
| `#calcShiftedIndex` | 移动操作的索引计算 |
| `#insertNestedHeaderColumn` | [仅列] 插入列时扩展嵌套表头 |
| `#deleteNestedHeaderColumn` | [仅列] 删除列时缩减嵌套表头 |
| `#shiftNestedHeaders` | [仅列] 移动列时平移嵌套表头 |

## 生命周期

每个 `Sheet` 实例在构造时创建两个 `RowColSync` 实例：

```js
// Sheet 构造函数中
this.#rowSync = new RowColSync(this, "row");
this.#colSync = new RowColSync(this, "col");
```

之后每次行列操作时调用对应的同步实例：

```
Sheet.insertRow(n)  → #rowSync.insert(n)
Sheet.insertCol(n)  → #colSync.insert(n)
Sheet.deleteRow(n)  → #rowSync.delete(n)
Sheet.deleteCol(n)  → #colSync.delete(n)
Sheet.moveRow(f, t)  → #rowSync.move(f, t)
Sheet.moveCol(f, t)  → #colSync.move(f, t)
```

## 调用方

| 模块 | 调用方法 | 场景 |
|------|----------|------|
| `Sheet.insertRow()` | `#rowSync.insert(atRow)` | 插入行 |
| `Sheet.insertCol()` | `#colSync.insert(atCol)` | 插入列 |
| `Sheet.deleteRow()` | `#rowSync.delete(atRow)` | 删除行 |
| `Sheet.deleteCol()` | `#colSync.delete(atCol)` | 删除列 |
| `Sheet.moveRow()` | `#rowSync.move(from, to)` | 移动行 |
| `Sheet.moveCol()` | `#colSync.move(from, to)` | 移动列 |

## 提取背景

该模块原为 `Sheet.js` 内部的私有类（~176 行），在「降低 Sheet 复杂度」重构中提取为独立模块 `src/core/RowColSync.js`，与同目录的 `RowColManager.js` 组成行列核心模块组。
