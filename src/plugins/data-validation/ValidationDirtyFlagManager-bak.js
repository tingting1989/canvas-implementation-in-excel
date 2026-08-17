const MAX_CACHE_AGE = 5000;

/**
 * 验证脏标记管理器
 *
 * 优化验证性能的核心机制：
 * - 仅验证数据变化的单元格（"脏"单元格）
 * - 滚动时仅验证视口内的脏单元格（lazyValidate）
 * - 非脏单元格直接返回缓存结果
 * - 批量操作后标记区域为脏
 *
 * @example
 * const dirtyManager = new ValidationDirtyFlagManager();
 *
 * // 用户编辑单元格后标记为脏
 * dirtyManager.markDirty(0, 0, 'user_edit');
 *
 * // 滚动时仅验证视口内的脏单元格
 * const dirtyInView = dirtyManager.getDirtyCellsInViewport(viewport);
 *
 * // 验证完成后标记为干净
 * dirtyManager.markClean(0, 0);
 */
export class ValidationDirtyFlagManager {
    /** @type {Set<string>} 脏单元格集合 "row,col" */
    #dirtyCells = new Set();

    /** @type {Map<string, string>} 脏原因 "row,col" → reason */
    #dirtyReasons = new Map();

    /** @type {Map<string, number>} 上次验证时间戳 "row,col" → timestamp */
    #lastValidationTime = new Map();

    /** @type {boolean} 是否启用 */
    #enabled = true;

    /**
     * 标记单元格为脏（需要重新验证）
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} [reason='unknown'] - 原因：'user_edit' | 'sort' | 'paste' | 'formula_recalc' | 'rule_change' | 'undo' | 'autofill'
     */
    markDirty(row, col, reason = "unknown") {
        if (!this.#enabled) return;

        const key = `${row},${col}`;
        this.#dirtyCells.add(key);
        this.#dirtyReasons.set(key, reason);
    }

    /**
     * 批量标记区域为脏
     *
     * @param {number} startRow - 起始行号
     * @param {number} endRow - 结束行号
     * @param {number} startCol - 起始列号
     * @param {number} endCol - 结束列号
     * @param {string} [reason='unknown'] - 原因
     */
    markRangeDirty(startRow, endRow, startCol, endCol, reason = "unknown") {
        if (!this.#enabled) return;

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                this.markDirty(row, col, reason);
            }
        }
    }

    /**
     * 检查单元格是否需要重新验证
     *
     * 综合考虑脏标记和缓存过期时间。
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isDirty(row, col) {
        const key = `${row},${col}`;

        if (this.#dirtyCells.has(key)) {
            return true;
        }

        const lastTime = this.#lastValidationTime.get(key);
        return lastTime !== undefined && Date.now() - lastTime > MAX_CACHE_AGE;
    }

    /**
     * 获取所有脏单元格
     *
     * @returns {Array<{row: number, col: number, reason: string}>}
     */
    getDirtyCells() {
        const result = [];

        for (const key of this.#dirtyCells) {
            const [row, col] = key.split(",").map(Number);
            const reason = this.#dirtyReasons.get(key) || "unknown";
            result.push({ row, col, reason });
        }

        return result;
    }

    /**
     * 获取视口内的脏单元格
     *
     * @param {Object} viewport - 视口信息
     * @param {number} viewport.startRow - 起始行
     * @param {number} viewport.endRow - 结束行
     * @param {number} viewport.startCol - 起始列
     * @param {number} viewport.endCol - 结束列
     * @returns {Array<{row: number, col: number, reason: string}>}
     */
    getDirtyCellsInViewport(viewport) {
        const { startRow, endRow, startCol, endCol } = viewport;
        const result = [];

        for (const key of this.#dirtyCells) {
            const [row, col] = key.split(",").map(Number);

            if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
                const reason = this.#dirtyReasons.get(key) || "unknown";
                result.push({ row, col, reason });
            }
        }

        return result;
    }

    /**
     * 标记单元格已验证（清除脏标记）
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    markClean(row, col) {
        const key = `${row},${col}`;
        this.#dirtyCells.delete(key);
        this.#dirtyReasons.delete(key);
        this.#lastValidationTime.set(key, Date.now());
    }

    /**
     * 批量标记单元格已验证
     *
     * @param {Array<{row: number, col: number}>} cells - 单元格数组
     */
    markCellsClean(cells) {
        for (const { row, col } of cells) {
            this.markClean(row, col);
        }
    }

    /**
     * 懒验证策略（滚动时使用）
     *
     * 只返回视口内的脏单元格，非脏单元格直接返回缓存结果。
     *
     * @param {Object} viewport - 视口信息
     * @returns {Array<{row: number, col: number, reason: string}>} 需要验证的脏单元格
     */
    lazyValidate(viewport) {
        return this.getDirtyCellsInViewport(viewport);
    }

    /**
     * 清空所有脏标记
     */
    clearAll() {
        this.#dirtyCells.clear();
        this.#dirtyReasons.clear();
        this.#lastValidationTime.clear();
    }

    /**
     * 清除过期的缓存时间戳
     */
    cleanExpiredTimestamps() {
        const now = Date.now();

        for (const [key, timestamp] of this.#lastValidationTime) {
            if (now - timestamp > MAX_CACHE_AGE) {
                this.#lastValidationTime.delete(key);
            }
        }
    }

    /**
     * 获取脏单元格数量
     *
     * @returns {number}
     */
    get dirtyCount() {
        return this.#dirtyCells.size;
    }

    /**
     * 是否启用
     *
     * @returns {boolean}
     */
    get enabled() {
        return this.#enabled;
    }

    /**
     * 设置启用/禁用
     *
     * @param {boolean} value
     */
    set enabled(value) {
        this.#enabled = value;
    }

    /**
     * 销毁管理器
     */
    destroy() {
        this.clearAll();
        this.#enabled = false;
    }
}

export { MAX_CACHE_AGE };
