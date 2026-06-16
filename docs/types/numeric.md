# NumericColumnType — 数字类型

## 概述

用于数值列，支持多种格式化模式、范围验证和数值排序。

## 配置选项

```js
{
    type: 'numeric',
    numericFormat: { pattern: '0,0.00' },  // 格式化模式
    min: 0,                                   // 最小值
    max: 100000,                              // 最大值
    allowInvalid: false,                      // 是否允许无效数值
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `numericFormat.pattern` | `string` | 无（原样输出） | 数字格式化模式 |
| `min` | `number` | 无限制 | 最小值（含） |
| `max` | `number` | 无限制 | 最大值（含） |
| `allowInvalid` | `boolean` | `false` | 是否允许非数字值 |

## 格式化模式 (pattern)

| 模式 | 示例输入 | 示例输出 | 说明 |
|------|----------|----------|------|
| （无） | `1234.567` | `"1234.567"` | 原样输出 |
| `0` | `1234.5` | `"1235"` | 整数（四舍五入） |
| `0.0` | `1234.56` | `"1234.6"` | 1 位小数 |
| `0.00` | `1234.5` | `"1234.50"` | 2 位小数 |
| `0,0` | `1234567` | `"1,234,567"` | 千分位整数 |
| `0,0.0` | `1234567.89` | `"1,234,567.9"` | 千分位 1 位小数 |
| `0,0.00` | `1234567.89` | `"1,234,567.89"` | 千分位 2 位小数 |
| `0%` | `0.25` | `"25%"` | 百分比整数 |
| `0.0%` | `0.25` | `"25.0%"` | 百分比 1 位小数 |
| `0.00%` | `0.25` | `"25.00%"` | 百分比 2 位小数 |
| `$0,0.00` | `1234.5` | `"$1,234.50"` | 美元千分位 |
| `€0,0.00` | `1234.5` | `"€1,234.50"` | 欧元千分位 |
| `¥0,0.00` | `1234.5` | `"¥1,234.50"` | 人民币千分位 |
| `0.00E+00` | `1234.5` | `"1.23e+3"` | 科学计数法 |

## 行为

### format

根据 `numericFormat.pattern` 格式化数字。非数字值原样输出。

```js
// pattern: '$0,0.00'
format(1234.5)     // → "$1,234.50"
format("hello")    // → "hello"

// pattern: '0.00%'
format(0.156)      // → "15.60%"

// pattern: '0.00E+00'
format(1234.5)     // → "1.23e+3"
```

### validate

检查是否为有效数字，以及是否在 `min`/`max` 范围内。

```js
// min: 0, max: 100
validate(50)        // → true
validate(-1)        // → "数值不能小于 0"
validate(150)       // → "数值不能大于 100"
validate("abc")     // → false
validate("")        // → true (空值允许)

// allowInvalid: true
validate("abc")     // → "invalid" (标记为无效但不阻止)
```

### parse

去除逗号和空格后解析为数字。

```js
parse("1,234.56")   // → 1234.56
parse("50%")        // → NaN → "50%" (保留原值)
parse("")           // → ""
```

### getDefaultStyle

默认右对齐：

```js
getDefaultStyle({ fontSize: 14 }) // → { fontSize: 14, textAlign: 'right' }
```

### compare

按数值大小排序，NaN 视为 `-Infinity`。

## 使用示例

```js
const wb = new Workbook('grid', {
    columns: [
        // 整数
        { type: 'numeric', numericFormat: { pattern: '0' } },
        // 千分位两位小数
        { type: 'numeric', numericFormat: { pattern: '0,0.00' } },
        // 百分比，限制 0-1 范围
        { type: 'numeric', numericFormat: { pattern: '0.00%' }, min: 0, max: 1 },
        // 美元金额
        { type: 'numeric', numericFormat: { pattern: '$0,0.00' }, min: 0 },
        // 科学计数法
        { type: 'numeric', numericFormat: { pattern: '0.00E+00' } },
    ],
});
```

## 对应的编辑器

`NumericEditor` — 数字输入框，`inputMode="decimal"`，实时过滤非数字字符，支持粘贴解析。
