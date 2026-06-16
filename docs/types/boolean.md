# BooleanColumnType — 布尔类型

## 概述

用于真/假值列，支持自定义显示标签和多种输入格式的自动识别。

## 配置选项

```js
{
    type: 'boolean',
    labels: { true: '✓', false: '✗' },  // 自定义显示标签
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `labels.true` | `string` | `'TRUE'` | 真值显示文本 |
| `labels.false` | `string` | `'FALSE'` | 假值显示文本 |

## 输入识别

自动将以下输入识别为布尔值：

### 识别为 `true` 的值

| 输入 | 类型 |
|------|------|
| `true` | boolean |
| `1` | number |
| `"true"` | string（不区分大小写） |
| `"yes"` / `"y"` | string |
| `"1"` / `"t"` | string |
| `"是"` / `"真"` | string（中文） |

### 识别为 `false` 的值

| 输入 | 类型 |
|------|------|
| `false` | boolean |
| `0` | number |
| `"false"` | string（不区分大小写） |
| `"no"` / `"n"` | string |
| `"0"` / `"f"` | string |
| `"否"` / `"假"` | string（中文） |

## 行为

### format

将值转为自定义标签或 `TRUE`/`FALSE`。

```js
// labels: { true: '✓', false: '✗' }
format(true)        // → "✓"
format(false)       // → "✗"
format(1)           // → "✓"
format(0)           // → "✗"
format("yes")       // → "✓"
format("no")        // → "✗"

// 默认标签
format(true)        // → "TRUE"
format(false)       // → "FALSE"

// 无法识别的值
format("hello")     // → "hello" (原样)
format(null)        // → ""
```

### validate

检查值是否能被识别为布尔值。

```js
validate(true)       // → true
validate(false)      // → true
validate(1)          // → true
validate(0)          // → true
validate("yes")      // → true
validate("no")       // → true
validate("是")       // → true
validate("否")       // → true
validate("hello")    // → false
validate("")         // → true (空值允许)
```

### parse

将输入解析为 `true`/`false`，无法识别的保留原值。

```js
parse(true)          // → true
parse("yes")         // → true
parse("TRUE")        // → true
parse("是")          // → true
parse(1)             // → true
parse(false)         // → false
parse("no")          // → false
parse(0)             // → false
parse("否")          // → false
parse("hello")       // → "hello" (保留原值)
parse("")            // → ""
```

### getDefaultStyle

默认居中对齐：

```js
getDefaultStyle({ fontSize: 14 }) // → { fontSize: 14, textAlign: 'center' }
```

### compare

`true` > `false` > 无效值，按此顺序排序。

## 使用示例

```js
const wb = new Workbook('grid', {
    columns: [
        // 默认 TRUE/FALSE 显示
        { type: 'boolean' },
        // 自定义符号
        { type: 'boolean', labels: { true: '✓', false: '✗' } },
        // 中文标签
        { type: 'boolean', labels: { true: '是', false: '否' } },
        // 英文标签
        { type: 'boolean', labels: { true: 'Yes', false: 'No' } },
    ],
});
```

## 对应的编辑器

`TextEditor` — 布尔类型使用文本编辑器，用户输入后自动解析。因为原生浏览器对 checkbox 在 Canvas 覆盖层中的支持有限，暂用文本输入替代。
