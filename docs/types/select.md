# SelectColumnType — 下拉选择类型

## 概述

用于从预定义列表中选择值的列。编辑时显示原生 `<select>` 下拉菜单，选中即自动提交。

## 配置选项

```js
{
    type: 'select',
    source: ['Option A', 'Option B', 'Option C'],  // 可选值列表
    allowInvalid: false,  // 是否允许自定义值
    strict: false,        // 严格模式（仅允许选择，不能手动输入）
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `source` | `string[]` | `[]` | **必需**。可选值列表 |
| `allowInvalid` | `boolean` | `false` | 是否允许不在 source 中的值 |
| `strict` | `boolean` | `false` | 严格模式，`<select>` 不可手动输入（预留） |

## 行为

### format

直接转为字符串显示。

```js
format("Option A")    // → "Option A"
format(null)          // → ""
```

### validate

检查值是否在 `source` 列表中。

```js
// source: ['A', 'B', 'C']
validate("A")         // → true
validate("D")         // → false (不在列表中)
validate("")          // → true (空值允许)

// allowInvalid: true
validate("D")         // → true
```

### parse

尝试精确匹配 `source` 中的值。如果找不到匹配且不允许无效值，返回空字符串。

```js
// source: ['Beijing', 'Shanghai', 'Shenzhen']
parse("Beijing")      // → "Beijing" (精确匹配)
parse("beijing")      // → "" (大小写不匹配，且不允许无效)
parse("Guangzhou")    // → "" (不在列表中)

// allowInvalid: true
parse("Guangzhou")    // → "Guangzhou"
```

### getEditorOptions

将 `source` 等选项传递给编辑器：

```js
getEditorOptions()    // → { source: ['A', 'B'], allowInvalid: false, strict: false }
```

### compare

如果提供了 `source`，按 source 中的顺序排序；否则按字典序。

```js
// source: ['C', 'A', 'B']
compare('A', 'B')     // → 1 (A 在 source 中索引为 1，B 为 2，升序时 A < B)
compare('C', 'A')     // → -1
```

## 使用示例

```js
const wb = new Workbook('grid', {
    columns: [
        // 基础下拉选择
        { type: 'select', source: ['Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou'] },
        // 允许自定义输入
        {
            type: 'select',
            source: ['Low', 'Medium', 'High'],
            allowInvalid: true,
        },
        // 部门选择
        { type: 'select', source: ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'] },
    ],
});
```

## 对应的编辑器

`SelectEditor` — 使用原生 `<select>` 元素，点击单元格后弹出下拉列表。选中某个选项后立即提交值并关闭。如果 `allowInvalid` 为 `true`，下拉列表中会有一个"自定义输入"选项（选择后仍需通过其他方式输入）。

### 编辑器交互

- **点击单元格** → 显示下拉选择器
- **选择选项** → 自动提交并移动到下一行
- **Enter** → 提交当前选中值，移动到下一行
- **Tab** → 提交当前选中值，移动到下一列
- **Escape** → 取消编辑，恢复原值
- **滚动** → 编辑器自动隐藏/恢复
