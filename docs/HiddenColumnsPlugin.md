# HiddenColumnsPlugin 隐藏列插件

> 参考 [Handsontable HiddenColumns API](https://handsontable.com/docs/javascript-data-grid/api/hidden-columns/) 设计

## 概述

HiddenColumnsPlugin 提供列级别的隐藏/显示能力，与 HiddenRowsPlugin 完全对称。隐藏列后，该列在视图中不可见，但数据仍然保留在工作表中。

## 核心原理

采用 **"宽度=0"方案**，无需维护双坐标体系（realCol/visibleCol）：

```
隐藏列 → 将列宽设为 0，缓存原始宽度
显示列 → 恢复缓存的原始宽度
```

所有坐标计算自然适配宽度为 0 的列：

| 机制 | 说明 |
|------|------|
| `getColX()` / `getColWidth()` | 宽度为 0 的列对布局无贡献 |
| `totalWidth` | 前缀和自然排除 0 宽度列 |
| `colAt()` | 二分查找后 while 循环跳过隐藏列 |
| 渲染循环 | `if (colW <= 0) continue;` 跳过 |
| 表头渲染 | `if (w <= 0) continue;` 跳过 |

## 注册方式

插件在 `main.js` 中自动注册，默认加载：

```js
import { HiddenColumnsPlugin } from "./plugins/HiddenColumnsPlugin.js";
Workbook.registerPlugin("hiddenColumns", HiddenColumnsPlugin);
```

## 初始化配置

通过 `pluginOptions` 传入初始隐藏列：

```js
const workbook = new Workbook(container, {
    data: myData,
    pluginOptions: {
        hiddenColumns: {
            columns: [2, 5, 8]   // 初始隐藏第 2、5、8 列
        }
    }
});
```

### 配置项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `columns` | `number[]` | `[]` | 初始隐藏的列索引列表 |

## API

### 获取插件实例

```js
const hiddenColumns = workbook.getPlugin('hiddenColumns');
```

### 方法

#### `hideColumn(col)`

隐藏指定列。

| 参数 | 类型 | 说明 |
|------|------|------|
| `col` | `number` | 要隐藏的列索引 |

```js
hiddenColumns.hideColumn(2);   // 隐藏第 2 列（C 列）
```

#### `hideColumns(cols)`

批量隐藏多列。

| 参数 | 类型 | 说明 |
|------|------|------|
| `cols` | `number[]` | 要隐藏的列索引数组 |

```js
hiddenColumns.hideColumns([1, 3, 5]);   // 隐藏第 1、3、5 列
```

#### `showColumn(col)`

显示指定列。

| 参数 | 类型 | 说明 |
|------|------|------|
| `col` | `number` | 要显示的列索引 |

```js
hiddenColumns.showColumn(2);   // 显示第 2 列
```

#### `showColumns(cols)`

批量显示多列。

| 参数 | 类型 | 说明 |
|------|------|------|
| `cols` | `number[]` | 要显示的列索引数组 |

```js
hiddenColumns.showColumns([1, 3]);   // 显示第 1、3 列
```

#### `isHidden(col)`

判断指定列是否隐藏。

| 参数 | 类型 | 返回值 |
|------|------|--------|
| `col` | `number` | `boolean` |

```js
hiddenColumns.hideColumn(2);
hiddenColumns.isHidden(2);   // true
hiddenColumns.isHidden(3);   // false
```

#### `getHiddenColumns()`

获取所有隐藏列索引。

| 返回值 | 说明 |
|--------|------|
| `number[]` | 升序排列的隐藏列索引数组 |

```js
hiddenColumns.hideColumns([5, 1, 3]);
hiddenColumns.getHiddenColumns();   // [1, 3, 5]
```

### 属性

| 属性 | 类型 | 只读 | 说明 |
|------|------|:----:|------|
| `active` | `boolean` | ✅ | 插件是否激活 |
| `hiddenColumns` | `number[]` | ✅ | 所有隐藏列索引（升序） |
| `hiddenCount` | `number` | ✅ | 隐藏列数量 |
| `visibleColCount` | `number` | ✅ | 可视列总数（排除隐藏列） |

```js
hiddenColumns.active;           // true
hiddenColumns.hiddenColumns;    // [1, 3, 5]
hiddenColumns.hiddenCount;      // 3
hiddenColumns.visibleColCount;  // 23（假设 MAX_COLS=26）
```

### 生命周期方法

| 方法 | 说明 |
|------|------|
| `enable()` | 启用插件 |
| `disable()` | 禁用插件，清除所有隐藏列，恢复全量显示 |
| `destroy()` | 销毁插件（内部先调用 disable） |

```js
hiddenColumns.disable();   // 所有隐藏列恢复显示
hiddenColumns.enable();    // 重新启用（不会自动恢复之前的隐藏状态）
```

## 钩子（Hooks）

### `afterHideColumn`

列隐藏后触发。

```js
workbook.hooks.addHook('afterHideColumn', (col, hidden) => {
    console.log(`第 ${col} 列已隐藏, hidden=${hidden}`);
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `col` | `number` | 被隐藏的列索引 |
| `hidden` | `boolean` | 固定为 `true` |

### `afterShowColumn`

列显示后触发。

```js
workbook.hooks.addHook('afterShowColumn', (col, hidden) => {
    console.log(`第 ${col} 列已显示, hidden=${hidden}`);
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `col` | `number` | 被显示的列索引 |
| `hidden` | `boolean` | 固定为 `false` |

## 右键菜单

插件注册后，右键菜单自动新增以下菜单项：

| 菜单项 | 可用上下文 | 说明 |
|--------|------------|------|
| 隐藏列 | `cell` / `colHeader` | 隐藏选区覆盖的所有列 |
| 显示列 | `cell` / `colHeader` | 显示选区附近的隐藏列（选区左右各扩展 1 列） |

### 操作流程

1. 选中一列或多列
2. 右键点击 → 选择「隐藏列」
3. 选区覆盖的列全部隐藏
4. 活动单元格自动移至最近的可见列

显示列的逻辑会查找选区左右各 1 列范围内的隐藏列并显示，确保用户能恢复相邻的隐藏列。

## 选区自动调整

隐藏列后，如果当前选区的列被隐藏，插件会自动调整选区：

1. **活动单元格** → 移至最近的可见列（优先向右查找，其次向左）
2. **选区范围** → topCol 和 bottomCol 分别移至最近的可见列
3. **行方向不变** → 只调整列方向

```
隐藏前: 选区 [0,2] → [3,5]，活动单元格 (1,3)
隐藏列 3 后: 选区 [0,2] → [3,6]，活动单元格 (1,4)
```

## 行列操作联动

隐藏列索引在行列操作时自动同步：

| 操作 | 隐藏列索引变化 |
|------|----------------|
| 插入列（atCol） | ≥ atCol 的索引 +1 |
| 删除列（col） | 移除被删列的隐藏状态，> col 的索引 -1 |
| 移动列（from → to） | 使用 `#shiftIndex` 重映射 |

```js
// 初始状态：隐藏列 [2, 5]
hiddenColumns.hideColumns([2, 5]);

// 在第 1 列位置插入列
sheet.insertCol(1);
// 隐藏列自动变为 [3, 6]（原 2→3，原 5→6）

// 删除第 3 列
sheet.deleteCol(3);
// 隐藏列自动变为 [5]（原 3 被删除，原 6→5）
```

## 底层依赖

### RowColManager 列隐藏 API

| 方法 | 说明 |
|------|------|
| `hideColumn(col)` | 隐藏指定列（宽度→0，缓存原始宽度） |
| `showColumn(col)` | 显示指定列（恢复缓存宽度） |
| `isColumnHidden(col)` | 判断列是否隐藏 |
| `getHiddenColumns()` | 获取所有隐藏列索引（升序） |
| `clearHiddenColumns()` | 清除所有隐藏列，恢复全量显示 |
| `hasHiddenColumns` | `boolean` — 隐藏列集合是否非空 |
| `visibleColCount` | `number` — 可视列总数 |

### 渲染层适配

| 文件 | 修改 |
|------|------|
| `TileRenderer.js` | 渲染循环中 `if (colW <= 0) continue;` 跳过隐藏列 |
| `HeaderRenderer.js` | 表头渲染中 `if (w <= 0) continue;` 跳过隐藏列 |
| `RowColManager.js` | `#rawColAt()` 二分查找后 while 循环跳过隐藏列 |

## 与 HiddenRowsPlugin 的对称性

| 维度 | HiddenColumns | HiddenRows |
|------|:---:|:---:|
| 核心原理 | 宽度=0 | 高度=0 |
| 插件名 | `hiddenColumns` | `hiddenRows` |
| 初始配置 | `columns: []` | `rows: []` |
| 钩子 | `afterHideColumn` / `afterShowColumn` | `afterHideRow` / `afterShowRow` |
| 底层存储 | `#hiddenCols` Set | `#hiddenRows` Set |
| 原始尺寸缓存 | `#originalColWidths` Map | `#originalRowHeights` Map |
| 插入联动 | `insertCol` | `insertRow` |
| 删除联动 | `deleteCol` | `deleteRow` |
| 移动联动 | `moveCol` | `moveRow` |

## 完整示例

```js
// 1. 创建工作簿，初始隐藏第 3、7 列
const workbook = new Workbook(container, {
    data: myData,
    pluginOptions: {
        hiddenColumns: { columns: [3, 7] }
    }
});

// 2. 获取插件实例
const hc = workbook.getPlugin('hiddenColumns');

// 3. 查询
hc.isHidden(3);              // true
hc.isHidden(4);              // false
hc.getHiddenColumns();       // [3, 7]
hc.hiddenCount;              // 2
hc.visibleColCount;          // 22（假设 MAX_COLS=24）

// 4. 隐藏列
hc.hideColumn(5);            // 隐藏第 5 列
hc.hideColumns([1, 2]);      // 批量隐藏

// 5. 显示列
hc.showColumn(3);            // 显示第 3 列
hc.showColumns([1, 7]);      // 批量显示

// 6. 监听钩子
workbook.hooks.addHook('afterHideColumn', (col, hidden) => {
    console.log(`列 ${col} 隐藏状态: ${hidden}`);
});
workbook.hooks.addHook('afterShowColumn', (col, hidden) => {
    console.log(`列 ${col} 隐藏状态: ${hidden}`);
});

// 7. 禁用插件（恢复所有隐藏列）
hc.disable();

// 8. 重新启用
hc.enable();
```