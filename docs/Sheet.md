# Sheet.js - 工作表核心类文档

## 📋 概述

**文件路径**: `src/workbook/Sheet.js`  
**类名**: `Sheet`  
**继承**: `ISheet`（接口实现）  
**设计模式**: Coordinator Pattern（协调者模式） + Facade Pattern（外观模式）

### 核心职责

`Sheet` 类是 Canvas-Excel 系统的**核心工作表实体**，作为外部代码与内部子系统之间的**唯一入口点**。它采用**薄代理（Thin Proxy）**设计，自身不包含业务逻辑，而是将所有操作委派给专职的协调者（Coordinator）和管理器（Manager）。

---

## 🏗️ 架构设计

### 设计理念

```
┌─────────────────────────────────────────────────────────────┐
│                        Sheet (Facade)                       │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │  data    │ styles   │ merges   │operations│   meta   │  │
│  │(数据协调)│(样式协调)│(合并协调)│(操作协调)│(元数据)  │  │
│  └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘  │
│       │          │          │          │          │        │
│  ┌────▼────┐ ┌───▼────┐ ┌──▼────┐ ┌───▼────┐ ┌──▼─────┐ │
│  │CellStore│ │StyleMgr│ │MergeMgr│ │History │ │RowCol  │ │
│  │Selection│ │TypeMgr │ │BatchOp│ │UndoRedo│ │Sync    │ │
│  └─────────┘ └────────┘ └───────┘ └────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 关键特性

1. **100% 向后兼容**: 所有旧 API 完全保留，内部实现已重构
2. **懒初始化**: 协调者在首次访问时创建，避免不必要的内存开销
3. **单一职责**: 每个协调者专注于特定领域（数据、样式、合并、操作、元数据）
4. **事件驱动**: 通过 EventBus 实现松耦合通信

---

## 📦 依赖关系

### 导入的核心模块

```javascript
// 基础设施
import {EventBus} from "./EventBus.js";
import {ChunkedCellStore, SelectionManager, HistoryStack, MergeManager, Cell} from "@/model";
import {RowColManager} from "./RowColManager.js";
import {RowColSync} from "./RowColSync.js";

// 子系统管理器
import {SheetStyleManager} from "./SheetStyleManager.js";
import {ColumnTypeManager} from "./ColumnTypeManager.js";
import {HeaderLabelManager} from "./HeaderLabelManager.js";
import {ConditionalFormatManager} from "./ConditionalFormatManager.js";
import {BatchOperationManager} from "./BatchOperationManager.js";
import {ChartManager} from "./ChartManager.js";

// 协调者（Coordinator）
import {SheetDataCoordinator} from "./SheetDataCoordinator.js";
import {SheetStyleCoordinator} from "./SheetStyleCoordinator.js";
import {SheetMergeCoordinator} from "./SheetMergeCoordinator.js";
import {SheetOperationCoordinator} from "./SheetOperationCoordinator.js";
import {SheetMetaCoordinator} from "./SheetMetaCoordinator.js";

// 接口定义
import {ISheet} from "./ISheet.js";
```

---

## 🔧 公开属性

### 核心属性

| 属性 | 类型 | 描述 | 默认值 |
|------|------|------|--------|
| `name` | `string` | 工作表名称 | 构造函数传入 |
| `visible` | `boolean` | 是否可见 | `true` |
| `readOnly` | `boolean` | 只读模式 | `false` |
| `bus` | `EventBus` | 事件总线实例 | 自动创建 |
| `cellPadding` | `number` | 单元格内边距（px） | `CONFIG.CELL_PADDING` |
| `textOverflowEllipsis` | `string` | 文本溢出省略号 | `CONFIG.TEXT_OVERFLOW_ELLIPSIS` |

### 数据存储属性

| 属性 | 类型 | 描述 |
|------|------|------|
| `cellStore` | `ChunkedCellStore` | 分块单元格数据存储 |
| `selection` | `SelectionManager` | 选区管理器 |
| `history` | `HistoryStack` | 操作历史栈（撤销/重做） |
| `mergeManager` | `MergeManager` | 合并单元格管理器 |
| `rowColManager` | `RowColManager` | 行列尺寸与坐标计算管理器 |
| `batchOp` | `BatchOperationManager` | 批量操作管理器 |
| `chartManager` | `ChartManager \| null` | 图表管理器（延迟初始化） |

### 子系统管理器

| 属性 | 类型 | 描述 |
|------|------|------|
| `styleManager` | `SheetStyleManager` | 样式管理器（8层权重体系） |
| `typeManager` | `ColumnTypeManager` | 列类型管理器 |
| `headerLabels` | `HeaderLabelManager` | 表头标签管理器 |
| `conditionalFormat` | `ConditionalFormatManager` | 条件格式管理器 |
| `rowSync` | `RowColSync` | 行同步器 |
| `colSync` | `RowColSync` | 列同步器 |

### 配置属性

| 属性 | 类型 | 描述 |
|------|------|------|
| `cellConfig` | `Array` | 单元格静态配置数组 |
| `cellsFn` | `Function \| null` | 单元格动态配置函数 |

---

## 🎯 协调者系统（Coordinator Pattern）

### 懒初始化 Getter

所有协调者通过 getter 实现**懒初始化 + 缓存**，仅在首次访问时创建实例：

#### 1. `data` - 数据操作协调者

```javascript
get data() {
    if (!this.#dataCoordinator) {
        this.#dataCoordinator = new SheetDataCoordinator(this);
    }
    return this.#dataCoordinator;
}
```

**职责范围**:
- ✅ 单元格读写 (`setCell`, `getCell`)
- ✅ 数据加载 (`loadData`)
- ✅ 批量数据操作
- ✅ 数据验证与解析

**使用示例**:
```javascript
const sheet = new Sheet("Sheet1");

// 设置单元格值
sheet.data.setCell(0, 0, "Hello");
sheet.data.setCell(0, 1, 100);
sheet.data.setCell(1, 0, "=A1+1"); // 公式

// 获取单元格值
const value = sheet.data.getCell(0, 0); // "Hello"

// 加载二维数组数据
sheet.data.loadData([
    ["Name", "Age", "Salary"],
    ["Alice", 30, 50000],
    ["Bob", 25, 45000]
]);
```

#### 2. `styles` - 样式管理协调者

```javascript
get styles() {
    if (!this.#styleCoordinator) {
        this.#styleCoordinator = new SheetStyleCoordinator(this);
    }
    return this.#styleCoordinator;
}
```

**职责范围**:
- ✅ 8层样式权重体系管理
- ✅ 单元格/行/列/范围样式设置
- ✅ 样式解析与缓存
- ✅ 条件格式规则匹配
- ✅ 数据绑定样式

**8层样式优先级（从低到高）**:
1. **默认样式** - 全局默认值
2. **列样式** - 整列统一样式
3. **行样式** - 整行统一样式
4. **单元格静态配置** - `cellConfig[]`
5. **单元格动态函数** - `cellsFn(row, col)`
6. **条件格式规则** - `conditionalFormat`
7. **数据绑定样式** - `dataBindings`
8. **运行时覆盖** - 最高优先级

**使用示例**:
```javascript
// 设置默认样式
sheet.styles.setDefaultStyle({
    fontSize: 12,
    fontFamily: "Arial",
    align: "center"
});

// 设置列样式（第2列加粗）
sheet.styles.setColStyle(1, { bold: true });

// 设置单个单元格样式
sheet.styles.setCellStyle(0, 0, {
    backgroundColor: "#FFEB3B",
    color: "#000",
    italic: true
});

// 设置范围样式（A1:C3 区域）
sheet.styles.setRangeStyle(0, 0, 2, 2, {
    border: {
        top: { style: "thin", color: "#000" },
        bottom: { style: "thin", color: "#000" },
        left: { style: "thin", color: "#000" },
        right: { style: "thin", color: "#000" }
    }
});

// 解析完整样式（应用8层权重）
const resolvedStyle = sheet.styles.resolveStyle(0, 0);

// 添加条件格式规则（年龄>30显示红色背景）
sheet.styles.addConditionalRule({
    range: { startRow: 1, startCol: 1, endRow: 10, endCol: 1 },
    condition: (value) => value > 30,
    style: { backgroundColor: "#FFCDD2" }
});
```

#### 3. `merges` - 合并单元格协调者

```javascript
get merges() {
    if (!this.#mergeCoordinator) {
        this.#mergeCoordinator = new SheetMergeCoordinator(this);
    }
    return this.#mergeCoordinator;
}
```

**职责范围**:
- ✅ 合并/取消合并单元格
- ✅ 合并区域查询
- ✅ 合并状态检测
- ✅ 合并与样式的协同处理

**使用示例**:
```javascript
// 合并 A1:C1（标题行）
sheet.merges.mergeCells(0, 0, 0, 2);

// 合并 A2:A10（左侧标识列）
sheet.merges.mergeCells(1, 0, 9, 0);

// 查询某个单元格是否被合并
if (sheet.merges.isMergedCell(0, 0)) {
    const mergeInfo = sheet.merges.getMerge(0, 0);
    console.log(`合并区域: ${mergeInfo.start.row},${mergeInfo.start.col} -> ${mergeInfo.end.row},${mergeInfo.end.col}`);
}

// 取消合并
sheet.merges.unmergeCells(0, 0, 0, 2);

// 获取所有合并区域
const allMerges = sheet.merges.getAllMerges();
allMerges.forEach(merge => {
    console.log(`[${merge.start.row},${merge.start_col}] -> [${merge.end.row},${merge.end_col}]`);
});
```

#### 4. `operations` - 操作执行协调者

```javascript
get operations() {
    if (!this.#operationCoordinator) {
        this.#operationCoordinator = new SheetOperationCoordinator(this);
    }
    return this.#operationCoordinator;
}
```

**职责范围**:
- ✅ 行/列插入删除
- ✅ 行/列移动
- ✅ 网格尺寸调整
- ✅ 撤销/重做管理
- ✅ 批量操作事务控制

**使用示例**:
```javascript
// 在第2行前插入一行
sheet.operations.insertRow(1);

// 删除第5列
sheet.operations.deleteCol(4);

// 移动第3列到第1列之前
sheet.operations.moveCol(2, 0);

// 设置网格尺寸（100行 x 26列）
sheet.operations.setGridSize(100, 26);

// 仅设置行数
sheet.operations.setRowCount(200);

// 撤销上次操作
sheet.operations.undo();

// 重做
sheet.operations.redo();

// 批量操作（事务）
sheet.operations.beginBatch("批量更新");
try {
    for (let i = 0; i < 100; i++) {
        sheet.data.setCell(i, 0, `Item ${i}`);
    }
    sheet.operations.endBatch(); // 提交事务
} catch (error) {
    // 错误处理（自动回滚）
}
```

#### 5. `meta` - 元数据协调者

```javascript
get meta() {
    if (!this.#metaCoordinator) {
        this.#metaCoordinator = new SheetMetaCoordinator(this);
    }
    return this.#metaCoordinator;
}
```

**职责范围**:
- ✅ 表头管理（列头/行头/嵌套表头）
- ✅ 列类型定义与验证
- ✅ 列配置管理
- ✅ 数据绑定关系维护

**使用示例**:
```javascript
// 设置列头
sheet.meta.colHeaders = ["姓名", "年龄", "工资", "部门"];

// 获取第2列的列头
const header = sheet.meta.getColHeader(1); // "年龄"

// 设置嵌套表头（多层表头）
sheet.meta.nestedHeaders = [
    [{ label: "基本信息", colspan: 2 }, { label: "薪资信息", colspan: 2 }],
    ["姓名", "年龄", "基本工资", "奖金"]
];

// 获取嵌套表头行数
const nestedHeaderCount = sheet.meta.getNestedHeaderRowCount(); // 2

// 定义列类型
sheet.meta.columnsConfig = [
    { field: "name", type: "text", width: 150 },
    { field: "age", type: "number", width: 80 },
    { field: "salary", type: "currency", width: 120 },
    { field: "department", type: "select", 
      options: ["技术部", "市场部", "人事部"], width: 120 }
];

// 获取列类型实例
const typeInstance = sheet.meta.getColumnTypeInstance(2); // currency 类型

// 格式化单元格值（根据列类型）
const formattedValue = sheet.meta.formatCellValue(2, 50000); // "¥50,000.00"

// 验证单元格值
const isValid = sheet.meta.validateCellValue(1, 25); // 验证年龄列
```

---

## 📊 公开方法 API

### 🔄 数据操作方法

#### `setCell(row, col, value)`
设置单元格值（支持普通值和公式）

```javascript
sheet.setCell(0, 0, "Hello World");
sheet.setCell(1, 0, 42);
sheet.setCell(2, 0, "=SUM(A1:A10)"); // 公式
```

**参数**:
- `row` {`number`} - 行号（从0开始）
- `col` {`number`} - 列号（从0开始）
- `value` {*} - 单元格值（字符串/数字/布尔/公式）

**返回值**: 无

---

#### `disableCell(row, col)`
禁用单元格（不可编辑）

```javascript
sheet.disableCell(0, 0); // 禁用A1单元格
```

---

#### `enableCell(row, col)`
启用单元格

```javascript
sheet.enableCell(0, 0); // 启用A1单元格
```

---

#### `isDisabled(row, col)`
检查单元格是否禁用

```javascript
if (sheet.isDisabled(0, 0)) {
    console.log("该单元格已被禁用");
}
```

**返回值**: {`boolean`}

---

#### `loadData(dataArray)`
加载二维数组数据

```javascript
sheet.loadData([
    ["ID", "Name", "Score"],
    [1, "Alice", 95],
    [2, "Bob", 87],
    [3, "Charlie", 92]
]);
```

**参数**:
- `dataArray` {`Array<Array>`} - 二维数据数组

---

### 🎨 样式管理方法

#### `setDefaultStyle(style)`
设置全局默认样式

```javascript
sheet.setDefaultStyle({
    fontSize: 14,
    fontFamily: "Microsoft YaHei",
    align: "left",
    valign: "middle",
    color: "#333333",
    backgroundColor: "#FFFFFF"
});
```

---

#### `getDefaultStyle()`
获取当前默认样式

```javascript
const defaultStyle = sheet.getDefaultStyle();
console.log(defaultStyle.fontSize); // 14
```

**返回值**: {`Object`} 样式对象

---

#### `setCellStyle(row, col, style)`
设置单个单元格样式

```javascript
sheet.setCellStyle(0, 0, {
    bold: true,
    fontSize: 16,
    color: "#FF5722",
    backgroundColor: "#FFF3E0"
});
```

---

#### `clearCellStyle(row, col)`
清除单元格自定义样式（恢复为默认）

```javascript
sheet.clearCellStyle(0, 0);
```

---

#### `setRowStyle(rowIndex, style)`
设置整行样式

```javascript
sheet.setRowStyle(0, {
    backgroundColor: "#E3F2FD", // 浅蓝色背景
    bold: true,
    align: "center"
}); // 设置第1行为表头样式
```

---

#### `clearRowStyle(rowIndex)`
清除行样式

```javascript
sheet.clearRowStyle(0);
```

---

#### `setColStyle(colIndex, style)`
设置整列样式

```javascript
sheet.setColStyle(0, {
    width: 200,
    align: "center",
    bold: true
}); // 第1列居中加粗
```

---

#### `clearColStyle(colIndex)`
清除列样式

```javascript
sheet.clearColStyle(0);
```

---

#### `setRangeStyle(startRow, startCol, endRow, endCol, style)`
设置矩形区域的统一样式

```javascript
// 设置 A1:D10 区域边框
sheet.setRangeStyle(0, 0, 9, 3, {
    border: {
        top: { style: "medium", color: "#000000" },
        bottom: { style: "medium", color: "#000000" },
        left: { style: "medium", color: "#000000" },
        right: { style: "medium", color: "#000000" }
    }
});
```

---

#### `clearRangeStyle(startRow, startCol, endRow, endCol)`
清除区域样式

```javascript
sheet.clearRangeStyle(0, 0, 9, 3);
```

---

#### `batchStyleUpdate(updates)`
批量更新样式（性能优化）

```javascript
sheet.batchStyleUpdate([
    { row: 0, col: 0, style: { bold: true } },
    { row: 0, col: 1, style: { italic: true } },
    { row: 1, col: 0, style: { color: "red" } }
]);
```

**参数**:
- `updates` {`Array<{row, col, style}>`} - 样式更新数组

---

#### `getCellStyle(row, col)`
获取单元格当前样式（未合并8层权重）

```javascript
const style = sheet.getCellStyle(0, 0);
console.log(style.bold); // true/false
```

**返回值**: {`Object \| null`}

---

#### `resolveStyle(row, col)` ⭐ **推荐**
解析完整样式（应用8层权重体系）

```javascript
const fullStyle = sheet.resolveStyle(0, 0);
/*
返回值示例:
{
    fontSize: 12,           // 来自默认样式
    fontFamily: "Arial",    // 来自默认样式
    bold: true,             // 来自单元格自定义
    backgroundColor: "#FFEB3B", // 来自条件格式
    border: {...},          // 来自范围样式
    ...
}
*/
```

**返回值**: {`Object`} 完整样式对象

---

#### `addConditionalRule(rule)`
添加条件格式规则

```javascript
sheet.addConditionalRule({
    range: { startRow: 1, startCol: 2, endRow: 100, endCol: 2 }, // B2:B101
    condition: (value) => value > 50000,
    style: {
        backgroundColor: "#C8E6C9", // 绿色背景
        color: "#2E7D32",           // 深绿色文字
        bold: true
    },
    priority: 1
});
```

**参数**:
- `rule` {`Object`} 规则对象
  - `range` {`Object`} 应用范围 `{startRow, startCol, endRow, endCol}`
  - `condition` {`Function`} 判断函数 `(value) => boolean`
  - `style` {`Object`} 匹配时应用的样式
  - `priority` {`number`} 优先级（数字越大优先级越高）

---

#### `matchConditionalStyle(row, col)`
检查并返回匹配的条件格式样式

```javascript
const conditionalStyle = sheet.matchConditionalStyle(5, 2);
if (conditionalStyle) {
    console.log("匹配到条件格式:", conditionalStyle);
}
```

**返回值**: {`Object \| null`}

---

### 🔗 合并单元格方法

#### `mergeCells(startRow, startCol, endRow, endCol)`
合并单元格区域

```javascript
// 合并标题行 A1:D1
sheet.mergeCells(0, 0, 0, 3);

// 合并左侧标识列 A2:A20
sheet.mergeCells(1, 0, 19, 0);
```

**注意**: 合并后的区域以左上角单元格为准，其他单元格内容将被保留但不可见

---

#### `unmergeCells(startRow, startCol, endRow, endCol)`
取消合并

```javascript
sheet.unmergeCells(0, 0, 0, 3);
```

---

#### `getMerge(row, col)`
获取单元格所属的合并信息

```javascript
const mergeInfo = sheet.getMerge(0, 0);
if (mergeInfo) {
    console.log(`合并区域: (${mergeInfo.start.row},${mergeInfo.start.col}) -> (${mergeInfo.end.row},${mergeInfo.end.col})`);
    console.log(`主单元格: (${mergeInfo.start.row},${mergeInfo.start.col})`);
}
```

**返回值**: {`Object \| null`}
- `start`: {`{row, col}`} 合并区域左上角
- `end`: {`{row, col}`} 合并区域右下角

---

#### `isMergeTopLeft(row, col)`
检查是否为合并区域的主单元格（左上角）

```javascript
if (sheet.isMergeTopLeft(0, 0)) {
    console.log("这是合并区域的主单元格");
}
```

**返回值**: {`boolean`}

---

#### `isMergedCell(row, col)`
检查单元格是否在合并区域内

```javascript
if (sheet.isMergedCell(1, 0)) {
    console.log("此单元格属于某个合并区域");
}
```

**返回值**: {`boolean`}

---

#### `getAllMerges()`
获取所有合并区域

```javascript
const allMerges = sheet.getAllMerges();
console.log(`共有 ${allMerges.length} 个合并区域`);

allMerges.forEach((merge, index) => {
    console.log(`${index + 1}. [${merge.start_row},${merge.start_col}] -> [${merge.end_row},${merge.end_col}]`);
});
```

**返回值**: {`Array<Object>`}

---

### 📐 行列操作方法

#### `insertRow(index, count = 1)`
在指定位置插入行

```javascript
// 在第3行前插入1行
sheet.insertRow(2);

// 在第5行前插入3行
sheet.insertRow(4, 3);
```

**参数**:
- `index` {`number`} 插入位置（从0开始）
- `count` {`number`} 插入行数，默认1

---

#### `insertCol(index, count = 1)`
在指定位置插入列

```javascript
// 在第2列前插入1列
sheet.insertCol(1);

// 在第A列前插入2列
sheet.insertCol(0, 2);
```

---

#### `deleteRow(index, count = 1)`
删除指定位置的行

```javascript
// 删除第3行
sheet.deleteRow(2);

// 删除第5-7行（连续3行）
sheet.deleteRow(4, 3);
```

⚠️ **警告**: 如果删除的行包含合并单元格，可能导致合并关系异常

---

#### `deleteCol(index, count = 1)`
删除指定位置的列

```javascript
// 删除第B列
sheet.deleteCol(1);
```

---

#### `moveRow(fromIndex, toIndex)`
移动行到新位置

```javascript
// 将第3行移动到第1行位置
sheet.moveRow(2, 0);
```

---

#### `moveCol(fromIndex, toIndex)`
移动列到新位置

```javascript
// 将第C列移动到第A列位置
sheet.moveCol(2, 0);
```

---

#### `setRowCount(count)`
设置总行数

```javascript
sheet.setRowCount(1000); // 设置为1000行
```

---

#### `setColCount(count)`
设置总列数

```javascript
sheet.setColCount(26); // 设置为26列（A-Z）
```

---

#### `setGridSize(rows, cols)`
同时设置行列数

```javascript
sheet.setGridSize(1000, 26); // 1000行 x 26列
```

---

### ❄️ 冻结窗格方法

#### `fixedRowsTop` (getter/setter)
冻结顶部行数

```javascript
// 冻结前2行（通常用于表头）
sheet.fixedRowsTop = 2;

// 获取冻结行数
const frozenRows = sheet.fixedRowsTop; // 2
```

**缓存优化**: 当值变化时自动失效高度缓存

---

#### `fixedColumnsStart` (getter/setter)
冻结左侧列数

```javascript
// 冻结前1列（通常用于行号列）
sheet.fixedColumnsStart = 1;

// 获取冻结列数
const frozenCols = sheet.fixedColumnsStart; // 1
```

---

#### `frozenRowsHeight` (getter only)
获取冻结行的总高度（像素）⭐ **只读**

```javascript
const height = sheet.frozenRowsHeight; // 例如：56 (px)
```

**性能优化**: 使用 `RowColManager` 的缓存坐标，O(1) 时间复杂度

---

#### `frozenColsWidth` (getter only)
获取冻结列的总宽度（像素）⭐ **只读**

```javascript
const width = sheet.frozenColsWidth; // 例如：60 (px)
```

---

#### `invalidateFreezeCache()`
手动使冻结尺寸缓存失效

```javascript
sheet.invalidateFreezeCache();
// 下次访问 frozenRowsHeight / frozenColsWidth 时会重新计算
```

**适用场景**:
- 手动修改了行高/列宽后
- 需要强制刷新冻结区域时

---

### 📋 表头管理方法

#### `colHeaders` (getter/setter)
列头标签数组

```javascript
// 设置列头
sheet.colHeaders = ["姓名", "年龄", "工资", "入职日期"];

// 获取列头
const headers = sheet.colHeaders;
console.log(headers[0]); // "姓名"
```

---

#### `getColHeader(colIndex)`
获取指定列的列头文本

```javascript
const header = sheet.getColHeader(2); // "工资"
```

**返回值**: {`string`}

---

#### `getColHeaderStyle(colIndex)`
获取列表头的样式

```javascript
const style = sheet.getColHeaderStyle(0);
console.log(style.backgroundColor); // "#E3F2FD"
```

**返回值**: {`Object`}

---

#### `rowHeaders` (getter/setter)
行头标签数组

```javascript
sheet.rowHeaders = ["序号", "数据1", "数据2", "数据3"];
```

---

#### `getRowHeader(rowIndex)`
获取指定行的行头文本

```javascript
const rowHeader = sheet.getRowHeader(0); // "序号"
```

---

#### `getRowHeaderStyle(rowIndex)`
获取行表头的样式

```javascript
const style = sheet.getRowHeaderStyle(0);
```

---

#### `nestedHeaders` (getter/setter)
嵌套表头（多层表头）

```javascript
sheet.nestedHeaders = [
    [
        { label: "基本信息", colspan: 2, rowspan: 2 },
        { label: "薪资信息", colspan: 2 },
        { label: "备注", rowspan: 2 }
    ],
    [
        "姓名",
        "年龄",
        "基本工资",
        "绩效奖金",
        "特殊情况说明"
    ]
];
```

**结构说明**:
- 二维数组，每个元素代表一行表头
- 支持对象形式 `{label, colspan, rowspan}` 用于跨行跨列
- 字符串形式表示普通单元格

---

#### `getNestedHeaderRowCount()`
获取嵌套表头的行数

```javascript
const count = sheet.getNestedHeaderRowCount(); // 2
```

**返回值**: {`number`}

---

#### `getNestedColHeader(rowIndex, colIndex)`
获取嵌套表头中指定位置的单元格

```javascript
const cell = sheet.getNestedColHeader(0, 0);
console.log(cell.label); // "基本信息"
console.log(cell.colspan); // 2
console.log(cell.rowspan); // 2
```

**返回值**: {`Object \| string`}

---

#### `rowHeaderWidth` (getter/setter)
行头宽度（像素）

```javascript
sheet.rowHeaderWidth = 60; // 设置行头宽度为60px
const width = sheet.rowHeaderWidth; // 60
```

---

#### `headerHeight` (getter/setter)
表头高度（像素）

```javascript
sheet.headerHeight = 35; // 设置表头高度为35px
const height = sheet.headerHeight; // 35
```

---

#### `getHeaderHeight(rowIndex?)`
获取指定行表头的高度

```javascript
const height = sheet.getHeaderHeight(0); // 第1行表头的高度
const defaultHeight = sheet.getHeaderHeight(); // 默认表头高度
```

**返回值**: {`number`}

---

#### `getHeaderWidth(colIndex?)`
获取指定列表头的宽度

```javascript
const width = sheet.getHeaderWidth(0); // 第1列表头的宽度
```

**返回值**: {`number`}

---

### 🔢 列类型与配置方法

#### `columnsConfig` (getter)
获取列配置数组

```javascript
const config = sheet.columnsConfig;
/*
返回值示例:
[
    { field: "name", type: "text", width: 150 },
    { field: "age", type: "number", width: 80 },
    { field: "salary", type: "currency", width: 120 }
]
*/
```

**返回值**: {`Array<Object>`}

---

#### `getColumnConfig(colIndex)`
获取指定列的配置

```javascript
const config = sheet.getColumnConfig(2);
console.log(config.type); // "currency"
console.log(config.width); // 120
```

**返回值**: {`Object \| undefined`}

---

#### `getColumnType(colIndex)`
获取列的类型名称

```javascript
const type = sheet.getColumnType(2); // "currency"
```

**返回值**: {`string`}

---

#### `getColumnTypeInstance(colIndex)`
获取列类型的实例对象（包含格式化/验证/解析方法）

```javascript
const typeInstance = sheet.getColumnTypeInstance(2);

// 格式化显示值
const formatted = typeInstance.format(50000); // "¥50,000.00"

// 验证输入值
const isValid = typeInstance.validate("abc"); // false

// 解析用户输入
const parsed = typeInstance.parse("50,000"); // 50000
```

**返回值**: {`ColumnType`}

支持的内置类型:
- `text` - 文本
- `number` - 数字
- `currency` - 货币
- `percent` - 百分比
- `date` - 日期
- `select` - 下拉选择
- `checkbox` - 复选框

---

#### `getCellTypeInstance(row, col)`
获取单元格的类型实例（考虑动态配置）

```javascript
const instance = sheet.getCellTypeInstance(5, 2);
```

**返回值**: {`ColumnType`}

---

#### `applyColumnsConfig(configs)`
批量应用列配置

```javascript
sheet.applyColumnsConfig([
    { col: 0, field: "id", type: "number", width: 80 },
    { col: 1, field: "name", type: "text", width: 150 },
    { col: 2, field: "salary", type: "currency", width: 120, 
      options: { symbol: "$", decimals: 2 } }
]);
```

**参数**:
- `configs` {`Array<{col, ...config}>`} 列配置数组

---

#### `formatCellValue(row, col, rawValue?)`
根据列类型格式化单元格值

```javascript
const formatted = sheet.formatCellValue(2, 50000); // "¥50,000.00"
const textFormatted = sheet.formatCellValue(1, "Hello"); // "Hello"
```

**返回值**: {`string`}

---

#### `validateCellValue(row, col, value)`
验证单元格值是否符合列类型要求

```javascript
const result = sheet.validateCellValue(2, "abc"); // { valid: false, message: "..." }
const result2 = sheet.validateCellValue(2, 50000); // { valid: true }
```

**返回值**: {`{valid: boolean, message?: string}`}

---

#### `parseCellValue(row, col, inputValue)`
解析用户输入的值为标准格式

```javascript
const parsed = sheet.parseCellValue(2, "50,000"); // 50000 (数字)
const dateParsed = sheet.parseCellValue(3, "2024-01-15"); // Date 对象
```

**返回值**: {*}

---

### 🎭 渲染与撤销/重做方法

#### `render(ctx, viewport)`
渲染工作表到 Canvas 上下文

```javascript
const canvas = document.getElementById("sheet-canvas");
const ctx = canvas.getContext("2d");

const viewport = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    startRow: 0,
    startCol: 0,
    visibleRows: 20,
    visibleCols: 10
};

sheet.render(ctx, viewport);
```

**参数**:
- `ctx` {`CanvasRenderingContext2D`} Canvas 2D上下文
- `viewport` {`Object`} 视口信息

---

#### `undo()`
撤销上一步操作

```javascript
sheet.undo();
```

**前提**: 必须在操作时记录历史（通过 `beginBatch/endBatch` 或自动记录）

---

#### `redo()`
重做已撤销的操作

```javascript
sheet.redo();
```

---

#### `beginBatch(description)`
开始批量操作事务

```javascript
sheet.beginBatch("导入数据");
try {
    // 一系列操作...
} finally {
    sheet.endBatch();
}
```

**参数**:
- `description` {`string`} 操作描述（用于历史记录）

---

#### `endBatch()`
结束批量操作事务

```javascript
sheet.endBatch(); // 提交所有操作为一个历史记录点
```

---

### 🔍 辅助方法

#### `toRealCol(visibleCol)`
将可见列索引转换为实际列索引（考虑隐藏列）

```javascript
const realCol = sheet.toRealCol(5); // 可能返回 7（如果前面有2列隐藏）
```

**返回值**: {`number`}

---

#### `toVisibleCol(realCol)`
将实际列索引转换为可见列索引

```javascript
const visibleCol = sheet.toVisibleCol(7); // 可能返回 5
```

**返回值**: {`number`}

---

#### `invalidateAll()`
标记整个工作表需要重新渲染

```javascript
sheet.invalidateAll(); // 触发完全重绘
```

**触发事件**: `SHEET_EVENTS.INVALIDATE_ALL`

---

#### `_invalidateCellInternal(r, c)`
标记单个单元格需要重绘（内部方法）

```javascript
sheet._invalidateCellInternal(5, 3); // 重绘 F6 单元格
```

**触发事件**: `SHEET_EVENTS.INVALIDATE_CELL`

---

#### `_ensureWritable()`
检查工作表是否可写（内部方法）

```javascript
if (!sheet._ensureWritable()) {
    console.warn("工作表处于只读模式");
    return;
}
```

**返回值**: {`boolean`}

---

#### `cellDataAccessor` (getter)
获取单元格数据访问器（统一的数据读取接口）⭐ **高级API**

```javascript
const accessor = sheet.cellDataAccessor;

// 读取单个单元格值
const value = accessor.getValue(0, 0);

// 读取矩阵数据（范围查询）
const matrix = accessor.getValueMatrix(0, 0, 10, 5); // A1:F11 区域

// 遍历所有非空单元格
accessor.forEach((value, row, col) => {
    console.log(`[${row},${col}] = ${value}`);
});
```

**返回值**: {`CellDataAccessor`}

**用途**:
- FormulaEngine/FormulaEvaluator 读取公式引用的单元格
- ExportFilePlugin 导出数据
- ImportFilePlugin 导入数据
- 自定义插件开发

---

## 📌 使用场景示例

### 场景1：创建基础表格

```javascript
import { Sheet } from "@/workbook/Sheet.js";

// 创建工作表
const sheet = new Sheet("员工信息");

// 设置列头
sheet.colHeaders = ["工号", "姓名", "部门", "职位", "入职日期", "月薪"];

// 设置列宽和类型
sheet.applyColumnsConfig([
    { col: 0, width: 100, type: "text" },     // 工号
    { col: 1, width: 120, type: "text" },     // 姓名
    { col: 2, width: 100, type: "select", options: ["技术部", "市场部", "人事部"] },
    { col: 3, width: 120, type: "select", options: ["工程师", "经理", "专员"] },
    { col: 4, width: 120, type: "date" },     // 入职日期
    { col: 5, width: 120, type: "currency" }  // 月薪
]);

// 加载数据
sheet.loadData([
    ["EMP001", "张三", "技术部", "工程师", "2020-03-15", 25000],
    ["EMP002", "李四", "市场部", "经理", "2019-07-01", 35000],
    ["EMP003", "王五", "人事部", "专员", "2021-11-20", 18000]
]);

// 设置表头样式
for (let c = 0; c < 6; c++) {
    sheet.setColStyle(c, {
        backgroundColor: "#1976D2",
        color: "#FFFFFF",
        bold: true,
        align: "center"
    });
}

// 冻结首行（表头）
sheet.fixedRowsTop = 1;
```

### 场景2：财务报表（带条件格式）

```javascript
const sheet = new Sheet("Q4财报");

// 设置嵌套表头
sheet.nestedHeaders = [
    [
        { label: "收入项目", colspan: 3 },
        { label: "支出项目", colspan: 3 },
        { label: "净利润", rowspan: 2 }
    ],
    ["产品销售", "服务收入", "其他收入", "人力成本", "运营费用", "税费"]
];

// 加载财务数据
sheet.loadData([
    [1000000, 200000, 50000, 600000, 300000, 150000],
    [1200000, 250000, 60000, 650000, 320000, 180000],
    [900000, 180000, 40000, 580000, 280000, 130000]
]);

// 添加条件格式：净利润 < 200000 显示红色
sheet.addConditionalRule({
    range: { startRow: 1, startCol: 6, endRow: 3, endCol: 6 },
    condition: (value) => value < 200000,
    style: {
        backgroundColor: "#FFCDD2",
        color: "#C62828",
        bold: true
    }
});

// 合并标题行
sheet.mergeCells(0, 0, 0, 2); // 收入项目
sheet.mergeCells(0, 3, 0, 5); // 支出项目
sheet.mergeCells(0, 6, 1, 6); // 净利润（跨2行）
```

### 场景3：数据导入与导出

```javascript
const sheet = new Sheet("导入数据");

// 从 Excel 文件导入
const importPlugin = new ImportFilePlugin(sheet);
await importPlugin.init();
await plugin.importFromFile(file);

// 处理数据...
sheet.data.setCell(0, 0, "处理完成");

// 导出到 Excel
const exportPlugin = new ExportFilePlugin(sheet);
await exportPlugin.init();
const blob = await exportPlugin.exportAsBlob("xlsx", {
    nestedHeaders: true,
    cellStyles: true
});

// 下载文件
exportPlugin.downloadFile("processed_data.xlsx");
```

---

## ⚠️ 注意事项

### 性能优化建议

1. **批量操作使用事务**
   ```javascript
   // ❌ 不推荐：每次操作都记录历史
   for (let i = 0; i < 1000; i++) {
       sheet.data.setCell(i, 0, `Item ${i}`);
   }

   // ✅ 推荐：使用批量事务
   sheet.operations.beginBatch("初始化数据");
   try {
       for (let i = 0; i < 1000; i++) {
           sheet.data.setCell(i, 0, `Item ${i}`);
       }
       sheet.operations.endBatch();
   } catch (e) {
       // 错误处理
   }
   ```

2. **避免频繁调用 `resolveStyle`**
   ```javascript
   // ❌ 不推荐：每个单元格都调用
   cells.forEach(cell => {
       const style = sheet.resolveStyle(cell.row, cell.col); // O(n*m)
   });

   // ✅ 推荐：批量获取或缓存结果
   ```

3. **合理使用冻结窗格**
   - 冻结过多行/列会影响滚动性能
   - 建议冻结行数 ≤ 5，列数 ≤ 3

### 常见问题

**Q: 如何判断单元格是否有公式？**
```javascript
import { FormulaEngine } from "@/formula/FormulaEngine.js";
const engine = new FormulaEngine(workbook);
const isFormula = FormulaEngine.isFormula(sheet.cellStore.get(0, 0).value);
```

**Q: 如何监听单元格变化？**
```javascript
sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, ({ r, c, oldValue, newValue }) => {
    console.log(`单元格 [${r},${c}] 变化: ${oldValue} -> ${newValue}`);
});
```

**Q: 如何实现只读工作表？**
```javascript
sheet.readOnly = true;
// 所有编辑操作会被阻止
```

**Q: 如何自定义单元格渲染？**
```javascript
sheet.cellsFn = (row, col) => {
    if (row === 0) {
        return { // 表头行特殊样式
            render: (ctx, rect, cell) => {
                // 自定义绘制逻辑
            }
        };
    }
    return null; // 使用默认渲染
};
```

---

## 🔗 相关模块

### 核心依赖

| 模块 | 路径 | 用途 |
|------|------|------|
| `ChunkedCellStore` | `@/model/ChunkedCellStore.js` | 分块存储单元格数据 |
| `SelectionManager` | `@/model/SelectionManager.js` | 管理选区状态 |
| `HistoryStack` | `@/model/HistoryStack.js` | 撤销/重做栈 |
| `MergeManager` | `@/model/MergeManager.js` | 合并单元格管理 |
| `RowColManager` | `@/model/grid/RowColManager.js` | 行列坐标计算 |
| `EventBus` | `@/core/EventBus.js` | 事件总线 |

### 协调者模块

| 协调者 | 路径 | 职责 |
|--------|------|------|
| `SheetDataCoordinator` | `./coordinators/SheetDataCoordinator.js` | 数据读写操作 |
| `SheetStyleCoordinator` | `./coordinators/SheetStyleCoordinator.js` | 样式管理与解析 |
| `SheetMergeCoordinator` | `./coordinators/SheetMergeCoordinator.js` | 合并单元格操作 |
| `SheetOperationCoordinator` | `./coordinators/SheetOperationCoordinator.js` | 行列增删改操作 |
| `SheetMetaCoordinator` | `./coordinators/SheetMetaCoordinator.js` | 表头/列类型/配置管理 |

### 管理器模块

| 管理器 | 路径 | 用途 |
|--------|------|------|
| `SheetStyleManager` | `./managers/SheetStyleManager.js` | 8层样式权重计算 |
| `ColumnTypeManager` | `./managers/ColumnTypeManager.js` | 列类型注册与管理 |
| `HeaderLabelManager` | `./managers/HeaderLabelManager.js` | 表头标签管理 |
| `ConditionalFormatManager` | `./managers/ConditionalFormatManager.js` | 条件格式规则引擎 |
| `BatchOperationManager` | `./managers/BatchOperationManager.js` | 批量操作优化 |

### 接口定义

| 接口 | 路径 | 说明 |
|------|------|------|
| `ISheet` | `./interfaces/ISheet.js` | Sheet 类必须实现的接口契约 |

---

## 📝 版本历史

### v2.0+ (当前版本)

**重大重构**:
- ✅ 引入 Coordinator Pattern 分离关注点
- ✅ 实现 ISheet 接口保证 API 稳定性
- ✅ 懒初始化协调者提升性能
- ✅ 100% 向后兼容旧版 API
- ✅ 新增 CellDataAccessor 统一数据访问接口
- ✅ 优化冻结窗格缓存机制

**新增功能**:
- 🆕 8层样式权重体系
- 🆕 条件格式支持
- 🆕 数据绑定样式
- 🆕 动态列类型系统
- 🆕 嵌套表头支持
- 🆕 批量操作事务控制

### v1.x (旧版本)

- 单体架构，所有逻辑集中在 Sheet 类中
- 无接口约束，API 可能随意变更
- 无协调者分层，代码耦合度高

---

## 📄 许可证

MIT License

---

## 👥 贡献指南

如需扩展 Sheet 功能，请遵循以下步骤：

1. **确定功能归属**
   - 数据操作 → `SheetDataCoordinator`
   - 样式相关 → `SheetStyleCoordinator`
   - 合并操作 → `SheetMergeCoordinator`
   - 行列变更 → `SheetOperationCoordinator`
   - 元数据/配置 → `SheetMetaCoordinator`

2. **实现协调者方法**
   ```javascript
   // 在对应的 Coordinator 中添加
   yourNewMethod(params) {
       // 业务逻辑实现
       return result;
   }
   ```

3. **在 Sheet 中暴露代理**
   ```javascript
   yourNewMethod(...args) {
       return this.relevantCoordinator.yourNewMethod(...args);
   }
   ```

4. **编写单元测试**
   - 参考 `tests/workbook/` 目录下的测试文件
   - 确保新旧 API 兼容性

5. **更新本文档**
   - 添加新方法的说明和使用示例

---

## 📞 技术支持

如有问题，请参考：
- [API 文档](./api.md)
- [架构设计文档](../architecture.md)
- [最佳实践指南](../best-practices.md)
- [常见问题 FAQ](../faq.md)

---

**最后更新时间**: 2026-07-12  
**文档版本**: v2.0.0  
**维护者**: Core Team