/** 排序状态信息 */
interface SortInfo {
    col: number;
    order: string | null;
}

/** SortState 的 JSON 序列化结构 */
interface SortStateJSON {
    isSorted: boolean;
    sortCol: number;
    sortOrder: string | null;
    hasPreSortSnapshot: boolean;
    hasPostSortOrder: boolean;
    preSortSnapshotLength: number;
    postSortOrderLength: number;
}

/**
 * 排序状态管理器（SortState）
 *
 * 设计原则：
 * - 使用「可恢复快照」模式，每次排序前捕获当前状态
 * - 支持无限次的排序↔恢复循环
 * - 内存占用：~16n bytes（双层快照）
 *
 * @module plugins/sort/SortState
 */
export class SortState {
    /**
     * @private 私有字段 - 排序前的数据顺序快照（动态更新）
     *
     * 语义：preSortSnapshot[i] = 排序前第 i 个位置的行号
     */
    #preSortSnapshot: number[] | null = null;

    /**
     * @private 私有字段 - 排序后的数据顺序（由 SortEngine 在排序完成后设置）
     *
     * 语义：postSortOrder[j] = 排序后第 j 个位置的行号
     */
    #postSortOrder: number[] | null = null;

    /** @private 私有字段 - 当前是否处于已排序状态 */
    #isSorted: boolean = false;

    /** @private 私有字段 - 当前排序列和顺序信息（用于 UI 显示箭头等） */
    #currentSortInfo: SortInfo = {
        col: -1,
        order: null,
    };

    /**
     * 在每次排序前调用，捕获当前顺序作为恢复点
     *
     * ⚠️ 关键改进：每次都重新捕获（不是只在首次）
     * 支持多次排序/恢复循环
     *
     * @param currentRowOrder - 当前的行顺序数组
     */
    capturePreSortState(currentRowOrder: number[]): void {
        this.#preSortSnapshot = [...currentRowOrder];
        this.#postSortOrder = null;
    }

    /**
     * 记录当前的排序信息（用于 UI 渲染）
     *
     * @param col - 排序列索引
     * @param order - 排序顺序
     */
    setCurrentSort(col: number, order: string): void {
        this.#currentSortInfo = { col, order };
        this.#isSorted = true;
    }

    /**
     * 记录排序后的行顺序（由 SortEngine 在排序完成后调用）
     *
     * @param sortedIndices - 排序后的行索引数组，sortedIndices[i] = 第 i 个位置的行号
     */
    setPostSortOrder(sortedIndices: number[]): void {
        this.#postSortOrder = [...sortedIndices];
    }

    /**
     * 生成「恢复到排序前状态」的移动映射表
     *
     * 算法说明：
     * 1. preSortSnapshot[targetPos] = 应该在 targetPos 位置的行号
     * 2. postSortOrder.indexOf(row) = 该行号当前所在的位置
     * 3. 如果当前位置 ≠ 目标位置，则需要移动
     *
     * @returns 恢复映射表 (currentPos → targetPos)，无法恢复返回 null
     */
    getRestoreMapping(): Map<number, number> | null {
        if (!this.#isSorted || !this.#preSortSnapshot || !this.#postSortOrder) {
            return null;
        }

        const restoreMapping = new Map<number, number>();

        for (let targetPos = 0; targetPos < this.#preSortSnapshot.length; targetPos++) {
            const originalRow = this.#preSortSnapshot[targetPos];
            const currentPos = this.#postSortOrder.indexOf(originalRow);

            if (currentPos !== -1 && currentPos !== targetPos) {
                restoreMapping.set(currentPos, targetPos);
            }
        }

        return restoreMapping.size > 0 ? restoreMapping : null;
    }

    /**
     * 清除排序状态标记
     *
     * 注意：不清除快照数据（保留用于可能的再次恢复）
     * 完全重置请使用 reset()
     */
    clear(): void {
        this.#isSorted = false;
        this.#currentSortInfo = { col: -1, order: null };
    }

    /**
     * 完全重置所有状态（用于数据源变更、工作表切换等场景）
     */
    reset(): void {
        this.#preSortSnapshot = null;
        this.#postSortOrder = null;
        this.#isSorted = false;
        this.#currentSortInfo = { col: -1, order: null };
    }

    /** 当前是否处于已排序状态 */
    get isSorted(): boolean {
        return this.#isSorted;
    }

    /** 当前排序列索引 */
    get sortCol(): number {
        return this.#currentSortInfo.col;
    }

    /** 当前排序顺序 */
    get sortOrder(): string | null {
        return this.#currentSortInfo.order;
    }

    /** 是否存在可恢复的快照 */
    get hasRestorePoint(): boolean {
        return !!this.#preSortSnapshot && !!this.#postSortOrder;
    }

    /**
     * 序列化为 JSON（用于调试和状态检查）
     */
    toJSON(): SortStateJSON {
        return {
            isSorted: this.#isSorted,
            sortCol: this.#currentSortInfo.col,
            sortOrder: this.#currentSortInfo.order,
            hasPreSortSnapshot: !!this.#preSortSnapshot,
            hasPostSortOrder: !!this.#postSortOrder,
            preSortSnapshotLength: this.#preSortSnapshot?.length || 0,
            postSortOrderLength: this.#postSortOrder?.length || 0,
        };
    }
}
