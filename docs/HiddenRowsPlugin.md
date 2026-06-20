# HiddenRowsPlugin 隐藏行插件

> 参考 [Handsontable HiddenRows API](https://handsontable.com/docs/javascript-data-grid/api/hidden-rows/) 设计

## 概述

HiddenRowsPlugin 提供行级别的隐藏/显示能力，与 HiddenColumnsPlugin 完全对称。隐藏行后，该行在视图中不可见，但数据仍然保留在工作表中。

## 核心原理

采用 **"高度=0"方案**，无需维护双坐标体系（realRow/visibleRow）：

```
隐藏行 → 将行高设为 0，缓存原始高度
显示行 → 恢复缓存的原始高度
```

所有坐标计算自然适配高度为 0 的行：

| 机制 | 说明 |
|------|------|
| `getRowY()` / `getRowHeight()` | 高度为 0 的行对布局无贡献 |
| `totalHeight` | 前缀和自然排除 0 高度行 |
| `rowAt()` | 二分查找后 while 循环跳过隐藏行 |
| 渲染循环 | `if (rowH <= 0) continue;` 跳过 |
| 表头渲染 | `if (h <= 0) continue;` 跳过 |

## 注册方式

插件在 `main.js` 中自动注册，默认加载：

```js
import { HiddenRowsPlugin } from "./plugins/HiddenRowsPlugin.js";
Workbook.registerPlugin("hiddenRows", HiddenRowsPlugin);
```

## 初始化配置

通过 `pluginOptions` 传入初始隐藏行：

```js
const workbook = new Workbook(container, {
    data: myData,
    pluginOptions: {
        hiddenRows: {
            rows: [2, 5, 8]   // 初始隐藏第 2、5、8 行
        }
    }
});
```

### 配置项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `rows` | `number[]` | `[]` | 初始隐藏的行索引列表 |

## API

### 获取插件实例

```js
const hiddenRows = workbook.getPlugin('hiddenRows');
```

### 方法

#### `hideRow(row)`

隐藏指定行。

| 参数 | 类型 | 说明 |
|------|------|------|
| `row` | `number` | 要隐藏的行索引 |

```js
hiddenRows.hideRow(2);   // 隐藏第 2 行
```

#### `hideRows(rows)`

批量隐藏多行。

| 参数 | 类型 | 说明 |
|------|------|------|
| `rows` | `number[]` | 要隐藏的行索引数组 |

```js
hiddenRows.hideRows([1, 3, 5]);   // 隐藏第 1、3、5 行
```

#### `showRow(row)`

显示指定行。

| 参数 | 类型 | 说明 |
|------|------|------|
| `row` | `number` | 要显示的行索引 |

```js
hiddenRows.showRow(2);   // 显示第 2 行
```

#### `showRows(rows)`

批量显示多行。

| 参数 | 类型 | 说明 |
|------|------|------|
| `rows` | `number[]` | 要显示的行索引数组 |

```js
hiddenRows.showRows([1, 3]);   // 显示第 1、3 行
```

#### `isHidden(row)`

判断指定行是否隐藏。

| 参数 | 类型 | 返回值 |
|------|------|--------|
| `row` | `number` | `boolean` |

```js
hiddenRows.hideRow(2);
hiddenRows.isHidden(2);   // true
hiddenRows.isHidden(3);   // false
```

#### `getHiddenRows()`

获取所有隐藏行索引。

| 返回值 | 说明 |
|--------|------|
| `number[]` | 升序排列的隐藏行索引数组 |

```js
hiddenRows.hideRows([5, 1, 3]);
hiddenRows.getHiddenRows();   // [1, 3, 5]
```

### 属性

| 属性 | 类型 | 只读 | 说明 |
|------|------|:----:|------|
| `active` | `boolean` | ✅ | 插件是否激活 |
| `hiddenRows` | `number[]` | ✅ | 所有隐藏行索引（升序） |
| `hiddenCount` | `number` | ✅ | 隐藏行数量 |
| `visibleRowCount` | `number` | ✅ | 可视行总数（排除隐藏行） |

```js
hiddenRows.active;          // true
hiddenRows.hiddenRows;      // [1, 3, 5]
hiddenRows.hiddenCount;     // 3
hiddenRows.visibleRowCount; // 9997（假设 MAX_ROWS=10000）
```

### 生命周期方法

| 方法 | 说明 |
|------|------|
| `enable()` | 启用插件 |
| `disable()` | 禁用插件，清除所有隐藏行，恢复全量显示 |
| `destroy()` | 销毁插件（内部先调用 disable） |

```js
hiddenRows.disable();   // 所有隐藏行恢复显示
hiddenRows.enable();    // 重新启用（不会自动恢复之前的隐藏状态）
```

## 钩子（Hooks）

### `afterHideRow`

行隐藏后触发。

```js
workbook.hooks.addHook('afterHideRow', (row, hidden) => {
    console.log(`第 ${row} 行已隐藏, hidden=${hidden}`);
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `row` | `number` | 被隐藏的行索引 |
| `hidden` | `boolean` | 固定为 `true` |

### `afterShowRow`

行显示后触发。

```js
workbook.hooks.addHook('afterShowRow', (row, hidden) => {
    console.log(`第 ${row} 行已显示, hidden=${hidden}`);
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `row` | `number` | 被显示的行索引 |
| `hidden` | `boolean` | 固定为 `false` |

## 右键菜单

插件注册后，右键菜单自动新增以下菜单项：

| 菜单项 | 可用上下文 | 说明 |
|--------|------------|------|
| 隐藏行 | `cell` / `rowHeader` | 隐藏选区覆盖的所有行 |
| 显示行 | `cell` / `rowHeader` | 显示选区附近的隐藏行（选区上下各扩展 1 行） |

### 操作流程

1. 选中一行或多行
2. 右键点击 → 选择「隐藏行」
3. 选区覆盖的行全部隐藏
4. 活动单元格自动移至最近的可见行

显示行的逻辑会查找选区上下各 1 行范围内的隐藏行并显示，确保用户能恢复相邻的隐藏行。

## 选区自动调整

隐藏行后，如果当前选区的行被隐藏，插件会自动调整选区：

1. **活动单元格** → 移至最近的可见行（优先向下查找，其次向上）
2. **选区范围** → topRow 和 bottomRow 分别移至最近的可见行
3. **列方向不变** → 只调整行方向

```
隐藏前: 选区 [2,0] → [5,3]，活动单元格 (3,1)
隐藏行 3 后: 选区 [2,0] → [6,3]，活动单元格 (4,1)
```

## 行列操作联动

隐藏行索引在行列操作时自动同步：

| 操作 | 隐藏行索引变化 |
|------|----------------|
| 插入行（atRow） | ≥ atRow 的索引 +1 |
| 删除行（row） | 移除被删行的隐藏状态，> row 的索引 -1 |
| 移动行（from → to） | 使用 `#shiftIndex` 重映射 |

```js
// 初始状态：隐藏行 [2, 5]
hiddenRows.hideRows([2, 5]);

// 在第 1 行位置插入行
sheet.insertRow(1);
// 隐藏行自动变为 [3, 6]（原 2→3，原 5→6）

// 删除第 3 行
sheet.deleteRow(3);
// 隐藏行自动变为 [5]（原 3 被删除，原 6→5）
```

## 底层依赖

### RowColManager 行隐藏 API

| 方法 | 说明 |
|------|------|
| `hideRow(row)` | 隐藏指定行（高度→0，缓存原始高度） |
| `showRow(row)` | 显示指定行（恢复缓存高度） |
| `isRowHidden(row)` | 判断行是否隐藏 |
| `getHiddenRows()` | 获取所有隐藏行索引（升序） |
| `clearHiddenRows()` | 清除所有隐藏行，恢复全量显示 |
| `hasHiddenRows` | `boolean` — 隐藏行集合是否非空 |
| `visibleRowCount` | `number` — 可视行总数 |

### 渲染层适配

| 文件 | 修改 |
|------|------|
| `TileRenderer.js` | 渲染循环中 `if (rowH <= 0) continue;` 跳过隐藏行 |
| `HeaderRenderer.js` | 表头渲染中 `if (h <= 0) continue;` 跳过隐藏行 |
| `RowColManager.js` | `#rawRowAt()` 二分查找后 while 循环跳过隐藏行 |

## 与 HiddenColumnsPlugin 的对称性

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
// 1. 创建工作簿，初始隐藏第 3、7 行
const workbook = new Workbook(container, {
    data: myData,
    pluginOptions: {
        hiddenRows: { rows: [3, 7] }
    }
});

// 2. 获取插件实例
const hr = workbook.getPlugin('hiddenRows');

// 3. 查询
hr.isHidden(3);          // true
hr.isHidden(4);          // false
hr.getHiddenRows();      // [3, 7]
hr.hiddenCount;          // 2
hr.visibleRowCount;      // 9998

// 4. 隐藏行
hr.hideRow(5);           // 隐藏第 5 行
hr.hideRows([1, 2]);     // 批量隐藏

// 5. 显示行
hr.showRow(3);           // 显示第 3 行
hr.showRows([1, 7]);     // 批量显示

// 6. 监听钩子
workbook.hooks.addHook('afterHideRow', (row, hidden) => {
    console.log(`行 ${row} 隐藏状态: ${hidden}`);
});
workbook.hooks.addHook('afterShowRow', (row, hidden) => {
    console.log(`行 ${row} 隐藏状态: ${hidden}`);
});

// 7. 禁用插件（恢复所有隐藏行）
hr.disable();

// 8. 重新启用
hr.enable();
```