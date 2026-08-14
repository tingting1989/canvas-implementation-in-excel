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
    #anchorRow: number = 0;

    /** 锚点列号 */
    #anchorCol: number = 0;

    /** 焦点行号 */
    #focusRow: number = 0;

    /** 焦点列号 */
    #focusCol: number = 0;

    /**
     * 设置单个活动单元格（锚点 = 焦点 = 同一位置）
     *
     * @param r - 行号
     * @param c - 列号
     */
    setActive(r: number, c: number): void {
        this.#anchorRow = r;
        this.#anchorCol = c;
        this.#focusRow = r;
        this.#focusCol = c;
    }

    /**
     * 设置范围选区（锚点和焦点可以不同）
     *
     * @param anchorRow - 锚点行号
     * @param anchorCol - 锚点列号
     * @param focusRow - 焦点行号
     * @param focusCol - 焦点列号
     */
    setRange(anchorRow: number, anchorCol: number, focusRow: number, focusCol: number): void {
        this.#anchorRow = anchorRow;
        this.#anchorCol = anchorCol;
        this.#focusRow = focusRow;
        this.#focusCol = focusCol;
    }

    /**
     * 获取活动单元格位置（即锚点）
     * 兼容旧接口
     *
     * @returns [行号, 列号]
     */
    getActive(): [number, number] {
        return [this.#anchorRow, this.#anchorCol];
    }

    /**
     * 获取锚点位置
     *
     * @returns [行号, 列号]
     */
    getAnchor(): [number, number] {
        return [this.#anchorRow, this.#anchorCol];
    }

    /**
     * 获取焦点位置
     *
     * @returns [行号, 列号]
     */
    getFocus(): [number, number] {
        return [this.#focusRow, this.#focusCol];
    }

    /**
     * 获取归一化的选区范围
     * 自动将锚点和焦点归一化为 top ≤ bottom, left ≤ right
     *
     * @returns 包含 topRow, topCol, bottomRow, bottomCol 的范围对象
     */
    getRange(): { topRow: number; topCol: number; bottomRow: number; bottomCol: number } {
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
     * @returns 是否为单个单元格
     */
    isSingleCell(): boolean {
        return this.#anchorRow === this.#focusRow && this.#anchorCol === this.#focusCol;
    }

    /**
     * 判断指定单元格是否在当前选区内
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 是否在选区内
     */
    contains(row: number, col: number): boolean {
        const range = this.getRange();
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    /**
     * 全选：选中整个工作表
     *
     * @param maxRow - 最大行号
     * @param maxCol - 最大列号
     */
    selectAll(maxRow: number, maxCol: number): void {
        this.#anchorRow = 0;
        this.#anchorCol = 0;
        this.#focusRow = maxRow;
        this.#focusCol = maxCol;
    }

    /**
     * 选中整行
     *
     * @param row - 行号
     * @param maxCol - 最大列号
     */
    selectRow(row: number, maxCol: number): void {
        this.#anchorRow = row;
        this.#anchorCol = 0;
        this.#focusRow = row;
        this.#focusCol = maxCol;
    }

    /**
     * 选中整列
     *
     * @param col - 列号
     * @param maxRow - 最大行号
     */
    selectCol(col: number, maxRow: number): void {
        this.#anchorRow = 0;
        this.#anchorCol = col;
        this.#focusRow = maxRow;
        this.#focusCol = col;
    }
}
