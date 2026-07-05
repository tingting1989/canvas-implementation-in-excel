# Columns 列配置

通过 `columns` 选项为每列定义类型、宽度、样式和格式化规则，参考 [Handsontable columns API](https://handsontable.com/docs/javascript-data-grid/api/options/#columns)。

## 基本用法

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        columns: [
            { type: "text", width: 120 },
            { type: "numeric", width: 100, numericFormat: { pattern: "0,0.00" } },
            { type: "numeric", width: 80, numericFormat: { pattern: "$0,0.00" } },
        ],
    }
});
```

## 列配置属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | `string` | `"text"` | 列类型，见下方"列类型"章节 |
| `width` | `number` | — | 列宽（px），优先级高于 `colWidths` |
| `style` | `object` | — | 列级样式对象，如 `{ textAlign: "right", fontWeight: "bold" }` |
| `numericFormat` | `object` | — | 数字格式化配置，仅 `type: "numeric"` 时生效 |
| `numericFormat.pattern` | `string` | — | 格式化模式，见下方"数字格式化模式" |
| `numericFormat.culture` | `string` | — | 区域设置（预留） |
| `validator` | `Function` | — | 自定义验证函数 `(value) => boolean \| string` |
| `allowInvalid` | `boolean` | `false` | 是否允许无效输入（仅 `numeric` 类型） |
| `disabled` | `boolean` | `false` | 是否禁用该列所有单元格 |
| `readOnly` | `boolean` | `false` | 是否只读（等同于 `disabled`） |
| `source` | `Array` | — | 下拉列表数据源（`type: "select"` 时必填） |

## 列类型

### text（默认）

文本类型，无特殊格式化，使用 `TextEditor` 编辑。

```js
{ type: "text", width: 120, style: { textAlign: "left" } }
```

### numeric

数字类型，支持数字格式化显示、输入验证和右对齐，使用 `NumericEditor` 编辑。

```js
{ type: "numeric", width: 100, numericFormat: { pattern: "0,0.00" } }
```

**行为特性：**

- 单元格值以数字类型存储（`number`），显示时根据 `numericFormat.pattern` 格式化
- 默认右对齐（`textAlign: "right"`），可通过 `style.textAlign` 覆盖
- 编辑时仅允许输入数字、小数点、负号和科学计数法字符（`0-9`、`.`、`-`、`e`、`E`）
- 粘贴时自动解析为数字，非数字内容会被过滤
- 提交时自动验证，无效输入会被拒绝（除非 `allowInvalid: true`）

### select

下拉选择类型，使用 `SelectEditor` 编辑，支持从预定义列表中选择值。

```js
{ type: "select", width: 120, source: ["正常", "异常", "未知"] }
```

**行为特性：**

- 必须提供 `source` 数组作为下拉选项数据源
- `source` 支持字符串数组 `["A", "B"]` 和对象数组 `[{ value: "a", label: "选项A" }]` 两种格式
- 编辑时弹出下拉选择框，仅允许选择预定义值
- 设置 `strict: true` 时，拒绝不在 `source` 中的输入

### date

日期类型，使用 `DateEditor` 编辑。

```js
{ type: "date", width: 120, dateFormat: "YYYY-MM-DD" }
```

### boolean

布尔类型，显示为复选框样式。

```js
{ type: "boolean", width: 80 }
```

### 内置渲染器类型

以下类型提供特殊的可视化渲染，但不改变编辑行为：

| 类型名 | 说明 | 配置示例 |
|--------|------|----------|
| `checkbox` | 布尔复选框渲染 | `{ type: "checkbox", width: 80 }` |
| `progressBar` | 进度条渲染 | `{ type: "progressBar", width: 150, min: 0, max: 100 }` |
| `starRating` | 星级评分渲染 | `{ type: "starRating", width: 120, labels: ["差", "良", "优"] }` |
| `sparkline` | 迷你图渲染 | `{ type: "sparkline", width: 120 }` |
| `colorPreview` | 颜色预览渲染 | `{ type: "colorPreview", width: 80 }` |

> **自定义类型：** 通过 `registerTypeClass()` 注册自定义类型，详见"扩展新列类型"章节。

## 数字格式化模式

通过 `numericFormat.pattern` 指定显示格式：

| 模式 | 示例输入 | 显示结果 | 说明 |
|------|----------|----------|------|
| `"0"` | `42` | `42` | 整数，无小数 |
| `"0.0"` | `3.14159` | `3.1` | 1 位小数 |
| `"0.00"` | `3.14159` | `3.14` | 2 位小数 |
| `"0,0"` | `1000` | `1,000` | 千分位，无小数 |
| `"0,0.0"` | `1234.5` | `1,234.5` | 千分位 + 1 位小数 |
| `"0,0.00"` | `1234.567` | `1,234.57` | 千分位 + 2 位小数 |
| `"0%"` | `0.56` | `56%` | 百分比，无小数 |
| `"0.0%"` | `0.567` | `56.7%` | 百分比 + 1 位小数 |
| `"0.00%"` | `0.5678` | `56.78%` | 百分比 + 2 位小数 |
| `"$0"` | `100` | `$100` | 美元，无小数 |
| `"$0.00"` | `99.9` | `$99.90` | 美元 + 2 位小数 |
| `"$0,0.00"` | `15000` | `$15,000.00` | 美元 + 千分位 + 2 位小数 |
| `"\u20ac0,0.00"` | `15000` | `\u20ac15,000.00` | 欧元 + 千分位 + 2 位小数 |
| `"\u00a50,0.00"` | `15000` | `\u00a515,000.00` | 人民币 + 千分位 + 2 位小数 |

> **注意：** 格式化仅影响显示，单元格中存储的始终是原始数字值。

## 动态列配置

`columns` 数组元素支持函数形式，实现动态计算：

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
        columns: [
            { type: "text", width: 120 },
            (col) => {
                if (col >= 1 && col <= 3) {
                    return { type: "numeric", width: 100, numericFormat: { pattern: "0,0.00" } };
                }
                return { type: "text", width: 80 };
            },
        ],
    }
});
```

函数接收列号作为参数，返回列配置对象。返回 `null` 或 `undefined` 则跳过该列。

## 样式优先级

单元格最终样式按以下优先级合并（后者覆盖前者）：

```
默认样式 < 列样式（columns.style） < 行样式 < 单元格样式 < cells 动态样式
```

`numeric` 类型列会自动注入 `textAlign: "right"`，位于"列样式"层级，可被行样式、单元格样式或 `cells` 动态样式覆盖。

```js
{
  type: "numeric",
  width: 100,
  numericFormat: { pattern: "0,0.00" },
  // style: { textAlign: "center" }  // 显式设置会覆盖默认右对齐
}
```

## 类型优先级

单元格的类型解析按以下优先级（高优先级覆盖低优先级）：

```
cell 配置中的 type（单元格级）  ← 最高优先级
  ↓ 回退
cells 函数返回的 type（动态单元格级）
  ↓ 回退
columns 配置中的 type（列级）
  ↓ 回退
默认 "text" 类型
```

**同一列中不同行可以使用不同类型：**

```js
const wb = new Workbook("grid", {
    columns: [
        { type: "text", width: 120 },      // 第 0 列默认 text
        { type: "select", width: 120, source: ["正常", "异常"] },  // 第 1 列默认 select
    ],
    cell: [
        { row: 0, col: 0, type: "select", source: ["姓名", "年龄"] },  // 第 0 行第 0 列覆盖为 select
        { row: 1, col: 1, type: "text" },  // 第 1 行第 1 列覆盖为 text
    ],
});
```

**通过 `cells` 函数动态指定类型：**

```js
const wb = new Workbook("grid", {
    columns: [
        { type: "text", width: 120 },
    ],
    cells: (row, col) => {
        if (col === 1 && row > 0) {
            return { type: "select", source: ["正常", "异常"] };
        }
    },
});
```

> **类型选项：** `cell` 和 `cells` 中的 `type` 可附带类型选项（如 `source`、`numericFormat`、`min`、`max` 等），这些选项会自动提取并传递给类型实例。

## 输入验证

### 内置验证（numeric 类型）

`numeric` 类型列自动验证输入是否为有效数字：

- 输入 `"abc"` → 验证失败，值被拒绝，恢复原值
- 输入 `"123"` → 验证通过，存储为数字 `123`
- 设置 `allowInvalid: true` → 允许无效输入但标记为 `"invalid"`

### 自定义验证

通过 `validator` 函数实现自定义验证逻辑：

```js
{
  type: "numeric",
  numericFormat: { pattern: "0,0.00" },
  validator: (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (num < 0) return "值不能为负数";
    if (num > 1000000) return "值超出范围";
    return true;
  },
  allowInvalid: true,
}
```

`validator` 返回值：
- `true` — 验证通过
- `false` — 验证失败，拒绝输入
- `string` — 验证失败，返回错误信息（需 `allowInvalid: true`）

## 编辑器路由

| 列类型 | 编辑器 | 行为 |
|--------|--------|------|
| `text` | `TextEditor` | 标准文本输入，支持 IME |
| `numeric` | `NumericEditor` | 仅允许数字输入，自动过滤非数字字符 |
| `select` | `SelectEditor` | 下拉选择框，从 `source` 列表中选择 |
| `date` | `DateEditor` | 日期选择器 |

编辑器选择由 `EditorManager` 根据列类型自动路由：

```
用户双击/输入 → EditorManager.show(row, col)
                     ↓
            #getEditorForColumn(col)
                     ↓
         Sheet.getColumnType(col) → "numeric"
                     ↓
            NumericEditor.show(row, col)
```

## 与 colWidths 的关系

`columns` 中的 `width` 属性与 `colWidths` 选项功能重叠，优先级规则：

- 若同时配置 `colWidths` 和 `columns[].width`，`columns[].width` 优先生效
- 建议使用 `columns` 统一管理列配置，避免混用 `colWidths`

```js
// 推荐：统一使用 columns
{
  columns: [
    { type: "text", width: 120 },
    { type: "numeric", width: 100, numericFormat: { pattern: "0,0.00" } },
  ]
}

// 不推荐：混用 colWidths 和 columns
{
  colWidths: [120, 100],
  columns: [
    { type: "text" },              // 未设 width，回退到 colWidths[0]
    { type: "numeric", width: 80 }, // 覆盖 colWidths[1]
  ]
}
```

## 完整示例

```js
const wb = new Workbook("grid", {
    sheets: {
        name: "Sheet1",
   
          data: [
            ["产品", "单价", "折扣", "库存", "总价"],
            ["键盘", 299, 0.95, 150, 42557.5],
            ["鼠标", 149, 0.9, 300, 40230],
            ["显示器", 2499, 0.85, 50, 106207.5],
          ],
          colHeaders: true,
          columns: [
            { type: "text", width: 120, style: { fontWeight: "bold" } },
            { type: "numeric", width: 100, numericFormat: { pattern: "\u00a50,0.00" } },
            { type: "numeric", width: 80, numericFormat: { pattern: "0.00%" } },
            { type: "numeric", width: 80, numericFormat: { pattern: "0,0" } },
            { type: "numeric", width: 120, numericFormat: { pattern: "\u00a50,0.00" }, style: { color: "#e74c3c" } },
          ],
          defaultStyle: {
            fontSize: 14,
            fontFamily: "Microsoft YaHei",
          },
    }
});

wb.initRender();
wb.render();
```

显示效果：

| 产品 | 单价 | 折扣 | 库存 | 总价 |
|------|------|------|------|------|
| **键盘** | \u00a5299.00 | 95.00% | 150 | \u00a542,557.50 |
| **鼠标** | \u00a5149.00 | 90.00% | 300 | \u00a540,230.00 |
| **显示器** | \u00a52,499.00 | 85.00% | 50 | \u00a5106,207.50 |

## API 参考

### Sheet 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `applyColumnsConfig(config)` | `Array<Function\|object>` | — | 应用列配置数组 |
| `getColumnType(col)` | `number` | `string` | 获取列类型，默认 `"text"` |
| `getColumnConfig(col)` | `number` | `object\|null` | 获取列配置对象 |
| `formatCellValue(r, c, value)` | `number, number, *` | `string` | 格式化单元格显示值 |
| `validateCellValue(c, value)` | `number, *` | `boolean\|string` | 验证单元格值 |

### EditorManager 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getActiveEditor()` | — | `CellEditor\|null` | 获取当前活动编辑器 |
| `getEditor(type)` | `string` | `CellEditor\|null` | 获取指定类型编辑器 |
| `addEditor(type, editor)` | `string, CellEditor` | — | 注册自定义编辑器 |

## 扩展新列类型

以 `trafficLight`（交通灯）类型为例，扩展步骤：

1. **创建类型类** — 继承 `BaseColumnType`，实现 `render()` 等方法

```js
// src/types/TrafficLightType.js
import { BaseColumnType } from "./BaseColumnType.js";

export class TrafficLightType extends BaseColumnType {
    static TYPE_NAME = "trafficLight";

    render(ctx, context) {
        const { x, y, width, height, displayValue } = context;
        // 自定义渲染逻辑：绘制交通灯图标 + 文字
        // ...
    }
}
```

2. **注册类型** — 在应用入口调用 `registerTypeClass`

```js
import { registerTypeClass } from "./src/types/index.js";
import { TrafficLightType } from "./src/types/TrafficLightType.js";

registerTypeClass("trafficLight", TrafficLightType);
```

3. **创建编辑器**（可选） — 继承 `CellEditor`，实现 `createEditor`/`show`/`hide`/`hideForScroll`/`restoreFromScroll`

```js
// src/editor/editors/TrafficLightEditor.js
export class TrafficLightEditor extends CellEditor {
  createEditor() { /* 创建编辑器 DOM */ }
  show(row, col, cursorMode) { /* 显示并定位 */ }
  hide() { /* 隐藏 */ }
  hideForScroll() { /* 滚动隐藏 */ }
  restoreFromScroll() { /* 滚动恢复 */ }
}
```

4. **注册编辑器** — 在 `EditorManager.#initEditors()` 中注册

```js
const tlEditor = new TrafficLightEditor(this.renderEngine, this.#sheet);
tlEditor.createEditor();
this.editors.set("trafficLight", tlEditor);
```

5. **使用配置**

```js
// 列级使用
{
  type: "trafficLight",
  width: 120,
  style: { textAlign: "center" }
}

// 单元格级使用（覆盖列级类型）
cell: [
  { row: 0, col: 2, type: "trafficLight" },
  { row: 1, col: 2, type: "select", source: ["正常", "异常"] },
]
```