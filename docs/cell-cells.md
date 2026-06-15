# Cell 与 Cells 单元格配置

通过 `cell` 和 `cells` 选项对单个单元格进行精细化的样式、禁用和初始值配置，参考 [Handsontable cell/cells API](https://handsontable.com/docs/javascript-data-grid/api/options/#cell)。

## 概述

| 选项 | 类型 | 特性 | 适用场景 |
|------|------|------|----------|
| `cell` | `Array<Object>` | 静态声明式，初始化时一次性应用 | 为特定单元格设置初始值、样式或禁用状态 |
| `cells` | `Function` | 动态计算式，每次渲染时实时调用 | 根据行/列位置动态计算样式或禁用规则 |

## cell — 静态声明式配置

### 基本用法

```js
const wb = new Workbook("grid", {
  cell: [
    { row: 0, col: 0, style: { backgroundColor: "#e8f4fd", fontWeight: "bold" } },
    { row: 1, col: 3, disabled: true },
    { row: 2, col: 4, readOnly: true, style: { backgroundColor: "#fff3cd" } },
    { row: 3, col: 1, value: "预设值" },
  ],
});
```

### 配置项属性

每个配置项必须包含 `row` 和 `col`，其余属性可选：

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `row` | `number` | ✅ | 行号（从 0 开始） |
| `col` | `number` | ✅ | 列号（从 0 开始） |
| `style` | `object` | — | 样式对象，如 `{ fontWeight: "bold", color: "#ff0000" }` |
| `disabled` | `boolean` | — | 是否禁用（只读），与 `readOnly` 等价 |
| `readOnly` | `boolean` | — | 是否只读，与 `disabled` 等价 |
| `value` | `*` | — | 单元格初始值 |

### 属性应用规则

`cell` 配置在初始化时一次性应用，属性之间有依赖关系：

**1. `value` 与 `style` 同时设置**

当同时提供 `value` 和 `style` 时，两者合并写入单元格：

```js
{ row: 0, col: 0, value: "标题", style: { fontWeight: "bold" } }
// 单元格值为 "标题"，同时应用粗体样式
```

**2. 仅设置 `style`**

若未提供 `value`，仅更新样式，保留原有单元格值：

```js
{ row: 1, col: 2, style: { backgroundColor: "#fff3cd" } }
// 单元格值不变，仅添加背景色
```

**3. `disabled` / `readOnly`**

标记单元格为只读，禁止编辑：

```js
{ row: 1, col: 3, disabled: true }   // 方式一
{ row: 2, col: 4, readOnly: true }   // 方式二（等价）
```

**4. 组合使用**

`value` + `style` + `disabled` 可同时设置：

```js
{ row: 0, col: 0, value: "合计", style: { fontWeight: "bold" }, disabled: true }
// 单元格值为 "合计"，粗体显示，且不可编辑
```

### 注意事项

- `cell` 是**一次性应用**的配置，仅在初始化或调用 `updateSettings()` 时执行
- 配置项按数组顺序依次应用，后设置的项会覆盖先设置的（如果指向同一单元格）
- `row` 或 `col` 为 `null`/`undefined` 的配置项会被跳过
- `disabled` 和 `readOnly` 效果相同，`disabled` 优先级更高（`disabled ?? readOnly`）

---

## cells — 动态计算式配置

### 基本用法

```js
const wb = new Workbook("grid", {
  cells: (row, col) => {
    // 首行加粗高亮
    if (row === 0) {
      return { style: { fontWeight: "bold", backgroundColor: "#e8f4fd" } };
    }
    // 第一列右对齐加粗（跳过首行）
    if (col === 0 && row > 0) {
      return { style: { textAlign: "right", fontWeight: "bold" } };
    }
    // 其他单元格返回 undefined，不应用额外配置
  },
});
```

### 函数签名

```ts
(row: number, col: number) => { style?: object, disabled?: boolean, readOnly?: boolean } | undefined | null
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `row` | `number` | 行号（从 0 开始） |
| `col` | `number` | 列号（从 0 开始） |

**返回值：**

| 返回值 | 说明 |
|--------|------|
| `{ style, disabled, readOnly }` | 应用对应属性到该单元格 |
| `undefined` / `null` | 不应用额外配置 |

### 返回值属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `style` | `object` | 样式对象，会合并到单元格最终样式中 |
| `disabled` | `boolean` | 是否禁用（只读） |
| `readOnly` | `boolean` | 是否只读（与 `disabled` 等价） |

### 特性

**1. 实时计算**

`cells` 函数在每次渲染时被调用（通过 `resolveCellProperties`），因此可以基于动态数据返回不同配置：

```js
cells: (row, col) => {
  const value = wb.getCellValue(row, col);
  if (typeof value === "number" && value < 0) {
    return { style: { color: "#e74c3c" } };  // 负数红色
  }
  if (typeof value === "number" && value >= 0) {
    return { style: { color: "#27ae60" } };  // 正数绿色
  }
},
```

**2. 异常安全**

函数内部抛出异常时，`resolveCellProperties` 会捕获并返回 `null`，不会导致渲染崩溃：

```js
cells: (row, col) => {
  // 即使这里抛出异常，也不会影响表格渲染
  return someUnsafeOperation(row, col);
},
```

**3. 性能考虑**

`cells` 函数在每次 `resolveStyle` 和 `isDisabled` 调用时执行，高频触发。建议：

- 避免在函数内执行耗时操作（如 DOM 操作、网络请求）
- 使用简单的条件判断，避免复杂计算
- 返回 `undefined` 比返回空对象 `{}` 更高效（跳过后续合并）

---

## cell 与 cells 的区别

| 维度 | `cell` | `cells` |
|------|--------|---------|
| 类型 | 数组 `Array<Object>` | 函数 `Function` |
| 应用时机 | 初始化时一次性应用 | 每次渲染时实时调用 |
| 配置方式 | 声明式，逐条列出 | 计算式，按规则动态返回 |
| 作用范围 | 仅影响指定的单元格 | 可影响任意单元格 |
| 值设置 | 支持设置 `value` | 不支持设置 `value` |
| 性能 | 初始化时 O(n)，之后无开销 | 每次渲染 O(rows × cols) |
| 适合场景 | 少量特定单元格的固定配置 | 行/列级别的批量规则 |

---

## 优先级体系

### 样式优先级

单元格最终样式按以下优先级合并（后者覆盖前者）：

```
默认样式（defaultStyle）
  ↓ 被覆盖
列样式（columns.style / colStyles）
  ↓ 被覆盖
行样式（rowStyles）
  ↓ 被覆盖
单元格样式（cell.style / setCellStyle）
  ↓ 被覆盖
cells 动态样式（cells() 返回的 style）  ← 最高优先级
```

> **关键点：** `cells` 返回的 `style` 拥有最高优先级，会覆盖所有其他来源的样式。

### 禁用优先级

单元格是否禁用按以下顺序判断（任一为 `true` 即禁用）：

```
1. columns.disabled / columns.readOnly  → 整列禁用
2. cells().disabled / cells().readOnly  → 动态禁用
3. cell.disabled / cell.readOnly        → 静态禁用（写入 cellStore）
```

> **注意：** 禁用判断是"或"逻辑，任一层级为 `true` 即生效。`columns` 禁用整列时，`cells` 无法覆盖为可编辑。

---

## 与 columns 的协作

`cell` / `cells` 与 `columns` 可以组合使用，实现"列级默认 + 单元格级覆盖"：

```js
const wb = new Workbook("grid", {
  // 列级配置：numeric 列默认右对齐
  columns: [
    { type: "text", width: 120 },
    { type: "numeric", width: 100, numericFormat: { pattern: "0,0.00" } },
    { type: "numeric", width: 80, numericFormat: { pattern: "$0,0.00" } },
  ],

  // cells 动态覆盖：首行居中（覆盖 numeric 的右对齐）
  cells: (row, col) => {
    if (row === 0) {
      return { style: { textAlign: "center", fontWeight: "bold" } };
    }
  },

  // cell 静态配置：特定单元格禁用
  cell: [
    { row: 2, col: 1, disabled: true },
    { row: 3, col: 2, style: { backgroundColor: "#fff3cd" } },
  ],
});
```

---

## 动态更新

通过 `updateSettings()` 在运行时更新 `cell` 和 `cells` 配置：

```js
// 更新 cells 函数
wb.updateSettings({
  cells: (row, col) => {
    if (row === highlightRow) {
      return { style: { backgroundColor: "#d4edda" } };
    }
  },
});

// 追加 cell 配置（会替换之前的 cell 配置）
wb.updateSettings({
  cell: [
    { row: 5, col: 0, value: "新增行", style: { fontWeight: "bold" } },
    { row: 5, col: 1, disabled: true },
  ],
});
```

> **注意：** `updateSettings({ cell })` 会替换整个 `cellConfig` 数组，而非追加。如需保留原有配置，需合并后传入。

---

## 完整示例

### 示例 1：表头高亮 + 特定单元格只读

```js
const wb = new Workbook("grid", {
  data: [
    ["姓名", "年龄", "城市", "备注"],
    ["张三", 28, "北京", "管理员"],
    ["李四", 35, "上海", ""],
    ["王五", 22, "广州", "实习生"],
  ],
  colHeaders: true,

  // cells：首行表头样式
  cells: (row, col) => {
    if (row === 0) {
      return {
        style: {
          fontWeight: "bold",
          backgroundColor: "#217346",
          color: "#ffffff",
          textAlign: "center",
        },
      };
    }
  },

  // cell：特定单元格只读
  cell: [
    { row: 1, col: 0, disabled: true },
    { row: 1, col: 3, disabled: true },
    { row: 3, col: 3, style: { color: "#e74c3c", fontStyle: "italic" } },
  ],
});

wb.initRender();
wb.render();
```

### 示例 2：斑马纹 + 条件样式

```js
const wb = new Workbook("grid", {
  data: [
    ["项目", "预算", "实际", "差异"],
    ["研发", 50000, 48000, 2000],
    ["市场", 30000, 32000, -2000],
    ["运营", 20000, 19000, 1000],
  ],
  colHeaders: true,

  columns: [
    { type: "text", width: 100 },
    { type: "numeric", width: 100, numericFormat: { pattern: "$0,0" } },
    { type: "numeric", width: 100, numericFormat: { pattern: "$0,0" } },
    { type: "numeric", width: 100, numericFormat: { pattern: "$0,0" } },
  ],

  // cells：斑马纹 + 差异列条件着色
  cells: (row, col) => {
    const props = {};

    // 斑马纹
    if (row > 0 && row % 2 === 0) {
      props.style = { backgroundColor: "#f8f9fa" };
    }

    // 差异列（col=3）：正值绿色，负值红色
    if (col === 3 && row > 0) {
      const value = wb.getCellValue(row, col);
      if (typeof value === "number") {
        props.style = {
          ...props.style,
          color: value >= 0 ? "#27ae60" : "#e74c3c",
          fontWeight: "bold",
        };
      }
    }

    return Object.keys(props).length > 0 ? props : undefined;
  },
});

wb.initRender();
wb.render();
```

### 示例 3：表单式表格

```js
const wb = new Workbook("grid", {
  data: [
    ["字段", "值"],
    ["姓名", ""],
    ["邮箱", ""],
    ["手机", ""],
    ["提交", ""],
  ],

  // cells：标签列只读，提交行特殊样式
  cells: (row, col) => {
    if (col === 0) {
      return {
        style: { fontWeight: "bold", backgroundColor: "#f0f0f0" },
        disabled: true,
      };
    }
    if (row === 4) {
      return {
        style: { backgroundColor: "#217346", color: "#ffffff", textAlign: "center" },
        disabled: true,
      };
    }
  },

  // cell：提交按钮文字
  cell: [
    { row: 4, col: 0, value: "操作" },
    { row: 4, col: 1, value: "点击提交" },
  ],
});

wb.initRender();
wb.render();
```

---

## API 参考

### Sheet 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `cellConfig` | `Array<Object>` | `cell` 配置数组，可通过 `updateSettings` 更新 |
| `cellsFn` | `Function\|null` | `cells` 配置函数，可通过 `updateSettings` 更新 |

### Sheet 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `applyCellConfig()` | — | — | 应用 `cellConfig` 数组到单元格 |
| `resolveCellProperties(r, c)` | `number, number` | `object\|null` | 解析 `cells` 函数返回的属性 |

### Workbook 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `updateSettings({ cell, cells })` | `object` | — | 动态更新 cell/cells 配置 |
| `setCellStyle(row, col, styleObj)` | `number, number, object` | — | 编程式设置单元格样式 |
| `getCellStyle(row, col)` | `number, number` | `object` | 获取单元格最终合并样式 |

---

## 常见问题

### Q: `cell` 和 `cells` 同时配置了同一单元格的样式，谁生效？

**A:** `cells` 优先级更高。`cells` 返回的 `style` 会覆盖 `cell` 设置的样式。因为 `cells` 在样式合并链中位于最末端：

```
cell.style → 写入 cellStore → cellStyleId 层级
cells().style → resolveCellProperties → 最高层级
```

### Q: `cells` 函数中可以设置 `value` 吗？

**A:** `cells` 返回的 `value` 属性目前不会自动应用到单元格。`cells` 主要用于动态样式和禁用控制。如需设置值，请使用 `cell` 配置或 `sheet.setCell()` 方法。

### Q: `cells` 函数的调用频率如何？

**A:** 每次渲染时，每个可见单元格都会调用一次 `cells` 函数（通过 `resolveStyle` 和 `isDisabled`）。对于 1000 个可见单元格，每帧可能调用 2000 次。建议保持函数逻辑简单，避免耗时操作。

### Q: 如何让 `cells` 函数访问外部数据？

**A:** 通过闭包捕获外部变量：

```js
const highlightRow = ref(0);

const wb = new Workbook("grid", {
  cells: (row, col) => {
    if (row === highlightRow.value) {
      return { style: { backgroundColor: "#d4edda" } };
    }
  },
});

// 更新高亮行后，调用 wb.render() 刷新
highlightRow.value = 3;
wb.render();
```

### Q: `cell` 配置的 `disabled` 和 `cells` 返回的 `disabled` 有何区别？

**A:**
- `cell.disabled` 是一次性写入 `cellStore` 的，后续可通过 `enableCell()` 取消
- `cells().disabled` 是动态计算的，每次渲染时重新判断，无法通过 `enableCell()` 取消（因为下次渲染时 `cells` 函数仍会返回 `disabled: true`）
- 若需动态取消 `cells` 的禁用，需修改 `cells` 函数的返回值
