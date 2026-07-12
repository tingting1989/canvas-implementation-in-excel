# 单元格样式系统 — 使用指南

## 1. 概述

单元格样式系统采用 **Flyweight（享元）模式** + **8 层优先级合并** 架构：

- 所有样式通过 `stylePool` 转为整数 ID 存储，相同样式自动去重共享
- `resolveStyle(r, c)` 按优先级从低到高逐层合并，最终返回该单元格的**计算后样式**
- 支持 undo/redo，所有样式变更均生成 Command 对象
- **Workbook → Sheet 默认样式继承链**：顶层 `defaultStyle` 作为全局基础，Sheet 级在其上深度合并覆盖

---

## 2. 支持的样式属性

| 属性名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `fontFamily` | `string` | 字体族 | `"Segoe UI"`, `"YaHei"` |
| `fontSize` | `number` | 字号 (px) | `12`, `14`, `18` |
| `fontWeight` | `string` | 字重 | `"bold"`, `"normal"` |
| `fontStyle` | `string` | 斜体 | `"italic"`, `"normal"` |
| `color` | `string` | 文字颜色 | `"#222"`, `"red"` |
| `backgroundColor` | `string` | 背景颜色 | `"transparent"`, `"#fff"`, `"yellow"` |
| `textAlign` | `string` | 水平对齐 | `"left"`, `"center"`, `"right"` |
| `verticalAlign` | `string` | 垂直对齐 | `"top"`, `"middle"`, `"bottom"` |
| `textDecoration` | `string` | 文本装饰 | `"underline"`, `"line-through"` |
| `border` | `object` | 边框样式 | 见下方 |

### border 结构

```js
{
  top:    { color: "#000", width: 1, style: "solid" },
  right:  { color: "#000", width: 1, style: "solid" },
  bottom: { color: "#000", width: 1, style: "solid" },
  left:   { color: "#000", width: 1, style: "solid" },
}
```

> **约束：样式对象必须是扁平结构，不支持嵌套属性**（除 `border` 外）。  
> 例如 `{ font: { size: 14 } } 是非法的，应写为 `{ fontSize: 14 }`。

---

## 3. 样式继承优先级

`resolveStyle(r, c)` 按 **8 层优先级从低到高** 合并样式，高优先级覆盖低优先级同名属性：

```
┌─────────────────────────────────────────────┐
│  第 8 层  数据绑定值映射样式 (最高)           │
│  第 7 层  条件格式样式                        │
│  第 6 层  数据绑定 cells/cell 配置样式         │
│  第 5 层  列类型默认样式 (如数字列右对齐)       │
│  第 4 层  单元格样式 (setCellStyle)            │
│  第 3 层  行样式   (setRowStyle)              │
│  第 2 层  列样式   (setColStyle / columns[].style) │
│  第 1 层  工作表默认样式 (setDefaultStyle)     │
│  ─────────────────────────────────────────── │
│  内置 DEFAULT_STYLE (fontSize:12, ...)        │
└─────────────────────────────────────────────┘
```

### 类型优先级

单元格的类型解析独立于样式优先级，按以下优先级（高优先级覆盖低优先级）：

```
cell.type（单元格级静态类型）  ← 最高优先级
  ↓ 回退
cells().type（动态单元格级类型）
  ↓ 回退
columns[].type（列级类型）
  ↓ 回退
默认 "text" 类型
```

> **关键点：** `cell` 和 `cells` 中的 `type` 可以覆盖列级类型，实现同一列中不同行使用不同类型。`type` 附带的选项（如 `source`、`numericFormat`、`min`、`max`、`dateFormat`、`labels`、`allowInvalid`、`strict`、`maxLength`）会自动提取并传递给类型实例。

### 默认样式

未设置任何自定义样式时，单元格使用内置默认样式：

```js
{
  fontFamily: "Segoe UI",
  fontSize: 12,
  color: "#222",
  backgroundColor: "transparent",
  textAlign: "left",
  verticalAlign: "middle",
}
```

---

## 4. new Workbook() 构造选项 — 样式配置

### 4.1 完整构造函数签名

```js
import { Workbook } from "./src/workbook/Workbook.js";

const wb = new Workbook("canvas-container", {
    // ====== 样式相关选项 ======

    defaultStyle: {},           // Workbook 级全局默认样式（所有 Sheet 共享）
    rowStyles: {},              // 初始行样式 { "0": {...}, "1": {...} }
    colStyles: {},              // 初始列样式 { "0": {...}, "3": {...} }
    rangeStyles: [],            // 初始区域样式 [{ range: {...}, style: {...} }]
    cell: [],                   // 单元格级配置（含 style、type）
    cells: (row, col) => {},    // 动态单元格属性函数（含 style、type）
    columns: [],                // 列配置数组（每项可含 style、type）
    conditionalStyles: [],      // 条件格式规则（含 style）

    // ====== 多 Sheet 配置 ======
    sheets: [
        {
            name: "Sheet1",
            defaultStyle: {},   // Sheet 级默认样式（覆盖 Workbook 级同名属性）
            rowStyles: {},
            colStyles: {},
            rangeStyles: [],
            cell: [],
            // ... 其他 Sheet 独立选项
        },
        {
            name: "Sheet2",
            defaultStyle: {},
            // ...
        },
    ],
});
```

### 4.2 defaultStyle — 全局默认样式

设置 Workbook 级默认样式，**自动传播到所有 Sheet**：

```js
const wb = new Workbook("app", {
    defaultStyle: {
        fontSize: 13,
        fontFamily: "Microsoft YaHei",
        color: "#333",
    },
});

// 所有 Sheet 的所有单元格都继承此基础样式
wb.getCellStyle(0, 0); // { fontSize: 13, fontFamily: "Microsoft YaHei", ... }
```

### 4.3 rowStyles / colStyles — 初始行列样式

以对象形式设置初始行/列样式，key 为行号/列号字符串：

> **注意：`rowStyles` / `colStyles` 只支持纯对象，不支持函数。**  
> 如需动态列样式，请使用 `columns[].style`（支持函数式配置）或 `cells(row, col)` 动态函数。

```js
const wb = new Workbook("app", {
    rowStyles: {
        "0": { fontWeight: "bold", backgroundColor: "#f0f0f0", textAlign: "center" },  // 表头行
    },
    colStyles: {
        "2": { textAlign: "right" },  // 金额列右对齐
    },
});
```

**如果需要函数式列样式，改用 `columns`：**

```js
const wb = new Workbook("app", {
    // ❌ colStyles 不支持函数：
    // colStyles: (col) => ({ textAlign: "right" })  // 无效

    // ✅ 用 columns 实现同样的效果：
    columns: [
        { width: 100 },                                        // 第 0 列
        { width: 100 },                                        // 第 1 列
        (c) => ({ width: 120, style: { textAlign: "right" } }), // 第 2 列：函数式
    ],
});
```

**Sheet 级独立配置：**

```js
const wb = new Workbook("app", {
    // 顶层（通用默认）
    rowStyles: { "0": { fontWeight: "bold", backgroundColor: "#eee" } },
    colStyles: { "2": { textAlign: "right" } },
    sheets: [
        {
            name: "订单表",
            data: [["商品", "数量", "金额"], ["A", 10, 500]],
            // Sheet 级替换
            rowStyles: {
                "0": { fontWeight: "bold", backgroundColor: "#4a90d9", color: "#fff", textAlign: "center" },  // 蓝色表头
                "1": { backgroundColor: "#f9f9f9" },  // 斑马纹第一行
            },
            colStyles: {
                "2": { textAlign: "right", fontWeight: "bold" },  // 金额列加粗+右对齐
            },
            // → "订单表" 的 rowStyles/colStyles 完全独立，顶层的被替换
        },
        {
            name: "库存表",
            data: [["物料", "存量"]],
            // 不设 rowStyles/colStyles → 继承顶层的表头+金额列样式
        },
    ],
});
```

### 4.4 rangeStyles — 初始区域样式

批量设置区域样式：

```js
const wb = new Workbook("app", {
    rangeStyles: [
        {
            range: { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 5 },
            style: { fontWeight: "bold" },
        },
        {
            range: { topRow: 1, topCol: 0, bottomRow: 10, bottomCol: 5 },
            style: { verticalAlign: "middle" },
        },
    ],
});
```

**Sheet 级独立配置：**

```js
const wb = new Workbook("app", {
    rangeStyles: [
        { range: { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 5 }, style: { fontWeight: "bold" } },
    ],
    sheets: [
        {
            name: "数据录入",
            data: [...],
            rangeStyles: [
                { range: { topRow: 1, topCol: 0, bottomRow: 50, bottomCol: 10 }, style: { verticalAlign: "middle" } },
                { range: { topRow: 1, topCol: 3, bottomRow: 50, bottomCol: 3 }, style: { textAlign: "right" } },
            ],
            // → 只有这 2 条，顶层的"表头加粗"被替换掉了
        },
        {
            name: "只读报表",
            data: [...],
            // 不设 rangeStyles → 继承顶层的"表头加粗"
        },
    ],
});
```

### 4.5 cell — 单元格级配置（含 style、type）

每个元素可同时设置 value、style、type、disabled、readOnly：

```js
const wb = new Workbook("app", {
    cell: [
        { row: 0, col: 0, value: "ID", style: { fontWeight: "bold", color: "blue" } },
        { row: 1, col: 2, value: 100, style: { fontWeight: "bold", color: "red" } },
        { row: 2, col: 0, disabled: true },
        { row: 3, col: 1, readOnly: true, style: { backgroundColor: "#f5f5f5" } },
        { row: 0, col: 2, type: "trafficLight" },
        { row: 1, col: 2, type: "select", source: ["正常", "异常"] },
    ],
});
```

> `cell` 配置中的 `style` 会与已有样式**浅合并**（覆盖同名属性）。
> `cell` 配置中的 `type` 会覆盖列级 `columns[].type`，实现同一列中不同行使用不同类型。`type` 附带的选项（如 `source`、`numericFormat`、`min`、`max` 等）会自动提取并传递给类型实例。

**Sheet 级独立配置：** `cell` 支持在 `sheets[]` 中为每个 Sheet 单独设置，Sheet 级配置会**替换**顶层（不会合并两个数组）：

```js
const wb = new Workbook("app", {
    // 顶层 cell（通用单元格）
    cell: [
        { row: 0, col: 0, value: "ID", style: { fontWeight: "bold" } },
    ],
    sheets: [
        {
            name: "数据表",
            data: [["姓名", "年龄"], ["张三", 25]],
            // Sheet 级 cell（完全替换顶层，不是追加）
            cell: [
                { row: 0, col: 0, value: "姓名", style: { fontWeight: "bold", color: "navy" } },
                { row: 0, col: 1, value: "年龄", style: { fontWeight: "bold", color: "navy" } },
                { row: 1, col: 0, style: { color: "dodgerblue" } },  // 高亮
            ],
            // → "数据表" 只有这 3 条 cell 配置，顶层的 { row:0, col:0, value:"ID" } 被替换掉了
        },
        {
            name: "设置表",
            data: [["参数", "值"]],
            // 不设 cell → 继承顶层的 { row:0, col:0, value:"ID" }
        },
    ],
});
```

### 4.6 cells — 动态单元格属性函数

通过函数动态返回每个单元格的样式和类型，适用于大数据量或条件样式场景：

```js
const wb = new Workbook("app", {
    cells: (row, col) => {
        if (row === 0) return { style: { fontWeight: "bold", backgroundColor: "#eee" } };
        if (col === 2 && row > 0) return { style: { textAlign: "right" } };
        if (col === 3 && row > 0) return { type: "select", source: ["正常", "异常"] };
        return {};
    },
});
```

> 返回的 `style` 在 resolveStyle 第 6 层参与合并。
> 返回的 `type` 会覆盖列级类型，附带选项自动提取。

**Sheet 级独立配置：**

```js
const wb = new Workbook("app", {
    // 顶层（通用默认）
    cells: (row, col) => {
        if (row === 0) return { style: { fontWeight: "bold", backgroundColor: "#eee" } };
        return {};
    },
    sheets: [
        {
            name: "成绩单",
            data: [[85, 92], [45, 55]],
            // Sheet 级替换：完全独立的动态规则
            cells: (row, col) => {
                if (row === 0) return { style: { fontWeight: "bold", backgroundColor: "#d4edda", color: "#155724" } };
                if (col >= 0) {
                    const val = this.data?.[row]?.[col];
                    if (val >= 90) return { style: { color: "green", fontWeight: "bold" } };
                    if (val < 60) return { style: { color: "red", backgroundColor: "#f8d7da" } };
                }
                return {};
            },
            // → "成绩单" 使用自己的绿色表头 + 成绩着色，顶层的灰色表头被替换
        },
        {
            name: "花名册",
            data: [["姓名", "班级"]],
            // 不设 cells → 继承顶层的灰色表头函数
        },
    ],
});
```

### 4.7 columns — 列配置中的 style

列配置中可直接指定该列的样式：

```js
const wb = new Workbook("app", {
    columns: [
        { width: 120, style: { fontWeight: "bold" } },          // 第 0 列加粗
        { width: 80, style: { textAlign: "center" } },          // 第 1 列居中
        { width: 100, style: { textAlign: "right" } },          // 第 2 列右对齐
        (c) => ({ width: 90 }),                                 // 函数式配置（第 3 列）
    ],
});
```

> `columns[c].style` 等价于调用 `setColStyle(c, styleObj)`。

**Sheet 级独立配置：**

```js
const wb = new Workbook("app", {
    // 顶层（通用默认）
    columns: [
        { width: 100, style: { fontWeight: "bold" } },   // 第 0 列
        { width: 100 },                                  // 第 1 列
    ],
    sheets: [
        {
            name: "财务报表",
            data: [["科目", "金额"], ["收入", 50000], ["支出", -3000]],
            // Sheet 级替换
            columns: [
                { width: 150, style: { fontWeight: "bold", color: "#333" } },     // 科目列
                { width: 120, style: { textAlign: "right", fontWeight: "bold" } },  // 金额列右对齐+加粗
            ],
            // → 完全独立，顶层的 [100px 加粗, 100px 默认] 被替换
        },
        {
            name: "简单列表",
            data: [[1, 2, 3]],
            // 不设 columns → 继承顶层的列宽和样式
        },
    ],
});
```

### 4.8 conditionalStyles — 条件格式

基于条件的动态样式规则：

```js
const wb = new Workbook("app", {
    data: [[85, 92, 78], [45, 60, 55]],
    conditionalStyles: [
        {
            range: { topRow: 1, topCol: 0, bottomRow: 2, bottomCol: 2 },
            condition: (value) => value >= 90,
            style: { color: "green", fontWeight: "bold" },
        },
        {
            range: { topRow: 1, topCol: 0, bottomRow: 2, bottomCol: 2 },
            condition: (value) => value < 60,
            style: { color: "red", backgroundColor: "#ffeeee" },
        },
    ],
});
```

> 条件格式在 resolveStyle 第 7 层参与合并，优先级高于单元格/行/列样式。

**Sheet 级独立配置：** `conditionalStyles` 支持在 `sheets[]` 中为每个 Sheet 单独设置，Sheet 级配置会**替换**顶层同名配置（非合并）：

```js
const wb = new Workbook("app", {
    // 顶层条件格式（作为默认规则）
    conditionalStyles: [
        {
            range: { topRow: 0, topCol: 0, bottomRow: 99, bottomCol: 10 },
            condition: (v) => v < 0,
            style: { color: "red" },  // 全局通用：负数标红
        },
    ],
    sheets: [
        {
            name: "成绩表",
            data: [[85, 92], [45, 55], [98, 100]],
            // Sheet 级条件格式（完全独立，不与顶层合并）
            conditionalStyles: [
                {
                    range: { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 1 },
                    condition: (v) => v >= 90,
                    style: { color: "green", fontWeight: "bold" },
                },
                {
                    range: { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 1 },
                    condition: (v) => v < 60,
                    style: { color: "red", backgroundColor: "#ffeeee" },
                },
            ],
            // → "成绩表" 只有这 2 条规则（顶层的"负数标红"被替换掉了）
        },
        {
            name: "财务表",
            data: [[100, -50], [200, -30]],
            // 不设 conditionalStyles → 继承顶层的"负数标红"规则
        },
    ],
});
```

> **合并 vs 替换规则总结：**
> | 配置项 | 多 Sheet 行为 |
> |--------|-------------|
> | `defaultStyle` | 深度合并（Sheet 覆盖 Workbook 同名属性） |
> | `rowStyles` / `colStyles` / `rangeStyles` / `cell` / `columns` | Sheet 级**替换**顶层 |
> | `conditionalStyles` | Sheet 级**替换**顶层 |
> | `cells` (函数) | Sheet 级**替换**顶层 |

### 4.9 多 Sheet + 默认样式继承链

Workbook 级 `defaultStyle` 与 Sheet 级 `defaultStyle` 自动深度合并：

```js
const wb = new Workbook("app", {
    defaultStyle: {
        fontSize: 13,
        fontFamily: "Microsoft YaHei",
        color: "#333",
    },
    sheets: [
        {
            name: "数据表",
            defaultStyle: {
                fontSize: 14,           // 覆盖 Workbook 的 13
                backgroundColor: "#fff", // 新增属性
            },
            // 最终 defaultStyle = { fontSize: 14, fontFamily: "Microsoft YaHei", color: "#333", backgroundColor: "#fff" }
        },
        {
            name: "报表",
            // 不设 defaultStyle → 直接使用 Workbook 级 { fontSize: 13, fontFamily: "Microsoft YaHei", color: "#333" }
        },
    ],
});
```

---

## 5. Workbook 运行时 API

> 以下 API 均操作**当前活动工作表** (`activeSheet`)，并自动触发重新渲染 (`this.render()`)。

### 5.1 设置样式

#### wb.setCellStyle(row, col, styleObj)

```js
wb.setCellStyle(0, 0, { fontWeight: "bold", color: "blue" });
// 自动 render()
```

#### wb.setRowStyle(row, styleObj)

> 必须传入 object，否则抛出 TypeError。

```js
wb.setRowStyle(0, { backgroundColor: "yellow" });
```

#### wb.setColStyle(col, styleObj)

```js
wb.setColStyle(2, { textAlign: "right" });
```

#### wb.setRangeStyle(range, styleObj)

```js
wb.setRangeStyle(
    { topRow: 0, topCol: 0, bottomRow: 10, bottomCol: 5 },
    { verticalAlign: "middle" }
);
```

### 5.2 默认样式

#### wb.setDefaultStyle(styleObj)

设置 Workbook 级默认样式，**同步更新所有现有 Sheet**：

```js
wb.setDefaultStyle({ fontSize: 14, color: "#111" });
// 所有 sheet 的 defaultStyle 同时更新，自动 render()
```

#### wb.getDefaultStyle()

获取当前 Workbook 级默认样式。若未设置则回退到活动 Sheet 的 `getDefaultStyle()`。

```js
const ds = wb.getDefaultStyle();
```

### 5.3 读取样式

#### wb.getCellStyle(row, col)

获取计算后样式（8 层合并结果）：

```js
const style = wb.getCellStyle(0, 0);
console.log(style.fontWeight, style.color);
```

### 5.4 清除样式

```js
wb.clearCellStyle(0, 0);     // 清除单个单元格自定义样式
wb.clearRowStyle(0);         // 清除整行样式
wb.clearColStyle(2);         // 清除整列样式
wb.clearRangeStyle({         // 清除区域内所有自定义样式
    topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5
});
```

### 5.5 批量操作

```js
wb.batchStyleUpdate((s) => {
    s.setRowStyle(0, { fontWeight: "bold" });
    s.setColStyle(0, { textAlign: "center" });
    s.setRangeStyle({ topRow: 1, topCol: 0, bottomRow: 10, bottomCol: 5 }, { verticalAlign: "middle" });
});
// 只产生一条 BatchCommand，一次 undo 即可撤销全部；只触发一次 render()
```

### 5.6 updateSettings — 批量更新配置

```js
wb.updateSettings({
    defaultStyle: { fontSize: 14 },
    rowStyles: { "0": { backgroundColor: "#f0f0f0" } },
    colStyles: { "2": { textAlign: "right" } },
});
// 合并应用到活动 Sheet，自动 render()
```

---

## 6. Sheet 直接使用（无 Workbook 场景）

当不经过 Workbook，直接创建 Sheet 对象时，所有样式 API 同样可用：

```js
import { Sheet } from "./src/workbook/Sheet.js";

const sheet = new Sheet("数据表");

sheet.setDefaultStyle({ fontSize: 13, fontFamily: "Microsoft YaHei" });
sheet.setRowStyle(0, { fontWeight: "bold", backgroundColor: "#f0f0f0" });
sheet.setColStyle(2, { textAlign: "right" });
sheet.setCell(2, 0, "重要");
sheet.setCellStyle(2, 0, { color: "red", fontWeight: "bold" });

sheet.batchStyleUpdate((s) => {
    s.setRangeStyle({ topRow: 1, topCol: 0, bottomRow: 10, bottomCol: 5 }, { verticalAlign: "middle" });
});

const style = sheet.resolveStyle(0, 0);
sheet.history.undo();  // undo/redo 正常工作
```

Sheet 层 API 与 Workbook 层 API 的区别：

| 差异点 | Sheet API | Workbook API |
|--------|-----------|-------------|
| 操作目标 | 当前 Sheet 实例 | activeSheet |
| 自动渲染 | ❌ 需手动调用 | ✅ 自动 `render()` |
| 命令入栈 | ✅ 自动 pushCommand | ✅ 通过委托自动入栈 |

---

## 7. Undo / Redo

所有样式变更自动生成 Command，支持撤销/重做：

```js
// 单个操作 undo
wb.setCellStyle(0, 0, { fontWeight: "bold" });
wb.activeSheet.history.undo();   // 撤销
wb.activeSheet.history.redo();  // 重做

// 行/列 undo
wb.setRowStyle(0, { backgroundColor: "yellow" });
wb.activeSheet.history.undo();

// 批量操作 undo（单个 BatchCommand）
wb.batchStyleUpdate((s) => {
    s.setRowStyle(0, { backgroundColor: "yellow" });
    s.setColStyle(0, { textAlign: "right" });
});
wb.activeSheet.history.undo();  // 行+列一起撤销
```

---

## 8. 类型校验规则

| API | 参数类型要求 | 非法输入行为 |
|-----|------------|-------------|
| `setRowStyle(row, styleObj)` | `styleObj` 必须是 object | 抛出 `TypeError` |
| `setColStyle(col, styleObj)` | `styleObj` 必须是 object | 抛出 `TypeError` |
| `setCellStyle(r, c, styleObj)` | `styleObj` 应为 object | 内部合并处理 |
| `setRangeStyle(range, styleObj)` | `styleObj` 应为 object | 内部合并处理 |
| `setDefaultStyle(styleObj)` | `styleObj` 应为 object | 内部合并处理 |

```js
wb.setRowStyle(0, 5);
// TypeError: setRowStyle expects a style object, received: number

wb.setRowStyle(0, null);
// TypeError: setRowStyle expects a style object, received: object
```

---

## 9. 分页模式注意事项

启用分页模式时，用户传入的是**页面行号**，API 内部自动转换为**实行号**：

```js
wb.setRowStyle(pageRow, { backgroundColor: "yellow" });
// v2.0+ 无需坐标转换（已移除分页模式）
```

`getCellStyle`、`setCellStyle`、`clearCellStyle` 等接受 `(row, col)` 的 API 同理。

---

## 10. 性能说明

### StylePool（Flyweight）

- 相同样式对象共享同一 ID，内存开销 O(1)
- `getStyleId(obj)` 自动去重：相同样式返回相同 ID
- `getStyle(id)` 通过 Map 查询，O(1) 时间复杂度

### resolveStyle 缓存

- 样式变更时版本号递增，缓存自动失效
- 版本号一致时直接从缓存读取，O(1)
- 缓存 key 格式：`"realRow,col"`

### 批量操作优化

- `batchStyleUpdate` 将 N 个操作合并为 1 个 `BatchCommand`
- 减少历史栈占用和 invalidate 触发次数
- `setRangeStyle` 对整行/整列选区自动提升为行/列级别操作，避免逐单元格写入

---

## 11. 完整示例

### 示例 A：通过构造选项一次性配置

```js
const wb = new Workbook("app", {
    // 全局默认样式
    defaultStyle: {
        fontSize: 13,
        fontFamily: "Microsoft YaHei",
        color: "#333",
    },

    // 表头行样式
    rowStyles: {
        "0": { fontWeight: "bold", backgroundColor: "#f0f0f0", textAlign: "center" },
    },

    // 薪资列右对齐
    colStyles: {
        "2": { textAlign: "right" },
    },

    // 高亮特定单元格
    cell: [
        { row: 1, col: 0, style: { color: "dodgerblue", fontWeight: "bold" } },
        { row: 3, col: 2, style: { color: "green", fontWeight: "bold" } },
    ],

    // 条件格式：薪资 > 20000 高亮
    conditionalStyles: [
        {
            range: { topRow: 1, topCol: 2, bottomRow: 3, bottomCol: 2 },
            condition: (v) => v > 20000,
            style: { color: "green", fontWeight: "bold" },
        },
    ],
});
```

### 示例 B：运行时动态修改

```js
const wb = new Workbook("app", { data: [...] });

// 1. 设置全局默认样式（影响所有 Sheet）
wb.setDefaultStyle({ fontSize: 14, fontFamily: "PingFang SC" });

// 2. 设置表头
wb.setRowStyle(0, { fontWeight: "bold", backgroundColor: "#e8e8e8", textAlign: "center" });

// 3. 特定列格式化
wb.setColStyle(2, { textAlign: "right" });

// 4. 批量设置数据区样式
wb.batchStyleUpdate((s) => {
    s.setRangeStyle(
        { topRow: 1, topCol: 0, bottomRow: 100, bottomCol: 10 },
        { verticalAlign: "middle" }
    );
    s.setCellStyle(5, 0, { color: "red", fontWeight: "bold" });  // 高亮异常数据
});

// 5. 读取最终样式
console.log(wb.getCellStyle(5, 0));
// { fontSize: 14, fontFamily: "PingFang SC", color: "red", fontWeight: "bold", verticalAlign: "middle", ... }

// 6. Undo
wb.activeSheet.history.undo();
// batchUpdate 中的所有变更一起撤销
```

### 示例 C：多 Sheet 不同主题

```js
const wb = new Workbook("app", {
    defaultStyle: {
        fontSize: 12,
        fontFamily: "Segoe UI",
        color: "#222",
    },
    sheets: [
        {
            name: "数据录入",
            defaultStyle: {
                fontSize: 14,
                backgroundColor: "#fafafa",
            },
            rowStyles: {
                "0": { fontWeight: "bold", backgroundColor: "#ddd" },
            },
        },
        {
            name: "报表展示",
            defaultStyle: {
                fontSize: 11,
                color: "#555",
            },
            colStyles: {
                "0": { fontWeight: "bold" },
            },
        },
    ],
});

// "数据录入" Sheet: fontSize=14, backgroundColor=#fafafa, color=#222
// "报表展示" Sheet: fontSize=11, color=#555, backgroundColor=transparent
```