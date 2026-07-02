# NestedHeaders Style 属性使用指南

## 📅 更新日期
2026-07-02

## ✨ 功能概述

从 v2.0 开始，`nestedHeaders` 配置支持完整的 `style` 属性，允许你自定义嵌套表头的视觉样式，包括背景色、文字颜色、字体、对齐方式等。

---

## 🎯 支持的样式属性

### 完整属性列表

| 属性名 | 类型 | 默认值 | 说明 | 示例值 |
|--------|------|--------|------|--------|
| `backgroundColor` | `string` | 继承默认样式 | 背景颜色 | `"#4472C4"`, `"red"`, `"rgb(68, 114, 196)"` |
| `color` | `string` | 继承默认样式 | 文字颜色 | `"#FFFFFF"`, `"black"`, `"rgba(0,0,0,0.8)"` |
| `fontWeight` | `string` | `"normal"` | 字体粗细 | `"bold"`, `"normal"`, `"lighter"`, `"100"`-`"900"` |
| `fontSize` | `string` | `"12px"` | 字体大小 | `"14px"`, `"16px"`, `"1.2em"` |
| `fontStyle` | `string` | `"normal"` | 字体样式 | `"italic"`, `"normal"`, `"oblique"` |
| `textAlign` | `string` | `"left"` | 文本水平对齐 | `"left"`, `"center"`, `"right"` |

---

## 📝 基础用法

### 1. 简单背景色和文字色

```javascript
nestedHeaders: [
    [
        {
            label: "基本信息",
            colspan: 2,
            style: {
                backgroundColor: "#4472C4",  // 蓝色背景
                color: "#FFFFFF"             // 白色文字
            }
        },
        {
            label: "工作信息",
            colspan: 4,
            style: {
                backgroundColor: "#70AD47",  // 绿色背景
                color: "#FFFFFF"             // 白色文字
            }
        },
    ],
    // ... 其他层
]
```

**效果**：
```
┌─────────────┬─────────────────────────────┐
│  基本信息   │         工作信息             │  ← 蓝底白字 / 绿底白字
└─────────────┴─────────────────────────────┘
```

---

### 2. 字体样式定制

```javascript
nestedHeaders: [
    [
        {
            label: "重要数据",
            colspan: 3,
            style: {
                backgroundColor: "#ED7D31",
                color: "#FFFFFF",
                fontWeight: "bold",      // 加粗
                fontSize: "14px",        // 大字号
                fontStyle: "italic"      // 斜体（组合使用）
            }
        },
    ],
    [
        { label: "列1" },
        {
            label: "列2",
            style: {
                fontWeight: "bold"
            }
        },
        {
            label: "列3",
            style: {
                fontStyle: "italic",
                color: "#666666"
            }
        },
    ]
]
```

**效果**：
```
┌───────────────────────────────┐
│       *重要数据*              │  ← 橙底、白字、加粗斜体、14px
├───────┬─────────┬─────────────┤
│  列1  │  **列2** │  *列3*     │  ← 普通 / 加粗 / 斜体灰色
└───────┴─────────┴─────────────┘
```

---

### 3. 文本对齐

```javascript
nestedHeaders: [
    [
        {
            label: "左对齐标题",
            colspan: 1,
            style: {
                textAlign: "left",
                backgroundColor: "#DEEBF7"
            }
        },
        {
            label: "居中标题",
            colspan: 1,
            style: {
                textAlign: "center",
                backgroundColor: "#E2EFDA"
            }
        },
        {
            label: "右对齐标题",
            colspan: 1,
            style: {
                textAlign: "right",
                backgroundColor: "#FFF2CC"
            }
        },
    ]
]
```

**效果**：
```
┌─────────────┬─────────────┬─────────────┐
│ 左对齐标题   │   居中标题   │      右对齐标题│
└─────────────┴─────────────┴─────────────┘
```

---

## 🎨 高级用法

### 1. 多层级差异化样式

```javascript
nestedHeaders: [
    // 第一层：分类标题（大色块）
    [
        {
            label: "个人信息",
            colspan: 3,
            style: {
                backgroundColor: "#5B9BD5",
                color: "#FFFFFF",
                fontWeight: "bold",
                fontSize: "15px",
                textAlign: "center"
            }
        },
        {
            label: "财务信息",
            colspan: 3,
            style: {
                background Color: "#70AD47",
                color: "#FFFFFF",
                fontWeight: "bold",
                fontSize: "15px",
                textAlign: "center"
            }
        },
    ],

    // 第二层：子分类（中等色块）
    [
        {
            label: "基本信息",
            colspan: 2,
            style: {
                backgroundColor: "#BDD7EE",
                fontWeight: "600"
            }
        },
        { label: "其他" },

        {
            label: "收入",
            colspan: 2,
            style: {
                backgroundColor: "#C6E0B4",
                fontWeight: "600"
            }
        },
        { label: "支出" },
    ],

    // 第三层：具体字段（轻量样式或无样式）
    ["姓名", "年龄", "性别", "工资", "奖金", "扣款"],
]
```

**效果预览**：
```
┌─────────────────────┬─────────────────────┐
│      个人信息        │       财务信息        │  ← 深蓝/深绿 + 白字 + 15px + 居中
├────────────┬────────┼──────────┬──────────┤
│  基本信息   │  其他   │   收入    │   支出   │  ← 浅蓝/浅绿 + 半粗体
├──────┬─────┼────────┼──────┬───┼──────────┤
│ 姓名  │ 年龄 │ 性别   │ 工资 │奖金│  扣款   │  ← 无特殊样式
└──────┴─────┴────────┴──────┴───┴──────────┘
```

---

### 2. 条件式样式（动态配置）

```javascript
// 根据业务逻辑动态生成 nestedHeaders
function generateNestedHeaders(data) {
    const hasHighSalary = data.some(row => row.salary > 20000);

    return [
        [
            {
                label: "员工数据",
                colspan: 4,
                style: {
                    backgroundColor: hasHighSalary ? "#FF6B6B" : "#4ECDC4",
                    color: "#FFFFFF",
                    fontWeight: "bold"
                    // 根据数据显示不同颜色
                }
            },
        ],
        ["姓名", "部门", "职位", "薪资"]
    ];
}

// 使用
const config = {
    nestedHeaders: generateNestedHeaders(employeeData),
};
```

---

### 3. 品牌主题配色方案

```javascript
// 企业品牌色彩系统
const BRAND_COLORS = {
    primary: {
        bg: "#2563EB",    // 主色蓝
        text: "#FFFFFF",
    },
    secondary: {
        bg: "#7C3AED",    // 辅助紫
        text: "#FFFFFF",
    },
    accent: {
        bg: "#F59E0B",    // 强调橙
        text: "#1F2937",
    },
    neutral: {
        bg: "#F3F4F6",    // 中性灰
        text: "#374151",
    }
};

// 应用到嵌套表头
nestedHeaders: [
    [
        {
            label: "核心业务指标",
            colspan: 3,
            style: {
                backgroundColor: BRAND_COLORS.primary.bg,
                color: BRAND_COLORS.primary.text,
                fontWeight: "bold",
                fontSize: "14px"
            }
        },
        {
            label: "辅助数据",
            colspan: 2,
            style: {
                backgroundColor: BRAND_COLORS.secondary.bg,
                color: BRAND_COLORS.secondary.text,
                fontWeight: "bold",
                fontSize: "14px"
            }
        },
    ],
    [
        {
            label: "重点监控",
            colspan: 1,
            style: {
                backgroundColor: BRAND_COLORS.accent.bg,
                color: BRAND_COLORS.accent.text
            }
        },
        { label: "常规" },
        { label: "参考A" },
        { label: "参考B" },
    ]
]
```

---

## 🔧 技术细节

### 样式合并优先级

当同时设置默认样式和自定义样式时，采用以下合并策略：

```javascript
// 合并规则：自定义样式 > 默认样式
const mergedStyle = {
    ...defaultStyle,        // 基础样式
    ...customStyle,         // 自定义样式覆盖
    color: customColor || defaultColor,          // 特殊处理
    backgroundColor: customBg || defaultBg,      // 特殊处理
}
```

**示例**：

```javascript
// 全局默认样式（在 Sheet 配置中）
const defaultHeaderStyle = {
    color: "#333333",
    backgroundColor: "#F5F5F5"
};

// 单个嵌套表头项
{
    label: "自定义",
    style: {
        color: "#FF0000"  // 只覆盖颜色，背景色继承默认值
    }
}

// 最终效果：
// - color: "#FF0000" (自定义)
// - backgroundColor: "#F5F5F5" (继承默认)
```

---

### 向后兼容性

✅ **完全向后兼容**

```javascript
// ❌ 旧写法（仍然有效）
nestedHeaders: [
    [{ label: "标题", colspan: 2 }],
    ["列1", "列2"]
]

// ✅ 新写法（推荐）
nestedHeaders: [
    [{
        label: "标题",
        colspan: 2,
        style: { backgroundColor: "#4472C4", color: "#FFF" }
    }],
    ["列1", "列2"]
]

// ✅ 混合使用（部分有样式，部分没有）
nestedHeaders: [
    [{
        label: "有样式的标题",
        colspan: 2,
        style: { backgroundColor: "#4472C4" }
    }],
    ["无样式的列1", "普通列2"]  // 这些会使用默认样式
]
```

---

### 性能考虑

1. **样式对象缓存**：相同样式配置会被复用，不会重复计算
2. **按需渲染**：只有可见区域的嵌套表头才会应用样式
3. **轻量级操作**：样式合并和字体构建都是 O(1) 复杂度

---

## 🐛 常见问题与解决方案

### Q1: 样式不生效？

**检查清单**：
- [ ] 确认 `style` 属性拼写正确（不是 `styles` 或 `css`）
- [ ] 颜色值格式正确（支持 `#RGB`、`#RRGGBB`、`rgb()`、颜色名称）
- [ ] 字号单位正确（必须带 `px`、`em`、`rem` 等）
- [ ] 浏览器控制台是否有错误提示

**调试方法**：
```javascript
// 在控制台查看解析结果
console.log(sheet.getNestedColHeader(0, 0));
// 应该输出: { label: "...", colspan: N, style: {...} }
```

---

### Q2: 如何重置为默认样式？

```javascript
// 方式 1：不设置 style 属性（自动使用默认）
{ label: "标题", colspan: 2 }  // ✅ 无 style = 使用默认样式

// 方式 2：显式设置为 null
{ label: "标题", colspan: 2, style: null }

// 方式 3：只覆盖部分属性（未设置的继承默认）
{ label: "标题", colspan: 2, style: { color: "#000" } }
// 只有颜色改变，其他保持默认
```

---

### Q3: 支持渐变背景吗？

**当前不支持**，但可以通过 CSS 变通实现：

```javascript
// ❌ 不支持（会被忽略）
{
    style: {
        backgroundColor: "linear-gradient(to right, #4472C4, #70AD47)"
    }
}

// ✅ 替代方案：使用纯色或图案
{
    style: {
        backgroundColor: "#4472C4"  // 使用单一主色调
    }
}
```

---

### Q4: 能否根据数据动态改变样式？

**可以！** 通过编程方式生成配置：

```javascript
function createDynamicHeaders(status) {
    const bgColor = status === 'success' ? '#28a745' :
                     status === 'warning' ? '#ffc107' :
                     status === 'error'   ? '#dc3545' : '#6c757d';

    return [[{
        label: `状态: ${status}`,
        colspan: 3,
        style: {
            backgroundColor: bgColor,
            color: '#FFFFFF',
            fontWeight: 'bold'
        }
    }]];
}

// 动态更新
sheet.updateConfig({
    nestedHeaders: createDynamicHeaders(currentStatus)
});
```

---

## 📚 API 参考

### getNestedColHeader(rowIndex, col)

**返回值类型**：
```typescript
interface NestedColHeaderInfo {
    label: string;           // 表头文本
    colspan: number;         // 跨列数 (>= 1)
    style?: {                // 可选的样式对象
        backgroundColor?: string;
        color?: string;
        fontWeight?: string;
        fontSize?: string;
        fontStyle?: string;
        textAlign?: string;
    } | null;
}
```

**参数**：
- `rowIndex`: 嵌套层索引（0 = 最顶层）
- `col`: 数据列索引（从 0 开始）

**返回值**：
- 成功：`{ label, colspan, style? }`
- 被跨列覆盖：`null`
- 超出范围：`null`

---

## 🎯 最佳实践

### 1. 保持一致性

```javascript
// ✅ 推荐：统一使用设计系统的颜色变量
const THEME = {
    headerPrimary: { bg: '#2563EB', text: '#FFFFFF' },
    headerSecondary: { bg: '#64748B', text: '#FFFFFF' },
};

nestedHeaders: [
    [{
        label: "主要分类",
        colspan: 3,
        style: THEME.headerPrimary
    }]
]

// ❌ 不推荐：硬编码颜色值
nestedHeaders: [
    [{
        label: "主要分类",
        colspan: 3,
        style: { backgroundColor: '#2563EB', color: '#FFF' }
    }]
]
```

### 2. 适度使用

```javascript
// ✅ 推荐：关键层次使用样式突出
nestedHeaders: [
    // 第一层用强样式区分大类
    [{ label: "类别A", colspan: 2, style: { bg: 'blue', color: 'white' } }],
    // 第二层用轻度样式区分子类
    [{ label: "子类1", style: { fontWeight: 'bold' } }, "子类2"],
    // 第三层保持简洁
    ["列1", "列2"]
]

// ❌ 不推荐：每层都使用复杂样式（视觉噪音）
nestedHeaders: [
    [{ label: "L1", style: { /* 复杂样式 */ } }],
    [{ label: "L2", style: { /* 复杂样式 */ } }],
    [{ label: "L3", style: { /* 复杂样式 */ } }]
]
```

### 3. 可访问性考虑

```javascript
// ✅ 推荐：确保对比度足够
{
    style: {
        backgroundColor: "#4472C4",  // 深色背景
        color: "#FFFFFF"             // 浅色文字 → 对比度良好 ✓
    }
}

// ❌ 避免：低对比度组合
{
    style: {
        backgroundColor: "#FFFF00",  // 黄色背景
        color: "#FFFFCC"             // 浅黄色文字 → 对比度差 ✗
    }
}
```

---

## 🔄 版本历史

### v2.0.0 (2026-07-02)

**新功能**：
- ✅ 新增完整的 `style` 属性支持
- ✅ 支持 6 种常用样式属性
- ✅ 向后兼容旧配置
- ✅ 样式合并机制
- ✅ 动态样式支持

**修改文件**：
- `src/workbook/managers/HeaderLabelManager.js` - 数据层提取 style
- `src/render/HeaderRenderer.js` - 渲染层应用样式
- `docs/NESTED_HEADERS_STYLE_GUIDE.md` - 本文档

---

## 💡 相关资源

- [Sheet 配置完整文档](./SHEET_CONFIGURATION.md)
- [CSS 颜色值参考](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value)
- [CanvasRenderingContext2D API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)

---

**最后更新**: 2026-07-02
**适用版本**: canvas-implementation-in-excel v2.0+