# 列类型系统概述

## 架构

类型系统由两层组成：

```
BaseColumnType（类型基类）       ← 定义类型行为，子类实现具体类型
    ↑
类型注册表（全局）          ← src/types/index.js，维护 name → BaseColumnType 的映射
```

BaseColumnType 实例直接作为运行时类型对象使用，包含完整的 `format`/`validate`/`parse`/`getDefaultStyle`/`compare`/`getEditorOptions` 方法。

## 类型配置优先级

支持列级别和单元格级别的类型配置：

```
单元格级别 (cellTypes)  >  列级别 (columns)  >  默认 text
```

## 已注册的类型

| 类型名 | 类 | 编辑器 | 默认样式 |
|--------|-----|--------|----------|
| `text` | `TextColumnType` | `TextEditor` | 左对齐 |
| `numeric` | `NumericColumnType` | `NumericEditor` | 右对齐 |
| `date` | `DateColumnType` | `DateEditor` | 居中 |
| `boolean` | `BooleanColumnType` | `TextEditor` | 居中 |
| `select` | `SelectColumnType` | `SelectEditor` | 左对齐 |

## 使用方式

### 列级别类型（columns）

通过 `Workbook` 构造函数的 `columns` 配置，整列使用同一类型：

```js
const wb = new Workbook('grid', {
    columns: [
        { type: 'text' },
        { type: 'numeric', numericFormat: { pattern: '0,0.00' } },
        { type: 'date', dateFormat: { pattern: 'YYYY-MM-DD' } },
        { type: 'boolean', labels: { true: '✓', false: '✗' } },
        { type: 'select', source: ['Option A', 'Option B'] },
    ],
});
```

### 单元格级别类型（cellTypes）

通过 `Workbook` 构造函数的 `cellTypes` 配置，可覆盖特定单元格的类型：

```js
const wb = new Workbook('grid', {
    columns: [
        { type: 'text' },       // 第 0 列默认文本
        { type: 'text' },       // 第 1 列默认文本
    ],
    cellTypes: [
        { row: 0, col: 1, type: 'numeric', numericFormat: { pattern: '0.00%' } },
        { row: 1, col: 1, type: 'date', dateFormat: { pattern: 'YYYY-MM-DD' } },
        { row: 2, col: 0, type: 'boolean', labels: { true: '✓', false: '✗' } },
    ],
});
```

单元格级别类型配置会覆盖该单元格的列级别类型，影响该单元格的：
- 编辑器类型（如 numeric 单元格显示数字编辑器）
- 格式化方式
- 验证规则
- 默认样式
- 解析行为

## 自定义类型

继承 `BaseColumnType`，重写关键方法，然后注册：

```js
import { BaseColumnType } from './types/BaseColumnType.js';
import { registerType } from './types/index.js';

class ColorColumnType extends BaseColumnType {
    get name() { return 'color'; }
    get editorType() { return 'color'; }
    format(value) { return value ?? ''; }
    validate(value) { return /^#[0-9a-f]{6}$/i.test(value); }
    parse(input) { return input.trim().toLowerCase(); }
    getDefaultStyle(baseStyle) { return { ...baseStyle, textAlign: 'center' }; }
}

registerType(new ColorColumnType());
```

同时需要在 `EditorManager` 中注册对应的编辑器。

## BaseColumnType 方法说明

每个 `BaseColumnType` 子类需实现以下方法：

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `get name()` | `string` | 类型名称，用于注册和配置引用 |
| `get editorType()` | `string` | 对应的编辑器名称 |
| `format(value)` | `string` | 将原始值转为显示文本 |
| `validate(value)` | `boolean\|string` | 验证值，`true`=有效，`false`=无效，`string`=错误消息 |
| `parse(input)` | `*` | 将用户输入解析为存储值 |
| `getDefaultStyle(baseStyle)` | `object` | 返回叠加类型默认样式后的样式对象 |
| `getEditorOptions()` | `object` | 传递给编辑器的额外选项 |
| `getDefaultValue()` | `*` | 该类型的默认空值 |
| `compare(a, b, order)` | `number` | 排序比较函数 |
