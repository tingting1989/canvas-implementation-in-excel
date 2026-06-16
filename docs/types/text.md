# TextColumnType — 文本类型

## 概述

最基础的类型，适用于任意文本内容。所有未指定类型的列默认使用此类型。

## 配置选项

```js
{
    type: 'text',
    maxLength: 50,       // 最大字符数限制
    allowInvalid: false, // 是否允许超长文本
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxLength` | `number` | 无限制 | 文本最大长度，超出部分会被截断 |
| `allowInvalid` | `boolean` | `false` | 是否允许超出 maxLength 的文本 |

## 行为

### format

将值转为字符串。`undefined`/`null` 显示为空字符串。

```js
format(123)        // → "123"
format("hello")    // → "hello"
format(null)       // → ""
```

### validate

检查文本长度是否超出 `maxLength`。

```js
// maxLength: 5
validate("hello")   // → true
validate("hello!")  // → "文本长度不能超过 5 个字符"
validate("")        // → true (空值允许)
```

### parse

去除首尾空白字符，截断超出 `maxLength` 的部分。

```js
// maxLength: 5
parse("  hello  ")  // → "hello"
parse("hello world") // → "hello"
```

### getDefaultStyle

默认左对齐：

```js
getDefaultStyle({ fontSize: 14 }) // → { fontSize: 14, textAlign: 'left' }
```

### compare

使用字典序（含数字感知）排序。

## 使用示例

```js
const wb = new Workbook('grid', {
    columns: [
        { type: 'text' },
        { type: 'text', maxLength: 100 },
        { type: 'text', maxLength: 20, allowInvalid: true },
    ],
});
```

## 对应的编辑器

`TextEditor` — 标准文本输入框，支持 IME 组合输入、Enter/Tab/Escape 导航。
