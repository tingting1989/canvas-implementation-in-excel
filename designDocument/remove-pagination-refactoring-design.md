# 分页功能移除重构设计文档（方案A - 激进）

## 📋 目录

- [1. 项目背景与目标](#1-项目背景与目标)
- [2. 当前架构分析](#2-当前架构分析)
- [3. 重构后架构](#3-重构后架构)
- [4. 文件级变更清单](#4-文件级变更清单)
- [5. 核心代码变化示例](#5-核心代码变化示例)
- [6. 分阶段执行计划](#6-分阶段执行计划)
- [7. 关键风险点与应对措施](#7-关键风险点与应对措施)
- [8. 测试策略](#8-测试策略)
- [9. 公共 API 破坏性变更说明](#9-公共-api-破坏性变更说明)
- [10. 验收标准](#10-验收标准)

---

## 1. 项目背景与目标

### 1.1 当前问题

```
❌ 问题1: 分页功能引入复杂的双轨行号体系
   - Sheet.row / Sheet.pageRow / Sheet.realRow 语义混乱
   - RowColManager 需要维护 pageStartRow / pageEndRow 两套边界
   - 每个渲染函数都必须判断 "useRealRows ? ... : ..."

❌ 问题2: 渲染链路分页判断层层透传
   - RenderEngine → ViewportTransform → TileRenderer → TileLayer → FrozenLayer
   - 每个组件都接收 options.pageContext / options.useRealRows
   - 冻结区域与分页的组合逻辑复杂度 O(N²)

❌ 问题3: 转换层太多且层层依赖
   - PageContext（行号+坐标转换容器）
   - CellDataAccessor（分页数据访问代理）
   - Sheet.toRealRow / Sheet.toPageRow / Sheet.pageContext
   - 三层互相调用，错误调试困难

❌ 问题4: 测试覆盖复杂
   - 每个渲染单元测试必须 mock pageContext 行为
   - 冻结+分页组合场景难以精确断言
   - 删除一个功能却要改 15+ 测试文件
```

### 1.2 设计目标

| 目标 | 指标 | 说明 |
|-----|------|------|
| **降低心智负担** | 行号语义唯一化 | 所有 `row` 参数即"实际行号"，无隐式转换 |
| **简化渲染链路** | 分页参数透传次数 0 | RenderEngine 到 TileRenderer 不再关心分页 |
| **删除冗余文件** | 删除 3 个文件 | PageContext.js + PaginationPlugin.js + 对应测试 |
| **保持功能等价** | 冻结/滚动/合并 100% 可用 | 不引入除分页以外的任何功能变更 |
| **测试可维护** | 删除的用例明确 | 仅删除与分页直接相关的测试 |

---

## 2. 当前架构分析

### 2.1 分页相关组件调用关系

```
           ┌─────────────────────────────────────────┐
           │           PaginationPlugin              │ ← 外部入口（插件）
           │  setPage / setPageSize / nextPage       │
           │  → rc.setPaginationBounds(start, end)   │
           └────────────────┬────────────────────────┘
                            │
           ┌────────────────▼────────────────────────┐
           │           RowColManager                 │
           │  #pageStartRow / #pageEndRow            │
           │  getRowY / getRowHeight / rowAt         │ ← 都有 if(isPaged) 分支
           │  get pageContext() → PageContext        │
           └────────────────┬────────────────────────┘
                            │
           ┌────────────────▼────────────────────────┐
           │            PageContext                  │ ← 行号/坐标转换权威
           │  toRealRow / toPageRow                  │
           │  getPageRowY / getRealRowY / pageRowAt  │
           └────────────────┬────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────────────┐
    │                       │                               │
┌───▼────┐          ┌──────▼─────────┐              ┌──────▼─────────┐
│ Sheet  │          │ ViewportTransform │           │ CellDataAccessor │
│ toReal │          │ rowToViewY       │           │ get/set 内部     │
│ toPage │          │ cellToViewRect   │           │ 调用 toRealRow   │
│ pageContext ─────┘  isCellVisible    │           └──────────────────┘
│ #refreshPagination                    │
└──────────────────┬───────────────────┘
                   │
    ┌──────────────┴────────────────────────────────────────┐
    │                                                       │
┌───▼────────────┐          ┌──────────────────────┐   ┌────▼────────────┐
│ RenderEngine   │          │ TileRenderer         │   │ OverlayRenderer  │
│ pass pc,useRealRows ──►   │ sr/er 行号计算分支    │   │ merge 分页过滤    │
│ (composeOptions)           │ #createRenderContext │   │                  │
└────────────────┘          │ 构造 pageInfo/pageCtx │   └─────────────────┘
                            └──────────┬────────────┘
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                     ┌────▼────┐              ┌────▼────┐
                     │ TileLayer│              │FrozenLayer│
                     │ pass pc  │              │ useRealRows│
                     └─────────┘              └───────────┘
```

### 2.2 坐标体系现状

| 概念 | 当前含义 | 重构后含义 |
|------|---------|-----------|
| `row` / `pageRow` | 用户在分页视图中看到的行号（从 0 开始） | **删除此概念** |
| `realRow` | 数据在 cellStore 中的真实存储行号 | **即"row"本身，唯一存在** |
| `getRowY(row)` | 分页模式下 = 相对页顶的像素偏移；非分页 = 相对全局顶 | **恒为相对全局顶部的像素偏移** |
| `rowAt(y)` | 分页模式下 = 页内行号；非分页 = 全局行号 | **恒为全局行号** |
| `totalHeight` | 分页模式下 = 页面高度；非分页 = 全局高度 | **恒为全局总高度** |
| `rowCount` | 分页模式下 = 每页行数；非分页 = 总行数 | **恒为总行数** |

---

## 3. 重构后架构

### 3.1 组件调用关系（简化后）

```
           ┌─────────────────────────────────────────┐
           │            RowColManager                │ ← 只做一件事：行列索引
           │  getRowY / getRowHeight / rowAt         │   → 永远返回"全局"语义
           │  totalHeight / rowCount                 │
           └────────────────┬────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────────────┐
    │                       │                               │
┌───▼────┐          ┌──────▼─────────┐              ┌──────▼─────────┐
│ Sheet  │          │ ViewportTransform │          │ CellDataAccessor │
│ setCell│          │ rowToViewY       │           │ get/set 直接     │
│ getCell│          │ cellToViewRect   │           │ 调用 cellStore   │
│ merge  │          │ isCellVisible    │           │ (无任何转换)      │
└────────┘          └──────────────────┘           └──────────────────┘
                            │
    ┌───────────────────────┼───────────────────────────────┐
    │                       │                               │
┌───▼────────────┐     ┌────▼────────┐               ┌─────▼──────────┐
│ RenderEngine   │     │ TileRenderer │               │ OverlayRenderer │
│ 无 pageContext │     │ 无 useRealRows│               │ 无分页过滤      │
│ 直接传 rc      │     │ 直接用 rc.rowAt │             │ 直接画全部 merge│
└────────────────┘     └─────┬────────┘               └──────────────────┘
                             │
                    ┌────────┴─────────┐
                    │                  │
               ┌────▼────┐        ┌────▼────┐
               │TileLayer│        │FrozenLayer│
               │ 无 pc   │        │ 无 useRealRows│
               └─────────┘        └───────────┘
```

### 3.2 设计原则

1. **行号语义单一化**：`row` == 实际行号，无"页面行号"概念，无隐式转换
2. **坐标系全局化**：`getRowY`、`rowAt`、`totalHeight`、`rowCount` 永远反映全局数据
3. **调用参数扁平化**：`TileRenderer.render` / `FrozenLayer.render` 不再接收 `options.pageContext`、`options.useRealRows`
4. **破坏性变更明确化**：通过文档 + git commit 明确标注被移除的公共 API

---

## 4. 文件级变更清单

### 4.1 删除的文件（3 个）

| # | 文件路径 | 说明 |
|---|----------|------|
| D1 | `src/model/grid/PageContext.js` | 分页行号/坐标转换核心类，整文件删除 |
| D2 | `src/plugins/PaginationPlugin.js` | 分页插件本体，整文件删除 |
| D3 | `tests/plugins/PaginationPlugin.test.js` | 对应单元测试，整文件删除 |

### 4.2 修改的核心源码文件（15 个）

| # | 文件路径 | 核心改动 |
|---|----------|---------|
| F1 | `src/model/grid/RowColManager.js` | 删除 `#pageStartRow`、`#pageEndRow`、`#pageContext` 字段；删除 `setPaginationBounds` / `clearPaginationBounds` / `pageStartRow` / `pageEndRow` / `pageContext`；简化 `totalHeight`、`rowCount`、`getRowY`、`getRowHeight`、`setRowHeight`、`rowAt` 等方法（移除分页分支） |
| F2 | `src/model/grid/CellDataAccessor.js` | 删除 `#pageContext`；删除 `toRealRow`、`#toRealCoords`；`get/set/delete/getRange/forEach` 直接透传行号至 cellStore |
| F3 | `src/workbook/Sheet.js` | 删除 `pageContext` getter、`toRealRow`、`toPageRow`、`#refreshPagination`、`#syncPaginationAfterResize`；删除 setCell/disableCell/mergeCells/getMerge 等方法中的 toRealRow 转换；`#invalidateCell` 直接透传行号 |
| F4 | `src/workbook/Workbook.js` | 删除对 `SHEET_EVENTS.PAGINATION_REFRESH` 和 `ROW_COL_RESIZE` 分页分支的监听 |
| F5 | `src/constants/sheetEvents.js` | 删除 `PAGINATION_REFRESH` 事件常量 |
| F6 | `src/constants/hookNames.js` | 删除 `AFTER_PAGE_CHANGE`、`AFTER_PAGE_SIZE_CHANGE` Hook |
| F7 | `src/render/RenderEngine.js` | 删除 `pc = sheet.pageContext`、`isPaginationActive`、`effectiveFrozenRowsH`；删除 `composeOptions.pageContext`；`invalidateCell` 入参即实际行号 |
| F8 | `src/render/ViewportTransform.js` | 删除 `this.pc = sheet.pageContext`；`rowToViewY / rowBottomToViewY / viewYToRow / cellToViewRect / isCellVisible` 全部改为直接使用 `RowColManager` 提供的全局坐标 API |
| F9 | `src/render/TileRenderer.js` | 删除 `options.useRealRows` / `options.pageContext`；`#paintTile` 统一使用 `rc.rowAt` / `rc.getRowY` / `rc.getRowHeight` / `rc.rowCount`；`#drawCellContentOrText` / `#createRenderContext` 参数中 `pageRow` 与 `realR` 合并为单一 `row`；不再构造 `pageInfo` / `pageContext` |
| F10 | `src/render/OverlayRenderer.js` | `renderMerges` 删除 `pc.isActive` 分页过滤分支与 `pc.toPageRow` 转换，直接使用 merge 的 topRow/bottomRow |
| F11 | `src/render/layers/FrozenLayer.js` | 删除 `options.pageContext`、`isPaginationActive`、`tileOptions.useRealRows` 等逻辑 |
| F12 | `src/render/layers/TileLayer.js` | 删除 `options.useRealRows`、`options.pageContext` 处理 |
| F13 | `src/types/CellRenderContext.js` | **（方案A激进）** 删除 `pageInfo`、`pageContext` 构造参数及 getter；相关文档注释同步更新 |
| F14 | `src/plugins/registry.js` | 删除 `PaginationPlugin` 的 import 与 register 条目 |
| F15 | `src/plugins/index.js` | 删除 `PaginationPlugin` 的 export |

### 4.3 修改的示例/Demo 文件（3 个）

| # | 文件路径 | 核心改动 |
|---|----------|---------|
| E1 | `src/main.js` | 删除插件列表中的 `"pagination"`；删除 `syncPaginationUI` 函数；删除 `enableLargeDataMode` 方法；删除 `afterInit` 中 `pg.getPaginationData` 调用 |
| E2 | `index.html` | 删除 `getPagination()` 工具函数；删除数据加载后 `pg.refresh()` 调用 |
| E3 | `examples/custom-renderer-quickstart.js` | 删除对 `pageInfo` 的分页相关日志与示例；保留对冻结区域的说明但需改用其他方式（或整段示例改写） |

### 4.4 修改的测试文件（15 个）

| # | 文件路径 | 核心改动 |
|---|----------|---------|
| T1 | `tests/plugins/PaginationPlugin.test.js` | **整文件删除** |
| T2 | `tests/types/CellRenderContext.test.js` | 删除"分页冻结信息完整性"用例；删除 `pageInfo`/`pageContext` 断言 |
| T3 | `tests/workbook/SheetEventBus.test.js` | 删除对 `SHEET_EVENTS.PAGINATION_REFRESH` 的监听断言 |
| T4 | `tests/workbook/Sheet.test.js` | 删除 `pageContext`、`toRealRow`、`toPageRow`、`#refreshPagination` 相关 mock/断言 |
| T5 | `tests/workbook/SheetStyleManager.test.js` | 检查并删除对分页行号转换的断言 |
| T6 | `tests/model/grid/RowColManager.test.js` | 删除 `setPaginationBounds`、`clearPaginationBounds`、`pageStartRow`、`pageEndRow` 及分页模式下 `totalHeight/rowCount/getRowY/getRowHeight/rowAt` 所有断言 |
| T7 | `tests/model/grid/RowColManager.BugHunt.test.js` | 同上 |
| T8 | `tests/render/HeaderRenderer.test.js` | 若有 `pageContext` mock，删除 |
| T9 | `tests/render/TileRenderer.customRenderer.test.js` | 删除 `useRealRows` / `pageContext` 相关断言 |
| T10 | `tests/render/OverlayRenderer.test.js` | 删除 "skip merges outside page range in pagination mode" 用例 |
| T11 | `tests/render/layers/TileLayer.test.js` | 删除分页相关 options 断言 |
| T12 | `tests/render/layers/FrozenLayer.test.js` | 删除 "pass useRealRows option when pagination is active"、"should not pass useRealRows when not active" 两个用例 |
| T13 | `tests/CustomRenderer.test.js` | 删除 `pageSize`、`defaultToRealRow` 使用；删除"分页模式第2页的行号计算"、"冻结+分页组合场景" 等用例 |
| T14 | `tests/editor/ClipboardManager.test.js` | 若存在 pageRow 转换，调整为实际行号 |
| T15 | `tests/editor/CellEditor.test.js` | 同上 |

---

## 5. 核心代码变化示例

> 本节展示典型片段"重构前 → 重构后"对照，便于理解意图而非作为精确 diff。

### 5.1 RowColManager.getRowY

**前：**
```js
getRowY(row) {
    if (this.#pageStartRow >= 0 && this.#pageEndRow > this.#pageStartRow) {
        const realRow = this.#pageStartRow + row;
        const pageStartY = this.#rawGetRowY(this.#pageStartRow);
        return this.#rawGetRowY(realRow) - pageStartY;
    }
    return this.#rawGetRowY(row);
}
```

**后：**
```js
getRowY(row) {
    return this.#rawGetRowY(row);
}
```

### 5.2 TileRenderer.#paintTile

**前：**
```js
const useRealRows = options?.useRealRows === true;
const pc = options?.pageContext ?? sheet.pageContext;

const sr = useRealRows ? pc.realRowAt(pixelY0) : pc.pageRowAt(pixelY0);
const er = Math.min(
    (useRealRows ? pc.realRowAt(pixelY1) : pc.pageRowAt(pixelY1)) + 1,
    useRealRows ? pc.raw.rowCount : pc.pageViewRowCount
);

for (let r = sr; r < er; r++) {
    const rowY = useRealRows ? pc.getRealRowY(r) : pc.getPageRowY(r);
    const rowH = useRealRows ? pc.getRealRowHeight(r) : pc.getPageRowHeight(r);
    const realR = useRealRows ? r : sheet.toRealRow(r);
    // ...
}
```

**后：**
```js
const rc = sheet.rowColManager;

const sr = rc.rowAt(pixelY0);
const er = Math.min(rc.rowAt(pixelY1) + 1, rc.rowCount);

for (let r = sr; r < er; r++) {
    const rowY = rc.getRowY(r);
    const rowH = rc.getRowHeight(r);
    // realR === r; 无转换
    // ...
}
```

### 5.3 Sheet.setCell

**前：**
```js
setCell(r, c, value, styleId = 0, disabled = false) {
    if (!this.#ensureWritable()) return;
    const realR = this.toRealRow(r);
    this.rowColManager.ensureSize(realR + 1, c + 1);
    // ... 使用 realR 写入 cellStore
}
```

**后：**
```js
setCell(r, c, value, styleId = 0, disabled = false) {
    if (!this.#ensureWritable()) return;
    this.rowColManager.ensureSize(r + 1, c + 1);
    // ... 直接使用 r 写入 cellStore（r 即实际行号）
}
```

### 5.4 OverlayRenderer.renderMerges

**前：**
```js
const pc = sheet.pageContext;
const pageStart = pc.pageStart;
const pageEnd = pc.pageEnd;

for (const merge of sheet.getAllMerges()) {
    const { topRow, topCol, bottomRow, bottomCol } = merge;
    if (pc.isActive) {
        if (bottomRow < pageStart || topRow >= pageEnd) continue;
    }
    const pageTopRow = pc.toPageRow(topRow);
    const pageBottomRow = pc.toPageRow(bottomRow);
    const rect = vt.mergeToViewRect({
        topRow: pageTopRow, topCol,
        bottomRow: pageBottomRow, bottomCol
    });
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}
```

**后：**
```js
for (const merge of sheet.getAllMerges()) {
    const { topRow, topCol, bottomRow, bottomCol } = merge;
    const rect = vt.mergeToViewRect({ topRow, topCol, bottomRow, bottomCol });
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}
```

### 5.5 CellRenderContext 构造参数

**前：**
```js
new CellRenderContext({
    ctx, x, y, w, h,
    row, col, realRow, realCol, value, displayValue, style,
    sheet, isDisabled, isMerged, mergeInfo,
    pageInfo: { isPaged, currentPage, pageSize, frozenRowCount, ... },
    pageContext: sheet.pageContext,
});
```

**后（方案A）：**
```js
new CellRenderContext({
    ctx, x, y, w, h,
    row, col, value, displayValue, style,
    sheet, isDisabled, isMerged, mergeInfo,
    // 不再存在 pageInfo / pageContext 参数
});
```

---

## 6. 分阶段执行计划

### 阶段 1：删除插件层（最安全，暴露引用点）

```
目标：验证删除插件后，除与插件直接相关的用例外无其他隐式依赖。

操作：
  1. 删除 src/plugins/PaginationPlugin.js
  2. 删除 tests/plugins/PaginationPlugin.test.js
  3. 修改 src/plugins/registry.js、src/plugins/index.js
  4. 修改 src/constants/sheetEvents.js（PAGINATION_REFRESH）
  5. 修改 src/constants/hookNames.js（AFTER_PAGE_CHANGE / AFTER_PAGE_SIZE_CHANGE）
  6. 修改 src/workbook/Workbook.js（移除对已删除事件的监听）
  7. 修改 src/main.js（从插件列表删除 "pagination"）

验证：
  $ npm test
  → 预期失败：所有尝试访问 pageContext / toRealRow 的测试
  → 这些失败即为后续阶段的修改清单
```

### 阶段 2：删除坐标转换层（核心破坏性变更）

```
目标：彻底删除 PageContext，使 RowColManager 行为全局化。

操作：
  1. 删除 src/model/grid/PageContext.js
  2. 修改 src/model/grid/RowColManager.js（F1）
  3. 修改 src/model/grid/CellDataAccessor.js（F2）
  4. 修改 src/workbook/Sheet.js（F3）

验证：
  $ npm test
  → 预期大量渲染层测试失败（因它们仍在访问 pageContext）
```

### 阶段 3：简化渲染层（以测试失败为引导）

```
目标：让渲染链路不再依赖分页判断。

顺序建议（每个文件改完跑一次测试）：
  1. src/render/ViewportTransform.js（F8）
  2. src/render/OverlayRenderer.js（F10）
  3. src/render/layers/TileLayer.js（F12）
  4. src/render/layers/FrozenLayer.js（F11）
  5. src/render/TileRenderer.js（F9）
  6. src/render/RenderEngine.js（F7）

验证：
  → 每次修改后跑测试，错误应该逐层减少
```

### 阶段 4：清理渲染上下文

```
目标：删除 CellRenderContext 中最后的分页残留。

操作：
  1. 修改 src/types/CellRenderContext.js（F13）

验证：
  $ npm test
  → 预期仅剩"测试文件本身仍在用 pageContext mock"的错误
```

### 阶段 5：示例/Demo 清理

```
操作：
  1. 修改 src/main.js（E1，阶段1已做一部分，这里清理剩余 UI）
  2. 修改 index.html（E2）
  3. 修改 examples/custom-renderer-quickstart.js（E3）

验证：
  → 在浏览器中打开 index.html，无控制台错误
  → 滚动 / 冻结 / 合并单元格 / 编辑 / 选择 功能正常
```

### 阶段 6：测试整理

```
目标：按 T1-T15 清单删除或重写相关测试用例，
     使 npm test 全通过。

策略：
  - 明确与分页相关的用例（如 "should apply pagination bounds on init"）：直接删除
  - 用例中仅部分断言涉及 pageRow/realRow 转换：保留主干，更新断言
  - mock `pageContext` 的测试：改为 mock `rowColManager` 或改用集成方式
```

### 阶段 7（可选）：文档同步

```
更新 docs/ 与 designDocument/ 中所有提及分页的章节：
  - CELL_DATA_ACCESSOR_GUIDE.md
  - ViewportTransform.md
  - FrozenLayer.md
  - plugin-system.md
  - REFACTORING_REPORT.md
  - maxRows-maxCols-usage.md
  - cell-style-usage.md
  - sheet-switch-hooks-usage.md
  - row-col-headers-config.md
  - formula-engine-guide.md
  - SheetStyleManager.md
  - LAYER_ARCHITECTURE.md
  - custom-renderer-api.md
  - cell-style-refactoring.md
  - CUSTOM_RENDERER_FIX_REPORT.md

如暂不更新，需在 commit message 中标注：
  "文档中关于分页的章节已过时，仅供历史参考"。
```

---

## 7. 关键风险点与应对措施

| 风险 | 说明 | 影响范围 | 应对措施 |
|-----|------|---------|---------|
| **行号语义双重转换残留** | 外部调用方（如 `main.js` demo）原本传入页面行号，删除后需传实际行号，若遗漏会导致数据写入错位 | 数据读写路径 | 在阶段 5 后对 `main.js` 中所有调用 `sheet.setCell(r,c,value)` 的 `r` 做代码审查 |
| **合并单元格返回值语义变化** | `Sheet.getMerge` 曾将 `topRow/bottomRow` 转为页面行号；删除后直接返回实际行号，渲染层在合并判断时可能越界 | OverlayRenderer、ViewportTransform | 全局 grep `getMerge`，对每个调用点人工确认其行号使用方式 |
| **滚动条高度变化** | 分页模式下 `totalHeight` 是"页面高度"，删除后变为"全局高度"，若 UI 依赖滚动条高度=页面高度，视觉会变化 | ScrollManager | 打开 demo 手动验证滚动行为；如 ScrollManager 自身无分页分支则无需修改 |
| **冻结行视觉错位** | 分页模式下的 `effectiveFrozenRowsH = (isPaginationActive && pageStart > 0) ? 0 : frozenRowsH` 是为避免"冻结行不在当前页"而设；删除后冻结行永远显示在顶部 | RenderEngine | 手动在有冻结行+大量数据的 demo 中验证；此变化在删除分页后**逻辑上是正确的**（冻结行即应该在顶部） |
| **公共 API 破坏** | `wb.getPlugin("pagination")`、`pg.setPage`、`pg.setPageSize`、`pg.nextPage`、`pg.getPaginationData` 全部不存在 | 所有使用了分页插件的外部代码 | 在 release notes 中明确列出已删除 API；若项目有 CI 构建，也可在 PR 描述中强调 |
| **测试中 mock 残留** | 大量测试通过 `vi.spyOn(sheet, "pageContext")` mock 行为，删除属性后会直接抛错 | 测试文件 T2-T15 | 在阶段 6 中"用 grep 批量定位 + 逐条修" |
| **TileRenderer 参数签名变化** | `#drawCellContentOrText` / `#createRenderContext` 将从 `(ctx, sheet, pageRow, col, realR, ...)` 改为 `(ctx, sheet, row, col, ...)` | 可能有其他调用者 | 在重构前先对全局做 `grep -n "drawCellContentOrText\|createRenderContext"` 确认调用点数量 |
| **CellRenderContext 的 pageInfo 冻结信息被误删** | 方案A 会删除整个 `pageInfo`，其中也包含非分页的冻结区域信息（如 `frozenRowCount`、`isInFrozenArea`） | 自定义渲染器的示例代码 | 可在 **重构完成后的独立任务** 中新增一个 `viewportInfo` 属性替代；本次重构优先级：先保证分页完全移除 + 基本冻结/渲染功能可用 |

---

## 8. 测试策略

### 8.1 基线快照

重构前先在本地跑一次基线，记录通过/失败数量：

```bash
$ npm test > test-before.log 2>&1
```

以便重构后核对"新增失败"与"预期删除的用例"。

### 8.2 测试断言改写思路

| 场景 | 原断言 | 新断言 |
|-----|--------|--------|
| RowColManager 分页模式 | `rc.setPaginationBounds(10, 20); expect(rc.rowCount).toBe(10)` | **删除该用例**（分页功能已不存在） |
| Sheet 行号转换 | `expect(sheet.toRealRow(0)).toBe(10)` | **删除该用例** |
| TileRenderer 冻结区域（分页时冻结行不在页面） | `expect(useRealRows).toBe(false)` | **删除该用例**，或改为验证冻结行永远绘制在顶部 |
| OverlayRenderer 分页过滤 | `expect(merge not drawn when outside page)` | **删除该用例**，合并单元格永远绘制 |
| CustomRenderer 分页+冻结组合 | `expect(ctx.pageInfo.isPaged).toBe(true)` | **删除该用例**（pageInfo 已不存在） |
| CellRenderContext 构造完整性 | `expect(ctx.pageInfo.frozenRows).toBe(3)` | **删除该断言**，或改为替代方案 |

### 8.3 新增建议的测试（可选）

重构完成后可考虑补充以下用例来验证"未回归"：

- `Sheet.setCell(row, col, value)`：验证行号不再被隐式偏移
- `RowColManager.rowCount/totalHeight/getRowY`：验证无论数据量多大都返回全局值
- `TileRenderer` 在有 1000 行数据时的绘制首行/末行行为验证
- `FrozenLayer` 在 1000 行数据时的冻结行渲染验证

但这些不是本次重构的必须项。

---

## 9. 公共 API 破坏性变更说明

### 9.1 已删除的插件

| API | 之前行为 | 替代方案 |
|-----|---------|---------|
| `wb.getPlugin("pagination")` | 返回 `PaginationPlugin` 实例 | **无替代**（功能已删除） |
| `pg.setPage(n)` | 跳转到第 n 页 | **无替代** |
| `pg.setPageSize(size)` | 设置每页行数 | **无替代** |
| `pg.nextPage()` / `pg.prevPage()` | 翻页 | **无替代** |
| `pg.getPaginationData()` | 返回分页状态快照 | **无替代** |
| `pg.active` | 是否激活分页 | **无替代** |
| `pg.pageSize` / `pg.currentPage` / `pg.totalPages` | 获取分页状态 | **无替代** |

### 9.2 已删除的事件 & Hook

| 常量 | 之前触发时机 | 替代方案 |
|-----|-------------|---------|
| `SHEET_EVENTS.PAGINATION_REFRESH` | 分页刷新 | **无替代** |
| `HOOKS.AFTER_PAGE_CHANGE` | 页码变化后 | **无替代** |
| `HOOKS.AFTER_PAGE_SIZE_CHANGE` | 每页行数变化后 | **无替代** |

### 9.3 行号语义变化

| API | 之前语义 | 新语义 | 迁移建议 |
|-----|---------|--------|---------|
| `sheet.setCell(row, col, value)` | `row` 可能为"页面行号"（当分页激活时） | `row` 永远是"实际行号"（即 cellStore 中的 index） | 外部调用方：若之前在分页模式下传页面行号，现需改为传实际行号 |
| `sheet.toRealRow(pageRow)` | 页面行号 → 实际行号 | **方法已删除** | 不需要（row 即实际行号） |
| `sheet.toPageRow(realRow)` | 实际行号 → 页面行号 | **方法已删除** | 不需要 |
| `sheet.pageContext` | 返回 PageContext 实例 | **属性已删除** | 不需要 |
| `cellRenderContext.pageInfo` | 分页+冻结信息对象 | **属性已删除（方案A）** | 若需要冻结信息，请通过 `sheet.fixedRowsTop` / `sheet.fixedColumnsStart` 直接访问 |
| `cellRenderContext.pageContext` | PageContext 实例 | **属性已删除（方案A）** | 不需要 |

### 9.4 RowColManager 简化 API

| API | 之前语义 | 新语义 |
|-----|---------|--------|
| `rc.totalHeight` | 分页模式下 = 页面高度；否则 = 全局高度 | **永远 = 全局高度** |
| `rc.rowCount` | 分页模式下 = 每页行数；否则 = 总行数 | **永远 = 总行数** |
| `rc.getRowY(row)` | 分页模式下 = 相对页顶偏移；否则 = 相对全局顶 | **永远 = 相对全局顶部的像素偏移** |
| `rc.getRowHeight(row)` | 分页模式下 row 会被加 pageStartRow 再查 | **永远 = 直接查 row 的行高** |
| `rc.rowAt(y)` | 分页模式下 y 被视为页内相对偏移 | **永远 = 全局 y → 行号** |
| `rc.setPaginationBounds(start, end)` | 设置分页边界 | **方法已删除** |
| `rc.clearPaginationBounds()` | 清除分页边界 | **方法已删除** |
| `rc.pageStartRow` / `rc.pageEndRow` | 分页边界只读 | **属性已删除** |

---

## 10. 验收标准

完成本次重构后，以下所有条件应同时满足：

### ✅ 10.1 代码层面

- [ ] `src/model/grid/PageContext.js` 已不存在
- [ ] `src/plugins/PaginationPlugin.js` 已不存在
- [ ] `tests/plugins/PaginationPlugin.test.js` 已不存在
- [ ] 对 `src/`、`tests/`、`examples/`、`index.html` 执行以下 grep 无命中（合理例外需人工确认）：
  ```
  grep -rn "pagination\|PaginationPlugin\|pageContext\|pageStartRow\|pageEndRow\|useRealRows\|setPaginationBounds\|clearPaginationBounds" src/ tests/ examples/ index.html
  ```
- [ ] `toRealRow`、`toPageRow`、`pageRow`、`AFTER_PAGE_CHANGE`、`AFTER_PAGE_SIZE_CHANGE`、`PAGINATION_REFRESH` 无残留引用

### ✅ 10.2 测试层面

- [ ] `npm test` 全部通过
- [ ] 无新增的跳过/忽略标记
- [ ] 覆盖率报告中不因本次重构出现非预期的大幅下降

### ✅ 10.3 功能层面（在浏览器中验证）

- [ ] 打开 `index.html` 无 JS 控制台错误
- [ ] 单元格渲染正常（100 行 × 20 列数据量下视觉无错位）
- [ ] 合并单元格正常显示
- [ ] 冻结行 / 冻结列正常工作
- [ ] 滚动条可用，滚动范围正确（对应全局总高度）
- [ ] 点击 / 选择单元格行为正确
- [ ] 编辑单元格后，数据正确写入 cellStore
- [ ] 自定义渲染器（custom-renderer-quickstart.js）示例正常运行
- [ ] 插件系统中 autoFill / contextMenu / formula / sort / dataValidation 等其他插件不受影响

### ✅ 10.4 文档层面（若执行阶段 7）

- [ ] `designDocument/remove-pagination-refactoring-design.md`（本文件）已加入仓库
- [ ] 其他设计文档中涉及分页的章节已删除或标注"仅供历史参考"
- [ ] commit message 清晰标注：Breaking Change - Pagination removed