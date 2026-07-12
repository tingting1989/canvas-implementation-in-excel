# CellDataAccessor 快速使用指南

## 🎯 一句话总结

> **在 Strategy/Plugin/UI 层访问单元格数据时，使用 `sheet.cellDataAccessor` 代替直接调用 `sheet.cellStore`，提供统一的批量数据访问接口。**

---

## ⚡ 快速开始

### 基础用法

```javascript
// ❌ 旧写法（直接操作底层存储）`nconst cell = sheet.cellStore.get(row, col);

// ✅ 新写法（安全简洁）
const accessor = sheet.cellDataAccessor;
const cell = accessor.get(pageRow, col);
```

---

## 📋 常用场景示例

### 场景 1：读取单个单元格

```javascript
const accessor = sheet.cellDataAccessor;

// 获取单元格对象
const cell = accessor.get(row, col);

if (cell) {
    console.log('值:', cell.value);
    console.log('样式:', cell.styleId);
    console.log('公式:', cell.formula);
}
```

### 场景 2：快速获取值

```javascript
const value = accessor.getValue(row, col);  // 返回 undefined 或实际值
console.log(value);  // "hello" | 123 | undefined
```

### 场景 3：批量读取区域（用于复制/导出）

```javascript
// 获取值矩阵（二维数组）
const matrix = accessor.getValueMatrix(topRow, topCol, bottomRow, bottomCol);
// 返回: [["A1", "B1"], ["A2", "B2"]]

// 获取完整单元格对象矩阵
const cells = accessor.getRange(topRow, topCol, bottomRow, bottomCol);
// 返回: [[Cell, Cell], [Cell, Cell]]
```

### 场景 4：遍历区域（用于批量处理）

```javascript
// 方式1：回调函数
accessor.forEach(0, 0, 10, 5, (row, col, cell) => {
    if (cell?.value === '重要') {
        console.log(`找到关键数据: (${row}, ${col})`);
    }
});

// 方式2：for...of 迭代器
for (const {row, col, cell} of accessor) {
    // 遍历所有单元格...
}
```

### 场景 5：获取非空单元格（用于数据分析）

```javascript
const nonEmpty = accessor.getNonEmptyCells(0, 0, 100, 20);

nonEmpty.forEach(({row, col, cell}) => {
    console.log(`(${row}, ${col}): ${cell.value}`);
});
```

---

## 🔄 与其他 API 的配合

### 配合 Selection 使用

```javascript
const accessor = sheet.cellDataAccessor;
const range = sheet.selection.getRange();

// 读取选区数据
for (let r = range.topRow; r <= range.bottomRow; r++) {
    for (let c = range.topCol; c <= range.bottomCol; c++) {
        const cell = accessor.get(r, c);  // ✅ 自动转换行号
        processCell(cell);
    }
}
```

### 配合 Sheet.setCell() 使用

```javascript
const accessor = sheet.cellDataAccessor;

// 读取旧值
const oldCell = accessor.get(row, col);
const oldStyleId = oldCell?.styleId || 0;

// 写入新值（通过 Sheet API，保留撤销/重做功能）
sheet.setCell(row, col, newValue, oldStyleId);
```



---

## 🚨 常见错误与纠正

### 错误 1：在 Sheet 内部实现中使用

```javascript
// ❌ 错误：Sheet 方法内部使用自己的 cellDataAccessor
class Sheet {
    setCell(r, c, value) {
        const cell = this.cellDataAccessor.get(r, c);  // 循环依赖风险！
        // ...
    }
}

// ✅ 正确：核心层保持原始方式
class Sheet {
    setCell(r, c, value) {
        // 直接使用传入的行号（当前无分页转换）
        const cell = this.cellStore.get(realR, c);
        // ...
    }
}
```

### 错误 3：忘记初始化

```javascript
// ❌ 错误：直接访问未定义的属性
const accessor = sheet.cellDataAccessor;  // 如果 Sheet 没集成会报错

// ✅ 安全：检查是否存在
if (sheet.cellDataAccessor) {
    const accessor = sheet.cellDataAccessor;
}
```

---

## 📊 性能优化建议

### 批量操作优先使用专用方法

```javascript
// ❌ 低效：循环调用 get()
const cells = [];
for (let r = 0; r < 1000; r++) {
    for (let c = 0; c < 100; c++) {
        cells.push(accessor.get(r, c));  // 100,000 次方法调用
    }
}

// ✅ 高效：使用批量方法
const cells = accessor.getRange(0, 0, 999, 99);  // 1次调用，内部优化
```

### 缓存 accessor 引用

```javascript
// ✅ 推荐：方法开始时获取一次引用
function processData(sheet) {
    const accessor = sheet.cellDataAccessor;  // 缓存
    
    // 后续多次使用...
    accessor.get(...);
    accessor.get(...);
    accessor.get(...);
}
```

---

## 🧪 调试技巧



### 对比新旧方式的结果

```javascript
// 验证一致性
const row = 4,col = 5;

// 旧方式
const oldCell = sheet.cellStore.get(row, col);

// 新方式
const newCell = sheet.cellDataAccessor.get(row, col);

console.assert(oldCell === newCell, '两种方式应该返回相同结果');
```

---

## 🔧 高级用法

### 自定义数据过滤器

```javascript
// 只获取数值类型的单元格
const numbers = [];
accessor.forEach(0, 0, 100, 20, (r, c, cell) => {
    if (cell && typeof cell.value === 'number') {
        numbers.push({row: r, col: c, value: cell.value});
    }
});
```


### 数据统计

```javascript
// 统计区域内的数据分布
const stats = {
    total: 0,
    empty: 0,
    numeric: 0,
    text: 0,
    formula: 0,
};

accessor.forEach(0, 0, 100, 26, (r, c, cell) => {
    stats.total++;
    if (!cell || cell.value === '' || cell.value == null) {
        stats.empty++;
    } else if (cell.formula) {
        stats.formula++;
    } else if (typeof cell.value === 'number') {
        stats.numeric++;
    } else {
        stats.text++;
    }
});

console.log('数据统计:', stats);
/*
{
  total: 2701,
  empty: 1500,
  numeric: 800,
  text: 399,
  formula: 2
}
*/
```

---

## 📖 API 完整参考

### 构造与初始化

```javascript
// 自动通过 Sheet 获取（懒初始化）
const accessor = sheet.cellDataAccessor;

// 手动创建（一般不需要）
import { CellDataAccessor } from '@/model/grid/CellDataAccessor.js';
const accessor = new CellDataAccessor(sheet);
```

### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `get(row, col)` | 页面行号, 列号 | `Cell\|null` | 读取单元格 |
| `setRange(tR, tC, cells)` | 边界+二维数组 | `void` | 批量写入 |
| `getValueMatrix(tR, tC, bR, bC)` | 区域边界 | `*[][]` | 提取值矩阵 |
| `getNonEmptyCells(tR, tC, bR, bC)` | 区域边界 | `Array` | 非空单元格列表 |
| `forEach(tR, tC, bR, bC, callback)` | 边界+回调 | 回调遍历 |
| `[Symbol.iterator]()` | - | 迭代器支持 |


## 💡 最佳实践总结

### ✅ Do（推荐做法）

1. **Strategy/Plugin 层统一使用**
   ```javascript
   const accessor = sheet.cellDataAccessor;
   ```

2. **批量操作用专用方法**
   ```javascript
   const matrix = accessor.getValueMatrix(...);
   ```

3. **缓存引用避免重复查询**
   ```javascript
   const accessor = sheet.cellDataAccessor;  // 方法顶部获取一次
   ```

4. **配合 Sheet.setCell() 保持撤销功能**
   ```javascript
   const oldStyle = accessor.get(r, c)?.styleId || 0;
   sheet.setCell(r, c, newValue, oldStyle);
   ```

### ❌ Don't（避免做法）

1. **不要在 Sheet 内部使用**（保持核心层清晰）

2. **不要混用两套 API**
   ```javascript
   // ❌ 不一致的代码
   accessor.get(r, c);
   sheet.cellStore.get(r, c);  // 混合使用（应统一使用 accessor）
   ```

3. **不要忽略返回值检查**
   ```javascript
   const cell = accessor.get(r, c);
   if (!cell) {  // ✅ 总是检查
       // 处理空单元格
   }
   ```

---

### 问题：性能下降

**解决方案**：
```javascript
// 改用批量方法
const cells = accessor.getRange(0, 0, maxRow, maxCol);

// 或者减少访问次数
const neededCells = accessor.getNonEmptyCells(...);
```
