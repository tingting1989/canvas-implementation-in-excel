# CopyPastePlugin — 复制/粘贴插件

## 概述

`CopyPastePlugin` 将复制、粘贴、剪切功能封装为插件，通过 `CopyPasteStrategy` 监听键盘快捷键（Ctrl+C/V/X），委托到 `ClipboardManager` 执行实际数据操作。支持细粒度权限控制和完整的钩子链。

## 文件位置

```
src/plugins/CopyPastePlugin.js
```

## 设计意图

- **插件化封装**：复制/粘贴作为可选功能，支持动态加载/卸载。
- **权限控制**：通过 `allowCopy` / `allowPaste` / `allowCut` 选项精确控制各操作，支持只读模式。
- **钩子集成**：在 copy/paste/cut 前后触发 `BEFORE_COPY` / `AFTER_COPY` 等钩子，允许外部拦截和扩展。
- **类型安全**：`ClipboardManager` 在粘贴时自动检查列类型一致性，不一致则阻止粘贴。

## 快捷键

| 快捷键 | 操作 | 说明 |
|--------|------|------|
| `Ctrl+C` | 复制 | 复制当前选区到剪贴板 |
| `Ctrl+V` | 粘贴 | 从剪贴板粘贴到活动单元格 |
| `Ctrl+X` | 剪切 | 复制选区并清空内容 |

## 类结构

```js
class CopyPastePlugin extends BasePlugin {
    static PLUGIN_NAME = "copyPaste"

    #strategy: CopyPasteStrategy   // 键盘事件策略
    #clipboard: ClipboardManager   // 剪贴板数据管理
    #allowCopy: boolean            // 是否允许复制（默认 true）
    #allowPaste: boolean           // 是否允许粘贴（默认 true）
    #allowCut: boolean             // 是否允许剪切（默认 true）

    init(options)          // 初始化插件
    destroy()              // 销毁插件
    enable()               // 启用
    disable()              // 禁用

    // 公共 API
    copy()                 // 执行复制
    paste()                // 执行粘贴
    cut()                  // 执行剪切
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
3. 将 `clipboard` 引用挂到 `workbook.clipboard`（保持向后兼容）
4. 创建 `CopyPasteStrategy` 并注册到 `EventHandler`
5. 如果 `options.enabled === false`，立即调用 `disable()`

### copy()

执行复制操作。触发 `beforeCopy` → 执行复制 → `afterCopy` 钩子链。

```js
plugin.copy();
```

**流程**：
```
检查 #allowCopy 权限
    │
    ▼
runHooks("beforeCopy", range)
    │
    ▼
clipboard.copy(sheet)
    │  ├── 收集单元格 { value, styleId }
    │  ├── 记录列类型 columnTypes[]
    │  ├── 写入 #data（内部存储）
    │  └── 写入系统剪贴板（TSV 纯文本）
    │
    ▼
runHooks("afterCopy", range)
```

### paste()

执行粘贴操作。触发 `beforePaste` → 执行粘贴 → `afterPaste` 钩子链。

```js
plugin.paste();
```

**流程**：
```
检查 #allowPaste 权限
    │
    ▼
runHooks("beforePaste", [activeRow, activeCol])
    │
    ▼
clipboard.paste(sheet)
    │  ├── 尝试读取系统剪贴板
    │  │   ├── 有内容 → #pasteText（纯文本粘贴）
    │  │   └── 无内容 → #pasteInternal（内部数据粘贴，保留样式）
    │  ├── 类型一致性检查（#checkTypeMismatch）
    │  │   └── 不一致 → 阻止粘贴，输出警告
    │  └── 写入单元格 + 刷新渲染
    │
    ▼
runHooks("afterPaste", [activeRow, activeCol])
    │
    ▼
render()  刷新视图
```

### cut()

执行剪切操作（复制 + 删除）。触发 `beforeCut` → 复制 + 删除 → `afterCut` 钩子链。

```js
plugin.cut();
```

**流程**：
```
检查 #allowCut 权限
    │
    ▼
runHooks("beforeCut", range)
    │
    ▼
clipboard.copy(sheet)      ← 先复制选区到剪贴板
    │
    ▼
遍历选区，清空非禁用单元格的值
    │  ├── 收集 changes[]
    │  ├── runHooks("beforeChange", changes)
    │  ├── beginBatch / setCell("") / endBatch
    │  └── runHooks("afterChange", changes)
    │
    ▼
runHooks("afterCut", range)
    │
    ▼
render()  刷新视图
```

> **注意**：剪切使用 `beginBatch/endBatch` 批量操作，一次撤销即可恢复所有被清空的单元格。

### clearClipboard()

清空内部剪贴板数据。

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

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `allowCopy` | `boolean` | 是否允许复制 |
| `allowPaste` | `boolean` | 是否允许粘贴 |
| `allowCut` | `boolean` | 是否允许剪切 |

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
                ├── ClipboardManager        ← 数据操作
                │     ├── copy()
                │     ├── paste()
                │     ├── #checkTypeMismatch()
                │     └── #data
                │
                └── CopyPasteStrategy       ← 键盘事件
                      └── EventHandler
                            └── KeyboardStrategy (Ctrl+C/V/X)
```
