# SheetStyleManager — 工作表样式管理器

## 概述

`SheetStyleManager` 负责管理单个工作表（Sheet）的样式体系，提供从**默认样式 → 列样式 → 行样式 → 单元格样式 → 列类型默认样式 → 数据绑定样式**的六级级联合并机制。内部维护带版本号的解析缓存，确保高频渲染场景下的样式计算开销最小化。

## 文件位置

```
src/workbook/SheetStyleManager.js
```

## 设计意图

- **级联合并**：按优先级逐层覆盖，而不是在最顶层硬编码。用户只修改一层不影响其他层。
- **版本号缓存**：`resolveStyle` 是高频率调用路径（每个可见单元格每帧至少调用一次），使用版本号机制避免重复计算合并结果。
- **Flyweight 去重**：所有样式对象通过全局 `stylePool` 管理，相同样式共享同一对象，减少内存占用。
- **行列批量优化**：`setRangeStyle` 自动检测整行/整列选区，选择最精简的存储方式（行样式/列样式/逐单元格）。

## 样式优先级

从低到高共 6 层，高层覆盖低层的同名属性：

```
第 1 层  defaultStyle        默认样式（所有单元格基础）
   ↓
第 2 层  colStyle            整列样式
   ↓
第 3 层  rowStyle            整行样式
   ↓
第 4 层  cellStyle           单元格样式（cell.styleId）
   ↓
第 5 层  cellTypeDefault     列类型默认样式（如数字列右对齐）
   ↓
第 6 层  cellProps.style     数据绑定属性中的样式（cells/cell 配置）
```

### 示例：三种等级设置同一属性

```js
// 默认：字号 12
sheet.setDefaultStyle({ fontSize: 12 });

// 第 3 列：字号 14（覆盖默认）
sheet.styleManager.setColStyle(3, styleId_14);

// 第 5 行：字号 16（覆盖列样式）
sheet.styleManager.setRowStyle(5, styleId_16);

// (3, 5) 单元格最终字号 = 16（行样式覆盖了列样式）
// (3, 1) 单元格最终字号 = 14（列样式生效，行无此样式）
// (1, 1) 单元格最终字号 = 12（只有默认样式）
```

## 类结构

```js
class SheetStyleManager {
    #sheet: Sheet                 // 所属工作表引用
    #defaultStyleId: number       // 默认样式 ID
    #styleCache: Map<key, style>  // 解析结果缓存
    #styleCacheVersion: number    // 当前版本号（每次样式变更递增）
    #styleCacheFrameVersion: number // 缓存快照版本号（用于一致性判断）
}
```

## 缓存机制

### 版本号策略

```
样式变更（setRowStyle / setCellStyle 等）
  → invalidateCache()
    → #styleCacheVersion++

resolveStyle 调用：
  #styleCacheFrameVersion === #styleCacheVersion？
    ├── 是 → 命中缓存，直接从 Map 读取（无计算开销）
    └── 否 → 清空缓存，全量重建
```

### 快速路径优化

当单元格无任何自定义样式（无列样式、无行样式、无 cellStyleId、无数据绑定样式）时，直接返回默认样式对象引用，跳过所有合并计算：

```js
// 快速路径条件
if (!colStyleId && !rowStyleId && !cellStyleId
    && !this.#sheet.cellsFn
    && !this.#sheet.columnsConfig.get(c)?.style) {
    return base; // 直接返回，零分配
}
```

## API 参考

### 默认样式

#### setDefaultStyle(styleObj)

设置工作表的默认样式。所有未自定义样式的单元格均以此为基础。

| 参数 | 类型 | 说明 |
|------|------|------|
| `styleObj` | `Object` | 样式对象，键值对如 `{ fontSize: 14, fontWeight: "bold" }` |

```js
sheet.styleManager.setDefaultStyle({
    fontSize: 14,
    fontFamily: "Arial",
    color: "#333",
});
```

#### getDefaultStyle() → Object

获取当前默认样式对象。

```js
const base = sheet.styleManager.getDefaultStyle();
// { fontSize: 14, fontFamily: "Arial", color: "#333" }
```

---

### 行样式

#### setRowStyle(row, styleId)

设置整行样式。

| 参数 | 类型 | 说明 |
|------|------|------|
| `row` | `number` | **实际行号**（realRow），非页面行号 |
| `styleId` | `number` | 样式 ID，由 `stylePool.getStyleId(styleObj)` 获得 |

```js
const styleId = stylePool.getStyleId({ backgroundColor: "#f0f0f0" });
sheet.styleManager.setRowStyle(0, styleId); // 第 0 行灰底
```

#### clearRowStyle(row)

清除指定行的整行样式。若该行无样式则无操作。

| 参数 | 类型 | 说明 |
|------|------|------|
| `row` | `number` | 实际行号（realRow） |

```js
sheet.styleManager.clearRowStyle(0);
```

---

### 列样式

#### setColStyle(col, styleId)

设置整列样式。

| 参数 | 类型 | 说明 |
|------|------|------|
| `col` | `number` | 列号 |
| `styleId` | `number` | 样式 ID |

```js
const styleId = stylePool.getStyleId({ textAlign: "center" });
sheet.styleManager.setColStyle(2, styleId); // 第 2 列居中
```

#### clearColStyle(col)

清除指定列的整列样式。

| 参数 | 类型 | 说明 |
|------|------|------|
| `col` | `number` | 列号 |

---

### 单元格样式

#### setCellStyle(r, c, styleObj)

设置单个单元格的样式（**增量合并**）。将新样式与单元格现有样式合并，新样式覆盖同名属性。

| 参数 | 类型 | 说明 |
|------|------|------|
| `r` | `number` | **页面行号**（pageRow，即显示行号） |
| `c` | `number` | 列号 |
| `styleObj` | `Object` | 要合并的样式属性 |

内部流程：
```
r → toRealRow(r) → realR
cellStore.get(realR, c) → 当前 cell
当前 styleId → 当前 style 对象
{...currentStyle, ...styleObj} → 合并
stylePool.getStyleId(merged) → 新 styleId
new Cell(value, newStyleId, disabled) → 写回 cellStore
```

```js
// 首次设置：字体加粗
sheet.styleManager.setCellStyle(1, 1, { fontWeight: "bold" });

// 再次设置：增量合并，加粗 + 红色
sheet.styleManager.setCellStyle(1, 1, { color: "#ff0000" });
// 最终结果：{ fontWeight: "bold", color: "#ff0000" }
```

#### clearCellStyle(r, c)

清除单元格的自定义样式，将 `styleId` 重置为 `0`（回退到行/列/默认样式）。保留 `value` 和 `disabled` 状态。

| 参数 | 类型 | 说明 |
|------|------|------|
| `r` | `number` | 页面行号 |
| `c` | `number` | 列号 |

---

### 批量选区样式

#### setRangeStyle(range, styleObj)

为选区范围设置统一样式。内置**存储优化策略**：

| 选区类型 | 存储方式 | 说明 |
|----------|----------|------|
| 整行选区（覆盖所有列） | `rowStyles.set()` | 逐行设置行样式，每个单元格零额外存储 |
| 整列选区（覆盖所有行） | `colStyles.set()` | 逐列设置列样式，每个单元格零额外存储 |
| 任意选区 | `setCellStyle()` 逐单元格 | 跳过禁用单元格 |

```js
// 整行选区（高效：仅为第 0-3 行各设一个行样式）
sheet.styleManager.setRangeStyle(
    { topRow: 0, topCol: 0, bottomRow: 3, bottomCol: 99999 },
    { backgroundColor: "#ffff00" }
);

// 小块选区（逐单元格设置）
sheet.styleManager.setRangeStyle(
    { topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 },
    { fontWeight: "bold" }
);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `range` | `Object` | `{ topRow, topCol, bottomRow, bottomCol }` |
| `styleObj` | `Object` | 样式对象 |

---

### 样式解析

#### resolveStyle(r, c) → Object

解析指定单元格的最终合并样式，按优先级逐层合并后返回。

| 参数 | 类型 | 说明 |
|------|------|------|
| `r` | `number` | **页面行号**（pageRow） |
| `c` | `number` | 列号 |

**返回值**：合并后的样式对象，包含 `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `color`, `backgroundColor`, `textAlign`, `textDecoration`, `verticalAlign`, `border`, `padding` 等所有支持的属性。

> 此方法被 `TileRenderer.#drawCellText` 高频调用，每次渲染每个单元格都会调用一次。通过版本号缓存机制，绝大多数情况下命中缓存，无额外计算开销。

---

### 缓存控制

#### invalidateCache()

使样式缓存失效。任何修改样式的操作（`setRowStyle` / `setColStyle` / `setCellStyle` / `clearCellStyle` 等）内部均自动调用此方法。

```js
// 一般不需要手动调用，但如果有外部直接操作 #sheet.rowStyles / #sheet.colStyles
// 的情况，需要手动调一下
sheet.styleManager.invalidateCache();
```

## 行号形态对照

| API | 参数名 | 形态 | 说明 |
|-----|--------|------|------|
| `setRowStyle` | `row` | 实际行号（realRow） | 数据的真实行索引 |
| `clearRowStyle` | `row` | 实际行号（realRow） | 同上 |
| `setCellStyle` | `r` | 页面行号（pageRow） | 屏幕上的显示行号 |
| `clearCellStyle` | `r` | 页面行号（pageRow） | 同上 |
| `resolveStyle` | `r` | 页面行号（pageRow） | 渲染时传入的是显示行号 |

> 内部通过 `this.#sheet.toRealRow(r)` 将页面行号统一转换为实际行号后再操作数据。

## 与其他模块的关系

```
Sheet
  ├── SheetStyleManager           ← 本模块
  │     ├── stylePool (全局)       ← 样式对象去重 & ID 分配
  │     ├── #sheet.rowStyles       ← 行样式 Map<realRow, styleId>
  │     ├── #sheet.colStyles       ← 列样式 Map<col, styleId>
  │     ├── #sheet.cellStore       ← 单元格数据（cell.styleId）
  │     ├── #sheet.columnsConfig   ← 列配置（列类型默认样式）
  │     └── #sheet.cellsFn         ← 数据绑定（cellProps.style）
  │
  └── TileRenderer
        └── #drawCellText()
              └── sheet.resolveStyle(r, c)   ← 每帧每单元格调用
                    └── styleManager.resolveStyle(r, c)
```

## 性能要览

| 操作 | 复杂度 | 说明 |
|------|--------|------|
| `resolveStyle`（缓存命中） | O(1) | 直接从 Map 读取 |
| `resolveStyle`（缓存未命中） | O(1) | 6 层对象浅合并 |
| `setCellStyle` | O(1) | 一次 cellStore.set + 一次 stylePool.getStyleId |
| `setRangeStyle`（整行） | O(n) | n = 选区行数 |
| `setRangeStyle`（整列） | O(m) | m = 选区列数 |
| `setRangeStyle`（任意范围） | O(n × m) | 逐单元格设置，跳过禁用单元格 |
