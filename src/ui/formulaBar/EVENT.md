# FormulaBar 事件与数据流详解

## 整体架构

```text
┌─────────────────────────────────────────────────────────────────┐
│                        DOM 层级                                  │
│                                                                  │
│  document                                                        │
│  └── container                                                   │
│      └── <formula-bar>          ← FormulaBarElement (Web Component) │
│          └── #shadow-root                                        │
│              ├── <div class="cell-ref">A1</div>                  │
│              └── <input class="formula-input">                   │
│                                                                  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                                  │
│  FormulaBarManager (逻辑层)  ←──监听──  FormulaBarElement (UI层) │
│       │                              ↑                           │
│       │                              │ emit()                    │
│       ↓                              │                           │
│    Workbook                       用户操作                       │
│   (数据源)                      (键盘/焦点)                      │
└─────────────────────────────────────────────────────────────────┘
```

## 一、事件流：从用户操作到数据写入

FormulaBarElement 是纯 UI 层，只负责渲染和派发事件；FormulaBarManager 是逻辑层，负责监听事件并与 Workbook 交互。

### 1. 键盘事件拦截（原生 DOM 事件 → 阻止冒泡）

```text
用户按键 → <input> keydown → 冒泡到 <formula-bar>
                                    │
                                    ▼
                    disposable.trackEvent(this, "keydown", (e) => e.stopPropagation())
                                    │
                                    ▼
                    事件不再冒泡到 document，KeyboardStrategy 无法拦截
```

这是之前修复的焦点丢失问题的关键：如果不 stopPropagation()，keydown 会冒泡到 document，被 KeyboardStrategy 捕获，触发单元格编辑器打开，导致公式栏失去焦点。

### 2. 自定义事件派发（FormulaBarElement → FormulaBarManager）

用户在 <input> 中的操作被 #handleKeydown 转化为自定义事件：

```text
用户操作              #handleKeydown 处理              emit() 派发
─────────            ──────────────────              ──────────────
按 Enter    ──→  e.preventDefault()  ──→  emit("commit", { value })
按 Escape   ──→  e.preventDefault()  ──→  emit("cancel")
按 Tab      ──→  e.preventDefault()  ──→  emit("commit-and-move", { value, direction })
```

emit() 内部调用 this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))，事件穿透 Shadow DOM 冒泡到 <formula-bar> 宿主元素上。

### 3. 焦点事件

```text
用户操作              处理函数                    emit() 派发
─────────            ──────────                 ──────────────
input 获得焦点  ──→  #handleFocus              ──→  emit("start-edit")
                     e.target.select()               (通知 Manager 记录原始值)
                     setAttribute("editing", "")

input 失去焦点  ──→  #handleBlur
                     如果仍有 editing 属性:
                       emit("cancel")               (失焦 = 取消)
                     removeAttribute("editing")
```

### 4. FormulaBarManager 监听与响应

```javascript
// Manager 通过 trackEvent 监听 Element 派发的自定义事件
this.trackEvent(this.#element, "commit", (e) => this.#commitValue(e.detail.value));
this.trackEvent(this.#element, "cancel", () => this.#cancelEdit());
this.trackEvent(this.#element, "commit-and-move", (e) => {
    this.#commitValue(e.detail.value);
    this.#moveToCell(e.detail.direction);
});
this.trackEvent(this.#element, "start-edit", () => {
    this.#originalValue = this.#element.getValue();
});
```

每个事件的处理逻辑：

| 事件              | Manager 响应                                            | 数据变更                         |
| ----------------- | ------------------------------------------------------- | -------------------------------- |
| `commit`          | `#commitValue(value)` — 比较新旧值，不同则写入 Workbook | `sheet.setCell(row, col, value)` |
| `cancel`          | `#cancelEdit()` — 恢复原始值，焦点回到 Canvas           | 无数据变更                       |
| `commit-and-move` | 先 `#commitValue`，再 `#moveToCell(direction)`          | 写入 + 选区移动                  |
| `start-edit`      | 记录 `#originalValue`                                   | 无数据变更，仅快照               |

## 二、数据流：从 Workbook 到 UI 显示

```text
Workbook 数据变更（选区移动、单元格修改等）
        │
        ▼
外部调用 manager.update()
        │
        ▼
┌───────────────────────────────────────────────────┐
│ 1. 获取活动工作表和选区焦点                          │
│    sheet.selection.getFocus() → [row, col]         │
│                                                    │
│ 2. 计算单元格引用标签                                │
│    indexToCol(col) + (row + 1) → "A1"             │
│                                                    │
│ 3. 读取单元格值                                     │
│    cell.formula ?? cell.value ?? ""                │
│                                                    │
│ 4. 更新 Element                                    │
│    element.setAttribute("cell-ref", "A1")          │
│    element.setValue("=SUM(A1:A10)")                │
│    element.#originalValue = value                   │
└───────────────────────────────────────────────────┘
        │
        ▼
FormulaBarElement.render() 被触发
        │
        ▼
Shadow DOM 更新：
  <div class="cell-ref">A1</div>
  <input class="formula-input" value="=SUM(A1:A10)">
```

## 三、完整交互时序图

```text
时间 ──────────────────────────────────────────────────────────→

用户        FormulaBarElement              FormulaBarManager           Workbook
 │                │                              │                      │
 │  点击公式栏     │                              │                      │
 │───────────────→│                              │                      │
 │                │ input.focus()                │                      │
 │                │ #handleFocus()               │                      │
 │                │  → select() 全选文本          │                      │
 │                │  → setAttribute("editing")   │                      │
 │                │  → emit("start-edit") ──────→│                      │
 │                │                              │ #originalValue = ""   │
 │                │                              │                      │
 │  输入 H e l l o│                              │                      │
 │───────────────→│ (原生 input 事件，无自定义事件) │                      │
 │                │                              │                      │
 │  按 Enter      │                              │                      │
 │───────────────→│ #handleKeydown(e)            │                      │
 │                │  → e.preventDefault()        │                      │
 │                │  → emit("commit", ──────────→│                      │
 │                │     { value: "Hello" })      │ #commitValue("Hello")│
 │                │                              │ "Hello" !== "" → 写入 │
 │                │                              │──────────────────────→│
 │                │                              │                      │ sheet.setCell(0,0,"Hello")
 │                │                              │──────────────────────→│
 │                │                              │ renderEngine.render() │
 │                │                              │──────────────────────→│
 │                │                              │                      │
 │                │                              │ #originalValue="Hello"│
```

## 四、关键设计决策

| 决策                                                               | 原因                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Element 用 `emit()` 派发自定义事件，Manager 用 `trackEvent()` 监听 | 解耦 UI 与逻辑，Element 不知道 Workbook 的存在       |
| `keydown` 在宿主元素上 `stopPropagation()`                         | 防止事件冒泡到 document 被 KeyboardStrategy 拦截     |
| 事件名提取为 `FORMULA_BAR_EVENTS` 常量                             | 避免硬编码字符串，派发端和监听端引用同一常量         |
| Manager 继承 `Disposable` 而非 `DOMComponent`                      | Manager 不需要创建/管理 DOM，只需要事件自动解绑      |
| `#originalValue` 快照                                              | cancel 时可以恢复原始值，commit 时可以跳过无变更写入 |
| `composed: true`                                                   | 事件穿透 Shadow DOM，Manager 可以在宿主元素上监听    |
