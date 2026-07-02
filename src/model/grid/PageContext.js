/**
 * 分页上下文（PageContext）
 *
 * 集中管理分页模式下的行号与像素坐标转换，消除分散在
 * RowColManager / Sheet / ViewportTransform / TileRenderer /
 * FrozenLayer 等多处的手写行号转换逻辑。
 *
 * ## 设计目标
 *
 * 1. **命名自解释**：方法名明确标注坐标体系（pageRow vs realRow，pageY vs globalY）
 * 2. **单点转换**：所有 pageRow ↔ realRow 转换集中在此
 * 3. **消除双态隐式 API**：替换 RowColManager 中依赖 pageStartRow 隐式切换的
 *    getRowY() / getRowHeight() / rowAt() / totalHeight / rowCount
 * 4. **可测试**：PageContext 是无副作用的纯包装，可独立单测
 *
 * ## 坐标体系
 *
 * - **页面行号 (pageRow)**：分页模式下用户看到的行号，从 0 开始
 * - **实际行号 (realRow)**：数据在 cellStore 中的真实行号（全局）
 * - **页面 Y (pageY)**：相对当前页顶部的像素偏移
 * - **全局 Y (globalY)**：相对全部数据顶部的像素偏移
 * - **列号**：分页只影响行，列号无需转换
 *
 * ## 使用方式
 *
 * ```js
 * const pc = sheet.pageContext;
 *
 * // 行号转换
 * const realRow = pc.toRealRow(pageRow);
 * const pageRow = pc.toPageRow(realRow);
 *
 * // 页面坐标系（用于渲染常规单元格）
 * const y = pc.getPageRowY(pageRow);
 * const h = pc.getPageRowHeight(pageRow);
 * const row = pc.pageRowAt(pageY);
 *
 * // 全局坐标系（用于冻结行、数据读写）
 * const globalY = pc.getRealRowY(realRow);
 * const globalH = pc.getRealRowHeight(realRow);
 * const realRow = pc.realRowAt(globalY);
 *
 * // 页面视图尺寸
 * const viewH = pc.pageViewHeight;   // 替代 rc.totalHeight
 * const viewRows = pc.pageViewRowCount; // 替代 rc.rowCount
 * ```
 */
export class PageContext {
    /** @type {import("./RowColManager.js").RowColManager} */
    #rc;

    /**
     * @param {import("./RowColManager.js").RowColManager} rowColManager
     */
    constructor(rowColManager) {
        this.#rc = rowColManager;
    }

    // ─── 分页状态 ───────────────────────────────────────

    /** 分页模式是否激活 */
    get isActive() {
        return this.#rc.pageStartRow >= 0 && this.#rc.pageEndRow > this.#rc.pageStartRow;
    }

    /** 当前页起始真实行号（-1 表示未分页） */
    get pageStart() {
        return this.#rc.pageStartRow;
    }

    /** 当前页结束真实行号（不含，-1 表示未分页） */
    get pageEnd() {
        return this.#rc.pageEndRow;
    }

    // ─── 行号转换 ───────────────────────────────────────

    /**
     * 页面行号 → 实际行号
     * 非分页模式下返回原值（恒等映射）
     * @param {number} pageRow
     * @returns {number}
     */
    toRealRow(pageRow) {
        return this.isActive ? this.#rc.pageStartRow + pageRow : pageRow;
    }

    /**
     * 将输入行号转为页面行号（实际行号 → 页面行号）
     *
     * ## 守卫逻辑
     *
     * 若 realRow < pageStartRow，说明输入本身就是页面相对行号
     * （如 HeaderRenderer 传入的已转换行号），直接返回原值以避免二次转换。
     *
     * 这与旧 ViewportTransform.#adaptRowForPagination 的行为一致：
     *   if (row >= pageStartRow) return row - pageStartRow; return row;
     *
     * 非分页模式下返回原值（恒等映射）。
     *
     * @param {number} realRow - 实际行号或页面行号（由守卫自动判断）
     * @returns {number} 页面行号
     */
    toPageRow(realRow) {
        if (!this.isActive) return realRow;
        // 守卫：若输入行号 < pageStartRow，说明已是页面相对坐标，不重复减去
        if (realRow < this.#rc.pageStartRow) return realRow;
        return realRow - this.#rc.pageStartRow;
    }

    // ─── 页面相对坐标系（用于渲染常规单元格、滚动边界）───

    /**
     * 页面行号的像素 Y 坐标（相对当前页顶部）
     * @param {number} pageRow - 页面行号
     * @returns {number}
     */
    getPageRowY(pageRow) {
        // 委托给 RowColManager，它在分页模式下自动做 internal offset
        return this.#rc.getRowY(pageRow);
    }

    /**
     * 页面行号的行高
     * @param {number} pageRow - 页面行号
     * @returns {number}
     */
    getPageRowHeight(pageRow) {
        return this.#rc.getRowHeight(pageRow);
    }

    /**
     * 页面相对 Y 坐标 → 页面行号
     * @param {number} pageY - 相对当前页顶部的像素偏移
     * @returns {number} 页面行号
     */
    pageRowAt(pageY) {
        return this.#rc.rowAt(pageY);
    }

    /** 页面视图总高度（分页模式下 = 当前页高度，否则 = 全局总高度） */
    get pageViewHeight() {
        return this.#rc.totalHeight;
    }

    /** 页面视图总行数（分页模式下 = 当前页行数，否则 = 全局行数） */
    get pageViewRowCount() {
        return this.#rc.rowCount;
    }

    // ─── 全局坐标系（用于冻结行、数据存储）───────────────

    /**
     * 实际行号的全局像素 Y 坐标（不受分页影响）
     * @param {number} realRow - 实际行号
     * @returns {number}
     */
    getRealRowY(realRow) {
        return this.#rc.getRealRowY(realRow);
    }

    /**
     * 实际行号的行高
     * @param {number} realRow - 实际行号
     * @returns {number}
     */
    getRealRowHeight(realRow) {
        return this.#rc.getRealRowHeight(realRow);
    }

    /**
     * 全局 Y 坐标 → 实际行号
     * @param {number} globalY - 全局像素 Y 坐标
     * @returns {number} 实际行号
     */
    realRowAt(globalY) {
        return this.#rc.rawRowAt(globalY);
    }

    // ─── 列坐标（不受分页影响，透传）─────────────────────

    /**
     * 列左边缘的像素 X 坐标
     * @param {number} col - 列号
     * @returns {number}
     */
    getColX(col) {
        return this.#rc.getColX(col);
    }

    /**
     * 列宽
     * @param {number} col - 列号
     * @returns {number}
     */
    getColWidth(col) {
        return this.#rc.getColWidth(col);
    }

    /**
     * 全局 X 坐标 → 列号
     * @param {number} x - 全局像素 X 坐标
     * @returns {number}
     */
    colAt(x) {
        return this.#rc.colAt(x);
    }

    /** 总列数 */
    get colCount() {
        return this.#rc.colCount;
    }

    /** 总宽度 */
    get totalWidth() {
        return this.#rc.totalWidth;
    }

    // ─── 可见范围计算 ────────────────────────────────────

    /**
     * 获取视口内可见的行列范围
     * @param {number} viewX - 视口 X 偏移
     * @param {number} viewY - 视口 Y 偏移（页面相对坐标）
     * @param {number} viewW - 视口宽度
     * @param {number} viewH - 视口高度
     * @returns {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }}
     */
    getVisibleRange(viewX, viewY, viewW, viewH) {
        return this.#rc.getVisibleRange(viewX, viewY, viewW, viewH);
    }

    // ─── 与 RowColManager 的兼容性 ─────────────────────

    /**
     * 获取底层的 RowColManager 实例（仅用于需要直接访问的场景）
     * @returns {import("./RowColManager.js").RowColManager}
     */
    get raw() {
        return this.#rc;
    }
}
