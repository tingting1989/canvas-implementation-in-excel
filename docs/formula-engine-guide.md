# 公式引擎（Formula Engine）详细文档

## 📋 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [核心模块](#核心模块)
4. [支持的语法特性](#支持的语法特性)
5. [内置函数库](#内置函数库)
6. [用户自定义函数（UDF）](#-用户自定义函数udf)
7. [依赖追踪系统](#依赖追踪系统)
8. [API 参考](#api-参考)
9. [使用示例](#使用示例)
10. [错误处理机制](#错误处理机制)
11. [性能优化建议](#性能优化建议)
12. [扩展指南](#扩展指南)
13. [常见问题排查](#常见问题排查)

---

## 概述

### 什么是公式引擎？

公式引擎是 Canvas Spreadsheet 的核心计算模块，负责：
- ✅ 解析 Excel 风格的公式字符串（如 `=SUM(A1:A10)`）
- ✅ 将公式转换为抽象语法树（AST）
- ✅ 递归求值并返回计算结果
- ✅ 维护单元格间的依赖关系，实现自动重算
- ✅ 支持跨表引用和级联更新

### 核心能力矩阵

| 能力 | 状态 | 说明 |
|------|------|------|
| 基础运算 | ✅ | `+`, `-`, `*`, `/`, `^` |
| 比较运算 | ✅ | `=`, `<>`, `<`, `>`, `<=`, `>=` |
| 文本连接 | ✅ | `&` 运算符 |
| 单元格引用 | ✅ | A1, B2, AA10 等 |
| 范围引用 | ✅ | A1:B10, Sheet2!C5:D20 |
| 跨表引用 | ✅ | Sheet2!A1 |
| 函数调用 | ✅ | SUM, IF, AVERAGE 等 13 个内置函数 |
| **用户自定义函数** | ✅ **NEW** | 运行时动态注册/注销自定义函数 |
| 依赖追踪 | ✅ | 自动重算，级联更新（含自定义函数） |
| **循环引用检测** | ✅ **NEW** | 自动检测直接/间接/跨表循环引用 |
| 错误处理 | ✅ | #VALUE!, #REF!, #DIV/0!, #NAME?, #PARSE!, **#CIRCULAR!** |

### 适用场景

- 📊 **财务报表**：自动计算总和、平均值、百分比
- 📈 **数据分析**：条件判断、数据统计
- 🔢 **科学计算**：数学运算、数值处理
- 📝 **文本处理**：大小写转换、字符串拼接
- 🔄 **动态表格**：数据变化时自动更新关联公式

---

## 架构设计

### 三层架构图

```
┌─────────────────────────────────────────────────────┐
│                   用户输入层                          │
│            "=SUM(A1:A10)+B2*0.8"                    │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              FormulaEngine (主控制器)                 │
│  ┌──────────────────────────────────────────────┐   │
│  │  职责:                                        │   │
│  │  • 判断是否为公式                              │   │
│  │  • 协调解析器和求值器                          │   │
│  │  • 维护依赖图                                  │   │
│  │  • 触发自动重算                                │   │
│  └──────────────────────────────────────────────┘   │
│                        │                            │
│          ┌─────────────┴─────────────┐              │
│          ▼                           ▼              │
│  ┌───────────────┐         ┌───────────────┐        │
│  │ FormulaParser │         │FormulaEvaluator│        │
│  │  (解析器)      │         │  (求值器)       │        │
│  └───────────────┘         └───────────────┘        │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│               数据存储层                             │
│     CellStore (单元格数据) + Functions (函数库)       │
└─────────────────────────────────────────────────────┘
```

### 数据流图

```
用户输入公式 → isFormula() 检测
                    ↓
           parseFormula() 解析为 AST
                    ↓
           evaluate() 递归求值 AST
                    ↓
         收集依赖关系 → 更新依赖图
                    ↓
           返回计算结果给用户
                    ↓
    当被引用单元格变化时:
    onCellChanged() → 查找依赖者 → 重算脏单元格 → 更新显示
```

---

## 核心模块

### 1️⃣ FormulaEngine（公式引擎）

**文件位置**: [src/formula/FormulaEngine.js](../src/formula/FormulaEngine.js)

#### 类定义

```javascript
export class FormulaEngine {
    constructor(workbook)
}
```

#### 核心属性

| 属性名 | 类型 | 说明 |
|--------|------|------|
| `workbook` | Workbook | 工作簿实例，用于跨表引用 |
| `evaluator` | FormulaEvaluator | 求值器实例 |
| `dependents` | Map\<string, Set\> | 依赖图：被依赖者 → 依赖者集合 |
| `dependsOn` | Map\<string, Set\> | 反向依赖图：公式 → 被引用的单元格 |
| `astCache` | Map\<string, object\> | AST 缓存，避免重复解析 |
| `dirtyCells` | Set\<string\> | 待重算的脏单元格队列 |

#### 关键方法

##### `static isFormula(value)` 
判断值是否为公式（以 "=" 开头）

```javascript
FormulaEngine.isFormula("=SUM(A1:B10)")  // true
FormulaEngine.isFormula("123")           // false
FormulaEngine.isFormula("=")             // false（长度不足）
```

##### `setFormula(sheet, row, col, formulaStr)`
设置公式单元格并计算结果

**参数**:
- `sheet`: Sheet 实例
- `row`, `col**: 单元格坐标（从0开始）
- `formulaStr`: 公式字符串（可带或不带前导 "="）

**返回值**: 计算结果或错误码

**示例**:
```javascript
const result = engine.setFormula(sheet, 5, 3, "=SUM(A1:A10)");
// result = 550 (假设 A1:A10 的和为 550)
```

##### `onCellChanged(sheet, row, col)`
当非公式单元格变化时触发自动重算

**参数**:
- `sheet`: Sheet 实例
- `row`, `col**: 变化的单元格坐标

**返回值**: 受影响的重算结果数组

**示例**:
```javascript
// 用户修改了 A1 单元格
const affectedCells = engine.onCellChanged(sheet, 0, 0);
// affectedCells = [
//   { sheetName: "Sheet1", row: 5, col: 3, newValue: 600 },
//   { sheetName: "Sheet1", row: 10, col: 2, newValue: true }
// ]
```

##### `recalculateAll(sheet)`
重算指定工作表中的所有公式

**使用场景**:
- Undo/Redo 操作后
- 从文件加载数据后
- 批量修改数据后确保一致性

##### `removeFormula(sheet, row, col)`
移除单元格的公式及其所有依赖关系

**使用场景**:
- 用户删除公式单元格
- 将公式单元格改为普通值

##### `getDependencies(sheetName, row, col)`
获取公式单元格的依赖列表（调试用）

**返回值**: 被引用的单元格 key 数组

```javascript
engine.getDependencies("Sheet1", 5, 3);
// ["Sheet1!0,0", "Sheet1!0,1", ..., "Sheet1!9,0"]
```

##### `getDependents(sheetName, row, col)`
获取依赖某个单元格的公式列表（调试用）

**返回值**: 引用该单元格的公式 key 数组

```javascript
engine.getDependents("Sheet1", 0, 0);
// ["Sheet1!5,3", "Sheet1!10,2"]  // C6 和 K11 都引用了 A1
```

##### `destroy()`
销毁引擎，清理所有内存

---

### 2️⃣ FormulaParser（公式解析器）

**文件位置**: [src/formula/FormulaParser.js](../src/formula/FormulaParser.js)

#### 功能说明

将公式字符串转换为 **AST（Abstract Syntax Tree，抽象语法树）**

#### 解析流程

```
公式字符串: "SUM(A1:A10)+B2*0.8"
                ↓
词法分析 (tokenize):
[FUNCTION:"SUM", LPAREN, CELL_REF:(0,0), COLON, CELL_REF:(9,0), RPAREN,
 OPERATOR:"+", CELL_REF:(1,1), OPERATOR:"*", NUMBER:0.8]
                ↓
语法分析 (parseExpression):
{
  type: "binaryOp",
  operator: "+",
  left: {
    type: "function",
    name: "SUM",
    args: [{
      type: "rangeRef",
      topRow: 0, topCol: 0,
      bottomRow: 9, bottomCol: 0
    }]
  },
  right: {
    type: "binaryOp",
    operator: "*",
    left: { type: "cellRef", row: 1, col: 1 },
    right: { type: "literal", value: 0.8 }
  }
}
```

#### Token 类型定义

```javascript
const TOKEN = {
    NUMBER: "NUMBER",        // 数字字面量
    STRING: "STRING",        // 字符串字面量
    CELL_REF: "CELL_REF",    // 单元格引用 (A1, B2)
    RANGE: "RANGE",          // 范围引用 (A1:B10)
    FUNCTION: "FUNCTION",    // 函数名 (SUM, IF)
    OPERATOR: "OPERATOR",    // 运算符 (+, -, *, /)
    LPAREN: "LPAREN",        // 左括号 (
    RPAREN: "RPAREN",        // 右括号 )
    COMMA: "COMMA",          // 逗号 ,
    COLON: "COLON",          // 冒号 :
    SHEET_REF: "SHEET_REF",  // 工作表引用 (Sheet2)
    EOF: "EOF"               // 结束标记
};
```

#### 运算符优先级表

| 运算符 | 优先级 | 结合性 | 类型 |
|--------|-------|--------|------|
| `^` | 3 | 右结合 | 幂运算 |
| `*`, `/` | 2 | 左结合 | 乘除 |
| `+`, `-` | 1 | 左结合 | 加减 |
| `&` | 0 | 左结合 | 文本连接 |
| `=`, `<>`, `<`, `>`, `<=`, `>=` | -1 | 左结合 | 比较 |

#### 辅助工具函数

##### `colToIndex(colStr)`
列字母转索引

```javascript
colToIndex("A")   // 0
colToIndex("Z")   // 25
colToIndex("AA")  // 26
colToIndex("AB")  // 27
colToIndex("ZZ")  // 701
```

##### `indexToCol(index)`
列索引转字母

```javascript
indexToCol(0)    // "A"
indexToCol(25)   // "Z"
indexToCol(26)   // "AA"
indexToCol(701)  // "ZZ"
```

---

### 3️⃣ FormulaEvaluator（公式求值器）

**文件位置**: [src/formula/FormulaEvaluator.js](../src/formula/FormulaEvaluator.js)

#### 功能说明

遍历 AST 并递归求值，同时收集依赖关系。

#### 求值逻辑

```javascript
evaluate(ast, sheet) {
    this.dependencies = new Set();  // 重置依赖集
    return this.#evalNode(ast, sheet);  // 递归求值
}
```

#### 节点类型处理

| AST 节点类型 | 处理方式 | 示例 |
|-------------|---------|------|
| `literal` | 直接返回字面值 | `123`, `"hello"` |
| `cellRef` | 从 CellStore 读取单元格值 | `A1` → `100` |
| `rangeRef` | 读取范围，返回二维数组 | `A1:B2` → `[[1,2],[3,4]]` |
| `function` | 调用 FUNCTIONS 注册表的函数 | `SUM(...)` |
| `unaryOp` | 一元运算（取负） | `-A1` |
| `binaryOp` | 二元运算（算术/比较/文本） | `A1+B1` |

#### 运算符执行细节

##### 算术运算符

```javascript
"+" : left + right
"-" : left - right
"*" : left * right
"/" : right === 0 ? "#DIV/0!" : left / right  // 除零保护
"^" : Math.pow(left, right)
```

##### 文本运算符

```javascript
"&" : String(left) + String(right)  // 字符串拼接
```

##### 比较运算符

```javascript
"="  : left === right
"<>" : left !== right
"<"  : left < right
">"  : left > right
"<=" : left <= right
">=" : left >= right
```

#### 类型转换规则

```javascript
_toNum(value):
  - 数字 → 直接返回
  - 字符串 → parseFloat()
  - 其他 → NaN

// 示例
_toNum(123)        // 123
_toNum("456")      // 456
_toNum("abc")      // NaN
_toNum("")         // NaN
_toNum(null)       // NaN
```

---

### 4️⃣ 函数注册表（Functions）

**文件位置**: [src/formula/functions/index.js](../src/formula/functions/index.js)

#### 数学函数

| 函数名 | 签名 | 说明 | 示例 |
|--------|------|------|------|
| **SUM** | `SUM(args...)` | 求和 | `SUM(A1:A10)` = 550 |
| **AVERAGE** | `AVERAGE(args...)` | 平均值 | `AVERAGE(1,2,3)` = 2 |
| **MAX** | `MAX(args...)` | 最大值 | `MAX(1,5,3)` = 5 |
| **MIN** | `MIN(args...)` | 最小值 | `MIN(1,5,3)` = 1 |
| **ABS** | `ABS(num)` | 绝对值 | `ABS(-5)` = 5 |
| **ROUND** | `ROUND(num, digits)` | 四舍五入 | `ROUND(3.14159, 2)` = 3.14 |

#### 统计函数

| 函数名 | 签名 | 说明 | 示例 |
|--------|------|------|------|
| **COUNT** | `COUNT(args...)` | 计数数字 | `COUNT(1,"a",3)` = 2 |
| **COUNTA** | `COUNTA(args...)` | 计数非空 | `COUNTA(1,"",3)` = 2 |

#### 逻辑函数

| 函数名 | 签名 | 说明 | 示例 |
|--------|------|------|------|
| **IF** | `IF(condition, true_val, false_val?)` | 条件判断 | `IF(A1>0,"正","负")` |

#### 文本函数

| 函数名 | 签名 | 说明 | 示例 |
|--------|------|------|------|
| **UPPER** | `UPPER(text)` | 转大写 | `UPPER("hello")` = "HELLO" |
| **LOWER** | `LOWER(text)` | 转小写 | `LOWER("HELLO")` = "hello" |
| **CONCAT** | `CONCAT(args...)` | 连接文本 | `CONCAT("A","B")` = "AB" |
| **CONCATENATE** | `CONCATENATE(args...)` | 同 CONCAT | 同上 |

#### 函数签名规范

每个函数接收两个参数：
- `args`: 已求值的参数数组（可能是嵌套数组）
- `context`: `{ sheet, workbook }` 上下文对象

```javascript
export const FUNCTIONS = {
    SUM(args, context) {
        const flat = _flatten(args);  // 展平嵌套数组
        return flat.reduce((acc, v) => {
            const n = _toNum(v);
            return isNaN(n) ? acc : acc + n;
        }, 0);
    },
    
    IF(args, context) {
        if (args.length < 2) return "#VALUE!";
        return args[0] ? args[1] : (args[2] ?? false);  // 默认返回 false
    }
};
```

---

## 支持的语法特性

### 1. 单元格引用

#### 基本格式

```
A1      → 第0行第0列
B5      → 第4行第1列
AA10    → 第9行第26列
ZZ100   → 第99行第701列
```

#### 坐标转换规则

```
列字母: A=0, B=1, ..., Z=25, AA=26, AB=27, ...
行号:   1→0, 2→1, 3→2, ... (减1)
```

**示例**:

```javascript
// A1 表示
{ type: "cellRef", sheet: null, row: 0, col: 0 }

// AB15 表示
{ type: "cellRef", sheet: null, row: 14, col: 28 }
```

### 2. 范围引用

#### 基本格式

```
A1:B10   → 从 A1 到 B10 的矩形区域
A:A      → 整个 A 列
1:5      → 第1到第5行
```

#### AST 结构

```javascript
{
  type: "rangeRef",
  sheet: null,           // 可选：跨表引用的工作表名
  topRow: 0,             // 起始行（较小值）
  topCol: 0,             // 起始列（较小值）
  bottomRow: 9,          // 结束行（较大值）
  bottomCol: 1           // 结束列（较大值）
}
```

#### 求值结果

范围引用求值后返回 **二维数组**：

```javascript
// A1:B2 包含 [[1,2],[3,4]]
evaluate({type:"rangeRef", topRow:0, topCol:0, bottomRow:1, bottomCol:1})
// 返回: [[1, 2], [3, 4]]
```

### 3. 跨表引用

#### 语法格式

```
Sheet2!A1          → 引用 Sheet2 的 A1 单元格
Sheet2!A1:B10      → 引用 Sheet2 的 A1:B10 范围
'Sheet Name'!C5    → 工作表名含空格时用单引号包裹
```

#### AST 结构

```javascript
{
  type: "cellRef",
  sheet: "Sheet2",  // 工作表名称
  row: 0,
  col: 0
}
```

#### 实现原理

```javascript
#resolveSheet(name) {
    return this.workbook.sheets.get(name) || null;  // 从 Workbook 获取目标 Sheet
}

#evalCellRef(node, sheet) {
    let targetSheet = node.sheet 
        ? this.#resolveSheet(node.sheet)  // 跨表：查找目标 Sheet
        : sheet;                           // 本表：直接使用当前 Sheet
    
    if (!targetSheet) return "#REF!";  // 工作表不存在
    return targetSheet.cellStore.get(node.row, node.col)?.value;
}
```

### 4. 字面量

#### 数字

```
123        → 整数
3.14       → 浮点数
-5         → 负数（一元运算）
1.23e4     → 科学计数法（暂不支持）
```

#### 字符串

```
"Hello World"     → 双引号包裹
'Hello World'     → 单引号包裹
""                → 空字符串
```

### 5. 运算符表达式

#### 算术运算

```javascript
=A1 + B1           // 加法
=A1 - B1           // 减法
=A1 * B1           // 乘法
=A1 / B1           // 除法（除零返回 #DIV/0!）
=A1 ^ 2            // 幂运算
=-A1               // 取负
```

#### 比较运算

```javascript
=A1 > B1           // 大于
=A1 < B1           // 小于
=A1 >= B1          // 大于等于
=A1 <= B1          // 小于等于
=A1 = B1           // 等于
=A1 <> B1          // 不等于
```

#### 文本运算

```javascript
=A1 & " " & B1     // 字符串拼接
="Total: " & SUM(A1:A10)  // 混合拼接
```

#### 复合表达式

```javascript
=(A1 + B1) * C1 / D1
=IF(SUM(A1:A10)>100, "达标", "未达标")
=ROUND(AVERAGE(B2:B20), 2)
=UPPER(C5) & "_" & LOWER(D5)
```

### 6. 函数调用

#### 基本语法

```
函数名(参数1, 参数2, ...)
```

#### 多参数与范围混合

```javascript
=SUM(A1:A10, C1:C10, 100)        // 混合范围和字面量
=AVERAGE(B2:D2, F2:H2)           // 多个范围
=IF(A1>0, SUM(B1:B10), MAX(C1:C10))  // 嵌套调用
```

#### 嵌套函数

```javascript
=ROUND(AVERAGE(SUM(A1:A5), SUM(B1:B5)), 2)
=IF(COUNT(A1:A10)>5, MAX(A1:A10), MIN(A1:A10))
=UPPER(CONCAT(LEFT(A1, 3), "_", RIGHT(B1, 2)))
```

---

## 依赖追踪系统

### 设计理念

当单元格 A 被多个公式引用时，A 的变化应该自动触发这些公式的重新计算。这就是**依赖追踪系统**的核心价值。

### 数据结构

#### 双向依赖图

```javascript
// 正向依赖：公式 → 被引用的单元格
dependsOn: Map<"Sheet1!5,3", Set<"Sheet1!0,0", "Sheet1!1,0", ..., "Sheet1!9,0">>

// 反向依赖：被引用的单元格 → 引用它的公式
dependents: Map<"Sheet1!0,0", Set<"Sheet1!5,3", "Sheet1!10,2">>
```

#### 可视化示例

```
单元格关系:
A1 = 10
B1 = 20
C1 = 30
D1 = 40

C6  =SUM(A1:B10)     ← 依赖: A1, A2, ..., B10
K11 =IF(C6>100, "大", "小")  ← 依赖: C6
M15 =C6 + K11        ← 依赖: C6, K11

依赖图可视化:

  A1 ──┬── C6 ──┬── K11 ──┬── M15
  A2 ──┤       │         │
  ...  ┤       └─────────┘
  B10 ─┘

反向依赖图:
  A1 → [C6]
  A2 → [C6]
  ...
  C6 → [K11, M15]
  K11 → [M15]
```

### 工作流程

#### 1. 设置公式时建立依赖

```javascript
setFormula(sheet, 5, 3, "=SUM(A1:B10)")
    ↓
parseFormula("SUM(A1:B10)") → AST
    ↓
evaluate(AST) → 收集 dependencies = {"Sheet1!0,0", "Sheet1!0,1", ..., "Sheet1!9,1"}
    ↓
updateDependencies("Sheet1!5,3", dependencies)
    ↓
dependsOn["Sheet1!5,3"] = {A1, A2, ..., B10}  // C6 依赖这些单元格
dependents[A1] = {C6}                           // A1 被 C6 引用
dependents[A2] = {C6}                           // A2 被 C6 引用
...
```

#### 2. 单元格变化时触发重算

```javascript
onCellChanged(sheet, 0, 0)  // A1 变化了
    ↓
查找 dependents["Sheet1!0,0"] → {"Sheet1!5,3"}  // 找到 C6
    ↓
collectDirty("Sheet1!0,0", visited={})
    ↓
dirtyCells = {"Sheet1!5,3"}  // 标记 C6 为脏
    ↓
继续收集 C6 的依赖者 → {"Sheet1!10,2", "Sheet1!14,12"}  // K11, O15
    ↓
最终 dirtyCells = {"Sheet1!5,3", "Sheet1!10,2", "Sheet1!14,12"}
    ↓
recalculate() → 依次重算 C6, K11, O15
    ↓
更新 CellStore 和 UI 显示
```

#### 3. 移除公式时清理依赖

```javascript
removeFormula(sheet, 5, 3)  // 删除 C6 的公式
    ↓
removeDependencies("Sheet1!5,3")
    ↓
从 dependsOn 中删除 "Sheet1!5,3"
从 dependents[A1...B10] 中移除 "Sheet1!5,3"
    ↓
astCache.delete("Sheet1!5,3")  // 清理 AST 缓存
```

### 循环引用检测

**状态**: ✅ **已实现**（v2.0+）

#### 工作原理

公式引擎使用**调用栈（Call Stack）**机制检测循环引用：

1. 当开始求值某个单元格时，将其 key 加入调用栈
2. 求值过程中访问其他单元格时，检查该单元格是否已在调用栈中
3. 如果发现重复，立即返回 `#CIRCULAR!` 错误并记录日志
4. 求值完成后，从调用栈中移除当前单元格

#### 检测场景

| 场景 | 示例 | 结果 |
|------|------|------|
| **直接循环** | A1 引用自身 | ✅ 检测到 |
| **间接循环** | A1→B1→C1→A1 | ✅ 检测到 |
| **跨表循环** | Sheet1!A1 → Sheet2!B1 → Sheet1!A1 | ✅ 检测到 |
| **正常依赖** | A1→B1, C1→A1 (无环) | ✅ 正常工作 |

#### 示例代码

```javascript
// 场景 1: 直接自引用
engine.setFormula(sheet, 0, 0, '=A1+1');
// 单元格显示: #CIRCULAR!
// 日志: [ERROR] [FORMULA_CIRCULAR_REFERENCE] 检测到循环引用: Sheet1!0,0
//       元数据: {circularCell: "Sheet1!0,0", callStack: ["Sheet1!0,0"], ...}

// 场景 2: 间接循环引用
sheet.setCell(0, 0, '=B1+1');   // A1 = B1 + 1
sheet.setCell(1, 0, '=C1+1');   // B1 = C1 + 1
sheet.setCell(2, 0, '=A1+1');   // C1 = A1 + 1 ← 循环！
// 所有单元格都显示: #CIRCULAR!

// 场景 3: 跨表循环引用
const sheet2 = workbook.createSheet('Sheet2');
engine.setFormula(sheet, 0, 0, '=Sheet2!A1+1');
engine.setFormula(sheet2, 0, 0, '=Sheet1!A1+1');
// 两个单元格都显示: #CIRCULAR!
```

#### 错误处理

当检测到循环引用时：

- **返回值**: `#CIRCULAR!` （Excel 标准错误码）
- **错误级别**: ERROR
- **错误码**: `FORMULA_CIRCULAR_REFERENCE`
- **日志元数据**:
  ```javascript
  {
    circularCell: "Sheet1!0,0",      // 形成循环的单元格
    callStack: ["Sheet1!0,0"],        // 当前调用栈路径
    sheetName: "Sheet1",
    row: 0,
    col: 0
  }
  ```

#### 监听循环引用事件

```javascript
import { errorHandler, ERROR_CODE } from '../core/ErrorHandler.js';

errorHandler.onError((code, message, level, meta) => {
    if (code === ERROR_CODE.FORMULA_CIRCULAR_REFERENCE) {
        console.error('⚠️ 循环引用警告:', {
            cell: meta.circularCell,
            path: meta.callStack.join(' → ')
        });

        // 可选：发送到监控系统
        analytics.track('circular_reference', {
            cell: meta.circularCell,
            stackTrace: meta.callStack,
            timestamp: Date.now()
        });
    }
});
```

#### 性能影响

- **时间复杂度**: O(1) - 使用 Set 进行查找，常数时间
- **空间复杂度**: O(n) - n 为调用深度，通常很小（<100）
- **开销**: 极小，仅增加一次 Set.has() 查找

---

## API 参考

### 快速参考卡片

#### FormulaEngine 类

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `constructor(workbook)` | Workbook | - | 创建引擎实例 |
| `isFormula(value)` | any | boolean | 静态方法，判断是否为公式 |
| `setFormula(sheet,row,col,str)` | Sheet,num,num,string | any | 设置公式并计算 |
| `removeFormula(sheet,row,col)` | Sheet,num,num | void | 移除公式 |
| `onCellChanged(sheet,row,col)` | Sheet,num,num | Array | 触发自动重算 |
| `recalculateAll(sheet)` | Sheet | void | 全部重算 |
| `getDependencies(s,r,c)` | string,num,num | string[] | 获取依赖列表 |
| `getDependents(s,r,c)` | string,num,num | string[] | 获取被依赖列表 |
| `destroy()` | - | void | 销毁引擎 |

#### FormulaParser 函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `parseFormula(formula)` | string | object | 解析公式为 AST |
| `colToIndex(colStr)` | string | number | 列字母→索引 |
| `indexToCol(index)` | number | string | 索引→列字母 |

#### FormulaEvaluator 类

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `constructor(workbook)` | Workbook | - | 创建求值器 |
| `evaluate(ast,sheet)` | object,Sheet | any | 求 AST 值 |

#### 内置函数列表

| 函数 | 参数 | 返回值 | 分类 |
|------|------|--------|------|
| `SUM(args...)` | number[] | number | 数学 |
| `AVERAGE(args...)` | number[] | number | 数学 |
| `MAX(args...)` | number[] | number | 数学 |
| `MIN(args...)` | number[] | number | 数学 |
| `ABS(num)` | number | number | 数学 |
| `ROUND(num,digits)` | number,number | number | 数学 |
| `COUNT(args...)` | any[] | number | 统计 |
| `COUNTA(args...)` | any[] | number | 统计 |
| `IF(cond,t,f?)` | any,any,any | any | 逻辑 |
| `UPPER(text)` | string | string | 文本 |
| `LOWER(text)` | string | string | 文本 |
| `CONCAT(args...)` | any[] | string | 文本 |
| `CONCATENATE(args...)` | any[] | string | 文本 |

#### 用户自定义函数 API（NEW）

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `registerFunction(name,fn)` | string,Function | void | 注册自定义函数 |
| `unregisterFunction(name)` | string | boolean | 注销自定义函数 |
| `hasFunction(name)` | string | boolean | 检查函数是否存在 |
| `getRegisteredFunctions()` | - | string[] | 获取所有已注册函数名 |

**详细说明**:

```javascript
// 注册自定义函数
engine.registerFunction('MYFUNC', (args, ctx) => {
    // args: 已求值的参数数组
    // ctx: { sheet, workbook } 上下文对象
    return args[0] * 2;
});

// 注销自定义函数
const success = engine.unregisterFunction('MYFUNC');

// 检查函数是否存在
if (engine.hasFunction('MYFUNC')) {
    console.log('函数已注册');
}

// 获取所有已注册的函数
console.log(engine.getRegisteredFunctions());
// ["SUM", "AVERAGE", "IF", "MYFUNC", ...]
```

**函数签名规范**:
- `name`: 函数名（自动转大写，如 `myfunc` → `MYFUNC`）
- `fn`: 函数实现，签名为 `(args: Array, context?: { sheet, workbook }) => any`
  - `args`: 已求值的参数数组
  - `context`: 可选上下文对象，包含当前工作表和工作簿引用

---

## 使用示例

### 基础示例

#### 1. 创建引擎并设置公式

```javascript
import { FormulaEngine } from './formula/FormulaEngine.js';

// 创建引擎（需要 Workbook 实例）
const engine = new FormulaEngine(workbook);

// 设置公式
const sheet = wb.getActiveSheet();

// 在 C6 设置求和公式
const sumResult = engine.setFormula(sheet, 5, 2, "=SUM(A1:B10)");
console.log(sumResult);  // 550 (假设 A1:B10 的和)

// 在 E3 设置平均值
const avgResult = engine.setFormula(sheet, 2, 4, "=AVERAGE(A1:A10)");
console.log(avgResult);  // 55
```

#### 2. 触发自动重算

```javascript
// 用户通过 UI 修改了 A1 单元格
sheet.cellStore.set(0, 0, newValue);

// 通知引擎触发重算
const affectedCells = engine.onCellChanged(sheet, 0, 0);

console.log(`影响了 ${affectedCells.length} 个公式单元格`);
affectedCells.forEach(({sheetName, row, col, newValue}) => {
    console.log(`${sheetName}!${indexToCol(col)}${row+1} = ${newValue}`);
});
```

#### 3. 条件判断

```javascript
// 设置 IF 公式
engine.setFormula(sheet, 10, 2, '=IF(A1>100,"High","Low")');

// 嵌套 IF
engine.setFormula(sheet, 11, 2, '=IF(A1>90,"A",IF(A1>80,"B",IF(A1>70,"C","F")))');
```

#### 4. 文本处理

```javascript
// 大小写转换
engine.setFormula(sheet, 0, 5, '=UPPER(A1)');
engine.setFormula(sheet, 1, 5, '=LOWER(A2)');

// 字符串拼接
engine.setFormula(sheet, 2, 5, '=CONCAT("Name: ", A3, " Age: ", B3)');
```

### 高级示例

#### 1. 跨表引用

```javascript
// 在 Sheet1 中引用 Sheet2 的数据
const sheet1 = wb.sheets.get("Sheet1");
const sheet2 = wb.sheets.get("Sheet2");

// 在 Sheet1!A1 引用 Sheet2!B10
engine.setFormula(sheet1, 0, 0, "=Sheet2!B10");

// 跨表范围求和
engine.setFormula(sheet1, 0, 1, "=SUM(Sheet2!A1:C10)");
```

#### 2. 复杂公式组合

```javascript
// 计算加权平均
engine.setFormula(sheet, 5, 5, 
    "=SUMPRODUCT(A1:A5,B1:B5)/SUM(B1:B5)"  
    // 注意: SUMPRODUCT 需要自行实现或扩展
);

// 动态评级（使用现有函数组合）
engine.setFormula(sheet, 6, 5,
    '=IF(AVERAGE(A1:A10)>=90,"优秀",IF(AVERAGE(A1:A10)>=80,"良好","一般"))'
);

// 四舍五入到指定小数位
engine.setFormula(sheet, 7, 5, "=ROUND(SUM(A1:A100)/COUNT(A1:A100), 2)");
```

#### 3. 批量操作

```javascript
// 为整列设置公式
for (let row = 0; row < 100; row++) {
    engine.setFormula(sheet, row, 3, `=A${row+1}*B${row+1}*0.8`);
}

// 复制公式模式
const formulaTemplate = "=SUM(A{row}:C{row})";
for (let row = 0; row < 50; row++) {
    const formula = formulaTemplate.replace("{row}", row + 1);
    engine.setFormula(sheet, row, 5, formula);
}
```

#### 4. 调试与诊断

```javascript
// 查看某个公式的依赖项
const deps = engine.getDependencies("Sheet1", 5, 2);
console.log("C6 公式依赖:", deps);
// ["Sheet1!0,0", "Sheet1!0,1", ..., "Sheet1!9,1"]

// 查看谁依赖某个单元格
const dependents = engine.getDependents("Sheet1", 0, 0);
console.log("A1 被以下公式引用:", dependents);
// ["Sheet1!5,2", "Sheet1!10,2"]

// 手动强制全部重算
engine.recalculateAll(sheet);
```

---

## 错误处理机制

### 错误类型一览

| 错误码 | 含义 | 触发场景 | 示例 |
|--------|------|---------|------|
| **#PARSE!** | 解析错误 | 公式语法错误 | `=SUM(` （缺少括号） |
| **#VALUE!** | 值错误 | 类型不匹配或运算错误 | `="abc"+1` |
| **#DIV/0!** | 除零错误 | 除数为 0 | `=1/0` |
| **#REF!** | 引用错误 | 引用不存在的工作表或单元格 | `=Sheet999!A1` |
| **#NAME?** | 名称错误 | 函数不存在 | `=UNKNOWN()` |

### 错误处理流程

```javascript
setFormula(sheet, row, col, formulaStr) {
    try {
        ast = parseFormula(raw);  // 可能抛出异常 → #PARSE!
    } catch {
        return "#PARSE!";
    }

    try {
        result = this.evaluator.evaluate(ast, sheet);  // 可能抛出异常 → #VALUE!
    } catch {
        result = "#VALUE!";
    }

    return result;
}
```

### 各阶段的错误捕获

#### 1. 解析阶段 (#PARSE!)

```javascript
// 语法错误示例
parseFormula("SUM(")           // Error: Unexpected EOF
parseFormula("1++2")           // 可以解析但语义错误
parseFormula("=SUM((")         // 括号不匹配

// 返回 #PARSE!
```

#### 2. 求值阶段 (#VALUE!, #DIV/0!, #REF!, #NAME?)

```javascript
// #VALUE!: 类型错误
"A" + 1                        // → #VALUE! (如果无法转数字)

// #DIV/0!: 除零
1 / 0                          // → #DIV/0!

// #REF!: 引用错误
Sheet999!A1                    // → #REF! (工作表不存在)

// #NAME?: 函数不存在
=NONEXISTENTFUNC()             // → #NAME?
```

### 最佳实践

#### 输入验证

```javascript
function safeSetFormula(engine, sheet, row, col, formulaStr) {
    // 1. 基础检查
    if (!FormulaEngine.isFormula(formulaStr)) {
        console.warn("不是公式:", formulaStr);
        return null;
    }

    // 2. 设置公式
    const result = engine.setFormula(sheet, row, col, formulaStr);

    // 3. 错误处理
    if (typeof result === "string" && result.startsWith("#")) {
        console.error(`公式错误 [${row},${col}]: ${result}`);
        
        // 可选：回滚操作
        // sheet.cellStore.set(row, col, originalValue);
        
        return result;  // 返回错误码供 UI 显示
    }

    return result;  // 成功返回计算结果
}
```

#### 错误展示

```javascript
// 在 UI 中显示错误
function displayCellValue(cell) {
    if (typeof cell.value === "string" && cell.value.startsWith("#")) {
        // 错误值：红色背景 + 提示图标
        return `<span class="error">${cell.value}</span>`;
    }
    return cell.value;
}
```

---

## 性能优化建议

### 1. AST 缓存

**已实现**: ✅

```javascript
// FormulaEngine 使用 astCache 缓存解析后的 AST
this.astCache.set(key, ast);  // 缓存

// 后续重算直接使用缓存，避免重复解析
const ast = this.astCache.get(key);
if (ast) {
    result = this.evaluator.evaluate(ast, sheet);  // 直接求值
}
```

**优势**:
- 避免重复词法分析和语法分析
- 复杂公式解析成本高（如嵌套函数），缓存效果显著

### 2. 脏标记机制（Dirty Flagging）

**已实现**: ✅

```javascript
// 只重算受影响的单元格，而非全部
onCellChanged(sheet, row, col) {
    this.dirtyCells = new Set();
    this.#collectDirty(key, new Set());  // 收集脏单元格
    this.#recalculate(sheet);  // 仅重算脏单元格
}
```

**优势**:
- 局部更新，避免全局重算
- 依赖图精确追踪，最小化计算量

### 3. 批量更新优化

**建议**: 对于批量数据导入，先禁用自动重算

```javascript
// 伪代码示例
engine.batchMode = true;  // 进入批处理模式

for (let i = 0; i < 10000; i++) {
    sheet.cellStore.set(i, 0, Math.random());
    // 此时不会触发 onCellChanged
}

engine.batchMode = false;  // 退出批处理模式
engine.recalculateAll(sheet);  // 一次性全部重算
```

### 4. 依赖图压缩

**建议**: 合并相同依赖集的公式

```javascript
// 如果多个公式有相同的依赖集，可以分组处理
// 例如: C1=SUM(A1:A10), D1=AVERAGE(A1:A10) 都依赖 A1:A10
// 当 A1:A10 中任一变化时，一起重算 C1 和 D1
```

### 5. Web Worker 异步化

**建议**: 将求值过程移至 Worker 线程

```javascript
// 主线程
const worker = new Worker('formula-worker.js');
worker.postMessage({ type: 'EVALUATE', ast, sheetData });

worker.onmessage = (e) => {
    const { cellKey, result } = e.data;
    updateUI(cellKey, result);  // 不阻塞主线程
};
```

### 6. 虚拟化长范围

**建议**: 对超大范围（如 A1:Z10000）进行虚拟化

```javascript
// 只加载可视区域的数据到内存
// 滚动时按需加载其他区域
// 配合分页插件使用
```

---

## 扩展指南

### 🎯 用户自定义函数（UDF）

#### 概述

Canvas Spreadsheet 支持运行时注册**用户自定义函数（User Defined Functions, UDF）**，允许开发者根据业务需求扩展公式引擎的功能。

**核心特性**:
- ✅ **动态注册**: 无需重启应用，随时添加/移除函数
- ✅ **大小写不敏感**: `myfunc`、`MyFunc`、`MYFUNC` 自动统一
- ✅ **覆盖保护**: 覆盖内置函数时会打印警告日志
- ✅ **类型安全**: 参数校验防止错误注册
- ✅ **上下文支持**: 可访问工作簿和工作表对象
- ✅ **依赖追踪兼容**: 自定义函数自动参与依赖追踪系统

---

#### 基础用法

##### 1️⃣ 注册简单函数

```javascript
// 获取公式引擎实例
const engine = workbook.formulaEngine;

// 注册一个简单的翻倍函数
engine.registerFunction('DOUBLE', (args) => {
    return args[0] * 2;
});

// 现在可以在单元格中使用
sheet.setCell(0, 0, '=DOUBLE(A1)');
// 如果 A1 = 5，则结果为 10
```

##### 2️⃣ 注册多参数函数

```javascript
// 计算税额
engine.registerFunction('TAX', (args) => {
    const amount = args[0];      // 金额
    const rate = args[1] ?? 0.13; // 税率（默认13%）
    return amount * rate;
});

// 使用：=TAX(B1, 0.13)
sheet.setCell(0, 0, '=TAX(10000, 0.13)');
// 结果: 1300

// 使用默认税率
sheet.setCell(0, 1, '=TAX(10000)');
// 结果: 1300 (使用默认税率 0.13)
```

##### 3️⃣ 使用上下文参数

```javascript
// 跨表求和
engine.registerFunction('CROSS_SUM', (args, ctx) => {
    const sheetName = args[0];       // 目标工作表名
    const rangeStr = args[1];        // 范围字符串（如 "A1:B10"）

    // 通过 context 访问工作簿
    const targetSheet = ctx.workbook.sheets.get(sheetName);
    if (!targetSheet) return '#REF!';

    // 解析范围并计算总和
    // 注意：这里简化处理，实际应使用 FormulaParser 解析范围
    let sum = 0;
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 2; c++) {
            const cell = targetSheet.cellStore.get(r, c);
            if (cell && typeof cell.value === 'number') {
                sum += cell.value;
            }
        }
    }
    return sum;
});

// 使用：=CROSS_SUM("Sheet2", "A1:B10")
```

---

#### 高级用法

##### 4️⃣ 条件判断与业务逻辑

```javascript
// 成绩评级
engine.registerFunction('GRADE', (args) => {
    const score = args[0];

    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
});

// 使用：=GRADE(A1)

// 薪资计算器（含加班费）
engine.registerFunction('OVERTIME_PAY', (args) => {
    const hours = args[0];     // 工作时长
    const baseRate = args[1];  // 基本时薪
    const regularHours = 40;   // 标准工时

    if (hours <= regularHours) {
        return hours * baseRate;
    } else {
        // 加班部分按 1.5 倍计算
        const regularPay = regularHours * baseRate;
        const overtimePay = (hours - regularHours) * baseRate * 1.5;
        return regularPay + overtimePay;
    }
});
```

##### 5️⃣ 数组和范围处理

```javascript
// 计算中位数
engine.registerFunction('MEDIAN', (args) => {
    const numbers = _flattenAndFilterNumbers(args);
    if (numbers.length === 0) return '#DIV/0!';

    numbers.sort((a, b) => a - b);
    const mid = Math.floor(numbers.length / 2);

    if (numbers.length % 2 === 0) {
        return (numbers[mid - 1] + numbers[mid]) / 2;
    } else {
        return numbers[mid];
    }
});

// 辅助工具函数（可在全局定义）
function _flattenAndFilterNumbers(args) {
    const result = [];
    for (const item of args) {
        if (Array.isArray(item)) {
            result.push(..._flattenAndFilterNumbers(item));
        } else if (typeof item === 'number' && !isNaN(item)) {
            result.push(item);
        } else if (typeof item === 'string') {
            const num = parseFloat(item);
            if (!isNaN(num)) result.push(num);
        }
    }
    return result;
}
```

##### 6️⃣ 金融函数示例

```javascript
// 内部收益率（IRR）简化版
engine.registerFunction('IRR', (args) => {
    const cashflows = args[0]; // 现金流数组
    const guess = args[1] || 0.1; // 初始猜测值

    let rate = guess;
    let iterations = 0;
    const maxIterations = 100;
    const tolerance = 1e-6;

    while (iterations < maxIterations) {
        let npv = 0;
        let dnpv = 0;

        for (let i = 0; i < cashflows.length; i++) {
            npv += cashflows[i] / Math.pow(1 + rate, i);
            dnpv -= i * cashflows[i] / Math.pow(1 + rate, i + 1);
        }

        const newRate = rate - npv / dnpv;

        if (Math.abs(newRate - rate) < tolerance) {
            return newRate;
        }

        rate = newRate;
        iterations++;
    }

    return '#NUM!'; // 未收敛
});
```

---

#### 函数管理 API

##### 注册函数

```javascript
/**
 * engine.registerFunction(name, fn)
 *
 * @param {string} name - 函数名（自动转大写）
 * @param {Function} fn - 函数实现
 * @returns {void}
 * @throws {Error} 参数错误时抛出异常
 */

// ✅ 正确用法
engine.registerFunction('MYFUNC', (args, ctx) => {
    return args[0] + args[1];
});

// ❌ 错误用法（会抛出异常）
engine.registerFunction('', () => {});  // 空名称
engine.registerFunction('TEST', 'not a function');  // 非函数类型
```

##### 注销函数

```javascript
/**
 * engine.unregisterFunction(name)
 *
 * @param {string} name - 要注销的函数名
 * @returns {boolean} 是否成功移除
 */

engine.unregisterFunction('MYFUNC');  // true（成功移除）
engine.unregisterFunction('NONEXISTENT');  // false（不存在）

// ⚠️ 注销内置函数需谨慎
engine.unregisterFunction('SUM');  // 可以，但会导致 SUM 函数不可用
```

##### 查询函数

```javascript
/**
 * engine.hasFunction(name)
 * @returns {boolean} 函数是否存在
 */

engine.hasFunction('SUM');     // true（内置函数）
engine.hasFunction('MYFUNC');  // false（未注册）

/**
 * engine.getRegisteredFunctions()
 * @returns {string[]} 所有已注册的函数名数组
 */

console.log(engine.getRegisteredFunctions());
// ["SUM", "AVERAGE", "COUNT", "IF", "ABS", ... , "MY_CUSTOM_FUNC"]
```

---

#### 插件集成最佳实践

通过插件系统批量注册业务函数：

```javascript
// plugins/FinancialPlugin.js
import { BasePlugin } from './BasePlugin.js';

export class FinancialPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'financial'; }

    init(options = {}) {
        super.init(options);

        // 批量注册金融相关函数
        this.workbook.formulaEngine.registerFunction('PMT', (args) => {
            // 计算每期还款额
            const [rate, nper, pv, fv, type] = args;
            // ... 实现逻辑
        });

        this.workbook.formulaEngine.registerFunction('FV', (args) => {
            // 计算未来值
            // ...
        });

        this.workbook.formulaEngine.registerFunction('PV', (args) => {
            // 计算现值
            // ...
        });

        console.log('[FinancialPlugin] 已加载 PMT, FV, PV 函数');
    }

    destroy() {
        // 清理已注册的函数
        ['PMT', 'FV', 'PV'].forEach(fn =>
            this.workbook.formulaEngine.unregisterFunction(fn)
        );
        super.destroy();
    }
}

// 使用方式
Workbook.registerPlugin('financial', FinancialPlugin);
workbook.loadPlugin('financial');
```

---

#### 错误处理与调试

##### 函数执行错误

```javascript
// 自定义函数内部抛出异常会被捕获并返回 #VALUE!
engine.registerFunction('BUGGY', (args) => {
    throw new Error('Something went wrong!');
});

sheet.setCell(0, 0, '=BUGGY(A1)');
// 单元格显示: #VALUE!

// 推荐做法：返回错误码而非抛出异常
engine.registerFunction('SAFE_DIVIDE', (args) => {
    const divisor = args[1];
    if (divisor === 0) return '#DIV/0!';
    return args[0] / divisor;
});
```

##### 调试技巧

```javascript
// 1. 查看所有已注册函数
console.log(engine.getRegisteredFunctions());

// 2. 检查特定函数是否存在
if (engine.hasFunction('MYFUNC')) {
    console.log('✅ MYFUNC 已就绪');
} else {
    console.log('❌ MYFUNC 未注册');
}

// 3. 在函数内打印调试信息
engine.registerFunction('DEBUG_FUNC', (args, ctx) => {
    console.log('[DEBUG]', {
        arguments: args,
        sheetName: ctx.sheet.name,
        timestamp: new Date().toISOString()
    });
    return args[0];
});
```

---

#### 性能优化建议

| 场景 | 建议 | 示例 |
|------|------|------|
| **频繁调用** | 缓存计算结果 | 使用 Map 缓存昂贵运算 |
| **大量数据** | 避免深层递归 | 用循环替代递归 |
| **DOM 操作** | 移至渲染层 | 函数只返回数据 |
| **异步操作** | 不支持 | 自定义函数必须同步 |

```javascript
// ❌ 反模式：在函数中进行耗时操作
engine.registerFunction('SLOW', (args) => {
    const result = expensiveCalculation(args); // 耗时操作
    return result;
});

// ✅ 最佳实践：缓存结果
const cache = new Map();
engine.registerFunction('FAST', (args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);

    const result = expensiveCalculation(args);
    cache.set(key, result);
    return result;
});
```

---

#### 安全注意事项

⚠️ **生产环境注意事项**:

1. **输入验证**
   ```javascript
   engine.registerFunction('SAFE', (args) => {
       if (!args || args.length === 0) return '#VALUE!';
       // 验证参数...
   });
   ```

2. **避免副作用**
   ```javascript
   // ❌ 危险：修改外部状态
   engine.registerFunction('BAD', (args) => {
       globalCounter++;  // 副作用！
       return args[0];
   });

   // ✅ 安全：纯函数
   engine.registerFunction('GOOD', (args) => {
       return args[0] * 2;  // 无副作用
   });
   ```

3. **沙箱执行（高级场景）**
   ```javascript
   // 如需执行用户提供的代码，考虑使用沙箱
   import { VM } from 'vm2';

   engine.registerFunction('EVAL_SAFE', (args, ctx) => {
       const vm = new VM({
           sandbox: { args, sheet: ctx.sheet }
       });
       return vm.run(`(${args[0]})(...args)`);
   });
   ```

---

### 🔧 错误处理与日志系统

#### 集成统一错误处理器（ErrorHandler）

Canvas Spreadsheet 的公式引擎已完全集成统一的错误处理系统 `ErrorHandler`，所有公式相关的错误、警告和调试信息都通过标准化的方式输出。

**核心优势**:
- ✅ 统一的错误码体系，便于追踪和定位问题
- ✅ 支持级别过滤（DEBUG/INFO/WARN/ERROR/FATAL）
- ✅ 支持自定义错误监听器（插件可监听公式错误）
- ✅ 开发模式和生产模式的差异化日志输出

#### 公式相关错误码

| 错误码 | 级别 | 说明 | 触发场景 |
|--------|------|------|----------|
| `FORMULA_INVALID_FUNCTION_NAME` | FATAL | 函数名无效 | 注册空名称或非字符串 |
| `FORMULA_INVALID_FUNCTION` | FATAL | 函数实现无效 | 传入非函数类型 |
| `FORMULA_FUNCTION_OVERRIDE` | WARN | 函数被覆盖 | 覆盖已有函数时警告 |
| `FORMULA_FUNCTION_NOT_FOUND` | DEBUG | 函数未找到 | 调用未注册的函数 |
| `FORMULA_PARSE_ERROR` | ERROR | 公式解析失败 | 公式语法错误 |
| `FORMULA_EVAL_ERROR` | ERROR | 公式求值失败 | 函数执行异常 |

#### 错误处理示例

##### 1️⃣ 自定义函数注册时的错误处理

```javascript
import { errorHandler, ERROR_CODE } from '../core/ErrorHandler.js';

// 注册全局错误监听器（可选）
errorHandler.onError((code, message, level, meta) => {
    if (code.startsWith('FORMULA_')) {
        console.log(`📊 公式错误 [${level}]: ${message}`, meta);
    }
});

// 示例 1: 无效的函数名（会抛出 FATAL 异常）
try {
    engine.registerFunction('', () => {});
} catch (e) {
    // 自动记录到 ErrorHandler 并抛出异常
    // 输出: [FATAL] [FORMULA_INVALID_FUNCTION_NAME] 函数名必须为非空字符串
}

// 示例 2: 无效的函数实现（会抛出 FATAL 异常）
try {
    engine.registerFunction('TEST', 'not a function');
} catch (e) {
    // 自动记录到 ErrorHandler 并抛出异常
    // 输出: [FATAL] [FORMULA_INVALID_FUNCTION] 函数必须是 Function 类型
}

// 示例 3: 覆盖已有函数（会输出 WARN 警告）
engine.registerFunction('SUM', (args) => args[0]);  // 覆盖内置 SUM
// 输出: [WARN] [FORMULA_FUNCTION_OVERRIDE] 函数 SUM 已存在，将被覆盖 {functionName: "SUM"}
```

##### 2️⃣ 公式解析和求值错误

```javascript
// 解析错误的自动处理
const result1 = engine.setFormula(sheet, 0, 0, '=SUM(');  // 缺少右括号
// 单元格显示: #PARSE!
// 日志输出: [ERROR] [FORMULA_PARSE_ERROR] 公式解析失败: =SUM(
//          元数据: {formulaStr: "=SUM(", sheetName: "Sheet1", row: 0, col: 0, error: Error}

// 求值错误的自动处理
engine.registerFunction('BUGGY', () => {
    throw new Error('Intentional error');
});

const result2 = engine.setFormula(sheet, 0, 1, '=BUGGY()');
// 单元格显示: #VALUE!
// 日志输出: [ERROR] [FORMULA_EVAL_ERROR] 函数 BUGGY 执行失败
//          元数据: {functionName: "BUGGY", args: [], error: Error}
```

##### 3️⃣ 未注册函数的调试信息

```javascript
// 开启开发模式以查看 DEBUG 信息
errorHandler.configure({ devMode: true });

const result = engine.setFormula(sheet, 0, 0, '=NONEXISTENT()');
// 单元格显示: #NAME?
// 开发模式日志: [DEBUG] [FORMULA_FUNCTION_NOT_FOUND] 函数 NONEXISTENT 未注册
//              元数据: {functionName: "NONEXISTENT", sheetName: "Sheet1"}
```

#### 最佳实践

##### ✅ 推荐做法：在自定义函数中返回标准化错误

```javascript
engine.registerFunction('SAFE_DIVIDE', (args) => {
    const dividend = args[0];
    const divisor = args[1];

    if (divisor === undefined || divisor === null) {
        return '#VALUE!';  // 参数缺失
    }

    if (typeof divisor !== 'number' || typeof dividend !== 'number') {
        return '#VALUE!';  // 类型错误
    }

    if (divisor === 0) {
        return '#DIV/0!';  // 除零错误
    }

    return dividend / divisor;
});
```

##### ❌ 避免做法：在自定义函数中直接抛出异常

```javascript
engine.registerFunction('UNSAFE', (args) => {
    if (!args[0]) throw new Error('Missing argument');  // ❌ 不要这样做！
    // 虽然会被捕获并返回 #VALUE!，但无法提供有意义的上下文
});

// ✅ 正确做法：返回错误码或使用 errorHandler
engine.registerFunction('SAFE', (args) => {
    if (!args[0]) {
        errorHandler.debug(ERROR_CODE.FORMULA_EVAL_ERROR, '缺少必要参数', { args });
        return '#VALUE!';
    }
    // ...
});
```

#### 监听公式错误事件（插件开发者）

```javascript
class FormulaMonitorPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'formulaMonitor'; }

    init(options = {}) {
        super.init(options);

        // 注册错误监听器
        this.#listener = (code, message, level, meta) => {
            if (code.startsWith('FORMULA_')) {
                this.#logToServer(code, message, level, meta);
            }
        };

        errorHandler.onError(this.#listener);
        console.log('[FormulaMonitorPlugin] 已启动公式错误监控');
    }

    destroy() {
        errorHandler.offError(this.#listener);
        super.destroy();
    }

    #logToServer(code, message, level, meta) {
        // 发送到远程日志服务
        fetch('/api/logs', {
            method: 'POST',
            body: JSON.stringify({ code, message, level, meta, timestamp: Date.now() })
        }).catch(() => {});  // 忽略网络错误
    }
}
```

---

### 添加新函数（传统方式）

#### 步骤 1: 在 functions/index.js 中注册

```javascript
export const FUNCTIONS = {
    // ... 现有函数 ...

    /**
     * 自定义函数: PRODUCT
     * 计算所有参数的乘积
     */
    PRODUCT(args, context) {
        const flat = _flatten(args);
        return flat.reduce((acc, v) => {
            const n = _toNum(v);
            return isNaN(n) ? acc : acc * n;
        }, 1);
    },

    /**
     * 自定义函数: MOD
     * 返回两数相除的余数
     */
    MOD(args, context) {
        const dividend = _toNum(args[0]);
        const divisor = _toNum(args[1]);
        if (divisor === 0) return "#DIV/0!";
        return dividend % divisor;
    },

    /**
     * 自定义函数: NOW
     * 返回当前日期时间
     */
    NOW(args, context) {
        return new Date().toISOString();
    },
};
```

#### 步骤 2: 测试新函数

```javascript
// 测试 PRODUCT
engine.setFormula(sheet, 0, 0, "=PRODUCT(2,3,4)");
// 期望: 24

// 测试 MOD
engine.setFormula(sheet, 0, 1, "=MOD(10,3)");
// 期望: 1

// 测试 NOW
engine.setFormula(sheet, 0, 2, "=NOW()");
// 期望: 当前时间的 ISO 字符串
```

### 添加新运算符

#### 步骤 1: 在 FormulaParser.js 中定义优先级

```javascript
const OPERATORS = {
    // ... 现有运算符 ...
    
    "%": { prec: 2, assoc: "L" },  // 取模运算符
};
```

#### 步骤 2: 在 tokenizer 中识别新符号

```javascript
// tokenize 函数中添加
if (ch === "%") {
    tokens.push({ type: TOKEN.OPERATOR, value: "%" });
    i++;
    continue;
}
```

#### 步骤 3: 在 FormulaEvaluator.js 中实现求值逻辑

```javascript
case "%":
    return _toNum(left) % _toNum(right);
```

### 添加新的 AST 节点类型

#### 场景示例: 数组常量 `{1,2,3}`

**步骤 1**: Parser 中识别语法

```javascript
if (ch === "{") {
    tokens.push({ type: TOKEN.ARRAY_START, value: "{" });
    i++;
    continue;
}
```

**步骤 2**: 生成 AST 节点

```javascript
{
    type: "arrayLiteral",
    values: [1, 2, 3]
}
```

**步骤 3**: Evaluator 中求值

```javascript
case "arrayLiteral":
    return node.values.map(v => this.#evalNode(v, sheet));
```

### 实现循环引用检测

**方案**: 在 evaluate 时维护调用栈

```javascript
class FormulaEvaluator {
    constructor(workbook) {
        this.workbook = workbook;
        this.callStack = new Set();  // 新增：调用栈
    }

    #evalCellRef(node, sheet) {
        const key = this.#cellKey(targetSheet.name, node.row, node.col);
        
        // 检测循环引用
        if (this.callStack.has(key)) {
            throw new CircularReferenceError(key);  // 抛出循环引用异常
        }
        
        this.callStack.add(key);
        const value = targetSheet.cellStore.get(node.row, node.col)?.value;
        this.callStack.delete(key);
        
        return value;
    }
}
```

---

## 常见问题排查

### Q1: 公式显示为文本而非计算结果？

**原因**: 公式可能没有以 "=" 开头，或者被当作纯文本存储。

**解决方案**:
```javascript
// 确保 FormulaEngine.isFormula() 返回 true
FormulaEngine.isFormula("SUM(A1:A10)")   // false ❌ (缺少 =)
FormulaEngine.isFormula("=SUM(A1:A10)")  // true ✅

// 或者在 setFormula 时自动补全 =
const formula = formulaStr.startsWith("=") ? formulaStr : "=" + formulaStr;
```

### Q2: 修改单元格后公式没有自动更新？

**原因**: 可能没有正确调用 `onCellChanged()`。

**解决方案**:
```javascript
// ❌ 错误：直接修改 CellStore 但未通知引擎
sheet.cellStore.set(0, 0, newValue);

// ✅ 正确：修改后通知引擎
sheet.cellStore.set(0, 0, newValue);
engine.onCellChanged(sheet, 0, 0);  // 触发重算
```

### Q3: 出现 #REF! 错误？

**可能原因**:
1. 引用了不存在的工作表
2. 引用了已被删除的行列范围内的单元格
3. 跨表引用时工作表名称拼写错误

**解决方案**:
```javascript
// 检查工作表是否存在
console.log(wb.sheets.has("Sheet2"));  // 应该是 true

// 检查拼写（区分大小写？）
engine.setFormula(sheet, 0, 0, "=Sheet2!A1");  // 确保名称正确
```

### Q4: 性能问题：大量公式导致卡顿？

**优化策略**:
1. **减少公式数量**: 合并相邻的相似公式
2. **简化公式**: 避免过深的嵌套（建议 ≤ 5 层）
3. **使用批处理模式**: 导入数据时暂时禁用自动重算
4. **启用分页**: 只渲染可见区域的公式结果
5. **考虑 Web Worker**: 将求值移至后台线程

**性能基准**:
```
公式数量: 1,000    → 重算时间: ~50ms  ✅ 流畅
公式数量: 10,000   → 重算时间: ~500ms ⚠️ 可接受
公式数量: 100,000  → 重算时间: ~5000ms ❌ 需要优化
```

### Q5: 如何调试复杂的依赖链？

**方法 1: 使用内置调试方法**
```javascript
// 查看 C6 的所有依赖
console.log(engine.getDependencies("Sheet1", 5, 2));

// 查看谁依赖 A1
console.log(engine.getDependents("Sheet1", 0, 0));
```

**方法 2: 可视化依赖图**
```javascript
function visualizeDependencies(engine, sheetName) {
    const nodes = new Set();
    const edges = [];
    
    for (const [formulaKey, deps] of engine.dependsOn) {
        nodes.add(formulaKey);
        for (const dep of deps) {
            nodes.add(dep);
            edges.push([dep, formulaKey]);  // dep → formula
        }
    }
    
    console.log("节点数量:", nodes.size);
    console.log("边数量:", edges.length);
    console.log("边详情:", edges);
    
    // 可选: 生成 Graphviz DOT 格式
    let dot = "digraph Dependencies {\n";
    edges.forEach(([from, to]) => {
        dot += `  "${from}" -> "${to}"\n`;
    });
    dot += "}";
    console.log(dot);
}

visualizeDependencies(engine, "Sheet1");
```

### Q6: 如何撤销公式设置？

**方案 1: 使用 removeFormula**
```javascript
// 删除公式，恢复为普通单元格
engine.removeFormula(sheet, 5, 2);
sheet.cellStore.set(5, 2, "");  // 清空值
```

**方案 2: 利用 Undo/Redo 系统**
```javascript
// 假设有 UndoManager
undoManager.push({
    type: 'SET_FORMULA',
    data: { sheet, row: 5, col: 2, oldValue: oldFormula },
    undo: () => {
        engine.setFormula(sheet, 5, 2, oldFormula);
    },
    redo: () => {
        engine.removeFormula(sheet, 5, 2);
    }
});
```

---

## 附录

### A. 完整的运算符优先级表（从高到低）

| 优先级 | 运算符 | 说明 | 结合性 |
|--------|--------|------|--------|
| 3 | `^` | 幂运算 | 右结合 |
| 2 | `*`, `/` | 乘法、除法 | 左结合 |
| 1 | `+`, `-` | 加法、减法 | 左结合 |
| 0 | `&` | 文本连接 | 左结合 |
| -1 | `=`, `<>`, `<`, `>`, `<=`, `>=` | 比较运算 | 左结合 |

### B. A1 坐标系完整映射表

| 列字母 | 索引 | 列字母 | 索引 | 列字母 | 索引 |
|--------|------|--------|------|--------|------|
| A | 0 | N | 13 | AA | 26 |
| B | 1 | O | 14 | AB | 27 |
| C | 2 | P | 15 | AZ | 51 |
| D | 3 | Q | 16 | BA | 52 |
| E | 4 | R | 17 | ZZ | 701 |
| ... | ... | ... | ... | AAA | 702 |
| Z | 25 | | | | |

### C. 错误代码速查表

| 错误码 | 英文名 | 中文含义 | 常见原因 |
|--------|--------|---------|---------|
| `#PARSE!` | Parse Error | 解析错误 | 语法错误、括号不匹配 |
| `#VALUE!` | Value Error | 值错误 | 类型不匹配、非法运算 |
| `#DIV/0!` | Div/Zero Error | 除零错误 | 除数为 0 或空 |
| `#REF!` | Reference Error | 引用错误 | 单元格/工作表不存在 |
| `#NAME?` | Name Error | 名称错误 | 函数名拼写错误 |

### D. 推荐学习路径

#### 初学者（1-2天）
1. 阅读 [概述](#概述) 和 [架构设计](#架构设计)
2. 学习 [基础用法示例](#使用示例) 中的简单案例
3. 尝试在控制台测试基本公式

#### 进阶开发者（3-5天）
1. 深入理解 [依赖追踪系统](#依赖追踪系统)
2. 学习 [API 参考](#api-reference) 的所有方法
3. 实践 [高级示例](#高级示例)：跨表引用、复杂公式
4. 了解 [错误处理机制](#错误处理机制)

#### 高级开发者/贡献者（1周+）
1. 研究 [扩展指南](#扩展指南)，尝试添加新函数
2. 阅读 [性能优化建议](#性能优化建议)，进行性能调优
3. 实现 [循环引用检测](#实现循环引用检测)
4. 考虑支持更多 Excel 兼容函数（VLOOKUP, INDEX/MATCH 等）

---

## 版本信息

- **文档版本**: v1.0.0
- **最后更新**: 2026-06-21
- **适用引擎版本**: v2.0.0+
- **作者**: Canvas Spreadsheet Team
- **许可协议**: MIT License

---

## 反馈与贡献

如果您在使用过程中遇到问题或有改进建议，欢迎：

1. 查阅 [常见问题排查](#常见问题排查) 章节
2. 在项目仓库提交 Issue
3. 提交 Pull Request 改进文档或代码

**感谢您使用 Canvas Spreadsheet 公式引擎！** 🚀