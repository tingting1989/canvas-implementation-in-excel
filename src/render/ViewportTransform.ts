import type { Sheet } from "../workbook/Sheet.js";

/** 视口坐标矩形 */
interface ViewRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 合并单元格信息 */
interface MergeInfo {
    topRow: number;
    topCol: number;
    bottomRow: number;
    bottomCol: number;
}

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
 * 该类是轻量、无副作用的纯计算工具，不持有可变状态。
 *
 * @module render/ViewportTransform
 */
export class ViewportTransform {
    /** 当前工作表 */
    sheet: Sheet;

    /** 行列管理器，提供行列像素坐标查询 */
    rc: any;

    /** 水平滚动偏移（数据坐标，像素） */
    scrollX: number;

    /** 垂直滚动偏移（数据坐标，像素） */
    scrollY: number;

    /** 行头宽度（像素） */
    headerW: number;

    /** 列头高度（像素） */
    headerH: number;

    /** 冻结列数 */
    fixedCols: number;

    /** 冻结行数 */
    fixedRows: number;

    /** 冻结列区域总宽度（像素） */
    frozenColsW: number;

    /** 冻结行区域总高度（像素） */
    frozenRowsH: number;

    /**
     * @param sheet - 当前工作表
     * @param scrollX - 水平滚动偏移（数据坐标，像素）
     * @param scrollY - 垂直滚动偏移（数据坐标，像素）
     */
    constructor(sheet: Sheet, scrollX: number, scrollY: number) {
        this.sheet = sheet;
        this.rc = (sheet as any).rowColManager;
        this.scrollX = scrollX;
        this.scrollY = scrollY;
        this.headerW = (sheet as any).getHeaderWidth();
        this.headerH = (sheet as any).getHeaderHeight();
        this.fixedCols = (sheet as any).fixedColumnsStart;
        this.fixedRows = (sheet as any).fixedRowsTop;
        this.frozenColsW = (sheet as any).frozenColsWidth;
        this.frozenRowsH = (sheet as any).frozenRowsHeight;
    }

    // ─── 列坐标转换 ───────────────────────────────────────

    /**
     * 列左边缘 → 视口 X 坐标
     *
     * 自动处理冻结列：冻结列的 effectiveScrollX 为 0，
     * 因此冻结列始终显示在表头右侧，不随水平滚动移动。
     *
     * @param col - 列号
     * @returns 视口 X 坐标（列左边缘在 Canvas 上的位置）
     */
    colToViewX(col: number): number {
        const effectiveSx = col < this.fixedCols ? 0 : this.scrollX;
        return this.headerW + this.rc.getColX(col) - effectiveSx;
    }

    /**
     * 列右边缘 → 视口 X 坐标
     *
     * @param col - 列号
     * @returns 视口 X 坐标（列右边缘在 Canvas 上的位置）
     */
    colRightToViewX(col: number): number {
        return this.colToViewX(col) + this.rc.getColWidth(col);
    }

    /**
     * 视口 X 坐标 → 数据 X 坐标
     *
     * 自动判断是否在冻结列区域，选择对应的坐标转换路径：
     * - 冻结列区域：dataX = viewX - headerW（不加 scrollX）
     * - 非冻结区域：dataX = viewX - headerW + scrollX
     *
     * @param viewX - 视口 X 坐标（相对 Canvas 左上角）
     * @returns 数据 X 坐标（不含表头偏移）
     */
    viewXToDataX(viewX: number): number {
        const inFrozenCols = this.frozenColsW > 0 && viewX <= this.headerW + this.frozenColsW;
        return inFrozenCols ? viewX - this.headerW : viewX - this.headerW + this.scrollX;
    }

    /**
     * 视口 X 坐标 → 列号（命中检测）
     *
     * @param viewX - 视口 X 坐标（相对 Canvas 左上角）
     * @returns 列号
     */
    viewXToCol(viewX: number): number {
        return this.rc.colAt(this.viewXToDataX(viewX));
    }

    /**
     * 列右边缘 → 数据 X 坐标
     *
     * @param col - 列号
     * @returns 数据 X 坐标（列右边缘，不含表头偏移）
     */
    colRightToDataX(col: number): number {
        return this.rc.getColX(col) + this.rc.getColWidth(col);
    }

    // ─── 行坐标转换 ───────────────────────────────────────

    /**
     * 行顶边缘 → 视口 Y 坐标
     *
     * 自动处理冻结行：冻结行的 effectiveScrollY 为 0，
     * 因此冻结行始终显示在表头下方，不随垂直滚动移动。
     *
     * @param row - 行号
     * @returns 视口 Y 坐标（行顶边缘在 Canvas 上的位置）
     */
    rowToViewY(row: number): number {
        const effectiveSy = this.#isFrozenRow(row) ? 0 : this.scrollY;
        return this.headerH + this.rc.getRowY(row) - effectiveSy;
    }

    /**
     * 行底边缘 → 视口 Y 坐标
     *
     * @param row - 行号
     * @returns 视口 Y 坐标（行底边缘在 Canvas 上的位置）
     */
    rowBottomToViewY(row: number): number {
        return this.rowToViewY(row) + this.rc.getRowHeight(row);
    }

    /**
     * @private 私有方法 - 判断行是否在冻结区域
     *
     * @param row - 行号
     * @returns 是否为冻结行
     */
    #isFrozenRow(row: number): boolean {
        return row < this.fixedRows;
    }

    /**
     * 视口 Y 坐标 → 数据 Y 坐标
     *
     * @param viewY - 视口 Y 坐标（相对 Canvas 左上角）
     * @returns 数据 Y 坐标（不含表头偏移）
     */
    viewYToDataY(viewY: number): number {
        const inFrozenRows = this.frozenRowsH > 0 && viewY <= this.headerH + this.frozenRowsH;
        return inFrozenRows ? viewY - this.headerH : viewY - this.headerH + this.scrollY;
    }

    /**
     * 视口 Y 坐标 → 行号（命中检测）
     *
     * @param viewY - 视口 Y 坐标（相对 Canvas 左上角）
     * @returns 行号
     */
    viewYToRow(viewY: number): number {
        return this.rc.rowAt(this.viewYToDataY(viewY));
    }

    /**
     * 行底边缘 → 数据 Y 坐标
     *
     * @param row - 行号
     * @returns 数据 Y 坐标（行底边缘，不含表头偏移）
     */
    rowBottomToDataY(row: number): number {
        return this.rc.getRowY(row) + this.rc.getRowHeight(row);
    }

    // ─── 单元格矩形 ───────────────────────────────────────

    /**
     * 单元格 → 视口矩形
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 视口矩形（Canvas 坐标）
     */
    cellToViewRect(row: number, col: number): ViewRect {
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
     * @param merge - 合并信息
     * @returns 视口矩形（Canvas 坐标）
     */
    mergeToViewRect(merge: MergeInfo): ViewRect {
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
     * @param col - 列号
     * @returns 是否为冻结列
     */
    isInFrozenCols(col: number): boolean {
        return col < this.fixedCols;
    }

    /**
     * 判断行是否在冻结区域
     *
     * @param row - 行号
     * @returns 是否为冻结行
     */
    isInFrozenRows(row: number): boolean {
        return row < this.fixedRows;
    }

    /**
     * 判断视口 X 坐标是否落在冻结列区域
     *
     * @param viewX - 视口 X 坐标
     * @returns 是否在冻结列区域
     */
    isViewXInFrozenCols(viewX: number): boolean {
        return this.frozenColsW > 0 && viewX <= this.headerW + this.frozenColsW;
    }

    /**
     * 判断视口 Y 坐标是否落在冻结行区域
     *
     * @param viewY - 视口 Y 坐标
     * @returns 是否在冻结行区域
     */
    isViewYInFrozenRows(viewY: number): boolean {
        return this.frozenRowsH > 0 && viewY <= this.headerH + this.frozenRowsH;
    }

    /**
     * 判断单元格是否在可视区域内
     *
     * 分别判断冻结区域和非冻结区域的可见性：
     * - 冻结列/行：始终可见，只需判断坐标是否在冻结区域范围内
     * - 非冻结列/行：需要判断是否在滚动后的可视区域内
     *
     * @param row - 行号
     * @param col - 列号
     * @param canvasW - Canvas 逻辑宽度（CSS 像素）
     * @param canvasH - Canvas 逻辑高度（CSS 像素）
     * @param tabH - Sheet 标签栏高度（像素）
     * @returns 单元格是否可见
     */
    isCellVisible(row: number, col: number, canvasW: number, canvasH: number, tabH: number = 0): boolean {
        const dataViewW = canvasW - this.headerW - this.frozenColsW;
        const dataViewH = canvasH - this.headerH - this.frozenRowsH - tabH;

        const cellX = this.rc.getColX(col);
        const cellY = this.rc.getRowY(row);
        const cellW = this.rc.getColWidth(col);
        const cellH = this.rc.getRowHeight(row);

        let outOfView: boolean;
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
