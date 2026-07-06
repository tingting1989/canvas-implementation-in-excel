/**
 * 视口坐标转换器（ViewportTransform）
 *
 * 统一管理「行列号 ↔ 视口像素坐标」的双向转换，消除散落在
 * RenderEngine / HeaderRenderer / OverlayRenderer / SelectionLayer /
 * Workbook 等多处的手写坐标计算，避免坐标系不一致导致的 bug。
 *
 * ## 坐标体系
 * - 数据坐标（dataX/dataY）：从单元格区域左上角算起的像素坐标，不含表头
 * - 视口坐标（viewX/viewY）：从 Canvas 左上角算起的像素坐标，含表头偏移
 *
 * ## 冻结区域处理
 * 冻结列/行始终固定显示，不随滚动移动。当 col < fixedCols 时，
 * 该列使用 scrollX=0 计算（即 effectiveSx=0）；非冻结列使用实际 scrollX。
 * 本类将这一判断内聚，调用方无需关心冻结细节。
 *
 * ## 使用方式
 * 在每次 render / hitTest 时，用当前 sheet + scrollX/Y 实例化：
 * ```js
 * const vt = new ViewportTransform(sheet, scrollX, scrollY);
 * const rect = vt.cellToViewRect(row, col);
 * const col = vt.viewXToCol(px);
 * ```
 *
 * 该类是轻量、无副作用的纯计算工具，不持有可变状态。
 */
export class ViewportTransform {
    /**
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} scrollX - 水平滚动偏移（像素）
     * @param {number} scrollY - 垂直滚动偏移（像素）
     */
    constructor(sheet, scrollX, scrollY) {
        this.sheet = sheet;
        this.rc = sheet.rowColManager;
        this.scrollX = scrollX;
        this.scrollY = scrollY;
        this.headerW = sheet.getHeaderWidth();
        this.headerH = sheet.getHeaderHeight();
        this.fixedCols = sheet.fixedColumnsStart;
        this.fixedRows = sheet.fixedRowsTop;
        this.frozenColsW = sheet.frozenColsWidth;
        this.frozenRowsH = sheet.frozenRowsHeight;
    }

    // ─── 列坐标转换 ───────────────────────────────────────

    /**
     * 列左边缘 → 视口 X 坐标
     * 自动处理冻结列（冻结列不随水平滚动移动）
     * @param {number} col - 列号
     * @returns {number} 视口 X 坐标
     */
    colToViewX(col) {
        const effectiveSx = col < this.fixedCols ? 0 : this.scrollX;
        return this.headerW + this.rc.getColX(col) - effectiveSx;
    }

    /**
     * 列右边缘 → 视口 X 坐标
     * @param {number} col - 列号
     * @returns {number} 视口 X 坐标（列右边缘）
     */
    colRightToViewX(col) {
        return this.colToViewX(col) + this.rc.getColWidth(col);
    }

    /**
     * 视口 X 坐标 → 数据 X 坐标
     * 自动判断是否在冻结列区域，选择对应的坐标转换路径
     * @param {number} viewX - 视口 X 坐标（相对 Canvas 左上角）
     * @returns {number} 数据 X 坐标（不含表头偏移）
     */
    viewXToDataX(viewX) {
        const inFrozenCols = this.frozenColsW > 0 && viewX <= this.headerW + this.frozenColsW;
        return inFrozenCols ? viewX - this.headerW : viewX - this.headerW + this.scrollX;
    }

    /**
     * 视口 X 坐标 → 列号（命中检测）
     * @param {number} viewX - 视口 X 坐标（相对 Canvas 左上角）
     * @returns {number} 列号
     */
    viewXToCol(viewX) {
        return this.rc.colAt(this.viewXToDataX(viewX));
    }

    /**
     * 列右边缘 → 数据 X 坐标
     * @param {number} col - 列号
     * @returns {number} 数据 X 坐标（列右边缘）
     */
    colRightToDataX(col) {
        return this.rc.getColX(col) + this.rc.getColWidth(col);
    }

    // ─── 行坐标转换 ───────────────────────────────────────

    /**
     * 行顶边缘 → 视口 Y 坐标
     * 自动处理冻结行（冻结行不随垂直滚动移动）
     *
     * @param {number} row - 行号
     * @returns {number} 视口 Y 坐标
     */
    rowToViewY(row) {
        const effectiveSy = this.#isFrozenRow(row) ? 0 : this.scrollY;
        return this.headerH + this.rc.getRowY(row) - effectiveSy;
    }

    /**
     * 行底边缘 → 视口 Y 坐标
     * @param {number} row - 行号
     * @returns {number} 视口 Y 坐标（行底边缘）
     */
    rowBottomToViewY(row) {
        return this.rowToViewY(row) + this.rc.getRowHeight(row);
    }

    /** 行是否在冻结区（基于实际行号判断） */
    #isFrozenRow(row) {
        return row < this.fixedRows;
    }

    /**
     * 视口 Y 坐标 → 数据 Y 坐标
     * 自动判断是否在冻结行区域，选择对应的坐标转换路径
     * @param {number} viewY - 视口 Y 坐标（相对 Canvas 左上角）
     * @returns {number} 数据 Y 坐标（不含表头偏移）
     */
    viewYToDataY(viewY) {
        const inFrozenRows = this.frozenRowsH > 0 && viewY <= this.headerH + this.frozenRowsH;
        return inFrozenRows ? viewY - this.headerH : viewY - this.headerH + this.scrollY;
    }

    /**
     * 视口 Y 坐标 → 行号（命中检测）
     * @param {number} viewY - 视口 Y 坐标（相对 Canvas 左上角）
     * @returns {number} 行号
     */
    viewYToRow(viewY) {
        return this.rc.rowAt(this.viewYToDataY(viewY));
    }

    /**
     * 行底边缘 → 数据 Y 坐标
     * @param {number} row - 行号
     * @returns {number} 数据 Y 坐标（行底边缘）
     */
    rowBottomToDataY(row) {
        return this.rc.getRowY(row) + this.rc.getRowHeight(row);
    }

    // ─── 单元格矩形 ───────────────────────────────────────

    /**
     * 单元格 → 视口矩形 { x, y, w, h }
     * 自动处理冻结区域，合并单元格需调用方传入 mergeInfo
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {{ x: number, y: number, w: number, h: number }}
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
     * 合并单元格 → 视口矩形 { x, y, w, h }
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} merge
     * @returns {{ x: number, y: number, w: number, h: number }}
     */
    mergeToViewRect(merge) {
        const x = this.colToViewX(merge.topCol);
        const y = this.rowToViewY(merge.topRow);
        const x2 = this.colRightToViewX(merge.bottomCol);
        const y2 = this.rowBottomToViewY(merge.bottomRow);
        return { x, y, w: x2 - x, h: y2 - y };
    }

    // ─── 冻结区域判定 ─────────────────────────────────────

    /** 列是否在冻结区域 */
    isInFrozenCols(col) {
        return col < this.fixedCols;
    }

    /** 行是否在冻结区域 */
    isInFrozenRows(row) {
        return row < this.fixedRows;
    }

    /**
     * 视口 X 是否落在冻结列区域
     * @param {number} viewX
     * @returns {boolean}
     */
    isViewXInFrozenCols(viewX) {
        return this.frozenColsW > 0 && viewX <= this.headerW + this.frozenColsW;
    }

    /**
     * 视口 Y 是否落在冻结行区域
     * @param {number} viewY
     * @returns {boolean}
     */
    isViewYInFrozenRows(viewY) {
        return this.frozenRowsH > 0 && viewY <= this.headerH + this.frozenRowsH;
    }

    /**
     * 单元格是否在可视区域内
     * 用于编辑器随滚动隐藏/恢复等场景
     * @param {number} row - 实际行号（来自 selection 等组件）
     * @param {number} col - 列号
     * @param {number} canvasW - Canvas 逻辑宽度（CSS 像素）
     * @param {number} canvasH - Canvas 逻辑高度（CSS 像素）
     * @param {number} [tabH=0] - Sheet 标签栏高度（像素）
     * @returns {boolean}
     */
    isCellVisible(row, col, canvasW, canvasH, tabH = 0) {
        const dataViewW = canvasW - this.headerW - this.frozenColsW;
        const dataViewH = canvasH - this.headerH - this.frozenRowsH - tabH;

        const cellX = this.rc.getColX(col);
        const cellY = this.rc.getRowY(row);
        const cellW = this.rc.getColWidth(col);
        const cellH = this.rc.getRowHeight(row);

        let outOfView;
        if (this.isInFrozenCols(col)) {
            outOfView = cellX + cellW <= 0 || cellX >= this.frozenColsW;
        } else {
            outOfView = cellX + cellW - this.frozenColsW <= this.scrollX || cellX - this.frozenColsW >= this.scrollX + dataViewW;
        }

        if (this.isInFrozenRows(row)) {
            outOfView = outOfView || cellY + cellH <= 0 || cellY >= this.frozenRowsH;
        } else {
            outOfView = outOfView || cellY + cellH - this.frozenRowsH <= this.scrollY || cellY - this.frozenRowsH >= this.scrollY + dataViewH;
        }

        return !outOfView;
    }
}
