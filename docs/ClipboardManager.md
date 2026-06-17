# ClipboardManager — 剪贴板管理器

## 概述

`ClipboardManager` 是表格复制/粘贴/图片插入的核心逻辑层，不依赖插件系统，保持纯数据操作。由 `CopyPastePlugin` 持有和调用，也可独立使用。

## 文件位置

```
src/editor/ClipboardManager.js
```

## 设计意图

- **双重存储**：复制时同时写入内部存储（含样式 ID + 列类型）和系统剪贴板（TSV 纯文本），粘贴时优先读取系统剪贴板，fallback 到内部数据以保留样式。
- **类型安全**：粘贴时验证源列类型与目标列类型一致性，类型不匹配时阻止整个粘贴操作，防止数据错乱。
- **原生 paste 事件**（v2）：使用浏览器原生 `paste` 事件同步读取剪贴板，支持文本 + 图片，无需 `navigator.clipboard` 权限弹窗。
- **富内容解耦**（v2）：图片等非文本内容通过 `#cellContent` Map 独立管理，不侵入 Cell 模型。详见 [RichContent.md](./RichContent.md)。
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
    #data = null               // 内部剪贴板数据
    #cellContent = new Map()   // 单元格富内容缓存（key: "sheetName,realR,col"）

    // 复制/粘贴
    copy(sheet)                        // 复制选区到剪贴板
    pasteFromEvent(sheet, event)       // 从原生 paste 事件同步粘贴（推荐）
    paste(sheet)                       // 异步粘贴（兼容旧 API，已标记 deprecated）
    pasteText(sheet, text)             // 从 TSV 文本粘贴
    pasteInternal(sheet)               // 从内部数据粘贴（保留样式）

    // 图片插入
    setCellImage(sheet, r, c, blob)   // 设置单元格图片（粘贴/插入时调用）
    getCellContent(sheet, realR, col)  // 查询富内容（渲染时调用）
    removeCellContent(sheet, realR, c) // 清除富内容
    insertImageFromFile(sheet, opts)   // 打开文件选择器插入图片

    // 工具
    clear()                            // 清空内部剪贴板数据（不影响已粘贴的图片）
    getClipboardData()                 // 获取内部数据（供钩子使用）

    // 私有
    #writeSystemClipboard()            // 写入系统剪贴板（TSV）
    #fallbackWriteText()               // 降级方案（execCommand）
    #readSystemClipboard()             // 读取系统剪贴板（异步，deprecated）
    #pasteImage()                      // 粘贴图片 Blob
    #checkTypeMismatch()               // 类型一致性检查
    #cellKey()                         // 生成富内容 Map key
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

### pasteFromEvent(sheet, clipboardEvent) [推荐]

从浏览器原生 `paste` 事件同步粘贴，支持文本 + 图片。无需权限弹窗。

```js
document.addEventListener("paste", (e) => {
    clipboard.pasteFromEvent(sheet, e);
});
```

**处理优先级**：
1. `clipboardData.items` 中有 `image/*` → 粘贴图片到当前活动单元格
2. `clipboardData.items` 中有 `text/plain` → 解析 TSV 粘贴文本
3. 都没有 → fallback 到 `#pasteInternal()`（内部数据）
4. 图片 + 文本共存 → **图片优先**，文本被忽略

### setCellImage(sheet, r, c, blob)

为指定单元格设置图片内容。Blob → Object URL，存入 `#cellContent` Map。

```js
clipboard.setCellImage(sheet, 2, 3, imageBlob);
// 如果单元格不存在，自动创建空值占位
// 如果已有旧图片，自动 revoke 旧 Object URL
```

### getCellContent(sheet, realR, col)

查询指定单元格的富内容，渲染时调用。

```js
const content = clipboard.getCellContent(sheet, realR, col);
// 返回 { type: "image", objectUrl: "blob:..." } | null
```

### removeCellContent(sheet, realR, col)

清除指定单元格的富内容，自动 `revokeObjectURL` 释放内存。

```js
clipboard.removeCellContent(sheet, realR, col);
```

### insertImageFromFile(sheet, options)

打开系统文件选择器，选中图片后插入到指定单元格。

```js
clipboard.insertImageFromFile(sheet, {
    row: 2,      // 目标行号（可选，默认当前选区活动单元格）
    col: 3,      // 目标列号（可选）
    onComplete: (success) => console.log(success ? "已插入" : "已取消"),
});
```

### paste(sheet) [deprecated]

异步粘贴，通过 `navigator.clipboard.readText()` 读取系统剪贴板。

```js
clipboard.paste(sheet);
```

**注意**：此方法会触发浏览器权限弹窗，且不支持图片。推荐使用 `pasteFromEvent()` 替代。

### clear()

清空内部剪贴板数据（不影响已粘贴到单元格的图片）。

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

### 图片粘贴

```
用户 Ctrl+V（剪贴板中有图片）
    → CopyPasteStrategy.#handleKeyDown 捕获 keydown 事件
    → #focusPasteTarget() 聚焦持久隐藏的 contenteditable div
    → 浏览器在 div 上触发 paste 事件（携带 clipboardData）
    → ClipboardManager.pasteFromEvent(sheet, pasteEvent)
    → 遍历 e.clipboardData.items，匹配 image/*
    → item.getAsFile() 获取 Blob
    → #pasteImage(sheet, blob)
        → setCellImage(sheet, r, c, blob)
            → URL.createObjectURL(blob)
            → #cellContent.set(key, { type: "image", blob, objectUrl })
            → 确保单元格存在（setCell(r, c, "") 占位）
            → renderEngine.invalidateAll() 触发重绘
    → TileRenderer.#drawCellContent()
        → clipboard.getCellContent(sheet, realR, col)
        → #drawCellImage(ctx, url, x, y, w, h)
```

> **为什么需要隐藏 div？**
> 浏览器只在可编辑元素（input/textarea/contenteditable）上触发 paste 事件。
> Canvas 不是可编辑元素，直接在 document 上监听 paste 收不到事件。
> CopyPasteStrategy 在初始化时创建一个持久隐藏的 contenteditable div 并绑定 paste 处理器。
> 按 Ctrl+V 时聚焦该 div（不 preventDefault），浏览器自然触发 paste 事件，
> 从而同步读取 clipboardData（含图片 Blob），无需 navigator.clipboard 权限弹窗。
> 这是 Google Sheets 等产品使用的标准做法。

### 图片插入（文件选择器）

```
用户右键 → "插入图片"
    → ContextMenuStrategy → clipboard.insertImageFromFile(sheet, { row, col })
    → 创建隐藏 <input type="file" accept="image/*">
    → input.click() 打开系统文件选择器
    → change 事件 → setCellImage(sheet, r, c, file)
    → 渲染流程同上
```

### #pasteText(sheet, text) — 纯文本粘贴

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

### #pasteInternal(sheet) — 内部数据粘贴（保留样式）

```
#data.cells  ──formatCellValue──→  显示文本  ──parseCellValue──→  类型化值
    (srcR, srcC)                    (字符串)       (tr, tc)         写入目标
                                                               +
                                                          保留 styleId
```

---

## 类型一致性检查

粘贴前检查源列类型与目标列类型是否完全一致：

```
源列类型:  ["text", "numeric", "date"]
目标列类型: ["text", "text",    "date"]
                ✓       ✗           ✓
                        ↓
            阻止粘贴，输出警告
```

---

## 与相关模块的关系

```
CopyPastePlugin
    ├── ClipboardManager        ← 核心数据操作 + 图片管理
    │     ├── copy()              复制选区数据
    │     ├── pasteFromEvent()    粘贴（文本+图片，同步）
    │     ├── paste()             粘贴（文本，异步，deprecated）
    │     ├── setCellImage()      设置图片
    │     ├── getCellContent()    查询富内容
    │     ├── insertImageFromFile() 文件选择器插入
    │     ├── #checkTypeMismatch() 类型安全检查
    │     ├── #data               内部存储（含 columnTypes）
    │     └── #cellContent        富内容 Map（图片等）
    │
    └── CopyPasteStrategy       ← 键盘事件（Ctrl+C/V/X）
          └── 委托到 CopyPastePlugin.copy/paste/cut

ContextMenuStrategy
    └── "插入图片" → clipboard.insertImageFromFile()

TileRenderer
    └── #drawCellContent() → clipboard.getCellContent()
```

## 使用示例

### 独立使用

```js
import { ClipboardManager } from "./editor/ClipboardManager.js";

const clipboard = new ClipboardManager();

// 复制
clipboard.copy(sheet);

// 通过原生 paste 事件粘贴（推荐）
document.addEventListener("paste", (e) => clipboard.pasteFromEvent(sheet, e));

// 插入图片
clipboard.insertImageFromFile(sheet, { row: 2, col: 3 });

// 清空
clipboard.clear();

// 销毁
clipboard.destroy();
```

### 通过插件使用

```js
// 插件会自动创建和管理 ClipboardManager
workbook.loadPluginClass(CopyPastePlugin);

// 获取实例
const plugin = workbook.getPlugin("copyPaste");
const clipboard = plugin.getClipboardManager();

// 插入图片
plugin.insertImage({ row: 2, col: 3 });

// 查看剪贴板数据
const data = clipboard.getClipboardData();
console.log(data.columnTypes); // ["text", "numeric", "date"]
```
