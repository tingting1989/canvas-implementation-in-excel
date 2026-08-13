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
 * 但设计上鼓励"替换而非修改"的使用模式：
 * ```javascript
 * // ✅ 推荐：替换整个结果数组
 * state.setResults(newResults);
 *
 * // ❌ 避免：直接修改内部数组（虽然技术上可行）
 * state.getResults().push(item);
 * ```
 *
 * ## 状态字段说明
 *
 * | 字段名 | 类型 | 说明 |
 * |--------|------|------|
 * | `#query` | string | 用户输入的搜索关键词或正则表达式 |
 * | `#results` | SearchResult[] | 搜索引擎返回的结果数组 |
 * | `#currentIndex` | number | 当前导航到的结果索引（-1 表示未选中） |
 * | `#options` | SearchOptions | 上次搜索使用的选项配置 |
 * | `#isSearching` | boolean | 是否正在执行异步搜索操作 |
 * | `#error` | Error \| null | 最近一次错误信息（如有） |
 *
 * ## 使用示例
 * ```javascript
 * const state = new SearchState();
 *
 * // 开始新搜索
 * state.setQuery("hello", { caseSensitive: false, wholeWord: true });
 * state.setSearching(true);
 *
 * // 搜索完成
 * state.setResults([
 *   { row: 0, col: 0, data: "Hello World", matchIndex: 0, matchLength: 5 },
 *   { row: 2, col: 3, data: "Say Hello", matchIndex: 4, matchLength: 5 },
 * ]);
 * state.setSearching(false);
 *
 * // 导航到下一个
 * console.log(state.getCurrentIndex()); // 0
 * state.setCurrentIndex(1);
 * console.log(state.getCurrentResult()); // → 第二个 SearchResult
 *
 * // 关闭搜索
 * state.clear(); // 重置所有状态为初始值
 * ```
 *
 * ## 未来扩展方向
 * - **响应式集成**: 可适配 Vue 的 reactive() 或 React 的 useState()
 * - **撤销历史**: 记录状态变更快照，支持 Ctrl+Z 撤销导航操作
 * - **持久化**: 将查询历史保存到 localStorage
 *
 * @class SearchState
 * @see {@link SearchPlugin} - 主要消费者
 * @see {@link SearchNavigator} - 读取 currentIndex 和 results
 * @see {@link SearchUIManager} - 通过 updateUI 同步显示
 */
export class SearchState {
    /**
     * @private 私有字段 - 当前搜索关键词或正则表达式
     *
     * 由用户在搜索面板输入框中键入的内容。
     * 每次调用 `setQuery()` 时更新。
     *
     * @type {string}
     */
    #query = "";

    /**
     * @private 私有字段 - 搜索引擎返回的结果数组
     *
     * 元素类型为 `SearchResult`（定义在 SearchPlugin.js 中）。
     * 数组顺序由 SearchEngine 决定（通常按行列升序排列）。
     *
     * @type {Array<import("./SearchPlugin.js").SearchResult>}
     */
    #results = [];

    /**
     * @private 私有字段 - 当前导航选中的结果索引
     *
     * 基于数组的索引值（从 0 开始）。
     * 特殊值：
     * - `-1`: 未选中任何结果（初始状态、无结果时）
     * - `0 ~ length-1`: 有效索引，指向 `#results` 数组的某个元素
     *
     * @type {number}
     */
    #currentIndex = -1;

    /**
     * @private 私有字段 - 上次搜索使用的选项配置
     *
     * 在 `setQuery()` 时保存，用于：
     * - UI 显示当前选项状态
     * - 重新搜索时恢复上次选项
     * - 日志记录和调试
     *
     * @type {import("./SearchPlugin.js").SearchOptions|null}
     */
    #options = null;

    /**
     * @private 私有字段 - 异步搜索操作的进行状态
     *
     * 用于防止重复提交和 UI 反馈：
     * - `true`: 正在等待 SearchEngine 返回结果
     * - `false`: 空闲状态（可接受新的搜索请求）
     *
     * @type {boolean}
     */
    #isSearching = false;

    /**
     * @private 私有字段 - 最近一次操作产生的错误对象
     *
     * 仅在有错误时非 null，成功操作后会重置为 null。
     * 用于：
     * - UI 错误提示显示
     * - 开发环境下的详细日志输出
     *
     * @type {Error|null}
     */
    #error = null;

    /**
     * 设置查询参数并重置派生状态
     *
     * 在用户修改搜索关键词或选项时调用。
     * 除了保存新参数外，还会**重置所有派生状态**：
     * - 清空结果数组（旧结果与新查询不匹配）
     * - 重置当前索引（-1 表示未选中）
     * - 清除错误信息（新查询可能成功）
     *
     * ### 调用时机
     * - 用户在输入框键入内容时（通过防抖）
     * - 用户切换选项按钮时（大小写、全词匹配等）
     * - 程序化调用 `plugin.query()` 时
     *
     * @public
     * @param {string} query - 新的搜索关键词或正则表达式
     * @param {import("./SearchPlugin.js").SearchOptions} options - 新的搜索选项配置
     * @returns {void}
     *
     * @example
     * state.setQuery("hello", {
     *   caseSensitive: false,
     *   wholeWord: true,
     *   useRegex: false,
     *   searchScope: "all",
     * });
     */
    setQuery(query, options) {
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
     * ### 边界行为
     * - **空数组**: currentIndex 设为 -1（无选中项）
     * - **非空数组**: currentIndex 设为 0（选中第一个）
     *
     * @public
     * @param {Array<import("./SearchPlugin.js").SearchResult>} results - 搜索引擎返回的结果数组
     * @returns {void}
     *
     * @example
     * const results = await searchEngine.executeQuery(cells, "test", opts);
     * state.setResults(results); // 自动选中第 1 个结果
     */
    setResults(results) {
        this.#results = results;
        this.#currentIndex = results.length > 0 ? 0 : -1;
        this.#isSearching = false;
    }

    /**
     * 设置当前选中的结果索引
     *
     * 在用户导航（F3/Shift+F3）或程序化跳转时调用。
     *
     * ### 参数验证
     * 仅接受有效范围内的索引值：
     * - `-1`: 取消选中（允许）
     * - `0 ~ length-1`: 有效索引（允许）
     * - 其他值: 静默忽略（不抛出异常）
     *
     * 这种防御性设计避免了调用方需要预先检查边界。
     *
     * @public
     * @param {number} index - 新的索引值（-1 或 0 ~ results.length-1）
     * @returns {void}
     *
     * @example
     * state.setCurrentIndex(5); // 跳转到第 6 个结果
     * state.setCurrentIndex(-1); // 取消选中
     */
    setCurrentIndex(index) {
        if (index >= -1 && index < this.#results.length) {
            this.#currentIndex = index;
        }
    }

    /**
     * 设置异步搜索操作的进行状态
     *
     * 用于 UI 反馈（如显示加载动画）和防止重复提交：
     * - `true`: 显示"搜索中..."提示，禁用搜索按钮
     * - `false`: 恢复正常 UI，允许新的搜索请求
     *
     * ### 典型使用流程
     * ```javascript
     * state.setSearching(true);  // 开始前
     * const results = await engine.query(...);
     * state.setResults(results); // 会自动设置 setSearching(false)
     * ```
     *
     * @public
     * @param {boolean} value - 是否正在执行搜索操作
     * @returns {void}
     */
    setSearching(value) {
        this.#isSearching = value;
    }

    /**
     * 设置错误信息并标记搜索结束
     *
     * 在搜索过程中发生异常时调用。
     * 除了记录错误对象外，还会自动将 isSearching 设为 false。
     *
     * ### 错误处理建议
     * 调用方应同时更新 UI 显示错误信息给用户：
     * ```javascript
     * try {
     *   // ... 搜索逻辑 ...
     * } catch (error) {
     *   state.setError(error);
     *   uiController.showError("搜索失败: " + error.message);
     * }
     * ```
     *
     * @public
     * @param {Error} error - 错误对象（包含 message、stack 等属性）
     * @returns {void}
     */
    setError(error) {
        this.#error = error;
        this.#isSearching = false;
    }

    /**
     * 清除所有状态（重置为初始值）
     *
     * 在以下场景调用：
     * - 用户关闭搜索面板（Esc 或点击关闭按钮）
     * - 插件被禁用或销毁
     * - 需要完全重置搜索上下文
     *
     * ### 重置的字段
     * - `#query`: 空字符串
     * - `#results`: 空数组
     * - `#currentIndex`: -1 (未选中)
     * - `#options`: null
     * - `#isSearching`: false
     * - `#error`: null
     *
     * @public
     * @returns {void}
     *
     * @example
     * plugin.hide(); // 内部会调用 state.clear()
     */
    clear() {
        this.#query = "";
        this.#results = [];
        this.#currentIndex = -1;
        this.#options = null;
        this.#isSearching = false;
        this.#error = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // Getter 方法（只读访问）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 获取当前搜索关键词或正则表达式
     *
     * @public
     * @returns {string} 查询字符串（可能为空）
     */
    getQuery() {
        return this.#query;
    }

    /**
     * 获取搜索结果数组（引用，非拷贝）
     *
     * ⚠️ **注意**: 返回的是内部数组的直接引用，
     * 调用方应避免修改此数组（违反不可变语义）。
     * 如需安全使用，请先展开拷贝：`[...state.getResults()]`
     *
     * @public
     * @returns {Array<import("./SearchPlugin.js").SearchResult>} 结果数组（可能为空）
     */
    getResults() {
        return this.#results;
    }

    /**
     * 获取当前选中结果的索引
     *
     * @public
     * @returns {number} 当前索引（-1 表示未选中或无结果）
     */
    getCurrentIndex() {
        return this.#currentIndex;
    }

    /**
     * 获取当前选中的结果对象
     *
     * 便捷方法，等价于 `getResults()[getCurrentIndex()]`，
     * 但包含边界检查避免越界异常。
     *
     * 返回值可用于：
     * - 读取匹配的单元格位置 (`row`, `col`)
     * - 访问原始单元格内容 (`data`)
     * - 获取匹配详情 (`matchIndex`, `matchLength`)
     *
     * @public
     * @returns {import("./SearchPlugin.js").SearchResult|null}
     *   当前结果对象，未选中或越界时返回 null
     *
     * @example
     * const current = state.getCurrentResult();
     * if (current) {
     *   console.log(`当前位置: (${current.row}, ${current.col})`);
     *   console.log(`匹配内容: ${current.data.substring(current.matchIndex, current.matchIndex + current.matchLength)}`);
     * }
     */
    getCurrentResult() {
        return this.#currentIndex >= 0 && this.#currentIndex < this.#results.length ? this.#results[this.#currentIndex] : null;
    }

    /**
     * 获取上次搜索使用的选项配置
     *
     * 可用于：
     * - UI 同步显示当前选项状态
     * - 重新执行上次搜索时恢复配置
     * - 日志记录和调试信息输出
     *
     * @public
     * @returns {import("./SearchPlugin.js").SearchOptions|null} 选项对象，从未搜索过则返回 null
     */
    getOptions() {
        return this.#options;
    }
}
