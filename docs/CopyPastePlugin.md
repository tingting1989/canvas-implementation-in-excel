# CopyPastePlugin — 复制/粘贴插件

## 概述

`CopyPastePlugin` 将复制、粘贴、剪切、图片插入功能封装为插件，支持：
- 通过 `CopyPasteStrategy` 监听键盘快捷键（Ctrl+C/V/X）
- 通过浏览器原生 `paste` 事件同步读取剪贴板（支持文本 + 图片，无权限弹窗）
- 通过 `ClipboardManager` 执行实际数据操作和图片管理
- 细粒度权限控制和完整的钩子链

## 文件位置

```
src/plugins/CopyPastePlugin.js
```

## 设计意图

- **插件化封装**：复制/粘贴/图片插入作为可选功能，支持动态加载/卸载。
- **权限控制**：通过 `allowCopy` / `allowPaste` / `allowCut` 选项精确控制各操作，支持只读模式。
- **钩子集成**：在 copy/paste/cut 前后触发 `BEFORE_COPY` / `AFTER_COPY` 等钩子，允许外部拦截和扩展。
- **类型安全**：`ClipboardManager` 在粘贴时自动检查列类型一致性，不一致则阻止粘贴。
- **隐藏 contenteditable 拦截**：通过持久隐藏的可编辑 div 接收浏览器原生 paste 事件，同步读取 clipboardData（文本 + 图片），无需权限弹窗。
- **图片管理**（v2）：图片通过 `ClipboardManager.#cellContent` Map 管理，与 Cell 模型解耦。

## 快捷键

| 快捷键 | 操作 | 说明 |
|--------|------|------|
| `Ctrl+C` | 复制 | 复制当前选区到剪贴板 |
| `Ctrl+V` | 粘贴 | 从剪贴板粘贴到活动单元格（支持文本 + 图片） |
| `Ctrl+X` | 剪切 | 复制选区并清空内容 |

## 类结构

```js
class CopyPastePlugin extends BasePlugin {
    static PLUGIN_NAME = "copyPaste"

    #strategy: CopyPasteStrategy   // 键盘事件策略
    #clipboard: ClipboardManager   // 剪贴板数据管理 + 图片管理
    #allowCopy: boolean            // 是否允许复制（默认 true）
    #allowPaste: boolean           // 是否允许粘贴（默认 true）
    #allowCut: boolean             // 是否允许剪切（默认 true）

    init(options)          // 初始化插件
    destroy()              // 销毁插件
    enable()               // 启用
    disable()              // 禁用

    // 公共 API
    copy()                 // 执行复制
    paste()                // 执行粘贴（异步兼容 API）
    cut()                  // 执行剪切
    insertImage(opts)      // 打开文件选择器插入图片（v2 新增）
    clearClipboard()       // 清空剪贴板
    getClipboardManager()  // 获取 ClipboardManager 实例
    setPermissions(opts)   // 设置操作权限
}
```

## API 参考

### init(options)

初始化复制/粘贴插件。创建 `ClipboardManager` 和 `CopyPasteStrategy`，注册到事件处理器。

```js
init(options = {})
```

**参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.enabled` | `boolean` | `true` | 是否默认启用 |
| `options.allowCopy` | `boolean` | `true` | 是否允许复制 |
| `options.allowPaste` | `boolean` | `true` | 是否允许粘贴 |
| `options.allowCut` | `boolean` | `true` | 是否允许剪切 |

**初始化流程**：
1. 解析权限选项
2. 创建 `ClipboardManager` 实例
3. 将 `clipboard` 引用挂到 `workbook.clipboard`（保持向后兼容，供 TileRenderer 等使用）
4. 创建 `CopyPasteStrategy` 并注册到 `EventHandler`（Ctrl+C/V/X 快捷键处理）
5. 如果 `options.enabled === false`，立即调用 `disable()`

### copy()

执行复制操作。触发 `beforeCopy` → 执行复制 → `afterCopy` 钩子链。

```js
plugin.copy();
```

### paste()

执行粘贴操作（异步方式，兼容工具栏按钮调用）。触发 `beforePaste` → 执行粘贴 → `afterPaste` 钩子链。

```js
plugin.paste();
```

> **注意**：工具栏按钮调用此方法时走异步 `navigator.clipboard.readText()` 路径（需权限弹窗，仅支持文本）。`Ctrl+V` 由隐藏 contenteditable div 上的原生 `paste` 事件直接处理（更高效，支持图片，无需权限弹窗）。

### cut()

执行剪切操作（复制 + 删除）。触发 `beforeCut` → 复制 + 删除 → `afterCut` 钩子链。使用 `beginBatch/endBatch` 批量操作，一次撤销即可恢复所有被清空的单元格。

```js
plugin.cut();
```

### insertImage(options) [v2 新增]

打开系统文件选择器，选中图片后插入到指定单元格。

```js
plugin.insertImage({ row: 2, col: 3 });
// 不传 row/col 则使用当前选区活动单元格
```

**支持的图片格式**：PNG、JPEG、GIF、WebP、BMP、SVG。

**内部流程**：
```
insertImage(opts)
    → clipboard.insertImageFromFile(sheet, opts)
        → 创建隐藏 <input type="file" accept="image/*">
        → input.click()
        → change 事件 → setCellImage(sheet, r, c, file)
            → URL.createObjectURL(file)
            → #cellContent.set(key, { type: "image", blob, objectUrl })
            → renderEngine.invalidateAll()
```

### clearClipboard()

清空内部剪贴板数据（不影响已粘贴到单元格的图片）。

```js
plugin.clearClipboard();
```

### getClipboardManager()

获取 `ClipboardManager` 实例，可用于直接操作剪贴板或查看剪贴板数据。

```js
const clipboard = plugin.getClipboardManager();
const data = clipboard.getClipboardData();
console.log(data.columnTypes); // ["text", "numeric", "date"]
```

### setPermissions(permissions)

动态设置操作权限，支持运行时切换只读模式。

```js
plugin.setPermissions({ allowCopy, allowPaste, allowCut });
```

## 粘贴机制详解

### Ctrl+V 粘贴流程

```
CopyPasteStrategy.init()
    → #ensurePasteTarget() 创建持久隐藏 contenteditable div（仅一次）
    → div 上绑定 paste 事件处理器

用户按 Ctrl+V
    → CopyPasteStrategy.#handleKeyDown 拦截 keydown 事件
    → 不调用 preventDefault()（让浏览器自然触发 paste）
    → #focusPasteTarget() 聚焦隐藏 div
    → 浏览器在 div 上触发 paste 事件（携带 clipboardData）
    → paste 事件处理
        → clipboard.pasteFromEvent(sheet, pasteEvent)
            → 遍历 e.clipboardData.items
            → image/* → #pasteImage(sheet, blob) → setCellImage()
            → text/plain → pasteText(sheet, text)
            → 无内容 + 有内部数据 → pasteInternal()
        → 图片 + 文本共存 → 图片优先
    → 清除 div 文本内容（残留清理）

CopyPasteStrategy.destroy()
    → #removePasteTarget() 移除 div 并解绑事件
```

> **为什么需要隐藏 div？**
> 浏览器只在可编辑元素（input/textarea/contenteditable）上触发 paste 事件。
> Canvas 不是可编辑元素，直接在 document 上监听 paste 收不到事件。
> 通过持久隐藏的 contenteditable div 接收 paste 事件，同步读取 clipboardData
> （含图片 Blob），无需 navigator.clipboard 权限弹窗。
> 这是 Google Sheets 等产品使用的标准做法。
>
> **为什么不 preventDefault？**
> 在 keydown 上调用 `e.preventDefault()` 会阻止浏览器触发 paste 事件链。
> 正确的做法是只聚焦隐藏 div，让浏览器自然检测到可编辑元素 + Ctrl/V → 触发 paste。

### 设计演进

| 版本 | 策略 | 问题 |
|------|------|------|
| v1 | `navigator.clipboard.readText()` 异步 | 权限弹窗，不支持图片 |
| v2 | 临时创建/销毁 contenteditable div + preventDefault | preventDefault 阻止了 paste 事件，需超时 fallback |
| v3 | Plugin 持有 div，Strategy 反向依赖 Plugin | 依赖倒置，职责分散 |
| v4（当前） | Strategy 自持持久 div，不 preventDefault | ✅ 同步读取，无权限弹窗，支持图片，无超时问题 |

## 配置示例

### 默认加载（允许所有操作）

```js
plugins: ["copyPaste"]
```

### 只读模式（仅允许复制，禁止粘贴和剪切）

```js
pluginOptions: {
    copyPaste: {
        allowPaste: false,
        allowCut: false,
    }
}
```

### 完全禁用

```js
// 初始化时
plugins: ["copyPaste"],
pluginOptions: {
    copyPaste: { enabled: false }
}

// 运行时
workbook.disablePlugin("copyPaste");  // 禁用
workbook.enablePlugin("copyPaste");   // 恢复
```

### 动态切换只读模式

```js
const plugin = workbook.getPlugin("copyPaste");

// 进入只读模式
plugin.setPermissions({ allowPaste: false, allowCut: false });

// 恢复编辑模式
plugin.setPermissions({ allowPaste: true, allowCut: true });
```

---

## 生命周期

```
init(options)
    │
    ├── 创建 ClipboardManager
    ├── 创建 CopyPasteStrategy
    ├── 注册到 EventHandler
    └── 检查 enabled 状态
    │
    ▼
[启用状态]
    │
    ├── enable()   → strategy.enable()
    │                 Ctrl+C/V/X 可响应
    │
    └── disable()  → strategy.disable()
                      Ctrl+C/V/X 不响应
    │
    ▼
destroy()
    ├── clipboard.destroy() → 释放图片 Object URL
    ├── 清空 #strategy / #clipboard 引用
    ├── 清理 workbook.clipboard
    └── super.destroy() → 自动移除策略
```

---

## 钩子事件

| 钩子名 | 触发时机 | 参数 | 可拦截 |
|--------|---------|------|--------|
| `beforeCopy` | 复制前 | `range` | 否 |
| `afterCopy` | 复制后 | `range` | 否 |
| `beforePaste` | 粘贴前 | `[activeRow, activeCol]` | 否 |
| `afterPaste` | 粘贴后 | `[activeRow, activeCol]` | 否 |
| `beforeCut` | 剪切前 | `range` | 否 |
| `afterCut` | 剪切后 | `range` | 否 |

> 钩子名定义在 `src/constants/hookNames.js` 的 `HOOKS` 常量中。

### 钩子使用示例

```js
// 监听粘贴事件
workbook.addHook(HOOKS.BEFORE_PASTE, ([row, col]) => {
    console.log(`即将粘贴到 (${row}, ${col})`);
});

// 记录复制操作
workbook.addHook(HOOKS.AFTER_COPY, (range) => {
    console.log(`已复制 ${range.bottomRow - range.topRow + 1} 行`);
});
```

---

## 与相关模块的关系

```
Workbook
    └── PluginManager
          └── CopyPastePlugin
                ├── ClipboardManager        ← 数据操作 + 图片管理
                │     ├── copy()
                │     ├── pasteFromEvent()     (v2: 同步，支持图片)
                │     ├── paste()              (v1: 异步，deprecated)
                │     ├── setCellImage()
                │     ├── getCellContent()
                │     ├── insertImageFromFile()
                │     ├── #checkTypeMismatch()
                │     ├── #data
                │     └── #cellContent
                │
                └── CopyPasteStrategy       ← 键盘事件
                      └── EventHandler
                            └── KeyboardStrategy (Ctrl+C/V/X)

ContextMenuStrategy
    └── "插入图片" → clipboard.insertImageFromFile()

TileRenderer
    └── #drawCellContent() → clipboard.getCellContent()
```

## 相关文档

- [ClipboardManager.md](./ClipboardManager.md) — 剪贴板管理器详细文档
- [RichContent.md](./RichContent.md) — 富内容系统架构文档
- [plugin-system.md](./plugin-system.md) — 插件系统完整架构
