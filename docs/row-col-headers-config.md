# 行列头与行列尺寸配置

本文档涵盖 5 个核心配置项：`rowHeaderWidth`、`rowHeaders`、`rowHeights`、`colHeaders`、`colWidths`，控制表格的行列头显示及行列尺寸。

---

## 配置概览

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `rowHeaderWidth` | `number` | `46` (HEADER_WIDTH) | 行头列宽度（px），控制左侧行号列的宽度 |
| `rowHeaders` | `true`\|`string[]`\|`Function`\|`null` | `true` | 行头标签，`true` 为自动数字 "1,2,3..." |
| `rowHeights` | `number`\|`number[]` | `28` (DEFAULT_ROW_HEIGHT) | 行高（px），支持统一值或逐行配置 |
| `colHeaders` | `true`\|`string[]`\|`Function`\|`null` | `true` | 列头标签，`true` 为自动字母 "A,B,C..." |
| `colWidths` | `number`\|`number[]` | `100` (DEFAULT_COL_WIDTH) | 列宽（px），支持统一值或逐列配置 |

### 相关常量

所有默认值定义在 `src/constants/config.js` 中：

```
DEFAULT_COL_WIDTH: 100,      // 默认列宽
DEFAULT_ROW_HEIGHT: 28,      // 默认行高
HEADER_WIDTH: 46,            // 默认行头列宽度
HEADER_HEIGHT: 28,           // 每层列头行高度
MIN_COL_WIDTH: 30,           // 列最小宽度（拖拽调整不可低于此值）
MIN_ROW_HEIGHT: 10,          // 行最小高度（拖拽调整不可低于此值）
RESIZE_HIT_AREA: 5,          // 行列调整的命中检测区域（px）
```

---

## 一、rowHeaderWidth — 行头列宽度

控制表格左侧行头列（显示行号或自定义标签的竖列）的像素宽度。

### 语法

```js
const wb = new Workbook("grid", {
    sheets:{
        name:"Sheet1",
        rowHeaderWidth: 120,  // 行头列宽度 = 120px
    }
   
});
```

### 取值说明

| 值 | 效果 |
|----|------|
| `120` | 行头列宽度 120px |
| 不配置 | 使用默认值 `HEADER_WIDTH`（46px） |
| `null` / `undefined` | 同"不配置"，回退到默认值 |

### 动态修改当前激活的sheet

```js
wb.updateSettings({ rowHeaderWidth: 80 });
```

### 内部机制

- 存储位置：`sheet.rowHeaderWidth`
- 读取入口：`sheet.getHeaderWidth()` → `return this.rowHeaderWidth ?? CONFIG.HEADER_WIDTH`
- 渲染时影响行头列绘制宽度、左上角交叉区域宽度，以及数据区域的水平起始偏移

### 完整示例

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        rowHeaderWidth: 120,  // 行头列宽度 = 120px

        data: [
            ["张三", 25, "北京"],
            ["李四", 30, "上海"],
        ],
        rowHeaders: ["姓名", "年龄", "城市"],  // 中文行头
        rowHeaderWidth: 80,                    // 加宽以适应中文
        colHeaders: ["Name", "Age", "City"],
    }
});
```

---

## 二、rowHeaders — 行头标签

控制表格左侧行头列显示的标签文字。

### 语法

```js
// 方式一：自动数字（默认）
rowHeaders: true,
// 结果：行头显示 "1", "2", "3", "4" ...

// 方式二：自定义字符串数组
rowHeaders: ["姓名", "年龄", "城市"],
// 结果：第0行="姓名"，第1行="年龄"，第2行="城市"，第3行起回退为 "4"...

// 方式三：函数动态生成
rowHeaders: (row) => `第${row + 1}行`,
// 结果：第0行="第1行"，第1行="第2行" ...

// 方式四：关闭行头
rowHeaders: false,  // 或 null，不显示行头标签
```

### 取值说明

| 值 | 效果 |
|----|------|
| `true` | 自动生成数字标签（"1", "2", "3" ...） |
| `string[]` | 使用数组中的字符串，索引越界则回退到默认数字 |
| `Function(row)` | 每行调用，参数 `row` 为行号（从 0 开始），返回值作为标签 |
| `false` / `null` | 不显示行头 |

### 动态修改当前激活的sheet

```js
wb.updateSettings({ rowHeaders: ["行1", "行2", "行3"] });
```

### 内部机制

```js
// 解析优先级：true/null → 默认数字  |  Array → 按索引取值  |  Function → 函数调用
#resolveHeader(config, index, defaultFn) {
    if (config === true || config == null) return defaultFn(index);
    if (Array.isArray(config)) return index < config.length ? config[index] : defaultFn(index);
    if (typeof config === "function") return config(index);
    return defaultFn(index);
}

// 行头默认函数：(i) => String(i + 1)   →   "1", "2", "3" ...
```

---

## 三、rowHeights — 行高配置

控制每一行的高度，支持统一值和逐行配置两种模式。

### 语法

```js
// 模式一：统一行高
rowHeights: 90,
// 结果：所有已分配行高度均为 90px

// 模式二：逐行配置
rowHeights: [30, 50, 90],
// 结果：第0行=30px，第1行=50px，第2行=90px，第3行起使用默认值 28px
```

### 取值说明

| 值 | 效果 |
|----|------|
| `number` | 所有已分配行统一使用该高度，未分配行使用 `DEFAULT_ROW_HEIGHT`（28px） |
| `number[]` | 按索引逐行设置高度，数组长度内的行使用对应值，超出的行使用默认值 |
| 不配置 | 所有行使用默认值 `DEFAULT_ROW_HEIGHT`（28px） |

### 动态修改当前激活的sheet

```js
// 统一高度
wb.updateSettings({ rowHeights: 50 });

// 逐行高度
wb.updateSettings({ rowHeights: [25, 40, 35, 60] });
```

### 运行时操作

也可以通过 `RowColManager` 直接操作：

```js
const sheet = wb.getActiveSheet();
sheet.rowColManager.setRowHeight(5, 45);    // 设置第6行高度为 45px
const h = sheet.rowColManager.getRowHeight(5); // 获取第6行高度 → 45
```

### 内部机制

```js
// SettingsApplier.#applyRowHeights
if (typeof rowHeights === "number") {
    // 统一模式：遍历所有已分配行，逐行设置相同高度
    const count = rc.allocatedRowCount || 100;
    rc.ensureSize(count, 0);
    for (let r = 0; r < count; r++) rc.setRowHeight(r, rowHeights);
} else if (Array.isArray(rowHeights)) {
    // 数组模式：逐行设置，确保分配足够空间
    rc.ensureSize(rowHeights.length, 0);
    for (let r = 0; r < rowHeights.length; r++) rc.setRowHeight(r, rowHeights[r]);
}
```

### 约束

- 最小高度：`MIN_ROW_HEIGHT = 10`（px），拖拽调整时不可低于此值
- 最大范围：`MAX_ROWS = 10000000`，超出部分使用默认高度
- 用户可通过鼠标拖拽行头下边框实时调整行高

### 完整示例

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        data: [
            ["标题行", "", ""],
            ["张三", 25, "北京"],
            ["李四", 30, "上海"],
        ],
        rowHeights: [50, 30, 30],   // 标题行稍高
        rowHeaders: ["标题", "数据1", "数据2"],
        colHeaders: ["Name", "Age", "City"],
    }
});
```

---

## 四、colHeaders — 列头标签

控制表格顶部列头行显示的标签文字。

### 语法

```js
// 方式一：自动字母（默认）
colHeaders: true,
// 结果：列头显示 "A", "B", "C" ... "Z", "AA", "AB" ...

// 方式二：自定义字符串数组
colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
// 结果：第0~5列使用自定义标签，第6列起回退为 "G"...

// 方式三：函数动态生成
colHeaders: (col) => `列${col + 1}`,
// 结果：第0列="列1"，第1列="列2" ...

// 方式四：关闭列头
colHeaders: false,  // 或 null，不显示列头标签
```

### 取值说明

| 值 | 效果 |
|----|------|
| `true` | 自动生成字母标签（"A", "B", ... "Z", "AA", "AB" ...） |
| `string[]` | 使用数组中的字符串，索引越界则回退到默认字母 |
| `Function(col)` | 每列调用，参数 `col` 为列号（从 0 开始），返回值作为标签 |
| `false` / `null` | 不显示列头 |

### 动态修改

```js
wb.updateSettings({ colHeaders: ["产品", "价格", "库存"] });
```

### 内部机制

```js
// 与 rowHeaders 共用同一解析逻辑
#resolveHeader(config, index, defaultFn) { ... }

// 列头默认函数：列号 → 列字母
#defaultColLabel(col) {
    let label = "";
    let n = col + 1;
    while (n > 0) {
        n = n - 1;
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26);
    }
    return label || "A";
}
// 结果：0→"A", 1→"B", ..., 25→"Z", 26→"AA", 27→"AB" ...
```

> **注意：** 当同时配置 `colHeaders` 和 `nestedHeaders` 时，`nestedHeaders` 优先用于多层表头渲染，`colHeaders` 仍可用于最底层（叶子层）的标签兜底。

---

## 五、colWidths — 列宽配置

控制每一列的宽度，支持统一值和逐列配置两种模式。

### 语法

```js
// 模式一：统一列宽
colWidths: 120,
// 结果：所有已分配列宽度均为 120px

// 模式二：逐列配置
colWidths: [80, 120, 200],
// 结果：第0列=80px，第1列=120px，第2列=200px，第3列起使用默认值 100px
```

### 取值说明

| 值 | 效果 |
|----|------|
| `number` | 所有已分配列统一使用该宽度，未分配列使用 `DEFAULT_COL_WIDTH`（100px） |
| `number[]` | 按索引逐列设置宽度，数组长度内的列使用对应值，超出的列使用默认值 |
| 不配置 | 所有列使用默认值 `DEFAULT_COL_WIDTH`（100px） |

### 动态修改

```js
// 统一宽度
wb.updateSettings({ colWidths: 150 });

// 逐列宽度
wb.updateSettings({ colWidths: [60, 100, 80, 120] });
```

### 运行时操作

也可以通过 `RowColManager` 直接操作：

```js
const sheet = wb.getActiveSheet();
sheet.rowColManager.setColWidth(3, 150);    // 设置第4列宽度为 150px
const w = sheet.rowColManager.getColWidth(3); // 获取第4列宽度 → 150
```

### 内部机制

```js
// SettingsApplier.#applyColWidths
if (typeof colWidths === "number") {
    // 统一模式：遍历所有已分配列，逐列设置相同宽度
    const count = rc.allocatedColCount || 26;
    rc.ensureSize(0, count);
    for (let c = 0; c < count; c++) rc.setColWidth(c, colWidths);
} else if (Array.isArray(colWidths)) {
    // 数组模式：逐列设置，确保分配足够空间
    rc.ensureSize(0, colWidths.length);
    for (let c = 0; c < colWidths.length; c++) rc.setColWidth(c, colWidths[c]);
}
```

### 约束

- 最小宽度：`MIN_COL_WIDTH = 30`（px），拖拽调整时不可低于此值
- 最大范围：`MAX_COLS = 70000`，超出部分使用默认宽度
- 隐藏列：通过 `HiddenColumnsPlugin` 可将列宽设为 0，隐藏状态下不占用可视宽度
- 用户可通过鼠标拖拽列头右边框实时调整列宽

### 与 columns 配置的关系

`colWidths` 与 `columns[].width` 功能重叠时的优先级：

```js
// columns[].width 优先级高于 colWidths
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        colWidths: [100, 100, 100],
        columns: [
            { type: "text", width: 120 },     // 覆盖为 120
            { type: "numeric" },               // 回退到 colWidths[1] = 100
            { type: "text", width: 200 },     // 覆盖为 200
        ],
    }
});
```

> 建议统一使用 `columns` 管理列配置（类型+宽度+样式），避免混用 `colWidths`。

---

## 配置生效时机与方式

### 构造时

所有 5 个配置项均可在 `new Workbook()` 构造时传入：

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        rowHeaderWidth: 80,
        rowHeaders: ["行1", "行2"],
        rowHeights: [30, 50],
        colHeaders: ["A列", "B列"],
        colWidths: [120, 200],
        data: [["hello", "world"]],
    }
});
```

### 运行时

通过 `updateSettings()` 动态更新：

```js
wb.updateSettings({
    rowHeaderWidth: 100,
    rowHeaders: (row) => `R${row + 1}`,
    rowHeights: 40,
    colHeaders: (col) => `C${col + 1}`,
    colWidths: 150,
});
```

### 配置生效流程

```
Workbook 构造 / updateSettings()
        ↓
SettingsApplier.apply({ sheet, renderEngine, settings })
        ↓
┌───────────────────┬────────────────────────────┐
│ rowHeaderWidth    │ sheet.rowHeaderWidth = ... │
│ rowHeaders        │ sheet.rowHeaders = ...     │
│ colHeaders        │ sheet.colHeaders = ...     │
├───────────────────┼────────────────────────────┤
│ rowHeights        │ RowColManager.setRowHeight │
│ colWidths         │ RowColManager.setColWidth  │
└───────────────────┴────────────────────────────┘
        ↓
渲染刷新（render → HeaderRenderer + TileRenderer）
```

---

## 坐标系说明

- **行号/列号**：均从 0 开始
  - `rowHeaders: [0]` → 第 0 行（数据第一行）
  - `colHeaders: [0]` → 第 0 列（数据第一列）
- **坐标系**：当前使用统一坐标体系，无需行号转换（已移除分页模式）
- **尺寸单位**：所有宽度/高度均为 CSS 像素（px），自动适配 `devicePixelRatio`

---

## 常见组合示例

### 完整表格配置

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        
        // 行头配置
        rowHeaderWidth: 80,
        rowHeaders: ["姓名", "年龄", "城市", "部门", "薪资", "入职日期"],
        rowHeights: [40, 30, 30],   // 第0行（表头行）稍高
    
        // 列头配置
        colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
        colWidths: [120, 80, 100, 100, 100, 200],
    
        // 数据
        data: [
            ["张三", 25, "北京", "技术", 15000, "2020-03-15"],
            ["李四", 30, "上海", "市场", 18000, "2019-07-01"],
            ["王五", 28, "广州", "技术", 16000, "2021-01-10"],
        ],
    
        defaultStyle: {
            fontSize: 14,
            fontFamily: "Microsoft YaHei",
        },
    }
});
```

### 最小配置（仅数据，全部使用默认值）

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        data: [["A", "B", "C"]],
    }
});
// rowHeaderWidth: 46px（默认）
// rowHeaders: "1", "2", "3" ...（默认）
// rowHeights: 28px（默认）
// colHeaders: "A", "B", "C" ...（默认）
// colWidths: 100px（默认）
```
