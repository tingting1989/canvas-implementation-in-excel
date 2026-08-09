import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/**
 * 搜索结果导航器
 *
 * 职责：
 * - 维护当前结果索引
 * - 同步到 SelectionManager
 * - 自动滚动到可视区域
 * - 支持循环导航（可选）
 */
export class SearchNavigator {
    /** @type {import("./SearchState.js")} */
    #state = null;

    /** @type {Object|null} SelectionManager 实例 */
    #selectionManager = null;

    /** @type {Object|null} RenderEngine 实例 */
    #renderEngine = null;

    /**
     * @param {import("./SearchState.js")} state - 搜索状态管理器
     * @param {Object|null} selectionManager - 选区管理器
     * @param {Object|null} renderEngine - 渲染引擎（用于滚动到可视区域）
     */
    constructor(state, selectionManager, renderEngine = null) {
        this.#state = state;
        this.#selectionManager = selectionManager;
        this.#renderEngine = renderEngine;
    }

    /**
     * 跳转到第一个结果
     *
     * @returns {import("./SearchPlugin.js").SearchResult|null}
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
     * 跳转到下一个结果（循环模式）
     *
     * @returns {import("./SearchPlugin.js").SearchResult|null}
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
     * 跳转到上一个结果（循环模式）
     *
     * @returns {import("./SearchPlugin.js").SearchResult|null}
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
     * 跳转到指定索引的结果
     *
     * @param {number} index - 目标索引
     * @returns {import("./SearchPlugin.js").SearchResult|null}
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
     * 同步选区到当前结果位置
     *
     * @private
     * @param {import("./SearchPlugin.js").SearchResult} result - 当前结果
     */
    #syncSelection(result) {
        if (!result || !this.#selectionManager) return;

        try {
            this.#selectionManager.setActive(result.row, result.col);
            this.#scrollToVisible(result.row, result.col);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_SELECTION_SYNC_ERROR, "同步选区失败", { originalError: error });
        }
    }

    /**
     * 滚动到指定单元格可见
     *
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    #scrollToVisible(row, col) {
        try {
            if (this.#renderEngine?.scrollToCell) {
                this.#renderEngine.scrollToCell(row, col);
            }
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_SCROLL_TO_CELL_ERROR, "滚动到单元格失败", { originalError: error });
        }
    }
}
