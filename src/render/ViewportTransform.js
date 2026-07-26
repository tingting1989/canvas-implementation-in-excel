/**
 * 视口坐标转换器（ViewportTransform）
 *
 * 统一管理「行列号 ↔ 视口像素坐标」的双向转换，消除散落在
 * RenderEngine / HeaderRenderer / OverlayRenderer / SelectionLayer /
 * Workbook 等多处的手写坐标计算，避免坐标系不一致导致的 bug。
 *
 * ## 坐标体系
 *
 * - **数据坐标**（dataX/dataY）：从单元格区域左上角算起的像素坐标，不含表头
 * - **视口坐标**（viewX/viewY）：从 Canvas 左上角算起的像素坐标，含表头偏移
 *
 * 转换公式：
 * - 视口坐标 = 表头偏移 + 数据坐标 - 有效滚动偏移
 * - 数据坐标 = 视口坐标 - 表头偏移 + 有效滚动偏移
 *
 * ## 冻结区域处理
 *
 * 冻结列/行始终固定显示，不随滚动移动。当 col < fixedCols 时，
 * 该列使用 scrollX=0 计算（即 effectiveSx=0）；非冻结列使用实际 scrollX。
 * 本类将这一判断内聚，调用方无需关心冻结细节。
 *
 * 冻结区域对坐标转换的影响：
 * - colToViewX / rowToViewY：冻结行列的 effectiveScroll 为 0
 * - viewXToDataX / viewYToDataY：视口坐标在冻结区域内时不加 scrollX
 * - isCellVisible：冻结区域和非冻结区域分别判断可见性
 *
 * ## 使用方式
 *
 * 在每次 render / hitTest 时，用当前 sheet + scrollX/Y 实例化：
 * ```js
 * const vt = new ViewportTransform(sheet, scrollX, scrollY);
 * const rect = vt.cellToViewRect(row, col);
 * const col = vt.viewXToCol(px);
 * ```
 *
 * 该类是轻量、无副作用的纯计算工具，不持有可变状态。
 *
 * @module render/ViewportTransform
 */
export class ViewportTransform {
    /**
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} scrollX - 水平滚动偏移（数据坐标，像素）
     * @param {number} scrollY - 垂直滚动偏移（数据坐标，像素）
     */
    constructor(sheet, scrollX, scrollY) {
        /** @type {import("../workbook/Sheet.js").Sheet} 当前工作表 */
        this.sheet = sheet;
        /** @type {import("../core/RowColManager.js").RowColManager} 行列管理器，提供行列像素坐标查询 */
        this.rc = sheet.rowColManager;
        /** @type {number} 水平滚动偏移（数据坐标，像素） */
        this.scrollX = scrollX;
        /** @type {number} 垂直滚动偏移（数据坐标，像素） */
        this.scrollY = scrollY;
        /** @type {number} 行头宽度（像素） */
        this.headerW = sheet.getHeaderWidth();
        /** @type {number} 列头高度（像素） */
        this.headerH = sheet.getHeaderHeight();
        /** @type {number} 冻结列数 */
        this.fixedCols = sheet.fixedColumnsStart;
        /** @type {number} 冻结行数 */
        this.fixedRows = sheet.fixedRowsTop;
        /** @type {number} 冻结列区域总宽度（像素） */
        this.frozenColsW = sheet.frozenColsWidth;
        /** @type {number} 冻结行区域总高度（像素） */
        this.frozenRowsH = sheet.frozenRowsHeight;
    }

    // ─── 列坐标转换 ───────────────────────────────────────

    /**
     * 列左边缘 → 视口 X 坐标
     *
     * 自动处理冻结列：冻结列的 effectiveScrollX 为 0，
     * 因此冻结列始终显示在表头右侧，不随水平滚动移动。
     *
     * @param {number} col - 列号
     * @returns {number} 视口 X 坐标（列左边缘在 Canvas 上的位置）
     */
    colToViewX(col) {
        const effectiveSx = col < this.fixedCols ? 0 : this.scrollX;
        return this.headerW + this.rc.getColX(col) - effectiveSx;
    }

    /**
     * 列右边缘 → 视口 X 坐标
     *
     * @param {number} col - 列号
     * @returns {number} 视口 X 坐标（列右边缘在 Canvas 上的位置）
     */
    colRightToViewX(col) {
        return this.colToViewX(col) + this.rc.getColWidth(col);
    }

    /**
     * 视口 X 坐标 → 数据 X 坐标
     *
     * 自动判断是否在冻结列区域，选择对应的坐标转换路径：
     * - 冻结列区域：dataX = viewX - headerW（不加 scrollX）
     * - 非冻结区域：dataX = viewX - headerW + scrollX
     *
     * @param {number} viewX - 视口 X 坐标（相对 Canvas 左上角）
     * @returns {number} 数据 X 坐标（不含表头偏移）
     */
    viewXToDataX(viewX) {
        const inFrozenCols = this.frozenColsW > 0 && viewX <= this.headerW + this.frozenColsW;
        return inFrozenCols ? viewX - this.headerW : viewX - this.headerW + this.scrollX;
    }

    /**
     * 视口 X 坐标 → 列号（命中检测）
     *
     * 先将视口坐标转换为数据坐标，再通过 RowColManager 查找对应的列号。
     *
     * @param {number} viewX - 视口 X 坐标（相对 Canvas 左上角）
     * @returns {number} 列号
     */
    viewXToCol(viewX) {
        return this.rc.colAt(this.viewXToDataX(viewX));
    }

    /**
     * 列右边缘 → 数据 X 坐标
     *
     * @param {number} col - 列号
     * @returns {number} 数据 X 坐标（列右边缘，不含表头偏移）
     */
    colRightToDataX(col) {
        return this.rc.getColX(col) + this.rc.getColWidth(col);
    }

    // ─── 行坐标转换 ───────────────────────────────────────

    /**
     * 行顶边缘 → 视口 Y 坐标
     *
     * 自动处理冻结行：冻结行的 effectiveScrollY 为 0，
     * 因此冻结行始终显示在表头下方，不随垂直滚动移动。
     *
     * @param {number} row - 行号
     * @returns {number} 视口 Y 坐标（行顶边缘在 Canvas 上的位置）
     */
    rowToViewY(row) {
        const effectiveSy = this.#isFrozenRow(row) ? 0 : this.scrollY;
        return this.headerH + this.rc.getRowY(row) - effectiveSy;
    }

    /**
     * 行底边缘 → 视口 Y 坐标
     *
     * @param {number} row - 行号
     * @returns {number} 视口 Y 坐标（行底边缘在 Canvas 上的位置）
     */
    rowBottomToViewY(row) {
        return this.rowToViewY(row) + this.rc.getRowHeight(row);
    }

    /**
     * 判断行是否在冻结区域
     *
     * @param {number} row - 行号
     * @returns {boolean} 是否为冻结行
     */
    #isFrozenRow(row) {
        return row < this.fixedRows;
    }

    /**
     * 视口 Y 坐标 → 数据 Y 坐标
     *
     * 自动判断是否在冻结行区域，选择对应的坐标转换路径：
     * - 冻结行区域：dataY = viewY - headerH（不加 scrollY）
     * - 非冻结区域：dataY = viewY - headerH + scrollY
     *
     * @param {number} viewY - 视口 Y 坐标（相对 Canvas 左上角）
     * @returns {number} 数据 Y 坐标（不含表头偏移）
     */
    viewYToDataY(viewY) {
        const inFrozenRows = this.frozenRowsH > 0 && viewY <= this.headerH + this.frozenRowsH;
        return inFrozenRows ? viewY - this.headerH : viewY - this.headerH + this.scrollY;
    }

    /**
     * 视口 Y 坐标 → 行号（命中检测）
     *
     * 先将视口坐标转换为数据坐标，再通过 RowColManager 查找对应的行号。
     *
     * @param {number} viewY - 视口 Y 坐标（相对 Canvas 左上角）
     * @returns {number} 行号
     */
    viewYToRow(viewY) {
        return this.rc.rowAt(this.viewYToDataY(viewY));
    }

    /**
     * 行底边缘 → 数据 Y 坐标
     *
     * @param {number} row - 行号
     * @returns {number} 数据 Y 坐标（行底边缘，不含表头偏移）
     */
    rowBottomToDataY(row) {
        return this.rc.getRowY(row) + this.rc.getRowHeight(row);
    }

    // ─── 单元格矩形 ───────────────────────────────────────

    /**
     * 单元格 → 视口矩形
     *
     * 自动处理冻结区域。对于合并单元格，需调用方传入 mergeInfo
     * 并使用 mergeToViewRect() 方法。
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {{ x: number, y: number, w: number, h: number }} 视口矩形（Canvas 坐标）
     */
    cellToViewRect(row, col) {
        return {
            x: this.colToViewX(col),
            y: this.rowToViewY(row),
            w: this.rc.getColWidth(col),
            h: this.rc.getRowHeight(row),
        };
    }

    /**
     * 合并单元格 → 视口矩形
     *
     * 通过合并区域的左上角和右下角行列号计算完整的视口矩形，
     * 自动处理冻结区域对坐标的影响。
     *
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} merge - 合并信息
     * @returns {{ x: number, y: number, w: number, h: number }} 视口矩形（Canvas 坐标）
     */
    mergeToViewRect(merge) {
        const x = this.colToViewX(merge.topCol);
        const y = this.rowToViewY(merge.topRow);
        const x2 = this.colRightToViewX(merge.bottomCol);
        const y2 = this.rowBottomToViewY(merge.bottomRow);
        return { x, y, w: x2 - x, h: y2 - y };
    }

    // ─── 冻结区域判定 ─────────────────────────────────────

    /**
     * 判断列是否在冻结区域
     *
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isInFrozenCols(col) {
        return col < this.fixedCols;
    }

    /**
     * 判断行是否在冻结区域
     *
     * @param {number} row - 行号
     * @returns {boolean}
     */
    isInFrozenRows(row) {
        return row < this.fixedRows;
    }

    /**
     * 判断视口 X 坐标是否落在冻结列区域
     *
     * @param {number} viewX - 视口 X 坐标
     * @returns {boolean}
     */
    isViewXInFrozenCols(viewX) {
        return this.frozenColsW > 0 && viewX <= this.headerW + this.frozenColsW;
    }

    /**
     * 判断视口 Y 坐标是否落在冻结行区域
     *
     * @param {number} viewY - 视口 Y 坐标
     * @returns {boolean}
     */
    isViewYInFrozenRows(viewY) {
        return this.frozenRowsH > 0 && viewY <= this.headerH + this.frozenRowsH;
    }

    /**
     * 判断单元格是否在可视区域内
     *
     * 用于编辑器随滚动隐藏/恢复等场景。
     * 分别判断冻结区域和非冻结区域的可见性：
     * - 冻结列/行：始终可见，只需判断坐标是否在冻结区域范围内
     * - 非冻结列/行：需要判断是否在滚动后的可视区域内
     *
     * 可视区域计算：
     * - 非冻结区域宽度 = canvasW - headerW - frozenColsW
     * - 非冻结区域高度 = canvasH - headerH - frozenRowsH - tabH
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {number} canvasW - Canvas 逻辑宽度（CSS 像素）
     * @param {number} canvasH - Canvas 逻辑高度（CSS 像素）
     * @param {number} [tabH=0] - Sheet 标签栏高度（像素）
     * @returns {boolean} 单元格是否可见
     */
    isCellVisible(row, col, canvasW, canvasH, tabH = 0) {
        // 非冻结区域的可视尺寸（扣除表头和冻结区域）
        const dataViewW = canvasW - this.headerW - this.frozenColsW;
        const dataViewH = canvasH - this.headerH - this.frozenRowsH - tabH;

        // 单元格在数据坐标系中的位置和尺寸
        const cellX = this.rc.getColX(col);
        const cellY = this.rc.getRowY(row);
        const cellW = this.rc.getColWidth(col);
        const cellH = this.rc.getRowHeight(row);

        // 水平方向可见性判断
        let outOfView;
        if (this.isInFrozenCols(col)) {
            // 冻结列：始终显示在表头右侧，判断是否在冻结列宽度范围内
            outOfView = cellX + cellW <= 0 || cellX >= this.frozenColsW;
        } else {
            // 非冻结列：判断是否在滚动后的可视区域内
            // 需要减去 frozenColsW，因为冻结列占据了左侧空间
            outOfView = cellX + cellW - this.frozenColsW <= this.scrollX || cellX - this.frozenColsW >= this.scrollX + dataViewW;
        }

        // 垂直方向可见性判断
        if (this.isInFrozenRows(row)) {
            // 冻结行：始终显示在表头下方，判断是否在冻结行高度范围内
            outOfView = outOfView || cellY + cellH <= 0 || cellY >= this.frozenRowsH;
        } else {
            // 非冻结行：判断是否在滚动后的可视区域内
            // 需要减去 frozenRowsH，因为冻结行占据了顶部空间
            outOfView = outOfView || cellY + cellH - this.frozenRowsH <= this.scrollY || cellY - this.frozenRowsH >= this.scrollY + dataViewH;
        }

        return !outOfView;
    }
}
