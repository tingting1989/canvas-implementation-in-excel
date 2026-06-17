# BatchCommand — 批量命令

## 概述

`BatchCommand` 继承自 `Command`，将多个子命令组合为一个原子操作。用于粘贴、剪切、自动填充等一次操作修改多个单元格的场景。undo/redo 时按逆序/正序依次执行所有子命令，保证一次性撤销/重做整个批量操作。

## 文件位置

```
src/model/command/BatchCommand.js
```

## 设计意图

- **原子性**：将多个独立的单元格操作打包为一个不可分割的批量操作。
- **一次撤销**：用户执行粘贴等操作后，一次 `Ctrl+Z` 即可恢复所有被修改的单元格。
- **逆序撤销**：`undo()` 时按子命令注册的逆序执行，确保状态恢复的正确性。
- **批量优化**：`Sheet.beginBatch()/endBatch()` 自动收集子命令并包装为 `BatchCommand`。

## 类结构

```js
class BatchCommand extends Command {
    commands: Command[]    // 子命令列表

    constructor(commands)  // 接收子命令数组
    redo()                 // 正序执行所有子命令
    undo()                 // 逆序撤销所有子命令
}
```

---

## API 参考

### constructor(commands)

创建批量命令实例。

```js
const batch = new BatchCommand([
    new SetCellCommand(store, 0, 0, oldCellA, newCellA),
    new SetCellCommand(store, 0, 1, oldCellB, newCellB),
    new SetCellCommand(store, 1, 0, oldCellC, newCellC),
]);
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `commands` | `Command[]` | 子命令列表，按操作顺序排列 |

### redo()

正序执行所有子命令。

```js
batch.redo();
// 等价于：
//   commands[0].redo()
//   commands[1].redo()
//   commands[2].redo()
```

### undo()

逆序撤销所有子命令。

```js
batch.undo();
// 等价于：
//   commands[2].undo()
//   commands[1].undo()
//   commands[0].undo()
```

> **为什么逆序撤销？** 如果子命令之间存在依赖关系（如同一单元格被多次修改），逆序撤销能确保恢复到操作前的正确状态。虽然当前场景中每个子命令通常操作不同的单元格，但逆序是最安全的撤销策略。

---

## 使用场景

### 场景 1：粘贴操作

用户复制 3 行 × 2 列的数据粘贴到表格中，涉及 6 个单元格的修改：

```js
// ClipboardManager.#pasteText / #pasteInternal
sheet.beginBatch();                    // 进入批量模式

sheet.setCell(0, 0, "A1");            // 子命令暂存到 #batchCommands
sheet.setCell(0, 1, "B1");            // 子命令暂存
sheet.setCell(1, 0, "A2");            // 子命令暂存
sheet.setCell(1, 1, "B2");            // 子命令暂存
sheet.setCell(2, 0, "A3");            // 子命令暂存
sheet.setCell(2, 1, "B3");            // 子命令暂存

sheet.endBatch();                      // 合并为 BatchCommand → 推入 history
// 用户一次 Ctrl+Z 即可撤销全部 6 个修改
```

### 场景 2：剪切操作

剪切时先复制选区，再清空所有单元格：

```js
// CopyPastePlugin.cut()
sheet.beginBatch();
for (const { row, col } of changes) {
    sheet.setCell(row, col, "");       // 每个单元格一个 SetCellCommand
}
sheet.endBatch();                      // 合并为 BatchCommand
// 一次撤销恢复所有被剪切的内容
```

### 场景 3：批量填充

用户在选中的区域输入值，blur 时填充整个选区：

```js
// TextEditor.#batchFill()
sheet.beginBatch();
for (const { row, col, newValue } of changes) {
    sheet.setCell(row, col, newValue);
}
sheet.endBatch();                      // 合并为 BatchCommand
```

---

## Sheet 批量模式机制

`Sheet` 提供了 `beginBatch()/endBatch()` 方法，在批量模式下 `setCell()` 产生的命令会自动暂存：

```js
// Sheet.js
beginBatch() {
    this.#inBatch = true;
    this.#batchCommands = [];
}

endBatch() {
    this.#inBatch = false;
    const commands = this.#batchCommands;
    this.#batchCommands = [];
    if (commands.length > 0) {
        this.history.push(new BatchCommand(commands));
    }
}

// setCell() 在批量模式下
setCell(r, c, value, styleId) {
    // ...
    const cmd = new SetCellCommand(this.cellStore, realR, c, old, cell);
    if (this.#inBatch) {
        this.#batchCommands.push(cmd);  // 暂存，不直接推入 history
    } else {
        this.history.push(cmd);          // 直接推入 history
    }
    // ...
}
```

**批量模式时序**：

```
beginBatch()
    │
    ├── setCell(0, 0, "A") → cmd1 暂存
    ├── setCell(0, 1, "B") → cmd2 暂存
    ├── setCell(1, 0, "C") → cmd3 暂存
    │
    ▼
endBatch()
    │
    ├── 创建 BatchCommand([cmd1, cmd2, cmd3])
    └── history.push(batchCommand)
         │
         ▼
    Ctrl+Z → batchCommand.undo()
              ├── cmd3.undo()  (逆序)
              ├── cmd2.undo()
              └── cmd1.undo()
```

---

## 与相关模块的关系

```
Sheet
    ├── beginBatch()        进入批量模式
    ├── endBatch()          退出批量模式 → 创建 BatchCommand
    └── history: HistoryStack
          └── commands: Command[]
                ├── SetCellCommand       单单元格修改
                ├── BatchCommand         批量操作
                │     └── commands: SetCellCommand[]
                ├── MergeCommand         合并单元格
                ├── UnmergeCommand       取消合并
                └── ToggleDisableCommand 禁用切换

ClipboardManager
    └── #pasteText / #pasteInternal
          └── sheet.beginBatch() ... sheet.endBatch()
                └── BatchCommand → history

CopyPastePlugin
    └── cut()
          └── sheet.beginBatch() ... sheet.endBatch()
                └── BatchCommand → history

TextEditor
    └── #batchFill()
          └── sheet.beginBatch() ... sheet.endBatch()
                └── BatchCommand → history
```
