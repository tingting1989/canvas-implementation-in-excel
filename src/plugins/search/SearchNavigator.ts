import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import type { SearchState, SearchResult } from "./SearchState.js";

/**
 * 搜索结果导航器 (Search Navigator)
 *
 * 管理搜索结果的导航逻辑，包括：
 * - 维护当前选中结果的索引位置
 * - 同步选区到 SelectionManager（高亮显示）
 * - 自动滚动确保目标单元格在可视区域
 * - 支持循环导航（到达末尾后回到开头）
 *
 * @module plugins/search/SearchNavigator
 */
export class SearchNavigator {
    /** @private 私有字段 - 搜索状态管理器引用 */
    #state: SearchState | null = null;

    /** @private 私有字段 - 选区管理器实例 */
    #selectionManager: any = null;

    /** @private 私有字段 - 渲染引擎实例 */
    #renderEngine: any = null;

    /**
     * 创建导航器实例
     *
     * @param state - 搜索状态管理器（必需）
     * @param selectionManager - 选区管理器（可选）
     * @param renderEngine - 渲染引擎（可选）
     */
    constructor(state: SearchState, selectionManager: any = null, renderEngine: any = null) {
        this.#state = state;
        this.#selectionManager = selectionManager;
        this.#renderEngine = renderEngine;
    }

    /**
     * 跳转到第一个搜索结果
     *
     * @returns 第一个结果对象，无结果时返回 null
     */
    goToFirst(): SearchResult | null {
        const results = this.#state!.getResults();
        if (results.length === 0) return null;

        this.#state!.setCurrentIndex(0);
        const result = this.#state!.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * 跳转到下一个搜索结果（支持循环）
     *
     * 快捷键绑定：F3 或 Enter
     *
     * @returns 下一个结果对象，无结果时返回 null
     */
    goToNext(): SearchResult | null {
        const results = this.#state!.getResults();
        if (results.length === 0) return null;

        const currentIndex = this.#state!.getCurrentIndex();
        let nextIndex: number;

        if (currentIndex < results.length - 1) {
            nextIndex = currentIndex + 1;
        } else {
            nextIndex = 0;
        }

        this.#state!.setCurrentIndex(nextIndex);
        const result = this.#state!.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * 跳转到上一个搜索结果（支持循环）
     *
     * 快捷键绑定：Shift+F3 或 Shift+Enter
     *
     * @returns 上一个结果对象，无结果时返回 null
     */
    goToPrevious(): SearchResult | null {
        const results = this.#state!.getResults();
        if (results.length === 0) return null;

        const currentIndex = this.#state!.getCurrentIndex();
        let prevIndex: number;

        if (currentIndex > 0) {
            prevIndex = currentIndex - 1;
        } else {
            prevIndex = results.length - 1;
        }

        this.#state!.setCurrentIndex(prevIndex);
        const result = this.#state!.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * 跳转到指定索引的搜索结果
     *
     * @param index - 目标结果的索引值（从 0 开始）
     * @returns 指定索引的结果对象，越界时返回 null
     */
    goTo(index: number): SearchResult | null {
        const results = this.#state!.getResults();
        if (index < 0 || index >= results.length) return null;

        this.#state!.setCurrentIndex(index);
        const result = this.#state!.getCurrentResult();
        this.#syncSelection(result);

        return result;
    }

    /**
     * @private 私有方法 - 同步选区到当前结果位置
     *
     * @param result - 当前要跳转到的结果对象
     */
    #syncSelection(result: SearchResult | null): void {
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
     * @param row - 目标行号
     * @param col - 目标列号
     */
    #scrollToVisible(row: number, col: number): void {
        try {
            if (this.#renderEngine?.scrollToCell) {
                this.#renderEngine.scrollToCell(row, col);
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_SCROLL_TO_CELL_ERROR, "滚动到单元格失败", { originalError: error });
        }
    }

    /**
     * 动态更新依赖项（SelectionManager 和 RenderEngine）
     *
     * @param selectionManager - 最新的选区管理器实例
     * @param renderEngine - 最新的渲染引擎实例
     */
    updateDependencies(selectionManager: any, renderEngine: any): void {
        this.#selectionManager = selectionManager;
        this.#renderEngine = renderEngine;
    }
}
