/**
 * 筛选状态管理器
 *
 * 负责管理所有列的筛选状态，包括：
 * - 各列的筛选配置（勾选项/条件）
 * - 唯一值缓存（避免重复计算）
 * - 缓存失效标记（数据变化时标记需要刷新）
 *
 * ## 数据结构
 * ```
 * #columnFilters: Map<colIndex, FilterConfig>
 *     FilterConfig = { type: "values", uncheckedValues: Set<string> }
 *                   | { type: "condition", operator: string, value: string }
 *
 * #uniqueValuesCache: Map<colIndex, string[]>  - 缓存各列唯一值
 * #invalidatedColumns: Set<colIndex>            - 标记需要重新计算唯一值的列
 * ```
 *
 * ## 缓存策略
 * - 打开筛选面板时：读取缓存 → 有效则直接使用，无效则重新计算并缓存
 * - 数据变化时：标记相关列为失效 → 下次打开时重新计算
 *
 * @example
 * const state = new FilterState();
 * state.setColumnFilter(0, { type: "values", uncheckedValues: new Set(["apple"]) });
 * state.getColumnFilter(0);  // { type: "values", uncheckedValues: Set(1) }
 *
 * @typedef {Object} FilterConfigValues
 * @property {"values"} type - 筛选类型：按值筛选
 * @property {Set<string>} uncheckedValues - 未勾选的值集合（勾选的值会显示）
 *
 * @typedef {Object} FilterConfigCondition
 * @property {"condition"} type - 筛选类型：按条件筛选
 * @property {string} operator - 条件操作符
 * @property {string} value - 条件值
 * @property {string} [valueEnd] - 范围条件结束值（between、dateBetween 等操作符时使用）
 *
 * @typedef {FilterConfigValues | FilterConfigCondition} FilterConfig
 */
export class FilterState {
    /** @type {Map<number, FilterConfig>} 列索引 → 筛选配置 */
    #columnFilters = new Map();

    /** @type {Map<number, string[]>} 列索引 → 缓存的唯一值列表 */
    #uniqueValuesCache = new Map();

    /** @type {Set<number>} 已失效的列索引集合（需要重新计算唯一值） */
    #invalidatedColumns = new Set();

    /**
     * 设置列的筛选配置
     *
     * @param {number} col - 列索引
     * @param {FilterConfig} filter - 筛选配置对象
     * @param {string} filter.type - 筛选类型："values" | "condition"
     * @param {Set<string>} [filter.uncheckedValues] - 未勾选的值（type="values"时）
     * @param {string} [filter.operator] - 条件操作符（type="condition"时）
     * @param {string} [filter.value] - 条件值（type="condition"时）
     * @param {string} [filter.valueEnd] - 范围条件结束值（type="condition"时，用于 between 等操作符）
     */
    setColumnFilter(col, filter) {
        this.#columnFilters.set(col, filter);
    }

    /**
     * 移除列的筛选配置
     *
     * 同时清除该列的唯一值缓存。
     *
     * @param {number} col - 列索引
     */
    removeColumnFilter(col) {
        this.#columnFilters.delete(col);
        this.#uniqueValuesCache.delete(col);
    }

    /**
     * 获取列的筛选配置
     *
     * @param {number} col - 列索引
     * @returns {FilterConfig|null} 筛选配置，不存在则返回 null
     */
    getColumnFilter(col) {
        return this.#columnFilters.get(col) || null;
    }

    /**
     * 获取所有列的筛选配置副本
     *
     * @returns {Map<number, FilterConfig>} 所有筛选配置的浅拷贝
     */
    getAllFilters() {
        return new Map(this.#columnFilters);
    }

    /**
     * 是否存在任何激活的筛选
     *
     * @returns {boolean} 至少有一个列配置了筛选时返回 true
     */
    hasActiveFilters() {
        return this.#columnFilters.size > 0;
    }

    /**
     * 清除所有筛选状态
     *
     * 包括：所有列筛选配置、唯一值缓存、失效标记
     */
    clearAll() {
        this.#columnFilters.clear();
        this.#uniqueValuesCache.clear();
        this.#invalidatedColumns.clear();
    }

    /**
     * 缓存列的唯一值列表
     *
     * @param {number} col - 列索引
     * @param {string[]} values - 该列的所有唯一值
     */
    cacheUniqueValues(col, values) {
        this.#uniqueValuesCache.set(col, values);
    }

    /**
     * 获取列缓存的唯一值
     *
     * @param {number} col - 列索引
     * @returns {string[]|null} 缓存的唯一值列表，不存在则返回 null
     */
    getUniqueValuesCache(col) {
        return this.#uniqueValuesCache.get(col) || null;
    }

    /**
     * 标记列的缓存为失效
     *
     * 当单元格数据变化时调用，之后该列重新打开筛选面板时会重新计算唯一值。
     *
     * @param {number|undefined} col - 列索引，undefined 表示所有列
     */
    invalidateColumnCache(col) {
        if (col !== undefined) {
            this.#invalidatedColumns.add(col);
            this.#uniqueValuesCache.delete(col);
        } else {
            this.#uniqueValuesCache.clear();
        }
    }

    /**
     * 检查列的唯一值缓存是否有效
     *
     * @param {number} col - 列索引
     * @returns {boolean} 缓存有效（未失效）返回 true
     */
    isCacheValid(col) {
        return !this.#invalidatedColumns.has(col);
    }
}