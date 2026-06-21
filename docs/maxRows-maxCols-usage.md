# maxRows / maxCols 配置使用说明

## 📋 概述

`maxRows` 和 `maxCols` 是工作表配置项，用于**固定电子表格的行列数上限**。配置后，表格将只渲染指定数量的行和列，超出部分不会显示或可访问。

## ✨ 核心特性

- **固定网格大小**：严格限制显示的行数和列数
- **动态调整支持**：运行时可通过 API 动态修改行列数
- **分页插件兼容**：与 PaginationPlugin 完美协同工作
- **性能优化**：减少不必要的渲染计算，提升大数据量场景下的性能

## 🎯 适用场景

| 场景 | 推荐配置 | 说明 |
|------|---------|------|
| **表单录入** | `maxRows: 30, maxCols: 10` | 固定大小的数据录入表单 |
| **报表展示** | `maxRows: 100, maxCols: 20` | 固定行数的月度/季度报表 |
| **小工具面板** | `maxRows: 15, maxCols: 8` | 嵌入式小型表格组件 |
| **分页大数据** | `maxRows: 10000, pageSize: 50` | 企业级大数据分页浏览 |

## 📖 基础用法

### 1️⃣ 静态配置（初始化时设置）

在 `main.js` 的 sheets 配置中添加：

```javascript
sheets: [
    {
        name: "Sheet1",
        // ... 其他配置
        
        // 固定行列数（核心配置）
        maxRows: 20,   // 最多显示 20 行（第1-20行）
        maxCols: 12,   // 最多显示 12 列（A-L列）
        
        // ... 其他配置
    }
]
```

**效果**：
- ✅ 只渲染 20 行 × 12 列
- ✅ 滚动时不会出现第21行或第M列
- ✅ 列头显示：A, B, C, D, E, F, G, H, I, J, K, L
- ✅ 行号显示：1, 2, 3, ..., 19, 20

### 2️⃣ 与其他配置项的关系

```javascript
{
    name: "Sheet1",
    
    // ⭐ 新推荐方式（优先使用）
    maxRows: 20,
    maxCols: 12,
    
    // ⚠️ 旧方式（已弃用，但仍兼容）
    // startRows: 100,   // 不再推荐
    // startCols: 26,    // 不再推荐
    
    // 📝 注意：columns 配置数组长度可以 < maxCols
    columns: [
        { type: "text", width: 120 },      // 第0列 (A)
        { type: "numeric", width: 80 },     // 第1列 (B)
        // ... 只有6个配置，但可以有12列
        // 未配置的列使用默认宽度和类型
    ],
    
    // 📝 rowHeights 配置同理
    rowHeights: [30, 50, 90],  // 只配置前3行高度，其余使用默认值
}
```

## 🔧 动态调整 API

### 方法一览

| 方法 | 说明 | 参数 |
|------|------|------|
| `sheet.setRowCount(rows)` | 设置行数 | `rows`: ≥1 的整数 |
| `sheet.setColCount(cols)` | 设置列数 | `cols`: ≥1 的整数 |
| `sheet.setGridSize(rows, cols)` | 同时设置行列数 | 两个参数都 ≥1 |

### 使用示例

#### 示例1：基础用法

```javascript
// 获取当前活动工作表
const sheet = wb.getActiveSheet();

// 方式1：只调整行数
sheet.setRowCount(50);       // 从20行 → 50行

// 方式2：只调整列数
sheet.setColCount(26);       // 从12列 → 26列 (A-Z)

// 方式3：同时调整
sheet.setGridSize(100, 15);  // 100行 × 15列
```

#### 示例2：通过控制台快捷方法

在浏览器开发者工具的控制台中：

```javascript
// 查看当前大小
window.resizeGrid.getSize();
// 返回: { rows: 20, cols: 12, explicitlySized: true }

// 调整大小
window.resizeGrid.setSize(30, 15);   // 30行 × 15列
window.resizeGrid.setRows(100);       // 只改行数为100
window.resizeGrid.setCols(20);        // 只改列数为20
```

#### 示例3：模式切换快捷方法

```javascript
// 切换到"大数据模式"（启用分页）
window.resizeGrid.enableLargeDataMode(1000, 50);
// 参数: 总行数=1000, 每页行数=50, 共20页

// 切换到"小表格模式"（可选禁用分页）
window.resizeGrid.enableSmallTableMode(30, true);
// 参数: 总行数=30, 禁用分页=true
```

## 🔄 与分页插件的协作

### 自动适应机制

当启用 PaginationPlugin 时，动态调整 `maxRows` 会自动触发分页重新计算：

```javascript
// 场景A：网格 > pageSize → 启用多页分页
sheet.setGridSize(200, 12);
// 结果: totalRows=200, pageSize=20(默认), totalPages=10

// 场景B：网格 ≤ pageSize → 单页显示全部
sheet.setGridSize(15, 10);
// 结果: totalRows=15, totalPages=1 (无翻页)
```

### 手动控制分页

```javascript
const pg = wb.getPlugin('pagination');

// 调整每页行数
pg.setPageSize(50);           // 每页50行

// 翻页操作
pg.nextPage();                // 下一页
pg.prevPage();                // 上一页
pg.setPage(3);               // 跳转到第3页
pg.firstPage();              // 回到首页
pg.lastPage();               // 跳到末页

// 查询状态
const info = pg.getPaginationData();
console.log(info);
// {
//   currentPage: 3,
//   totalPages: 4,
//   totalRows: 200,
//   pageSize: 50,
//   pageRowCount: 50,
//   ...
// }
```

## ⚙️ 高级配置

### 1. 响应式调整（监听窗口变化）

```javascript
// 根据窗口宽度动态调整列数
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const minCols = 5;                    // 最少5列
    const colWidth = 120;                 // 每列约120px
    const cols = Math.max(minCols, Math.floor(width / colWidth));
    
    wb.getActiveSheet().setColCount(cols);
});
```

### 2. 数据驱动调整

```javascript
// 根据实际数据量动态设置行数
async function loadDataAndResize() {
    const data = await fetch('/api/data').then(r => r.json());
    
    // 显示数据 + 10行预留空间
    const targetRows = data.length + 10;
    wb.getActiveSheet().setRowCount(targetRows);
    
    // 加载数据到单元格
    data.forEach((row, rowIndex) => {
        row.forEach((cellValue, colIndex) => {
            sheet.setCell(rowIndex, colIndex, cellValue);
        });
    });
}
```

### 3. 用户交互触发

```html
<!-- HTML 控件 -->
<button onclick="addMoreRows()">+ 添加10行</button>
<button onclick="removeRows()">- 移除10行</button>
<input type="number" id="rowInput" placeholder="输入行数">
<button onclick="setCustomRows()">应用</button>
```

```javascript
function addMoreRows() {
    const sheet = wb.getActiveSheet();
    const current = sheet.rowColManager.rowCount;
    sheet.setRowCount(current + 10);  // 增加10行
}

function removeRows() {
    const sheet = wb.getActiveSheet();
    const current = sheet.rowColManager.rowCount;
    sheet.setRowCount(Math.max(1, current - 10));  // 减少10行，最少1行
}

function setCustomRows() {
    const rows = parseInt(document.getElementById('rowInput').value);
    if (rows >= 1) {
        wb.getActiveSheet().setRowCount(rows);
    } else {
        alert('请输入大于0的整数');
    }
}
```

## 🐛 常见问题排查

### Q1: 配置了 maxRows: 20 但显示了更多行？

**原因**: PaginationPlugin 可能使用了旧的总行数缓存。

**解决**: 
```javascript
// 手动刷新分页插件
wb.getPlugin('pagination')?.refresh();

// 或者重新设置行列数（会自动同步分页）
wb.getActiveSheet().setGridSize(20, 12);
```

### Q2: 动态调整后分页失效？

**原因**: 调整行列数后未正确通知分页插件。

**解决**: 使用提供的 API 方法而非直接操作：
```javascript
// ✅ 正确：使用封装好的方法
sheet.setRowCount(100);

// ❌ 错误：直接调用底层方法（可能导致状态不一致）
sheet.rowColManager.resetSize(100, 12);
```

### Q3: 缩小行列数后数据丢失？

**行为说明**: **数据不会丢失！**

- 缩小网格只是隐藏了超出行列的显示
- CellStore 中仍保留所有历史数据
- 再次扩大时会恢复显示

```javascript
// 测试：缩小再扩大
sheet.setGridSize(10, 5);   // 缩小
sheet.setCell(99, 49, 'test');  // 写入第100行第50列（虽然不可见）

sheet.setGridSize(150, 60);  // 扩大
console.log(sheet.getCell(99, 49));  // 输出: 'test' ✅ 数据还在！
```

### Q4: 如何完全禁用分页功能？

```javascript
// 方式1：禁用分页插件
wb.disablePlugin('pagination');

// 方式2：使用小表格模式（自动禁用分页）
window.resizeGrid.enableSmallTableMode(30, true);

// 方式3：不加载分页插件（在初始化配置中移除）
plugins: [
    // 'pagination',  // 注释掉这行
    'autoFill',
    'contextMenu',
    // ...
]
```

## 📊 性能对比

| 网格大小 | 渲染时间 | 内存占用 | 适用场景 |
|---------|---------|---------|---------|
| 20×12 | ~5ms | 低 | 表单、配置面板 |
| 100×26 | ~15ms | 中 | 小型报表 |
| 1000×50 | ~80ms | 中高 | 中等数据量 |
| 10000×100 | ~500ms | 高 | 大数据（需配合分页） |

**优化建议**:
- ≤100行：无需分页，直接渲染
- 100-1000行：建议启用分页（pageSize: 50-100）
- \>1000行：必须启用分页 + 虚拟滚动

## 🔗 相关API参考

### RowColManager 属性

```javascript
const rc = sheet.rowColManager;

rc.rowCount              // 当前行数（考虑分页）
rc.colCount              // 当前列数
rc.isExplicitlySized     // 是否通过maxRows/maxCols显式配置
rc.allocatedRowCount     // 已分配内存的行数
rc.allocatedColCount     // 已分配内存的列数
```

### Sheet 方法

```javascript
sheet.setRowCount(30);     // 设置行数
sheet.setColCount(15);     // 设置列数
sheet.setGridSize(30, 15); // 同时设置
sheet.render();            // 手动触发重渲染
```

### Workbook 方法

```javascript
wb.getPlugin('pagination');     // 获取分页插件实例
wb.disablePlugin('pagination'); // 禁用插件
wb.enablePlugin('pagination');  // 启用插件
```

## 📝 更新日志

### v2.0.0 (2026-06-21)
- ✅ 新增 `maxRows` / `maxCols` 配置项
- ✅ 支持运行时动态调整（`setRowCount`, `setColCount`, `setGridSize`）
- ✅ 完善分页插件协同机制
- ✅ 添加边界保护（不超过系统上限 MAX_ROWS/MAX_COLS）
- ✅ 提供控制台快捷方法（`window.resizeGrid.*`）

---

**维护者**: Canvas Spreadsheet Team  
**最后更新**: 2026-06-21  
**适用版本**: v2.0.0+