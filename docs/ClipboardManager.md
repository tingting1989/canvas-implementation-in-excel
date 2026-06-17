# ClipboardManager — 剪贴板管理器

## 概述

`ClipboardManager` 是表格复制/粘贴的核心逻辑层，不依赖插件系统，保持纯数据操作。由 `CopyPastePlugin` 持有和调用，也可独立使用。

## 文件位置

```
src/editor/ClipboardManager.js
```

## 设计意图

- **双重存储**：复制时同时写入内部存储（含样式 ID + 列类型）和系统剪贴板（TSV 纯文本），粘贴时优先读取系统剪贴板，fallback 到内部数据以保留样式。
- **类型安全**：粘贴时验证源列类型与目标列类型一致性，类型不匹配时阻止整个粘贴操作，防止数据错乱。
- **独立可测**：不依赖 DOM 事件或插件生命周期，可脱离表格独立使用。

## 剪贴板数据格式

```js
// #data 结构
{
    sourceSheetName: string,    // 来源工作表名称
    topRow: number,             // 选区起始行
    topCol: number,             // 选区起始列
    rows: number,               // 选区行数
    cols: number,               // 选区列数
    cells: Array<Array<{        // 二维单元格数据
        value: any,             //   原始值
        styleId: number         //   样式 ID
    } | null>>,
    columnTypes: Array<string>  // 每列的类型名称（如 "text", "numeric", "date"）
}
```

## 类结构

```js
class ClipboardManager {
    #data = null  // 内部剪贴板数据

    copy(sheet)               // 复制选区到剪贴板
    paste(sheet)              // 粘贴到当前活动单元格
    clear()                   // 清空内部数据
    getClipboardData()        // 获取内部数据（供钩子使用）

    // 私有方法
    #writeSystemClipboard()   // 写入系统剪贴板（TSV）
    #fallbackWriteText()      // 降级方案（execCommand）
    #readSystemClipboard()    // 读取系统剪贴板
    #pasteText()              // 从系统剪贴板文本粘贴
    #pasteInternal()          // 从内部数据粘贴（保留样式）
    #checkTypeMismatch()      // 类型一致性检查
}
```

## API 参考

### copy(sheet)

复制当前选区到剪贴板。同时写入内部存储（保留样式 + 列类型）和系统剪贴板（TSV 纯文本）。

```js
clipboard.copy(sheet);
```

**流程**：
1. 读取选区范围
2. 遍历选区，收集每个单元格的 `{ value, styleId }`
3. 记录每列的单元格类型名称（用于后续类型检查）
4. 构建 `#data` 对象存入内部存储
5. 调用 `#writeSystemClipboard` 写入 TSV 纯文本到系统剪贴板

**列类型收集**：
```
选区列: col 0 (text), col 1 (numeric), col 5 (date)
  → columnTypes: ["text", "numeric", "date"]
```

### paste(sheet)

粘贴剪贴板内容到当前活动单元格位置。

```js
clipboard.paste(sheet);
```

**粘贴策略**：
1. 优先尝试 `navigator.clipboard.readText()` 读取系统剪贴板
2. 系统剪贴板有内容 → `#pasteText(sheet, text)`（纯文本粘贴）
3. 系统剪贴板为空或读取失败 → `#pasteInternal(sheet)`（内部数据粘贴，保留样式）

### clear()

清空内部剪贴板数据。

```js
clipboard.clear();
```

### getClipboardData()

获取内部剪贴板数据，供 `CopyPastePlugin` 在 `beforePaste` 钩子中使用。

```js
const data = clipboard.getClipboardData();
// { sourceSheetName, topRow, topCol, rows, cols, cells, columnTypes }
```

---

## 粘贴内部流程

### #pasteText(sheet, text) — 纯文本粘贴

从系统剪贴板文本粘贴：

```
输入: "hello\t123\tworld\nfoo\t456\tbar"
      ↓ split("\n")
["hello\t123\tworld", "foo\t456\tbar"]
      ↓ 逐行 split("\t")
Row 0: ["hello", "123", "world"]
Row 1: ["foo", "456", "bar"]
      ↓ 类型检查
      ↓ parseCellValue 按目标列类型解析
      ↓ setCell 写入
```

**类型解析**：使用 `sheet.parseCellValue(r, c, text)` 按目标列的类型系统解析：
- `numeric` 列 → `parseFloat`，去除千分位逗号
- `date` 列 → `new Date()` 解析日期字符串
- `text` 列 → 原样保留字符串

### #pasteInternal(sheet) — 内部数据粘贴（保留样式）

从 `#data` 粘贴，保留源单元格样式：

```
#data.cells  ──formatCellValue──→  显示文本  ──parseCellValue──→  类型化值
    (srcR, srcC)                    (字符串)       (tr, tc)         写入目标
                                                               +
                                                          保留 styleId
```

**处理链**：
1. `sheet.formatCellValue(srcR, srcC, value)` — 用源列类型格式化
2. `sheet.parseCellValue(tr, tc, displayText)` — 用目标列类型解析
3. `sheet.setCell(tr, tc, parsedValue, styleId)` — 写入并保留样式

---

## 类型一致性检查

### #checkTypeMismatch(sheet, targetRow, targetCol, srcCols)

粘贴前检查源列类型与目标列类型是否完全一致。

```js
const mismatch = clipboard.#checkTypeMismatch(sheet, 0, 3);
// null → 类型一致，可以粘贴
// { mismatches: [...] } → 存在不匹配，阻止粘贴
```

**检查逻辑**：

```
源列类型:  ["text", "numeric", "date"]
目标列类型: ["text", "text",    "date"]
                ✓       ✗           ✓
                        ↓
            阻止粘贴，输出警告
```

**不匹配信息格式**：
```js
{
    mismatches: [
        { srcCol: 1, targetCol: 4, srcType: "numeric", targetType: "text" }
    ]
}
```

**阻止行为**：只要存在任意一列类型不匹配，整个粘贴操作被阻止。控制台输出详细警告：
```
[ClipboardManager] 类型不一致，阻止粘贴: 列4: 源类型"numeric" ≠ 目标类型"text"
```

---

## 系统剪贴板交互

### 写入

```
#writeSystemClipboard
    │
    ├── navigator.clipboard.writeText(text)  ← 现代 API（异步）
    │   └── 失败 → #fallbackWriteText(text)
    │
    └── #fallbackWriteText(text)             ← 降级方案
        ├── 创建隐藏 <textarea>
        ├── document.execCommand("copy")
        └── 移除 <textarea>
```

### 读取

```
#readSystemClipboard
    │
    ├── navigator.clipboard.readText()  ← 现代 API（异步 Promise）
    │   ├── 有内容 → #pasteText
    │   ├── 空内容 + 有 #data → #pasteInternal
    │   └── 读取失败 + 有 #data → #pasteInternal
    │
    └── 无 clipboard API + 有 #data → #pasteInternal
```

**TSV 格式说明**：行间以 `\n` 分隔，列间以 `\t` 分隔。纯文本单元格的值通过 `sheet.formatCellValue()` 格式化后再写入。

---

## 与相关模块的关系

```
CopyPastePlugin
    ├── ClipboardManager        ← 核心数据操作
    │     ├── copy()            复制选区数据
    │     ├── paste()           粘贴数据
    │     ├── #checkTypeMismatch()  类型安全检查
    │     └── #data             内部存储（含 columnTypes）
    │
    └── CopyPasteStrategy       ← 键盘事件（Ctrl+C/V/X）
          └── 委托到 CopyPastePlugin.copy/paste/cut
```

---

## 使用示例

### 独立使用（不依赖插件）

```js
import { ClipboardManager } from "./editor/ClipboardManager.js";

const clipboard = new ClipboardManager();

// 复制
clipboard.copy(sheet);

// 粘贴
clipboard.paste(sheet);

// 清空
clipboard.clear();
```

### 通过插件使用

```js
// 插件会自动创建和管理 ClipboardManager
workbook.loadPluginClass(CopyPastePlugin);

// 获取实例
const plugin = workbook.getPlugin("copyPaste");
const clipboard = plugin.getClipboardManager();

// 查看剪贴板数据
const data = clipboard.getClipboardData();
console.log(data.columnTypes); // ["text", "numeric", "date"]
```
