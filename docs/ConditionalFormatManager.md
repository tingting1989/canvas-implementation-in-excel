# ConditionalFormatManager — 条件格式与数据绑定管理器

## 概述

`ConditionalFormatManager` 负责条件格式规则匹配和数据绑定映射。它从 `Sheet` 中独立出来，在渲染管线的 `#drawCellBackground` 阶段被调用，为单元格动态覆盖背景/文字样式，优先级介于单元格自身样式和禁用单元格样式之间。

## 文件位置

```
src/workbook/ConditionalFormatManager.js
```

## 设计意图

- **职责分离**：将条件格式和数据绑定逻辑从 `Sheet` 剥离，降低 `Sheet` 的复杂度。
- **两大功能统一管理**：条件格式（按范围/条件匹配）和数据绑定（按值映射）本质都是"动态样式覆盖"，归入同一模块。
- **快速路径优化**：提供 `hasRules()` / `hasBindings()` 方法，渲染时无规则/绑定可跳过查询，避免不必要的遍历开销。
- **与 Sheet 解耦**：仅通过构造函数持有 `Sheet` 引用以访问 `cellStore`。

## 工作原理

### 条件格式匹配

```
addRule(range, conditionFn, styleId)
  → 规则存储在 #rules 数组

渲染时:
  match(r, c, cell)
    → 遍历 #rules
      → rule.match(realR, c, cell) → 返回 styleId
    → 第一个匹配的规则生效（按添加顺序）
    → 无匹配返回 null
```

### 数据绑定匹配

```
bind(col, mapperFn)
  → 映射存储在 #bindings Map<col, mapperFn>

渲染时:
  getBinding(r, c)
    → 按列查找 mapperFn
    → 单元格值为空则不映射
    → 调用 mapperFn(cell.value) → 返回 styleId
```

### 渲染管线中的调用时序

```
resolveStyle(r, c, cell)
  → 1. 获取单元格自身样式
  → 2. hasRules()  → match(r, c, cell)      ← 条件格式覆盖
  → 3. hasBindings() → getBinding(r, c)      ← 数据绑定覆盖
  → 4. isDisabled   → 禁用样式覆盖（最高优先级）
```

## API

### 条件格式

| 方法 | 签名 | 说明 |
|------|------|------|
| `addRule` | `(range: string, conditionFn: Function, styleId: number) => void` | 添加条件格式规则 |
| `match` | `(r: number, c: number, cell: Cell) => number \| null` | 匹配条件格式，返回样式 ID 或 null |

**addRule 参数**：
```js
addRule("A1:C10", (cell) => cell.value > 100, 5);
//  ↑ 范围       ↑ 条件函数                  ↑ 匹配后使用的样式 ID
```

### 数据绑定

| 方法 | 签名 | 说明 |
|------|------|------|
| `bind` | `(col: number, mapperFn: Function) => void` | 按列绑定值→样式映射函数 |
| `getBinding` | `(r: number, c: number) => number \| null` | 获取数据绑定样式 ID |

**bind 示例**：
```js
bind(3, (value) => {
    if (value === "完成") return 10;  // 绿色背景样式
    if (value === "失败") return 11;  // 红色背景样式
    return null;
});
```

### 快速路径判断

| 方法 | 返回 | 说明 |
|------|------|------|
| `hasRules()` | `boolean` | 是否有条件格式规则 |
| `hasBindings()` | `boolean` | 是否有数据绑定映射 |
| `get bindings` | `Map<number, Function>` | 获取数据绑定 Map（供 RowColSync 重映射键） |

## 调用方

| 模块 | 调用方法 | 场景 |
|------|----------|------|
| `Sheet.resolveStyle()` | `hasRules()` / `match()` | 解析单元格最终样式 |
| `Sheet.resolveStyle()` | `hasBindings()` / `getBinding()` | 解析单元格最终样式 |
| `RowColSync` | `get bindings` | 行列增删时重映射绑定列的索引 |
| 业务代码 | `addRule()` / `bind()` | 设置条件格式和数据绑定 |
