# DateColumnType — 日期类型

## 概述

用于日期列，支持多种日期格式的显示、解析和验证。

## 配置选项

```js
{
    type: 'date',
    dateFormat: { pattern: 'YYYY-MM-DD' },  // 显示格式
    min: '2020-01-01',                        // 最早日期
    max: '2030-12-31',                        // 最晚日期
    allowInvalid: false,                      // 是否允许无效日期
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `dateFormat.pattern` | `string` | `'YYYY-MM-DD'` | 日期显示格式 |
| `min` | `string\|number\|Date` | 无限制 | 最早允许的日期 |
| `max` | `string\|number\|Date` | 无限制 | 最晚允许的日期 |
| `allowInvalid` | `boolean` | `false` | 是否允许无效日期值 |

## 日期格式模式

| 模式 | 示例输出 | 说明 |
|------|----------|------|
| `YYYY-MM-DD` | `2024-01-15` | ISO 日期 |
| `YYYY/MM/DD` | `2024/01/15` | 斜杠分隔 |
| `MM/DD/YYYY` | `01/15/2024` | 美式日期 |
| `DD/MM/YYYY` | `15/01/2024` | 欧式日期 |
| `YY-MM-DD` | `24-01-15` | 短年份 |
| `YYYY年MM月DD日` | `2024年01月15日` | 中文日期 |
| `Mon DD, YYYY` | `Jan 15, 2024` | 英文月份缩写 |
| `YYYY-MM-DD HH:mm` | `2024-01-15 14:30` | 含时间 |
| `YYYY-MM-DD HH:mm:ss` | `2024-01-15 14:30:00` | 含秒 |

### 格式占位符

| 占位符 | 含义 | 示例 |
|--------|------|------|
| `YYYY` | 四位年份 | `2024` |
| `YY` | 两位年份 | `24` |
| `MM` | 两位月份 | `01` |
| `M` | 月份（不补零） | `1` |
| `DD` | 两位日期 | `15` |
| `D` | 日期（不补零） | `5` |
| `HH` | 两位小时 | `14` |
| `mm` | 两位分钟 | `30` |
| `ss` | 两位秒 | `00` |
| `Mon` | 英文月份缩写 | `Jan` |
| `年` | 中文字面"年" | `年` |
| `月` | 中文字面"月" | `月` |
| `日` | 中文字面"日" | `日` |

## 行为

### format

将值（Date 对象、时间戳、字符串）按 `dateFormat.pattern` 格式化。

```js
// pattern: 'YYYY-MM-DD'
format(new Date(2024, 0, 15))    // → "2024-01-15"
format(1705276800000)            // → "2024-01-15"
format("2024-01-15")             // → "2024-01-15"

// pattern: 'Mon DD, YYYY'
format(new Date(2024, 0, 15))    // → "Jan 15, 2024"

// pattern: 'YYYY年MM月DD日'
format(new Date(2024, 0, 15))    // → "2024年01月15日"

// 无效值
format("not a date")             // → "not a date" (原样)
format(null)                     // → ""
```

### validate

检查值是否为有效日期，以及是否在 `min`/`max` 范围内。

```js
// min: '2020-01-01', max: '2025-12-31'
validate(new Date(2024, 5, 1))   // → true
validate(new Date(2019, 0, 1))   // → "日期不能早于 2020-01-01"
validate(new Date(2026, 0, 1))   // → "日期不能晚于 2025-12-31"
validate("abc")                   // → false

// allowInvalid: true
validate("abc")                   // → "invalid"
```

### parse

自动识别多种日期输入格式：

| 输入格式 | 解析结果 |
|----------|----------|
| `2024-01-15` | `Date(2024, 0, 15)` |
| `2024/01/15` | `Date(2024, 0, 15)` |
| `15/01/2024` | `Date(2024, 0, 15)` |
| `01/15/2024` | `Date(2024, 0, 15)` |
| `2024年01月15日` | `Date(2024, 0, 15)` |
| 任意 Date 可解析字符串 | `new Date(input)` |

```js
parse("2024-01-15")     // → Date(2024, 0, 15)
parse("01/15/2024")     // → Date(2024, 0, 15)
parse("2024年1月15日")  // → Date(2024, 0, 15)
parse("Jan 15, 2024")   // → Date(2024, 0, 15)
parse("")               // → ""
parse("not a date")     // → "not a date" (保留原值)
```

### getDefaultStyle

默认居中对齐：

```js
getDefaultStyle({ fontSize: 14 }) // → { fontSize: 14, textAlign: 'center' }
```

### compare

按日期时间戳排序，无效日期视为 `-Infinity`。

## 使用示例

### 列级别类型

```js
const wb = new Workbook('grid', {
    columns: [
        // ISO 日期
        { type: 'date', dateFormat: { pattern: 'YYYY-MM-DD' } },
        // 美式日期，限制范围
        {
            type: 'date',
            dateFormat: { pattern: 'MM/DD/YYYY' },
            min: '2020-01-01',
            max: '2030-12-31',
        },
        // 中文日期格式
        { type: 'date', dateFormat: { pattern: 'YYYY年MM月DD日' } },
        // 含时间
        { type: 'date', dateFormat: { pattern: 'YYYY-MM-DD HH:mm:ss' } },
    ],
});
```

### 单元格级别类型（cellTypes）

通过 `cellTypes` 可对特定单元格覆盖列级别的类型配置，优先级高于 `columns`：

```js
const wb = new Workbook('grid', {
    columns: [
        { type: 'text' },       // 第 0 列默认为文本
        { type: 'text' },       // 第 1 列默认为文本
        { type: 'date', dateFormat: { pattern: 'YYYY-MM-DD' } },  // 第 2 列默认为 ISO 日期
    ],
    cellTypes: [
        // (0, 2) 单元格使用中文日期格式，覆盖列级别的 YYYY-MM-DD
        { row: 0, col: 2, type: 'date', dateFormat: { pattern: 'YYYY年MM月DD日' } },
        // (1, 2) 单元格使用美式日期格式，限制范围
        { row: 1, col: 2, type: 'date', dateFormat: { pattern: 'MM/DD/YYYY' }, min: '2020-01-01', max: '2030-12-31' },
        // (2, 0) 单元格覆盖为日期类型（列默认为 text）
        { row: 2, col: 0, type: 'date', dateFormat: { pattern: 'YYYY-MM-DD' } },
    ],
});
```

> **注意**：`cellTypes` 中 `type`、`dateFormat`、`min`、`max`、`allowInvalid` 的用法与 `columns` 中完全一致。

## 对应的编辑器

`DateEditor` — 优先使用浏览器原生 `<input type="date">` 日期选择器，不支持的浏览器回退为文本输入。
