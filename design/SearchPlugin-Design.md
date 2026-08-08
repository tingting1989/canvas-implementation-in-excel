# 🔍 Search Plugin 技术设计文档

> **版本**: v1.0.0  
> **日期**: 2026-08-08  
> **状态**: 设计完成，待实施  
> **作者**: jiangtingting  
> **优先级**: P0 (最高优先级)  

---

## 📋 目录

- [1. 项目概述](#1-项目概述)
- [2. 需求分析](#2-需求分析)
- [3. 技术架构](#3-技术架构)
- [4. 核心模块设计](#4-核心模块设计)
- [5. API 接口定义](#5-api-接口定义)
- [6. UI/UX 设计](#6-uiux-设计)
- [7. 性能优化策略](#7-性能优化策略)
- [8. 与现有系统集成](#8-与现有系统集成)
- **[8.6 撤销/重做支持 (重要)](#86-撤销重做支持)** ← 新增
- [9. 实施计划](#9-实施计划)
- [10. 测试策略](#10-测试策略)
- [11. 风险评估与应对](#11-风险评估与应对)

---

## 1. 项目概述

### 1.1 背景

**@canvas-sheet-core** v1.0.15 周下载量达到 800 次，市场认可度高。为提升产品竞争力，需补齐关键功能短板。**搜索功能** 是企业级电子表格的必备特性，直接影响用户体验和工作效率。

### 1.2 目标

构建一个**高性能、易集成、可扩展**的全局搜索插件，提供类似 Excel/Ctrl+F 的搜索体验：

- ✅ 支持 100K+ 行大数据量的实时搜索
- ✅ 文本搜索 + 正则表达式双模式
- ✅ 结果高亮显示 + 键盘导航
- ✅ 搜索替换功能
- ✅ 完整的生命周期钩子支持

### 1.3 范围

| 功能 | Phase 1 (MVP) | Phase 2 (完善) | Phase 3 (高级) |
|------|:---:|:---:|:---:|
| 基础文本搜索 | ✅ | - | - |
| 正则表达式 | - | ✅ | - |
| 大小写敏感/全词匹配 | - | ✅ | - |
| 结果高亮渲染 | ✅ | - | - |
| F3/Shift+F3 导航 | ✅ | - | - |
| Ctrl+F 快捷键 | ✅ | - | - |
| 搜索替换 | - | ✅ | - |
| Web Worker 并行搜索 | - | - | ✅ |
| 搜索历史记录 | - | - | ✅ |
| 多工作表搜索 | - | - | ✅ |

---

## 2. 需求分析

### 2.1 功能需求

#### FR-01: 基本搜索能力
**描述**: 支持在全部单元格数据中搜索指定文本

**验收标准**:
- [ ] 输入关键词后 < 500ms 内返回结果（100万单元格）
- [ ] 支持大小写不敏感搜索（默认）
- [ ] 空值和公式计算结果不在搜索范围内
- [ ] 最大返回结果数可配置（默认 10000）

#### FR-02: 高级搜索选项
**描述**: 提供多种搜索模式以满足复杂场景

**选项列表**:
| 选项 | 默认值 | 说明 |
|------|--------|------|
| 大小写敏感 (Case Sensitive) | false | 区分 A 和 a |
| 全词匹配 (Whole Word) | false | "cat" 不匹配 "category" |
| 正则表达式 (Use Regex) | false | 支持正则语法 |

#### FR-03: 结果导航
**描述**: 在搜索结果之间快速跳转

**交互方式**:
- **F3**: 跳转到下一个匹配项
- **Shift+F3**: 跳转到上一个匹配项
- **Enter**: 同 F3
- **Shift+Enter**: 同 Shift+F3
- 点击"▲▼"按钮导航

#### FR-04: 结果高亮
**描述**: 在 Canvas 上可视化标记所有匹配位置

**高亮样式**:
- **普通匹配项**: 半透明黄色背景 `rgba(255, 255, 0, 0.3)`
- **当前选中项**: 橙色边框 + 加深背景 `rgba(255, 165, 0, 0.5)`
- 自动跟随视口滚动更新

#### FR-05: 搜索替换
**描述**: 支持逐个或批量替换匹配内容

**功能点**:
- 替换当前选中项
- 替换所有匹配项
- 替换前确认提示（可选）

### 2.2 非功能需求

#### NFR-01: 性能要求
| 数据规模 | 单元格数量 | 搜索耗时目标 | 内存占用上限 |
|---------|-----------|-------------|-------------|
| 小型 | ≤ 2万 | < 10ms | < 5MB |
| 中型 | ≤ 50万 | < 50ms | < 20MB |
| 大型 | ≤ 500万 | < 200ms | < 100MB |
| 超大型 | > 500万 | < 500ms* | < 200MB |

*建议启用 Web Worker 后台搜索

#### NFR-02: 可用性
- [ ] 响应式 UI，适配不同屏幕尺寸
- [ ] 支持键盘完全操作（无鼠标依赖）
- [ ] 清晰的状态反馈（搜索中、无结果、结果计数）
- [ ] 符合 WCAG 2.1 AA 无障碍标准（Phase 3）

#### NFR-03: 兼容性
- [ ] Chrome 90+ / Firefox 88+ / Safari 14+
- [ ] 与现有插件零冲突（Filter、Freeze、Selection 等）
- [ ] 支持暗色主题自动切换

---

## 3. 技术架构

### 3.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                      Search Plugin                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ SearchPlugin │  │ SearchState  │  │ SearchEngine    │  │
│  │   (主控类)    │─▶│  (状态管理)   │  │  (搜索算法)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                   │             │
│         ▼                 ▼                   ▼             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │SearchUI      │  │SearchNavigator│  │ SearchResult     │  │
│  │Controller    │  │  (导航逻辑)   │  │Highlighter      │  │
│  │ (UI控制)     │  │              │  │ (Canvas高亮)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                   │             │
│         ▼                 ▼                   ▼             │
│  ┌──────────────────────────────────────────────────┐     │
│  │              外部依赖层                            │     │
│  │  PopupManager │ Hooks │ RenderEngine │ Selection  │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 模块职责划分

| 模块 | 职责 | 复杂度 | 依赖 |
|------|------|--------|------|
| **SearchPlugin** | 生命周期管理、事件协调、API 暴露 | ⭐⭐⭐ | BasePlugin |
| **SearchState** | 搜索状态、结果缓存、当前索引管理 | ⭐⭐ | 无 |
| **SearchEngine** | 文本/正则匹配算法、性能优化 | ⭐⭐⭐⭐ | 无 |
| **SearchUIController** | 弹窗生命周期、坐标计算、事件绑定 | ⭐⭐⭐ | PopupManager |
| **SearchDropdown** | Web Component UI 组件、Shadow DOM | ⭐⭐⭐ | PopupPanel |
| **SearchNavigator** | 结果跳转、选区同步、滚动定位 | ⭐⭐ | SelectionManager |
| **SearchResultHighlighter** | Canvas 渲染、脏区域标记、可视裁剪 | ⭐⭐⭐⭐ | RenderEngine |

### 3.3 数据流图

```
用户输入 "keyword"
       │
       ▼
┌─────────────┐     防抖 300ms     ┌──────────────┐
│  SearchInput │───────────────────▶│ SearchUI     │
│  (UI组件)    │                    │ Controller   │
└─────────────┘                    └──────┬───────┘
                                          │
                                          ▼ query(keyword, options)
                                   ┌──────────────┐
                                   │ SearchPlugin │
                                   └──────┬───────┘
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                     ┌──────────────┐        ┌──────────────┐
                     │ HOOKS.run    │        │ #getCellData │
                     │ BEFORE_SEARCH│        │ (数据提取)    │
                     └──────────────┘        └──────┬───────┘
                                                      │
                                                      ▼
                                               ┌──────────────┐
                                               │ SearchEngine │
                                               │ .executeQuery│
                                               └──────┬───────┘
                                                      │
                                                      ▼ results[]
                                               ┌──────────────┐
                                               │ SearchState  │
                                               │ .setResults  │
                                               └──────┬───────┘
                                                      │
                          ┌───────────────────────────┼───────────────────┐
                          ▼                           ▼                   ▼
                   ┌──────────────┐           ┌──────────────┐    ┌──────────────┐
                   │ Navigator    │           │ Highlighter  │    │ HOOKS.run    │
                   │ .goToFirst() │           │ .update()    │    │ AFTER_SEARCH │
                   └──────┬───────┘           └──────┬───────┘    └──────────────┘
                          │                          │
                          ▼                          ▼
                   ┌──────────────┐           ┌──────────────┐
                   │ Selection    │           │ RenderEngine │
                   │ Manager      │           │ .markDirty() │
                   │ .setActive() │           │ .render()    │
                   └──────────────┘           └──────────────┘
```

---

## 4. 核心模块设计

### 4.1 SearchPlugin 主类

```typescript
/**
 * 搜索插件主类
 * 
 * 继承自 BasePlugin，遵循项目插件架构规范。
 * 
 * 策略优先级：POPUP_UI (500)
 * - 弹出式 UI 组件，与 Filter 下拉同级
 * - 高于鼠标默认行为 (300)，确保面板交互优先
 * - 低于拖拽操作 (600+)，不干扰核心功能
 */
class SearchPlugin extends BasePlugin {
    // 配置项
    options: SearchOptions;
    
    // 子模块实例
    #state: SearchState;
    #engine: SearchEngine;
    #uiController: SearchUIController;
    #navigator: SearchNavigator;
    
    // 公共 API
    query(queryStr: string, options?: SearchOptions): Promise<SearchResult[]>;
    findNext(): Promise<SearchResult | null>;
    findPrevious(): Promise<SearchResult | null>;
    replace(replaceStr: string): Promise<boolean>;
    replaceAll(replaceStr: string): Promise<number>;
    show(): void;
    hide(): void;
}
```

**关键设计决策**:

1. **异步查询**: `query()` 返回 Promise，支持 Web Worker 未来扩展
2. **Hook 集成**: 在关键节点触发 before/after 钩子
3. **防抖机制**: 输入防抖 300ms，避免频繁搜索
4. **错误隔离**: try-catch 包裹，不影响主流程

### 4.2 SearchEngine 搜索引擎

```typescript
/**
 * 搜索引擎核心算法
 * 
 * 性能特征：
 * - 10万行 × 50列 = 500万单元格，搜索时间 < 100ms
 * - 使用 String.prototype.indexOf 优于正则（简单场景）
 * - 缓存编译后的 RegExp 对象
 */
class SearchEngine {
    /**
     * 执行搜索查询
     * 
     * @param cellData - 单元格数据数组 [{row, col, value}]
     * @param query - 查询字符串
     * @param options - 搜索选项
     * @returns 匹配结果数组
     */
    async executeQuery(
        cellData: CellData[], 
        query: string, 
        options: SearchOptions
    ): Promise<SearchResult[]>;
    
    // 私有方法
    #createTextMatcher(query: string, options: SearchOptions): MatcherFunction;
    #createRegexMatcher(query: string, options: SearchOptions): MatcherFunction;
    #isWholeWord(text: string, position: number, length: number): boolean;
}
```

**算法选择**:

| 场景 | 推荐算法 | 时间复杂度 | 备注 |
|------|---------|-----------|------|
| 简单文本 | `String.indexOf()` | O(n×m) | V8 引擎高度优化 |
| 大小写敏感 | 先 `toLowerCase()` 再 indexOf | O(n+m) | 预处理成本低 |
| 正则表达式 | `RegExp.exec()` + `/g` 标志 | O(n) 取决于正则复杂度 | 缓存 RegExp 实例 |
| 全词匹配 | indexOf + 边界检查 | O(n×m) | Unicode 边界检测 |

### 4.3 SearchState 状态管理

```typescript
/**
 * 搜索状态管理器
 * 
 * 采用不可变状态模式，每次状态变更返回新对象引用，
 * 便于 React/Vue 等框架的响应式追踪（未来扩展）。
 */
class SearchState {
    #query: string = "";
    #results: SearchResult[] = [];
    #currentIndex: number = -1;
    #options: SearchOptions;
    #isSearching: boolean = false;
    #error: Error | null = null;
    
    // Getter 方法
    getQuery(): string;
    getResults(): SearchResult[];
    getCurrentIndex(): number;
    getCurrentResult(): SearchResult | null;
    isSearching(): boolean;
    getError(): Error | null;
    
    // Setter 方法（带验证）
    setQuery(query: string, options: SearchOptions): void;
    setResults(results: SearchResult[]): void;
    setCurrentIndex(index: number): void;
    setSearching(value: boolean): void;
    setError(error: Error): void;
    clear(): void;
}
```

**状态转换图**:

```
          ┌──────────────────────────────────────────┐
          │                                          │
          ▼                                          │
   ┌──────────┐   query()    ┌──────────────┐       │
   │  IDLE    │─────────────▶│  SEARCHING   │       │
   │ (空闲)   │              │  (搜索中)     │───────┤
   └────┬─────┘              └──────┬───────┘       │
        │                          │               │
        │ show()                   │ success/error  │
        ▼                          ▼               │
   ┌──────────┐              ┌──────────────┐       │
   │  VISIBLE │              │ HAS_RESULTS  │◀──────┘
   │ (面板可见)│              │ 或 NO_RESULT │
   └────┬─────┘              └──────┬───────┘
        │                          │
        │ hide()                   │ clear()
        ▼                          ▼
   ┌──────────┐              ┌──────────┐
   │  IDLE    │◀─────────────│  IDLE    │
   └──────────┘              └──────────┘
```

### 4.4 SearchUIController UI控制器

```typescript
/**
 * 搜索 UI 控制器
 * 
 * 严格遵循项目 PopupManager 规范：
 * - 使用 PopupManager.getInstance().register/unregister
 * - 继承 PopupPanel 基类
 * - 支持 closeAll(exceptId) 协调关闭
 */
class SearchUIController {
    #plugin: SearchPlugin;
    #dropdown: SearchDropdown | null;
    #popupId: Symbol | null;
    
    /**
     * 显示搜索面板
     * 
     * 位置计算：
     * - 默认在 Workbook 右上角 (top: 60px, right: 20px)
     * - 自动适配窗口大小，避免超出边界
     */
    show(): void;
    
    /**
     * 隐藏搜索面板
     * 
     * 清理流程：
     * 1. 调用 dropdown.hide()
     * 2. PopupManager.unregister(popupId)
     * 3. 置空引用
     */
    hide(): void;
    
    updateUI(state: SearchState): void;
    focusInput(): void;
    isOpen(): boolean;
}
```

**坐标计算算法**:

```javascript
#calculatePosition() {
    const workbookEl = this.#plugin.workbook.element;
    const rect = workbookEl.getBoundingClientRect();
    
    return {
        x: Math.min(rect.right - 20, window.innerWidth - 450),
        y: Math.max(rect.top + 10, 60),
    };
}
```

### 4.5 SearchDropdown 弹窗组件

```html
<!--
  Search Dropdown Web Component
  
  技术栈：
  - Shadow DOM 封装样式隔离
  - Template HTML 预编译
  - CSS Custom Properties 主题化
  - PopupManager 生命周期管理
-->
<template>
  <style>
    /* 使用 CSS Variables 支持主题切换 */
    :host {
      --search-panel-width: 420px;
      --search-input-height: 36px;
      --primary-color: #1890ff;
      /* ... */
    }
    
    /* 暗色主题自动适配 */
    .dark .search-dropdown-panel {
      background: var(--dark-bg);
      color: var(--dark-text);
    }
  </style>
  
  <div class="search-dropdown-panel">
    <!-- 输入区 -->
    <input type="text" class="search-input" placeholder="搜索..." />
    
    <!-- 选项按钮组 -->
    <div class="search-options">
      <button data-option="caseSensitive">Aa</button>
      <button data-option="wholeWord">W</button>
      <button data-option="useRegex">.*</button>
    </div>
    
    <!-- 导航按钮 -->
    <div class="search-navigation">
      <button data-action="prev">▲</button>
      <button data-action="next">▼</button>
    </div>
    
    <!-- 结果计数 -->
    <div class="search-result-info">-</div>
    
    <!-- 关闭按钮 -->
    <button data-action="close">✕</button>
  </div>
</template>
```

**交互规格**:

| 元素 | 事件 | 行为 | 防抖 |
|------|------|------|------|
| 输入框 | input | 触发搜索 | 300ms |
| 输入框 | Enter | 导航到下一个/上一个 | 无 |
| 选项按钮 | click | 切换选项 + 重新搜索 | 无 |
| 导航按钮 | click | 跳转结果 | 无 |
| 关闭按钮 | click | 关闭面板 | 无 |
| Esc 键 | keydown | 关闭面板 | 无 |

### 4.6 SearchNavigator 导航器

```typescript
/**
 * 搜索结果导航器
 * 
 * 职责：
 * - 维护当前结果索引
 * - 同步到 SelectionManager
 * - 自动滚动到可视区域
 * - 循环导航（可选）
 */
class SearchNavigator {
    #state: SearchState;
    #selectionManager: SelectionManager;
    
    /**
     * 跳转到第一个结果
     */
    goToFirst(): SearchResult | null;
    
    /**
     * 跳转到下一个结果
     * 到达末尾时循环到第一个（可选）
     */
    goToNext(): SearchResult | null;
    
    /**
     * 跳转到上一个结果
     * 到达开头时循环到最后一个（可选）
     */
    goToPrevious(): SearchResult | null;
    
    /**
     * 跳转到指定索引的结果
     */
    goTo(index: number): SearchResult | null;
    
    /**
     * 滚动到结果所在位置
     * 
     * 优化策略：
     * - 优先将目标单元格居中显示
     * - 如果已在可视区域内，不滚动
     */
    scrollToResult(result: SearchResult): void;
}
```

**循环导航配置**:

```typescript
interface NavigationOptions {
    /** 是否循环导航（默认 true） */
    loop?: boolean;
    
    /** 到达边界时是否提示（默认 true） */
    notifyBoundary?: boolean;
    
    /** 导航动画时长（ms，默认 200） */
    scrollDuration?: number;
}
```

### 4.7 SearchResultHighlighter 高亮渲染器

```typescript
/**
 * 搜索结果高亮渲染器
 * 
 * 为什么独立实现而不复用 ConditionalRule？
 * 
 * 1. 职责不同：
 *    - ConditionalRule: 数据驱动的持久格式（保存在文件中）
 *    - Highlighter: 交互驱动的临时反馈（关闭即消失）
 * 
 * 2. 性能考虑：
 *    - ConditionalRule: 每次渲染都检查条件
 *    - Highlighter: 仅搜索激活时渲染，不影响正常流程
 * 
 * 3. 生命周期：
 *    - ConditionalRule: destroy 时持久保存
 *    - Highlighter: 必须完全清除，不留残留
 */
class SearchResultHighlighter {
    #renderEngine: RenderEngine;
    #styles: HighlightStyle;
    
    /** 所有高亮位置 Set<"row:col"> */
    #highlights: Set<string> = new Set();
    
    /** 当前选中位置 "row:col" */
    #currentHighlight: string | null = null;
    
    /**
     * 更新高亮列表
     * 
     * 优化：仅存储位置，不存储完整结果对象
     * 减少内存占用（每个条目 ~20 bytes vs ~100 bytes）
     */
    updateHighlights(results: SearchResult[]): void;
    
    /**
     * 设置当前高亮
     */
    setCurrentHighlight(row: number, col: number): void;
    
    /**
     * 清除所有高亮
     */
    clearHighlights(): void;
    
    /**
     * Canvas 渲染入口
     * 由 RenderEngine 在每帧调用
     */
    render(ctx: CanvasRenderingContext2D, viewport: Viewport, sheet: Sheet): void;
}
```

**渲染优化策略**:

```javascript
render(ctx, viewport, sheet) {
    if (this.#highlights.size === 0) return; // 快速路径
    
    const visibleRange = this.#getVisibleRange(viewport);
    
    for (const key of this.#highlights) {
        const [row, col] = this.#parseKey(key);
        
        // 可视裁剪：仅渲染屏幕内的结果
        if (!this.#isVisible(row, col, visibleRange)) continue;
        
        const rect = this.#getCellRect(sheet, row, col, viewport);
        const isCurrent = key === this.#currentHighlight;
        
        this.#drawHighlight(ctx, rect, isCurrent);
    }
}

#getVisibleRange(viewport) {
    return {
        startRow: Math.floor(viewport.scrollY / ROW_HEIGHT),
        endRow: Math.ceil((viewport.scrollY + viewport.height) / ROW_HEIGHT),
        startCol: Math.floor(viewport.scrollX / COL_WIDTH),
        endCol: Math.ceil((viewport.scrollX + viewport.width) / COL_WIDTH),
    };
}
```

---

## 5. API 接口定义

### 5.1 公共 API

```typescript
interface SearchPluginPublicAPI {
    /**
     * 执行搜索
     * 
     * @example
     * const results = await searchPlugin.query("hello");
     * console.log(`找到 ${results.length} 个匹配`);
     */
    query(
        queryStr: string,
        options?: Partial<SearchOptions>
    ): Promise<SearchResult[]>;
    
    /**
     * 导航到下一个结果
     * 
     * @example
     * searchPlugin.findNext(); // F3
     */
    findNext(): Promise<SearchResult | null>;
    
    /**
     * 导航到上一个结果
     * 
     * @example
     * searchPlugin.findPrevious(); // Shift+F3
     */
    findPrevious(): Promise<SearchResult | null>;
    
    /**
     * 替换当前结果
     * 
     * @example
     * await searchPlugin.replace("new value");
     */
    replace(replaceStr: string): Promise<boolean>;
    
    /**
     * 替换所有结果
     * 
     * @example
     * const count = await searchPlugin.replaceAll("global replace");
     * console.log(`已替换 ${count} 处`);
     */
    replaceAll(replaceStr: string): Promise<number>;
    
    /**
     * 显示搜索面板
     * 
     * @example
     * searchPlugin.show(); // Ctrl+F
     */
    show(): void;
    
    /**
     * 隐藏搜索面板并清除高亮
     */
    hide(): void;
    
    /**
     * 获取当前搜索状态（只读）
     */
    getState(): Readonly<SearchState>;
}
```

### 5.2 配置接口

```typescript
interface SearchOptions {
    /** 是否启用插件 */
    enabled?: boolean;
    
    /** 搜索防抖延迟（ms） */
    debounceDelay?: number;
    
    /** 最大返回结果数 */
    maxResults?: number;
    
    /** 搜索范围：all | selection | column | row */
    searchScope?: "all" | "selection" | "column" | "row";
    
    /** 是否区分大小写 */
    caseSensitive?: boolean;
    
    /** 是否全字匹配 */
    wholeWord?: boolean;
    
    /** 是否使用正则表达式 */
    useRegex?: boolean;
    
    /** 高亮样式自定义 */
    highlightStyle?: HighlightStyle;
    
    /** 导航行为配置 */
    navigation?: NavigationOptions;
}

interface HighlightStyle {
    /** 普通匹配背景色 */
    backgroundColor?: string;
    
    /** 当前选中背景色 */
    currentBackgroundColor?: string;
    
    /** 当前选中边框颜色 */
    borderColor?: string;
    
    /** 边框宽度（px） */
    borderWidth?: number;
}

const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
    enabled: true,
    debounceDelay: 300,
    maxResults: 10000,
    searchScope: "all",
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    highlightStyle: {
        backgroundColor: "rgba(255, 255, 0, 0.3)",
        currentBackgroundColor: "rgba(255, 165, 0, 0.5)",
        borderColor: "#ff9800",
        borderWidth: 2,
    },
    navigation: {
        loop: true,
        notifyBoundary: true,
        scrollDuration: 200,
    },
};
```

### 5.3 数据类型定义

```typescript
interface SearchResult {
    /** 行号 */
    row: number;
    
    /** 列号 */
    col: number;
    
    /** 单元格原始值 */
    data: string;
    
    /** 匹配起始位置（字符索引） */
    matchIndex: number;
    
    /** 匹配长度 */
    matchLength: number;
}

interface CellData {
    row: number;
    col: number;
    value: string;
}
```

### 5.4 Hook 接口

```typescript
// 必须添加到 src/constants/hookNames.js 的 HOOKS 对象中

namespace SEARCH_HOOKS {
    /**
     * 搜索开始前钩子
     * 
     * @returns 返回 false 可取消搜索
     */
    interface BeforeSearchHandler {
        (data: { query: string; options: SearchOptions }): boolean | void | Promise<boolean | void>;
    }
    
    /**
     * 搜索完成后钩子
     */
    interface AfterSearchHandler {
        (data: { query: string; count: number; results: SearchResult[] }): void;
    }
    
    /**
     * 导航前钩子
     */
    interface BeforeNavigateHandler {
        (data: { direction: "next" | "prev"; currentIndex: number }): boolean | void;
    }
    
    /**
     * 导航后钩子
     */
    interface AfterNavigateHandler {
        (data: { direction: "next" | "prev"; result: SearchResult | null }): void;
    }
    
    /**
     * 替换前钩子
     */
    interface BeforeReplaceHandler {
        (data: { row: number; col: number; oldValue: string; newValue: string }): boolean | void;
    }
    
    /**
     * 替换后钩子
     */
    interface AfterReplaceHandler {
        (data: { row: number; col: number; oldValue: string; newValue: string }): void;
    }
}
```

**Hook 使用示例**:

```javascript
// 取消包含敏感词的搜索
workbook.addHook(HOOKS.BEFORE_SEARCH, ({ query }) => {
    const sensitiveWords = ["password", "secret", "token"];
    if (sensitiveWords.some(word => query.toLowerCase().includes(word))) {
        alert("搜索内容包含敏感词！");
        return false; // 阻止搜索
    }
});

// 记录搜索日志
workbook.addHook(HOOKS.AFTER_SEARCH, ({ query, count }) => {
    analytics.track("search", { query, resultCount: count });
});

// 替换前二次确认
workbook.addHook(HOOKS.BEFORE_SEARCH_REPLACE, async ({ oldValue, newValue }) => {
    return confirm(`确定将 "${oldValue}" 替换为 "${newValue}" 吗？`);
});
```

---

## 6. UI/UX 设计

### 6.1 面板布局

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────┐ ┌───┐ ┌────┐ ┌──┐ ┌────┐ ┌─┐ │
│  │ 🔍 搜索...               │ │Aa │ │ W │ │.*│ │ ▲ │ │✕│ │
│  └─────────────────────────┘ └───┘ └────┘ └──┘ ├──┤ └─┘ │
│                                         │ ▼ │       │
│                                    ┌────┴───┤       │
│                                    │ 3 / 25 │       │
│                                    └────────┘       │
└─────────────────────────────────────────────────────────────┘

  [输入框] [选项组] [导航] [计数] [关闭]
    240px    96px     64px   70px   32px
```

**尺寸规格**:

| 元素 | 宽度 | 高度 | 字体大小 |
|------|------|------|---------|
| 面板总宽 | 420px | 60px | - |
| 输入框 | 240px | 36px | 14px |
| 选项按钮 | 32px | 32px | 12px |
| 导航按钮 | 32px | 32px | 14px |
| 结果计数 | 70px | - | 12px |
| 关闭按钮 | 32px | 32px | 18px |

### 6.2 交互状态

#### 状态 1: 空闲（刚打开）

```
┌──────────────────────────────────────────────┐
│  🔍 搜索...                            -  ✕ │
└──────────────────────────────────────────────┘
```

- 占位符文本："搜索..."
- 计数显示:"-"
- 导航按钮禁用态（灰色）

#### 状态 2: 搜索中

```
┌──────────────────────────────────────────────┐
│  🔍 hello...                        ⏳  ✕ │
└──────────────────────────────────────────────┘
```

- 输入框显示加载图标（可选）
- 计数显示:"搜索中..."
- 禁用所有交互（防止重复提交）

#### 状态 3: 有结果

```
┌──────────────────────────────────────────────┐
│  🔍 hello...                        3 / 25  ✕ │
└──────────────────────────────────────────────┘
```

- 计数显示:"当前 / 总数"
- 第一个结果高亮（橙色边框）
- 其余结果半透明黄色背景
- 导航按钮可用

#### 状态 4: 无结果

```
┌──────────────────────────────────────────────┐
│  🔍 xyz123                    无结果  ✕ │
└──────────────────────────────────────────────┘
```

- 计数红色显示:"无结果"
- 导航按钮禁用
- 可选：输入框轻微抖动动画（吸引注意）

### 6.3 高亮样式

#### Canvas 渲染效果

```
┌─────────────────────────────────────────────┐
│  │  A  │  B  │  C  │  D  │  E  │           │
├─────┼─────┼─────┼─────┼─────┼───────────┤
│  1  │     │     │     │     │            │
│  2  │     │█████│     │     │            │  ← 普通匹配（黄色半透明）
│  3  │     │     │█████│     │            │
│  4  │     │     │██░░░│     │            │  ← 当前选中（橙色边框）
│  5  │     │     │     │     │            │
│  ... │     │     │     │     │            │
└─────┴─────┴─────┴─────┴─────┴───────────┘

  ███ = rgba(255, 255, 0, 0.3)     普通匹配背景
  ░░░ = rgba(255, 165, 0, 0.5)     当前选中背景
  ═══ = #ff9800 border 2px         当前选中边框
```

### 6.4 暗色主题适配

```css
/* 自动检测父级暗色主题 */
:host-context(.dark) .search-dropdown-panel,
.dark .search-dropdown-panel {
    background: #1f2937;
    border-color: #374151;
    color: #f9fafb;
}

:host-context(.dark) .search-input,
.dark .search-input {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
}

/* ... 其他元素同理 */
```

---

## 7. 性能优化策略

### 7.1 搜索性能

#### 优化 1: 增量搜索（防抖）

```javascript
// 输入防抖 300ms
this.#inputElement.addEventListener("input", (e) => {
    clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(async () => {
        const query = e.target.value.trim();
        if (query) await this.#handleSearch(query);
    }, 300); // 平衡响应速度和性能
});
```

**效果**: 减少不必要的中间状态搜索（如输入 "hello world" 时避免搜索 "h", "he", "hel"...）

#### 优化 2: 算法选择

```javascript
if (options.useRegex) {
    // 正则模式：预编译 + 缓存
    matcher = this.#createRegexMatcher(query);
} else if (!options.caseSensitive && !options.wholeWord) {
    // 最快路径：原生 indexOf（V8 高度优化）
    matcher = (value) => {
        const idx = value.toLowerCase().indexOf(query.toLowerCase());
        return idx !== -1 ? [{ index: idx, length: query.length }] : null;
    };
} else {
    // 其他情况：通用文本匹配器
    matcher = this.#createTextMatcher(query, options);
}
```

**性能对比**（500万单元格）:

| 算法 | 耗时 | 内存 |
|------|------|------|
| indexOf (最快路径) | ~30ms | ~50MB |
| toLowerCase + indexOf | ~45ms | ~55MD |
| 正则表达式 (简单) | ~80ms | ~70MB |
| 正则表达式 (复杂) | ~200ms+ | ~100MB+ |

#### 优化 3: 数据提取优化

```javascript
#getCellData(scope) {
    const data = [];
    
    switch (scope) {
        case "selection":
            // 仅提取选区内数据（通常 < 1000 个单元格）
            const range = this.sheet.selectionManager.getRange();
            this.#extractRange(data, range);
            break;
            
        case "all":
        default:
            // 使用迭代器避免创建大数组
            this.sheet.cellStore.iterateAll((cell, row, col) => {
                if (cell.value != null && cell.value !== "") {
                    data.push({ row, col, value: String(cell.value) });
                }
                // 可选：提前终止（达到 maxResults 时）
                return data.length < this.options.maxResults;
            });
    }
    
    return data;
}
```

### 7.2 渲染性能

#### 优化 1: 可视区域裁剪

```javascript
render(ctx, viewport, sheet) {
    if (this.#highlights.size === 0) return;
    
    // 计算当前可视范围
    const { startRow, endRow, startCol, endCol } = this.#getVisibleRange(viewport);
    
    // 仅遍历可视区域内的高亮
    for (const key of this.#highlights) {
        const [row, col] = this.#parseKey(key);
        
        if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
            this.#drawSingleHighlight(ctx, sheet, row, col, viewport);
        }
    }
}
```

**效果**: 即使有 10000 个结果，每帧仅绘制 50-100 个（可视区域内的数量）

#### 优化 2: 脏区域标记

```javascript
setCurrentHighlight(row, col) {
    const oldKey = this.#currentHighlight;
    this.#currentHighlight = `${row}:${col}`;
    
    // 仅标记变化的两个位置为脏
    if (oldKey) this.renderEngine.markDirty(oldKey);
    this.renderEngine.markDirty(this.#currentHighlight);
}
```

**效果**: 避免全屏重绘，仅刷新变化的部分

#### 优化 3: 批量渲染

```javascript
updateHighlights(results) {
    this.#highlights.clear();
    
    // 批量添加（避免频繁触发 dirty 标记）
    const batch = [];
    for (const r of results) {
        const key = `${r.row}:${r.col}`;
        this.#highlights.add(key);
        batch.push(key);
    }
    
    // 一次性标记整个批次为脏
    this.renderEngine.markDirtyBatch(batch);
}
```

### 7.3 内存优化

#### 优化 1: 轻量级存储结构

```javascript
// ❌ 差：存储完整结果对象
#results: SearchResult[] = [
    { row: 100, col: 5, data: "hello world...", matchIndex: 0, matchLength: 5 },
    // ... 每个 ~100 bytes
]

// ✅ 好：分离存储
#positions: Set<string> = new Set(["100:5", "200:3", ...]); // 每个 ~20 bytes
#details: Map<string, SearchResult> = new Map(); // 按需获取详细信息
```

**节省**: 约 75% 内存（20 bytes vs 100 bytes per entry）

#### 优化 2: 结果截断

```javascript
async executeQuery(cellData, query, options) {
    const results = [];
    
    for (const cell of cellData) {
        const matches = matcher(cell.value);
        if (matches) {
            results.push(...this.#formatMatches(cell, matches));
            
            // 达到上限时立即停止
            if (results.length >= this.options.maxResults) {
                console.warn(
                    `[Search] 结果过多 (${results.length})，已截断至 ${this.options.maxResults}`
                );
                break;
            }
        }
    }
    
    return results;
}
```

---

## 8. 与现有系统集成

### 8.1 策略优先级体系

**决策**: 使用 **POPUP_UI (500)** 优先级

**依据** (参考 strategyPriority.js):

```
Layer 1: 基础操作层 (100 - 199)
├── KEYBOARD_BASE (100)      ← KeyboardStrategy
├── SHORTCUT_KEY (200)       ← CopyPasteStrategy
│
Layer 2: 标准交互层 (300 - 599)  ← Search Plugin 属于此层
├── MOUSE_DEFAULT (300)      ← MouseStrategy
├── CELL_TYPE_INTERACTION (400)
└── POPUP_UI (500)           ← ✅ Search UI Interaction Strategy
│
Layer 3: 高级功能层 (600 - 899)
├── ROW_COLUMN_MOVE (600)
├── AUTO_FILL (700)
├── CHART_INTERACTION (800)
└── RESIZE_LAYOUT (900)
│
Layer 4: 关键操作层 (1000+)
├── DATA_VALIDATION (950)
├── DATA_SORT (1000)
└── DATA_FILTER (1100)
```

**理由**:
1. 搜索面板是弹出式 UI（与 Filter 下拉同级）
2. 高于鼠标默认行为，确保面板交互不被干扰
3. 低于拖拽操作，不阻塞核心功能

### 8.2 键盘快捷键协调

**结论**: **无需修改 KeyboardStrategy**，现有机制完美支持

**冲突分析与解决方案**:

| 快捷键 | KeyboardStrategy | Search Plugin | 冲突？ | 解决方案 |
|--------|-----------------|---------------|--------|---------|
| Ctrl+F | ❌ 未处理 | ✅ 打开搜索框 | **无冲突** | 直接注册 |
| F3 | ❌ 未处理 | ✅ 下一个 | **无冲突** | 直接注册 |
| Shift+F3 | ❌ 未处理 | ✅ 上一个 | **无冲突** | 直接注册 |
| Esc | ✅ 取消/退出 | ✅ 关闭搜索框 | ⚠️ 潜在冲突 | 外部输入检测自动协调 |
| Enter | ✅ 下移一行 | ✅ 导航结果 | ⚠️ 潜在冲突 | 外部输入检测自动协调 |

**外部输入检测机制** (KeyboardStrategy 已实现):

```javascript
// KeyboardStrategy.js 中的关键代码
#isFocusOnExternalInput() {
    const activeElement = document.activeElement;
    
    // 检测是否在 input/textarea 等外部输入元素上
    if (this.#isInput(activeElement)) {
        return true; // → 让渡给浏览器处理，不拦截
    }
    
    return false; // → Canvas 自己处理
}
```

**工作流程**:

```
用户按 Enter
    ↓
KeyboardStrategy.#handleKeyDown(event)
    ↓
检查 #isFocusOnExternalInput()
    ↓
焦点在 Search Input? ──Yes──→ 返回 true ──→ 不处理（让浏览器处理）
    │                                       ↓
    No                                  SearchDropdown 接收 Enter
    ↓                                       ↓
继续处理导航逻辑                         触发 findNext()
```

### 8.3 PopupManager 集成

**严格遵循 Filter 插件的 PopupManager 使用规范**:

```javascript
import { PopupManager } from "../../ui/components/PopupManager.js";

class SearchUIController {
    show() {
        // 1. 创建下拉面板实例
        this.#dropdown = new SearchDropdown();
        
        // 2. 注册到 PopupManager（获取唯一 ID）
        this.#popupId = PopupManager.getInstance().register(this.#dropdown);
        
        // 3. 显示面板
        this.#dropdown.show(position, callbacks...);
    }
    
    hide() {
        if (this.#dropdown) {
            // 4. 隐藏面板
            this.#dropdown.hide(reason);
            
            // 5. 从 PopupManager 注销
            if (this.#popupId) {
                PopupManager.getInstance().unregister(this.#popupId);
            }
            
            // 6. 清空引用
            this.#dropdown = null;
            this.#popupId = null;
        }
    }
}
```

**PopupManager 协调机制**:

```javascript
// 当其他弹窗打开时（如右键菜单），自动关闭搜索面板
PopupManager.getInstance().closeAll(exceptId);

// 当点击面板外部时，PopupManager 会调用 dropdown.hide("click-outside")
// SearchUIController 监听此事件并清理状态
```

### 8.4 Hook 系统集成

**新增 Hook 定义** (追加到 hookNames.js):

```javascript
export const HOOKS = Object.freeze({
    // ... existing hooks ...
    
    /*
     * ==================== 搜索相关钩子 (SEARCH_) ====================
     * 注意：这些 Hook 由 SearchPlugin 提供，
     * 使用前需确保插件已加载（plugins 配置中包含 'search'）
     */

    /** 搜索开始前 - 即将执行搜索操作，返回 false 可取消搜索 */
    BEFORE_SEARCH: "beforeSearch",

    /** 搜索后 - 搜索已完成并返回结果 */
    AFTER_SEARCH: "afterSearch",

    /** 搜索导航前 - 即将跳转到下一个/上一个结果 */
    BEFORE_SEARCH_NAVIGATE: "beforeSearchNavigate",

    /** 搜索导航后 - 已跳转到新的匹配项 */
    AFTER_SEARCH_NAVIGATE: "afterSearchNavigate",

    /** 替换前 - 即将替换当前匹配项的内容，返回 false 可阻止 */
    BEFORE_SEARCH_REPLACE: "beforeSearchReplace",

    /** 替换后 - 当前匹配项已替换为新内容 */
    AFTER_SEARCH_REPLACE: "afterSearchReplace",
});
```

**Hook 触发时机**:

```
用户输入 "hello" + Enter
    ↓
① HOOKS.BEFORE_SEARCH ← { query: "hello", options: {...} }
    ↓ (如果未阻止)
② SearchEngine.executeQuery()
    ↓
③ HOOKS.AFTER_SEARCH ← { query: "hello", count: 25, results: [...] }
    ↓
④ Navigator.goToFirst()
    ↓
⑤ HOOKS.AFTER_SEARCH_NAVIGATE ← { direction: "first", result: {...} }

---

用户按 F3 (下一个)
    ↓
① HOOKS.BEFORE_SEARCH_NAVIGATE ← { direction: "next", currentIndex: 0 }
    ↓ (如果未阻止)
② Navigator.goToNext()
    ↓
③ HOOKS.AFTER_SEARCH_NAVIGATE ← { direction: "next", result: {...} }
    ↓
④ Highlighter.update()

---

用户点击"替换"
    ↓
① HOOKS.BEFORE_SEARCH_REPLACE ← { row: 100, col: 5, oldVal: "hello", newVal: "hi" }
    ↓ (如果未阻止)
② Sheet.setCellValue(100, 5, "hi")
    ↓
③ HOOKS.AFTER_SEARCH_REPLACE ← { row: 100, col: 5, oldVal: "hello", newVal: "hi" }
```

### 8.5 条件格式系统关系

**为什么不能复用 ConditionalRule？**

| 维度 | ConditionalRule | SearchResultHighlighter |
|------|----------------|-------------------------|
| **触发方式** | 数据值变化 | 用户搜索操作 |
| **生命周期** | 持久化（保存在文件中） | 临时（关闭搜索即消失） |
| **渲染时机** | 每次渲染都检查 | 仅搜索激活时渲染 |
| **性能影响** | 影响全局渲染管线 | 仅影响当前会话 |
| **样式来源** | StylePool 样式池 | 内联临时样式 |
| **使用场景** | 数据可视化（色阶、数据条） | 交互式定位工具 |

**架构分离的好处**:

1. **单一职责原则**: 各司其职，降低耦合
2. **性能隔离**: 搜索高亮不影响正常渲染性能
3. **灵活配置**: 可以独立开关任一功能
4. **易于维护**: 修改一方不影响另一方

---

### 8.6 撤销/重做支持（重要特性）

> **⚠️ 关键决策**: 搜索替换功能**必须**支持撤销/重做！这是企业级电子表格的基本要求。

#### 8.6.1 现有撤销机制分析

您的项目已实现完善的 **Command 模式 + HistoryStack 双栈架构**：

| 组件 | 文件位置 | 职责 |
|------|---------|------|
| **Command 基类** | [Command.js](../src/model/command/Command.js) | 定义 `redo()` / `undo()` 接口 |
| **SetCellCommand** | [SetCellCommand.js](../src/model/command/SetCellCommand.js) | 单元格赋值命令，记录 old/new 状态 |
| **BatchCommand** | [BatchCommand.js](../src/model/command/BatchCommand.js) | 批量组合多个子命令为原子操作 |
| **HistoryStack** | [HistoryStack.js](../src/model/history/HistoryStack.js) | 双栈管理 undoStack / redoStack |

**集成方式参考** ([SheetDataCoordinator.js:107-109](../src/workbook/coordinators/SheetDataCoordinator.js#L107-L109)):

```javascript
// 标准模式：创建 Command → 推入历史栈 → 执行操作
const cell = new Cell(cellValue, styleId, disabled, formula);
const cmd = new SetCellCommand(this.cellStore, r, c, old, cell);
this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history); // ✅ 关键步骤
this.cellStore.set(r, c, cell);
```

#### 8.6.2 替换操作撤销方案

##### 方案 A: 单个替换 (replace) - 使用 SetCellCommand

**适用场景**: 用户逐个替换匹配项

**实现代码**:

```javascript
/**
 * 替换当前选中结果（支持 Ctrl+Z 撤销）
 *
 * 撤销流程：
 * 1. 创建 SetCellCommand(oldCell, newCell)
 * 2. 推入 sheet.history.undoStack
 * 3. 执行赋值操作
 * 4. 用户按 Ctrl+Z → 调用 cmd.undo() → 恢复旧值
 */
async replace(replaceStr) {
    const current = this.#state.getCurrentResult();
    if (!current) return false;

    // 触发 before 钩子
    const canReplace = await this.hooks.run(HOOKS.BEFORE_SEARCH_REPLACE, {
        row: current.row,
        col: current.col,
        oldValue: current.data,
        newValue: replaceStr,
    });

    if (canReplace === false) return false;

    const sheet = this.sheet;

    // ✅ ① 获取旧值快照
    const oldCell = sheet.cellStore.get(current.row, current.col);

    // ✅ ② 创建新 Cell 对象
    const newCell = new Cell(
        replaceStr,
        oldCell?.styleId || 0,
        oldCell?.disabled || false,
        null // 替换操作清除公式
    );

    // ✅ ③ 创建 SetCellCommand（记录完整状态用于撤销）
    const cmd = new SetCellCommand(
        sheet.cellStore,
        current.row,
        current.col,
        oldCell,      // ← 旧状态（undo 时恢复此值）
        newCell       // ← 新状态（redo 时应用此值）
    );

    // ✅ ④ 推入历史栈（关键步骤！）
    sheet.batchOp.pushCommand(cmd, sheet.history);

    // ✅ ⑤ 执行实际赋值
    sheet.cellStore.set(current.row, current.col, newCell);

    // 更新 UI
    this.#updateCurrentResultAfterReplace(replaceStr);

    // 触发 after 钩子
    this.hooks.run(HOOKS.AFTER_SEARCH_REPLACE, {
        row: current.row,
        col: current.col,
        oldValue: current.data,
        newValue: replaceStr,
    });

    return true;
}
```

**用户操作时序图**:

```
时间轴 ──────────────────────────────────────────────▶

用户操作:
  点击"替换"
       │
       ▼
系统响应:
  ① 创建 SetCellCommand(old="Hello", new="Hi")
  ② push 到 HistoryStack.undoStack
  ③ cellStore.set(0, 0, "Hi")
  ④ 显示 "✓ 已替换 (1/25)"
       │
       │     ... 后续用户继续替换其他项 ...
       │
       ▼
用户按 Ctrl+Z:
       │
       ▼
系统响应:
  ⑤ HistoryStack.undo()
  ⑥ cmd.undo() → cellStore.set(0, 0, "Hello")  ← 恢复原值！
  ⑦ 显示 "↩️ 已撤销"
       │
       ▼
用户按 Ctrl+Y (重做):
       │
       ▼
系统响应:
  ⑧ HistoryStack.redo()
  ⑨ cmd.redo() → cellStore.set(0, 0, "Hi")   ← 重新应用！
  ⑩ 显示 "↪️ 已重做"
```

---

##### 方案 B: 全部替换 (replaceAll) - 使用 BatchCommand

**适用场景**: 用户一键替换所有 25 个匹配项

**核心优势**: **仅占用 1 个撤销槽位**，一键撤销所有更改！

**实现代码**:

```javascript
/**
 * 替换所有匹配结果（支持一键 Ctrl+Z 撤销全部）
 *
 * 设计决策：
 * - 使用 BatchCommand 将 N 个 SetCellCommand 组合为原子操作
 * - 整批推入 historyStack，仅占 1 个 undo 栈位置
 * - 撤销时逆序执行所有子命令的 undo()，确保状态一致性
 */
async replaceAll(replaceStr) {
    const results = this.#state.getResults();
    if (results.length === 0) return 0;

    // 触发 before 钩子
    const canReplaceAll = await this.hooks.run(
        HOOKS.BEFORE_SEARCH_REPLACE_ALL,
        { count: results.length, replaceValue: replaceStr }
    );

    if (canReplaceAll === false) return 0;

    const sheet = this.sheet;

    // ✅ ① 收集所有替换命令
    const commands = [];
    const replacedData = [];

    for (const result of results) {
        const oldCell = sheet.cellStore.get(result.row, result.col);

        const newCell = new Cell(
            replaceStr,
            oldCell?.styleId || 0,
            oldCell?.disabled || false,
            null
        );

        // 为每个单元格创建独立 Command
        commands.push(new SetCellCommand(
            sheet.cellStore,
            result.row,
            result.col,
            oldCell,
            newCell
        ));

        replacedData.push({
            row: result.row,
            col: result.col,
            oldValue: result.data,
            newValue: replaceStr,
        });
    }

    // ✅ ② 创建 BatchCommand（原子批量操作）
    const batchCmd = new BatchCommand(commands);

    // ✅ ③ 整批推入历史栈（仅占 1 个位置！）
    sheet.batchOp.pushCommand(batchCmd, sheet.history);

    // ✅ ④ 执行所有替换（正序 redo）
    batchCmd.redo();

    // 触发 after 钩子
    this.hooks.run(HOOKS.AFTER_SEARCH_REPLACE_ALL, {
        count: replacedData.length,
        replaceValue: replaceStr,
        details: replacedData,
    });

    return replacedData.length;
}
```

**BatchCommand 工作原理**:

```javascript
class BatchCommand extends Command {
    constructor(commands) {
        super();
        this.commands = commands; // 25 个 SetCellCommand
    }

    redo() {
        // 正序执行：依次替换 25 个单元格
        for (const cmd of this.commands) {
            cmd.redo(); // 每个 SetCellCommand.redo()
        }
        // 结果：所有 "Hello" → "Hi"
    }

    undo() {
        // 逆序撤销：从第 25 个开始恢复
        for (let i = this.commands.length - 1; i >= 0; i--) {
            this.commands[i].undo(); // 每个 SetCellCommand.undo()
        }
        // 结果：所有 "Hi" → "Hello" （完全恢复！）
    }
}
```

**内存占用对比**:

| 方案 | Undo 栈占用 | 撤销体验 |
|------|-----------|---------|
| ❌ 不使用 BatchCommand | 25 个独立槽位 | 需按 25 次 Ctrl+Z |
| ✅ **BatchCommand（推荐）** | **1 个槽位** | **按 1 次 Ctrl+Z 即可全部撤销** |

---

#### 8.6.3 UI 撤销提示设计

在 SearchDropdown 中添加**可视化撤销反馈**：

```html
<!-- 搜索面板增强布局 -->
<div class="search-dropdown-panel">
    <!-- 现有搜索区域 ... -->

    <!-- ✨ 新增：替换区域 + 撤销提示 -->
    <div class="search-replace-section">
        <div class="replace-input-wrapper">
            <input type="text" class="replace-input" placeholder="替换为..." />
        </div>

        <div class="replace-actions">
            <button data-action="replace">替换</button>
            <button data-action="replaceAll">全部替换</button>
        </div>

        <!-- 🎉 撤销提示条（动态显示） -->
        <div class="undo-hint" id="undoHint" style="display: none;">
            <span class="undo-icon">↩️</span>
            <span class="undo-text">
                已替换 <strong id="replacedCount">0</strong> 处 ·
                按 <kbd>Ctrl+Z</kbd> 可撤销
            </span>
            <button class="undo-btn" data-action="undo">立即撤销</button>
        </div>
    </div>
</div>
```

**交互逻辑**:

```javascript
async #handleReplace(action) {
    let replacedCount = 0;

    try {
        if (action === "replace") {
            const success = await this.#plugin.replace(this.#getReplaceValue());
            replacedCount = success ? 1 : 0;
        } else {
            replacedCount = await this.#plugin.replaceAll(this.#getReplaceValue());
        }

        if (replacedCount > 0) {
            this.#showUndoHint(replacedCount);
            setTimeout(() => this.#hideUndoHint(), 3000); // 3秒后自动隐藏
        }
    } catch (error) {
        console.error("Replace error:", error);
        this.#showError("替换失败：" + error.message);
    }
}

#showUndoHint(count) {
    const hint = this.shadowRoot.getElementById("undoHint");
    hint.style.display = "flex";

    // 动画效果：淡入 + 滑下
    hint.style.animation = "slideDown 0.2s ease-out";

    document.getElementById("replacedCount").textContent = count;
}

#hideUndoHint() {
    const hint = this.shadowRoot.getElementById("undoHint");
    hint.style.animation = "slideUp 0.2s ease-in";
    setTimeout(() => {
        hint.style.display = "none";
        hint.style.animation = "";
    }, 200);
}
```

**样式定义**:

```css
.undo-hint {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-top: 8px;
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 4px;
    font-size: 12px;
    color: #166534;
}

.undo-icon {
    font-size: 16px;
}

.undo-text kbd {
    display: inline-block;
    padding: 2px 6px;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    font-family: monospace;
    font-size: 11px;
    box-shadow: 0 1px 0 rgba(0,0,0,0.1);
}

.undo-btn {
    padding: 4px 12px;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.2s;
}

.undo-btn:hover {
    background: #16a34a;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes slideUp {
    from {
        opacity: 1;
        transform: translateY(0);
    }
    to {
        opacity: 0;
        transform: translateY(-10px);
    }
}
```

**视觉效果**:

```
┌──────────────────────────────────────────────────┐
│  🔍 hello...                              3 / 25  │
│                                                  │
│  ┌─ 替换区域 ─────────────────────────────────┐  │
│  │ 替换为: [Hi________]  [替换] [全部替换]   │  │
│  │                                          │  │
│  │ ↩️ 已替换 25 处 · 按 Ctrl+Z 可撤销 [撤销] │  │  ← 绿色提示条
│  └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘

  3秒后自动消失，或点击"立即撤销"/按 Ctrl+Z
```

---

#### 8.6.4 边界情况处理

| 场景 | 处理策略 | 代码示例 |
|------|---------|---------|
| **替换空字符串** | 允许（清除单元格内容） | `new Cell("", ...)` |
| **替换值为公式** | 清除原公式标记 | `new Cell(value, ..., null)` |
| **替换只读单元格** | 检查 `isDisabled()` 并跳过 | `if (sheet.isDisabled(r,c)) continue` |
| **替换合并单元格** | 仅替换左上角主单元格 | 检查 `mergedCells` |
| **大数据量替换 (>1000)** | 显示进度条 + 可取消 | `ProgressMonitor` |
| **并发编辑冲突** | 乐观锁 + 版本号检查 | `cell.version !== oldVersion` |

**示例代码**：

```javascript
async replaceAll(replaceStr) {
    const results = this.#state.getResults();
    const commands = [];
    let skippedCount = 0;

    for (const result of results) {
        const sheet = this.sheet;

        // ✅ 跳过只读单元格
        if (sheet.dataCoordinator.isDisabled(result.row, result.col)) {
            skippedCount++;
            continue;
        }

        // ✅ 跳过合并单元格的非主单元格
        if (sheet.mergeManager && !sheet.mergeManager.isMainCell(result.row, result.col)) {
            skippedCount++;
            continue;
        }

        const oldCell = sheet.cellStore.get(result.row, result.col);

        // ✅ 版本冲突检测（可选）
        if (oldCell?.version !== result.snapshotVersion) {
            console.warn(`[Search] 单元格 (${result.row},${result.col}) 数据已变更，跳过`);
            skippedCount++;
            continue;
        }

        const newCell = new Cell(replaceStr, oldCell?.styleId || 0, oldCell?.disabled || false, null);
        commands.push(new SetCellCommand(sheet.cellStore, result.row, result.col, oldCell, newCell));
    }

    if (commands.length > 0) {
        const batchCmd = new BatchCommand(commands);
        sheet.batchOp.pushCommand(batchCmd, sheet.history);
        batchCmd.redo();
    }

    if (skippedCount > 0) {
        console.warn(`[Search] 已跳过 ${skippedCount} 个不可编辑单元格`);
    }

    return commands.length;
}
```

---

#### 8.6.5 测试用例（验证撤销功能）

```typescript
describe("SearchPlugin Replace with Undo Support", () => {
    let workbook;
    let searchPlugin;
    let sheet;

    beforeEach(async () => {
        workbook = new Workbook(container);
        workbook.loadPlugin("search");
        searchPlugin = workbook.getPlugin("search");
        sheet = workbook.activeSheet;

        await workbook.loadData({
            data: [
                ["hello", "world"],
                ["hello", "test"],
                ["goodbye", "hello"],
            ]
        });
    });

    test("单个替换应支持 Ctrl+Z 撤销", async () => {
        // 1. 搜索 "hello"
        const results = await searchPlugin.query("hello");
        expect(results).toHaveLength(3);

        // 2. 替换第一个结果
        await searchPlugin.replace("hi");

        // 3. 验证替换生效
        expect(sheet.getCellValue(0, 0)).toBe("hi");

        // 4. 执行撤销
        workbook.undo(); // 或模拟 Ctrl+Z

        // 5. 验证已恢复原值 ✅
        expect(sheet.getCellValue(0, 0)).toBe("hello");
    });

    test("全部替换应支持一键撤销所有更改", async () => {
        // 1. 搜索并全部替换
        await searchPlugin.query("hello");
        const count = await searchPlugin.replaceAll("hi");
        expect(count).toBe(3);

        // 2. 验证所有 "hello" 都变成 "hi"
        expect(sheet.getCellValue(0, 0)).toBe("hi");
        expect(sheet.getCellValue(1, 0)).toBe("hi");
        expect(sheet.getCellValue(2, 1)).toBe("hi");

        // 3. 一键撤销
        workbook.undo();

        // 4. 验证所有单元格都恢复了！✅
        expect(sheet.getCellValue(0, 0)).toBe("hello");
        expect(sheet.getCellValue(1, 0)).toBe("hello");
        expect(sheet.getCellValue(2, 1)).toBe("hello");
    });

    test("连续多次替换应分别记录在历史栈中", async () => {
        await searchPlugin.query("hello");

        // 第 1 次替换
        await searchPlugin.replace("hi1");

        // 第 2 次替换（下一个匹配项）
        await searchPlugin.findNext();
        await searchPlugin.replace("hi2");

        // 第 3 次替换
        await searchPlugin.findNext();
        await searchPlugin.replace("hi3");

        // 连续撤销 3 次
        workbook.undo(); // 撤销第 3 次
        expect(sheet.getCellValue(2, 1)).toBe("hello");

        workbook.undo(); // 撤销第 2 次
        expect(sheet.getCellValue(1, 0)).toBe("hello");

        workbook.undo(); // 撤销第 1 次
        expect(sheet.getCellValue(0, 0)).toBe("hello"); // ✅ 完全恢复
    });

    test("替换后重做应重新应用替换", async () => {
        await searchPlugin.query("hello");
        await searchPlugin.replace("hi");

        // 撤销
        workbook.undo();
        expect(sheet.getCellValue(0, 0)).toBe("hello");

        // 重做
        workbook.redo();
        expect(sheet.getCellValue(0, 0)).toBe("hi"); // 又变回 "hi" ✅
    });

    test("全部替换的 BatchCommand 应仅占 1 个撤销槽位", async () => {
        await searchPlugin.query("hello");
        
        // 记录当前栈深度
        const stackDepthBefore = sheet.history.undoStack.length;

        // 全部替换（假设有 3 个匹配项）
        await searchPlugin.replaceAll("hi");

        // 验证栈深度仅增加 1（而不是 3）
        expect(sheet.history.undoStack.length).toBe(stackDepthBefore + 1); // ✅

        // 一键撤销
        workbook.undo();

        // 验证所有 3 个单元格都恢复了
        expect(sheet.getCellValue(0, 0)).toBe("hello");
        expect(sheet.getCellValue(1, 0)).toBe("hello");
        expect(sheet.getCellValue(2, 1)).toBe("hello");
    });
});
```

---

## 9. 实施计划

### 9.1 Phase 1: MVP 版本（1 周）

**目标**: 实现核心搜索功能，满足基本使用场景

**任务清单**:

#### Day 1-2: 基础架构搭建
- [ ] 创建项目目录结构 `src/plugins/search/`
- [ ] 实现 `SearchPlugin` 主类骨架
- [ ] 实现 `SearchState` 状态管理
- [ ] 定义 TypeScript 类型接口
- [ ] 添加 Hook 常量到 `hookNames.js`

#### Day 3-4: 搜索引擎开发
- [ ] 实现 `SearchEngine` 基础文本搜索
- [ ] 实现 `indexOf` 优化路径
- [ ] 实现数据提取 `#getCellData()`
- [ ] 编写单元测试（覆盖主要场景）

#### Day 5-6: UI 组件开发
- [ ] 实现 `SearchDropdown` Web Component
- [ ] 实现 `SearchUIController` 控制器
- [ ] 集成 `PopupManager` 生命周期管理
- [ ] 实现基础样式（含暗色主题）

#### Day 7: 导航与高亮
- [ ] 实现 `SearchNavigator` 导航器
- [ ] 实现 `SearchResultHighlighter` Canvas 渲染
- [ ] 注册快捷键（Ctrl+F, F3, Esc）
- [ ] 端到端测试 + Bug 修复

**交付物**:
- ✅ 可用的搜索功能（文本模式）
- ✅ 基础 UI 面板
- ✅ 结果高亮 + F3 导航
- ✅ 单元测试覆盖率 > 80%

---

### 9.2 Phase 2: 功能完善（2 周）

**目标**: 补齐高级功能，达到生产级质量

**任务清单**:

#### Week 1: 高级搜索
- [ ] 实现正则表达式搜索模式
- [ ] 实现大小写敏感选项
- [ ] 实现全词匹配选项
- [ ] 优化正则性能（缓存、超时保护）
- [ ] 边界用例测试（特殊字符、Unicode）

#### Week 2: 替换功能 + 优化
- [ ] 实现单个替换功能
- [ ] 实现全局替换功能
- [ ] 添加替换确认对话框
- [ ] 性能优化（Web Worker 预研）
- [ ] 内存泄漏检测
- [ ] 文档编写（API 文档 + 使用示例）

**交付物**:
- ✅ 完整的搜索 + 替换功能
- ✅ 所有搜索选项可用
- ✅ 性能满足 500万单元格 < 200ms
- ✅ 完整的使用文档

---

### 9.3 Phase 3: 企业级增强（3-4 周）

**目标**: 差异化竞争力，超越 Handsontable

**任务清单**:

#### Week 1: 性能极致优化
- [ ] 实现 Web Worker 后台搜索
- [ ] 实现增量搜索（仅搜索新增数据）
- [ ] 实现搜索结果缓存（LRU）
- [ ] 实现虚拟滚动大数据集支持

#### Week 2: 高级功能
- [ ] 实现搜索历史记录（localStorage）
- [ ] 实现书签常用搜索
- [ ] 实现多工作表跨表搜索
- [ ] 实现搜索结果导出（CSV/JSON）

#### Week 3: 无障碍 + 国际化
- [ ] ARIA 属性完善
- [ ] 键盘完全可访问（Tab 序序、焦点管理）
- [ ] 屏幕阅读器支持（JAWS/NVDA 测试）
- [ ] i18n 多语言支持（中文/英文/日文）

#### Week 4: 监控 + 文档
- [ ] 性能监控埋点（搜索耗时统计）
- [ ] 错误上报机制
- [ ] 完整的 JSDoc API 文档
- [ ] 视频教程 + 示例库

**交付物**:
- ✅ 企业级搜索体验
- ✅ WCAG 2.1 AA 合规
- ✅ 多语言支持
- ✅ 完善的监控体系

---

## 10. 测试策略

### 10.1 单元测试

**测试框架**: Vitest（项目已有配置）

**核心模块测试用例**:

#### SearchEngine 测试

```typescript
describe("SearchEngine", () => {
    it("应正确执行简单文本搜索", () => {
        const engine = new SearchEngine();
        const data = [
            { row: 0, col: 0, value: "Hello World" },
            { row: 1, col: 0, value: "Hello Canvas" },
            { row: 2, col: 0, value: "Goodbye" },
        ];
        
        const results = await engine.executeQuery(data, "Hello");
        
        expect(results).toHaveLength(2);
        expect(results[0]).toMatchObject({ row: 0, col: 0 });
        expect(results[1]).toMatchObject({ row: 1, col: 0 });
    });

    it("应支持大小写不敏感搜索（默认）", async () => {
        const engine = new SearchEngine();
        const data = [
            { row: 0, col: 0, value: "Hello" },
            { row: 1, col: 0, value: "hello" },
            { row: 2, col: 0, value: "HELLO" },
        ];
        
        const results = await engine.executeQuery(data, "hello");
        
        expect(results).toHaveLength(3);
    });

    it("应支持正则表达式搜索", async () => {
        const engine = new SearchEngine();
        const data = [
            { row: 0, col: 0, value: "abc123" },
            { row: 1, col: 0, value: "xyz456" },
            { row: 2, col: 0, value: "no numbers" },
        ];
        
        const results = await engine.executeQuery(
            data, 
            "\\d+", 
            { useRegex: true }
        );
        
        expect(results).toHaveLength(2);
    });

    it("应支持全词匹配", async () => {
        const engine = new SearchEngine();
        const data = [
            { row: 0, col: 0, value: "cat" },
            { row: 1, col: 0, value: "category" },
            { row: 2, col: 0, value: "the cat sat" },
        ];
        
        const results = await engine.executeQuery(
            data, 
            "cat", 
            { wholeWord: true }
        );
        
        expect(results).toHaveLength(2); // 排除 "category"
    });

    it("应在结果过多时截断", async () => {
        const engine = new SearchEngine();
        const data = Array.from({ length: 20000 }, (_, i) => ({
            row: i, col: 0, value: "test value"
        }));
        
        const results = await engine.executeQuery(data, "test", {
            maxResults: 10000
        });
        
        expect(results).toHaveLength(10000);
    });

    it("应正确处理空输入", async () => {
        const engine = new SearchEngine();
        const results = await engine.executeQuery([], "");
        
        expect(results).toHaveLength(0);
    });

    it("应正确处理无效正则", async () => {
        const engine = new SearchEngine();
        const data = [{ row: 0, col: 0, value: "test" }];
        
        // 不抛异常，返回空结果
        const results = await engine.executeQuery(
            data, 
            "[invalid regex", 
            { useRegex: true }
        );
        
        expect(results).toHaveLength(0);
    });
});
```

#### SearchNavigator 测试

```typescript
describe("SearchNavigator", () => {
    let navigator;
    let state;
    let mockSelectionManager;

    beforeEach(() => {
        state = new SearchState();
        mockSelectionManager = {
            setActive: jest.fn(),
        };
        navigator = new SearchNavigator(state, mockSelectionManager);
    });

    describe("goToFirst()", () => {
        it("应跳转到第一个结果", () => {
            state.setResults([
                { row: 10, col: 5 },
                { row: 20, col: 3 },
                { row: 30, col: 7 },
            ]);
            
            const result = navigator.goToFirst();
            
            expect(result).toMatchObject({ row: 10, col: 5 });
            expect(state.getCurrentIndex()).toBe(0);
            expect(mockSelectionManager.setActive).toHaveBeenCalledWith(10, 5);
        });

        it("应在无结果时返回 null", () => {
            const result = navigator.goToFirst();
            
            expect(result).toBeNull();
        });
    });

    describe("goToNext() - 循环模式", () => {
        it("应跳转到最后一个时回到第一个", () => {
            state.setResults([{ row: 1 }, { row: 2 }, { row: 3 }]);
            state.setCurrentIndex(2); // 最后一个
            
            const result = navigator.goToNext();
            
            expect(result).toMatchObject({ row: 1 });
            expect(state.getCurrentIndex()).toBe(0);
        });
    });

    describe("goToPrevious() - 循环模式", () => {
        it("应在第一个时跳转到最后一个", () => {
            state.setResults([{ row: 1 }, { row: 2 }, { row: 3 }]);
            state.setCurrentIndex(0); // 第一个
            
            const result = navigator.goToPrevious();
            
            expect(result).toMatchObject({ row: 3 });
            expect(state.getCurrentIndex()).toBe(2);
        });
    });
});
```

### 10.2 集成测试

**测试场景**:

```typescript
describe("SearchPlugin Integration", () => {
    let workbook;
    let searchPlugin;

    beforeEach(async () => {
        workbook = new Workbook(container);
        workbook.loadPlugin("search");
        searchPlugin = workbook.getPlugin("search");
        
        // 填充测试数据
        await workbook.loadData({
            data: generateTestData(1000, 50), // 1000行 × 50列
        });
    });

    test("Ctrl+F 应打开搜索面板", () => {
        // 模拟按键
        simulateKeyDown({ key: "f", ctrlKey: true });
        
        expect(searchPlugin.isOpen()).toBeTruthy();
    });

    test("输入关键词应触发搜索", async () => {
        searchPlugin.show();
        
        // 模拟输入
        await typeInSearchInput("test");
        await sleep(350); // 等待防抖
        
        const state = searchPlugin.getState();
        expect(state.getResults().length).toBeGreaterThan(0);
    });

    test("F3 应导航到下一个结果", async () => {
        await searchPlugin.query("test"); // 假设有多个结果
        
        const initialIndex = searchPlugin.getState().getCurrentIndex();
        
        simulateKeyDown({ key: "F3" });
        
        expect(searchPlugin.getState().getCurrentIndex())
            .toBe(initialIndex + 1);
    });

    test("Esc 应关闭搜索面板", () => {
        searchPlugin.show();
        
        simulateKeyDown({ key: "Escape" });
        
        expect(searchPlugin.isOpen()).toBeFalsy();
    });

    test("大数据集搜索性能", async () => {
        // 加载 10万行数据
        await workbook.loadData({
            data: generateTestData(100000, 20),
        });
        
        const startTime = performance.now();
        await searchPlugin.query("performance_test_keyword");
        const endTime = performance.now();
        
        const duration = endTime - startTime;
        expect(duration).toBeLessThan(500); // < 500ms
    });
});
```

### 10.3 性能基准测试

**测试环境**:
- CPU: Apple M1 Pro / Intel i7-12700H
- RAM: 16GB / 32GB
- Browser: Chrome 120+ / Firefox 120+

**测试矩阵**:

| 数据规模 | 行数 | 列数 | 单元格总数 | 搜索耗时 | 内存占用 |
|---------|------|------|-----------|---------|---------|
| 小型 | 1,000 | 20 | 20,000 | < 10ms | < 5MB |
| 中型 | 10,000 | 50 | 500,000 | < 50ms | < 20MB |
| 大型 | 100,000 | 50 | 5,000,000 | < 200ms | < 100MB |
| 超大型 | 1,000,000 | 26 | 26,000,000 | < 500ms* | < 200MB |

*建议启用 Web Worker

**自动化脚本**:

```javascript
// benchmarks/search-performance.bench.js
import { performance } from "perf_hooks";

async function runBenchmark(label, rowCount, colCount, searchTerm) {
    const data = generateTestData(rowCount, colCount);
    const engine = new SearchEngine();
    
    const startMem = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    
    const results = await engine.executeQuery(data, searchTerm);
    
    const endTime = performance.now();
    const endMem = process.memoryUsage().heapUsed;
    
    console.log(`[${label}]`);
    console.log(`  Data: ${rowCount}×${colCount} = ${rowCount * colCount} cells`);
    console.log(`  Results: ${results.length}`);
    console.log(`  Time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`  Memory: ${((endMem - startMem) / 1024 / 1024).toFixed(2)}MB`);
    console.log("---");
}

await runBenchmark("Small", 1000, 20, "test");
await runBenchmark("Medium", 10000, 50, "test");
await runBenchmark("Large", 100000, 50, "test");
// await runBenchmark("XLarge", 1000000, 26, "test"); // 可选
```

---

## 11. 风险评估与应对

### 11.1 技术风险

| 风险 | 可能性 | 影响 | 应对措施 |
|------|-------|------|---------|
| **大数据搜索卡顿** | 中 | 高 | 1. Web Worker 后台执行<br>2. 增量搜索<br>3. 结果分页 |
| **正则 ReDoS 攻击** | 低 | 高 | 1. 超时保护（5s）<br>2. 禁止危险模式<br>3. 输入长度限制 |
| **内存泄漏** | 低 | 高 | 1. destroy() 完整清理<br>2. WeakRef 缓存<br>3. 泄漏检测自动化测试 |
| **Canvas 渲染性能** | 中 | 中 | 1. 可视裁剪<br>2. 脏区域标记<br>3. requestAnimationFrame 节流 |
| **快捷键冲突** | 低 | 中 | 1. 外部输入检测<br>2. 优先级队列<br>3. 可配置快捷键 |

### 11.2 业务风险

| 风险 | 可能性 | 影响 | 应对措施 |
|------|-------|------|---------|
| **用户不接受新 UI** | 低 | 中 | 1. 参考 Excel/VS Code 设计<br>2. A/B 测试<br>3. 可配置外观 |
| **与第三方插件冲突** | 中 | 中 | 1. 完整的 Hook 系统<br>2. 事件命名空间<br>3. 冲突检测警告 |
| **国际化不完善** | 低 | 低 | 1. i18n 框架<br>2. 社区贡献翻译<br>3. 动态语言包加载 |

### 11.3 进度风险

| 风险 | 可能性 | 影响 | 应对措施 |
|------|-------|------|---------|
| **Phase 1 延期** | 中 | 中 | 1. MVP 范围缩减<br>2. 优先核心功能<br>3. 每日站会跟踪 |
| **测试覆盖率不足** | 中 | 高 | 1. TDD 开发模式<br>2. CI 门禁（最低 80%）<br>3. Code Review 强制 |
| **文档滞后** | 高 | 低 | 1. 边开发边写文档<br>2. JSDoc 强制<br>3. 自动生成 API 文档 |

---

## 附录

### A. 术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| 搜索插件 | Search Plugin | 提供全局搜索功能的插件模块 |
| 搜索引擎 | Search Engine | 执行文本/正则匹配的核心算法模块 |
| 高亮渲染器 | Highlighter | 在 Canvas 上绘制搜索结果高亮的渲染模块 |
| 导航器 | Navigator | 管理搜索结果跳转和选区同步的模块 |
| 弹窗面板 | Dropdown Panel | 搜索 UI 的 Web Component 组件 |
| 防抖 | Debounce | 延迟执行直到用户停止输入一段时间 |
| 可视裁剪 | Viewport Culling | 仅渲染屏幕可见区域的优化技术 |
| 脏区域标记 | Dirty Rect Marking | 仅标记变化部分需要重绘的技术 |

### B. 参考资源

#### 项目内部资源
- [BasePlugin.js](./src/plugins/BasePlugin.js) - 插件基类实现
- [FilterPlugin.js](./src/plugins/FilterPlugin.js) - 类似功能的参考实现
- [strategyPriority.js](./src/constants/strategyPriority.js) - 策略优先级定义
- [hookNames.js](./src/constants/hookNames.js) - Hook 常量定义
- [KeyboardStrategy.js](./src/editor/strategies/KeyboardStrategy.js) - 键盘策略参考
- [PopupManager.js](./src/ui/components/PopupManager.js) - 弹窗管理器
- [ConditionalRule.js](./src/model/rules/ConditionalRule.js) - 条件格式规则

#### 外部资源
- [Handsontable Search Plugin Docs](https://handsontable.com/docs/javascript-data-grid/api/search/)
- [VS Code Search Implementation](https://github.com/microsoft/vscode-search)
- [Web Performance Best Practices](https://web.dev/performance/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### C. 变更历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|---------|
| v1.0.0 | 2026-08-08 | AI Assistant | 初始版本，完整设计文档 |

### D. 许可证

本文档遵循项目主许可证（参见 LICENSE 文件）。

---

## 联系方式

如有疑问或建议，请通过以下方式联系：
- GitHub Issues: [项目地址]/issues
- Email: [维护者邮箱]
- 文档反馈: 请提交 PR 至 docs 目录

---

**🎉 感谢您阅读这份详细的设计文档！**

准备开始实施了吗？请告诉我您的选择：
1. **🚀 立即开始编码** - 创建 Phase 1 的所有源码文件
2. **📝 进一步讨论** - 深入某个技术细节
3. **🧪 先写测试** - TDD 方式驱动开发
4. **📊 创建原型** - 先做可交互的 UI 原型

期待您的反馈！💪