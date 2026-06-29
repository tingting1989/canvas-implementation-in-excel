# 单元格样式系统重构设计文档

> **版本**: v1.0
> **日期**: 2026-06-29
> **状态**: 🟡 待评审
> **优先级**: P0 - 高优先级
> **影响范围**: `SheetStyleManager`、`Sheet`、`Workbook`、`SettingsApplier`、`TileRenderer`

---

## 📋 目录

- [1. 背景与动机](#1-背景与动机)
- [2. 当前架构分析](#2-当前架构分析)
- [3. 问题清单与优先级](#3-问题清单与优先级)
- [4. 核心设计：Workbook → Sheet 默认样式继承链](#4-核心设计workbook--sheet-默认样式继承链)
- [5. API 统一重构](#5-api-统一重构)
- [6. 构造选项补齐](#6-构造选项补齐)
- [7. 语义统一](#7-语义统一)
- [8. 渲染层补全](#8-渲染层补全)
- [9. 其他改进](#9-其他改进)
- [10. 实施路线图](#10-实施路线图)
- [11. 迁移指南](#11-迁移指南)
- [12. 风险与挑战](#12-风险与挑战)

---

## 1. 背景与动机

### 1.1 当前样式体系概览

项目采用 **Flyweight 模式（StylePool）+ 多层级联合并 + 版本号缓存** 的架构，底层设计合理：

```
StylePool (全局单例)          ← 样式对象去重 & ID 分配
    ↓ styleId (整数)
SheetStyleManager (per-Sheet)  ← 级联合并 & 缓存
    ↓ resolveStyle(r, c)
TileRenderer                   ← Canvas 绘制
```

样式优先级从低到高共 8 层：

```
第 1 层  defaultStyle        默认样式
第 2 层  colStyle            整列样式
第 3 层  rowStyle            整行样式
第 4 层  cellStyle           单元格样式（cell.styleId）
第 5 层  cellTypeDefault     列类型默认样式
第 6 层  cellProps.style     数据绑定属性中的样式
第 7 层  conditionalFormat   条件格式样式
第 8 层  dataBinding         数据绑定样式
```

### 1.2 核心问题

尽管底层架构合理，API 表面层存在三个关键缺陷：

| # | 缺陷 | 影响 |
|---|------|------|
| 1 | **缺少 Workbook 级默认样式** | 多 Sheet 场景下 defaultStyle 无法全局共享，每个 Sheet 必须重复声明 |
| 2 | **API 参数类型不一致** | `setCellStyle` 接受 styleObj，`setRowStyle`/`setColStyle` 接受 styleId，用户必须了解 stylePool 内部实现 |
| 3 | **语义不一致** | `cell[].style` 有 value 时替换、无 value 时合并；`setRangeStyle` 整行路径替换、逐单元格路径合并 |

此外还有行级样式无构造选项入口、border/verticalAlign 未渲染、样式操作不支持撤销等次要问题。

---

## 2. 当前架构分析

### 2.1 数据流

```
new Workbook("grid", { sheets: [...] })
    ↓
Workbook.#applySheetsConfig()
    ↓ { ...opts, ...sheetConfig }  ← 浅合并
SettingsApplier.apply({ sheet, settings })
    ↓
sheet.setDefaultStyle(settings.defaultStyle)
    ↓
SheetStyleManager.#defaultStyleId = stylePool.getStyleId(styleObj)
    ↓
resolveStyle(r, c) → 逐层合并 → 缓存 → TileRenderer
```

### 2.2 当前构造选项支持的样式入口

| 样式层级 | 构造选项 | 运行时 API | 状态 |
|---------|---------|-----------|------|
| 默认样式 | `defaultStyle` | `sheet.setDefaultStyle(styleObj)` | ✅ 但仅 per-Sheet |
| 列级样式 | `columns[].style` | `sheet.setColStyle(col, styleId)` | ⚠️ 运行时需 styleId |
| 行级样式 | ❌ 无 | `sheet.setRowStyle(row, styleId)` | ❌ 无构造入口 |
| 单元格样式 | `cell[].style` | `sheet.setCellStyle(r, c, styleObj)` | ✅ |
| 动态样式 | `cells` 函数 | — | ✅ |
| 条件格式 | `conditionalStyles` | `sheet.addConditionalRule()` | ✅ |

### 2.3 当前 API 参数类型对照

| API | 参数类型 | 用户是否需要了解 stylePool |
|-----|---------|--------------------------|
| `sheet.setCellStyle(r, c, styleObj)` | styleObj | ❌ 不需要 |
| `sheet.setRangeStyle(range, styleObj)` | styleObj | ❌ 不需要 |
| `sheet.setDefaultStyle(styleObj)` | styleObj | ❌ 不需要 |
| `sheet.setRowStyle(row, styleId)` | styleId | ✅ **需要** |
| `sheet.setColStyle(col, styleId)` | styleId | ✅ **需要** |
| `sheet.getCellStyle(r, c)` | → styleObj | ❌ 不需要 |

---

## 3. 问题清单与优先级

| 优先级 | 问题 | 影响范围 | 改动量 | 对应章节 |
|--------|------|---------|--------|---------|
| 🔴 P0 | 缺少 Workbook 级默认样式继承 | 多 Sheet 全局配置 | 中 | [4](#4-核心设计workbook--sheet-默认样式继承链) |
| 🔴 P0 | setRowStyle/setColStyle 接受 styleId 而非 styleObj | API 一致性 | 小 | [5](#5-api-统一重构) |
| 🔴 P0 | 行级样式无构造选项入口 | 声明式配置完整性 | 小 | [6](#6-构造选项补齐) |
| 🟡 P1 | cell[].style 语义不一致（替换 vs 合并） | 行为可预测性 | 小 | [7.1](#71-cellstyle-语义统一为增量合并) |
| 🟡 P1 | setRangeStyle 语义不一致（整行替换 vs 逐格合并） | 行为可预测性 | 中 | [7.2](#72-setrangestyle-语义统一为增量合并) |
| 🟡 P1 | 选区范围格式不统一（sr/sc/er/ec vs topRow/...） | API 一致性 | 小 | [7.3](#73-选区范围格式统一) |
| 🟡 P1 | Workbook 层样式 API 不完整 | Facade 完整性 | 小 | [5.3](#53-workbook-层-api-补齐) |
| 🟡 P1 | 缺少批量操作 API | 大范围设样式性能 | 中 | [5.4](#54-新增-batchstyleupdate-批量操作-api) |
| 🟢 P2 | border 属性声明但未渲染 | 功能缺失 | 中 | [8.1](#81-border-渲染实现) |
| 🟢 P2 | verticalAlign 声明但未渲染 | 功能缺失 | 小 | [8.2](#82-verticalalign-渲染实现) |
| 🟢 P2 | CellStyle/BorderStyle 类未使用 | 代码整洁 | 小 | [9.1](#91-清理-cellstyleborderstyle-死代码) |
| 🟢 P2 | 样式操作不支持撤销/重做 | 用户体验 | 中 | [9.2](#92-样式操作-command-化) |
| 🔵 P3 | 缺少 clearRangeStyle API | 便利性 | 小 | [5.5](#55-新增-clearrangestyle-api) |
| 🔵 P3 | 缺少样式属性校验 | 开发体验 | 小 | [9.3](#93-样式属性校验) |

---

## 4. 核心设计：Workbook → Sheet 默认样式继承链

### 4.1 设计目标

建立与 Excel "工作簿主题 → 工作表样式" 一致的层级关系：

```
全局硬编码默认 (DEFAULT_STYLE_ID)
    ↑ 继承
Workbook 级 defaultStyle
    ↑ 深度合并覆盖
Sheet 级 defaultStyle
```

### 4.2 当前问题详解

**问题 A：多 Sheet 重复配置**

```js
// ❌ 当前：每个 Sheet 必须重复写 defaultStyle
sheets: [
    { name: "Sheet1", defaultStyle: { fontSize: 14, fontFamily: "Microsoft YaHei", color: "#000" } },
    { name: "Sheet2", defaultStyle: { fontSize: 14, fontFamily: "Microsoft YaHei", color: "#000" } },  // 完全重复
]
```

**问题 B：浅合并导致属性丢失**

```js
// Workbook.#applySheetsConfig 中的合并逻辑：
const settings = { ...opts, ...sheetConfig };

// 顶层：设置了字体和颜色
opts.defaultStyle = { fontSize: 14, fontFamily: "Microsoft YaHei", color: "#000" }

// Sheet2 只想覆盖颜色
sheetConfig.defaultStyle = { color: "#333" }

// 实际结果：{ color: "#333" } — fontSize 和 fontFamily 丢失！
// 期望结果：{ fontSize: 14, fontFamily: "Microsoft YaHei", color: "#333" }
```

**问题 C：新增 Sheet 无法继承**

```js
const wb = new Workbook("grid", {
    defaultStyle: { fontSize: 14, fontFamily: "Microsoft YaHei" },
    sheets: [{ name: "Sheet1" }]
});
wb.initRender();
wb.addSheet("Sheet3");
// Sheet3 的 defaultStyle 是硬编码的 DEFAULT_STYLE_ID，不是用户配置的
```

### 4.3 改进方案

#### 4.3.1 Workbook 持有全局默认样式

```js
// Workbook.js
export class Workbook {
    /** Workbook 级默认样式对象（所有 Sheet 的全局基础） */
    #defaultStyle = null;

    /** 获取 Workbook 级默认样式 */
    get defaultStyle() {
        return this.#defaultStyle;
    }
}
```

#### 4.3.2 构造选项支持顶层 defaultStyle

```js
const wb = new Workbook("grid", {
    // ✅ Workbook 级：所有 Sheet 的全局默认
    defaultStyle: {
        fontSize: 14,
        fontFamily: "Microsoft YaHei",
        color: "#000",
    },

    sheets: [
        {
            name: "Sheet1",
            // 不需要再写 defaultStyle，自动继承顶层
        },
        {
            name: "Sheet2",
            // ✅ Sheet 级：在全局基础上深度合并覆盖
            defaultStyle: {
                color: "#333",  // 只覆盖颜色，fontSize 和 fontFamily 继承自顶层
            },
        },
    ],
});
```

#### 4.3.3 #applySheetsConfig 改为深度合并

```js
// Workbook.js
#applySheetsConfig(opts) {
    // 提取并保存 Workbook 级 defaultStyle
    if (opts.defaultStyle) {
        this.#defaultStyle = opts.defaultStyle;
    }

    for (const sheetConfig of opts.sheets) {
        const name = sheetConfig.name || this.#generateSheetName();
        const sheet = this.sheets.get(name);
        if (!sheet) continue;

        // 计算 Sheet 的有效 defaultStyle
        const effectiveDefaultStyle = this.#resolveDefaultStyle(sheetConfig.defaultStyle);

        const settings = { ...opts, ...sheetConfig };
        if (effectiveDefaultStyle) {
            settings.defaultStyle = effectiveDefaultStyle;
        }
        delete settings.sheets;
        SettingsApplier.apply({ sheet, renderEngine: this.renderEngine, settings });
    }
}

/**
 * 计算 Sheet 的有效默认样式
 * - 无 Sheet 级配置：继承 Workbook 级
 * - 有 Sheet 级配置：与 Workbook 级深度合并（Sheet 级覆盖同名属性）
 * - 均无配置：返回 null（使用全局硬编码 DEFAULT_STYLE_ID）
 */
#resolveDefaultStyle(sheetDefaultStyle) {
    if (!this.#defaultStyle && !sheetDefaultStyle) return null;
    if (!this.#defaultStyle) return sheetDefaultStyle;
    if (!sheetDefaultStyle) return this.#defaultStyle;
    return { ...this.#defaultStyle, ...sheetDefaultStyle };
}
```

> **样式对象扁平性约束**：`{ ...a, ...b }` 是浅层合并，仅覆盖同名顶层属性。当前所有样式属性均为扁平结构（`fontSize`、`fontWeight`、`color` 等），浅合并完全满足需求。**禁止将样式属性设计为嵌套对象**（如 `font: { size: 14, bold: true }`），否则浅合并会导致嵌套对象整体被替换而非内部合并。`border` 属性虽然是结构化对象，但它作为单一属性整体写入/读取，不参与部分覆盖，因此不受此约束影响。

#### 4.3.4 addSheet 自动继承 Workbook 级默认样式

```js
// Workbook.js
addSheet(name) {
    const sheet = new Sheet(name);
    if (this.renderEngine) this.#bindSheetEvents(sheet);

    const opts = this.#initOptions;
    sheet.rowColManager.ensureSize(opts?.startRows || CONFIG.DEFAULT_START_ROWS, opts?.startCols || CONFIG.DEFAULT_START_COLS);

    // ✅ 新增：继承 Workbook 级默认样式
    if (this.#defaultStyle) {
        sheet.setDefaultStyle(this.#defaultStyle);
    }

    this.sheets.set(name, sheet);
    this.#activateIfFirst(sheet);
    this.#refreshTabBar();
    return sheet;
}
```

#### 4.3.5 updateSettings 支持修改全局默认样式

```js
// Workbook.js
updateSettings(settings = {}) {
    this.#withActiveSheet((s) => {
        // 如果传入了 defaultStyle，更新 Workbook 级默认
        if (settings.defaultStyle) {
            this.#defaultStyle = settings.defaultStyle;
        }

        SettingsApplier.apply({ sheet: s, renderEngine: this.renderEngine, settings });
        this.render();
    });
}

// 新增：修改全局默认样式并应用到所有 Sheet
setDefaultStyle(styleObj) {
    this.#defaultStyle = styleObj;
    // 应用到所有 Sheet
    for (const sheet of this.sheets.values()) {
        sheet.setDefaultStyle(styleObj);
    }
    this.render();
}

getDefaultStyle() {
    return this.#defaultStyle || this.#withActiveSheet((s) => s.getDefaultStyle(), {});
}
```

### 4.4 继承效果对照

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 所有 Sheet 统一样式 | 每个 Sheet 重复写 `defaultStyle` | 顶层写一次，自动继承 |
| 某个 Sheet 定制样式 | 完全替换（丢失其他属性） | 深度合并（只覆盖指定属性） |
| 新增 Sheet | 使用硬编码默认 | 继承 Workbook 级默认 |
| 运行时修改全局默认 | 无法实现 | `wb.setDefaultStyle(styleObj)` |

---

## 5. API 统一重构

### 5.1 setRowStyle / setColStyle 参数类型统一

**原则**：所有公开样式 API 统一接受 `styleObj`，`stylePool` 成为纯内部实现细节。

#### 改动前

```js
// Sheet.js
setRowStyle(row, styleId) {
    this.#styleManager.setRowStyle(row, styleId);
}
setColStyle(col, styleId) {
    this.#styleManager.setColStyle(col, styleId);
}
```

用户必须：
```js
import { stylePool } from "./model/styles";
sheet.setRowStyle(0, stylePool.getStyleId({ backgroundColor: "yellow" }));
```

#### 改动后

```js
// Sheet.js
setRowStyle(row, styleObj) {
    const styleId = stylePool.getStyleId(styleObj);
    this.#styleManager.setRowStyle(row, styleId);
}
setColStyle(col, styleObj) {
    const styleId = stylePool.getStyleId(styleObj);
    this.#styleManager.setColStyle(col, styleId);
}
```

用户只需：
```js
sheet.setRowStyle(0, { backgroundColor: "yellow" });
```

#### 受影响的调用方

| 文件 | 当前调用 | 改动后 |
|------|---------|--------|
| `main.js:222` | `sheet.setRowStyle(row, stylePool.getStyleId({...}))` | `sheet.setRowStyle(row, {...})` |
| `ColumnTypeManager.js:150` | `this.#sheet.setColStyle(c, stylePool.getStyleId(config.style))` | `this.#sheet.setColStyle(c, config.style)` |
| `ContextMenuStrategy.js:36` | `s.setRowStyle(r, styleId)` | `s.setRowStyle(r, styleObj)` |

> **说明**：本项目为新项目，无需向后兼容。`setRowStyle`/`setColStyle` 仅接受 `styleObj`，不再支持 `styleId`（number）参数。所有调用方统一改为传入样式对象。

### 5.2 行号坐标体系统一

**原则**：所有公开 API 统一使用 `pageRow`（页面行号），内部自动转换。

#### 改动前

| API | 参数形态 |
|-----|---------|
| `setRowStyle(row, styleId)` | realRow |
| `clearRowStyle(row)` | realRow |
| `setCellStyle(r, c, styleObj)` | pageRow |
| `resolveStyle(r, c)` | pageRow |

#### 改动后

```js
// Sheet.js — 统一使用 pageRow
setRowStyle(row, styleObj) {
    const realRow = this.toRealRow(row);
    const styleId = stylePool.getStyleId(styleObj);
    this.#styleManager.setRowStyle(realRow, styleId);
    this.#invalidateAll();
}

clearRowStyle(row) {
    const realRow = this.toRealRow(row);
    this.#styleManager.clearRowStyle(realRow);
    this.#invalidateAll();
}
```

> **注意**：`SheetStyleManager` 内部方法仍使用 `realRow`，转换在 `Sheet` 层完成。

### 5.3 Workbook 层 API 补齐

当前 Workbook 只暴露了部分样式 API，补齐缺失项：

```js
// Workbook.js — 补齐样式 API

setRowStyle(row, styleObj) {
    this.#withActiveSheet((s) => {
        s.setRowStyle(row, styleObj);
        this.render();
    });
}

setColStyle(col, styleObj) {
    this.#withActiveSheet((s) => {
        s.setColStyle(col, styleObj);
        this.render();
    });
}

clearCellStyle(row, col) {
    this.#withActiveSheet((s) => {
        s.clearCellStyle(row, col);
        this.render();
    });
}

clearRowStyle(row) {
    this.#withActiveSheet((s) => {
        s.clearRowStyle(row);
        this.render();
    });
}

clearColStyle(col) {
    this.#withActiveSheet((s) => {
        s.clearColStyle(col);
        this.render();
    });
}

clearRangeStyle(range) {
    this.#withActiveSheet((s) => {
        s.clearRangeStyle(range);
        this.render();
    });
}
```

### 5.4 新增 batchStyleUpdate 批量操作 API

连续设置多个样式时，避免每次都触发 `invalidateCache()` + `#invalidateAll()`：

```js
// Sheet.js
batchStyleUpdate(fn) {
    this.#batchOp.begin();
    try {
        fn(this);
    } finally {
        this.#batchOp.end();
        this.#invalidateAll();
    }
}

// Workbook.js
batchStyleUpdate(fn) {
    this.#withActiveSheet((s) => {
        s.batchStyleUpdate(fn);
        this.render();
    });
}
```

**使用示例**：

```js
// 改进前：3 次全量失效 + 3 次重绘
sheet.setCellStyle(0, 0, { fontWeight: "bold" });
sheet.setCellStyle(0, 1, { fontWeight: "bold" });
sheet.setCellStyle(0, 2, { fontWeight: "bold" });

// 改进后：1 次失效 + 1 次重绘
sheet.batchStyleUpdate((s) => {
    s.setCellStyle(0, 0, { fontWeight: "bold" });
    s.setCellStyle(0, 1, { fontWeight: "bold" });
    s.setCellStyle(0, 2, { fontWeight: "bold" });
});
```

**实现要点**：`batchStyleUpdate` 内部需要抑制 `setCellStyle` 等方法中的 `#invalidateAll()` 调用，仅在 `finally` 中触发一次。可通过 `BatchOperationManager` 的 `begin()/end()` 状态判断实现。

### 5.5 新增 clearRangeStyle API

```js
// SheetStyleManager.js
clearRangeStyle(range) {
    const { topRow, topCol, bottomRow, bottomCol } = range;

    for (let r = topRow; r <= bottomRow; r++) {
        const realR = this.#sheet.toRealRow(r);
        this.#rowStyles.delete(realR);
        for (let c = topCol; c <= bottomCol; c++) {
            this.clearCellStyle(r, c);
        }
    }
    this.invalidateCache();
}

// Sheet.js
clearRangeStyle(range) {
    if (!this.#ensureWritable()) return;
    this.#styleManager.clearRangeStyle(range);
    this.#invalidateAll();
}
```

---

## 6. 构造选项补齐

### 6.1 新增 rowStyles 构造选项

#### 配置格式

```js
{
    sheets: [{
        name: "Sheet1",

        // ✅ 新增：行级样式配置
        // 对象形式：行号 → 样式对象
        rowStyles: {
            0: { fontWeight: "bold", backgroundColor: "#e8f4fd" },
            5: { backgroundColor: "#f0f0f0" },
        },
    }]
}
```

#### SettingsApplier 处理

```js
// SettingsApplier.js
static apply({ sheet, renderEngine, settings }) {
    // ... 现有逻辑 ...

    // ✅ 新增：应用行级样式
    if (settings.rowStyles) {
        SettingsApplier.#applyRowStyles(sheet, settings.rowStyles);
    }

    // ✅ 新增：应用列级样式（独立于 columns 的列样式配置）
    if (settings.colStyles) {
        SettingsApplier.#applyColStyles(sheet, settings.colStyles);
    }
}

/** @param {import("../Sheet.js").Sheet} sheet */
static #applyRowStyles(sheet, rowStyles) {
    if (!isObject(rowStyles)) return;
    for (const [row, styleObj] of Object.entries(rowStyles)) {
        if (!styleObj || typeof styleObj !== 'object') continue;
        sheet.setRowStyle(Number(row), styleObj);
    }
}

/** @param {import("../Sheet.js").Sheet} sheet */
static #applyColStyles(sheet, colStyles) {
    if (!isObject(colStyles)) return;
    for (const [col, styleObj] of Object.entries(colStyles)) {
        if (!styleObj || typeof styleObj !== 'object') continue;
        sheet.setColStyle(Number(col), styleObj);
    }
}
```

### 6.2 新增 colStyles 构造选项

当前列级样式只能通过 `columns[].style` 间接设置。新增独立的 `colStyles` 选项，用于不需要配置列类型时直接设置列样式：

```js
{
    sheets: [{
        name: "Sheet1",

        // ✅ 新增：列级样式配置（独立于 columns）
        colStyles: {
            0: { textAlign: "left", fontWeight: "bold" },
            3: { textAlign: "center" },
        },
    }]
}
```

> **注意**：`colStyles` 与 `columns[].style` 可能冲突。当两者对同一列都设置了样式时，`columns[].style` 优先（因为 `applyColumnsConfig` 在 `colStyles` 之后执行，会覆盖）。

### 6.3 新增 rangeStyles 构造选项

用于批量设置选区样式，适用于初始化时需要为多个区域设置统一样式的场景：

```js
{
    sheets: [{
        name: "Sheet1",

        // ✅ 新增：批量选区样式
        rangeStyles: [
            { range: { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 5 }, style: { fontWeight: "bold" } },
            { range: { topRow: 1, topCol: 3, bottomRow: 10, bottomCol: 3 }, style: { backgroundColor: "#fff3cd" } },
        ],
    }]
}
```

#### SettingsApplier 处理

```js
// SettingsApplier.js
static #applyRangeStyles(sheet, rangeStyles) {
    if (!Array.isArray(rangeStyles)) return;
    for (const rs of rangeStyles) {
        if (!rs.range || !rs.style) continue;
        sheet.setRangeStyle(rs.range, rs.style);
    }
}
```

### 6.4 构造选项完整对照（改进后）

| 样式层级 | 构造选项 | 运行时 API | 状态 |
|---------|---------|-----------|------|
| 默认样式（Workbook 级） | 顶层 `defaultStyle` | `wb.setDefaultStyle(styleObj)` | ✅ 新增 |
| 默认样式（Sheet 级） | `sheets[].defaultStyle` | `sheet.setDefaultStyle(styleObj)` | ✅ 改进（深度合并） |
| 列级样式 | `columns[].style` / `colStyles` | `sheet.setColStyle(col, styleObj)` | ✅ 新增 `colStyles` |
| 行级样式 | `rowStyles` | `sheet.setRowStyle(row, styleObj)` | ✅ 新增 |
| 单元格样式 | `cell[]` | `sheet.setCellStyle(r, c, styleObj)` | ✅ |
| 动态样式 | `cells` 函数 | — | ✅ |
| 条件格式 | `conditionalStyles` | `sheet.addConditionalRule()` | ✅ |
| 批量选区样式 | `rangeStyles` | `sheet.setRangeStyle(range, styleObj)` | ✅ 新增 |

---

## 7. 语义统一

### 7.1 cell[].style 语义统一为增量合并

#### 当前问题

[Sheet.js applyCellConfig](../src/workbook/Sheet.js) 中：

```js
// 有 value 时：style 是替换（整个 Cell 重建）
if (value !== undefined) {
    const styleId = style ? stylePool.getStyleId(style) : cell?.styleId || 0;
    this.cellStore.set(r, c, new Cell(value, styleId, isDisabled));
}
// 无 value 时：走 setCellStyle（增量合并）
else if (style) {
    this.setCellStyle(r, c, style);
}
```

同一个 `cell[].style`，因是否同时提供了 `value` 而产生不同语义。

#### 改进方案

统一为增量合并语义：

```js
applyCellConfig() {
    for (const item of this.cellConfig) {
        if (item.row == null || item.col == null) continue;
        const { row: r, col: c, value, style, disabled, readOnly } = item;
        this.rowColManager.ensureSize(r + 1, c + 1);

        const cell = this.cellStore.get(r, c);

        // 统一：先获取当前样式，再合并
        const existingStyleId = cell?.styleId || 0;
        const existingStyle = existingStyleId ? stylePool.getStyle(existingStyleId) : {};
        const mergedStyle = style ? { ...existingStyle, ...style } : existingStyle;
        const newStyleId = stylePool.getStyleId(mergedStyle);

        const isDisabled = disabled ?? readOnly ?? cell?.disabled ?? false;
        const cellValue = value !== undefined ? value : (cell?.value ?? "");

        this.cellStore.set(r, c, new Cell(cellValue, newStyleId, isDisabled, cell?.formula));

        if (disabled === true || readOnly === true) {
            const updatedCell = this.cellStore.get(r, c);
            if (updatedCell && !updatedCell.disabled) {
                this.cellStore.set(r, c, new Cell(updatedCell.value, updatedCell.styleId, true, updatedCell.formula));
            }
        }
    }
    this.#invalidateAll();
}
```

### 7.2 setRangeStyle 语义统一为增量合并

#### 当前问题

[SheetStyleManager.setRangeStyle](../src/workbook/SheetStyleManager.js) 中：

```js
setRangeStyle(range, styleObj) {
    const styleId = stylePool.getStyleId(styleObj);

    // 整行优化：直接替换行样式（丢失原有行样式）
    if (isFullRowRange) {
        this.#rowStyles.set(realR, styleId);  // ← 替换！
    }

    // 逐单元格：增量合并
    this.setCellStyle(r, c, styleObj);  // ← 合并！
}
```

#### 改进方案

整行/整列优化路径也采用合并语义：

```js
setRangeStyle(range, styleObj) {
    const { topRow, topCol, bottomRow, bottomCol } = range;
    const rowColManager = this.#sheet.rowColManager;

    // 整行选区优化：合并而非替换
    if (topCol === 0 && bottomCol >= rowColManager.colCount - 1) {
        for (let r = topRow; r <= bottomRow; r++) {
            const realR = this.#sheet.toRealRow(r);
            const existingId = this.#rowStyles.get(realR);
            const existing = existingId ? stylePool.getStyle(existingId) : {};
            const merged = { ...existing, ...styleObj };
            this.#rowStyles.set(realR, stylePool.getStyleId(merged));
        }
        this.invalidateCache();
        return;
    }

    // 整列选区优化：合并而非替换
    if (topRow === 0 && bottomRow >= rowColManager.rowCount - 1) {
        for (let c = topCol; c <= bottomCol; c++) {
            const existingId = this.#colStyles.get(c);
            const existing = existingId ? stylePool.getStyle(existingId) : {};
            const merged = { ...existing, ...styleObj };
            this.#colStyles.set(c, stylePool.getStyleId(merged));
        }
        this.invalidateCache();
        return;
    }

    // 一般情况：逐单元格设置（已是合并语义）
    for (let r = topRow; r <= bottomRow; r++) {
        for (let c = topCol; c <= bottomCol; c++) {
            if (!this.#sheet.isDisabled(r, c)) {
                this.setCellStyle(r, c, styleObj);
            }
        }
    }
    this.invalidateCache();
}
```

### 7.3 选区范围格式统一

#### 当前问题

三种选区表达方式，三种不同的字段命名：

```js
// conditionalStyles：sr/sc/er/ec 缩写
{ range: { sr: 0, sc: 0, er: 100, ec: 25 } }

// setRangeStyle：topRow/topCol/bottomRow/bottomCol 全称
{ topRow: 0, topCol: 0, bottomRow: 100, bottomCol: 25 }

// mergeCells：row/col/rowspan/colspan
{ row: 0, col: 0, rowspan: 2, colspan: 3 }
```

#### 改进方案

统一使用 `topRow/topCol/bottomRow/bottomCol` 全称格式，不再支持 `sr/sc/er/ec` 缩写：

```js
// ❌ 旧格式（不再支持）
conditionalStyles: [{ range: { sr: 0, sc: 0, er: 100, ec: 25 } }]

// ✅ 新格式（统一）
conditionalStyles: [{ range: { topRow: 0, topCol: 0, bottomRow: 100, bottomCol: 25 } }]
```

`mergeCells` 的 `row/col/rowspan/colspan` 格式因语义不同（描述合并区域而非选区），保持不变。

---

## 8. 渲染层补全

### 8.1 border 渲染实现

#### 当前状态

`CellStyle` 声明了 `border` 属性，`resolveStyle` 会合并 `border`，但 `TileRenderer.#drawCellBorder` 完全忽略它，始终绘制统一网格线。

#### 设计方案

```js
// TileRenderer.js
#drawCellBorder(ctx, sheet, r, c, drawX, drawY, w, h, merge) {
    const style = sheet.resolveStyle(r, c);

    if (style.border) {
        // 自定义边框渲染
        const { top, right, bottom, left } = this.#normalizeBorder(style.border);
        ctx.save();
        if (top) { this.#drawBorderEdge(ctx, drawX, drawY, drawX + w, drawY, top); }
        if (right) { this.#drawBorderEdge(ctx, drawX + w, drawY, drawX + w, drawY + h, right); }
        if (bottom) { this.#drawBorderEdge(ctx, drawX, drawY + h, drawX + w, drawY + h, bottom); }
        if (left) { this.#drawBorderEdge(ctx, drawX, drawY, drawX, drawY + h, left); }
        ctx.restore();
    } else if (!merge) {
        // 默认网格线
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drawX + w - 0.5, drawY);
        ctx.lineTo(drawX + w - 0.5, drawY + h);
        ctx.moveTo(drawX, drawY + h - 0.5);
        ctx.lineTo(drawX + w, drawY + h - 0.5);
        ctx.stroke();
    }
}

#drawBorderEdge(ctx, x1, y1, x2, y2, borderDef) {
    ctx.strokeStyle = borderDef.color || "#000";
    ctx.lineWidth = borderDef.width || 1;
    if (borderDef.style === "dashed") {
        ctx.setLineDash([4, 2]);
    } else if (borderDef.style === "dotted") {
        ctx.setLineDash([1, 2]);
    } else {
        ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(x1 + 0.5, y1 + 0.5);
    ctx.lineTo(x2 + 0.5, y2 + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
}

#normalizeBorder(border) {
    // 简写格式：border 为单个对象时，四边相同
    if (!border) return {};
    if (border.top || border.right || border.bottom || border.left) {
        return border;
    }
    // 简写：{ width, style, color } → 四边相同
    return { top: border, right: border, bottom: border, left: border };
}
```

#### border 配置格式

```js
// 简写：四边相同
{ border: { width: 2, style: "solid", color: "#000" } }

// 完整：每边独立
{
    border: {
        top: { width: 2, style: "solid", color: "#000" },
        right: { width: 1, style: "dashed", color: "#999" },
        bottom: { width: 2, style: "solid", color: "#000" },
        left: null,  // 无左边框
    }
}
```

### 8.2 verticalAlign 渲染实现

#### 当前状态

`TileRenderer.#drawCellText` 始终硬编码 `ctx.textBaseline = "middle"`，忽略 `finalStyle.verticalAlign`。

#### 改进方案

```js
// TileRenderer.js — #drawCellText 中
const verticalAlign = finalStyle.verticalAlign || "middle";
const baselineMap = {
    top: "top",
    middle: "middle",
    bottom: "bottom",
};
ctx.textBaseline = baselineMap[verticalAlign] || "middle";

// 文字 Y 坐标计算也需调整
let textY;
if (verticalAlign === "top") {
    textY = Math.round(drawY + fontSize / 2 + 2);
} else if (verticalAlign === "bottom") {
    textY = Math.round(drawY + h - fontSize / 2 - 2);
} else {
    textY = Math.round(drawY + h / 2);
}
```

---

## 9. 其他改进

### 9.1 清理 CellStyle/BorderStyle 死代码

[styles/index.js](../src/model/styles/index.js) 中 `CellStyle` 和 `BorderStyle` 类从未被实例化，且 `CellStyle` 的默认值与 `DEFAULT_STYLE_ID` 不一致（`color: "#000"` vs `color: "#222"`）。

#### 方案 A（推荐）：删除类，改为静态校验

```js
// styles/index.js — 删除 CellStyle、BorderStyle 类，新增校验
export const CELL_STYLE_PROPERTIES = new Set([
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'color', 'backgroundColor', 'textAlign', 'verticalAlign',
    'textDecoration', 'border',
]);

export function validateStyleProperties(styleObj) {
    if (!styleObj || typeof styleObj !== 'object') return;
    for (const key of Object.keys(styleObj)) {
        if (!CELL_STYLE_PROPERTIES.has(key)) {
            console.warn(`[Style] Unknown property: "${key}"`);
        }
    }
}
```

#### 方案 B：保留类但修正默认值

如果未来需要类型约束，修正 `CellStyle` 默认值与 `DEFAULT_STYLE_ID` 一致：

```js
export class CellStyle {
    constructor({
        color = "#222",  // ← 修正：与 DEFAULT_STYLE_ID 一致
        ...
    } = {}) { ... }
}
```

### 9.2 样式操作 Command 化

当前 `setCell` 使用 `SetCellCommand` 支持撤销，但纯样式操作（`setCellStyle`、`setRowStyle` 等）没有 Command 包装。

#### 设计方案

```js
// model/command/SetCellStyleCommand.js
export class SetCellStyleCommand {
    constructor(cellStore, row, col, oldStyleId, newStyleId) {
        this.cellStore = cellStore;
        this.row = row;
        this.col = col;
        this.oldStyleId = oldStyleId;
        this.newStyleId = newStyleId;
    }

    redo() {
        const cell = this.cellStore.get(this.row, this.col);
        if (cell) {
            this.cellStore.set(this.row, this.col,
                new Cell(cell.value, this.newStyleId, cell.disabled, cell.formula));
        }
    }

    undo() {
        const cell = this.cellStore.get(this.row, this.col);
        if (cell) {
            this.cellStore.set(this.row, this.col,
                new Cell(cell.value, this.oldStyleId, cell.disabled, cell.formula));
        }
    }
}
```

```js
// SheetStyleManager.js — setCellStyle 改用 Command
setCellStyle(r, c, styleObj) {
    const realR = this.#sheet.toRealRow(r);
    this.#sheet.rowColManager.ensureSize(realR + 1, c + 1);
    const cell = this.#sheet.cellStore.get(realR, c);
    const currentStyleId = cell?.styleId || 0;
    const currentStyle = currentStyleId ? stylePool.getStyle(currentStyleId) : {};
    const mergedStyle = { ...currentStyle, ...styleObj };
    const newStyleId = stylePool.getStyleId(mergedStyle);
    const value = cell?.value ?? "";

    // ✅ 使用 Command 支持撤销
    const cmd = new SetCellStyleCommand(
        this.#sheet.cellStore, realR, c, currentStyleId, newStyleId
    );
    this.#sheet.history.push(cmd);
    cmd.redo();
    this.invalidateCache();
}
```

> **注意**：行级/列级样式的 Command 化更复杂（需要记录 Map 的变更），建议作为 P2 优先级延后实施。

#### 行/列样式 Command 化的复杂性

行/列样式存储在 `#rowStyles` / `#colStyles` Map 中，与单元格样式（`cell.styleId`）不同：

- 单元格：有明确的 `oldStyleId → newStyleId`，Command 只需记录这两个值
- 行/列：从 Map 中读取旧值，且 `setRowStyle` 和 `setRangeStyle`（整行选区）都会写 `#rowStyles`，产生交叉覆盖

如果直接为每个操作创建独立 Command，撤销顺序难以保证正确性。例如：

```js
sheet.setRowStyle(0, { backgroundColor: "yellow" });     // Command A: rowStyles[0] = id1
sheet.setRangeStyle({ topRow:0, topCol:0, bottomRow:0, bottomCol:99 }, { fontWeight: "bold" });  // Command B: rowStyles[0] = id2 (合并后)
// 撤销 B 时，需要恢复到 id1 而非空，但 Command B 如何知道 id1 的存在？
```

#### StyleChangeRecorder 设计

为解决上述问题，引入 `StyleChangeRecorder` 统一记录样式变更：

```js
// model/command/StyleChangeRecorder.js
export class StyleChangeRecorder {
    #changes = [];

    /** 记录一次样式变更 */
    record(type, key, oldStyleId, newStyleId) {
        this.#changes.push({ type, key, oldStyleId, newStyleId });
    }

    /** 生成可撤销的 Command */
    buildCommand(sheetStyleManager) {
        return new StyleChangeCommand(sheetStyleManager, [...this.#changes]);
    }

    /** 清空记录 */
    reset() {
        this.#changes = [];
    }
}

// model/command/StyleChangeCommand.js
export class StyleChangeCommand {
    #styleManager;
    #changes;

    constructor(styleManager, changes) {
        this.#styleManager = styleManager;
        this.#changes = changes;  // [{ type: 'row'|'col'|'cell', key, oldStyleId, newStyleId }]
    }

    redo() {
        for (const { type, key, newStyleId } of this.#changes) {
            this.#styleManager.applyStyleId(type, key, newStyleId);
        }
    }

    undo() {
        // 逆序撤销，确保依赖关系正确
        for (let i = this.#changes.length - 1; i >= 0; i--) {
            const { type, key, oldStyleId } = this.#changes[i];
            this.#styleManager.applyStyleId(type, key, oldStyleId);
        }
    }
}
```

**使用方式**：`SheetStyleManager` 在每次样式变更前，先通过 `StyleChangeRecorder` 记录旧值，再执行变更，最后生成 Command 推入 History：

```js
setRowStyle(row, styleId) {
    const oldStyleId = this.#rowStyles.get(row) || 0;
    this.#recorder.record('row', row, oldStyleId, styleId);
    this.#rowStyles.set(row, styleId);
    this.invalidateCache();
}
```

`batchStyleUpdate` 结束时，一次性将 recorder 中积累的所有变更打包为单个 `StyleChangeCommand`，确保批量操作的撤销是原子的。

### 9.3 样式属性校验

在开发模式下，对用户传入的样式对象进行属性名校验，帮助发现拼写错误：

```js
// StylePool.getStyleId 中增加校验（仅 dev 模式）
getStyleId(obj = {}) {
    if (process.env.NODE_ENV !== 'production') {
        validateStyleProperties(obj);
    }
    // ... 现有逻辑
}
```

---

## 10. 实施路线图

### Phase 1：P0 核心修复（1-2 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| Workbook 级 defaultStyle 继承 | `Workbook.js` | 新增 `#defaultStyle`、`#resolveDefaultStyle()`、修改 `#applySheetsConfig()`、修改 `addSheet()` |
| setRowStyle/setColStyle 参数统一 | `Sheet.js` | 改为仅接受 `styleObj`，内部转换 |
| 行号坐标统一 | `Sheet.js` | `setRowStyle`/`clearRowStyle` 内部加 `toRealRow()` |
| 更新调用方 | `main.js`、`ColumnTypeManager.js`、`ContextMenuStrategy.js` | 移除 `stylePool.getStyleId()` 调用，改为直接传入样式对象 |

### Phase 2：P1 构造选项 & 语义统一（1-2 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 新增 rowStyles/colStyles 构造选项 | `SettingsApplier.js` | 新增 `#applyRowStyles()`、`#applyColStyles()` |
| 新增 rangeStyles 构造选项 | `SettingsApplier.js` | 新增 `#applyRangeStyles()` |
| cell[].style 语义统一 | `Sheet.js` | `applyCellConfig()` 统一为合并语义 |
| setRangeStyle 语义统一 | `SheetStyleManager.js` | 整行/整列路径改为合并 |
| Workbook 层 API 补齐 | `Workbook.js` | 新增 `setRowStyle`/`setColStyle`/`clearCellStyle`/`clearRowStyle`/`clearColStyle`/`clearRangeStyle` |
| batchStyleUpdate API | `Sheet.js`、`Workbook.js` | 新增批量操作 API |
| 选区范围格式统一 | `ConditionalFormatManager.js` | 支持 `topRow/topCol/bottomRow/bottomCol` 格式 |

### Phase 3：P2 渲染补全 & 代码清理（2-3 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| border 渲染 | `TileRenderer.js` | `#drawCellBorder` 读取 `style.border` |
| verticalAlign 渲染 | `TileRenderer.js` | `#drawCellText` 读取 `style.verticalAlign` |
| 清理死代码 | `styles/index.js` | 删除 `CellStyle`/`BorderStyle`，新增属性校验 |
| 样式 Command 化 | 新增 `SetCellStyleCommand.js`、`StyleChangeRecorder.js`、`StyleChangeCommand.js` | `setCellStyle` 支持撤销；行/列样式通过 Recorder 统一记录变更 |
| 更新文档 | `docs/SheetStyleManager.md`、`docs/cell-cells.md` | 同步 API 变更 |

### Phase 4：P3 便利性改进（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| clearRangeStyle API | `SheetStyleManager.js`、`Sheet.js`、`Workbook.js` | 新增选区样式清除 |
| 样式属性校验 | `styles/index.js` | dev 模式下校验未知属性 |

---

## 11. 迁移指南

### 11.1 setRowStyle / setColStyle 参数迁移

```js
// ❌ 旧写法（styleId）— 不再支持
import { stylePool } from "./model/styles";
sheet.setRowStyle(0, stylePool.getStyleId({ backgroundColor: "yellow" }));
sheet.setColStyle(2, stylePool.getStyleId({ textAlign: "right" }));

// ✅ 新写法（styleObj）— 统一使用样式对象
sheet.setRowStyle(0, { backgroundColor: "yellow" });
sheet.setColStyle(2, { textAlign: "right" });
```

> **注意**：本项目为新项目，不提供旧写法兼容。所有 `setRowStyle`/`setColStyle` 调用必须改为传入样式对象，`stylePool` 不再对外暴露。

### 11.2 defaultStyle 迁移

```js
// ❌ 旧写法：每个 Sheet 重复声明
sheets: [
    { name: "Sheet1", defaultStyle: { fontSize: 14, fontFamily: "Microsoft YaHei" } },
    { name: "Sheet2", defaultStyle: { fontSize: 14, fontFamily: "Microsoft YaHei" } },
]

// ✅ 新写法：顶层声明一次
defaultStyle: { fontSize: 14, fontFamily: "Microsoft YaHei" },
sheets: [
    { name: "Sheet1" },
    { name: "Sheet2", defaultStyle: { color: "#333" } },  // 可选覆盖
]
```

### 11.3 cell[].style 语义迁移

```js
// 旧行为：同时提供 value 和 style 时，style 替换原有样式
{ row: 0, col: 0, value: "标题", style: { fontWeight: "bold" } }
// 如果 (0,0) 原有 styleId=3（如 backgroundColor: "red"），结果只有 fontWeight

// 新行为：style 与原有样式合并
{ row: 0, col: 0, value: "标题", style: { fontWeight: "bold" } }
// 结果：{ backgroundColor: "red", fontWeight: "bold" }（合并）
```

如需替换语义，显式清除后再设置：

```js
sheet.clearCellStyle(0, 0);
sheet.setCellStyle(0, 0, { fontWeight: "bold" });
```

### 11.4 setRangeStyle 语义迁移

```js
// 旧行为：整行选区时替换行样式
sheet.setRangeStyle({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 999 }, { fontWeight: "bold" });
// 如果第 0 行原有 backgroundColor: "yellow"，结果只有 fontWeight

// 新行为：整行选区时合并行样式
// 结果：{ backgroundColor: "yellow", fontWeight: "bold" }（合并）
```

### 11.5 conditionalStyles 选区格式迁移

```js
// ❌ 旧格式（不再支持）
conditionalStyles: [{ range: { sr: 0, sc: 0, er: 100, ec: 25 } }]

// ✅ 新格式
conditionalStyles: [{ range: { topRow: 0, topCol: 0, bottomRow: 100, bottomCol: 25 } }]
```

---

## 12. 风险与挑战

### 12.1 破坏性变更风险

本项目为新项目，无需考虑向后兼容。以下变更均为破坏性变更，需同步更新所有调用方：

| 变更 | 影响范围 | 应对措施 |
|------|---------|---------|
| `setRowStyle`/`setColStyle` 仅接受 `styleObj` | `main.js`、`ColumnTypeManager.js`、`ContextMenuStrategy.js` | 全部改为传入样式对象，移除 `stylePool.getStyleId()` 调用 |
| `cell[].style` 统一为合并语义 | 依赖替换语义的代码 | 使用 `clearCellStyle` + `setCellStyle` 替代 |
| `setRangeStyle` 统一为合并语义 | 整行/整列优化路径 | 合并语义更符合直觉，影响面小 |
| `defaultStyle` 深度合并 | Sheet 级 defaultStyle 不再完全替换 | 深度合并更符合用户预期 |
| `conditionalStyles` 选区格式统一 | `sr/sc/er/ec` 格式不再支持 | 全部改为 `topRow/topCol/bottomRow/bottomCol` |

### 12.2 性能风险

| 变更 | 风险 | 缓解措施 |
|------|------|---------|
| `setRowStyle`/`setColStyle` 内部调用 `stylePool.getStyleId()` | 每次调用多一次 normalize 计算 | 开销极小（normalize 是 O(k)，k=属性数） |
| `setRangeStyle` 合并语义 | 整行/整列路径需读取现有样式再合并 | 比替换多一次 `stylePool.getStyle()`，开销可忽略 |
| border 渲染 | 每个单元格额外检查 `style.border` | 快速路径：无 border 时直接走默认网格线 |

### 12.3 测试用例设计

测试框架：Vitest。测试文件组织遵循项目现有 `tests/` 目录结构。

#### 12.3.1 需修改的现有测试用例

以下现有测试因 API 变更需要同步修改：

| 测试文件 | 需修改的用例 | 修改原因 |
|---------|------------|---------|
| `tests/workbook/SheetStyleManager.test.js` | "should set and retrieve row style" | `setRowStyle` 改为接受 `styleObj`，移除手动 `stylePool.getStyleId()` |
| `tests/workbook/SheetStyleManager.test.js` | "should set and retrieve column style" | `setColStyle` 改为接受 `styleObj`，移除手动 `stylePool.getStyleId()` |
| `tests/workbook/SheetStyleManager.test.js` | "should clear row style" | `clearRowStyle` 入参改为 pageRow，需验证内部 `toRealRow` 转换 |
| `tests/workbook/SheetStyleManager.test.js` | "should clear column style" | 同上 |
| `tests/workbook/SheetStyleManager.test.js` | "should merge column style over default" | `setColStyle` 改为接受 `styleObj` |
| `tests/workbook/SheetStyleManager.test.js` | "should merge row style over column style" | `setRowStyle` 改为接受 `styleObj` |
| `tests/workbook/SheetStyleManager.test.js` | "should merge cell style over row style" | `setRowStyle` 改为接受 `styleObj` |
| `tests/workbook/SheetStyleManager.test.js` | "should set row style for full-row range" | `setRangeStyle` 整行路径改为合并语义 |
| `tests/workbook/SheetStyleManager.test.js` | "should set column style for full-column range" | `setRangeStyle` 整列路径改为合并语义 |
| `tests/model/styles/StylePool.test.js` | "BorderStyle" describe 块全部用例 | `BorderStyle` 类将被删除 |
| `tests/model/styles/StylePool.test.js` | "CellStyle" describe 块全部用例 | `CellStyle` 类将被删除 |

**BorderStyle / CellStyle 测试用例删除后的替代**：

```js
// 删除：BorderStyle 和 CellStyle 类的测试
// 新增：样式属性白名单校验测试（如果实现了 CellStyle.validate）
describe("CellStyle - validate", () => {
    it("should not warn for valid properties", () => {
        const warnings = [];
        const origWarn = console.warn;
        console.warn = (msg) => warnings.push(msg);
        CellStyle.validate({ fontSize: 14, color: "red" });
        console.warn = origWarn;
        expect(warnings).toHaveLength(0);
    });

    it("should warn for unknown properties", () => {
        const warnings = [];
        const origWarn = console.warn;
        console.warn = (msg) => warnings.push(msg);
        CellStyle.validate({ fontSize: 14, unknownProp: "value" });
        console.warn = origWarn;
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("unknownProp");
    });
});
```

#### 12.3.2 新增测试用例

##### A. Workbook 级默认样式继承（对应 Phase 1）

文件：`tests/workbook/Workbook.defaultStyle.test.js`（新建）

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Workbook - defaultStyle inheritance", () => {
    it("should apply top-level defaultStyle to all sheets", () => {
        // 顶层 defaultStyle 应传播到所有 Sheet
    });

    it("should deep-merge sheet-level defaultStyle over workbook-level", () => {
        // Sheet 级只覆盖指定属性，其他继承自顶层
        // 例如：顶层 { fontSize: 14, color: "#000" }
        //       Sheet 级 { color: "#333" }
        //       结果 { fontSize: 14, color: "#333" }
    });

    it("should use sheet-level defaultStyle alone when no workbook-level", () => {
        // 无顶层 defaultStyle 时，Sheet 级 defaultStyle 独立生效
    });

    it("should fall back to DEFAULT_STYLE_ID when no defaultStyle configured", () => {
        // 均未配置时，回退到硬编码全局默认
    });

    it("should inherit workbook defaultStyle when adding new sheet via addSheet()", () => {
        // addSheet 创建的 Sheet 应继承 Workbook 级 defaultStyle
    });

    it("should not affect other sheets when one sheet changes its defaultStyle at runtime", () => {
        // Sheet A 修改 defaultStyle 不影响 Sheet B
    });

    it("should preserve flat style structure during deep merge", () => {
        // 验证 { ...a, ...b } 浅合并对扁平样式对象的正确性
        // 确保不会出现嵌套属性丢失
    });
});
```

##### B. API 参数类型统一（对应 Phase 1）

文件：`tests/workbook/SheetStyleManager.test.js`（追加）

```js
describe("SheetStyleManager - API parameter unification", () => {
    it("should accept styleObj in setRowStyle", () => {
        const ssm = createSSM();
        ssm.setRowStyle(0, { backgroundColor: "yellow" });
        const styleId = ssm.rowStyles.get(0);
        expect(styleId).toBeDefined();
        const style = stylePool.getStyle(styleId);
        expect(style.backgroundColor).toBe("yellow");
    });

    it("should accept styleObj in setColStyle", () => {
        const ssm = createSSM();
        ssm.setColStyle(2, { textAlign: "right" });
        const styleId = ssm.colStyles.get(2);
        expect(styleId).toBeDefined();
        const style = stylePool.getStyle(styleId);
        expect(style.textAlign).toBe("right");
    });

    it("should throw TypeError when setRowStyle receives number", () => {
        const ssm = createSSM();
        expect(() => ssm.setRowStyle(0, 5)).toThrow(TypeError);
    });

    it("should throw TypeError when setColStyle receives number", () => {
        const ssm = createSSM();
        expect(() => ssm.setColStyle(0, 5)).toThrow(TypeError);
    });

    it("should throw TypeError when setRowStyle receives null", () => {
        const ssm = createSSM();
        expect(() => ssm.setRowStyle(0, null)).toThrow(TypeError);
    });

    it("should throw TypeError when setRowStyle receives undefined", () => {
        const ssm = createSSM();
        expect(() => ssm.setRowStyle(0, undefined)).toThrow(TypeError);
    });
});
```

##### C. 行号坐标统一（对应 Phase 1）

文件：`tests/workbook/SheetStyleManager.test.js`（追加）

```js
describe("SheetStyleManager - row coordinate unification", () => {
    it("should convert pageRow to realRow in setRowStyle (non-paginated)", () => {
        // 非分页模式：pageRow = realRow，setRowStyle(0, {...}) 应写入 rowStyles.get(0)
    });

    it("should convert pageRow to realRow in setRowStyle (paginated)", () => {
        // 分页模式：offset=100，setRowStyle(0, {...}) 应写入 rowStyles.get(100)
    });

    it("should convert pageRow to realRow in clearRowStyle (paginated)", () => {
        // 分页模式：offset=100，clearRowStyle(0) 应清除 rowStyles.get(100)
    });

    it("should resolve style correctly in paginated mode after setRowStyle", () => {
        // 分页模式下设置行样式后，resolveStyle 应返回正确合并结果
    });

    it("should handle row 0 in both paginated and non-paginated modes", () => {
        // 同一 API 在两种模式下行为一致（用户视角）
    });
});
```

##### D. 构造选项补齐（对应 Phase 2）

文件：`tests/workbook/managers/SettingsApplier.test.js`（新建）

```js
describe("SettingsApplier - rowStyles option", () => {
    it("should apply rowStyles from sheet config", () => {
        // rowStyles: { 0: { fontWeight: "bold" } } 应正确设置第 0 行样式
    });

    it("should apply rowStyles with multiple rows", () => {
        // rowStyles: { 0: {...}, 5: {...} } 应正确设置多行样式
    });

    it("should skip null entries in rowStyles array form", () => {
        // rowStyles: [null, { backgroundColor: "red" }] 应跳过第 0 行
    });

    it("should merge rowStyles with existing defaultStyle", () => {
        // rowStyles 应与 defaultStyle 正确联合并
    });
});

describe("SettingsApplier - colStyles option", () => {
    it("should apply colStyles from sheet config", () => {
        // colStyles: { 2: { textAlign: "right" } } 应正确设置第 2 列样式
    });
});

describe("SettingsApplier - rangeStyles option", () => {
    it("should apply rangeStyles from sheet config", () => {
        // rangeStyles: [{ range: {...}, style: {...} }] 应正确设置选区样式
    });

    it("should merge rangeStyles with existing styles", () => {
        // rangeStyles 应为合并语义
    });
});
```

##### E. 语义统一（对应 Phase 2）

文件：`tests/workbook/SheetStyleManager.test.js`（追加）

```js
describe("SheetStyleManager - merge semantics unification", () => {
    it("should merge cell[].style with existing style when value is provided", () => {
        // cell 配置同时提供 value 和 style 时，style 应与已有样式合并
        // 而非替换
    });

    it("should merge cell[].style with existing style when value is not provided", () => {
        // cell 配置只提供 style 时，应与已有样式合并
    });

    it("should merge row style in setRangeStyle for full-row range", () => {
        // setRangeStyle 整行选区时，应与已有行样式合并
        // 而非替换
    });

    it("should merge column style in setRangeStyle for full-column range", () => {
        // setRangeStyle 整列选区时，应与已有列样式合并
    });

    it("should merge individual cell styles in setRangeStyle for partial range", () => {
        // setRangeStyle 任意选区时，应与已有单元格样式合并
    });

    it("should produce same result for same selection regardless of shape", () => {
        // 同一选区无论是否触发整行/整列优化路径，结果应一致
    });
});
```

##### F. 选区格式统一（对应 Phase 2）

文件：`tests/model/rules/ConditionalRule.test.js`（追加）

```js
describe("ConditionalRule - range format", () => {
    it("should accept topRow/topCol/bottomRow/bottomCol format", () => {
        // 新格式正常工作
    });

    it("should throw on sr/sc/er/ec format", () => {
        // 旧缩写格式应抛出错误
    });

    it("should throw on mixed format", () => {
        // 混用新旧格式应抛出错误
    });
});
```

##### G. 批量操作 API（对应 Phase 2）

文件：`tests/workbook/Sheet.test.js`（追加）

```js
describe("Sheet - batchStyleUpdate", () => {
    it("should only invalidate once during batch", () => {
        // batchStyleUpdate 内多次 setCellStyle 只触发一次 invalidate
    });

    it("should apply all style changes after batch ends", () => {
        // 批量操作结束后所有样式变更应生效
    });

    it("should still invalidate if error occurs in callback", () => {
        // 回调抛异常时仍应触发 invalidate（finally 块）
    });
});
```

##### H. border 渲染（对应 Phase 2）

文件：`tests/render/TileRenderer.border.test.js`（新建）

```js
describe("TileRenderer - border rendering", () => {
    it("should render custom border when style.border is set", () => {
        // 设置 border 后应绘制自定义边框
    });

    it("should fall back to grid line when no border is set", () => {
        // 无 border 时应绘制默认网格线
    });

    it("should skip border for merged cells", () => {
        // 合并单元格不应绘制边框
    });

    it("should render individual border sides (top/right/bottom/left)", () => {
        // 分别设置 top/right/bottom/left 边框时各自独立渲染
    });

    it("should render border shorthand format", () => {
        // border: { width: 2, style: "dashed", color: "#f00" } 简写格式
    });
});
```

##### I. verticalAlign 渲染（对应 Phase 2）

文件：`tests/render/TileRenderer.verticalAlign.test.js`（新建）

```js
describe("TileRenderer - verticalAlign rendering", () => {
    it("should set textBaseline to 'top' when verticalAlign is 'top'", () => {
        // verticalAlign: "top" → ctx.textBaseline = "top"
    });

    it("should set textBaseline to 'middle' when verticalAlign is 'middle'", () => {
        // verticalAlign: "middle" → ctx.textBaseline = "middle"
    });

    it("should set textBaseline to 'bottom' when verticalAlign is 'bottom'", () => {
        // verticalAlign: "bottom" → ctx.textBaseline = "bottom"
    });

    it("should default to 'middle' when verticalAlign is not set", () => {
        // 未设置时默认 ctx.textBaseline = "middle"
    });
});
```

##### J. Command 化 / StyleChangeRecorder（对应 Phase 3）

文件：`tests/model/command/StyleChangeCommand.test.js`（新建）

```js
describe("StyleChangeCommand", () => {
    it("should undo setCellStyle", () => {
        // 设置样式 → 撤销 → 恢复旧样式
    });

    it("should undo setRowStyle", () => {
        // 设置行样式 → 撤销 → 恢复旧行样式
    });

    it("should undo setColStyle", () => {
        // 设置列样式 → 撤销 → 恢复旧列样式
    });

    it("should undo setRangeStyle", () => {
        // 设置选区样式 → 撤销 → 恢复所有受影响单元格/行/列的旧样式
    });
});

describe("StyleChangeRecorder", () => {
    it("should record multiple changes and build single command", () => {
        // 记录多次变更 → 生成单个 Command → 一次撤销全部恢复
    });

    it("should undo in reverse order", () => {
        // 撤销时逆序恢复，确保依赖关系正确
    });

    it("should handle setRowStyle + setRangeStyle overlap on same row", () => {
        // 同一行先 setRowStyle 再 setRangeStyle 整行
        // 撤销时逆序：先恢复 setRangeStyle 前的状态，再恢复 setRowStyle 前的状态
    });

    it("should reset recorder after building command", () => {
        // buildCommand 后 recorder 应清空，不影响下次记录
    });
});
```

##### K. Workbook 层 API 补全（对应 Phase 2）

文件：`tests/workbook/Workbook.styleAPI.test.js`（新建）

```js
describe("Workbook - style API completeness", () => {
    it("should expose setRowStyle", () => {
        // wb.setRowStyle(0, {...}) 应正确委托到 activeSheet
    });

    it("should expose setColStyle", () => {
        // wb.setColStyle(2, {...}) 应正确委托到 activeSheet
    });

    it("should expose clearCellStyle", () => {
        // wb.clearCellStyle(0, 0) 应正确委托
    });

    it("should expose clearRowStyle", () => {
        // wb.clearRowStyle(0) 应正确委托
    });

    it("should expose clearColStyle", () => {
        // wb.clearColStyle(2) 应正确委托
    });

    it("should expose clearRangeStyle", () => {
        // wb.clearRangeStyle(range) 应正确委托
    });

    it("should expose getCellStyle", () => {
        // wb.getCellStyle(0, 0) 应返回正确的样式对象
    });
});
```

#### 12.3.3 测试用例与实施阶段对应关系

| 阶段 | 新建测试文件 | 修改测试文件 | 新增用例数 |
|------|------------|------------|-----------|
| Phase 1 | `Workbook.defaultStyle.test.js` | `SheetStyleManager.test.js`、`StylePool.test.js` | ~20 |
| Phase 2 | `SettingsApplier.test.js`、`TileRenderer.border.test.js`、`TileRenderer.verticalAlign.test.js`、`Workbook.styleAPI.test.js` | `SheetStyleManager.test.js`、`Sheet.test.js`、`ConditionalRule.test.js` | ~35 |
| Phase 3 | `StyleChangeCommand.test.js` | — | ~10 |

### 12.4 远期优化：优先级链可扩展性

当前 `resolveStyle` 中的 8 层样式合并采用硬编码 if-else 链：

```js
// 当前实现：硬编码 8 层
let style = base;
if (colStyleId) style = { ...style, ...stylePool.getStyle(colStyleId) };
if (rowStyleId) style = { ...style, ...stylePool.getStyle(rowStyleId) };
if (cellStyleId) style = { ...style, ...stylePool.getStyle(cellStyleId) };
// ... 依次到第 8 层
```

随着功能扩展（如主题样式、自定义样式层等），硬编码链会越来越难维护。

**远期方案**：数字权重 + 注册式链表/数组：

```js
// 样式层注册表
const STYLE_LAYERS = [
    { name: 'default',     weight: 100, resolver: (r, c) => stylePool.getStyle(this.#defaultStyleId) },
    { name: 'col',         weight: 200, resolver: (r, c) => stylePool.getStyle(this.#colStyles.get(c)) },
    { name: 'row',         weight: 300, resolver: (r, c) => stylePool.getStyle(this.#rowStyles.get(realR)) },
    { name: 'cell',        weight: 400, resolver: (r, c) => stylePool.getStyle(cell?.styleId) },
    { name: 'cellType',    weight: 500, resolver: (r, c) => cellType?.getDefaultStyle(style) },
    { name: 'cellProps',   weight: 600, resolver: (r, c) => cellProps?.style },
    { name: 'conditional', weight: 700, resolver: (r, c) => cfStyleId ? stylePool.getStyle(cfStyleId) : null },
    { name: 'dataBinding', weight: 800, resolver: (r, c) => dbStyleId ? stylePool.getStyle(dbStyleId) : null },
];

// resolveStyle 改为遍历
resolveStyle(r, c) {
    // ... 缓存逻辑 ...
    let style = {};
    for (const layer of STYLE_LAYERS) {
        const partial = layer.resolver(r, c);
        if (partial) style = { ...style, ...partial };
    }
    return style;
}
```

**优势**：新增样式层只需注册一个 `{ name, weight, resolver }`，无需修改 `resolveStyle` 逻辑。

**当前阶段评估**：8 层 if-else 链约 30 行，可读性尚可，暂不需要重构。当样式层超过 10 层或需要支持用户自定义样式层时，再启动此优化。