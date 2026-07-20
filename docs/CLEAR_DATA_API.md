# 🧹 数据清空 API 使用指南 (Clear Data API)

## 📋 概述

**版本**: v1.0.15+  
**状态**: ✅ 已发布  
**功能**: 全量/范围数据清空，支持撤销和事件生命周期

从 v1.0.15 开始，Canvas Spreadsheet Engine 提供了完整的数据清空 API，支持：
- ✅ **全工作表清空** - 一键清除所有单元格数据
- ✅ **范围清空** - 清除指定矩形区域
- ✅ **撤销支持** - Ctrl+Z 恢复被清除的数据
- ✅ **完整事件** - beforeClearData / afterClearData 生命周期
- ✅ **性能优化** - 批量操作 + 可选跳过历史/事件

---

## 🎯 快速开始

### 基础用法

```javascript
import { Workbook } from '@canvas-sheet/core';

const workbook = new Workbook(document.getElementById('container'), {
    sheets: [{
        name: 'Sheet1',
        data: [
            ['Name', 'Age', 'Score'],
            ['Alice', 28, 95],
            ['Bob', 34, 87],
            ['Charlie', 22, 76]
        ]
    }]
});

// ✨ 清空当前活动工作表的所有数据
const result = workbook.clearActiveSheetData();

console.log(result);
// {
//   changes: [
//     { row: 0, col: 0, oldValue: 'Name', styleId: 0 },
//     { row: 0, col: 1, oldValue: 'Age', styleId: 0 },
//     ...
//   ],
//   clearedCount: 12
// }

// 按 Ctrl+Z 可以撤销！✅
```

---

## 📖 API 参考

### 1️⃣ Workbook 层 API

#### `clearActiveSheetData(options?)`

清空当前活动工作表的所有数据。

**签名：**
```typescript
clearActiveSheetData(options?: {
    skipHistory?: boolean;  // 是否跳过撤销记录（默认 false）
    skipEvents?: boolean;   // 是否跳过事件触发（默认 false）
}): { changes: Array, clearedCount: number } | undefined
```

**参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.skipHistory` | boolean | `false` | 设为 `true` 跳过撤销记录（提升性能） |
| `options.skipEvents` | boolean | `false` | 设为 `true` 跳过事件触发（静默模式） |

**返回值：**
- 成功时返回 `{ changes, clearedCount }`
- 无活动工作表时返回 `undefined`

**示例：**
```javascript
// 标准用法（推荐）
const result = workbook.clearActiveSheetData();
console.log(`已清除 ${result.clearedCount} 个单元格`);

// 性能优化模式（大数据量）
workbook.clearActiveSheetData({ skipHistory: true });

// 静默模式（不触发事件）
workbook.clearActiveSheetData({ skipEvents: true });
```

---

#### `clearAllSheetsData(options?)`

清空所有工作表的数据。

**签名：**
```typescript
clearAllSheetsData(options?: {
    skipHistory?: boolean;
    skipEvents?: boolean;
}): {
    totalCleared: number;
    results: Array<{ sheetName: string; clearedCount: number }>;
}
```

**示例：**
```javascript
// 重置整个工作簿
const summary = workbook.clearAllSheetsData();

console.log(summary);
// {
//   totalCleared: 1500,
//   results: [
//     { sheetName: 'Sheet1', clearedCount: 1000 },
//     { sheetName: 'Sheet2', clearedCount: 500 }
//   ]
// }

// 显示进度
summary.results.forEach(({ sheetName, clearedCount }) => {
    console.log(`${sheetName}: 清除了 ${clearedCount} 个单元格`);
});
```

---

### 2️⃣ Sheet 层 API

#### `sheet.clearData(options?)`

底层方法，清空单个工作表的所有数据。

**签名：**
```typescript
clearData(options?: {
    skipHistory?: boolean;
    skipEvents?: boolean;
}): { changes: Array, clearedCount: number }
```

**触发的事件：**
1. `beforeClearData` - 清空前触发
   ```javascript
   workbook.addHook('beforeClearData', ({ sheet }) => {
       console.log(`准备清空工作表: ${sheet.name}`);
       // 返回 false 可阻止操作
       return true;
   });
   ```

2. `afterClearData` - 清空后触发
   ```javascript
   workbook.addHook('afterClearData', ({ sheet, changes, clearedCount }) => {
       console.log(`${sheet.name}: 已清除 ${clearedCount} 个单元格`);
       console.log('被删除的数据:', changes);
   });
   ```

**示例：**
```javascript
const sheet = workbook.activeSheet;

// 监听事件
sheet.bus.on('beforeClearData', () => {
    if (!confirm('确定要清空所有数据吗？')) {
        return false;  // 阻止操作
    }
});

// 执行清空
const result = sheet.clearData();
```

---

#### `sheet.clearRange(topRow, topCol, bottomRow, bottomCol, options?)`

清空指定矩形范围内的数据。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| `topRow` | number | 左上角行号 |
| `topCol` | number | 左上角列号 |
| `bottomRow` | number | 右下角行号 |
| `bottomCol` | number | 右下角列号 |
| `options` | object | 同 clearData |

**示例：**
```javascript
// 只清除前10行数据
sheet.clearRange(0, 0, 9, 25);

// 清除选区（模拟 Delete 键行为）
const range = sheet.selection.getRange();
sheet.clearRange(
    range.topRow,
    range.topCol,
    range.bottomRow,
    range.bottomCol
);
```

---

### 3️⃣ CellDataAccessor 层 API

#### `accessor.clearAll()`

收集所有非空单元格快照并清空存储。

**返回值：**
```typescript
{
    changes: Array<{
        row: number;
        col: number;
        oldValue: any;
        styleId: number;
    }>;
    clearedCount: number;
}
```

**适用场景：**
- 需要在清空前访问所有数据的场景
- 自定义批量操作逻辑

**示例：**
```javascript
const accessor = sheet.cellDataAccessor;

// 收集快照
const snapshot = accessor.clearAll();
console.log(`即将删除 ${snapshot.clearedCount} 个单元格`);

// 手动恢复（如果需要）
if (someCondition) {
    for (const { row, col, oldValue, styleId } of snapshot.changes) {
        sheet.setCell(row, col, oldValue, styleId);
    }
}
```

---

#### `accessor.clearRange(topRow, topCol, bottomRow, bottomCol)`

与 clearAll 类似，但限定范围。

**示例：**
```javascript
const accessor = sheet.cellDataAccessor;

// 清除 A1:D10 区域
const result = accessor.clearRange(0, 0, 9, 3);

console.log(`清除了 ${result.clearedCount} 个单元格`);
```

---

## 💡 实用场景

### 场景 1：重置表单

```javascript
function resetForm(workbook) {
    const btnReset = document.getElementById('btn-reset');

    btnReset.addEventListener('click', () => {
        if (confirm('确定要重置表单吗？所有数据将被清除且可撤销。')) {
            const result = workbook.clearActiveSheetData();

            if (result && result.clearedCount > 0) {
                showToast(`已重置表单（删除 ${result.clearedCount} 个单元格）`);
            } else {
                showToast('表单已经是空的');
            }
        }
    });
}
```

---

### 场景 2：导入新数据前清理

```javascript
async function importCSV(workbook, file) {
    const sheet = workbook.activeSheet;

    try {
        showLoadingIndicator('正在导入...');

        // 步骤1：清空旧数据（跳过撤销以节省内存）
        sheet.clearData({ skipHistory: true });

        // 步骤2：解析 CSV
        const text = await file.text();
        const data = parseCSV(text);  // 假设有此函数

        // 步骤3：加载新数据
        sheet.loadData(data);

        hideLoadingIndicator();
        showToast(`成功导入 ${data.length} 行数据`);

    } catch (error) {
        hideLoadingIndicator();
        showError(`导入失败: ${error.message}`);
    }
}
```

---

### 场景 3：定时自动保存后清理

```javascript
class AutoSaveManager {
    constructor(workbook) {
        this.workbook = workbook;
        this.dirty = false;

        this.setupAutoSave();
    }

    setupAutoSave() {
        this.workbook.addHook('afterChange', () => {
            this.markDirty();
        });
    }

    markDirty() {
        this.dirty = true;
        scheduleAutoSave(() => this.save());
    }

    async save() {
        if (!this.dirty) return;

        try {
            const data = this.exportData();

            await fetch('/api/save', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            this.dirty = false;
            showToast('已保存');

        } catch (error) {
            showError(`保存失败: ${error.message}`);
        }
    }

    exportData() {
        const sheet = this.workbook.activeSheet;
        const accessor = sheet.cellDataAccessor;

        return {
            timestamp: Date.now(),
            cells: [...accessor].map(({ row, col, cell }) => ({
                row, col,
                value: cell.value,
                styleId: cell.styleId
            }))
        };
    }
}

// 使用
const autoSaver = new AutoSaveManager(workbook);
```

---

### 场景 4：条件性清空（带确认）

```javascript
function clearWithConfirmation(workbook) {
    const sheet = workbook.activeSheet;
    const accessor = sheet.cellDataAccessor;

    // 统计非空单元格数
    let nonEmptyCount = 0;
    for (const [, , cell] of accessor) {
        if (cell && cell.value !== '' && cell.value != null) {
            nonEmptyCount++;
        }
    }

    if (nonEmptyCount === 0) {
        showToast('当前没有数据');
        return;
    }

    const message = `确定要删除 ${nonEmptyCount} 个单元格的数据吗？\n\n此操作可以撤销（Ctrl+Z）。`;

    if (confirm(message)) {
        const startTime = performance.now();

        const result = workbook.clearActiveSheetData();

        const duration = (performance.now() - startTime).toFixed(2);
        showToast(
            `已删除 ${result.clearedCount} 个单元格 (${duration}ms)`
        );
    }
}
```

---

### 场景 5：批量处理多个工作簿

```javascript
async function resetAllWorkbooks(workbooks) {
    const results = [];

    for (const wb of workbooks) {
        const summary = wb.clearAllSheetsData({ skipEvents: true });

        results.push({
            id: wb.id,
            totalCleared: summary.totalCleared,
            sheets: summary.results.map(r => r.sheetName)
        });
    }

    console.log('批量重置完成:', results);

    return results;
}
```

---

## ⚡ 性能优化建议

### 1️⃣ 大数据量场景

```javascript
function handleLargeDataset(workbook, rowCount = 100000) {
    const sheet = workbook.activeSheet;

    // ❌ 慢：默认模式（记录每个单元格到历史栈）
    // sheet.clearData();  // 可能耗时数秒

    // ✅ 快：跳过历史记录
    sheet.clearData({
        skipHistory: true,
        skipEvents: true
    });

    // 或者分块处理（如果需要保留部分历史）
    const CHUNK_SIZE = 10000;
    for (let startRow = 0; startRow < rowCount; startRow += CHUNK_SIZE) {
        const endRow = Math.min(startRow + CHUNK_SIZE - 1, rowCount - 1);
        sheet.clearRange(startRow, 0, endRow, 25, {
            skipHistory: true
        });

        yieldToMainThread();  // 让出主线程避免卡顿
    }
}

function yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
```

---

### 2️⃣ 频繁清空场景

```javascript
class RealTimeDashboard {
    constructor(workbook) {
        this.workbook = workbook;
        this.lastClearTime = 0;
        this.debounceMs = 1000;  // 防抖间隔
    }

    updateData(newData) {
        const now = Date.now();

        if (now - this.lastClearTime < this.debounceMs) {
            return;  // 防抖
        }

        this.lastClearTime = now;

        this.workbook.clearActiveSheetData({
            skipHistory: true,  // 实时数据不需要撤销
            skipEvents: true    // 减少事件开销
        });

        this.workbook.activeSheet.loadData(newData);
    }
}
```

---

## 🔒 安全性考虑

### 1️⃣ 权限控制

```javascript
function createSecureWorkbook(container, userRole) {
    const workbook = new Workbook(container, {
        afterInit(wb) {
            if (userRole !== 'admin') {
                wb.addHook('beforeClearData', () => {
                    alert('您没有权限清空数据');
                    return false;  // 阻止操作
                });
            }
        }
    });

    return workbook;
}
```

---

### 2️⃣ 操作日志

```javascript
function setupAuditLog(workbook) {
    workbook.addHook('afterClearData', ({ sheet, changes, clearedCount }) => {
        logToServer({
            action: 'CLEAR_DATA',
            user: currentUser.id,
            sheet: sheet.name,
            timestamp: new Date().toISOString(),
            details: {
                clearedCount,
                affectedCells: changes.length,
                preview: changes.slice(0, 10).map(c => ({
                    row: c.row,
                    col: c.col,
                    oldValue: c.oldValue
                }))
            }
        });
    });
}
```

---

## 🧪 测试指南

### 单元测试示例

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { Workbook } from '@canvas-sheet/core';

describe('Clear Data API', () => {
    let workbook;

    beforeEach(() => {
        workbook = new Workbook(document.createElement('div'), {
            autoInit: false
        });

        workbook.initRender();
    });

    it('应该清空活动工作表数据', () => {
        const sheet = workbook.activeSheet;
        sheet.loadData([['A', 'B'], [1, 2]]);

        const result = workbook.clearActiveSheetData();

        expect(result.clearedCount).toBe(4);
        expect(sheet.cellDataAccessor.get(0, 0)).toBeUndefined();
    });

    it('应该支持撤销', () => {
        const sheet = workbook.activeSheet;
        sheet.loadData([['Hello']]);

        workbook.clearActiveSheetData();
        expect(sheet.cellDataAccessor.get(0, 0)?.value).toBe('');

        workbook.undo();
        expect(sheet.cellDataAccessor.get(0, 0)?.value).toBe('Hello');
    });

    it('应该触发事件', () => {
        let beforeFired = false;
        let afterFired = false;

        workbook.addHook('beforeClearData', () => {
            beforeFired = true;
        });

        workbook.addHook('afterClearData', () => {
            afterFired = true;
        });

        workbook.clearActiveSheetData();

        expect(beforeFired).toBe(true);
        expect(afterFired).toBe(true);
    });

    it('skipHistory 应该阻止撤销', () => {
        const sheet = workbook.activeSheet;
        sheet.loadData([['Test']]);

        workbook.clearActiveSheetData({ skipHistory: true });

        expect(sheet.cellDataAccessor.get(0, 0)).toBeUndefined();
    });
});
```

---

## ❓ 常见问题

### Q1: clearData 和 loadData([]) 有什么区别？

**A:**

| 特性 | clearData | loadData([]) |
|------|-----------|--------------|
| 撤销支持 | ✅ 支持 | ❌ 不支持 |
| 事件触发 | ✅ 完整生命周期 | ⚠️ 仅 afterLoadData |
| 性能 | O(n) 遍历 | O(1) 替换引用 |
| 适用场景 | 用户交互 | 程序初始化 |

**建议：**
- 用户点击"清空"按钮 → 用 `clearData()`
- 程序启动/切换视图 → 用 `loadData([])`

---

### Q2: 如何只清除值但保留样式？

**A:** 当前实现会同时清除值和样式。如需仅清除值：

```javascript
function clearValuesOnly(sheet) {
    const accessor = sheet.cellDataAccessor;

    sheet.beginBatch();

    for (const { row, col, cell } of accessor) {
        if (cell && cell.value !== '') {
            sheet.setCell(row, col, '', cell.styleId || 0);
        }
    }

    sheet.endBatch();
}
```

---

### Q3: 清空合并单元格会发生什么？

**A:** 合并单元格的值存储在左上角单元格。clearData 会正常清除该值，合并关系保持不变。如需同时解除合并：

```javascript
function clearAndUnmerge(sheet) {
    const merges = sheet.getAllMerges();

    sheet.clearData();

    for (const merge of merges) {
        sheet.unmergeCells(merge);
    }
}
```

---

### Q4: 大数据量清空会导致 UI 卡顿吗？

**A:** 取决于数据量和选项设置：

| 数据量 | 默认模式 | skipHistory | skipBoth |
|--------|---------|-------------|----------|
| < 1000 | ✅ 无感 | ✅ 无感 | ✅ 无感 |
| 1K - 10K | ⚠️ 轻微延迟 | ✅ 无感 | ✅ 无感 |
| 10K - 100K | ⚠️ 明显延迟 | ✅ 轻微延迟 | ✅ 无感 |
| > 100K | ❌ 可能卡顿 | ⚠️ 轻微延迟 | ✅ 无感 |

**建议：** 对于 >10K 的数据，使用 `{ skipHistory: true }` 或显示加载指示器。

---

## 📊 版本历史

### v1.0.15 (2026-07-19)
- ✅ 新增 `ChunkedCellStore.clear()` 方法
- ✅ 新增 `CellDataAccessor.clearAll()` 和 `clearRange()` 方法
- ✅ 新增 `Sheet.clearData()` 和 `clearRange()` 方法
- ✅ 新增 `Workbook.clearActiveSheetData()` 和 `clearAllSheetsData()` 方法
- ✅ 完整的撤销支持和事件生命周期
- ✅ 性能优化选项（skipHistory、skipEvents）

---

## 🔗 相关文档

- [API 参考 - Workbook](../api-docs/workbook_Workbook.js.html)
- [API 参考 - Sheet](../api-docs/workbook_Sheet.js.html)
- [API 参考 - CellDataAccessor](../api-docs/model_grid_CellDataAccessor.js.html)
- [撤销系统文档](./undo-system-guide.md)
- [事件系统文档](./event-system-guide.md)

---

**维护者**: @jiangsuiting  
**最后更新**: 2026-07-19  
**许可证**: Apache-2.0