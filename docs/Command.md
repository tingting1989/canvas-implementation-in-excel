# Command — 命令模式基类

## 概述

`Command` 是命令模式（Command Pattern）的抽象基类，为所有可撤销操作提供统一的 `redo()/undo()` 接口。所有具体命令（`SetCellCommand`、`BatchCommand`、`MergeCommand` 等）均继承自此基类。

## 文件位置

```
src/model/command/Command.js
```

## 设计意图

- **撤销/重做基础**：所有操作封装为命令对象，通过 `HistoryStack` 管理，支持任意次数的 undo/redo。
- **统一接口**：`redo()` 执行操作，`undo()` 撤销操作，子类只需实现这两个方法。
- **命令组合**：`BatchCommand` 将多个子命令组合为一个原子操作，一次撤销即可恢复整个批量修改。

## 类结构

```js
class Command {
    redo() {}   // 执行操作
    undo() {}   // 撤销操作
}
```

`Command` 本身是一个极简的抽象基类，仅定义了接口契约，不包含任何实现逻辑。

---

## 子类实现规范

### 必须实现的方法

| 方法 | 说明 |
|------|------|
| `redo()` | 执行命令所代表的操作 |
| `undo()` | 撤销命令所代表的操作，恢复到执行前的状态 |

### 实现要点

1. **`redo()` 和 `undo()` 必须互为逆操作**：调用 `redo()` 后立即 `undo()` 应完全恢复到原始状态。
2. **命令应自包含**：命令对象应在构造时保存执行所需的所有信息（如目标单元格、旧值、新值等）。
3. **幂等性**：连续多次 `redo()` 或 `undo()` 不应产生副作用（通过 `HistoryStack` 的指针管理保证不会发生）。

---

## 命令体系

```
Command (抽象基类)
    │
    ├── SetCellCommand       设置单元格值
    │     ├── redo() → cellStore.set(r, c, newCell)
    │     └── undo() → cellStore.set(r, c, oldCell)
    │
    ├── ToggleDisableCommand 切换单元格禁用状态
    │     ├── redo() → 切换为相反状态
    │     └── undo() → 恢复原状态
    │
    ├── BatchCommand         批量命令（组合多个子命令）
    │     ├── redo() → 正序执行所有子命令
    │     └── undo() → 逆序撤销所有子命令
    │
    ├── MergeCommand         合并单元格
    │     ├── redo() → 执行合并
    │     └── undo() → 取消合并
    │
    └── UnmergeCommand       取消合并单元格
          ├── redo() → 取消合并
          └── undo() → 恢复合并
```

---

## 使用示例

### 直接使用子类命令

```js
import { SetCellCommand } from "./model/command/SetCellCommand.js";

// 创建命令（保存旧值和新值）
const cmd = new SetCellCommand(cellStore, row, col, oldCell, newCell);

// 执行
cmd.redo();   // cellStore 中写入 newCell

// 撤销
cmd.undo();   // cellStore 中恢复 oldCell
```

### 通过 HistoryStack 管理

```js
const history = new HistoryStack();

// 每次操作推入历史栈
history.push(cmd);    // 自动调用 cmd.redo()

// 撤销
history.undo();       // 调用最近命令的 undo()

// 重做
history.redo();       // 调用已撤销命令的 redo()
```

---

## 与相关模块的关系

```
Sheet
    ├── history: HistoryStack
    │     ├── commands: Command[]    ← 命令栈
    │     │     ├── SetCellCommand
    │     │     ├── BatchCommand
    │     │     │     └── commands: SetCellCommand[]
    │     │     ├── MergeCommand
    │     │     └── ToggleDisableCommand
    │     ├── undo()                 ← 撤销最近命令
    │     └── redo()                 ← 重做最近撤销
    │
    └── beginBatch() / endBatch()
          └── 批量操作 → 合并为 BatchCommand → 推入 history
```

---

## 扩展指南

### 创建自定义命令

```js
import { Command } from "./Command.js";

export class MyCustomCommand extends Command {
    /**
     * @param {ChunkedCellStore} store
     * @param {number} row
     * @param {number} col
     * @param {*} oldValue  - 操作前的值
     * @param {*} newValue  - 操作后的值
     */
    constructor(store, row, col, oldValue, newValue) {
        super();
        this.store = store;
        this.row = row;
        this.col = col;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    redo() {
        // 执行自定义操作
        this.store.set(this.row, this.col, this.newValue);
    }

    undo() {
        // 恢复为操作前的状态
        this.store.set(this.row, this.col, this.oldValue);
    }
}
```
