/**
 * 搜索结果导航器 (Search Navigator)
 *
 * 管理搜索结果的导航逻辑，包括：
 * - 维护当前选中结果的索引位置
 * - 同步选区到 SelectionManager（高亮显示）
 * - 自动滚动确保目标单元格在可视区域
 * - 支持循环导航（到达末尾后回到开头）
 *
 * ## 导航模式
 * ### 循环导航（Circular Navigation）
 * - **goToNext()**: 到达最后一个结果时，循环回第一个
 * - **goToPrevious()**: 到达第一个结果时，循环到最后一个
 * - 这种行为与 Excel/Ctrl+F 保持一致
 *
 * ### 边界安全
 * - 所有方法都检查索引有效性（越界返回 null）
 * - 空结果数组时所有导航操作都安全返回 null
 *
 * ## 协作组件
 * - **SearchState**: 读取/更新当前索引和结果列表
 * - **SelectionManager**: 设置活动单元格高亮
 * - **RenderEngine**: 执行滚动到可视区域操作
 *
 * ## 使用示例
 * ```javascript
 * const navigator = new SearchNavigator(state, selectionManager, renderEngine);
 *
 * // 首次搜索后跳转到第一个结果
 * navigator.goToFirst(); // → 返回第一个 SearchResult
 *
 * // 用户按 F3 跳转到下一个
 * navigator.goToNext();  // → 返回第二个 SearchResult（或循环回第一个）
 *
 * // 用户按 Shift+F3 跳转到上一个
 * navigator.goToPrevious(); // → 返回前一个 SearchResult
 *
 * // 直接跳转到第 5 个结果
 * navigator.goTo(4); // → 返回索引为 4 的 SearchResult
 * ```
 *
 * @class SearchNavigator
 * @see {@link SearchState} - 状态管理器
 * @see {@link SelectionManager} - 选区管理器
 * @see {@link RenderEngine} - 渲染引擎
 */
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

export class SearchNavigator {
    /**
     * @private 私有字段 - 搜索状态管理器引用
     *
     * 用于读取当前结果列表和更新当前索引。
     *
     * @type {import("./SearchState.js")}
     */
    #state = null;

    /**
     * @private 私有字段 - 选区管理器实例
     *
     * 用于将导航目标设置为活动单元格，
     * 触发 UI 高亮显示和焦点跟随。
     *
     * @type {Object|null}
     */
    #selectionManager = null;

    /**
     * @private 私有字段 - 渲染引擎实例
     *
     * 提供 scrollToCell 方法，
     * 确保导航目标单元格滚动到视口可见区域。
     *
     * @type {Object|null}
     */
    #renderEngine = null;

    /**
     * 创建导航器实例
     *
     * 所有参数都是可选的，即使某些依赖缺失，
     * 导航器仍可正常工作（只是对应功能不可用）。
     *
     * @constructor
     * @param {import("./SearchState.js")} state - 搜索状态管理器（必需）
     * @param {Object|null} [selectionManager=null] - 选区管理器（可选，缺失时无法同步选区）
     * @param {Object|null} [renderEngine=null] - 渲染引擎（可选，缺失时无法自动滚动）
     *
     * @example
     * const nav = new SearchNavigator(
     *   plugin.getState(),           // 状态管理器
     *   sheet.selection,             // 选区管理器
     *   workbook.renderEngine        // 渲染引擎
     * );
     */
    constructor(state, selectionManager, renderEngine = null) {
        this.#state = state;
        this.#selectionManager = selectionManager;
        this.#renderEngine = renderEngine;
    }

    /**
     * 跳转到第一个搜索结果
     *
     * 通常在以下场景调用：
     * - 首次执行搜索完成时
     * - 用户重新打开已关闭的搜索面板时
     * - 用户点击"全部替换"后的定位
     *
     * 执行流程：
     * 1. 检查是否有结果（空则返回 null）
     * 2. 将当前索引设为 0
     * 3. 同步选区和滚动位置
     *
     * @public
     * @returns {import("./SearchPlugin.js").SearchResult|null} 第一个结果对象，无结果时返回 null
     *
     * @example
     * const firstResult = navigator.goToFirst();
     * if (firstResult) {
     *   console.log(`定位到: (${firstResult.row}, ${firstResult.col})`);
     * }
     */
    goToFirst() {
        const results = this.#state.getResults();
        if (results.length === 0) return null;

        this.#state.setCurrentIndex(0);
        const result = this.#state.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * 跳转到下一个搜索结果（支持循环）
     *
     * 导航逻辑：
     * - 如果不是最后一个 → 索引 +1
     * - 如果是最后一个 → 循环回索引 0（第一个）
     *
     * 快捷键绑定：F3 或 Enter
     *
     * @public
     * @returns {import("./SearchPlugin.js").SearchResult|null} 下一个结果对象，无结果时返回 null
     *
     * @example
     * const nextResult = navigator.goToNext();
     * // 假设当前在第 5 个（共 10 个），则返回第 6 个
     * // 假设当前在第 10 个（共 10 个），则返回第 1 个（循环）
     */
    goToNext() {
        const results = this.#state.getResults();
        if (results.length === 0) return null;

        const currentIndex = this.#state.getCurrentIndex();
        let nextIndex;

        if (currentIndex < results.length - 1) {
            nextIndex = currentIndex + 1;
        } else {
            nextIndex = 0; // 循环到第一个
        }

        this.#state.setCurrentIndex(nextIndex);
        const result = this.#state.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * 跳转到上一个搜索结果（支持循环）
     *
     * 导航逻辑：
     * - 如果不是第一个 → 索引 -1
     * - 如果是第一个 → 循环到最后一个索引
     *
     * 快捷键绑定：Shift+F3 或 Shift+Enter
     *
     * @public
     * @returns {import("./SearchPlugin.js").SearchResult|null} 上一个结果对象，无结果时返回 null
     *
     * @example
     * const prevResult = navigator.goToPrevious();
     * // 假设当前在第 5 个（共 10 个），则返回第 4 个
     * // 假设当前在第 1 个（共 10 个），则返回第 10 个（循环）
     */
    goToPrevious() {
        const results = this.#state.getResults();
        if (results.length === 0) return null;

        const currentIndex = this.#state.getCurrentIndex();
        let prevIndex;

        if (currentIndex > 0) {
            prevIndex = currentIndex - 1;
        } else {
            prevIndex = results.length - 1; // 循环到最后一个
        }

        this.#state.setCurrentIndex(prevIndex);
        const result = this.#state.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * 跳转到指定索引的搜索结果
     *
     * 用于精确跳转（如用户点击结果列表中的某一项）。
     *
     * 边界检查：
     * - index < 0 → 返回 null
     * - index >= length → 返回 null
     * - 有效索引 → 正常跳转
     *
     * @public
     * @param {number} index - 目标结果的索引值（从 0 开始）
     * @returns {import("./SearchPlugin.js").SearchResult|null} 指定索引的结果对象，越界时返回 null
     *
     * @example
     * // 直接跳转到第 7 个结果
     * const result = navigator.goTo(6);
     * if (result) {
     *   console.log(`跳转到: ${result.data}`);
     * }
     */
    goTo(index) {
        const results = this.#state.getResults();
        if (index < 0 || index >= results.length) return null;

        this.#state.setCurrentIndex(index);
        const result = this.#state.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * @private 私有方法 - 同步选区到当前结果位置
     *
     * 这是导航的核心副作用方法，负责：
     * 1. 通过 SelectionManager 设置活动单元格
     * 2. 通过 RenderEngine 滚动到可视区域
     *
     * 异常处理：
     * - 即使选区同步失败也不抛出异常（通过 errorHandler 记录）
     * - 保证导航操作的原子性（要么完全成功，要么静默失败）
     *
     * @param {import("./SearchPlugin.js").SearchResult} result - 当前要跳转到的结果对象
     * @returns {void}
     */
    #syncSelection(result) {
        if (!result || !this.#selectionManager) return;

        try {
            this.#selectionManager.setActive(result.row, result.col);
            this.#scrollToVisible(result.row, result.col);
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_SELECTION_SYNC_ERROR, "同步选区失败", { originalError: error });
        }
    }

    /**
     * @private 私有方法 - 滚动到指定单元格使其可见
     *
     * 调用 RenderEngine 的 scrollToCell 方法，
     * 该方法会计算最佳滚动位置并执行平滑滚动。
     *
     * 安全性保证：
     * - 检查 renderEngine 和 scrollToCell 方法是否存在
     * - 失败时不影响主流程（仅记录错误日志）
     *
     * @param {number} row - 目标行号
     * @param {number} col - 目标列号
     * @returns {void}
     */
    #scrollToVisible(row, col) {
        try {
            if (this.#renderEngine?.scrollToCell) {
                this.#renderEngine.scrollToCell(row, col);
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_SCROLL_TO_CELL_ERROR, "滚动到单元格失败", { originalError: error });
        }
    }

    /**
     * @private 私有方法 - 动态更新依赖项（SelectionManager 和 RenderEngine）
     *
     * 解决问题场景：
     * 1. **初始化时序问题**：插件 init() 时 activeSheet 可能未就绪
     * 2. **工作表切换**：用户切换工作表后，旧的 selectionManager 失效
     * 3. **动态加载**：某些组件延迟加载，初始时为 null
     *
     * 使用方式：
     * 在每次导航操作前由 SearchPlugin 调用，
     * 确保使用最新的依赖实例。
     *
     * @public
     * @param {Object|null} selectionManager - 最新的选区管理器实例
     * @param {Object|null} renderEngine - 最新的渲染引擎实例
     * @returns {void}
     *
     * @example
     * // SearchPlugin.findNext() 中调用
     * const currentSelection = workbook.activeSheet?.selection || null;
     * const currentRenderEngine = workbook.renderEngine || null;
     * navigator.updateDependencies(currentSelection, currentRenderEngine);
     */
    updateDependencies(selectionManager, renderEngine) {
        this.#selectionManager = selectionManager;
        this.#renderEngine = renderEngine;
    }
}
