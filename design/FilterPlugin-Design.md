> **技术栈**：WebComponent（extends HTMLElement + Disposable）
> **参考实现**：[SheetTabBarElement.js](../src/ui/sheetTab/SheetTabBarElement.js)、[WebComponent.js](../src/core/WebComponent.js)
> **版本**：v2.0
> **日期**：2026-07-14
> **状态**：设计阶段

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
15. [附录 A: WebComponent 迁移指南](#附录-a-webcomponent-迁移指南)
16. [附录 B: Excel 100% 兼容的空值处理实现](#附录-b-excel-100-兼容的空值处理实现)

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

#### FR-001: 列头筛选按钮
- 在每列列头右侧渲染筛选图标（漏斗形状）
- 图标状态：未激活（灰色）、激活（蓝色）、悬停（浅蓝）
- 点击图标打开/关闭筛选下拉面板

#### FR-002: 值列表筛选
- 显示该列所有唯一值（去重）
- 每个值前有复选框，默认全选
- 取消勾选某值后，对应行被隐藏
- 支持"全选"和"取消全选"操作

#### FR-003: 文本搜索
- 提供搜索输入框，实时过滤值列表
- 支持模糊匹配（包含即可）
- 搜索不影响已勾选状态

#### FR-004: 条件筛选
- 支持以下操作符：等于、不等于、包含、不包含、开头是、结尾是、大于、小于、大于等于、小于等于
- 条件筛选与值列表筛选互斥（二选一）
- 支持自定义筛选函数

#### FR-005: 多列筛选
- 可同时为多列设置筛选条件
- 行需满足所有列的筛选条件才可见（AND 逻辑）

#### FR-006: 筛选状态持久化
- 筛选状态在内存中维护
- 工作表切换时保留各表的筛选状态

### 2.2 非功能需求

#### NFR-001: 性能要求
- 唯一值提取：10,000 行数据 < 100ms
- 面板打开：< 50ms
- 虚拟滚动：60fps 流畅滚动

#### NFR-002: 内存控制
- 大数据量时启用虚拟滚动（阈值可配置，默认 200 条）
- 筛选状态缓存，避免重复计算

#### NFR-003: 用户体验
- 下拉面板定位准确（不超出视口）
- 点击外部自动关闭面板
- ESC 键关闭面板
- 键盘导航支持（可选）

---

## 3. 整体架构设计

### 3.1 技术选型

| 组件 | 技术方案 | 说明 |
|------|----------|------|
| UI 组件 | WebComponent | 继承 `WebComponent` 基类，使用 Shadow DOM |
| 样式隔离 | Shadow DOM | 组件内部样式完全隔离 |
| 事件管理 | Disposable.trackEvent() | 自动清理事件监听 |
| 生命周期 | WebComponent 生命周期 | connectedCallback → onConnect → render |

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
│  │                                   │ WebComponent │   │   │
│  │                                   └──────┬──────┘   │   │
│  │                                          │           │   │
│  │                              ┌───────────┴────────┐  │   │
│  │                              │VirtualValueList     │  │   │
│  │                              │ extends WebComponent│  │   │
│  │                              └────────────────────┘  │   │
│  │  ┌────────────────┐                                │   │
│  │  │ FilterStrategy │  ← 事件策略                    │   │
│  │  └────────────────┘                                │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 核心类关系

```
                    ┌──────────────┐
                    │   BasePlugin  │
                    └──────┬───────┘
                           │ extends
                    ┌──────┴───────┐
                    │ FilterPlugin  │
                    └──────┬───────┘
                           │ contains
              ┌────────────┼────────────┐
              │            │            │
     ┌────────┴────┐ ┌────┴─────┐ ┌───┴────────┐
     │ FilterState │ │FilterEng │ │FilterUIMgr │
     └─────────────┘ └──────────┘ └──────┬─────┘
                                         │ creates
                                  ┌──────┴────────┐
                                  │ FilterDropdown │
                                  │ extends        │
                                  │ WebComponent   │
                                  └──────┬─────────┘
                                         │ contains
                                  ┌──────┴──────────┐
                                  │ VirtualValueList │
                                  │ extends          │
                                  │ WebComponent     │
                                  └─────────────────┘

                    ┌──────────────┐
                    │ WebComponent │
                    └──────┬───────┘
                           │ extends
                    ┌──────┴───────┐
                    │ HTMLElement   │
                    └──────┬───────┘
                           │ uses
                    ┌──────┴───────┐
                    │  Disposable   │
                    └──────────────┘
```

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

export class FilterPlugin extends BasePlugin {

    static get PLUGIN_NAME() {
        return "filter";
    }

    /** @type {FilterState} */
    #filterState;

    /** @type {FilterEngine} */
    #filterEngine;

    /** @type {FilterUIManager} */
    #filterUIManager;

    /** @type {FilterStrategy} */
    #filterStrategy;

    /** @type {boolean} */
    #active = false;

    /** @type {Function|null} */
    #headerRendererCallback = null;

    /** @type {object} */
    #options;

    static DEFAULT_OPTIONS = {
        filterButtonVisible: true,
        conditionOperators: [
            "eq", "neq", "contains", "notContains",
            "startsWith", "endsWith", "gt", "gte", "lt", "lte"
        ],
        dropdownWidth: 240,
        dropdownMaxHeight: 360,
        virtualScrollThreshold: 200,
        maxUniqueValues: 10000,
        searchDebounceMs: 150
    };

    constructor(workbook) {
        super(workbook);
        this.#filterState = new FilterState();
        this.#filterUIManager = new FilterUIManager(this);
        this.#filterEngine = null;
    }

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

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    destroy() {
        this.#filterUIManager.destroy();
        this.#filterState.clearAll();
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
        this.#filterState.setColumnFilter(col, condition);
        this.#reapplyFilter();
    }

    removeFilter(col) {
        this.#filterState.removeColumnFilter(col);
        this.#reapplyFilter();
    }

    clearAllFilters() {
        this.#filterState.clearAll();
        this.#reapplyFilter();
    }

    #initFilterEngine(sheet) {
        this.#filterEngine = new FilterEngine(sheet, this.#filterState);
    }

    #reapplyFilter() {
        if (!this.#active || !this.#filterEngine) return;

        const hiddenRows = this.#filterEngine.computeHiddenRows();
        const hiddenRowsPlugin = this.getPlugin("hiddenRows");
        if (hiddenRowsPlugin) {
            hiddenRowsPlugin.setHiddenRows(hiddenRows);
        }

        this.renderEngine?.invalidateAll();
        this.render();
    }

    #registerHeaderRenderer() {
        const headerRenderer = this.renderEngine?.headerRenderer;
        if (!headerRenderer) return;

        this.#headerRendererCallback = (ctx, col, x, y, w, h) => {
            this.#filterUIManager.drawFilterIndicator(ctx, col, x, y, w, h);
        };

        headerRenderer.addDecorator("filter", this.#headerRendererCallback);
    }

    #unregisterHeaderRenderer() {
        const headerRenderer = this.renderEngine?.headerRenderer;
        if (headerRenderer && this.#headerRendererCallback) {
            headerRenderer.removeDecorator("filter");
            this.#headerRendererCallback = null;
        }
    }
}
```

### 4.2 FilterState

筛选状态管理器，负责存储和管理所有列的筛选条件。

```javascript
// src/plugins/filter/FilterState.js

export class FilterState {

    /** @type {Map<number, ColumnFilter>} */
    #columnFilters = new Map();

    /** @type {Map<number, Set<string>>} */
    #uniqueValuesCache = new Map();

    /** @type {Set<number>} */
    #invalidatedColumns = new Set();

    setColumnFilter(col, filter) {
        this.#columnFilters.set(col, filter);
    }

    removeColumnFilter(col) {
        this.#columnFilters.delete(col);
        this.#uniqueValuesCache.delete(col);
    }

    getColumnFilter(col) {
        return this.#columnFilters.get(col) || null;
    }

    getAllFilters() {
        return new Map(this.#columnFilters);
    }

    hasActiveFilters() {
        return this.#columnFilters.size > 0;
    }

    clearAll() {
        this.#columnFilters.clear();
        this.#uniqueValuesCache.clear();
        this.#invalidatedColumns.clear();
    }

    cacheUniqueValues(col, values) {
        this.#uniqueValuesCache.set(col, values);
    }

    getUniqueValuesCache(col) {
        return this.#uniqueValuesCache.get(col) || null;
    }

    invalidateColumnCache(col) {
        if (col !== undefined) {
            this.#invalidatedColumns.add(col);
            this.#uniqueValuesCache.delete(col);
        } else {
            this.#uniqueValuesCache.clear();
        }
    }

    isCacheValid(col) {
        return !this.#invalidatedColumns.has(col);
    }
}
```

### 4.3 FilterEngine

筛选引擎，负责计算哪些行应该被隐藏。

```javascript
// src/plugins/filter/FilterEngine.js

export class FilterEngine {

    /** @type {object} */
    #sheet;

    /** @type {FilterState} */
    #filterState;

    constructor(sheet, filterState) {
        this.#sheet = sheet;
        this.#filterState = filterState;
    }

    extractUniqueValues(col) {
        const cached = this.#filterState.getUniqueValuesCache(col);
        if (cached && this.#filterState.isCacheValid(col)) {
            return cached;
        }

        const values = new Set();
        const rowCount = this.#sheet.rowCount || 1000;

        for (let row = 0; row < rowCount; row++) {
            const cellValue = this.#sheet.getCellValue(row, col);
            const key = String(cellValue ?? "");
            values.add(key);
        }

        const result = Array.from(values).sort();
        this.#filterState.cacheUniqueValues(col, result);
        return result;
    }

    computeHiddenRows() {
        const filters = this.#filterState.getAllFilters();
        if (filters.size === 0) return new Set();

        const rowCount = this.#sheet.rowCount || 1000;
        const hiddenRows = new Set();

        for (let row = 0; row < rowCount; row++) {
            let visible = true;

            for (const [col, filter] of filters) {
                if (!this.#rowMatchesFilter(row, col, filter)) {
                    visible = false;
                    break;
                }
            }

            if (!visible) {
                hiddenRows.add(row);
            }
        }

        return hiddenRows;
    }

    #rowMatchesFilter(row, col, filter) {
        const cellValue = this.#sheet.getCellValue(row, col);

        if (filter.type === "values") {
            const key = String(cellValue ?? "");
            return !filter.uncheckedValues.has(key);
        }

        if (filter.type === "condition") {
            return this.#evaluateCondition(cellValue, filter.operator, filter.value);
        }

        return true;
    }

    #evaluateCondition(value, operator, conditionValue) {
        const numValue = Number(value);
        const numCondition = Number(conditionValue);
        const strValue = String(value ?? "").toLowerCase();
        const strCondition = String(conditionValue ?? "").toLowerCase();

        switch (operator) {
            case "eq":  return value == conditionValue;
            case "neq": return value != conditionValue;
            case "contains": return strValue.includes(strCondition);
            case "notContains": return !strValue.includes(strCondition);
            case "startsWith": return strValue.startsWith(strCondition);
            case "endsWith": return strValue.endsWith(strCondition);
            case "gt": return numValue > numCondition;
            case "gte": return numValue >= numCondition;
            case "lt": return numValue < numCondition;
            case "lte": return numValue <= numCondition;
            default: return true;
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

    static ICON_SIZE = 10;
    static ICON_PADDING = 4;
    static ACTIVE_COLOR = "#1890ff";
    static INACTIVE_COLOR = "#bfbfbf";
    static HOVER_COLOR = "#40a9ff";

    constructor(plugin) {
        this.#plugin = plugin;
    }

    init(options = {}) {}

    destroy() {
        this.closeDropdown();
    }

    drawFilterIndicator(ctx, col, x, y, w, h) {
        const state = this.#plugin.getFilterState();
        const options = this.#plugin.getOptions();

        if (!options.filterButtonVisible) return;

        const isActive = state.getColumnFilter(col) !== null;
        const iconSize = FilterUIManager.ICON_SIZE;
        const padding = FilterUIManager.ICON_PADDING;
        const iconX = x + w - iconSize - padding;
        const iconY = y + (h - iconSize) / 2;

        ctx.save();
        ctx.fillStyle = isActive ? FilterUIManager.ACTIVE_COLOR : FilterUIManager.INACTIVE_COLOR;
        ctx.beginPath();
        this.#drawFunnelIcon(ctx, iconX, iconY, iconSize);
        ctx.fill();
        ctx.restore();
    }

    #drawFunnelIcon(ctx, x, y, size) {
        const midX = x + size / 2;
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size * 0.7, y + size * 0.6);
        ctx.lineTo(x + size * 0.5, y + size);
        ctx.lineTo(x + size * 0.3, y + size * 0.6);
        ctx.closePath();
    }

    handleHeaderClick(e, col, position) {
        e.preventDefault();
        e.stopPropagation();

        if (this.#dropdown && this.#dropdown.col === col) {
            this.closeDropdown();
            return;
        }

        this.openDropdown(col, position);
    }

    openDropdown(col, position) {
        this.closeDropdown();

        const engine = this.#plugin.getFilterEngine();
        const state = this.#plugin.getFilterState();
        const options = this.#plugin.getOptions();

        const uniqueValues = engine.extractUniqueValues(col);
        const currentFilter = state.getColumnFilter(col);

        this.#dropdown = document.createElement("filter-dropdown");
        document.body.appendChild(this.#dropdown);

        this.#dropdown.show(
            col,
            position,
            uniqueValues,
            currentFilter,
            options,
            (filter) => this.#onApply(filter),
            () => this.#onClear()
        );
    }

    closeDropdown() {
        if (this.#dropdown) {
            this.#dropdown.destroy();
            this.#dropdown.remove();
            this.#dropdown = null;
        }
    }

    #onApply(filter) {
        if (!this.#dropdown) return;

        const col = this.#dropdown.col;
        this.#plugin.getFilterState().setColumnFilter(col, filter);
        this.#plugin.getFilterEngine().computeHiddenRows();
        this.closeDropdown();
        this.#plugin.render();
    }

    #onClear() {
        if (!this.#dropdown) return;

        const col = this.#dropdown.col;
        this.#plugin.getFilterState().removeColumnFilter(col);
        this.#plugin.getFilterEngine().computeHiddenRows();
        this.closeDropdown();
        this.#plugin.render();
    }
}
```

### 4.5 FilterStrategy

事件策略类，处理筛选相关的用户交互事件。

```javascript
// src/plugins/filter/FilterStrategy.js

import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class FilterStrategy extends EventStrategy {

    /** @type {import("../FilterPlugin.js").FilterPlugin} */
    #plugin;

    constructor(eventHandler, plugin) {
        super(eventHandler);
        this.#plugin = plugin;
    }

    canHandle(eventType) {
        return eventType === EVENT_NAMES.CLICK;
    }

    handle(e) {
        const uiManager = this.#plugin.getFilterUIManager();
        if (!uiManager) return false;

        const target = e.target;
        if (!target?.classList?.contains("filter-indicator")) {
            return false;
        }

        const col = parseInt(target.dataset.col, 10);
        if (isNaN(col)) return false;

        const rect = target.getBoundingClientRect();
        const position = { x: rect.left, y: rect.bottom };

        uiManager.handleHeaderClick(e, col, position);
        return true;
    }
}
```

### 4.6 FilterDropdown（继承 WebComponent）

筛选下拉面板组件，使用 Shadow DOM 实现样式隔离。

```javascript
// src/plugins/filter/FilterDropdown.js

import { WebComponent } from "../../core/WebComponent.js";
import { VirtualValueList } from "./VirtualValueList.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class FilterDropdown extends WebComponent {

    /** @type {number} */
    #col = -1;

    /** @type {Array<string>} */
    #allValues = [];

    /** @type {Set<string>} */
    #uncheckedValues = new Set();

    /** @type {string} */
    #searchKeyword = "";

    /** @type {string|null} */
    #conditionOperator = null;

    /** @type {string|null} */
    #conditionValue = null;

    /** @type {"values"|"condition"} */
    #filterMode = "values";

    /** @type {VirtualValueList|null} */
    #virtualList = null;

    /** @type {Function|null} */
    #onApply = null;

    /** @type {Function|null} */
    #onClear = null;

    /** @type {object|null} */
    #options = null;

    get col() {
        return this.#col;
    }

    show(col, position, allValues, currentFilter, options, onApply, onClear) {
        this.#col = col;
        this.#allValues = allValues;
        this.#options = options;
        this.#onApply = onApply;
        this.#onClear = onClear;

        if (currentFilter) {
            this.#filterMode = currentFilter.type;
            if (currentFilter.type === "values") {
                this.#uncheckedValues = new Set(currentFilter.uncheckedValues);
            } else {
                this.#conditionOperator = currentFilter.operator;
                this.#conditionValue = currentFilter.value;
            }
        } else {
            this.#uncheckedValues = new Set();
            this.#conditionOperator = null;
            this.#conditionValue = null;
            this.#filterMode = "values";
        }

        this.style.position = "fixed";
        this.style.left = `${position.x}px`;
        this.style.top = `${position.y}px`;
        this.style.zIndex = "9999";

        document.body.appendChild(this);
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .filter-dropdown-panel {
                    width: ${this.#options?.dropdownWidth || 240}px;
                    max-height: ${this.#options?.dropdownMaxHeight || 360}px;
                    background: #fff;
                    border: 1px solid #d9d9d9;
                    border-radius: 4px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-size: 13px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .filter-dropdown-panel .filter-header {
                    padding: 8px 12px;
                    border-bottom: 1px solid #f0f0f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
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
                .filter-dropdown-panel .filter-search-box {
                    padding: 8px 12px;
                    border-bottom: 1px solid #f0f0f0;
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
                .filter-dropdown-panel .filter-content {
                    flex: 1;
                    overflow-y: auto;
                    min-height: 100px;
                    max-height: 250px;
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
                    margin-right: 8px;
                }
                .filter-dropdown-panel .filter-condition-area {
                    padding: 12px;
                    display: none;
                }
                .filter-dropdown-panel .filter-condition-area.visible {
                    display: block;
                }
                .filter-dropdown-panel .filter-condition-operator,
                .filter-dropdown-panel .filter-condition-value {
                    width: 100%;
                    padding: 4px 8px;
                    border: 1px solid #d9d9d9;
                    border-radius: 4px;
                    box-sizing: border-box;
                    margin-bottom: 8px;
                    outline: none;
                }
                .filter-dropdown-panel .filter-condition-value:focus {
                    border-color: #1890ff;
                    box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
                }
                .filter-dropdown-panel .filter-footer {
                    padding: 8px 12px;
                    border-top: 1px solid #f0f0f0;
                    display: flex;
                    justify-content: space-between;
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
            </style>
            <div class="filter-dropdown-panel">
                <div class="filter-header">
                    <span class="filter-tab active" data-mode="values">值</span>
                    <span class="filter-tab" data-mode="condition">条件</span>
                </div>
                <div class="filter-search-box">
                    <input type="text" class="filter-search-input" placeholder="搜索...">
                </div>
                <div class="filter-content"></div>
                <div class="filter-condition-area">
                    <select class="filter-condition-operator"></select>
                    <input type="text" class="filter-condition-value" placeholder="输入值...">
                </div>
                <div class="filter-footer">
                    <button class="filter-clear-btn">清除筛选</button>
                    <button class="filter-apply-btn">确定</button>
                </div>
            </div>
        `;
    }

    onConnect(disposable) {
        disposable.trackEvent(document, EVENT_NAMES.MOUSEDOWN, this.#handleClickOutside.bind(this));
        disposable.trackEvent(this.shadowRoot, EVENT_NAMES.CLICK, this.#handlePanelClick.bind(this));
        disposable.trackEvent(this.shadowRoot, EVENT_NAMES.INPUT, this.#handlePanelInput.bind(this));

        this.#renderContent();
        this.#adjustPosition();
    }

    onDisconnect() {
        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }
    }

    #handleClickOutside(e) {
        const path = e.composedPath();
        if (!path.includes(this)) {
            this.destroy();
        }
    }

    #handlePanelClick(e) {
        const target = e.target;

        if (target.classList.contains("filter-tab")) {
            const mode = target.dataset.mode;
            this.#switchMode(mode);
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
            this.#renderContent();
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

    #switchMode(mode) {
        this.#filterMode = mode;

        const tabs = this.shadowRoot.querySelectorAll(".filter-tab");
        tabs.forEach(tab => {
            tab.classList.toggle("active", tab.dataset.mode === mode);
        });

        const contentArea = this.shadowRoot.querySelector(".filter-content");
        const conditionArea = this.shadowRoot.querySelector(".filter-condition-area");

        if (mode === "values") {
            contentArea.style.display = "block";
            conditionArea.classList.remove("visible");
            this.#renderContent();
        } else {
            contentArea.style.display = "none";
            conditionArea.classList.add("visible");
            this.#renderConditionOperators();
        }
    }

    #getFilteredValues() {
        let filtered = this.#allValues;

        if (this.#searchKeyword) {
            const keyword = this.#searchKeyword.toLowerCase();
            filtered = filtered.filter(v => v.toLowerCase().includes(keyword));
        }

        return filtered;
    }

    #shouldVirtualize(values) {
        const threshold = this.#options?.virtualScrollThreshold || 200;
        return values.length > threshold;
    }

    #renderContent() {
        const contentArea = this.shadowRoot.querySelector(".filter-content");
        if (!contentArea) return;

        contentArea.innerHTML = "";

        const filteredValues = this.#getFilteredValues();

        if (this.#shouldVirtualize(filteredValues)) {
            this.#renderVirtualValueList(contentArea, filteredValues);
        } else {
            this.#renderDirectValueList(contentArea, filteredValues);
        }
    }

    #renderDirectValueList(container, values) {
        const allChecked = values.every(v => !this.#uncheckedValues.has(v));

        const selectAllItem = document.createElement("div");
        selectAllItem.className = "filter-value-item";
        selectAllItem.innerHTML = `
            <input type="checkbox" ${allChecked ? "checked" : ""}>
            <span>(全选)</span>
        `;
        selectAllItem.addEventListener("click", () => {
            if (allChecked) {
                values.forEach(v => this.#uncheckedValues.add(v));
            } else {
                values.forEach(v => this.#uncheckedValues.delete(v));
            }
            this.#renderContent();
        });
        container.appendChild(selectAllItem);

        values.forEach(value => {
            const item = document.createElement("div");
            item.className = "filter-value-item";
            item.dataset.value = value;

            const checked = !this.#uncheckedValues.has(value);
            item.innerHTML = `
                <input type="checkbox" ${checked ? "checked" : ""}>
                <span>${this.escapeHtml(value)}</span>
            `;

            item.addEventListener("click", () => {
                if (this.#uncheckedValues.has(value)) {
                    this.#uncheckedValues.delete(value);
                } else {
                    this.#uncheckedValues.add(value);
                }
            });

            container.appendChild(item);
        });
    }

    #renderVirtualValueList(container, values) {
        if (this.#virtualList) {
            this.#virtualList.updateItems(values, this.#uncheckedValues);
            return;
        }

        this.#virtualList = document.createElement("virtual-value-list");
        container.appendChild(this.#virtualList);

        this.#virtualList.init(
            values,
            this.#uncheckedValues,
            (value, checked) => {
                if (checked) {
                    this.#uncheckedValues.delete(value);
                } else {
                    this.#uncheckedValues.add(value);
                }
            }
        );
    }

    #renderConditionOperators() {
        const select = this.shadowRoot.querySelector(".filter-condition-operator");
        if (!select) return;

        const operators = this.#options?.conditionOperators || [
            "eq", "neq", "contains", "notContains"
        ];

        const operatorLabels = {
            eq: "等于",
            neq: "不等于",
            contains: "包含",
            notContains: "不包含",
            startsWith: "开头是",
            endsWith: "结尾是",
            gt: "大于",
            gte: "大于等于",
            lt: "小于",
            lte: "小于等于"
        };

        select.innerHTML = "";
        operators.forEach(op => {
            const option = document.createElement("option");
            option.value = op;
            option.textContent = operatorLabels[op] || op;
            if (op === this.#conditionOperator) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    #applyCurrentFilter() {
        let filter;

        if (this.#filterMode === "values") {
            filter = {
                type: "values",
                uncheckedValues: new Set(this.#uncheckedValues)
            };
        } else {
            filter = {
                type: "condition",
                operator: this.#conditionOperator,
                value: this.#conditionValue
            };
        }

        this.#onApply?.(filter);
    }

    #adjustPosition() {
        const rect = this.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (rect.right > viewportWidth) {
            this.style.left = `${viewportWidth - rect.width - 10}px`;
        }

        if (rect.bottom > viewportHeight) {
            const headerHeight = this.querySelector(".filter-dropdown-panel")?.offsetHeight || 300;
            this.style.top = `${rect.top - headerHeight}px`;
        }
    }
}

customElements.define("filter-dropdown", FilterDropdown);
```

---

## 5. 虚拟滚动设计

### 5.1 VirtualValueList 组件

当唯一值数量超过阈值时，使用虚拟滚动优化性能。

```javascript
// src/plugins/filter/VirtualValueList.js

import { WebComponent } from "../../core/WebComponent.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class VirtualValueList extends WebComponent {

    /** @type {Array<string>} */
    #items = [];

    /** @type {Set<string>} */
    #uncheckedValues = new Set();

    /** @type {Function|null} */
    #onToggle = null;

    /** @type {number} */
    #itemHeight = 28;

    /** @type {number} */
    #visibleCount = 10;

    /** @type {number} */
    #scrollTop = 0;

    /** @type {HTMLElement|null} */
    #renderZone = null;

    init(items, uncheckedValues, onToggle) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        this.#onToggle = onToggle;
    }

    updateItems(items, uncheckedValues) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        this.#renderVisibleItems();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    height: ${this.#visibleCount * this.#itemHeight}px;
                    overflow-y: auto;
                    position: relative;
                }
                .virtual-container {
                    height: ${this.#items.length * this.#itemHeight}px;
                    position: relative;
                }
                .virtual-item {
                    position: absolute;
                    left: 0;
                    right: 0;
                    height: ${this.#itemHeight}px;
                    display: flex;
                    align-items: center;
                    padding: 0 12px;
                    cursor: pointer;
                    box-sizing: border-box;
                }
                .virtual-item:hover {
                    background: #f5f5f5;
                }
                .virtual-item input[type="checkbox"] {
                    margin-right: 8px;
                }
            </style>
            <div class="virtual-container">
                <div class="virtual-render-zone"></div>
            </div>
        `;

        this.#renderZone = this.shadowRoot.querySelector(".virtual-render-zone");
    }

    onConnect(disposable) {
        disposable.trackEvent(this, EVENT_NAMES.SCROLL, this.#handleScroll.bind(this));
        this.#renderVisibleItems();
    }

    onDisconnect() {
        this.#items = [];
        this.#uncheckedValues.clear();
        this.#onToggle = null;
    }

    #handleScroll() {
        this.#scrollTop = this.scrollTop;
        this.#renderVisibleItems();
    }

    #renderVisibleItems() {
        if (!this.#renderZone) return;

        const startIndex = Math.floor(this.#scrollTop / this.#itemHeight);
        const endIndex = Math.min(startIndex + this.#visibleCount + 2, this.#items.length);

        let html = "";
        for (let i = startIndex; i < endIndex; i++) {
            const value = this.#items[i];
            const checked = !this.#uncheckedValues.has(value);
            const top = i * this.#itemHeight;

            html += `
                <div class="virtual-item" style="top: ${top}px;" data-value="${this.escapeHtml(value)}">
                    <input type="checkbox" ${checked ? "checked" : ""}>
                    <span>${this.escapeHtml(value)}</span>
                </div>
            `;
        }

        this.#renderZone.innerHTML = html;
        this.#bindRenderZoneEvents();
    }

    #bindRenderZoneEvents() {
        if (!this.#renderZone) return;

        this.#renderZone.addEventListener(EVENT_NAMES.CLICK, (e) => {
            const valueItem = e.target.closest(".virtual-item");
            if (!valueItem) return;

            const key = valueItem.dataset.value;
            const checkbox = valueItem.querySelector('input[type="checkbox"]');

            if (e.target === checkbox) {
                if (checkbox.checked) {
                    this.#uncheckedValues.delete(key);
                } else {
                    this.#uncheckedValues.add(key);
                }
            } else {
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

customElements.define("virtual-value-list", VirtualValueList);
```

### 5.2 虚拟滚动原理

```
可视区域（280px = 10项 × 28px/项）
┌─────────────────────────────────┐
│ Item 50  ← 实际渲染             │
│ Item 51                         │
│ ...                             │
│ Item 60                         │
└─────────────────────────────────┘
         ↑ scrollTop

完整容器（1400px = 50项 × 28px/项）
┌─────────────────────────────────┐
│ Item 0                          │  ← 不渲染
│ Item 1                          │
│ ...                             │
│ Item 49                         │
│ Item 50  ← startIndex           │  ← 渲染区域
│ Item 61  ← endIndex             │
│ ...                             │
│ Item 99                         │  ← 不渲染
└─────────────────────────────────┘
```

---

## 6. 数据流设计

### 6.1 筛选应用数据流

```
用户点击"确定"按钮
        │
        ▼
  FilterDropdown.#applyCurrentFilter()
        │
        ▼
  构建 ColumnFilter 对象
        │
        ▼
  FilterUIManager.#onApply(filter)
        │
        ▼
  FilterState.setColumnFilter(col, filter)
        │
        ▼
  FilterPlugin.#reapplyFilter()
        │
        ▼
  FilterEngine.computeHiddenRows()
        │
        ▼
  HiddenRowsPlugin.setHiddenRows(hiddenRows)
        │
        ▼
  renderEngine.invalidateAll() → render()
```

### 6.2 面板打开数据流

```
用户点击列头筛选按钮
        │
        ▼
  FilterUIManager.#handleHeaderClick(e)
        │
        ▼
  FilterUIManager.#openDropdown(col, position)
        │
        ▼
  FilterEngine.extractUniqueValues(col)
        │
        ▼
  document.createElement("filter-dropdown")
  document.body.appendChild(dropdown)
        │
        ▼
  dropdown.show(col, position, uniqueValues, currentFilter, options)
        │
        ▼
  FilterDropdown.render() → Shadow DOM 模板渲染
  FilterDropdown.onConnect() → 事件绑定
  FilterDropdown.#adjustPosition() → 定位
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
   ├─ 之前虚拟 + 现在直接 → destroy VirtualValueList → #renderDirectValueList()
   ├─ 之前直接 + 现在虚拟 → #renderVirtualValueList()
   ├─ 虚拟 → 虚拟 → VirtualValueList.updateItems(filteredValues)
   └─ 直接 → 直接 → #renderDirectValueList()
```

---

## 7. 钩子系统扩展

### 7.1 新增钩子

| 钩子名 | 触发时机 | 参数 |
|--------|----------|------|
| `BEFORE_FILTER_APPLY` | 筛选应用前 | `{ col, filter }` |
| `AFTER_FILTER_APPLY` | 筛选应用后 | `{ col, filter, hiddenCount }` |
| `BEFORE_FILTER_CLEAR` | 清除筛选前 | `{ col }` |
| `AFTER_FILTER_CLEAR` | 清除筛选后 | `{ col }` |
| `BEFORE_FILTER_DROPDOWN_OPEN` | 面板打开前 | `{ col }` |
| `AFTER_FILTER_DROPDOWN_OPEN` | 面板打开后 | `{ col, uniqueValues }` |

### 7.2 钩子注册示例

```javascript
// 在 FilterPlugin.init() 中注册
this.addHook(HOOKS.BEFORE_FILTER_APPLY, (payload) => {
    // 允许拦截或修改筛选条件
    console.log("即将应用筛选:", payload.col, payload.filter);
    return payload; // 返回修改后的 payload 或 undefined 取消
});
```

---

## 8. 与现有插件的交互

### 8.1 与 HiddenRowsPlugin 的交互

| 场景 | 行为 |
|------|------|
| 筛选激活 | 通过 `HiddenRowsPlugin.setHiddenRows()` 设置隐藏行 |
| 筛选清除 | 重新计算隐藏行（可能其他列仍有筛选） |
| 排序后 | 重新应用筛选（排序改变行顺序） |
| 冻结列 | 筛选面板不受冻结影响（DOM 覆盖层） |

### 8.2 与 SortPlugin 的交互

| 场景 | 行为 |
|------|------|
| 排序后 | 重新应用筛选（行顺序变化） |
| 筛选后排序 | 排序仅对可见行生效 |

### 8.3 与 FreezePlugin 的交互

| 场景 | 行为 |
|------|------|
| 冻结列筛选 | 面板定位需考虑冻结偏移 |
| 筛选面板层级 | z-index 高于冻结区域 |

---

## 9. 渲染层集成

### 9.1 列头筛选图标渲染

筛选图标由 `FilterPlugin.#registerHeaderRenderer()` 通过 `HeaderRenderer.addDecorator()` 注入，在列头右侧绘制漏斗图标。

### 9.2 渲染层级

| 层级 | Z-Index | 内容 |
|------|---------|------|
| Canvas 底层 | 0 | 单元格内容 |
| Canvas 列头层 | 1 | 列头文字 + 筛选图标 |
| Canvas 选择层 | 2 | 选区高亮 |
| DOM 覆盖层 | 9999+ | FilterDropdown 面板（WebComponent） |

### 9.3 性能优化

- 筛选图标使用 Path2D 缓存，避免重复创建
- 唯一值结果缓存，避免重复计算
- 虚拟滚动减少 DOM 节点数量
- Shadow DOM 隔离样式，避免全局污染

---

## 10. API 设计

### 10.1 公共 API

```javascript
// 获取筛选插件实例
const filterPlugin = workbook.getPlugin("filter");

// 编程式添加筛选
filterPlugin.addFilter(0, {
    type: "values",
    uncheckedValues: new Set(["Alice", "Bob"])
});

// 编程式添加条件筛选
filterPlugin.addFilter(1, {
    type: "condition",
    operator: "gt",
    value: "25"
});

// 移除单列筛选
filterPlugin.removeFilter(0);

// 清除所有筛选
filterPlugin.clearAllFilters();

// 获取当前筛选状态
const state = filterPlugin.getFilterState();
console.log(state.getAllFilters());

// 获取筛选引擎
const engine = filterPlugin.getFilterEngine();
const uniqueValues = engine.extractUniqueValues(0);
```

### 10.2 事件 API

```javascript
// 监听筛选变化
workbook.on("afterFilterApply", ({ col, filter, hiddenCount }) => {
    console.log(`列 ${col} 应用筛选，隐藏 ${hiddenCount} 行`);
});

// 监听筛选清除
workbook.on("afterFilterClear", ({ col }) => {
    console.log(`列 ${col} 筛选已清除`);
});
```

---

## 11. 配置项设计

### 11.1 可配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `filterButtonVisible` | boolean | true | 是否显示筛选按钮 |
| `conditionOperators` | string[] | [...] | 支持的条件操作符 |
| `dropdownWidth` | number | 240 | 下拉面板宽度（px） |
| `dropdownMaxHeight` | number | 360 | 下拉面板最大高度（px） |
| `virtualScrollThreshold` | number | 200 | 启用虚拟滚动的阈值 |
| `maxUniqueValues` | number | 10000 | 最大唯一值数量限制 |
| `searchDebounceMs` | number | 150 | 搜索防抖时间（ms） |

### 11.2 配置示例

```javascript
workbook.initPlugin("filter", {
    filterButtonVisible: true,
    virtualScrollThreshold: 500,
    dropdownWidth: 280
});
```

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
│       ├── FilterDropdown.js              # 下拉面板（继承 WebComponent）
│       ├── VirtualValueList.js            # 虚拟滚动值列表（继承 WebComponent）
│       └── FilterStrategy.js              # 事件策略
├── core/
│   ├── WebComponent.js                    # Web Components 基类（已有）
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

| 测试模块 | 测试内容 |
|----------|----------|
| FilterState | 状态存取、缓存管理、清除操作 |
| FilterEngine | 唯一值提取、行隐藏计算、条件评估 |
| FilterDropdown | Shadow DOM 渲染、事件处理、模式切换 |
| VirtualValueList | 虚拟滚动渲染、滚动事件、项目更新 |
| FilterStrategy | 事件识别、坐标计算、策略分发 |

### 13.2 集成测试

| 测试场景 | 测试内容 |
|----------|----------|
| 完整筛选流程 | 打开面板 → 设置筛选 → 应用 → 验证隐藏行 |
| 多列筛选 | 同时设置两列筛选，验证 AND 逻辑 |
| 搜索过滤 | 输入关键词 → 验证值列表过滤 |
| 虚拟滚动 | 大数据量 → 验证虚拟滚动启用 |
| 状态持久化 | 切换工作表 → 验证筛选状态保留 |

### 13.3 性能测试

| 测试指标 | 目标值 |
|----------|--------|
| 10,000 行数据唯一值提取 | < 100ms |
| 面板打开响应时间 | < 50ms |
| 虚拟滚动帧率 | ≥ 55fps |
| 内存占用增长 | 线性（无泄漏） |

---

## 14. 实现路线图

### 阶段一：核心功能（5 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| 1 | FilterState + FilterEngine | 筛选状态管理和筛选计算 |
| 2 | FilterPlugin 骨架 + FilterStrategy | 插件注册、事件处理 |
| 3 | FilterDropdown（继承 WebComponent） | 下拉面板 DOM 构建 |
| 4 | FilterUIManager + 列头图标渲染 | 筛选按钮和面板管理 |
| 5 | 集成测试 + Bug 修复 | 可用的筛选功能 |

### 阶段二：高级功能（3 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| 6 | VirtualValueList（继承 WebComponent） | 虚拟滚动优化 |
| 7 | 条件筛选 + 搜索功能 | 完整筛选能力 |
| 8 | 钩子系统 + 文档完善 | 可扩展架构 |

### 阶段三：优化完善（2 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| 9 | 性能优化 + 边界情况处理 | 生产级质量 |
| 10 | 全面测试 + 代码审查 | 发布就绪 |

---

## 附录 A: WebComponent 迁移指南

### A.1 从 DOMComponent 迁移到 WebComponent

| 特性 | DOMComponent（旧） | WebComponent（新） |
|------|-------------------|-------------------|
| 基类 | `DOMComponent` | `WebComponent extends HTMLElement` |
| 样式注入 | `this.injectStyle()` | Shadow DOM `<style>` 标签 |
| 元素创建 | `this.createElement()` | `document.createElement()` |
| 事件绑定 | `this.trackEvent()` | `disposable.trackEvent()` |
| 销毁回调 | `onDestroy()` | `onDisconnect()` |
| 模板渲染 | 无标准方法 | `render()` 方法 |
| 组件注册 | 无需 | `customElements.define()` |

### A.2 生命周期对比

```
DOMComponent:
  constructor → init → trackEvent → injectStyle → onDestroy

WebComponent:
  constructor → attachShadow → connectedCallback → 
    → new Disposable() → render() → onConnect(disposable) → 
    → [异步初始化] → render()
  
  销毁:
  destroy() → shouldDestroy=true → remove() → disconnectedCallback → 
    → onDisconnect() → disposable.destroy()
```

### A.3 关键注意事项

1. **Shadow DOM 隔离**：样式只作用于组件内部，不会影响外部
2. **事件穿透**：使用 `composed: true` 和 `bubbles: true` 让事件穿透 Shadow DOM
3. **资源清理**：在 `onDisconnect()` 中清理所有子组件和引用
4. **显式销毁**：必须调用 `destroy()` 而非直接 `remove()` 来触发完整清理

---

---

## 附录 B: Excel 100% 兼容的空值处理实现

### B.1 空值定义与分类

#### B.1.1 空值类型定义

```javascript
// src/plugins/filter/NullValueTypes.js

export const NULL_VALUE_TYPES = {
    BLANK: "blank",
    EMPTY_STRING: "emptyString",
    NULL: "null",
    UNDEFINED: "undefined"
};

export class NullValueHandler {

    static BLANK_DISPLAY = "(空白)";
    static NULL_KEY = "__EXCEL_NULL__";

    static isNullValue(value) {
        return value === null ||
               value === undefined ||
               value === "" ||
               (typeof value === "string" && value.trim() === "");
    }

    static getNullType(value) {
        if (value === null) return NULL_VALUE_TYPES.NULL;
        if (value === undefined) return NULL_VALUE_TYPES.UNDEFINED;
        if (value === "") return NULL_VALUE_TYPES.EMPTY_STRING;
        if (typeof value === "string" && value.trim() === "") return NULL_VALUE_TYPES.BLANK;
        return null;
    }

    static normalizeToKey(value) {
        if (this.isNullValue(value)) {
            return this.NULL_KEY;
        }
        return String(value);
    }

    static formatForDisplay(value) {
        if (this.isNullValue(value)) {
            return this.BLANK_DISPLAY;
        }
        return String(value);
    }

    static isBlankOnly(value) {
        return value === "" || 
               (typeof value === "string" && value.trim() === "");
    }
}
```

### B.2 Excel 空值行为规范

#### B.2.1 值列表中的空值显示规则

| 场景 | Excel 行为 | 实现方案 |
|------|-----------|----------|
| 唯一值列表 | 显示 "(空白)" 项，始终排在最后 | 使用 `NULL_KEY` 作为内部标识 |
| 默认状态 | "(空白)" 默认勾选 | 初始化时 `uncheckedValues` 不包含 `NULL_KEY` |
| 取消勾选 | 隐藏所有空值行 | 将 `NULL_KEY` 加入 `uncheckedValues` |
| 全选/取消全选 | 影响 "(空白)" 项 | 统一处理，无特殊逻辑 |

**UI 示例：**
```
┌──────────────────────────┐
│  🔍 搜索...              │
├──────────────────────────┤
│  ☑ (全选)                │
├──────────────────────────┤
│  ☑ Alice                 │
│  ☑ Bob                   │
│  ☑ Carol                 │
│  ☑ (空白)                │  ← 始终排在最后
├──────────────────────────┤
│  [清除筛选]    [确定]     │
└──────────────────────────┘
```

#### B.2.2 条件筛选的空值匹配规则

| 操作符 | 输入值 | 空值单元格匹配结果 | 说明 |
|--------|--------|-------------------|------|
| **等于** (=) | 空 | ✅ 匹配 | 仅匹配真正的空单元格 |
| **等于** (=) | 非空 | ❌ 不匹配 | 空单元格不等于任何非空值 |
| **不等于** (<>) | 空 | ❌ 不匹配 | 空单元格被排除 |
| **不等于** (<>) | 非空 | ✅ 匹配 | 空单元格不等于该值 |
| **包含** | 任意 | ❌ 不匹配 | 空字符串不包含任何内容 |
| **不包含** | 任意 | ✅ 匹配 | 空字符串不包含任何内容 |
| **开头是** | 任意 | ❌ 不匹配 | 空字符串没有开头 |
| **结尾是** | 任意 | ❌ 不匹配 | 空字符串没有结尾 |
| **大于** (> ) | 数值 | ❌ 不匹配 | 无法数值比较 |
| **小于** (< ) | 数值 | ❌ 不匹配 | 无法数值比较 |
| **大于等于** (>=) | 数值 | ❌ 不匹配 | 无法数值比较 |
| **小于等于** (<=) | 数值 | ❌ 不匹配 | 无法数值比较 |

**特殊场景处理：**

1. **"等于空" 筛选**：
   ```javascript
   if (operator === "eq" && (conditionValue == null || conditionValue === "")) {
       return NullValueHandler.isNullValue(cellValue);
   }
   ```

2. **"不等于空" 筛选**：
   ```javascript
   if (operator === "neq" && (conditionValue == null || conditionValue === "")) {
       return !NullValueHandler.isNullValue(cellValue);
   }
   ```

3. **文本操作符 + 空单元格**：
   ```javascript
   const textOperators = ["contains", "notContains", "startsWith", "endsWith"];
   if (textOperators.includes(operator) && NullValueHandler.isNullValue(cellValue)) {
       // 根据上表返回固定结果
       return operator === "notContains";
   }
   ```

4. **数值操作符 + 空单元格**：
   ```javascript
   const numericOperators = ["gt", "gte", "lt", "lte"];
   if (numericOperators.includes(operator) && NullValueHandler.isNullValue(cellValue)) {
       return false; // 空单元格永远不满足数值条件
   }
   ```

### B.3 排序时的空值位置

#### B.3.1 Excel 空值排序规则

- **升序排列**：空值始终排在最前面（或最后，取决于区域设置）
- **降序排列**：空值始终排在最后面
- **默认行为**：空值视为"最小值"

**实现代码：**
```javascript
// 在 FilterEngine 或 SortEngine 中
static compareWithNull(a, b, order) {
    const aIsNull = NullValueHandler.isNullValue(a);
    const bIsNull = NullValueHandler.isNullValue(b);

    if (aIsNull && bIsNull) return 0;
    if (aIsNull) return -1; // 空值排前面（升序）
    if (bIsNull) return 1;

    // 正常比较逻辑...
}
```

### B.4 更新后的 FilterEngine 实现

```javascript
// src/plugins/filter/FilterEngine.js（更新版）

import { NullValueHandler } from "./NullValueTypes.js";

export class FilterEngine {

    #sheet;
    #filterState;

    constructor(sheet, filterState) {
        this.#sheet = sheet;
        this.#filterState = filterState;
    }

    extractUniqueValues(col) {
        const cached = this.#filterState.getUniqueValuesCache(col);
        if (cached && this.#filterState.isCacheValid(col)) {
            return cached;
        }

        const values = new Set();
        const hasNullValues = new Set([false]);
        const rowCount = this.#sheet.rowCount || 1000;

        for (let row = 0; row < rowCount; row++) {
            const cellValue = this.#sheet.getCellValue(row, col);

            if (NullValueHandler.isNullValue(cellValue)) {
                values.add(NullValueHandler.NULL_KEY);
                hasNullValues.clear();
                hasNullValues.add(true);
            } else {
                const key = String(cellValue);
                values.add(key);
            }
        }

        let result = Array.from(values).filter(v => v !== NullValueHandler.NULL_KEY);
        result.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        if (hasNullValues.has(true)) {
            result.push(NullValueHandler.NULL_KEY);
        }

        this.#filterState.cacheUniqueValues(col, result);
        return result;
    }

    computeHiddenRows() {
        const filters = this.#filterState.getAllFilters();
        if (filters.size === 0) return new Set();

        const rowCount = this.#sheet.rowCount || 1000;
        const hiddenRows = new Set();

        for (let row = 0; row < rowCount; row++) {
            let visible = true;

            for (const [col, filter] of filters) {
                if (!this.#rowMatchesFilter(row, col, filter)) {
                    visible = false;
                    break;
                }
            }

            if (!visible) {
                hiddenRows.add(row);
            }
        }

        return hiddenRows;
    }

    #rowMatchesFilter(row, col, filter) {
        const cellValue = this.#sheet.getCellValue(row, col);
        const isNullCell = NullValueHandler.isNullValue(cellValue);

        if (filter.type === "values") {
            const cellKey = isNullCell ? NullValueHandler.NULL_KEY : String(cellValue);
            return !filter.uncheckedValues.has(cellKey);
        }

        if (filter.type === "condition") {
            return this.#evaluateConditionWithNull(
                cellValue, 
                isNullCell,
                filter.operator, 
                filter.value
            );
        }

        return true;
    }

    #evaluateConditionWithNull(cellValue, isNullCell, operator, conditionValue) {
        const isConditionEmpty = NullValueHandler.isNullValue(conditionValue);

        if (operator === "eq") {
            if (isConditionEmpty) {
                return isNullCell;
            }
            if (isNullCell) return false;
            return cellValue == conditionValue;
        }

        if (operator === "neq") {
            if (isConditionEmpty) {
                return !isNullCell;
            }
            if (isNullCell) return true;
            return cellValue != conditionValue;
        }

        const textOperators = ["contains", "notContains", "startsWith", "endsWith"];
        if (textOperators.includes(operator)) {
            if (isNullCell) {
                return operator === "notContains";
            }
            return this.#evaluateTextCondition(cellValue, operator, conditionValue);
        }

        const numericOperators = ["gt", "gte", "lt", "lte"];
        if (numericOperators.includes(operator)) {
            if (isNullCell) {
                return false;
            }
            return this.#evaluateNumericCondition(cellValue, operator, conditionValue);
        }

        return true;
    }

    #evaluateTextCondition(value, operator, conditionValue) {
        const strValue = String(value).toLowerCase();
        const strCondition = String(conditionValue).toLowerCase();

        switch (operator) {
            case "contains": return strValue.includes(strCondition);
            case "notContains": return !strValue.includes(strCondition);
            case "startsWith": return strValue.startsWith(strCondition);
            case "endsWith": return strValue.endsWith(strCondition);
            default: return true;
        }
    }

    #evaluateNumericCondition(value, operator, conditionValue) {
        const numValue = Number(value);
        const numCondition = Number(conditionValue);

        if (isNaN(numValue) || isNaN(numCondition)) {
            return false;
        }

        switch (operator) {
            case "gt": return numValue > numCondition;
            case "gte": return numValue >= numCondition;
            case "lt": return numValue < numCondition;
            case "lte": return numValue <= numCondition;
            default: return true;
        }
    }
}
```

### B.5 更新后的 FilterDropdown UI 实现

```javascript
// src/plugins/filter/FilterDropdown.js（更新版 - 空值处理部分）

import { NullValueHandler } from "./NullValueTypes.js";

export class FilterDropdown extends WebComponent {

    // ... 其他属性保持不变 ...

    #renderDirectValueList(container, values) {
        const normalValues = values.filter(v => v !== NullValueHandler.NULL_KEY);
        const hasBlankValue = values.includes(NullValueHandler.NULL_KEY);

        const allNormalChecked = normalValues.every(v => !this.#uncheckedValues.has(v));
        const blankChecked = hasBlankValue && !this.#uncheckedValues.has(NullValueHandler.NULL_KEY);

        const selectAllItem = document.createElement("div");
        selectAllItem.className = "filter-value-item";
        
        const allChecked = allNormalChecked && (!hasBlankValue || blankChecked);
        selectAllItem.innerHTML = `
            <input type="checkbox" ${allChecked ? "checked" : ""}>
            <span>(全选)</span>
        `;
        
        selectAllItem.addEventListener("click", () => {
            if (allChecked) {
                values.forEach(v => this.#uncheckedValues.add(v));
            } else {
                values.forEach(v => this.#uncheckedValues.delete(v));
            }
            this.#renderContent();
        });
        container.appendChild(selectAllItem);

        normalValues.forEach(value => {
            const item = this.#createValueItem(value);
            container.appendChild(item);
        });

        if (hasBlankValue) {
            const blankItem = document.createElement("div");
            blankItem.className = "filter-value-item";
            blankItem.dataset.value = NullValueHandler.NULL_KEY;
            
            const checked = !this.#uncheckedValues.has(NullValueHandler.NULL_KEY);
            blankItem.innerHTML = `
                <input type="checkbox" ${checked ? "checked" : ""}>
                <span style="font-style: italic; color: #999;">${NullValueHandler.BLANK_DISPLAY}</span>
            `;
            
            blankItem.addEventListener("click", () => {
                if (this.#uncheckedValues.has(NullValueHandler.NULL_KEY)) {
                    this.#uncheckedValues.delete(NullValueHandler.NULL_KEY);
                } else {
                    this.#uncheckedValues.add(NullValueHandler.NULL_KEY);
                }
            });
            
            container.appendChild(blankItem);
        }

        const separator = document.createElement("div");
        separator.style.cssText = "height: 1px; background: #f0f0f0; margin: 4px 12px;";
        container.appendChild(separator);
    }

    #createValueItem(value) {
        const item = document.createElement("div");
        item.className = "filter-value-item";
        item.dataset.value = value;

        const checked = !this.#uncheckedValues.has(value);
        item.innerHTML = `
            <input type="checkbox" ${checked ? "checked" : ""}>
            <span>${this.escapeHtml(value)}</span>
        `;

        item.addEventListener("click", () => {
            if (this.#uncheckedValues.has(value)) {
                this.#uncheckedValues.delete(value);
            } else {
                this.#uncheckedValues.add(value);
            }
        });

        return item;
    }

    #getFilteredValues() {
        let filtered = this.#allValues;

        if (this.#searchKeyword) {
            const keyword = this.#searchKeyword.toLowerCase();
            filtered = filtered.filter(v => {
                if (v === NullValueHandler.NULL_KEY) {
                    return false; // 搜索时不显示空白项
                }
                return v.toLowerCase().includes(keyword);
            });

            if (this.#allValues.includes(NullValueHandler.NULL_KEY)) {
                filtered.push(NullValueHandler.NULL_KEY); // 始终保持空白项在最后
            }
        }

        return filtered;
    }
}
```

### B.6 VirtualValueList 空值处理更新

```javascript
// src/plugins/filter/VirtualValueList.js（更新版 - 空值处理部分）

import { NullValueHandler } from "./NullValueTypes.js";

export class VirtualValueList extends WebComponent {

    // ... 其他方法保持不变 ...

    updateItems(items, uncheckedValues) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        
        const normalItems = items.filter(item => item !== NullValueHandler.NULL_KEY);
        const hasBlank = items.includes(NullValueHandler.NULL_KEY);
        
        if (hasBlank) {
            this.#visibleCount = Math.max(this.#visibleCount, normalItems.length + 1);
        }
        
        this.#renderVisibleItems();
    }

    #renderVisibleItems() {
        if (!this.#renderZone) return;

        const startIndex = Math.floor(this.#scrollTop / this.#itemHeight);
        const endIndex = Math.min(startIndex + this.#visibleCount + 2, this.#items.length);

        let html = "";
        let renderedIndex = 0;

        for (let i = startIndex; i < endIndex; i++) {
            const value = this.#items[i];
            const isBlank = value === NullValueHandler.NULL_KEY;
            const checked = !this.#uncheckedValues.has(value);
            const top = i * this.#itemHeight;

            if (isBlank) {
                html += `
                    <div class="virtual-item virtual-blank-item" style="top: ${top}px;" data-value="${value}">
                        <input type="checkbox" ${checked ? "checked" : ""}>
                        <span style="font-style: italic; color: #999;">${NullValueHandler.BLANK_DISPLAY}</span>
                    </div>
                `;
            } else {
                html += `
                    <div class="virtual-item" style="top: ${top}px;" data-value="${this.escapeHtml(value)}">
                        <input type="checkbox" ${checked ? "checked" : ""}>
                        <span>${this.escapeHtml(value)}</span>
                    </div>
                `;
            }

            renderedIndex++;
        }

        this.#renderZone.innerHTML = html;
        this.#bindRenderZoneEvents();
    }
}
```

### B.7 空值处理的测试用例

#### B.7.1 单元测试

```javascript
// test/unit/NullValueHandler.test.js

import { NullValueHandler, NULL_VALUE_TYPES } from "../../src/plugins/filter/NullValueTypes.js";

describe("NullValueHandler", () => {
    
    describe("isNullValue()", () => {
        it("应该识别 null 为空值", () => {
            expect(NullValueHandler.isNullValue(null)).toBe(true);
        });

        it("应该识别 undefined 为空值", () => {
            expect(NullValueHandler.isNullValue(undefined)).toBe(true);
        });

        it("应该识别空字符串为空值", () => {
            expect(NullValueHandler.isNullValue("")).toBe(true);
        });

        it("应该识别纯空格字符串为空值", () => {
            expect(NullValueHandler.isNullValue("   ")).toBe(true);
        });

        it("不应该识别正常值为空值", () => {
            expect(NullValueHandler.isNullValue("Alice")).toBe(false);
            expect(NullValueHandler.isNullValue(0)).toBe(false);
            expect(NullValueHandler.isNullValue(false)).toBe(false);
        });
    });

    describe("normalizeToKey()", () => {
        it("应该将所有空值转换为 NULL_KEY", () => {
            expect(NullValueHandler.normalizeToKey(null)).toBe(NullValueHandler.NULL_KEY);
            expect(NullValueHandler.normalizeToKey(undefined)).toBe(NullValueHandler.NULL_KEY);
            expect(NullValueHandler.normalizeToKey("")).toBe(NullValueHandler.NULL_KEY);
        });

        it("应该保留正常值的字符串形式", () => {
            expect(NullValueHandler.normalizeToKey("Alice")).toBe("Alice");
            expect(NullValueHandler.normalizeToKey(123)).toBe("123");
        });
    });

    describe("formatForDisplay()", () => {
        it("应该将空值格式化为 '(空白)'", () => {
            expect(NullValueHandler.formatForDisplay(null)).toBe("(空白)");
            expect(NullValueHandler.formatForDisplay("")).toBe("(空白)");
        });

        it("应该保留正常值的显示", () => {
            expect(NullValueHandler.formatForDisplay("Alice")).toBe("Alice");
        });
    });
});
```

#### B.7.2 集成测试

```javascript
// test/integration/FilterNullHandling.test.js

describe("Excel 兼容的空值筛选", () => {
    
    let workbook;
    let filterPlugin;

    beforeEach(() => {
        workbook = createTestWorkbook({
            data: [
                ["Name", "Age", "Dept"],
                ["Alice", 30, "Sales"],
                ["Bob", null, "Dev"],
                ["", 25, "HR"],
                ["Carol", 35, ""],
                [null, 28, "Sales"]
            ]
        });
        
        filterPlugin = workbook.getPlugin("filter");
        filterPlugin.init();
    });

    it("应该在唯一值列表中显示 '(空白)' 并排在最后", () => {
        const engine = filterPlugin.getFilterEngine();
        const uniqueValues = engine.extractUniqueValues(0); // Name 列
        
        expect(uniqueValues).toContain("__EXCEL_NULL__");
        expect(uniqueValues[uniqueValues.length - 1]).toBe("__EXCEL_NULL__");
    });

    it("'等于空' 条件应该只匹配空单元格", () => {
        filterPlugin.addFilter(0, {
            type: "condition",
            operator: "eq",
            value: ""
        });

        const hiddenRows = filterPlugin.getFilterEngine().computeHiddenRows();
        
        expect(hiddenRows).not.toContain(1); // Alice - 可见
        expect(hiddenRows).toContain(2);     // Bob (null Age, 但 Name 非空)
        expect(hiddenRows).toContain(3);     // "" (空 Name)
        expect(hiddenRows).not.toContain(4); // Carol - 可见
        expect(hiddenRows).toContain(5);     // null Name
    });

    it("'包含' 条件不应该匹配空单元格", () => {
        filterPlugin.addFilter(2, { // Dept 列
            type: "condition",
            operator: "contains",
            value: "S"
        });

        const hiddenRows = filterPlugin.getFilterEngine().computeHiddenRows();
        
        expect(hiddenRows).not.toContain(1); // Sales - 包含 S
        expect(hiddenRows).not.toContain(2); // Dev - 不包含，但这是其他原因
        expect(hiddenRows).toContain(4);     // Carol 的空 Dept - 不匹配
    });

    it("取消勾选 '(空白)' 应该隐藏所有空值行", () => {
        const uiManager = filterPlugin.getFilterUIManager();
        
        uiManager.openDropdown(0, { x: 100, y: 100 });
        
        const dropdown = document.querySelector("filter-dropdown");
        const uncheckedValues = new Set(["__EXCEL_NULL__"]);
        
        dropdown.show(0, { x: 100, y: 100 }, ["Alice", "Bob", "__EXCEL_NULL__"], null, {}, 
            (filter) => {
                filterPlugin.getFilterState().setColumnFilter(0, filter);
            },
            () => {}
        );

        const hiddenRows = filterPlugin.getFilterEngine().computeHiddenRows();
        
        expect(hiddenRows).toContain(3); // "" 行
        expect(hiddenRows).toContain(5); // null 行
        expect(hiddenRows).not.toContain(1); // Alice 行
    });

    it("搜索时应该隐藏 '(空白)' 项但保持其在列表末尾", () => {
        const engine = filterPlugin.getFilterEngine();
        const allValues = engine.extractUniqueValues(0);
        
        const filtered = allValues.filter(v => {
            if (v === "__EXCEL_NULL__") return false;
            return v.toLowerCase().includes("a");
        });
        
        filtered.push("__EXCEL_NULL__"); // 手动添加回空白项
        
        expect(filtered).toContain("Alice");
        expect(filtered).toContain("Carol");
        expect(filtered[filtered.length - 1]).toBe("__EXCEL_NULL__");
    });
});
```

### B.8 空值处理配置选项

```javascript
// 在 FilterPlugin.DEFAULT_OPTIONS 中新增

static DEFAULT_OPTIONS = {
    // ... 已有配置 ...
    
    nullValueHandling: {
        displayAs: "(空白)",           // 空值显示文本
        alwaysShowInList: true,         // 是否始终在列表中显示空值选项
        sortToEnd: true,                // 是否将空值排到最后
        treatBlankAsNull: true,         // 是否将空字符串视为 null
        trimWhitespace: true,           // 是否去除空白字符后判断
    },
    
    conditionNullBehavior: {
        eqEmptyMatchesNull: true,       // "等于空" 匹配空单元格
        textOpsExcludeNull: true,       // 文本操作符排除空单元格
        numericOpsExcludeNull: true,    // 数值操作符排除空单元格
    }
};
```

### B.9 空值处理的边界情况

| 场景 | 预期行为 | 测试用例 ID |
|------|----------|-------------|
| 整列都是空值 | 只显示 "(空白)" 一项 | NULL-001 |
| 混合空格和空字符串 | 都视为空值 | NULL-002 |
| 公式返回空字符串 | 视为空值 | NULL-003 |
| 单元格格式化后为空 | 视为空值 | NULL-004 |
| 搜索关键词为空字符串 | 显示全部值包括空值 | NULL-005 |
| 批量粘贴含空值数据 | 正确识别和处理 | NULL-006 |
| 撤销/重做操作 | 保持空值状态一致 | NULL-007 |
| 复制粘贴筛选后的数据 | 空值正确复制 | NULL-008 |

### B.10 性能优化建议

1. **缓存空值判断结果**：
   ```javascript
   #nullCache = new WeakMap();
   
   isNullCached(value) {
       if (this.#nullCache.has(value)) {
           return this.#nullCache.get(value);
       }
       const result = NullValueHandler.isNullValue(value);
       this.#nullCache.set(value, result);
       return result;
   }
   ```

2. **批量预处理空值**：
   ```javascript
   preprocessColumnData(col) {
       const data = [];
       for (let row = 0; row < this.rowCount; row++) {
           const value = this.getCellValue(row, col);
           data.push({
               raw: value,
               key: NullValueHandler.normalizeToKey(value),
               isNull: NullValueHandler.isNullValue(value)
           });
       }
       return data;
   }
   ```

3. **使用位标记优化存储**：
   ```javascript
   // 使用 BitSet 存储空值行信息，节省内存
   #nullRowFlags = new BitSet(rowCount);
   
   markNullRow(row, isNull) {
       if (isNull) {
           this.#nullRowFlags.set(row);
       } else {
           this.#nullRowFlags.clear(row);
       }
   }
   ```

---

*文档结束 - 附录 B: Excel 100% 兼容的空值处理实现*


