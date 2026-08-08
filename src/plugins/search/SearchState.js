/**
 * 搜索状态管理器
 *
 * 采用不可变状态模式，每次状态变更返回新对象引用，
 * 便于 React/Vue 等框架的响应式追踪（未来扩展）。
 *
 * 职责：
 * - 管理搜索查询字符串
 * - 缓存搜索结果数组
 * - 维护当前选中结果的索引
 * - 记录搜索选项配置
 * - 追踪搜索状态（空闲/搜索中/错误）
 */
export class SearchState {
    /** @type {string} 当前搜索关键词或正则表达式 */
    #query = "";

    /** @type {Array<import("./SearchPlugin.js").SearchResult>} 搜索结果数组 */
    #results = [];

    /** @type {number} 当前选中的结果索引（-1 表示未选中） */
    #currentIndex = -1;

    /** @type {import("./SearchPlugin.js").SearchOptions} 搜索选项配置 */
    #options = null;

    /** @type {boolean} 是否正在搜索中 */
    #isSearching = false;

    /** @type {Error|null} 错误信息（如有） */
    #error = null;

    /**
     * 设置查询参数并重置状态
     *
     * @param {string} query - 搜索关键词
     * @param {import("./SearchPlugin.js").SearchOptions} options - 搜索选项
     */
    setQuery(query, options) {
        this.#query = query;
        this.#options = options;
        this.#results = [];
        this.#currentIndex = -1;
        this.#error = null;
    }

    /**
     * 设置搜索结果
     *
     * @param {Array<import("./SearchPlugin.js").SearchResult>} results - 结果数组
     */
    setResults(results) {
        this.#results = results;
        this.#currentIndex = results.length > 0 ? 0 : -1;
        this.#isSearching = false;
    }

    /**
     * 设置当前索引
     *
     * @param {number} index - 新索引值
     */
    setCurrentIndex(index) {
        if (index >= -1 && index < this.#results.length) {
            this.#currentIndex = index;
        }
    }

    /**
     * 设置搜索中状态
     *
     * @param {boolean} value - 是否正在搜索
     */
    setSearching(value) {
        this.#isSearching = value;
    }

    /**
     * 设置错误信息
     *
     * @param {Error} error - 错误对象
     */
    setError(error) {
        this.#error = error;
        this.#isSearching = false;
    }

    /**
     * 清除所有状态（关闭搜索时调用）
     */
    clear() {
        this.#query = "";
        this.#results = [];
        this.#currentIndex = -1;
        this.#options = null;
        this.#isSearching = false;
        this.#error = null;
    }

    // ─── Getter 方法 ──────────────────────────────

    getQuery() {
        return this.#query;
    }

    getResults() {
        return this.#results;
    }

    getCurrentIndex() {
        return this.#currentIndex;
    }

    getCurrentResult() {
        return this.#currentIndex >= 0 && this.#currentIndex < this.#results.length
            ? this.#results[this.#currentIndex]
            : null;
    }

    isSearching() {
        return this.#isSearching;
    }

    getOptions() {
        return this.#options;
    }

    getError() {
        return this.#error;
    }
}