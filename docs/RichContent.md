# 富内容系统（Rich Content）

## 概述

富内容系统用于管理单元格中的非文本内容（图片、图表、附件等），与 Cell 模型完全解耦。

### 设计原则

- **Cell 保持纯粹**：Cell 只存储 `value`（文本值）、`styleId`（样式引用）、`disabled`（禁用状态），不感知具体内容类型
- **独立管理**：富内容由 `ClipboardManager` 内部的 `#cellContent` Map 独立存储，key 为 `"sheetName,realR,col"`
- **渲染解耦**：`TileRenderer` 通过 `clipboard.getCellContent()` 查询，不依赖 Cell 的任何字段
- **可扩展**：新增内容类型（图表、附件等）只需扩展 `#cellContent` Map 和 `#drawCellContent()` 的分支

### 架构图

```
ClipboardManager.#cellContent (Map<key, {type, blob, objectUrl}>)
    │
    ├── setCellImage(sheet, r, c, blob)     ← Ctrl+V 图片 / 右键"插入图片"
    ├── getCellContent(sheet, realR, col)    → 返回 {type, objectUrl}
    ├── removeCellContent(sheet, realR, col)  ← "清空内容"时调用
    │
    ▼
TileRenderer.#drawCellContent(ctx, sheet, realR, col, x, y, w, h)
    │
    ├── type === "image" → #drawCellImage(ctx, url, x, y, w, h)
    └── 未来扩展：type === "chart" / "attachment" / ...
```

### 图片粘贴流程

```
用户 Ctrl+V（剪贴板中有图片）
    → 浏览器原生 paste 事件（document:paste）
    → CopyPastePlugin.#pasteHandler
    → ClipboardManager.pasteFromEvent(sheet, e)
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
        → 匹配 type === "image"
        → #drawCellImage(ctx, url, x, y, w, h)
            → 从 #imageElementCache 获取/创建 Image
            → ctx.drawImage(img, ...) 保持宽高比居中
```

### 图片插入（文件选择器）

```
用户右键 → "插入图片"
    → ContextMenuStrategy._buildBuiltInItems().insertImage.action
    → clipboard.insertImageFromFile(sheet, { row, col })
        → 创建隐藏 <input type="file" accept="image/*">
        → input.click() 打开系统文件选择器
        → change 事件：获取 File（Blob 子类）
        → setCellImage(sheet, r, c, file)
        → 渲染流程同上
```

### 支持的图片格式

| 格式 | MIME 类型 |
|------|----------|
| PNG | `image/png` |
| JPEG | `image/jpeg` |
| GIF | `image/gif` |
| WebP | `image/webp` |
| BMP | `image/bmp` |
| SVG | `image/svg+xml` |

### API 参考

#### ClipboardManager

```js
// 设置图片（粘贴/插入时调用）
clipboard.setCellImage(sheet, r, c, blob);
// 返回 void

// 查询富内容（渲染时调用）
clipboard.getCellContent(sheet, realR, col);
// 返回 { type: "image", objectUrl: string } | null

// 清除富内容（清空内容时调用）
clipboard.removeCellContent(sheet, realR, col);
// 返回 void，自动 revokeObjectURL

// 文件选择器插入（右键菜单/工具栏调用）
clipboard.insertImageFromFile(sheet, { row?, col?, onComplete? });
// 返回 void，onComplete(success: boolean)
```

#### CopyPastePlugin

```js
// 代理方法
workbook.copyPaste.insertImage({ row: 2, col: 3 });
// 不传 row/col 则使用当前选区活动单元格
```

### 如何扩展新的内容类型

以"图表"为例，只需修改两处：

**1. ClipboardManager 新增方法：**

```js
setCellChart(sheet, r, c, chartConfig) {
    const realR = sheet.toRealRow(r);
    const key = this.#cellKey(sheet, realR, c);
    const old = this.#cellContent.get(key);
    if (old) URL.revokeObjectURL(old.objectUrl);
    // 图表数据转为 Blob 或直接存储配置
    this.#cellContent.set(key, { type: "chart", chartConfig, objectUrl: null });
}
```

**2. TileRenderer 新增绘制分支：**

```js
#drawCellContent(ctx, sheet, realR, col, drawX, drawY, w, h) {
    const content = clipboard.getCellContent(sheet, realR, col);
    if (!content) return false;

    if (content.type === "image") {
        return this.#drawCellImage(ctx, content.objectUrl, drawX, drawY, w, h);
    }
    if (content.type === "chart") {
        return this.#drawCellChart(ctx, content.chartConfig, drawX, drawY, w, h);
    }
    // ... 更多类型
    return false;
}
```

**Cell 类永远不需要修改。**

### 与粘贴文本的互斥规则

当剪贴板同时包含图片和文本时，**图片优先**，文本被忽略。这是有意设计，因为从截图工具、画图软件复制时，剪贴板通常同时包含位图数据和纯文本回退。
