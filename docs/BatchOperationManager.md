# BatchOperationManager — 批量操作管理器

## 概述

`BatchOperationManager` 负责管理单元格操作命令的批量提交。在批量模式下，多个 `setCell` / `disableCell` / `enableCell` 产生的命令会被暂存，批量结束时合并为一个 `BatchCommand` 推入历史栈，确保粘贴、剪切、自动填充等多单元格操作可以**一键撤销**。

## 文件位置

```
src/workbook/BatchOperationManager.js
```

## 设计意图

- **一键撤销**：粘贴 100 个单元格后按 Ctrl+Z，一次撤销全部，而不是撤销 100 次。
- **透明切换**：通过 `pushCommand` 统一入口，调用方无需关心是否处于批量模式。
- **防御空操作**：`endBatch` 在没有子命令时不推入历史栈，避免产生无意义的空 `BatchCommand`。
- **与 Sheet 解耦**：将批量状态管理从 `Sheet` 中独立出来，降低 `Sheet` 的职责复杂度。

## 工作原理

### 非批量模式（默认）

```
setCell() → pushCommand(cmd, history) → history.push(cmd)   ← 直接推入历史栈
```

每次操作独立推入历史栈，撤销时逐条回退。

### 批量模式

```
beginBatch()                       ← 进入批量模式，清空队列
  setCell() → pushCommand → 暂存到 #batchCommands
  setCell() → pushCommand → 暂存到 #batchCommands
  ...
endBatch(history)                  ← 合并所有子命令为 BatchCommand，一次性推入历史栈
```

## API

### `beginBatch()`

进入批量模式，清空命令暂存队列。之后所有 `pushCommand` 调用会将命令暂存而非直接推入历史栈。

```js
sheet.beginBatch();
// 后续操作将被批量暂存...
```

### `endBatch(history)`

退出批量模式，将暂存的子命令合并为 `BatchCommand` 推入历史栈。若队列为空则无操作。

```js
sheet.endBatch();
// 如果期间有操作，现在它们合并为一个可撤销单元
```

### `pushCommand(cmd, history)`

推入一条命令的核心方法。批量模式下暂存到内部队列，非批量模式下直接推入 `history`。

```js
// 内部使用，由 setCell / disableCell / enableCell 调用
this.#batchOp.pushCommand(cmd, this.history);
```

### `inBatch` (getter)

只读属性，返回当前是否处于批量模式。

```js
if (sheet.batchOp.inBatch) {
    // 当前处于批量模式
}
```

## 生命周期

```
┌─────────────┐    beginBatch()    ┌─────────────┐
│  非批量模式  │ ─────────────────→ │  批量模式    │
│  (默认状态)  │                    │  (暂存命令)  │
└─────────────┘                    └──────┬──────┘
       ↑                                  │
       └─────────── endBatch() ───────────┘
                                          │
                              (合并为 BatchCommand 推入历史栈)
```

## 调用方

该方法被以下模块使用，均通过 Sheet 暴露的公有 API 间接调用：

| 调用方 | 场景 |
|--------|------|
| `ClipboardManager` | 粘贴 / 剪切多单元格时批量提交 |
| `TextEditor` | 文本编辑器确认更新时批量提交 |
| `AutoFillStrategy` | 自动填充多单元格时批量提交 |
| `ContextMenuStrategy` | 右键菜单操作（如清除内容）批量提交 |
| `KeyboardStrategy` | 键盘快捷键触发的多单元格操作批量提交 |
| `CopyPastePlugin` | 插件层复制粘贴批量提交 |

## 与 Sheet 的关系

`Sheet` 持有 `BatchOperationManager` 实例，通过薄代理方法暴露批量操作入口：

```js
// Sheet.js
#batchOp = new BatchOperationManager();

beginBatch() {
    this.#batchOp.beginBatch();
}

endBatch() {
    this.#batchOp.endBatch(this.history);
}
```

`setCell` / `disableCell` / `enableCell` 通过 `#batchOp.pushCommand(cmd, this.history)` 统一推入命令，无需再判断 `#inBatch` 状态。
