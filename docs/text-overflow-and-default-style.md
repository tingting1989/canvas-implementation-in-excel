# 文本溢出与默认样式配置

本文档涵盖 `textOverflowEllipsis` 和 `defaultStyle` 两个配置项。

---

## 配置概览

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `textOverflowEllipsis` | `boolean` | `true` | 文本超出单元格宽度时是否显示省略号 `...` |
| `defaultStyle` | `object` | 见下方 | 全局默认样式，所有单元格的基础样式 |

---

## 一、textOverflowEllipsis

控制单元格文字超出可用宽度时的显示行为。

### 取值

| 值 | 行为 |
|----|------|
| `true`（默认） | 超宽文本截断，末尾追加 `...` |
| `false` | 超宽文本直接裁剪，不显示省略号 |

### 内部机制

渲染时通过 `TileRenderer.#drawCellText` 处理：

1. 计算可用宽度：`单元格宽度 - 左右内边距（cellPadding × 2）`
2. 使用 `canvas.measureText()` 测量文本宽度
3. 超出时二分查找截断点，再根据 `textOverflowEllipsis` 决定是否追加 `...`

> 配合 `cellPadding` 配置项可同时控制内边距。参见 [内边距配置](#相关配置)。

### 使用示例

```js
// 构造时配置
const wb = new Workbook("grid", {
    textOverflowEllipsis: false,  // 关闭省略号
    data: [
        ["短文本", "这是一段很长的文本内容会被直接裁剪掉"],
    ],
});

// 动态修改
wb.updateSettings({ textOverflowEllipsis: true });
```

### 生效流程

```
Workbook({ textOverflowEllipsis: false })
  → SettingsApplier.apply()
  → sheet.textOverflowEllipsis = false
  → TileRenderer.#drawCellText(sheet) 读取 sheet.textOverflowEllipsis
```

---

## 二、defaultStyle

设置工作表的全局默认样式，作为所有单元格的**基础样式**。单元格的最终样式由多层合并得出。

### 支持的属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fontFamily` | `string` | `"Segoe UI"` | 字体族 |
| `fontSize` | `number` | `12` | 字号（px） |
| `fontWeight` | `string` | `"normal"` | 字重：`"normal"` / `"bold"` |
| `fontStyle` | `string` | — | 字体样式：`"normal"` / `"italic"` |
| `color` | `string` | `"#222"` | 文字颜色 |
| `backgroundColor` | `string` | `"transparent"` | 背景色（未设置时使用斑马纹） |
| `textAlign` | `string` | `"left"` | 水平对齐：`"left"` / `"center"` / `"right"` |
| `verticalAlign` | `string` | `"middle"` | 垂直对齐：`"top"` / `"middle"` / `"bottom"` |
| `textDecoration` | `string` | — | 文字装饰：`"underline"` / `"none"` |

### 样式合并优先级（低 → 高）

```
defaultStyle           ← 全局默认（本文档配置项）
  → colStyles          ← 列级样式（setColStyle）
  → rowStyles          ← 行级样式（setRowStyle）
  → cell.style         ← 单元格级样式（setCellStyle）
  → 类型默认样式         ← 如 numeric 右对齐、date 居中
  → cellsFn            ← 动态属性函数（最高优先级）
```

> 高优先级样式的同名字段会**覆盖**低优先级字段，其他字段保留不变。

### 内部机制

- `SettingsApplier` 调用 `sheet.setDefaultStyle(settings.defaultStyle)`
- `setDefaultStyle` 将样式对象传入 `stylePool`（Flyweight 模式），仅存储整数 ID
- 渲染时 `sheet.resolveStyle(r, c)` 以 `defaultStyle` 为基础，逐层合并其他样式
- 相同内容的样式对象共享同一 ID，节省内存

### 使用示例

```js
// 构造时设置全局默认样式
const wb = new Workbook("grid", {
    defaultStyle: {
        fontSize: 14,
        fontFamily: "Microsoft YaHei",
        color: "#333",
    },
    data: [["普通文本", "粗体文本"]],
    cell: [
        { row: 0, col: 1, style: { fontWeight: "bold" } },  // 在 defaultStyle 基础上叠加
    ],
});

// 动态修改
wb.updateSettings({
    defaultStyle: {
        fontSize: 16,
        fontFamily: "Arial",
        color: "#000",
    },
});
```

### 获取当前默认样式

```js
const sheet = wb.getActiveSheet();
const currentDefaults = sheet.getDefaultStyle();
// { fontFamily: "Segoe UI", fontSize: 12, color: "#222", ... }
```

---

## 三、cellPadding（相关配置）

与 `textOverflowEllipsis` 紧密相关的单元格文字内边距配置。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `cellPadding` | `number` | `6` | 单元格文字水平内边距（px），左右各保留此宽度 |

```js
const wb = new Workbook("grid", {
    cellPadding: 8,        // 左右各 8px 内边距
    textOverflowEllipsis: false,
});

// 动态修改
wb.updateSettings({ cellPadding: 10 });
```

---

## 完整示例

```js
const wb = new Workbook("grid", {
    data: [
        ["张三", 25, "这是一段很长的描述文字"],
        ["李四", 30, "短"],
    ],
    colHeaders: ["姓名", "年龄", "描述"],

    // 默认样式：所有单元格使用 14px 微软雅黑
    defaultStyle: {
        fontSize: 14,
        fontFamily: "Microsoft YaHei",
        color: "#222",
    },

    // 溢出行为：关闭省略号，直接裁剪
    textOverflowEllipsis: false,

    // 内边距：左右各 8px
    cellPadding: 8,
});
```
