# 项目插件系统架构文档

## 概述

项目参考了 **Handsontable** 的插件设计，提供了一套完整的插件体系，包含三层架构：

```
┌─────────────────────────────────────────────────────┐
│                    Workbook (顶层)                    │
│  registerPlugin / loadPlugin / getPlugin / unload    │
├─────────────────────────────────────────────────────┤
│                 PluginManager (管理器)                │
│  全局注册表 + 实例管理 + 生命周期                      │
├─────────────────────────────────────────────────────┤
│                  BasePlugin (基类)                    │
│  addHook / addStrategy / addDOMEvent + 自动清理      │
├─────────────────────────────────────────────────────┤
│              EventStrategy (策略层)                   │
│  getEventHandlers + priority + enable/disable        │
└─────────────────────────────────────────────────────┘
```

## 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| BasePlugin | `src/plugins/BasePlugin.js` | 生命周期管理 + 资源自动清理 |
| PluginManager | `src/plugins/PluginManager.js` | 全局注册 + 实例化 + 加载/卸载 |
| EventStrategy | `src/editor/strategies/EventStrategy.js` | 事件声明 + 优先级 + 委托分发 |
| Hooks | `src/editor/Hooks.js` | 发布/订阅 + before/after 拦截 |
| HOOKS | `src/constants/hookNames.js` | 30+ 钩子名统一定义 |

## 插件扩展的三种策略

### 策略 1：事件策略（EventStrategy）— 交互行为扩展

最常用的扩展方式，适合处理鼠标/键盘交互：

```javascript
import { BasePlugin } from "./BasePlugin.js";
import { EventStrategy } from "../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../constants/eventNames.js";

class MyInteractionStrategy extends EventStrategy {
    priority = 10; // 数值越大越先处理

    init() {
        // 初始化 DOM、状态等
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => {
                // 处理鼠标按下
                return false; // 返回 false 阻止低优先级策略接收
            },
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => {
                // 处理鼠标移动
            },
        };
    }

    destroy() {
        // 清理资源
    }
}

class MyPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "myPlugin"; }
    #strategy = null;

    init(options = {}) {
        super.init(options);
        this.#strategy = new MyInteractionStrategy(this.eventHandler);
        this.addStrategy("myPlugin", this.#strategy); // 自动注册+销毁时清理
    }

    destroy() {
        this.#strategy = null;
        super.destroy(); // 自动调用 removeOwnStrategies()
    }
}
```

**现有插件使用此策略**：AutoFillPlugin、ContextMenuPlugin、ColumnMovePlugin、RowMovePlugin

### 策略 2：钩子系统（Hooks）— 数据/生命周期监听

适合监听数据变化、拦截操作、响应生命周期事件：

```javascript
import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

class ValidationPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "validation"; }

    init(options = {}) {
        super.init(options);

        // 拦截操作（before* 钩子返回 false 可阻止）
        this.addHook(HOOKS.BEFORE_CHANGE, (row, col, oldValue, newValue) => {
            if (typeof newValue === "string" && newValue.length > 100) {
                alert("内容不能超过100字符");
                return false; // 阻止修改
            }
        });

        // 响应事件（after* 钩子）
        this.addHook(HOOKS.AFTER_CHANGE, (row, col) => {
            console.log(`单元格 (${row},${col}) 已修改`);
        });

        // 一次性钩子
        this.addHookOnce(HOOKS.AFTER_SELECTION, (row, col) => {
            console.log("首次选中:", row, col);
        });
    }

    destroy() {
        super.destroy(); // 自动调用 clearOwnHooks()
    }
}
```

**现有插件使用此策略**：PaginationPlugin（监听 `AFTER_CHANGE` 自动刷新分页）

### 策略 3：独立功能（无策略/钩子）— 纯逻辑扩展

适合不涉及交互的功能性插件：

```javascript
class ExportFilePlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "exportFile"; }

    init(options = {}) {
        super.init(options);
        // 无需注册策略或钩子，仅提供 API
    }

    // 对外暴露的方法
    exportAsString(format = "csv", options = {}) { ... }
    exportAsBlob(format = "csv", options = {}) { ... }
    downloadFile(format = "csv", options = {}) { ... }
}
```

**现有插件使用此策略**：ExportFilePlugin

## 插件生命周期

```
注册 → 加载 → 初始化 → [启用 ↔ 禁用] → 卸载/销毁
 │      │      │                           │
 │      │      │                           └─ destroy(): 自动清理 hooks/strategies/DOM
 │      │      └─ init(options): 注册 hooks/strategies/DOM
 │      └─ loadPlugin(name, options) 或 loadPluginClass(Class, options)
 └─ PluginManager.register(name, Class) 或 Workbook.registerPlugin(name, Class)
```

## 如何创建自定义插件

### 完整示例：单元格注释插件

```javascript
// CellCommentPlugin.js
import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class CellCommentPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "cellComment"; }

    #comments = new Map(); // "row,col" → comment text

    init(options = {}) {
        super.init(options);

        // 策略2：钩子 — 双击添加注释
        this.addHook(HOOKS.ON_CELL_DBL_CLICK, (row, col) => {
            const key = `${row},${col}`;
            const existing = this.#comments.get(key) || "";
            const comment = prompt("输入注释:", existing);
            if (comment !== null) {
                if (comment) {
                    this.#comments.set(key, comment);
                } else {
                    this.#comments.delete(key);
                }
                this.render();
            }
        });

        // 策略2：钩子 — 拦截编辑（有注释的单元格需确认才能编辑）
        this.addHook(HOOKS.BEFORE_BEGIN_EDITING, (row, col) => {
            const key = `${row},${col}`;
            if (this.#comments.has(key)) {
                return confirm(`此单元格有注释: "${this.#comments.get(key)}"\n确认编辑?`);
            }
        });
    }

    getComment(row, col) {
        return this.#comments.get(`${row},${col}`) || null;
    }

    setComment(row, col, text) {
        this.#comments.set(`${row},${col}`, text);
    }

    removeComment(row, col) {
        this.#comments.delete(`${row},${col}`);
    }

    destroy() {
        this.#comments.clear();
        super.destroy(); // 自动清理所有 hooks
    }
}
```

### 使用自定义插件

```javascript
// main.js
import { CellCommentPlugin } from "./plugins/CellCommentPlugin.js";

// 方式1：全局注册后加载
Workbook.registerPlugin("cellComment", CellCommentPlugin);
// 在 Workbook 构造函数中 plugins 数组添加 "cellComment"

// 方式2：直接加载（无需全局注册）
const plugin = wb.loadPluginClass(CellCommentPlugin, { someOption: true });

// 使用插件 API
plugin.setComment(0, 0, "这是表头");
console.log(plugin.getComment(0, 0));
```

## BasePlugin 自动清理机制

| 注册方式 | 清理方法 | destroy 时自动调用 |
|---------|---------|------------------|
| `this.addHook(name, cb)` | `clearOwnHooks()` | ✅ |
| `this.addStrategy(name, s)` | `removeOwnStrategies()` | ✅ |
| `this.addDOMEvent(t, e, h)` | `removeOwnDOMEvents()` | ✅ |

插件销毁时只需 `super.destroy()`，基类自动清理所有通过上述方法注册的资源，无需手动移除。

## 现有内置插件一览

| 插件 | 扩展策略 | 功能 |
|------|---------|------|
| AutoFillPlugin | EventStrategy | 拖拽填充手柄自动填充 |
| ContextMenuPlugin | EventStrategy | 右键上下文菜单（插入行/列、合并、插入图片、清空内容，支持自定义项） |
| CopyPastePlugin | EventStrategy + 原生 paste 事件 | 复制/粘贴/剪切 + 图片粘贴（Ctrl+V） + 图片插入 API |
| ColumnMovePlugin | EventStrategy | 拖拽列头移动列 |
| RowMovePlugin | EventStrategy | 拖拽行头移动行 |
| PaginationPlugin | Hooks | 分页浏览大数据 |
| ExportFilePlugin | 独立功能 | CSV/TSV 导出下载 |
| HiddenColumnsPlugin | Hooks + API | 隐藏/显示列 |

### CopyPastePlugin 简介

`CopyPastePlugin` 同时使用了 EventStrategy 和原生 paste 事件，是最复杂的插件之一：

- **EventStrategy**：通过 `CopyPasteStrategy` 拦截 Ctrl+C/V/X 键盘快捷键
- **原生 paste 事件**：通过持久隐藏的 contenteditable div 接收 paste 事件，同步读取剪贴板（支持文本 + 图片），无需浏览器权限弹窗
- **图片管理**：通过 `ClipboardManager` 内部的 `#cellContent` Map 管理图片，与 Cell 模型解耦
- **公开 API**：`copy()` / `paste()` / `cut()` / `insertImage({ row?, col? })` / `setPermissions()`

详见 [CopyPastePlugin.md](./CopyPastePlugin.md) 和 [ClipboardManager.md](./ClipboardManager.md)。

## 钩子名称参考

| 类别 | 钩子名 | 说明 |
|------|--------|------|
| **编辑** | `beforeBeginEditing` | 开始编辑前，返回 false 可阻止 |
| | `afterBeginEditing` | 开始编辑后 |
| | `beforeFinishEditing` | 结束编辑前 |
| | `afterFinishEditing` | 结束编辑后 |
| | `beforeChange` | 数据变更前，返回 false 可阻止 |
| | `afterChange` | 数据变更后 |
| **选区** | `beforeSelection` | 选区变更前 |
| | `afterSelection` | 选区变更后 |
| | `beforeSelectionEnd` | 选区结束前 |
| | `afterSelectionEnd` | 选区结束后 |
| **单元格交互** | `onCellMouseDown` | 鼠标按下 |
| | `onCellMouseOver` | 鼠标移入 |
| | `onCellMouseOut` | 鼠标移出 |
| | `onCellClick` | 单击 |
| | `onCellDblClick` | 双击 |
| **键盘** | `beforeKeyDown` | 按键按下前 |
| | `afterKeyDown` | 按键按下后 |
| **滚动** | `afterScrollHorizontally` | 水平滚动后 |
| | `afterScrollVertically` | 垂直滚动后 |
| **合并** | `beforeMergeCells` | 合并前，返回 false 可阻止 |
| | `afterMergeCells` | 合并后 |
| | `beforeUnmergeCells` | 取消合并前 |
| | `afterUnmergeCells` | 取消合并后 |
| **剪贴板** | `beforeCopy` / `afterCopy` | 复制 |
| | `beforeCut` / `afterCut` | 剪切 |
| | `beforePaste` / `afterPaste` | 粘贴 |
| **列移动** | `beforeColumnMove` / `afterColumnMove` | 列移动 |
| **行移动** | `beforeRowMove` / `afterRowMove` | 行移动 |
| **分页** | `afterPageChange` | 页码变更后 |
| | `afterPageSizeChange` | 每页行数变更后 |
| **隐藏列** | `afterHideColumn` | 隐藏列后 |
| | `afterShowColumn` | 显示列后 |
| **生命周期** | `init` / `destroy` | 初始化/销毁 |

## EventStrategy 事件委托键名

策略通过 `getEventHandlers()` 返回的键名格式为 `target:eventType`，由 `DELEGATE_KEYS` 常量定义：

| 键名 | 说明 |
|------|------|
| `CANVAS_MOUSEDOWN` | canvas 鼠标按下 |
| `CANVAS_MOUSEMOVE` | canvas 鼠标移动 |
| `CANVAS_MOUSEUP` | canvas 鼠标释放 |
| `CANVAS_DBLCLICK` | canvas 双击 |
| `CANVAS_CONTEXTMENU` | canvas 右键菜单 |
| `DOCUMENT_MOUSEDOWN` | document 鼠标按下 |
| `DOCUMENT_MOUSEMOVE` | document 鼠标移动 |
| `DOCUMENT_MOUSEUP` | document 鼠标释放 |
| `DOCUMENT_KEYDOWN` | document 键盘按下 |