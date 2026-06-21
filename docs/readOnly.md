# readOnly — 只读模式

## 概述

`readOnly` 是工作表层级的只读开关，设置为 `true` 后禁止所有数据修改操作。与单元格级别的 `disabled` / `readOnly` 不同，`readOnly` 作用于整个 Sheet，是最高优先级的写保护。

## 文件位置

```
src/workbook/Sheet.js           — #readOnly 属性 + #ensureWritable() 拦截层
src/workbook/SettingsApplier.js — 配置入口
src/editor/EditorManager.js     — 编辑器入口拦截（UI 层）
src/editor/strategies/KeyboardStrategy.js  — 键盘输入拦截（UI 层）
src/editor/strategies/ContextMenuStrategy.js — 右键菜单过滤（UX 层）
```

## 设计意图

- **唯一真相来源**：所有数据修改最终都经过 `Sheet` 的 API 方法，在方法入口处通过 `#ensureWritable()` 统一拦截，无论从 UI、插件还是程序化调用进入，都会被拦截。
- **双层防线**：底层（Sheet API）拦截所有数据修改，上层（UI 层）仅额外阻止编辑器弹出和键盘直接输入，提前消除无意义的 UI 交互。
- **零侵入**：21 个数据修改方法各加一行 `if (!this.#ensureWritable()) return;`，不影响原有逻辑。

## 架构

```
用户操作
  │
  ▼
┌─ UI 层（阻止编辑器弹出 + 直接输入）──┐
│  EditorManager.show()                  │
│  KeyboardStrategy: Enter/F2, 直接输入  │
│  ContextMenuStrategy: 隐藏编辑菜单项    │
└────────────────────────────────────────┘
  │ 其他所有操作直接放行
  ▼
┌─ 底层防线（Sheet API — 唯一真相来源）──┐
│  #ensureWritable() 拦截 21 个方法       │
└────────────────────────────────────────┘
```

## 与 `disabled` / `readOnly` 的区别

| 维度 | `sheet.readOnly` | `cell.disabled` / `cell.readOnly` |
|------|------------------|-----------------------------------|
| 作用域 | 整个 Sheet | 单个单元格 |
| 判断位置 | Sheet API 方法入口 | `isDisabled(r, c)` 查询 |
| 优先级 | 最高（覆盖所有单元格） | 单元格级别 |
| 仍可导航 | 是 | 是 |
| 仍可复制 | 是 | 是 |

## 配置方式

### 方式一：初始化时设置（推荐）

```js
const wb = new Workbook("grid", {
    sheets: [
        {
            name: "Sheet1",
            readOnly: true,
            data: [
                ["Zhang San", 25, "Beijing"],
                ["Li Si", 30, "Shanghai"],
            ],
        },
    ],
});
```

### 方式二：运行时动态切换

```js
const sheet = wb.getActiveSheet();
sheet.readOnly = true;   // 进入只读模式
sheet.readOnly = false;  // 恢复编辑模式
```

### 方式三：通过 `updateSettings()` 批量更新

```js
wb.updateSettings({ readOnly: true });
```

## 被拦截的操作

### 底层防线（Sheet API — 21 个方法）

| 分类 | 方法 | 说明 |
|------|------|------|
| 单元格值 | `setCell()` | 设置单元格值 |
| 单元格禁用 | `disableCell()` | 禁用单元格 |
| 单元格启用 | `enableCell()` | 启用单元格 |
| 样式 | `setRowStyle()` | 设置行样式 |
| 样式 | `setColStyle()` | 设置列样式 |
| 样式 | `setCellStyle()` | 设置单元格样式 |
| 样式 | `clearCellStyle()` | 清除单元格样式 |
| 样式 | `clearRowStyle()` | 清除行样式 |
| 样式 | `clearColStyle()` | 清除列样式 |
| 样式 | `setRangeStyle()` | 设置区域样式 |
| 数据 | `loadData()` | 加载数据 |
| 合并 | `mergeCells()` | 合并单元格 |
| 合并 | `unmergeCells()` | 取消合并 |
| 撤销 | `undo()` | 撤销 |
| 重做 | `redo()` | 重做 |
| 行列 | `insertRow()` | 插入行 |
| 行列 | `insertCol()` | 插入列 |
| 行列 | `deleteRow()` | 删除行 |
| 行列 | `deleteCol()` | 删除列 |
| 行列 | `moveCol()` | 移动列 |
| 行列 | `moveRow()` | 移动行 |

### UI 层（编辑器入口）

| 入口 | 行为 |
|------|------|
| 双击单元格 | 不进入编辑 |
| Enter / F2 | 不进入编辑 |
| 直接输入字符 | 不触发批量赋值 |
| 右键菜单 | 隐藏插入/删除/合并/清除等编辑项 |

## 保留的只读操作

以下操作在只读模式下**仍然可用**（与 Excel 行为一致）：

| 操作 | 说明 |
|------|------|
| 点击选择 | 鼠标点击选中单元格 |
| 拖拽选择 | 拖拽选择区域 |
| Ctrl+A | 全选 |
| 方向键 | 导航 |
| Tab / Shift+Tab | 横向导航 |
| Home / End | 行首/行尾 |
| PageUp / PageDown | 翻页 |
| Ctrl+C | 复制 |
| 鼠标滚轮 | 滚动 |
| 列宽/行高调整 | 可视调整（不修改数据） |
| 切换 Sheet | 切换工作表 |

## 实现细节

### `#ensureWritable()` 拦截模式

```js
// Sheet.js
#readOnly = false;

#ensureWritable() {
    return !this.#readOnly;
}

// 每个数据修改方法入口
setCell(r, c, value, styleId = 0, disabled = false) {
    if (!this.#ensureWritable()) return;
    // ... 原有逻辑
}

setRowStyle(row, styleId) {
    if (!this.#ensureWritable()) return;
    this.#styleManager.setRowStyle(row, styleId);
    this.#invalidateAll();
}
```

### `SettingsApplier` 配置入口

```js
// SettingsApplier.js
if (settings.readOnly !== undefined) {
    sheet.readOnly = settings.readOnly;
}
```

### 右键菜单项过滤

只读模式下隐藏的菜单项（`ContextMenuStrategy.#READONLY_DISABLED`）：

- 插入行上/下、插入列左/右
- 删除行、删除列
- 合并单元格、取消合并
- 清空内容
- 插入图片
- 隐藏/显示行、隐藏/显示列
- 冻结操作

### 与 `isDisabled()` 的关系

`isDisabled()` 方法**不检查** `sheet.readOnly`，它只检查单元格级别的 `disabled` 属性。只读模式的拦截发生在 `#ensureWritable()` 层面，两者职责分离：

- `isDisabled()` → 决定某个单元格是否"灰显"（视觉表现）
- `#ensureWritable()` → 决定能否修改数据（行为拦截）

```js
isDisabled(r, c) {
    // 不检查 sheet.readOnly
    const colConfig = this.columnsConfig.get(c);
    if (colConfig?.disabled === true || colConfig?.readOnly === true) return true;
    const cellProps = this.resolveCellProperties(r, c);
    if (cellProps?.disabled === true || cellProps?.readOnly === true) return true;
    return this.cellStore.get(realR, c)?.disabled === true;
}
```