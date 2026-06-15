/**
 * 选区管理器
 * 管理当前工作表的选中状态，支持：
 * - 单元格选中（锚点 = 焦点）
 * - 范围选区（锚点到焦点的矩形区域）
 * - 整行/整列/全选
 *
 * 术语说明：
 * - anchor（锚点）：选区起始位置，鼠标按下时确定
 * - focus（焦点）：选区结束位置，拖拽或 Shift+方向键时变化
 * - range（范围）：锚点和焦点围成的矩形区域（自动归一化 top ≤ bottom）
 */
export class SelectionManager {
    /** 锚点行号 */
    #anchorRow = 0;
    /** 锚点列号 */
    #anchorCol = 0;
    /** 焦点行号 */
    #focusRow = 0;
    /** 焦点列号 */
    #focusCol = 0;

    /**
     * 设置单个活动单元格（锚点 = 焦点 = 同一位置）
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    setActive(r, c) {
        this.#anchorRow = r;
        this.#anchorCol = c;
        this.#focusRow = r;
        this.#focusCol = c;
    }

    /**
     * 设置范围选区（锚点和焦点可以不同）
     *
     * @param {number} anchorRow - 锚点行号
     * @param {number} anchorCol - 锚点列号
     * @param {number} focusRow - 焦点行号
     * @param {number} focusCol - 焦点列号
     */
    setRange(anchorRow, anchorCol, focusRow, focusCol) {
        this.#anchorRow = anchorRow;
        this.#anchorCol = anchorCol;
        this.#focusRow = focusRow;
        this.#focusCol = focusCol;
    }

    /**
     * 获取活动单元格位置（即锚点）
     * 兼容旧接口
     *
     * @returns {[number, number]} [行号, 列号]
     */
    getActive() {
        return [this.#anchorRow, this.#anchorCol];
    }

    /**
     * 获取锚点位置
     *
     * @returns {[number, number]} [行号, 列号]
     */
    getAnchor() {
        return [this.#anchorRow, this.#anchorCol];
    }

    /**
     * 获取焦点位置
     *
     * @returns {[number, number]} [行号, 列号]
     */
    getFocus() {
        return [this.#focusRow, this.#focusCol];
    }

    /**
     * 获取归一化的选区范围
     * 自动将锚点和焦点归一化为 top ≤ bottom, left ≤ right
     *
     * @returns {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }}
     */
    getRange() {
        return {
            topRow: Math.min(this.#anchorRow, this.#focusRow),
            topCol: Math.min(this.#anchorCol, this.#focusCol),
            bottomRow: Math.max(this.#anchorRow, this.#focusRow),
            bottomCol: Math.max(this.#anchorCol, this.#focusCol),
        };
    }

    /**
     * 判断当前选区是否为单个单元格
     *
     * @returns {boolean}
     */
    isSingleCell() {
        return this.#anchorRow === this.#focusRow && this.#anchorCol === this.#focusCol;
    }

    /**
     * 判断指定单元格是否在当前选区内
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    contains(row, col) {
        const range = this.getRange();
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    /**
     * 全选：选中整个工作表
     *
     * @param {number} maxRow - 最大行号
     * @param {number} maxCol - 最大列号
     */
    selectAll(maxRow, maxCol) {
        this.#anchorRow = 0;
        this.#anchorCol = 0;
        this.#focusRow = maxRow;
        this.#focusCol = maxCol;
    }

    /**
     * 选中整行
     *
     * @param {number} row - 行号
     * @param {number} maxCol - 最大列号
     */
    selectRow(row, maxCol) {
        this.#anchorRow = row;
        this.#anchorCol = 0;
        this.#focusRow = row;
        this.#focusCol = maxCol;
    }

    /**
     * 选中整列
     *
     * @param {number} col - 列号
     * @param {number} maxRow - 最大行号
     */
    selectCol(col, maxRow) {
        this.#anchorRow = 0;
        this.#anchorCol = col;
        this.#focusRow = maxRow;
        this.#focusCol = col;
    }
}
