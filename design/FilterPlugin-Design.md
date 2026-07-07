# FilterPlugin 筛选功能详细设计文档

> 版本：v1.1  
> 日期：2026-06-30  
> 作者：项目组  
> 状态：设计阶段

---

## 目录

1. [功能概述](#1-功能概述)
2. [需求分析](#2-需求分析)
3. [整体架构设计](#3-整体架构设计)
4. [模块详细设计](#4-模块详细设计)
5. [虚拟滚动设计](#5-虚拟滚动设计)
6. [数据流设计](#6-数据流设计)
7. [钩子系统扩展](#7-钩子系统扩展)
8. [与现有插件的交互](#8-与现有插件的交互)
9. [渲染层集成](#9-渲染层集成)
10. [API 设计](#10-api-设计)
11. [配置项设计](#11-配置项设计)
12. [文件结构](#12-文件结构)
13. [测试计划](#13-测试计划)
14. [实现路线图](#14-实现路线图)

---

## 1. 功能概述

### 1.1 目标

为 Canvas Excel 项目添加列筛选功能，允许用户通过列头下拉菜单对数据进行筛选，隐藏不符合条件的行。功能对标 Excel 和 Handsontable 的筛选体验。

### 1.2 核心特性

| 特性 | 描述 |
|------|------|
| 列头筛选按钮 | 在列头右侧显示漏斗图标，点击打开筛选下拉面板 |
| 值列表筛选 | 显示该列所有唯一值，支持勾选/取消勾选 |
| 文本搜索 | 在值列表中搜索特定值 |
| 条件筛选 | 支持按条件筛选（等于、不等于、包含、大于、小于等） |
| 多列筛选 | 支持同时对多列设置筛选条件 |
| 筛选指示器 | 已筛选列的列头显示激活状态的漏斗图标 |
| 全选/取消全选 | 一键操作所有值的勾选状态 |
| 清除筛选 | 一键清除当前列或所有列的筛选 |
| 虚拟滚动 | 唯一值过多时自动启用虚拟滚动，避免 DOM 渲染卡顿 |

### 1.3 UI 示意

```
┌─────────┬─────────┬──────────┐
│  A ▼ 🔍 │  B ▼ 🔍 │  C ▼  🔍 │  ← 列头（🔍 = 筛选按钮）
├─────────┼─────────┼──────────┤
│ Alice   │   30    │  Sales   │
│ Bob     │   25    │  Dev     │
│ Carol   │   35    │  Sales   │  ← 数据行
│ David   │   28    │  Dev     │
│ Eve     │   30    │  HR      │
└─────────┴─────────┴──────────┘

点击列头筛选按钮后弹出下拉面板：
┌──────────────────────────┐
│  🔍 搜索...              │  ← 搜索框
├──────────────────────────┤
│  ☑ 全选                  │  ← 全选/取消全选
├──────────────────────────┤
│  ☑ Alice                 │
│  ☑ Bob                   │  ← 值列表（带复选框）
│  ☑ Carol                 │  ← 唯一值超过阈值时启用虚拟滚动
│  ☑ David                 │
│  ☑ Eve                   │
├──────────────────────────┤
│  条件筛选 ▼               │  ← 条件筛选展开
│  ┌──────────────────┐    │
│  │ 等于...          │    │
│  │ 不等于...        │    │
│  │ 包含...          │    │
│  │ 大于...          │    │  ← 条件筛选选项
│  │ 小于...          │    │
│  │ 开头是...        │    │
│  │ 结尾是...        │    │
│  └──────────────────┘    │
├──────────────────────────┤
│  [清除筛选]    [确定]     │  ← 操作按钮
└──────────────────────────┘
```

---

## 2. 需求分析

### 2.1 功能需求

| 编号 | 需求 | 优先级 | 描述 |
|------|------|--------|------|
| F-01 | 列头筛选按钮 | P0 | 在列头区域显示可点击的筛选图标 |
| F-02 | 值列表筛选 | P0 | 展示列内所有唯一值，支持勾选筛选 |
| F-03 | 搜索过滤 | P0 | 在值列表中搜索文本 |
| F-04 | 全选/取消全选 | P0 | 快捷操作所有值的勾选状态 |
| F-05 | 条件筛选 | P1 | 按条件表达式筛选（等于、包含、大于等） |
| F-06 | 多列筛选 | P0 | 支持同时对多列设置不同筛选条件 |
| F-07 | 筛选状态指示 | P0 | 已筛选列的图标变色 |
| F-08 | 清除筛选 | P0 | 清除单列或全部筛选 |
| F-09 | 筛选与排序协同 | P1 | 筛选后排序仅作用于可见行 |
| F-10 | 筛选与冻结协同 | P1 | 冻结行不参与筛选 |
| F-11 | 筛选行数统计 | P1 | 显示筛选后剩余行数 |
| F-12 | 自定义筛选条件 | P2 | 支持自定义筛选函数 |
| F-13 | 虚拟滚动 | P0 | 唯一值超过阈值时自动启用虚拟滚动，避免 DOM 卡顿 |

### 2.2 非功能需求

| 编号 | 需求 | 指标 |
|------|------|------|
| NF-01 | 性能 | 10万行数据筛选响应 < 200ms |
| NF-02 | 唯一值提取 | 10万行数据唯一值提取 < 100ms |
| NF-03 | 下拉面板渲染 | 面板打开/关闭 < 50ms |
| NF-04 | 内存 | 筛选状态增量内存 < 1MB/列 |
| NF-05 | 虚拟滚动 | 5000+ 唯一值时面板打开 < 100ms，滚动帧率 > 30fps |
| NF-06 | DOM 节点数 | 虚拟滚动模式下值列表 DOM 节点数 ≤ 可视区行数 + 缓冲行数 |

---

## 3. 整体架构设计

### 3.1 架构定位

筛选功能作为独立插件（FilterPlugin）集成到现有插件体系中，遵循 BasePlugin 生命周期模式，与 SortPlugin 架构对齐。

### 3.2 模块关系图

```
┌─────────────────────────────────────────────────────────────┐
│                        Workbook                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    PluginManager                      │   │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │   │
│  │  │ SortPlugin │  │FilterPlugin│  │ FreezePlugin  │  │   │
│  │  └────────────┘  └─────┬──────┘  └───────────────┘  │   │
│  └────────────────────────┼────────────────────────────┘   │
│                           │                                  │
│  ┌────────────────────────┼────────────────────────────┐   │
│  │              FilterPlugin 内部模块                    │   │
│  │                        │                              │   │
│  │  ┌─────────────┐  ┌───┴───────┐  ┌──────────────┐  │   │
│  │  │ FilterState │  │FilterEngine│  │FilterUIManager│  │   │
│  │  └─────────────┘  └───────────┘  └──────┬───────┘  │   │
│  │                                          │           │   │
│  │                                   ┌──────┴──────┐   │   │
│  │                                   │FilterDropdown│   │   │
│  │                                   │ extends      │   │   │
│  │                                   │ DOMComponent │   │   │
│  │                                   └──────┬──────┘   │   │
│  │                                          │           │   │
│  │                              ┌───────────┴────────┐  │   │
│  │                              │VirtualValueList     │  │   │
│  │                              │ extends DOMComponent│  │   │
│  │                              └────────────────────┘  │   │
│  │  ┌────────────────┐                                │   │
│  │  │ FilterStrategy │  ← 事件策略                    │   │
│  │  └────────────────┘                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    渲染层                             │   │
│  │  ┌──────────────┐  ┌────────────┐  ┌─────────────┐  │   │
│  │  │ HeaderRenderer│  │HeaderLayer │  │SelectionLayer│  │   │
│  │  └──────────────┘  └────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    数据层                             │   │
│  │  ┌────────────────┐  ┌──────────────┐               │   │
│  │  │ ChunkedCellStore│  │HiddenRowsPlugin│              │   │
│  │  └────────────────┘  └──────────────┘               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 核心设计决策

| 决策 | 方案 | 原因 |
|------|------|------|
| 行隐藏机制 | 复用 HiddenRowsPlugin | 避免重复实现行隐藏逻辑，与现有插件协同 |
| 筛选状态存储 | FilterState 独立管理 | 与 SortState 对齐，职责清晰 |
| 下拉面板实现 | DOMComponent 子类 + Portal | 遵循项目 DOM 组件规范，自动管理生命周期 |
| 唯一值提取 | 延迟计算 + 缓存 | 避免每次打开面板都重新计算 |
| 筛选执行 | 通过 HiddenRowsPlugin 隐藏行 | 统一行的可见性管理 |
| DOM 生命周期 | 继承 DOMComponent | 使用 createElement / trackEvent / injectStyle，destroy 自动清理 |
| 大数据量值列表 | VirtualValueList 虚拟滚动 | 唯一值超过阈值时仅渲染可视区 DOM，避免卡顿 |

---

## 4. 模块详细设计

### 4.1 FilterPlugin

主插件类，继承 `BasePlugin`，负责协调各子模块的生命周期。

```javascript
// src/plugins/FilterPlugin.js

import { BasePlugin } from "./BasePlugin.js";
import { FilterState } from "./filter/FilterState.js";
import { FilterEngine } from "./filter/FilterEngine.js";
import { FilterUIManager } from "./filter/FilterUIManager.js";
import { FilterStrategy } from "./filter/FilterStrategy.js";
import { HOOKS } from "../constants/hookNames.js";
import { SHEET_EVENTS } from "../constants/sheetEvents.js";

export class FilterPlugin extends BasePlugin {

    static get PLUGIN_NAME() {
        return "filter";
    }

    /** @type {FilterState} 筛选状态管理器 */
    #filterState;

    /** @type {FilterEngine} 筛选引擎 */
    #filterEngine;

    /** @type {FilterUIManager} 筛选 UI 管理器 */
    #filterUIManager;

    /** @type {FilterStrategy} 筛选事件策略 */
    #filterStrategy;

    /** @type {boolean} 插件是否激活 */
    #active = false;

    /** @type {Function|null} 列头渲染回调 */
    #headerRendererCallback = null;

    /** @type {Function|null} 工作表切换取消订阅 */
    #sheetSwitchUnsubscribe = null;

    /** @type {object} 合并后的配置 */
    #options;

    static DEFAULT_OPTIONS = {
        filterButtonVisible: true,
        conditionOperators: [
            "eq", "neq", "contains", "notContains",
            "startsWith", "endsWith", "gt", "gte", "lt", "lte",
        ],
        customFilterFn: null,
        dropdownWidth: 240,
        dropdownMaxHeight: 360,
        virtualScrollThreshold: 200,
        maxUniqueValues: 10000,
        searchDebounceMs: 150,
    };

    constructor(workbook) {
        super(workbook);
        this.#filterState = new FilterState();
        this.#filterUIManager = new FilterUIManager(this);
        this.#filterEngine = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    init(options = {}) {
        super.init(options);

        this.#options = { ...FilterPlugin.DEFAULT_OPTIONS, ...options };

        const sheet = this.sheet;
        if (!sheet) return;

        this.#initFilterEngine(sheet);

        this.#filterStrategy = new FilterStrategy(this.eventHandler, this);
        this.addStrategy("filter", this.#filterStrategy);

        this.#filterUIManager.init(this.#options);

        this.#registerHeaderRenderer();

        this.addHook(HOOKS.AFTER_CHANGE, () => {
            this.#filterState.invalidateColumnCache();
        });

        this.addHook(HOOKS.AFTER_SORT, () => {
            this.#reapplyFilter();
        });

        this.#bindSheetSwitchListener(sheet);

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    destroy() {
        this.#filterUIManager.destroy();
        this.#filterState.clearAll();
        this.#unbindSheetSwitchListener();
        this.#unregisterHeaderRenderer();
        super.destroy();
        this.#active = false;
    }

    enable() {
        super.enable();
        this.#active = true;
        this.render();
    }

    disable() {
        super.disable();
        this.#active = false;
        this.#filterUIManager.closeDropdown();
        this.render();
    }

    // ═══════════════════════════════════════════════════════════════
    // 公共 API
    // ═══════════════════════════════════════════════════════════════

    getFilterState() {
        return this.#filterState;
    }

    getFilterEngine() {
        return this.#filterEngine;
    }

    getFilterUIManager() {
        return this.#filterUIManager;
    }

    getOptions() {
        return this.#options;
    }

    get active() {
        return this.#active;
    }

    addFilter(col, condition) {
        const result = this.hooks?.runHook(HOOKS.BEFORE_FILTER, { col, filter: condition });
        if (result === false) return;

        this.#filterState.setColumnFilter(col, condition);
        this.#applyFilter();
    }

    clearColumnFilter(col) {
        const result = this.hooks?.runHook(HOOKS.BEFORE_FILTER_CLEAR, { col });
        if (result === false) return;

        this.#filterState.removeColumnFilter(col);
        this.#applyFilter();

        this.hooks?.runHook(HOOKS.AFTER_FILTER_CLEAR, { col });
    }

    clearAllFilters() {
        const result = this.hooks?.runHook(HOOKS.BEFORE_FILTER_CLEAR, { col: null });
        if (result === false) return;

        this.#filterState.clearAll();
        this.#applyFilter();

        this.hooks?.runHook(HOOKS.AFTER_FILTER_CLEAR, { col: null });
    }

    getUniqueValues(col) {
        return this.#filterEngine.extractUniqueValues(col);
    }

    getFilteredRowCount() {
        return this.#filterState.visibleRowCount;
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有方法
    // ═══════════════════════════════════════════════════════════════

    #initFilterEngine(sheet) {
        if (!sheet) return;
        this.#filterEngine = new FilterEngine(
            sheet.cellStore,
            this.#filterState,
            sheet.rowColManager?.rowCount || 1000
        );
    }

    #registerHeaderRenderer() {
        this.#headerRendererCallback = (ctx, col, x, y, w, h) => {
            this.#filterUIManager.drawFilterIndicator(ctx, col, x, y, w, h);
        };
        this.renderEngine?.headerRenderer?.registerColumnHeaderRenderer(
            this.#headerRendererCallback
        );
    }

    #unregisterHeaderRenderer() {
        if (this.#headerRendererCallback) {
            this.renderEngine?.headerRenderer?.unregisterColumnHeaderRenderer(
                this.#headerRendererCallback
            );
            this.#headerRendererCallback = null;
        }
    }

    #applyFilter() {
        if (!this.#filterEngine) return;

        const sheet = this.sheet;
        const fixedRowsTop = sheet?.fixedRowsTop || 0;

        const hiddenRows = this.#filterEngine.computeHiddenRows({ fixedRowsTop });
        this.#applyHiddenRows(hiddenRows);

        this.#filterState.setVisibleRowCount(
            this.#filterEngine.computeVisibleRowCount({ fixedRowsTop })
        );

        this.renderEngine?.invalidateAll();
        this.render();

        this.hooks?.runHook(HOOKS.AFTER_FILTER, {
            columnFilters: this.#filterState.getAllColumnFilters(),
            hiddenRows,
            visibleRowCount: this.#filterState.visibleRowCount,
        });
    }

    #reapplyFilter() {
        if (this.#filterState.hasActiveFilters()) {
            this.#applyFilter();
        }
    }

    #applyHiddenRows(hiddenRows) {
        const hiddenRowsPlugin = this.workbook.getPlugin("hiddenRows");
        if (hiddenRowsPlugin) {
            hiddenRowsPlugin.setFilterHiddenRows(hiddenRows);
        }
    }

    #bindSheetSwitchListener(sheet) {
        if (!sheet?.bus) return;
        this.#unbindSheetSwitchListener();
        this.#sheetSwitchUnsubscribe = sheet.bus.on(
            SHEET_EVENTS.SHEET_SWITCHED,
            (envelope) => {
                const { currentSheet } = envelope.payload;
                const newSheet = this.workbook.sheets.get(currentSheet);
                if (newSheet) {
                    this.#onSheetSwitched(newSheet);
                }
            }
        );
    }

    #unbindSheetSwitchListener() {
        if (this.#sheetSwitchUnsubscribe) {
            this.#sheetSwitchUnsubscribe();
            this.#sheetSwitchUnsubscribe = null;
        }
    }

    #onSheetSwitched(newSheet) {
        this.#filterUIManager.closeDropdown();
        this.#filterState.clearAll();
        this.#initFilterEngine(newSheet);
        this.renderEngine?.invalidateAll();
        this.render();
    }
}
```

### 4.2 FilterState

筛选状态管理器，负责维护每列的筛选条件和缓存。

```javascript
// src/plugins/filter/FilterState.js

export class FilterState {

    /** @type {Map<number, ColumnFilter>} 各列的筛选条件 */
    #columnFilters = new Map();

    /** @type {Map<number, {values: Array, dirty: boolean}>} 各列唯一值缓存 */
    #uniqueValueCache = new Map();

    /** @type {number} 筛选后可见行数 */
    #visibleRowCount = -1;

    /** @type {boolean} 是否启用筛选按钮 */
    #filterButtonVisible = true;

    setColumnFilter(col, filter) {
        this.#columnFilters.set(col, filter);
        this.#invalidateCache(col);
    }

    getColumnFilter(col) {
        return this.#columnFilters.get(col);
    }

    removeColumnFilter(col) {
        this.#columnFilters.delete(col);
        this.#invalidateCache(col);
    }

    getAllColumnFilters() {
        return new Map(this.#columnFilters);
    }

    isColumnFiltered(col) {
        return this.#columnFilters.has(col) && this.#columnFilters.get(col).active;
    }

    hasActiveFilters() {
        return this.#columnFilters.size > 0;
    }

    clearAll() {
        this.#columnFilters.clear();
        this.#uniqueValueCache.clear();
        this.#visibleRowCount = -1;
    }

    getCachedUniqueValues(col) {
        const cached = this.#uniqueValueCache.get(col);
        if (cached && !cached.dirty) return cached.values;
        return null;
    }

    setCachedUniqueValues(col, values) {
        this.#uniqueValueCache.set(col, { values, dirty: false });
    }

    #invalidateCache(col) {
        const cached = this.#uniqueValueCache.get(col);
        if (cached) cached.dirty = true;
    }

    invalidateColumnCache() {
        for (const entry of this.#uniqueValueCache.values()) {
            entry.dirty = true;
        }
    }

    get visibleRowCount() { return this.#visibleRowCount; }
    setVisibleRowCount(count) { this.#visibleRowCount = count; }

    get filterButtonVisible() { return this.#filterButtonVisible; }
    set filterButtonVisible(val) { this.#filterButtonVisible = val; }
}

/**
 * @typedef {Object} ColumnFilter
 * @property {boolean} active - 筛选是否激活
 * @property {"value"|"condition"} type - 筛选类型
 * @property {ValueFilter} [valueFilter] - 值列表筛选配置
 * @property {ConditionFilter} [conditionFilter] - 条件筛选配置
 */

/**
 * @typedef {Object} ValueFilter
 * @property {Set<any>} uncheckedValues - 未勾选的值集合
 * @property {Array<{value: any, count: number}>} allValues - 所有唯一值列表
 */

/**
 * @typedef {Object} ConditionFilter
 * @property {string} operator - 操作符
 * @property {any} value - 比较值
 * @property {string} [logicalOp="and"] - 多条件逻辑运算
 * @property {ConditionFilter} [secondCondition] - 第二个条件
 */
```

### 4.3 FilterEngine

筛选引擎，负责执行筛选逻辑和计算隐藏行。

```javascript
// src/plugins/filter/FilterEngine.js

export class FilterEngine {

    /** @type {import("../../model/store/ChunkedCellStore.js").ChunkedCellStore} */
    #cellStore;

    /** @type {import("./FilterState.js").FilterState} */
    #filterState;

    /** @type {number} */
    #rowCount;

    constructor(cellStore, filterState, rowCount) {
        this.#cellStore = cellStore;
        this.#filterState = filterState;
        this.#rowCount = rowCount;
    }

    extractUniqueValues(col, options = {}) {
        const cached = this.#filterState.getCachedUniqueValues(col);
        if (cached) return cached;

        const { fixedRowsTop = 0, hiddenRows = new Set() } = options;
        const valueMap = new Map();

        for (let row = fixedRowsTop; row < this.#rowCount; row++) {
            if (hiddenRows.has(row)) continue;

            const cell = this.#cellStore.getCell(row, col);
            const value = cell?.value ?? null;
            const key = value === null ? "__NULL__" : String(value);

            valueMap.set(key, {
                value,
                count: (valueMap.get(key)?.count || 0) + 1,
            });
        }

        const values = Array.from(valueMap.values());
        values.sort((a, b) => {
            if (a.value === null) return 1;
            if (b.value === null) return -1;
            if (typeof a.value === "number" && typeof b.value === "number") {
                return a.value - b.value;
            }
            return String(a.value).localeCompare(String(b.value));
        });

        this.#filterState.setCachedUniqueValues(col, values);
        return values;
    }

    computeHiddenRows(options = {}) {
        const { fixedRowsTop = 0 } = options;
        const columnFilters = this.#filterState.getAllColumnFilters();

        if (columnFilters.size === 0) return new Set();

        const hiddenRows = new Set();

        for (let row = fixedRowsTop; row < this.#rowCount; row++) {
            let shouldHide = false;

            for (const [col, filter] of columnFilters) {
                if (!filter.active) continue;

                const cell = this.#cellStore.getCell(row, col);
                const value = cell?.value ?? null;

                if (!this.#matchesFilter(value, filter)) {
                    shouldHide = true;
                    break;
                }
            }

            if (shouldHide) hiddenRows.add(row);
        }

        return hiddenRows;
    }

    computeVisibleRowCount(options = {}) {
        const hiddenRows = this.computeHiddenRows(options);
        return this.#rowCount - hiddenRows.size;
    }

    #matchesFilter(value, filter) {
        if (filter.type === "value") {
            return this.#matchesValueFilter(value, filter.valueFilter);
        }
        if (filter.type === "condition") {
            return this.#matchesConditionFilter(value, filter.conditionFilter);
        }
        return true;
    }

    #matchesValueFilter(value, valueFilter) {
        if (!valueFilter) return true;
        const key = value === null ? "__NULL__" : String(value);
        return !valueFilter.uncheckedValues.has(key);
    }

    #matchesConditionFilter(value, conditionFilter) {
        if (!conditionFilter) return true;

        const firstResult = this.#evaluateCondition(value, conditionFilter);

        if (conditionFilter.secondCondition) {
            const secondResult = this.#evaluateCondition(value, conditionFilter.secondCondition);
            const logicalOp = conditionFilter.logicalOp || "and";
            return logicalOp === "and"
                ? firstResult && secondResult
                : firstResult || secondResult;
        }

        return firstResult;
    }

    #evaluateCondition(value, condition) {
        const { operator, value: compareValue } = condition;
        const strVal = String(value ?? "").toLowerCase();
        const strCmp = String(compareValue ?? "").toLowerCase();

        switch (operator) {
            case "eq":        return value === compareValue;
            case "neq":       return value !== compareValue;
            case "contains":  return strVal.includes(strCmp);
            case "notContains": return !strVal.includes(strCmp);
            case "startsWith": return strVal.startsWith(strCmp);
            case "endsWith":  return strVal.endsWith(strCmp);
            case "gt":        return Number(value) > Number(compareValue);
            case "gte":       return Number(value) >= Number(compareValue);
            case "lt":        return Number(value) < Number(compareValue);
            case "lte":       return Number(value) <= Number(compareValue);
            default:          return true;
        }
    }
}
```

### 4.4 FilterUIManager

筛选 UI 管理器，负责在列头绘制筛选图标和管理下拉面板。

```javascript
// src/plugins/filter/FilterUIManager.js

import { FilterDropdown } from "./FilterDropdown.js";

export class FilterUIManager {

    /** @type {import("../FilterPlugin.js").FilterPlugin} */
    #plugin;

    /** @type {FilterDropdown|null} */
    #dropdown = null;

    /** @type {Map<string, Path2D>} */
    #iconCache = new Map();

    static ICON_SIZE = 10;
    static ICON_PADDING = 4;
    static ACTIVE_COLOR = "#1890ff";
    static INACTIVE_COLOR = "#bfbfbf";
    static HOVER_COLOR = "#40a9ff";

    /** @type {number} */
    #hoveredCol = -1;

    constructor(plugin) {
        this.#plugin = plugin;
    }

    init(options = {}) {
        if (typeof Path2D !== "undefined") {
            this.#preCacheIcons();
        }
    }

    destroy() {
        this.closeDropdown();
        this.#iconCache.clear();
    }

    drawFilterIndicator(ctx, col, x, y, w, h) {
        const state = this.#plugin.getFilterState();
        if (!state.filterButtonVisible) return;

        const isActive = state.isColumnFiltered(col);
        const isHovered = this.#hoveredCol === col;

        const iconSize = FilterUIManager.ICON_SIZE;
        const padding = FilterUIManager.ICON_PADDING;
        const iconX = x + padding;
        const iconY = y + (h - iconSize) / 2;

        let color;
        if (isActive) {
            color = FilterUIManager.ACTIVE_COLOR;
        } else if (isHovered) {
            color = FilterUIManager.HOVER_COLOR;
        } else {
            color = FilterUIManager.INACTIVE_COLOR;
        }

        this.#drawFunnelIcon(ctx, iconX, iconY, iconSize, color);
    }

    getFilterButtonBounds(col, x, y, w, h) {
        const iconSize = FilterUIManager.ICON_SIZE;
        const padding = FilterUIManager.ICON_PADDING;
        return {
            x: x + padding - 2,
            y: y + (h - iconSize) / 2 - 2,
            width: iconSize + 4,
            height: iconSize + 4,
        };
    }

    setHoveredCol(col) {
        if (this.#hoveredCol !== col) {
            this.#hoveredCol = col;
            this.#plugin.renderEngine?.invalidateAll();
            this.#plugin.render();
        }
    }

    openDropdown(col, position) {
        this.closeDropdown();

        const uniqueValues = this.#plugin.getUniqueValues(col);
        const currentFilter = this.#plugin.getFilterState().getColumnFilter(col);
        const options = this.#plugin.getOptions();

        this.#dropdown = new FilterDropdown({
            col,
            position,
            uniqueValues,
            currentFilter,
            virtualScrollThreshold: options.virtualScrollThreshold,
            onApply: (filter) => {
                this.#plugin.addFilter(col, filter);
                this.closeDropdown();
            },
            onClear: () => {
                this.#plugin.clearColumnFilter(col);
                this.closeDropdown();
            },
            onClose: () => {
                this.closeDropdown();
            },
            container: this.#plugin.workbook.container,
        });

        this.#dropdown.open();
    }

    closeDropdown() {
        if (this.#dropdown) {
            this.#dropdown.destroy();
            this.#dropdown = null;
        }
    }

    toggleDropdown(col, position) {
        if (this.#dropdown?.col === col) {
            this.closeDropdown();
        } else {
            this.openDropdown(col, position);
        }
    }

    isDropdownOpen() {
        return this.#dropdown !== null;
    }

    #preCacheIcons() {
        const size = FilterUIManager.ICON_SIZE;
        const path = new Path2D();
        path.moveTo(0, 0);
        path.lineTo(size, 0);
        path.lineTo(size * 0.6, size * 0.5);
        path.lineTo(size * 0.6, size);
        path.lineTo(size * 0.4, size);
        path.lineTo(size * 0.4, size * 0.5);
        path.closePath();
        this.#iconCache.set("funnel", path);
    }

    #drawFunnelIcon(ctx, x, y, size, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = color;

        const cached = this.#iconCache.get("funnel");
        if (cached) {
            ctx.fill(cached);
        } else {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(size, 0);
            ctx.lineTo(size * 0.6, size * 0.5);
            ctx.lineTo(size * 0.6, size);
            ctx.lineTo(size * 0.4, size);
            ctx.lineTo(size * 0.4, size * 0.5);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}
```

### 4.5 FilterStrategy

筛选事件策略，注册到 EventHandler，处理列头点击事件。

```javascript
// src/plugins/filter/FilterStrategy.js

import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";

export class FilterStrategy {

    /** @type {import("../../core/EventHandler.js").EventHandler} */
    #eventHandler;

    /** @type {import("../FilterPlugin.js").FilterPlugin} */
    #plugin;

    constructor(eventHandler, plugin) {
        this.#eventHandler = eventHandler;
        this.#plugin = plugin;
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: this.#handleMouseDown.bind(this),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: this.#handleMouseMove.bind(this),
        };
    }

    #handleMouseDown(event) {
        if (!this.#plugin.active) return true;

        const hitResult = this.#plugin.renderEngine?.hitTest(event);
        if (!hitResult || hitResult.type !== HIT_TYPE.COL_HEADER) {
            return true;
        }

        const { col, bounds } = hitResult;
        const uiManager = this.#plugin.getFilterUIManager?.();
        if (!uiManager) return true;

        const buttonBounds = uiManager.getFilterButtonBounds(
            col, bounds.x, bounds.y, bounds.width, bounds.height
        );

        const { offsetX, offsetY } = event;
        if (
            offsetX >= buttonBounds.x &&
            offsetX <= buttonBounds.x + buttonBounds.width &&
            offsetY >= buttonBounds.y &&
            offsetY <= buttonBounds.y + buttonBounds.height
        ) {
            uiManager.toggleDropdown(col, {
                x: bounds.x,
                y: bounds.y + bounds.height,
            });
            return false;
        }

        return true;
    }

    #handleMouseMove(event) {
        if (!this.#plugin.active) return true;

        const hitResult = this.#plugin.renderEngine?.hitTest(event);
        if (!hitResult || hitResult.type !== HIT_TYPE.COL_HEADER) {
            const uiManager = this.#plugin.getFilterUIManager?.();
            if (uiManager) uiManager.setHoveredCol(-1);
            return true;
        }

        const { col, bounds } = hitResult;
        const uiManager = this.#plugin.getFilterUIManager?.();
        if (!uiManager) return true;

        const buttonBounds = uiManager.getFilterButtonBounds(
            col, bounds.x, bounds.y, bounds.width, bounds.height
        );

        const { offsetX, offsetY } = event;
        const isOverButton =
            offsetX >= buttonBounds.x &&
            offsetX <= buttonBounds.x + buttonBounds.width &&
            offsetY >= buttonBounds.y &&
            offsetY <= buttonBounds.y + buttonBounds.height;

        uiManager.setHoveredCol(isOverButton ? col : -1);

        return true;
    }
}
```

### 4.6 FilterDropdown（继承 DOMComponent）

筛选下拉面板，**继承 `DOMComponent`**，遵循项目 DOM 组件规范。

> **设计要点**：
> - 继承 `DOMComponent`（→ `Disposable`），使用 `createElement()` 创建 DOM 元素，destroy 时自动清理
> - 使用 `trackEvent()` 注册事件监听，destroy 时自动移除
> - 使用 `injectStyle()` 注入面板样式，destroy 时自动移除
> - 覆写 `onDestroy()` 释放特有资源
> - 对齐项目中 `FormulaBar`、`SheetTabBar`、`ValidationPortalManager` 的 DOM 组件模式
> - 唯一值超过 `virtualScrollThreshold` 时使用 `VirtualValueList` 替代直接渲染

```javascript
// src/plugins/filter/FilterDropdown.js

import { DOMComponent } from "../../core/DOMComponent.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { VirtualValueList } from "./VirtualValueList.js";

export class FilterDropdown extends DOMComponent {

    /** @type {number} 关联的列索引 */
    #col;

    /** @type {{x: number, y: number}} 面板定位 */
    #position;

    /** @type {Array<{value: any, count: number}>} 唯一值列表 */
    #uniqueValues;

    /** @type {ColumnFilter|null} 当前筛选条件 */
    #currentFilter;

    /** @type {number} 虚拟滚动阈值 */
    #virtualScrollThreshold;

    /** @type {Function} 应用筛选回调 */
    #onApply;

    /** @type {Function} 清除筛选回调 */
    #onClear;

    /** @type {Function} 关闭面板回调 */
    #onClose;

    /** @type {HTMLElement} 容器元素 */
    #container;

    /** @type {HTMLElement|null} 面板根元素（由 createElement 跟踪） */
    #panelEl = null;

    /** @type {HTMLInputElement|null} 搜索输入框 */
    #searchInput = null;

    /** @type {HTMLDivElement|null} 值列表容器 */
    #valueListEl = null;

    /** @type {VirtualValueList|null} 虚拟滚动列表实例 */
    #virtualList = null;

    /** @type {Set<string>} 当前未勾选的值 */
    #uncheckedValues = new Set();

    /** @type {string} 搜索关键词 */
    #searchKeyword = "";

    /** @type {string} 当前条件筛选操作符 */
    #conditionOperator = "contains";

    /** @type {string} 条件筛选值 */
    #conditionValue = "";

    /** @type {string} 当前标签页（"values" | "conditions"） */
    #activeTab = "values";

    /** 面板宽度 */
    static PANEL_WIDTH = 240;

    /** 面板最大高度 */
    static PANEL_MAX_HEIGHT = 360;

    /** 值列表可视区高度 */
    static VALUE_LIST_HEIGHT = 200;

    constructor(options) {
        super();
        this.#col = options.col;
        this.#position = options.position;
        this.#uniqueValues = options.uniqueValues || [];
        this.#currentFilter = options.currentFilter || null;
        this.#virtualScrollThreshold = options.virtualScrollThreshold ?? 200;
        this.#onApply = options.onApply;
        this.#onClear = options.onClear;
        this.#onClose = options.onClose;
        this.#container = options.container;
        this.#initUncheckedValues();
    }

    get col() {
        return this.#col;
    }

    /**
     * 是否应启用虚拟滚动
     */
    get #shouldVirtualize() {
        return this.#getFilteredValues().length > this.#virtualScrollThreshold;
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    open() {
        this.#injectStyles();
        this.#createPanel();
        this.#bindEvents();
        document.body.appendChild(this.#panelEl);
        this.#adjustPosition();
    }

    /**
     * @override
     */
    onDestroy() {
        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }
        this.#onApply = null;
        this.#onClear = null;
        this.#onClose = null;
        this.#panelEl = null;
        this.#searchInput = null;
        this.#valueListEl = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // 样式注入（使用 DOMComponent.injectStyle，destroy 自动移除）
    // ═══════════════════════════════════════════════════════════════

    #injectStyles() {
        this.injectStyle("filter-dropdown-styles", `
            .filter-dropdown-panel {
                position: fixed;
                width: ${FilterDropdown.PANEL_WIDTH}px;
                max-height: ${FilterDropdown.PANEL_MAX_HEIGHT}px;
                background: #fff;
                border: 1px solid #e8e8e8;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .filter-dropdown-panel .filter-tab {
                flex: 1;
                padding: 8px;
                text-align: center;
                cursor: pointer;
                color: #666;
            }
            .filter-dropdown-panel .filter-tab.active {
                color: #1890ff;
                border-bottom: 2px solid #1890ff;
            }
            .filter-dropdown-panel .filter-tab:hover {
                background: #f5f5f5;
            }
            .filter-dropdown-panel .filter-value-item {
                padding: 4px 12px;
                display: flex;
                align-items: center;
                cursor: pointer;
            }
            .filter-dropdown-panel .filter-value-item:hover {
                background: #f5f5f5;
            }
            .filter-dropdown-panel .filter-value-item input[type="checkbox"] {
                margin: 0;
            }
            .filter-dropdown-panel .filter-search-input {
                width: 100%;
                padding: 4px 8px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                box-sizing: border-box;
                outline: none;
            }
            .filter-dropdown-panel .filter-search-input:focus {
                border-color: #1890ff;
                box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
            }
            .filter-dropdown-panel .filter-condition-operator,
            .filter-dropdown-panel .filter-condition-value {
                width: 100%;
                padding: 4px 8px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                box-sizing: border-box;
                outline: none;
            }
            .filter-dropdown-panel .filter-condition-value:focus {
                border-color: #1890ff;
                box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
            }
            .filter-dropdown-panel .filter-clear-btn {
                padding: 4px 12px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                background: #fff;
                cursor: pointer;
            }
            .filter-dropdown-panel .filter-clear-btn:hover {
                border-color: #1890ff;
                color: #1890ff;
            }
            .filter-dropdown-panel .filter-apply-btn {
                padding: 4px 12px;
                border: 1px solid #1890ff;
                border-radius: 4px;
                background: #1890ff;
                color: #fff;
                cursor: pointer;
            }
            .filter-dropdown-panel .filter-apply-btn:hover {
                background: #40a9ff;
            }
        `);
    }

    // ═══════════════════════════════════════════════════════════════
    // DOM 构建（使用 DOMComponent.createElement，destroy 自动移除）
    // ═══════════════════════════════════════════════════════════════

    #createPanel() {
        this.#panelEl = this.createElement("div", { className: "filter-dropdown-panel" });

        const tabsEl = this.createElement("div", {
            className: "filter-tabs",
            style: { display: "flex", borderBottom: "1px solid #e8e8e8" },
        }, this.#panelEl);

        const valuesTab = this.createElement("div", {
            className: `filter-tab ${this.#activeTab === "values" ? "active" : ""}`,
            textContent: "值筛选",
        }, tabsEl);
        valuesTab.dataset.tab = "values";

        const conditionsTab = this.createElement("div", {
            className: `filter-tab ${this.#activeTab === "conditions" ? "active" : ""}`,
            textContent: "条件筛选",
        }, tabsEl);
        conditionsTab.dataset.tab = "conditions";

        if (this.#activeTab === "values") {
            this.#buildValueTab(this.#panelEl);
        } else {
            this.#buildConditionTab(this.#panelEl);
        }

        const actionsEl = this.createElement("div", {
            style: {
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderTop: "1px solid #e8e8e8",
            },
        }, this.#panelEl);

        this.createElement("button", {
            className: "filter-clear-btn",
            textContent: "清除筛选",
        }, actionsEl);

        this.createElement("button", {
            className: "filter-apply-btn",
            textContent: "确定",
        }, actionsEl);
    }

    /**
     * 构建值筛选标签页
     * 根据唯一值数量自动选择直接渲染或虚拟滚动
     */
    #buildValueTab(parent) {
        const searchWrap = this.createElement("div", {
            style: { padding: "8px 12px", borderBottom: "1px solid #f0f0f0" },
        }, parent);

        this.#searchInput = this.createElement("input", {
            className: "filter-search-input",
            type: "text",
            placeholder: "搜索...",
        }, searchWrap);
        if (this.#searchKeyword) {
            this.#searchInput.value = this.#searchKeyword;
        }

        const selectAllWrap = this.createElement("div", {
            style: {
                padding: "6px 12px",
                borderBottom: "1px solid #f0f0f0",
                display: "flex",
                alignItems: "center",
            },
        }, parent);

        const selectAllCheckbox = this.createElement("input", {
            className: "filter-select-all",
            type: "checkbox",
        }, selectAllWrap);
        if (this.#uncheckedValues.size === 0) {
            selectAllCheckbox.checked = true;
        }

        this.createElement("span", {
            textContent: "全选",
            style: { marginLeft: "6px", color: "#333" },
        }, selectAllWrap);

        // 值列表容器 —— 根据数据量决定渲染模式
        this.#valueListEl = this.createElement("div", {
            className: "filter-value-list",
            style: {
                maxHeight: `${FilterDropdown.VALUE_LIST_HEIGHT}px`,
                overflowY: "auto",
                padding: "4px 0",
                position: "relative",
            },
        }, parent);

        if (this.#shouldVirtualize) {
            this.#renderVirtualValueList();
        } else {
            this.#renderValueItems();
        }

        const filteredValues = this.#getFilteredValues();
        this.createElement("div", {
            textContent: `${filteredValues.length} 个值${this.#shouldVirtualize ? "（虚拟滚动）" : ""}`,
            style: {
                padding: "4px 12px",
                color: "#999",
                fontSize: "11px",
                borderTop: "1px solid #f0f0f0",
            },
        }, parent);
    }

    /**
     * 直接渲染值列表项（少量数据模式）
     */
    #renderValueItems() {
        if (!this.#valueListEl) return;
        this.#valueListEl.innerHTML = "";

        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }

        const filteredValues = this.#getFilteredValues();

        for (const { value, count } of filteredValues) {
            const key = value === null ? "__NULL__" : String(value);
            const checked = !this.#uncheckedValues.has(key);
            const displayValue = value === null ? "(空白)" : String(value);

            const item = this.createElement("div", {
                className: "filter-value-item",
            }, this.#valueListEl);
            item.dataset.value = key;

            const checkbox = this.createElement("input", {
                type: "checkbox",
            }, item);
            checkbox.checked = checked;
            checkbox.dataset.key = key;

            this.createElement("span", {
                textContent: displayValue,
                style: {
                    marginLeft: "6px",
                    flex: "1",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                },
            }, item);

            this.createElement("span", {
                textContent: String(count),
                style: { marginLeft: "8px", color: "#999", fontSize: "11px" },
            }, item);
        }
    }

    /**
     * 渲染虚拟滚动值列表（大数据量模式）
     */
    #renderVirtualValueList() {
        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }

        const filteredValues = this.#getFilteredValues();

        this.#virtualList = new VirtualValueList({
            container: this.#valueListEl,
            items: filteredValues,
            uncheckedValues: this.#uncheckedValues,
            itemHeight: 28,
            viewportHeight: FilterDropdown.VALUE_LIST_HEIGHT,
            bufferSize: 5,
            onToggle: (key) => {
                if (this.#uncheckedValues.has(key)) {
                    this.#uncheckedValues.delete(key);
                } else {
                    this.#uncheckedValues.add(key);
                }
            },
        });

        this.#virtualList.render();
    }

    /**
     * 构建条件筛选标签页
     */
    #buildConditionTab(parent) {
        const wrap = this.createElement("div", {
            style: { padding: "12px" },
        }, parent);

        const operators = [
            { value: "eq", label: "等于" },
            { value: "neq", label: "不等于" },
            { value: "contains", label: "包含" },
            { value: "notContains", label: "不包含" },
            { value: "startsWith", label: "开头是" },
            { value: "endsWith", label: "结尾是" },
            { value: "gt", label: "大于" },
            { value: "gte", label: "大于等于" },
            { value: "lt", label: "小于" },
            { value: "lte", label: "小于等于" },
        ];

        const selectWrap = this.createElement("div", {
            style: { marginBottom: "8px" },
        }, wrap);

        const select = this.createElement("select", {
            className: "filter-condition-operator",
        }, selectWrap);

        for (const op of operators) {
            const option = this.createElement("option", {
                value: op.value,
                textContent: op.label,
            }, select);
            if (this.#conditionOperator === op.value) {
                option.selected = true;
            }
        }

        this.createElement("input", {
            className: "filter-condition-value",
            type: "text",
            placeholder: "输入值...",
        }, wrap);
    }

    // ═══════════════════════════════════════════════════════════════
    // 事件绑定（使用 DOMComponent.trackEvent，destroy 自动移除）
    // ═══════════════════════════════════════════════════════════════

    #bindEvents() {
        this.trackEvent(document, EVENT_NAMES.MOUSEDOWN, (e) => {
            if (this.#panelEl && !this.#panelEl.contains(e.target)) {
                this.#onClose?.();
            }
        }, true);

        this.trackEvent(this.#panelEl, EVENT_NAMES.CLICK, (e) => {
            this.#handlePanelClick(e);
        });

        this.trackEvent(this.#panelEl, EVENT_NAMES.KEYUP, (e) => {
            this.#handlePanelInput(e);
        });
    }

    #handlePanelClick(e) {
        const target = e.target;

        if (target.classList.contains("filter-tab")) {
            this.#activeTab = target.dataset.tab;
            this.#rebuildPanel();
            return;
        }

        if (target.classList.contains("filter-select-all")) {
            if (target.checked) {
                this.#uncheckedValues.clear();
            } else {
                this.#uniqueValues.forEach(({ value }) => {
                    const key = value === null ? "__NULL__" : String(value);
                    this.#uncheckedValues.add(key);
                });
            }
            if (this.#virtualList) {
                this.#virtualList.updateUncheckedValues(this.#uncheckedValues);
            } else {
                this.#renderValueItems();
            }
            return;
        }

        // 虚拟滚动模式下，勾选由 VirtualValueList 内部处理
        if (this.#virtualList) return;

        const valueItem = target.closest(".filter-value-item");
        if (valueItem) {
            const key = valueItem.dataset.value;
            const checkbox = valueItem.querySelector('input[type="checkbox"]');
            if (checkbox) {
                if (target !== checkbox) checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                    this.#uncheckedValues.delete(key);
                } else {
                    this.#uncheckedValues.add(key);
                }
            }
            return;
        }

        if (target.classList.contains("filter-clear-btn")) {
            this.#onClear?.();
            return;
        }

        if (target.classList.contains("filter-apply-btn")) {
            this.#applyCurrentFilter();
            return;
        }
    }

    #handlePanelInput(e) {
        const target = e.target;

        if (target.classList.contains("filter-search-input")) {
            this.#searchKeyword = target.value;
            if (this.#shouldVirtualize) {
                this.#renderVirtualValueList();
            } else {
                this.#renderValueItems();
            }
            return;
        }

        if (target.classList.contains("filter-condition-value")) {
            this.#conditionValue = target.value;
            return;
        }

        if (target.classList.contains("filter-condition-operator")) {
            this.#conditionOperator = target.value;
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 筛选应用
    // ═══════════════════════════════════════════════════════════════

    #applyCurrentFilter() {
        let filter;

        if (this.#activeTab === "values") {
            filter = {
                active: this.#uncheckedValues.size > 0,
                type: "value",
                valueFilter: {
                    uncheckedValues: new Set(this.#uncheckedValues),
                    allValues: this.#uniqueValues,
                },
            };
        } else {
            if (!this.#conditionValue) return;
            filter = {
                active: true,
                type: "condition",
                conditionFilter: {
                    operator: this.#conditionOperator,
                    value: this.#conditionValue,
                },
            };
        }

        this.#onApply?.(filter);
    }

    // ═══════════════════════════════════════════════════════════════
    // 辅助方法
    // ═══════════════════════════════════════════════════════════════

    #initUncheckedValues() {
        if (this.#currentFilter?.type === "value" && this.#currentFilter.valueFilter) {
            this.#uncheckedValues = new Set(this.#currentFilter.valueFilter.uncheckedValues);
        } else if (this.#currentFilter?.type === "condition" && this.#currentFilter.conditionFilter) {
            this.#conditionOperator = this.#currentFilter.conditionFilter.operator;
            this.#conditionValue = String(this.#currentFilter.conditionFilter.value ?? "");
            this.#activeTab = "conditions";
        }
    }

    #getFilteredValues() {
        if (!this.#searchKeyword) return this.#uniqueValues;
        const keyword = this.#searchKeyword.toLowerCase();
        return this.#uniqueValues.filter(({ value }) =>
            String(value ?? "").toLowerCase().includes(keyword)
        );
    }

    #adjustPosition() {
        if (!this.#panelEl) return;
        let { x, y } = this.#position;
        const containerRect = this.#container?.getBoundingClientRect();
        if (containerRect) {
            x += containerRect.left;
            y += containerRect.top;
        }
        if (x + FilterDropdown.PANEL_WIDTH > window.innerWidth) {
            x = window.innerWidth - FilterDropdown.PANEL_WIDTH - 8;
        }
        if (y + FilterDropdown.PANEL_MAX_HEIGHT > window.innerHeight) {
            y = window.innerHeight - FilterDropdown.PANEL_MAX_HEIGHT - 8;
        }
        this.#panelEl.style.left = `${x}px`;
        this.#panelEl.style.top = `${y}px`;
    }

    #rebuildPanel() {
        if (!this.#panelEl) return;

        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }

        while (this.#panelEl.firstChild) {
            this.#panelEl.firstChild.remove();
        }

        const tabsEl = this.createElement("div", {
            className: "filter-tabs",
            style: { display: "flex", borderBottom: "1px solid #e8e8e8" },
        }, this.#panelEl);

        const valuesTab = this.createElement("div", {
            className: `filter-tab ${this.#activeTab === "values" ? "active" : ""}`,
            textContent: "值筛选",
        }, tabsEl);
        valuesTab.dataset.tab = "values";

        const conditionsTab = this.createElement("div", {
            className: `filter-tab ${this.#activeTab === "conditions" ? "active" : ""}`,
            textContent: "条件筛选",
        }, tabsEl);
        conditionsTab.dataset.tab = "conditions";

        if (this.#activeTab === "values") {
            this.#buildValueTab(this.#panelEl);
        } else {
            this.#buildConditionTab(this.#panelEl);
        }

        const actionsEl = this.createElement("div", {
            style: {
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderTop: "1px solid #e8e8e8",
            },
        }, this.#panelEl);

        this.createElement("button", {
            className: "filter-clear-btn",
            textContent: "清除筛选",
        }, actionsEl);

        this.createElement("button", {
            className: "filter-apply-btn",
            textContent: "确定",
        }, actionsEl);
    }
}
```

> **DOMComponent 继承带来的优势**：
>
> | 特性 | 手动管理 | DOMComponent 继承 |
> |------|----------|-------------------|
> | DOM 元素创建 | `document.createElement()` | `this.createElement()` — 自动跟踪 |
> | DOM 元素销毁 | 手动 `el.remove()` | `destroy()` 自动移除所有跟踪元素 |
> | 事件注册 | `addEventListener()` | `this.trackEvent()` — 自动跟踪 |
> | 事件销毁 | 手动 `removeEventListener()` | `destroy()` 自动移除所有跟踪事件 |
> | 样式注入 | 手动创建 `<style>` | `this.injectStyle()` — 自动跟踪 |
> | 样式销毁 | 手动 `style.remove()` | `destroy()` 自动移除所有注入样式 |
> | 内存泄漏风险 | 高（易遗漏清理） | 低（框架保障） |
> | 与项目一致性 | 不一致 | 与 FormulaBar / SheetTabBar / ValidationPortalManager 一致 |

---

## 5. 虚拟滚动设计

### 5.1 问题分析

当某列唯一值数量极大（如 5000+ 个不同值）时，直接一次性渲染所有 `<div class="filter-value-item">` 会产生严重的 DOM 渲染性能问题：

| 唯一值数量 | DOM 节点数（每项 3 个） | 首次渲染耗时 | 内存占用 |
|-----------|------------------------|-------------|---------|
| 100       | ~300                   | < 10ms      | 极低    |
| 500       | ~1500                  | ~30ms       | 低      |
| 2000      | ~6000                  | ~150ms      | 中      |
| 5000      | ~15000                 | ~400ms      | 高      |
| 10000     | ~30000                 | ~900ms      | 极高    |

> 5000 个唯一值时，首次渲染 400ms 已超出用户感知阈值（100ms），需要虚拟滚动。

### 5.2 设计方案

采用 **虚拟滚动（Virtual Scrolling）** 策略：仅渲染可视区域内的 DOM 节点，滚动时动态替换。

```
┌──────────────────────────┐
│  ☑ Alice                 │ ← 可视区（实际渲染 DOM）
│  ☑ Bob                   │
│  ☑ Carol                 │
│  ☑ David                 │
│  ☑ Eve                   │    viewportHeight = 200px
│  ☑ Frank                 │    itemHeight = 28px
│  ☑ Grace                 │    可视行数 ≈ 7
│  ☑ Helen                 │
├──────────────────────────┤ ← 不可见区域（用 padding 模拟高度）
│  ... (虚拟) ...          │    总高度 = itemCount × itemHeight
│  ... (虚拟) ...          │    上方 padding = startIndex × itemHeight
│  ... (虚拟) ...          │    下方 padding = (total - endIndex) × itemHeight
└──────────────────────────┘
```

### 5.3 渲染模式切换策略

```
唯一值数量 ≤ virtualScrollThreshold（默认 200）
  → 直接渲染模式：一次性创建所有 DOM 节点
  → 优点：实现简单，无滚动计算开销
  → 适合：小数据量场景

唯一值数量 > virtualScrollThreshold
  → 虚拟滚动模式：仅渲染可视区 + 缓冲区
  → 优点：DOM 节点数恒定，性能稳定
  → 适合：大数据量场景
```

### 5.4 VirtualValueList（继承 DOMComponent）

虚拟滚动值列表组件，**继承 `DOMComponent`**，负责大数据量下的值列表渲染。

> **设计要点**：
> - 继承 `DOMComponent`，使用 `createElement` / `trackEvent`，destroy 自动清理
> - 仅渲染可视区 + 上下缓冲区的 DOM 节点
> - 通过上下 padding 模拟完整列表高度，保持滚动条正确
> - 滚动时通过 `requestAnimationFrame` 节流，避免频繁重绘
> - 勾选状态由外部 `uncheckedValues` Set 管理，不依赖 DOM

```javascript
// src/plugins/filter/VirtualValueList.js

import { DOMComponent } from "../../core/DOMComponent.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class VirtualValueList extends DOMComponent {

    /** @type {HTMLElement} 滚动容器 */
    #container;

    /** @type {Array<{value: any, count: number}>} 数据项 */
    #items;

    /** @type {Set<string>} 未勾选的值 */
    #uncheckedValues;

    /** @type {number} 每行高度（px） */
    #itemHeight;

    /** @type {number} 可视区高度（px） */
    #viewportHeight;

    /** @type {number} 上下缓冲区行数 */
    #bufferSize;

    /** @type {Function} 勾选切换回调 */
    #onToggle;

    /** @type {HTMLElement} 内容包裹层（撑开总高度） */
    #contentWrapper = null;

    /** @type {HTMLElement} 实际渲染的节点容器 */
    #renderZone = null;

    /** @type {number} 当前渲染的起始索引 */
    #startIndex = 0;

    /** @type {number} 当前渲染的结束索引 */
    #endIndex = 0;

    /** @type {number|null} rAF ID */
    #rafId = null;

    static SCROLL_RAF_THRESHOLD = 16;

    constructor(options) {
        super();
        this.#container = options.container;
        this.#items = options.items || [];
        this.#uncheckedValues = options.uncheckedValues || new Set();
        this.#itemHeight = options.itemHeight || 28;
        this.#viewportHeight = options.viewportHeight || 200;
        this.#bufferSize = options.bufferSize || 5;
        this.#onToggle = options.onToggle;
    }

    /**
     * 渲染虚拟列表
     * 创建两层结构：contentWrapper（撑高度）+ renderZone（放实际 DOM）
     */
    render() {
        this.#container.innerHTML = "";

        this.#contentWrapper = this.createElement("div", {
            style: {
                position: "relative",
                height: `${this.#items.length * this.#itemHeight}px`,
            },
        }, this.#container);

        this.#renderZone = this.createElement("div", {
            className: "filter-virtual-render-zone",
            style: {
                position: "absolute",
                top: "0",
                left: "0",
                right: "0",
            },
        }, this.#contentWrapper);

        this.#renderVisibleItems(0);

        this.trackEvent(this.#container, EVENT_NAMES.SCROLL, () => {
            this.#scheduleRender();
        });
    }

    /**
     * 更新未勾选值集合（全选/取消全选时调用）
     * @param {Set<string>} uncheckedValues
     */
    updateUncheckedValues(uncheckedValues) {
        this.#uncheckedValues = uncheckedValues;
        this.#renderVisibleItems(this.#container.scrollTop);
    }

    /**
     * 更新数据项（搜索过滤后调用）
     * @param {Array<{value: any, count: number}>} items
     */
    updateItems(items) {
        this.#items = items;
        if (this.#contentWrapper) {
            this.#contentWrapper.style.height = `${items.length * this.#itemHeight}px`;
        }
        this.#container.scrollTop = 0;
        this.#renderVisibleItems(0);
    }

    /**
     * @override
     */
    onDestroy() {
        if (this.#rafId !== null) {
            cancelAnimationFrame(this.#rafId);
            this.#rafId = null;
        }
        this.#onToggle = null;
        this.#contentWrapper = null;
        this.#renderZone = null;
        this.#container = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // 核心渲染逻辑
    // ═══════════════════════════════════════════════════════════════

    /**
     * 调度渲染（rAF 节流）
     */
    #scheduleRender() {
        if (this.#rafId !== null) return;
        this.#rafId = requestAnimationFrame(() => {
            this.#rafId = null;
            this.#renderVisibleItems(this.#container.scrollTop);
        });
    }

    /**
     * 渲染可视区内的列表项
     * @param {number} scrollTop - 当前滚动位置
     */
    #renderVisibleItems(scrollTop) {
        if (!this.#renderZone) return;

        const totalItems = this.#items.length;
        const visibleCount = Math.ceil(this.#viewportHeight / this.#itemHeight);

        const rawStart = Math.floor(scrollTop / this.#itemHeight);
        const rawEnd = rawStart + visibleCount;

        this.#startIndex = Math.max(0, rawStart - this.#bufferSize);
        this.#endIndex = Math.min(totalItems, rawEnd + this.#bufferSize);

        // 定位渲染区域
        this.#renderZone.style.transform = `translateY(${this.#startIndex * this.#itemHeight}px)`;

        // 清空并重建 DOM
        this.#renderZone.innerHTML = "";

        for (let i = this.#startIndex; i < this.#endIndex; i++) {
            const { value, count } = this.#items[i];
            const key = value === null ? "__NULL__" : String(value);
            const checked = !this.#uncheckedValues.has(key);
            const displayValue = value === null ? "(空白)" : String(value);

            const item = this.createElement("div", {
                className: "filter-value-item",
                style: {
                    height: `${this.#itemHeight}px`,
                    boxSizing: "border-box",
                },
            }, this.#renderZone);
            item.dataset.value = key;
            item.dataset.index = String(i);

            const checkbox = this.createElement("input", {
                type: "checkbox",
            }, item);
            checkbox.checked = checked;
            checkbox.dataset.key = key;

            this.createElement("span", {
                textContent: displayValue,
                style: {
                    marginLeft: "6px",
                    flex: "1",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                },
            }, item);

            this.createElement("span", {
                textContent: String(count),
                style: { marginLeft: "8px", color: "#999", fontSize: "11px" },
            }, item);
        }

        // 绑定渲染区内的勾选事件（事件委托）
        this.#bindRenderZoneEvents();
    }

    /**
     * 为渲染区绑定事件委托
     * 每次重新渲染后调用，替换旧的事件处理
     */
    #bindRenderZoneEvents() {
        if (!this.#renderZone) return;

        // 使用事件委托而非逐项绑定，减少事件监听器数量
        this.trackEvent(this.#renderZone, EVENT_NAMES.CLICK, (e) => {
            const valueItem = e.target.closest(".filter-value-item");
            if (!valueItem) return;

            const key = valueItem.dataset.value;
            const checkbox = valueItem.querySelector('input[type="checkbox"]');

            if (e.target === checkbox) {
                // 点击复选框本身
                if (checkbox.checked) {
                    this.#uncheckedValues.delete(key);
                } else {
                    this.#uncheckedValues.add(key);
                }
            } else {
                // 点击行其他区域 → 切换复选框
                checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                    this.#uncheckedValues.delete(key);
                } else {
                    this.#uncheckedValues.add(key);
                }
            }

            this.#onToggle?.(key);
        });
    }
}
```

### 5.5 虚拟滚动性能指标

| 指标 | 目标值 | 实现方式 |
|------|--------|----------|
| 首次渲染时间 | < 100ms（5000 项） | 仅渲染 ~12 个 DOM 节点（7 可视 + 5 缓冲） |
| 滚动帧率 | > 30fps | rAF 节流 + 缓冲区减少重绘 |
| DOM 节点数 | ≤ 可视行数 + 2 × 缓冲行数 | 恒定，与数据量无关 |
| 内存增量 | < 0.5MB（10000 项） | 仅存储数据引用，不创建 DOM |
| 搜索后重渲染 | < 50ms | 复用 VirtualValueList.updateItems() |

### 5.6 渲染模式对比

```
┌─────────────────────────────────────────────────────────────────┐
│                    直接渲染模式                                   │
│  唯一值 ≤ 200（virtualScrollThreshold）                          │
│                                                                  │
│  ┌──────────────────┐                                            │
│  │ ☑ Item 1         │ ← 所有项都是真实 DOM                       │
│  │ ☑ Item 2         │                                            │
│  │ ☑ ...            │                                            │
│  │ ☑ Item 200       │                                            │
│  └──────────────────┘                                            │
│  DOM 节点数 = itemCount × 3 ≈ 600                                │
│  滚动：原生滚动，无额外计算                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    虚拟滚动模式                                   │
│  唯一值 > 200（virtualScrollThreshold）                          │
│                                                                  │
│  ┌──────────────────┐                                            │
│  │ padding-top       │ ← 模拟上方不可见区域                      │
│  ├──────────────────┤                                            │
│  │ ☑ Item 195       │ ← 缓冲区（5 行）                          │
│  │ ☑ Item 196       │                                            │
│  │ ☑ Item 197       │ ← 可视区（7 行）                          │
│  │ ☑ Item 198       │                                            │
│  │ ☑ Item 199       │                                            │
│  │ ☑ Item 200       │                                            │
│  │ ☑ Item 201       │                                            │
│  │ ☑ Item 202       │                                            │
│  │ ☑ Item 203       │ ← 缓冲区（5 行）                          │
│  ├──────────────────┤                                            │
│  │ padding-bottom    │ ← 模拟下方不可见区域                      │
│  └──────────────────┘                                            │
│  DOM 节点数 = (visibleCount + 2 × bufferSize) × 3 ≈ 51          │
│  滚动：rAF 节流，动态替换 DOM                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.7 搜索与虚拟滚动的交互

搜索过滤后，唯一值列表可能从大数据量变为小数据量（或反之），需要动态切换渲染模式：

```
搜索前：5000 个唯一值 → 虚拟滚动模式
  ↓ 输入搜索关键词 "A"
搜索后：120 个匹配值 → 直接渲染模式（低于阈值）
  ↓ 清空搜索关键词
搜索后：5000 个唯一值 → 虚拟滚动模式

切换逻辑在 FilterDropdown.#handlePanelInput() 中：
  每次搜索关键词变化时，重新判断 #shouldVirtualize
  - 如果之前是虚拟滚动，现在是直接渲染 → destroy VirtualValueList，调用 #renderValueItems()
  - 如果之前是直接渲染，现在是虚拟滚动 → 调用 #renderVirtualValueList()
  - 如果模式不变 → 更新数据（VirtualValueList.updateItems() 或 #renderValueItems()）
```

---

## 6. 数据流设计

### 6.1 筛选操作数据流

```
用户点击列头筛选按钮
        │
        ▼
  FilterStrategy.#handleMouseDown()
        │
        ▼
  FilterUIManager.toggleDropdown(col, position)
        │
        ▼
  new FilterDropdown({...})   ← 继承 DOMComponent
        │
        ▼
  FilterDropdown.open()
   ├─ this.injectStyle()      ← DOMComponent 方法，自动跟踪
   ├─ this.createElement()    ← DOMComponent 方法，自动跟踪
   └─ this.trackEvent()       ← DOMComponent 方法，自动跟踪
        │
        ▼
  唯一值数量 > virtualScrollThreshold?
   ├─ Yes → new VirtualValueList({...})   ← 继承 DOMComponent
   │        └─ 仅渲染可视区 + 缓冲区 DOM
   └─ No  → 直接渲染所有值列表项
        │
        ▼
  用户操作面板（勾选值 / 设置条件 / 搜索）
        │
        ▼
  FilterDropdown.#applyCurrentFilter()
        │
        ▼
  FilterPlugin.addFilter(col, filter)
   ├─ hooks.runHook(BEFORE_FILTER)
   ├─ FilterState.setColumnFilter(col, filter)
   └─ FilterPlugin.#applyFilter()
        │
        ▼
  FilterEngine.computeHiddenRows()
        │
        ▼
  HiddenRowsPlugin.setFilterHiddenRows(hiddenRows)
        │
        ▼
  RenderEngine.invalidateAll() → render()
        │
        ▼
  hooks.runHook(AFTER_FILTER)
```

### 6.2 虚拟滚动渲染数据流

```
用户滚动值列表
        │
        ▼
  VirtualValueList scroll 事件
        │
        ▼
  #scheduleRender() → requestAnimationFrame
        │
        ▼
  #renderVisibleItems(scrollTop)
   ├─ 计算 startIndex / endIndex（含缓冲区）
   ├─ 设置 renderZone.style.transform = translateY(...)
   ├─ 清空 renderZone
   └─ 循环创建 startIndex → endIndex 的 DOM 节点
        │
        ▼
  #bindRenderZoneEvents() → 事件委托
```

### 6.3 搜索过滤数据流

```
用户输入搜索关键词
        │
        ▼
  FilterDropdown.#handlePanelInput()
        │
        ▼
  更新 #searchKeyword
        │
        ▼
  #getFilteredValues() → 过滤后的唯一值列表
        │
        ▼
  #shouldVirtualize?（重新判断渲染模式）
   ├─ 之前虚拟 + 现在直接 → destroy VirtualValueList → #renderValueItems()
   ├─ 之前直接 + 现在虚拟 → #renderVirtualValueList()
   ├─ 虚拟 → 虚拟 → VirtualValueList.updateItems(filteredValues)
   └─ 直接 → 直接 → #renderValueItems()
```

### 6.4 缓存失效数据流

```
单元格数据变更
        │
        ▼
  hooks.runHook(AFTER_CHANGE)
        │
        ▼
  FilterState.invalidateColumnCache()
   └─ 标记所有列的缓存为 dirty
        │
        ▼
  下次 extractUniqueValues() 时重新计算
```

### 6.5 排序重应用数据流

```
排序操作完成
        │
        ▼
  hooks.runHook(AFTER_SORT)
        │
        ▼
  FilterPlugin.#reapplyFilter()
   ├─ FilterState.hasActiveFilters()?
   │   └─ Yes → FilterPlugin.#applyFilter()
   │           ├─ FilterEngine.computeHiddenRows()
   │           ├─ HiddenRowsPlugin.setFilterHiddenRows()
   │           └─ renderEngine.invalidateAll() → render()
   └─ No → 无操作
```

---

## 7. 钩子系统扩展

### 7.1 新增钩子

在 `src/constants/hookNames.js` 中新增以下钩子：

```javascript
BEFORE_FILTER: "beforeFilter",
AFTER_FILTER: "afterFilter",
BEFORE_FILTER_CLEAR: "beforeFilterClear",
AFTER_FILTER_CLEAR: "afterFilterClear",
```

### 7.2 钩子参数定义

| 钩子 | 参数 | 说明 |
|------|------|------|
| `beforeFilter` | `{ col: number, filter: ColumnFilter }` | 返回 `false` 阻止筛选 |
| `afterFilter` | `{ columnFilters: Map, hiddenRows: Set, visibleRowCount: number }` | 筛选完成后的回调 |
| `beforeFilterClear` | `{ col: number \| null }` | 返回 `false` 阻止清除，`col=null` 表示清除全部 |
| `afterFilterClear` | `{ col: number \| null }` | 清除完成后的回调 |

### 7.3 使用示例

```javascript
const workbook = new Workbook(container, {
    plugins: {
        filter: true,
    },
    hooks: {
        beforeFilter: ({ col, filter }) => {
            console.log(`即将筛选列 ${col}`, filter);
        },
        afterFilter: ({ columnFilters, hiddenRows, visibleRowCount }) => {
            console.log(`筛选完成，剩余 ${visibleRowCount} 行可见`);
        },
        beforeFilterClear: ({ col }) => {
            console.log(`即将清除列 ${col} 的筛选`);
        },
        afterFilterClear: ({ col }) => {
            console.log(`已清除列 ${col} 的筛选`);
        },
    },
});
```

---

## 8. 与现有插件的交互

### 8.1 HiddenRowsPlugin

筛选功能通过 `HiddenRowsPlugin` 实现行隐藏，避免重复实现行隐藏逻辑。

```javascript
const hiddenRowsPlugin = this.workbook.getPlugin("hiddenRows");
if (hiddenRowsPlugin) {
    hiddenRowsPlugin.setFilterHiddenRows(hiddenRowsSet);
}
```

**HiddenRowsPlugin 需要新增的方法**：

```javascript
setFilterHiddenRows(rows) {
    this.#filterHiddenRows = new Set(rows);
    this.#mergeHiddenRows();
}

getFilterHiddenRows() {
    return new Set(this.#filterHiddenRows);
}

clearFilterHiddenRows() {
    this.#filterHiddenRows.clear();
    this.#mergeHiddenRows();
}

#mergeHiddenRows() {
    this.#allHiddenRows = new Set([...this.#manualHiddenRows, ...this.#filterHiddenRows]);
    this.#notifyChange();
}
```

### 8.2 SortPlugin

筛选与排序需要协同工作：

- **筛选后排序**：排序仅作用于可见行（排除被筛选隐藏的行）
- **排序后筛选**：排序完成后重新应用筛选条件

```javascript
this.addHook(HOOKS.AFTER_SORT, () => {
    this.#reapplyFilter();
});
```

### 8.3 FreezePlugin

冻结行不参与筛选：

```javascript
const fixedRowsTop = sheet?.fixedRowsTop || 0;
for (let row = fixedRowsTop; row < this.#rowCount; row++) {
    // ... 筛选逻辑
}
```

### 8.4 ContextMenuPlugin

右键菜单中添加筛选相关选项：

```javascript
{
    key: "filter-by-cell-value",
    label: "按所选单元格的值筛选",
    callback: (context) => {
        const { row, col } = context;
        const value = sheet.getCell(row, col)?.value;
        filterPlugin.addFilter(col, {
            active: true,
            type: "condition",
            conditionFilter: { operator: "eq", value },
        });
    },
},
{
    key: "clear-filter",
    label: "清除筛选",
    callback: () => {
        filterPlugin.clearAllFilters();
    },
},
```

---

## 9. 渲染层集成

### 9.1 列头筛选图标渲染

筛选图标通过 `HeaderRenderer` 的列头渲染器机制绘制：

```javascript
this.renderEngine.headerRenderer.registerColumnHeaderRenderer(callback);
```

### 9.2 渲染层级

| 层级 | Z-Index | 内容 |
|------|---------|------|
| Canvas 底层 | 0 | 单元格内容 |
| Canvas 列头层 | 1 | 列头文字 + 筛选图标 |
| DOM 覆盖层 | 9999+ | FilterDropdown 面板（DOMComponent） |

### 9.3 筛选图标绘制细节

```
列头布局：
┌─────────────────────────────┐
│  A          ▼  🔍           │
│  ← 文字区 →  ← 排序 → ←筛选→│
└─────────────────────────────┘

图标位置计算：
  iconX = x + width - ICON_SIZE - ICON_PADDING
  iconY = y + (height - ICON_SIZE) / 2

颜色规则：
  - 未筛选 + 未悬停：#bfbfbf（灰色）
  - 未筛选 + 悬停：  #40a9ff（浅蓝）
  - 已筛选：         #1890ff（蓝色）
```

---

## 10. API 设计

### 10.1 初始化配置

```javascript
const workbook = new Workbook(container, {
    plugins: {
        filter: {
            filterButtonVisible: true,
            conditionOperators: [
                "eq", "neq", "contains", "notContains",
                "startsWith", "endsWith", "gt", "gte", "lt", "lte",
            ],
            customFilterFn: null,
            dropdownWidth: 240,
            dropdownMaxHeight: 360,
            virtualScrollThreshold: 200,
            maxUniqueValues: 10000,
            searchDebounceMs: 150,
        },
    },
});
```

### 10.2 编程 API

```javascript
const filterPlugin = workbook.getPlugin("filter");

filterPlugin.addFilter(0, {
    active: true,
    type: "value",
    valueFilter: {
        uncheckedValues: new Set(["Alice", "Bob"]),
        allValues: [
            { value: "Alice", count: 3 },
            { value: "Bob", count: 2 },
            { value: "Carol", count: 1 },
        ],
    },
});

filterPlugin.addFilter(1, {
    active: true,
    type: "condition",
    conditionFilter: {
        operator: "gt",
        value: 25,
    },
});

filterPlugin.addFilter(1, {
    active: true,
    type: "condition",
    conditionFilter: {
        operator: "gt",
        value: 20,
        logicalOp: "and",
        secondCondition: {
            operator: "lt",
            value: 35,
        },
    },
});

filterPlugin.clearColumnFilter(0);
filterPlugin.clearAllFilters();

const uniqueValues = filterPlugin.getUniqueValues(0);
const visibleCount = filterPlugin.getFilteredRowCount();
const state = filterPlugin.getFilterState();
```

### 10.3 钩子使用

```javascript
const workbook = new Workbook(container, {
    hooks: {
        beforeFilter: ({ col, filter }) => {
            if (col === 0 && filter.type === "condition") {
                return false;
            }
        },
        afterFilter: ({ columnFilters, hiddenRows, visibleRowCount }) => {
            document.getElementById("status").textContent =
                `${visibleRowCount} 条记录`;
        },
    },
});
```

---

## 11. 配置项设计

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `filterButtonVisible` | `boolean` | `true` | 是否在列头显示筛选按钮 |
| `conditionOperators` | `string[]` | 全部操作符 | 可用的条件筛选操作符列表 |
| `customFilterFn` | `Function\|null` | `null` | 自定义筛选函数 `(value, col) => boolean` |
| `dropdownWidth` | `number` | `240` | 下拉面板宽度（px） |
| `dropdownMaxHeight` | `number` | `360` | 下拉面板最大高度（px） |
| `virtualScrollThreshold` | `number` | `200` | 唯一值超过此数量时启用虚拟滚动 |
| `maxUniqueValues` | `number` | `10000` | 值列表最大显示数量 |
| `searchDebounceMs` | `number` | `150` | 搜索防抖时间（ms） |

> **`virtualScrollThreshold` 详解**：
>
> - 默认值 `200`：200 个唯一值 × 3 个 DOM 节点/项 = 600 个节点，渲染耗时约 30ms，在用户可接受范围内
> - 设为 `0`：始终启用虚拟滚动（即使只有少量值）
> - 设为 `Infinity`：始终使用直接渲染模式（不推荐大数据量场景）
> - 推荐范围：100 ~ 500，根据实际性能测试调整

---

## 12. 文件结构

```
src/
├── plugins/
│   ├── FilterPlugin.js                    # 主插件类
│   └── filter/
│       ├── FilterState.js                 # 筛选状态管理
│       ├── FilterEngine.js                # 筛选引擎
│       ├── FilterUIManager.js             # UI 管理器
│       ├── FilterDropdown.js              # 下拉面板（继承 DOMComponent）
│       ├── VirtualValueList.js            # 虚拟滚动值列表（继承 DOMComponent）
│       └── FilterStrategy.js              # 事件策略
├── core/
│   ├── DOMComponent.js                    # DOM 组件基类（已有）
│   └── Disposable.js                      # 可销毁基类（已有）
└── constants/
    └── hookNames.js                       # 钩子名称（新增筛选钩子）

test/
├── unit/
│   ├── FilterState.test.js
│   ├── FilterEngine.test.js
│   ├── FilterDropdown.test.js
│   ├── VirtualValueList.test.js
│   └── FilterStrategy.test.js
└── integration/
    └── FilterPlugin.test.js
```

---

## 13. 测试计划

### 13.1 单元测试

| 编号 | 测试用例 | 模块 |
|------|----------|------|
| UT-01 | 设置列筛选条件 | FilterState |
| UT-02 | 移除列筛选条件 | FilterState |
| UT-03 | 清除所有筛选条件 | FilterState |
| UT-04 | 唯一值缓存命中/失效 | FilterState |
| UT-05 | 提取列唯一值（含排序） | FilterEngine |
| UT-06 | 计算隐藏行（值筛选） | FilterEngine |
| UT-07 | 计算隐藏行（条件筛选） | FilterEngine |
| UT-08 | 计算隐藏行（多列筛选） | FilterEngine |
| UT-09 | 冻结行不参与筛选 | FilterEngine |
| UT-10 | 条件操作符：等于/不等于 | FilterEngine |
| UT-11 | 条件操作符：包含/不包含 | FilterEngine |
| UT-12 | 条件操作符：大于/小于 | FilterEngine |
| UT-13 | 复合条件（AND/OR） | FilterEngine |
| UT-14 | 下拉面板创建与销毁 | FilterDropdown |
| UT-15 | 下拉面板 DOM 自动清理 | FilterDropdown |
| UT-16 | 下拉面板事件自动移除 | FilterDropdown |
| UT-17 | 值列表勾选/取消勾选 | FilterDropdown |
| UT-18 | 搜索过滤值列表 | FilterDropdown |
| UT-19 | 渲染模式切换（直接→虚拟） | FilterDropdown |
| UT-20 | 渲染模式切换（虚拟→直接） | FilterDropdown |
| UT-21 | 虚拟列表渲染正确行数 | VirtualValueList |
| UT-22 | 虚拟列表滚动后 DOM 更新 | VirtualValueList |
| UT-23 | 虚拟列表缓冲区计算 | VirtualValueList |
| UT-24 | 虚拟列表勾选状态同步 | VirtualValueList |
| UT-25 | 虚拟列表 updateItems 后重渲染 | VirtualValueList |
| UT-26 | 虚拟列表 destroy 清理验证 | VirtualValueList |

### 13.2 集成测试

| 编号 | 测试用例 |
|------|----------|
| IT-01 | 筛选插件初始化与销毁 |
| IT-02 | 点击列头筛选按钮打开/关闭面板 |
| IT-03 | 值列表筛选 → 行隐藏 → 渲染更新 |
| IT-04 | 条件筛选 → 行隐藏 → 渲染更新 |
| IT-05 | 筛选后排序 → 筛选重应用 |
| IT-06 | 多列筛选 → 交叉筛选 |
| IT-07 | 清除筛选 → 行恢复显示 |
| IT-08 | 大数据量（5000+ 唯一值）虚拟滚动筛选 |
| IT-09 | 搜索过滤后渲染模式自动切换 |

### 13.3 BugHunt 测试

| 编号 | 场景 |
|------|------|
| BH-01 | 大数据量（10万行）筛选性能 |
| BH-02 | 虚拟滚动快速滚动时渲染稳定性 |
| BH-03 | 虚拟滚动搜索过滤后滚动位置重置 |
| BH-04 | 筛选面板位置溢出屏幕边界 |
| BH-05 | 筛选面板在滚动/缩放时定位 |
| BH-06 | 快速连续切换筛选列 |
| BH-07 | 筛选面板内存泄漏检测（DOMComponent.destroy 验证） |
| BH-08 | 虚拟滚动模式下全选/取消全选性能 |

---

## 14. 实现路线图

### 阶段一：核心功能（5 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| 1 | FilterState + FilterEngine | 筛选状态管理和筛选计算 |
| 2 | FilterPlugin 骨架 + FilterStrategy | 插件注册、事件处理 |
| 3 | FilterDropdown（继承 DOMComponent） | 下拉面板 DOM 构建 |
| 4 | FilterUIManager + 列头图标渲染 | 筛选按钮和面板管理 |
| 5 | 集成测试 + Bug 修复 | 可用的筛选功能 |

### 阶段二：虚拟滚动 + 增强功能（6.5 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| 1 | VirtualValueList（继承 DOMComponent） | 虚拟滚动核心实现 |
| 2 | FilterDropdown 集成虚拟滚动 | 渲染模式自动切换 |
| 3 | 条件筛选 UI + 逻辑 | 条件筛选完整功能 |
| 4 | 搜索过滤 + 防抖 + 模式切换 | 值列表搜索与虚拟滚动联动 |
| 5 | 复合条件筛选 + 排序协同 | AND/OR 逻辑 + 插件交互 |
| 5.5 | 右键菜单 + 钩子系统完善 | 快捷筛选 + 事件拦截 |

### 阶段三：优化与完善（4 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| 1 | 虚拟滚动性能调优 | 缓冲区大小、rAF 节流参数调优 |
| 2 | 面板定位优化 + 键盘导航 | 边界情况 + 无障碍访问 |
| 3 | 完整测试覆盖 | 测试通过 |
| 4 | 文档和示例 | 使用指南 |

**总计：15.5 天**

---

## 附录 A：DOMComponent 继承规范

本项目所有 DOM 组件必须继承 `DOMComponent`，遵循以下规范：

### A.1 继承链

```
Disposable               ← 基类：销毁生命周期
  └── DOMComponent       ← DOM 组件基类：createElement / trackEvent / injectStyle
        ├── FormulaBar               ← 公式栏
        ├── SheetTabBar              ← 工作表标签栏
        ├── ValidationPortalManager  ← 数据验证门户管理器
        ├── FilterDropdown           ← 筛选下拉面板
        └── VirtualValueList         ← 虚拟滚动值列表
```

### A.2 必须使用的 API

| 场景 | 使用方法 | 禁止使用 |
|------|----------|----------|
| 创建 DOM 元素 | `this.createElement(tag, attrs, parent)` | `document.createElement()` |
| 注册事件监听 | `this.trackEvent(target, type, handler)` | `target.addEventListener()` |
| 注入全局样式 | `this.injectStyle(id, cssText)` | 手动创建 `<style>` |
| 注入实例样式 | `this.injectInstanceStyle(ns, cssText)` | 手动创建 `<style>` |
| 销毁特有资源 | `this.onDestroy()` 覆写 | 手动清理 |

### A.3 生命周期保证

调用 `destroy()` 时，`DOMComponent` 保证按以下顺序清理：

1. **`onDestroy()`** — 子类覆写的销毁钩子，释放特有资源
2. **移除所有跟踪的 DOM 元素** — `createElement()` 创建的元素自动 `remove()`
3. **移除所有注入的 `<style>`** — `injectStyle()` 注入的样式自动 `remove()`
4. **移除所有跟踪的事件监听** — `trackEvent()` 注册的事件自动 `removeEventListener()`
5. **级联销毁子 Disposable** — `trackChild()` 注册的子对象自动 `destroy()`

---

## 附录 B：与 Handsontable 筛选功能对比

| 功能 | Handsontable | 本项目 |
|------|-------------|--------|
| 值列表筛选 | ✅ | ✅ |
| 条件筛选 | ✅（付费） | ✅（免费） |
| 多列筛选 | ✅ | ✅ |
| 搜索过滤 | ✅ | ✅ |
| 复合条件 | ✅（付费） | ✅（免费） |
| 自定义筛选函数 | ✅ | ✅ |
| 筛选与排序协同 | ✅ | ✅ |
| 筛选指示器 | ✅ | ✅ |
| API 编程筛选 | ✅ | ✅ |
| 钩子拦截 | ✅ | ✅ |
| 虚拟滚动值列表 | ❌ | ✅ |
