/** 搜索匹配结果 */
export interface SearchResult {
    row: number;
    col: number;
    data: string;
    matchIndex: number;
    matchLength: number;
}

/** 搜索选项 */
export interface SearchOptions {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
    searchScope?: string;
}

/**
 * 搜索状态管理器 (Search State Manager)
 *
 * 采用**集中式状态管理模式**，统一管理搜索功能的所有运行时状态。
 *
 * ## 设计原则
 *
 * ### 1. 单一数据源 (Single Source of Truth)
 * 所有与搜索相关的状态都集中在此类中，
 * 避免状态分散在多个组件导致的同步问题。
 *
 * ### 2. 封装性 (Encapsulation)
 * 使用私有字段 (`#`) 存储状态，仅通过公开的 getter/setter 方法访问，
 * 保证状态变更的可预测性和可追踪性。
 *
 * ### 3. 不可变语义 (Immutable Semantics)
 * 虽然 JavaScript 层面不是真正的不可变对象，
 * 但设计上鼓励"替换而非修改"的使用模式。
 *
 * @module plugins/search/SearchState
 */
export class SearchState {
    /** @private 私有字段 - 当前搜索关键词或正则表达式 */
    #query: string = "";

    /** @private 私有字段 - 搜索引擎返回的结果数组 */
    #results: SearchResult[] = [];

    /** @private 私有字段 - 当前导航选中的结果索引 */
    #currentIndex: number = -1;

    /** @private 私有字段 - 上次搜索使用的选项配置 */
    #options: SearchOptions | null = null;

    /** @private 私有字段 - 异步搜索操作的进行状态 */
    #isSearching: boolean = false;

    /** @private 私有字段 - 最近一次操作产生的错误对象 */
    #error: Error | null = null;

    /**
     * 设置查询参数并重置派生状态
     *
     * 在用户修改搜索关键词或选项时调用。
     * 除了保存新参数外，还会**重置所有派生状态**。
     *
     * @param query - 新的搜索关键词或正则表达式
     * @param options - 新的搜索选项配置
     */
    setQuery(query: string, options: SearchOptions): void {
        this.#query = query;
        this.#options = options;
        this.#results = [];
        this.#currentIndex = -1;
        this.#error = null;
    }

    /**
     * 设置搜索结果数组
     *
     * 在 SearchEngine 完成搜索后调用，更新核心数据：
     * 1. 替换整个结果数组（非追加）
     * 2. 自动将当前索引设为第一个结果（如果有的话）
     * 3. 标记搜索完成（isSearching = false）
     *
     * @param results - 搜索引擎返回的结果数组
     */
    setResults(results: SearchResult[]): void {
        this.#results = results;
        this.#currentIndex = results.length > 0 ? 0 : -1;
        this.#isSearching = false;
    }

    /**
     * 设置当前选中的结果索引
     *
     * 仅接受有效范围内的索引值：
     * - `-1`: 取消选中（允许）
     * - `0 ~ length-1`: 有效索引（允许）
     * - 其他值: 静默忽略（不抛出异常）
     *
     * @param index - 新的索引值（-1 或 0 ~ results.length-1）
     */
    setCurrentIndex(index: number): void {
        if (index >= -1 && index < this.#results.length) {
            this.#currentIndex = index;
        }
    }

    /**
     * 设置异步搜索操作的进行状态
     *
     * @param value - 是否正在执行搜索操作
     */
    setSearching(value: boolean): void {
        this.#isSearching = value;
    }

    /**
     * 设置错误信息并标记搜索结束
     *
     * @param error - 错误对象
     */
    setError(error: Error): void {
        this.#error = error;
        this.#isSearching = false;
    }

    /**
     * 清除所有状态（重置为初始值）
     *
     * 在以下场景调用：
     * - 用户关闭搜索面板
     * - 插件被禁用或销毁
     * - 需要完全重置搜索上下文
     */
    clear(): void {
        this.#query = "";
        this.#results = [];
        this.#currentIndex = -1;
        this.#options = null;
        this.#isSearching = false;
        this.#error = null;
    }

    /** 获取当前搜索关键词或正则表达式 */
    getQuery(): string {
        return this.#query;
    }

    /**
     * 获取搜索结果数组（引用，非拷贝）
     *
     * ⚠️ **注意**: 返回的是内部数组的直接引用，
     * 调用方应避免修改此数组。
     */
    getResults(): SearchResult[] {
        return this.#results;
    }

    /** 获取当前选中结果的索引 */
    getCurrentIndex(): number {
        return this.#currentIndex;
    }

    /**
     * 获取当前选中的结果对象
     *
     * 便捷方法，等价于 `getResults()[getCurrentIndex()]`，
     * 但包含边界检查避免越界异常。
     *
     * @returns 当前结果对象，未选中或越界时返回 null
     */
    getCurrentResult(): SearchResult | null {
        return this.#currentIndex >= 0 && this.#currentIndex < this.#results.length ? this.#results[this.#currentIndex] : null;
    }

    /** 获取上次搜索使用的选项配置 */
    getOptions(): SearchOptions | null {
        return this.#options;
    }
}
