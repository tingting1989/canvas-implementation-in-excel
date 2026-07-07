# DOM 生命周期管理重构方案

## 1. 背景

Workbook `destroy()` 时需要彻底清理初始化时创建的所有 DOM 元素和事件监听器。
当前 DOM 创建逻辑散落在多个模块中，缺乏统一的生命周期管理机制，导致：

- **资源泄漏**：部分 DOM 元素和事件监听器在 destroy 时未被清理
- **模式不统一**：每个模块各自实现创建/销毁逻辑，难以维护
- **`<style>` 注入残留**：注入到 `document.head` 的样式表永远不会被移除
- **不支持多实例**：同一页面无法创建多个 Workbook 实例（编辑器 ID 冲突、`<style>` 注入 flag 共享）

## 2. 现状分析

### 2.1 DOM 创建点全景

| 模块 | 文件路径 | 创建的 DOM | 注入 `<style>` | 有 destroy() | 是否完整 |
|------|---------|-----------|:-------------:|:-----------:|:-------:|
| RenderEngine | `src/render/RenderEngine.js` | `wrap` div | - | ✅ | ❌ 不移除 wrap，不调用 sheetTabBar.destroy() |
| ScrollManager | `src/ui/ScrollManager.js` | hBar / vBar / corner / thumbs | ✅ 全局 flag | ✅ | ⚠️ `<style>` 不清理 |
| SheetTabBar | `src/ui/SheetTabBar.js` | bar / addBtn / scrollWrap / tabs | ✅ 全局 flag | ✅ | ⚠️ `<style>` 不清理 |
| FormulaBar | `src/ui/FormulaBar.js` | bar / cellRef / input | - | ✅ | ✅ |
| CellEditor | `src/editor/editors/CellEditor.js` | editor element | - | ✅ | ✅ |
| ContextMenuStrategy | `src/editor/strategies/ContextMenuStrategy.js` | menuEl + `<style>` | ✅ 内嵌 | ✅ | ⚠️ `<style>` 残留 |
| ValidationPortalManager | `src/plugins/data-validation/ValidationPortalManager.js` | portalContainer + portals | - | ✅ | ✅ |
| ClipboardManager | `src/editor/ClipboardManager.js` | 临时 textarea / input | - | ✅ | ✅ 自清理 |
| BaseLayer | `src/render/BaseLayer.js` | canvas | - | ❌ | - |
| Tile | `src/render/Tile.js` | canvas | - | ❌ | - |

### 2.2 核心问题

#### 问题 1：RenderEngine.destroy() 遗漏

```
RenderEngine.destroy()
  ├── cancelAnimationFrame ✅
  ├── removeEventListener(resize) ✅
  ├── compositor.destroyAll() ✅
  ├── store.destroy() ✅
  ├── scrollMgr.destroy() ✅
  ├── sheetTabBar.destroy() ❌ ← 遗漏！SheetTabBar 的 DOM 和事件泄漏
  └── wrap.remove() ❌ ← 遗漏！wrap div 残留在 DOM 树中
```

#### 问题 2：`<style>` 注入永不回收

ScrollManager、SheetTabBar、ContextMenuStrategy 各自向 `document.head` 注入 `<style>` 元素，
使用模块级 boolean flag（如 `scrollbarStyleInjected`）防止重复注入，但 destroy 时从不移除。

多次创建/销毁 Workbook 实例时，`<style>` 会持续累积。

#### 问题 3：事件监听器清理散落

每个模块各自管理 `addEventListener` / `removeEventListener`，需要手动保存 handler 引用以便销毁时移除。
容易遗漏（如 ScrollManager 曾发现 thumb mousedown handler 引用未保存导致泄漏的 bug）。

#### 问题 4：编辑器不支持多实例

当前编辑器存在多处硬编码，导致同一页面无法创建多个 Workbook 实例：

| 问题点 | 位置 | 说明 |
|--------|------|------|
| **编辑器 ID 硬编码** | `TextEditor.getEditorId()` → `"cell-editor"` | 两个实例创建相同 ID 的 DOM 元素，违反 HTML 唯一 ID 约束 |
| | `NumericEditor.getEditorId()` → `"numeric-editor"` | 同上 |
| | `DateEditor.getEditorId()` → `"date-editor"` | 同上 |
| | `SelectEditor.getEditorId()` → `"select-editor"` | 同上 |
| **`<style>` 注入全局 flag** | `ScrollManager` → `scrollbarStyleInjected` | 模块级 boolean flag，实例 A destroy 移除 `<style>` 后，实例 B 的 flag 为 true 不会重新注入 |
| | `SheetTabBar` → `sheetTabStyleInjected` | 同上 |
| **编辑器内联样式** | `CellEditor.createEditor()` → `style.cssText = baseCss + ...` | 每个实例重复拼接相同的 CSS 字符串，不可维护 |
| **ContextMenuStrategy 内联样式** | `#createMenu()` → `Object.assign(menuEl.style, ...)` | 菜单容器样式通过 JS 对象赋值，与逻辑耦合 |

#### 问题 5：CSS 样式管理混乱

当前所有组件样式通过 JS 运行时动态注入 `<style>` 标签或内联 `style` 属性管理：

| 样式类型 | 当前方式 | 问题 |
|----------|---------|------|
| 组件级样式（滚动条、Sheet Tab） | 模块级函数 `injectScrollbarStyles()` + 全局 flag | flag 不支持多实例；destroy 时不清理 |
| 编辑器基础样式 | `style.cssText = baseCss` 内联 | 每次创建编辑器重复拼接字符串；无法通过 class 统一覆盖 |
| 编辑器变体样式 | `getExtraCssText()` 返回 CSS 片段 | 同上 |
| 右键菜单样式 | `<style>` 内嵌到 menuEl 子元素 + `Object.assign` 内联 | 两种方式混用；每次创建菜单重复注入 |
| 公式栏样式 | `Object.assign(bar.style, ...)` 内联 | 样式与逻辑耦合，无法独立维护 |

## 3. 设计方案

### 3.1 两层基类体系

```
Disposable（抽象基类）
  ├── 统一的 destroy() 生命周期
  ├── 注册/清理事件监听器（trackEvent）
  └── 注册/清理子对象（trackChild → 级联销毁）

DOMComponent extends Disposable
  ├── 跟踪创建的 DOM 元素（destroy 时自动从 DOM 树移除）
  ├── 跟踪注入的 <style> 元素（destroy 时自动移除）
  └── 提供便捷的 DOM 创建辅助方法（createElement）
```

### 3.2 Disposable — 基础生命周期基类

**文件**：`src/core/Disposable.js`

```javascript
export class Disposable {
    #disposed = false;
    #eventListeners = [];   // { target, type, handler, options? }
    #children = [];         // 子 Disposable（级联销毁）

    get isDisposed() { return this.#disposed; }

    /**
     * 注册事件监听器，destroy 时自动移除
     * 替代直接调用 target.addEventListener()
     */
    trackEvent(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.#eventListeners.push({ target, type, handler, options });
    }

    /**
     * 注册子 Disposable，父级 destroy 时级联销毁
     * 用于建立父子关系，如 RenderEngine → ScrollManager
     */
    trackChild(disposable) {
        this.#children.push(disposable);
    }

    /**
     * 统一的销毁入口（final 模式，子类不应覆写）
     */
    destroy() {
        if (this.#disposed) return;
        this.#disposed = true;
        this.onDestroy();
        // 移除所有跟踪的事件监听器
        for (const { target, type, handler, options } of this.#eventListeners) {
            target.removeEventListener(type, handler, options);
        }
        this.#eventListeners.length = 0;
        // 级联销毁子对象
        for (const child of this.#children) {
            child.destroy();
        }
        this.#children.length = 0;
    }

    /**
     * 子类覆写：释放特有资源
     * 类似 React 的 componentWillUnmount
     */
    onDestroy() {}
}
```

**设计要点**：

- `destroy()` 是 final 的，子类通过 `onDestroy()` 钩子释放特有资源
- `trackEvent()` 替代直接 `addEventListener`，确保事件监听器不会泄漏
- `trackChild()` 建立销毁树，父级销毁时自动销毁所有子级
- 幂等设计：重复调用 `destroy()` 安全

### 3.3 DOMComponent — DOM 组件基类

**文件**：`src/core/DOMComponent.js`

```javascript
import { Disposable } from "./Disposable.js";

export class DOMComponent extends Disposable {
    #trackedElements = [];  // { el }  跟踪创建的 DOM 元素
    #injectedStyles = [];   // <style>  跟踪注入到 <head> 的样式表

    /**
     * 创建 DOM 元素并自动跟踪
     * @param {string} tag - 标签名
     * @param {object} [attrs={}] - 属性映射
     * @param {HTMLElement} [parent] - 可选的父元素
     * @returns {HTMLElement}
     */
    createElement(tag, attrs = {}, parent) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "className") el.className = v;
            else if (k === "textContent") el.textContent = v;
            else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
            else el.setAttribute(k, v);
        }
        if (parent) parent.appendChild(el);
        this.#trackedElements.push({ el });
        return el;
    }

    /**
     * 注入 <style> 到 <head>，带 ID 去重
     * destroy 时自动移除
     * @param {string} id - style 元素 ID（全局唯一）
     * @param {string} cssText - CSS 内容
     */
    injectStyle(id, cssText) {
        const existing = document.getElementById(id);
        if (existing) {
            this.#injectedStyles.push(existing);
            return;
        }
        const style = document.createElement("style");
        style.id = id;
        style.textContent = cssText;
        document.head.appendChild(style);
        this.#injectedStyles.push(style);
    }

    onDestroy() {
        // 移除所有跟踪的 DOM 元素
        for (const { el } of this.#trackedElements) {
            el?.remove?.();
        }
        this.#trackedElements.length = 0;
        // 移除注入的 <style>
        for (const style of this.#injectedStyles) {
            style?.remove?.();
        }
        this.#injectedStyles.length = 0;
    }
}
```

**设计要点**：

- `createElement()` 替代 `document.createElement()`，自动跟踪创建的 DOM 元素
- `injectStyle()` 替代模块级 flag，自动跟踪注入的样式表
- `onDestroy()` 中统一清理所有跟踪的 DOM 和样式
- 继承 `Disposable` 的 `trackEvent()` 和 `trackChild()` 能力

## 4. CSS 提取方案

### 4.1 样式分层架构

```
┌─────────────────────────────────────────────────────────┐
│  应用层 (styles/app.css)                                 │
│  - #wrap 布局、toolbar、页面级样式                         │
│  - 由 main.js import 引入                                 │
├─────────────────────────────────────────────────────────┤
│  组件层 (独立 .css 文件，由 webpack css-loader 打包)       │
│  - ui/scrollbar.css       → .cs-scrollbar-* 滚动条样式   │
│  - ui/sheetTabBar.css     → .cs-sheet-tab-bar 等样式     │
│  - ui/formulaBar.css      → .cs-formula-bar 等样式       │
│  - editor/editor.css      → .cs-cell-editor 编辑器样式   │
│  - editor/contextMenu.css → .ctx-menu 右键菜单样式       │
│  - 各组件 JS 文件顶部 import 对应 .css 文件               │
│  - webpack 自动去重，多实例共享同一份 <style>              │
├─────────────────────────────────────────────────────────┤
│  动态样式（不可预知的运行时样式）                            │
│  - 编辑器位置/尺寸 (left/top/width/height)                │
│  - 单元格字体/颜色/对齐 → 通过 style 属性动态设置          │
│  - 保留内联方式                                           │
└─────────────────────────────────────────────────────────┘
```

**为什么使用 `.css` 文件而非 JS 字符串常量**：

项目已配置 `css-loader` + `style-loader`（见 `webpack.config.js`），
webpack 会自动对同一 `.css` 文件的多次 `import` 去重，只注入一份 `<style>`。
因此无需 `injectInstanceStyle()` 做实例级隔离——静态组件样式天然共享。

### 4.2 多实例样式处理

核心原则：**静态组件样式天然共享，无需实例级隔离**。

```
webpack 打包行为：

ScrollManager.js  ──import──┐
                             ├──▶ scrollbar.css ──▶ webpack 去重 ──▶ 1 份 <style>
SheetTabBar.js    ──import──┘

CellEditor.js     ──import──┐
                             ├──▶ editor.css ──▶ webpack 去重 ──▶ 1 份 <style>
NumericEditor.js  ──import──┘

→ 无论创建多少个 Workbook 实例，每种组件的 <style> 只注入一份
→ 销毁最后一个实例时，webpack 不会自动移除 <style>（可接受，页面通常不会完全销毁）
→ 如需严格清理，可通过 DOMComponent.injectStyle() 做运行时注入（备用方案）
```

**备用方案：运行时注入（仅在需要严格清理时使用）**：

```javascript
// 当需要 destroy 时彻底清理 <style>，可改用运行时注入
import { SCROLLBAR_CSS } from "./scrollbar.css?raw";  // webpack asset/raw 模式

class ScrollManager extends DOMComponent {
    #createScrollbarDOM() {
        this.injectInstanceStyle("cs-scrollbar", SCROLLBAR_CSS);
        // destroy 时基类自动移除该 <style>
    }
}
```

> 默认使用 `import './scrollbar.css'` 方式（webpack 自动去重）。
> 仅当需要 destroy 时严格清理 `<style>` 的场景，才改用 `injectInstanceStyle()` 运行时注入。

### 4.3 各组件 CSS 提取对照

#### 4.3.1 ScrollManager

**提取前**（JS 内联注入 + 全局 flag）：
```javascript
let scrollbarStyleInjected = false;
function injectScrollbarStyles() {
    if (scrollbarStyleInjected) return;
    scrollbarStyleInjected = true;
    const style = document.createElement("style");
    style.textContent = `.cs-scrollbar-h { ... } ...`;
    document.head.appendChild(style);
}
```

**提取后**（独立 `.css` 文件 + `import` 引入）：
```css
/* src/ui/scrollbar.css */
.cs-scrollbar-h {
    position: absolute;
    bottom: 0;
    /* ... 所有滚动条样式 ... */
}
```

```javascript
// ScrollManager.js 顶部引入
import "./scrollbar.css";

class ScrollManager extends DOMComponent {
    #createScrollbarDOM() {
        // 无需手动注入 <style>，webpack 自动处理
        this.#hBar = this.createElement("div", { className: "cs-scrollbar-h" }, this.wrap);
        // ... DOM 创建 ...
    }
}
```

#### 4.3.2 SheetTabBar

**提取前**：同 ScrollManager 模式（全局 flag + `document.head.appendChild`）

**提取后**：
```css
/* src/ui/sheetTabBar.css */
.cs-sheet-tab-bar { ... }
.cs-sheet-tab { ... }
/* ... 所有 Sheet Tab 样式 ... */
```

```javascript
// SheetTabBar.js 顶部
import "./sheetTabBar.css";
```

#### 4.3.3 CellEditor

**提取前**（每次创建编辑器拼接 cssText）：
```javascript
createEditor() {
    this.editor = document.createElement(this.getElementType());
    const baseCss = `
        position: absolute;
        display: none;
        border: 2px solid ${CONFIG.SELECTION_COLOR};
        /* ... */
    `;
    this.editor.style.cssText = baseCss + this.getExtraCssText();
}
```

**提取后**（CSS class + `.css` 文件）：
```css
/* src/editor/editor.css */
.cs-cell-editor {
    position: absolute;
    display: none;
    border: 2px solid var(--cs-selection-color, #1a73e8);
    outline: none;
    padding: 0 4px;
    box-sizing: border-box;
    font: 12px/28px "Segoe UI", sans-serif;
    background: #fff;
    z-index: 1000;
}
.cs-cell-editor--numeric { text-align: right; }
.cs-cell-editor--date { text-align: center; }
.cs-cell-editor--select {
    text-align: left;
    cursor: pointer;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
}
```

```javascript
// CellEditor.js 顶部引入
import "./editor.css";

class CellEditor extends DOMComponent {
    createEditor() {
        // 无需手动注入 <style>，无需拼接 style.cssText
        this.editor = this.createElement(this.getElementType(), {
            className: `cs-cell-editor ${this.getEditorCssClass()}`.trim(),
        }, this.canvasContext.canvasParent);
    }

    /** 子类覆写返回变体 class */
    getEditorCssClass() { return ""; }
}

// NumericEditor
class NumericEditor extends CellEditor {
    getEditorCssClass() { return "cs-cell-editor--numeric"; }
}

// DateEditor
class DateEditor extends CellEditor {
    getEditorCssClass() { return "cs-cell-editor--date"; }
}

// SelectEditor
class SelectEditor extends CellEditor {
    getEditorCssClass() { return "cs-cell-editor--select"; }
}
```

#### 4.3.4 ContextMenuStrategy

**提取前**（`<style>` 内嵌到 menuEl + `Object.assign` 内联）：
```javascript
# createMenu() {
    this.#menuEl = document.createElement("div");
    Object.assign(this.#menuEl.style, {
        position: "fixed", display: "none", /* ... */
    });
    const style = document.createElement("style");
    style.textContent = `.ctx-menu .ctx-item:hover{background:#f0f4ff}`;
    this.#menuEl.appendChild(style);
}
```

**提取后**：
```css
/* src/editor/contextMenu.css */
.ctx-menu {
    position: fixed;
    display: none;
    z-index: 10000;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    padding: 4px 0;
    min-width: 180px;
    font-family: 12px sans-serif;
    font-size: 13px;
    user-select: none;
}
.ctx-menu .ctx-item {
    padding: 6px 16px;
    cursor: pointer;
    color: #333;
}
.ctx-menu .ctx-item:hover {
    background: #f0f4ff;
}
.ctx-menu .ctx-separator {
    height: 1px;
    background: #e0e0e0;
    margin: 4px 8px;
}
```

```javascript
// ContextMenuStrategy.js 顶部
import "./contextMenu.css";
```

#### 4.3.5 FormulaBar

**提取前**（`Object.assign(bar.style, ...)` 全内联）：

**提取后**：
```css
/* src/ui/formulaBar.css */
.cs-formula-bar {
    display: flex;
    align-items: center;
    height: 28px;
    border-bottom: 1px solid #ccc;
    background: #fff;
    flex-shrink: 0;
}
.cs-formula-cell-ref {
    width: 72px;
    min-width: 72px;
    /* ... */
}
.cs-formula-input {
    flex: 1;
    height: 100%;
    border: none;
    outline: none;
    /* ... */
}
```

```javascript
// FormulaBar.js 顶部
import "./formulaBar.css";
```

### 4.4 CSS 文件组织

```
src/
├── styles/
│   └── app.css                   # 应用层样式（#wrap 布局等）
├── ui/
│   ├── scrollbar.css             # 滚动条样式
│   ├── sheetTabBar.css           # Sheet Tab 样式
│   └── formulaBar.css            # 公式栏样式
├── editor/
│   ├── editor.css                # 编辑器基础样式 + 变体
│   └── contextMenu.css           # 右键菜单样式
└── ...
```

> **说明**：项目已配置 `css-loader` + `style-loader`（见 `webpack.config.js`），
> 各组件 JS 文件顶部 `import './xxx.css'` 即可，webpack 自动去重打包。
> 动态值（如 `CONFIG.SELECTION_COLOR`）通过 CSS 变量 `var(--cs-selection-color)` 在应用层设置。

## 5. 编辑器多实例支持

### 5.1 问题分析

当前编辑器不支持同一页面多个 Workbook 实例，根因：

| 问题 | 代码位置 | 影响 |
|------|---------|------|
| `getEditorId()` 返回硬编码 ID | `TextEditor` → `"cell-editor"` 等 | 多实例 DOM ID 冲突 |
| `style.cssText` 拼接基础样式 | `CellEditor.createEditor()` | 不可维护，但不影响多实例 |
| `getExtraCssText()` 返回 CSS 片段 | 各子类 | 同上 |

### 5.2 解决方案：彻底移除硬编码 ID 和旧 API

本项目为新项目，无需向后兼容，直接彻底清理：

- **删除 `getEditorId()`**：从基类和所有子类中完全移除，编辑器 DOM 不再设置 `id` 属性
- **删除 `getExtraCssText()`**：由 `getEditorCssClass()` 替代，子类覆写返回 CSS class 名
- **删除 `style.cssText` 拼接**：改用 CSS class，样式由注入的 `<style>` 统一管理

```javascript
// CellEditor.js — 彻底重构
createEditor() {
    // 不再设置 id，不再拼接 style.cssText
    this.editor = this.createElement(this.getElementType(), {
        className: `cs-cell-editor ${this.getEditorCssClass()}`.trim(),
    }, this.canvasContext.canvasParent);
}

// 以下方法从基类中彻底删除：
// ✗ getEditorId()        — 已删除
// ✗ getExtraCssText()    — 已删除，由 getEditorCssClass() 替代
// ✗ getDefaultTextAlign() — 已删除，对齐方式由 CSS class 控制

// 新增方法：
getEditorCssClass() { return ""; }  // 子类覆写
```

子类改造：

```javascript
// TextEditor — 删除 getEditorId()，无需其他覆写
class TextEditor extends CellEditor {
    // getEditorId() 已删除
    readCellValue(row, col) { /* ... */ }
    useBatchInBatchFill() { return true; }
}

// NumericEditor — 删除 getEditorId() + getExtraCssText()，改用 getEditorCssClass()
class NumericEditor extends CellEditor {
    getEditorCssClass() { return "cs-cell-editor--numeric"; }
    getEditorAttributes() { return { type: "text", inputmode: "decimal" }; }
    // ... 其他方法不变
}

// DateEditor — 同上
class DateEditor extends CellEditor {
    getEditorCssClass() { return "cs-cell-editor--date"; }
    // ...
}

// SelectEditor — 同上
class SelectEditor extends CellEditor {
    getEditorCssClass() { return "cs-cell-editor--select"; }
    // ...
}
```

### 5.3 编辑器销毁确认

**编辑器需要销毁**。当前 `CellEditor.destroy()` 已正确移除编辑器 DOM 元素：

```javascript
// CellEditor.js 当前实现
destroy() {
    if (this.editor && this.editor.parentElement) {
        this.editor.parentElement.removeChild(this.editor);
    }
    this.editor = null;
    // ...
}
```

`EditorManager.destroy()` 遍历销毁所有编辑器：

```javascript
// EditorManager.js 当前实现
destroy() {
    for (const editor of this.editors.values()) {
        editor.destroy();
    }
    this.editors.clear();
}
```

**迁移到 DOMComponent 后**，编辑器的销毁由基类自动处理：
- 编辑器 DOM 元素通过 `createElement()` 创建，被基类跟踪
- 事件监听器通过 `trackEvent()` 注册，被基类自动移除
- `onDestroy()` 中只需清理特有资源（如 composing 状态）

### 5.4 多实例完整调用链示例

```
页面包含两个 Workbook 实例：

Workbook A (instanceId = "wb-1")
  ├── RenderEngine A
  │     ├── wrap#A (cs-canvas-wrap)
  │     ├── ScrollManager A → injectStyle("cs-scrollbar-wb-1", css)
  │     └── SheetTabBar A   → injectStyle("cs-tabbar-wb-1", css)
  ├── EditorManager A
  │     ├── TextEditor A    → injectStyle("cs-editor-wb-1", css)
  │     │                      editor: <input class="cs-cell-editor">
  │     ├── NumericEditor A → editor: <input class="cs-cell-editor cs-cell-editor--numeric">
  │     └── ...
  └── formulaBar A           → injectStyle("cs-formula-wb-1", css)

Workbook B (instanceId = "wb-2")
  ├── RenderEngine B
  │     ├── wrap#B (cs-canvas-wrap)
  │     ├── ScrollManager B → injectStyle("cs-scrollbar-wb-2", css)
  │     └── SheetTabBar B   → injectStyle("cs-tabbar-wb-2", css)
  ├── EditorManager B
  │     ├── TextEditor B    → injectStyle("cs-editor-wb-2", css)
  │     │                      editor: <input class="cs-cell-editor">
  │     └── ...
  └── ...

销毁 Workbook A：
  workbookA.destroy()
    → renderEngine.destroy() (DOMComponent)
      → scrollMgr.destroy() → 移除 "cs-scrollbar-wb-1" <style>，移除 hBar/vBar DOM
      → sheetTabBar.destroy() → 移除 "cs-tabbar-wb-1" <style>，移除 bar DOM
      → wrap.remove()
    → editor.destroy()
      → 各 editor.destroy() → 移除编辑器 DOM，移除 "cs-editor-wb-1" <style>
    → formulaBar.destroy() → 移除公式栏 DOM

Workbook B 完全不受影响 ✅
```

## 6. 模块迁移计划

### 6.1 迁移对照表

| 优先级 | 模块 | 继承 | 关键改动 |
|:-----:|------|------|---------|
| **P0** | RenderEngine | `DOMComponent` | `wrap` 用 `createElement()` 跟踪；新增 `trackChild(sheetTabBar)` 级联销毁 |
| **P1** | ScrollManager | `DOMComponent` | DOM 创建改用 `createElement()`；`<style>` 改用 `injectStyle()`；事件改用 `trackEvent()` |
| **P1** | SheetTabBar | `DOMComponent` | 同上 |
| **P2** | FormulaBar | `DOMComponent` | DOM 创建改用 `createElement()`；事件改用 `trackEvent()` |
| **P2** | CellEditor | `DOMComponent` | editor 元素改用 `createElement()`；事件改用 `trackEvent()` |
| **P3** | ContextMenuStrategy | `DOMComponent` | menuEl 改用 `createElement()`；`<style>` 改用 `injectStyle()` |
| **P3** | ValidationPortalManager | `DOMComponent` | portalContainer 改用 `createElement()` |

### 6.2 迁移模板

每个模块的迁移遵循统一模式：

**迁移前**：
```javascript
export class ScrollManager {
    constructor(wrap, canvas) {
        this.wrap = wrap;
        this.canvas = canvas;
        this.#createScrollbarDOM();
        this.#bindThumbDrag();
    }

    #createScrollbarDOM() {
        injectScrollbarStyles();  // 模块级 flag 注入 <style>
        this.#hBar = document.createElement("div");
        // ...
        this.wrap.appendChild(this.#hBar);
    }

    destroy() {
        // 手动 removeEventListener ...
        // 手动 removeChild ...
    }
}
```

**迁移后**：
```javascript
export class ScrollManager extends DOMComponent {
    constructor(wrap, canvas) {
        super();
        this.wrap = wrap;
        this.canvas = canvas;
        this.#createScrollbarDOM();
        this.#bindThumbDrag();
    }

    #createScrollbarDOM() {
        this.injectStyle("cs-scrollbar-styles", SCROLLBAR_CSS);
        this.#hBar = this.createElement("div", { className: "cs-scrollbar-h" }, this.wrap);
        // ... 自动跟踪，自动 append
    }

    #bindThumbDrag() {
        // 替代 this.#hThumb.addEventListener(...)
        this.trackEvent(this.#hThumb, EVENT_NAMES.MOUSEDOWN, onHThumbDown);
    }

    onDestroy() {
        // 无需手动清理 DOM 和事件 — 基类自动处理
        // 只清理基类不跟踪的特有资源（如 rAF、Object URL 等）
        this.#pendingScrollCallback = false;
    }
}
```

### 6.3 RenderEngine 级联销毁示例

```javascript
export class RenderEngine extends DOMComponent {
    constructor(canvasId) {
        super();
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        this.outerWrap = this.canvas.parentElement;

        // wrap 通过 createElement 创建并跟踪
        this.wrap = this.createElement("div", {
            className: "cs-canvas-wrap",
            style: { position: "relative", overflow: "hidden" },
        }, this.outerWrap);
        // 注意：insertBefore 需要特殊处理
        this.outerWrap.insertBefore(this.wrap, this.canvas);
        this.wrap.appendChild(this.canvas);

        this.scrollMgr = new ScrollManager(this.wrap, this.canvas);
        this.trackChild(this.scrollMgr);       // 级联销毁

        this.sheetTabBar = new SheetTabBar(this.wrap, null);
        this.trackChild(this.sheetTabBar);      // 级联销毁 ← 之前遗漏！

        this.#initLayerSystem();
        this.#initCanvasSize();
        this.#bindEvents();
    }

    #bindEvents() {
        // 替代 window.addEventListener("resize", ...)
        this.trackEvent(window, EVENT_NAMES.RESIZE, () => {
            this.#initCanvasSize(this.#userWidth, this.#userHeight);
            this.requestRender();
        });
    }

    onDestroy() {
        if (this.#rafId != null) cancelAnimationFrame(this.#rafId);
        this.compositor.destroyAll();
        this.store.destroy();
        this.canvas = null;
        this.ctx = null;
    }
}
```

## 7. Workbook.destroy() 完整调用链

```
Workbook.destroy()
  │
  ├── activeSheet.bus.emit(WORKBOOK_DESTROY)   // 触发 DESTROY hook
  │
  ├── pluginManager.destroyAll()               // 销毁所有插件
  │     └── 各 Plugin.destroy()
  │           └── ValidationPortalManager.destroy() → DOMComponent 自动清理
  │           └── ContextMenuStrategy.destroy() → DOMComponent 自动清理
  │
  ├── eventHandler.destroy()                   // 销毁事件处理器
  │
  ├── editor.destroy()                         // EditorManager → 各 CellEditor.destroy()
  │
  ├── renderEngine.destroy()                   // DOMComponent
  │     ├── cancelAnimationFrame (onDestroy)
  │     ├── compositor.destroyAll() (onDestroy)
  │     ├── store.destroy() (onDestroy)
  │     ├── scrollMgr.destroy() ← 自动级联 (trackChild)
  │     │     ├── 移除 hBar/vBar/corner DOM
  │     │     ├── 移除注入的 <style>
  │     │     └── 移除所有事件监听器
  │     ├── sheetTabBar.destroy() ← 自动级联 (trackChild)
  │     │     ├── 移除 bar/addBtn/scrollWrap/tabs DOM
  │     │     ├── 移除注入的 <style>
  │     │     └── 移除所有事件监听器
  │     └── wrap.remove() ← DOMComponent 自动清理
  │
  └── formulaBar?.destroy()                    // DOMComponent
        ├── 移除 bar/cellRef/input DOM
        └── 移除所有事件监听器
```

## 8. 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/core/Disposable.js` | 基础生命周期基类 |
| `src/core/DOMComponent.js` | DOM 组件基类 |
| `src/styles/app.css` | 应用层样式（#wrap 布局等） |
| `src/ui/scrollbar.css` | 滚动条样式 |
| `src/ui/sheetTabBar.css` | Sheet Tab 样式 |
| `src/ui/formulaBar.css` | 公式栏样式 |
| `src/editor/editor.css` | 编辑器基础样式 + 变体 |
| `src/editor/contextMenu.css` | 右键菜单样式 |

### 修改文件

| 文件 | 改动说明 |
|------|----------|
| `src/render/RenderEngine.js` | 继承 DOMComponent；trackChild(sheetTabBar)；wrap 自动清理 |
| `src/ui/ScrollManager.js` | 继承 DOMComponent；`import './scrollbar.css'`；替换 DOM/事件管理；删除全局 flag |
| `src/ui/SheetTabBar.js` | 继承 DOMComponent；`import './sheetTabBar.css'`；替换 DOM/事件管理；删除全局 flag |
| `src/ui/FormulaBar.js` | 继承 DOMComponent；`import './formulaBar.css'`；替换 DOM/事件管理 |
| `src/editor/editors/CellEditor.js` | 继承 DOMComponent；`import './editor.css'`；删除硬编码 ID 和 style.cssText 拼接 |
| `src/editor/editors/TextEditor.js` | **删除** `getEditorId()` 覆写 |
| `src/editor/editors/NumericEditor.js` | **删除** `getEditorId()` + `getExtraCssText()`；新增 `getEditorCssClass()` |
| `src/editor/editors/DateEditor.js` | **删除** `getEditorId()` + `getExtraCssText()`；新增 `getEditorCssClass()` |
| `src/editor/editors/SelectEditor.js` | **删除** `getEditorId()` + `getExtraCssText()`；新增 `getEditorCssClass()` |
| `src/editor/strategies/ContextMenuStrategy.js` | 继承 DOMComponent；`import './contextMenu.css'` |
| `src/plugins/data-validation/ValidationPortalManager.js` | 继承 DOMComponent；替换 DOM 管理 |

## 9. 收益

| 维度 | 改进 |
|------|------|
| **资源安全** | 所有 DOM 元素、事件监听器、`<style>` 在 destroy 时自动清理，零泄漏 |
| **统一模式** | 所有 DOM 组件遵循 `DOMComponent` 的创建/销毁契约 |
| **防遗漏** | `trackChild()` 级联销毁确保子组件不被遗忘 |
| **多实例支持** | webpack 自动去重 + 移除硬编码 ID，同一页面可创建任意多个 Workbook |
| **样式可维护** | CSS 提取为独立 `.css` 文件，样式与逻辑彻底分离 |
| **代码简化** | 模块不再需要手写大量 `removeChild` / `removeEventListener` 样板代码 |
| **可测试性** | `isDisposed` 标志便于断言资源正确释放 |

## 10. 自测用例

### 10.1 Disposable 基类

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| D-01 | destroy 幂等 | 创建 Disposable 实例 | 连续调用 `destroy()` 两次 | 不抛异常；`isDisposed` 为 true；`onDestroy()` 仅被调用一次 |
| D-02 | trackEvent 自动清理 | 实例调用 `trackEvent(target, 'click', handler)` | 调用 `destroy()` | `target.removeEventListener('click', handler)` 被调用 |
| D-03 | trackChild 级联销毁 | 父实例 `trackChild(childA)` + `trackChild(childB)` | 调用父实例 `destroy()` | childA 和 childB 的 `destroy()` 均被调用；`isDisposed` 均为 true |
| D-04 | 多层级联销毁 | A → B → C 三层 trackChild 链 | 调用 A.destroy() | A、B、C 均被销毁，调用顺序为 A.onDestroy → B.destroy → C.destroy |
| D-05 | onDestroy 子类钩子 | 子类覆写 `onDestroy()` 设置标记 | 调用 `destroy()` | 子类的 `onDestroy()` 在事件清理和子对象销毁之前被调用 |
| D-06 | 已销毁实例不再 track | 实例已 `destroy()` | 调用 `trackEvent()` / `trackChild()` | 不抛异常（或抛出已销毁异常） |

### 10.2 DOMComponent 基类

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| DC-01 | createElement 跟踪 | 创建 DOMComponent 实例 | 调用 `createElement('div', {className:'test'}, parent)` | 返回 div 元素；div 已 append 到 parent；div 被跟踪 |
| DC-02 | destroy 移除跟踪的 DOM | `createElement` 创建了 3 个元素并 append 到 parent | 调用 `destroy()` | 3 个元素均从 DOM 树移除（`el.remove()` 被调用）；parent 的 children 为空 |
| DC-03 | injectStyle 注入与去重 | 创建 DOMComponent 实例 | 调用 `injectStyle('test-css', '.a{color:red}')` 两次 | `document.head` 中只有一个 `#test-css` 的 `<style>` 元素 |
| DC-04 | injectStyle destroy 清理 | 调用了 `injectStyle('test-css', ...)` | 调用 `destroy()` | `#test-css` 的 `<style>` 元素从 `document.head` 移除 |
| DC-05 | injectInstanceStyle 实例隔离 | 创建两个 DOMComponent 实例 A、B | A 调用 `injectInstanceStyle('ns', cssA)`；B 调用 `injectInstanceStyle('ns', cssB)` | `document.head` 中有两个 `<style>`：`#ns-{A.instanceId}` 和 `#ns-{B.instanceId}` |
| DC-06 | destroy 同时清理 DOM 和 style | createElement 创建元素 + injectStyle 注入样式 | 调用 `destroy()` | DOM 元素和 `<style>` 元素均被移除 |
| DC-07 | instanceId 唯一性 | 创建 3 个 DOMComponent 实例 | 比较各实例的 `instanceId` | 3 个 instanceId 互不相同 |

### 10.3 RenderEngine 销毁（P0 修复验证）

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| RE-01 | wrap div 移除 | 创建 RenderEngine（含 wrap div） | 调用 `renderEngine.destroy()` | `wrap` div 从 `outerWrap` 中移除 |
| RE-02 | sheetTabBar 级联销毁 | RenderEngine 创建了 SheetTabBar | 调用 `renderEngine.destroy()` | SheetTabBar 的 `destroy()` 被调用；tab bar DOM 被移除 |
| RE-03 | scrollMgr 级联销毁 | RenderEngine 创建了 ScrollManager | 调用 `renderEngine.destroy()` | ScrollManager 的 `destroy()` 被调用；滚动条 DOM 被移除 |
| RE-04 | resize 事件移除 | RenderEngine 绑定了 window resize | 调用 `renderEngine.destroy()` | `window.removeEventListener('resize', ...)` 被调用 |
| RE-05 | rAF 取消 | RenderEngine 有 pending rAF | 调用 `renderEngine.destroy()` | `cancelAnimationFrame` 被调用 |
| RE-06 | 完整销毁无残留 | 完整初始化 RenderEngine | 调用 `destroy()` | wrap、scrollbar、tabbar DOM 全部移除；无事件监听器残留 |

### 10.4 ScrollManager 销毁

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| SM-01 | 滚动条 DOM 移除 | 创建 ScrollManager（hBar/vBar/corner） | 调用 `destroy()` | hBar、vBar、corner 从 wrap 中移除 |
| SM-02 | `<style>` 移除 | ScrollManager 注入了 `cs-scrollbar-{instanceId}` | 调用 `destroy()` | 对应的 `<style>` 从 `document.head` 移除 |
| SM-03 | thumb 事件移除 | ScrollManager 绑定了 thumb mousedown | 调用 `destroy()` | thumb 上的 mousedown 监听被移除 |
| SM-04 | wheel 事件移除 | ScrollManager 绑定了 wheel 事件 | 调用 `destroy()` | wrap 上的 wheel 监听被移除 |
| SM-05 | 多实例样式隔离 | 创建两个 ScrollManager A、B | A.destroy() | A 的 `<style>` 移除；B 的 `<style>` 不受影响；B 的滚动条正常工作 |

### 10.5 SheetTabBar 销毁

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| ST-01 | tab bar DOM 移除 | 创建 SheetTabBar | 调用 `destroy()` | bar 元素从 wrap 中移除 |
| ST-02 | `<style>` 移除 | SheetTabBar 注入了样式 | 调用 `destroy()` | 对应的 `<style>` 从 `document.head` 移除 |
| ST-03 | 事件监听器移除 | SheetTabBar 绑定了 click/wheel 事件 | 调用 `destroy()` | 所有事件监听器被移除 |
| ST-04 | 多实例样式隔离 | 创建两个 SheetTabBar A、B | A.destroy() | A 的 `<style>` 移除；B 正常工作 |

### 10.6 CellEditor 销毁与多实例

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| CE-01 | 编辑器 DOM 移除 | 创建 CellEditor 并 `createEditor()` | 调用 `destroy()` | 编辑器 `<input>` / `<select>` 从 DOM 树移除 |
| CE-02 | 编辑器事件移除 | CellEditor 绑定了 blur/keydown/composition 事件 | 调用 `destroy()` | 所有事件监听器被移除 |
| CE-03 | 编辑器无 id 属性 | 创建 CellEditor 并 `createEditor()` | 检查编辑器元素 | 编辑器元素**无** `id` 属性（`getEditorId()` 已彻底删除） |
| CE-04 | 编辑器使用 CSS class | 创建 TextEditor 并 `createEditor()` | 检查编辑器元素 | 编辑器有 `cs-cell-editor` class |
| CE-05 | NumericEditor CSS class | 创建 NumericEditor 并 `createEditor()` | 检查编辑器元素 | 编辑器有 `cs-cell-editor cs-cell-editor--numeric` class |
| CE-06 | DateEditor CSS class | 创建 DateEditor 并 `createEditor()` | 检查编辑器元素 | 编辑器有 `cs-cell-editor cs-cell-editor--date` class |
| CE-07 | SelectEditor CSS class | 创建 SelectEditor 并 `createEditor()` | 检查编辑器元素 | 编辑器有 `cs-cell-editor cs-cell-editor--select` class |
| CE-08 | 编辑器 `<style>` 实例隔离 | 创建两个 CellEditor A、B | A.destroy() | A 的编辑器 `<style>` 移除；B 的编辑器样式正常 |
| CE-09 | EditorManager 销毁所有编辑器 | EditorManager 含 text/numeric/date/select 编辑器 | 调用 `editorManager.destroy()` | 所有编辑器的 `destroy()` 被调用；所有编辑器 DOM 被移除 |

### 10.7 FormulaBar 销毁

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| FB-01 | 公式栏 DOM 移除 | 创建 FormulaBar | 调用 `destroy()` | bar 元素从 container 中移除 |
| FB-02 | 事件监听器移除 | FormulaBar 绑定了 keydown/focus 事件 | 调用 `destroy()` | input 上的 keydown 和 focus 监听器被移除 |

### 10.8 ContextMenuStrategy 销毁

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| CM-01 | 菜单 DOM 移除 | 创建并 init ContextMenuStrategy | 调用 `destroy()` | menuEl 从 `document.body` 移除 |
| CM-02 | 菜单样式清理 | ContextMenuStrategy 注入了 `ctx-menu` 样式 | 调用 `destroy()` | 对应的 `<style>` 被移除 |

### 10.9 Workbook 端到端销毁

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| WB-01 | 完整销毁无 DOM 残留 | `new Workbook(id).initRender()` 完整初始化 | 调用 `workbook.destroy()` | `outerWrap` 内无子元素（wrap 已移除）；`document.head` 无本项目注入的 `<style>` |
| WB-02 | 完整销毁无事件残留 | 完整初始化 Workbook | 调用 `workbook.destroy()` | window 上无 resize 监听器；document 上无多余监听器 |
| WB-03 | 销毁幂等 | 完整初始化 Workbook | 连续调用 `workbook.destroy()` 两次 | 不抛异常 |
| WB-04 | 销毁后引用清空 | 完整初始化 Workbook | 调用 `workbook.destroy()` | `workbook.renderEngine` 为 null；`workbook.editor` 为 null；`workbook.eventHandler` 为 null；`workbook.sheets` 为空 |

### 10.10 多实例隔离

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| MI-01 | 两个 Workbook 独立初始化 | 页面两个容器元素 containerA、containerB | `new Workbook('A').initRender()` + `new Workbook('B').initRender()` | 两个 Workbook 各自创建独立的 wrap/scrollbar/tabbar/editor |
| MI-02 | 两个 Workbook 的 `<style>` 互不干扰 | 两个 Workbook 均初始化 | 检查 `document.head` | 存在两组 `<style>`，ID 分别带 `-wb-1` 和 `-wb-2` 后缀 |
| MI-03 | 销毁一个不影响另一个 | 两个 Workbook 均初始化 | 调用 `workbookA.destroy()` | workbookA 的所有 DOM 和 `<style>` 移除；workbookB 正常显示、滚动、编辑功能不受影响 |
| MI-04 | 编辑器无 ID 冲突 | 两个 Workbook 均初始化 | 双击 workbookA 的单元格 + 双击 workbookB 的单元格 | 两个编辑器同时显示，无 DOM ID 冲突 |
| MI-05 | 连续创建销毁不泄漏 | 循环 5 次：创建 Workbook → initRender → destroy | 每次循环后检查 | `document.head` 中无累积的 `<style>` 元素；`outerWrap` 内无残留 DOM |
| MI-06 | 右键菜单多实例隔离 | 两个 Workbook 均初始化 | 在 workbookA 右键弹出菜单 → 在 workbookB 右键弹出菜单 | 两个菜单独立显示，样式互不影响 |

### 10.11 CSS 提取回归

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|:----:|---------|---------|---------|----------|
| CSS-01 | 滚动条样式正确 | 提取 CSS 常量后初始化 ScrollManager | 视觉检查滚动条 | 滚动条外观与提取前一致（位置、颜色、圆角） |
| CSS-02 | Sheet Tab 样式正确 | 提取 CSS 常量后初始化 SheetTabBar | 视觉检查 tab bar | Tab 外观与提取前一致（active 状态、hover 效果、关闭按钮） |
| CSS-03 | 编辑器样式正确 | 改用 CSS class 后双击单元格 | 视觉检查编辑器 | 编辑器边框、字体、背景色与提取前一致 |
| CSS-04 | NumericEditor 右对齐 | 改用 CSS class 后双击数字列单元格 | 视觉检查编辑器 | 编辑器内文本右对齐 |
| CSS-05 | 右键菜单样式正确 | 提取 CSS 常量后右键弹出菜单 | 视觉检查菜单 | 菜单外观、hover 效果、分隔线与提取前一致 |
| CSS-06 | 公式栏样式正确 | 提取 CSS 常量后显示公式栏 | 视觉检查公式栏 | 公式栏外观与提取前一致 |

### 10.12 测试文件规划

| 测试文件 | 覆盖范围 | 对应章节 |
|---------|---------|----------|
| `tests/core/Disposable.test.js` | D-01 ~ D-06 | 3.2 Disposable 基类 |
| `tests/core/DOMComponent.test.js` | DC-01 ~ DC-07 | 3.3 DOMComponent 基类 |
| `tests/render/RenderEngine.destroy.test.js` | RE-01 ~ RE-06 | 6.3 RenderEngine 迁移 |
| `tests/ui/ScrollManager.destroy.test.js` | SM-01 ~ SM-05 | 6.1 ScrollManager 迁移 |
| `tests/ui/SheetTabBar.destroy.test.js` | ST-01 ~ ST-04 | 6.1 SheetTabBar 迁移 |
| `tests/editor/CellEditor.destroy.test.js` | CE-01 ~ CE-09 | 6.1 CellEditor 迁移 |
| `tests/ui/FormulaBar.destroy.test.js` | FB-01 ~ FB-02 | 6.1 FormulaBar 迁移 |
| `tests/editor/ContextMenuStrategy.destroy.test.js` | CM-01 ~ CM-02 | 6.1 ContextMenuStrategy 迁移 |
| `tests/workbook/Workbook.destroy.test.js` | WB-01 ~ WB-04 | 7 Workbook.destroy() 调用链 |
| `tests/integration/MultiInstance.test.js` | MI-01 ~ MI-06 | 5 编辑器多实例支持 |

## 11. 实施步骤

1. **配置 webpack CSS rule**：添加 `css-loader` + `style-loader` 规则（已完成）
2. **创建基类**：`Disposable.js` + `DOMComponent.js`，编写单元测试
3. **提取 CSS 文件**：创建 `scrollbar.css`、`sheetTabBar.css`、`formulaBar.css`、`editor.css`、`contextMenu.css`
4. **P0 修复**：迁移 RenderEngine，补全 `sheetTabBar.destroy()` + `wrap` 移除
5. **P1 迁移**：ScrollManager + SheetTabBar（`import './xxx.css'` + 替换 DOM/事件管理）
6. **P2 迁移**：FormulaBar + CellEditor（`import './xxx.css'` + 删除硬编码 ID，改用 CSS class）
7. **P2.1**：更新 TextEditor / NumericEditor / DateEditor / SelectEditor（删除 `getEditorId()`，改用 `getEditorCssClass()`）
8. **P3 迁移**：ContextMenuStrategy + ValidationPortalManager
9. **多实例验证**：编写多实例测试用例，验证同一页面多个 Workbook 互不干扰
10. 每次迁移后运行全量测试验证无回归

## 12. 注意事项

- **彻底重构**：本项目为新项目，无需向后兼容。`getEditorId()`、`getExtraCssText()`、`getDefaultTextAlign()` 等旧 API 直接删除，不保留不标记 deprecated
- **模块级 flag 彻底删除**：`scrollbarStyleInjected`、`sheetTabStyleInjected` 等全局 flag 随旧代码一起删除，由 `import './xxx.css'` 替代（webpack 自动去重）
- **CSS 文件 vs 运行时注入**：静态组件样式使用 `.css` 文件（webpack 去重，多实例共享）；仅当需要 destroy 时严格清理 `<style>` 的场景才改用 `injectInstanceStyle()` 运行时注入
- **`createElement` 灵活性**：对于 `insertBefore` 等非 append 场景，可先创建元素再手动插入，元素仍被跟踪
- **CSS 变量**：`CONFIG.SELECTION_COLOR` 等动态值改为 CSS 变量 `var(--cs-selection-color)`，在应用层设置
- **Canvas 元素**：BaseLayer / Tile 创建的 canvas 由 canvas 池管理，暂不纳入本次迁移范围
