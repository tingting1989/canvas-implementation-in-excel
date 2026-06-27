/**
 * 单元格渲染上下文（v1.1 - 支持双轨行列号体系）
 *
 * 封装 Canvas 渲染所需的所有信息，作为 render() 方法的参数传递。
 * 提供统一的接口，避免暴露内部复杂结构。
 *
 * ⭐ v1.1 核心改进：
 * - 双轨行列号体系：row/col（页面行号）+ realRow/realCol（实际行号）
 * - Sheet 引用：支持高级场景的跨单元格数据访问
 * - PageInfo 对象：封装分页和冻结状态信息
 * - 转换方法：提供行列号双向转换工具
 *
 * @module types/CellRenderContext
 */

export class CellRenderContext {
    /**
     * 创建渲染上下文
     *
     * @param {object} params
     * @param {CanvasRenderingContext2D} params.ctx - Canvas 2D 上下文（瓦片离屏 canvas）
     * @param {number} params.x - 单元格左上角 X 坐标（瓦片局部坐标）
     * @param {number} params.y - 单元格左上角 Y 坐标（瓦片局部坐标）
     * @param {number} params.width - 单元格宽度（像素）
     * @param {number} params.height - 单元格高度（像素）
     * @param {*} params.value - 原始单元格值
     * @param {string} params.displayValue - 格式化后的显示文本
     * @param {object} params.style - 解析后的最终样式对象
     * @param {object|null} params.sheet - Sheet 工作表实例（高级场景必需）⭐ 新增
     * @param {number} params.row - 页面行号（显示行号，受冻结/筛选/分页影响）
     * @param {number} params.col - 页面列号（显示列号，受隐藏列影响）
     * @param {number} [params.realRow] - 实际行号（真实数据行号）⭐ 新增
     * @param {number} [params.realCol] - 实际列号（真实数据列号）⭐ 新增
     * @param {boolean} [params.isSelected=false] - 是否被选中
     * @param {boolean} [params.isDisabled=false] - 是否禁用
     * @param {boolean} [params.isMerged=false] - 是否为合并单元格
     * @param {object|null} [params.mergeInfo=null] - 合并区域信息
     * @param {object|null} [params.pageInfo=null] - 分页/冻结信息 ⭐ 新增
     */
    constructor({
        ctx,
        x,
        y,
        width,
        height,
        value,
        displayValue,
        style,
        sheet = null,
        row,
        col,
        realRow = null,
        realCol = null,
        isSelected = false,
        isDisabled = false,
        isMerged = false,
        mergeInfo = null,
        pageInfo = null,
    }) {
        this._ctx = ctx;
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
        this._value = value;
        this._displayValue = displayValue;
        this._style = style;

        // ★★★ Sheet 引用（高级场景必需）★★★
        this._sheet = sheet;

        // ★★★ 双轨行列号体系 ★★★
        this._row = row;
        this._col = col;
        this._realRow = realRow !== null ? realRow : row; // 默认回退到页面行号
        this._realCol = realCol !== null ? realCol : col; // 默认回退到页面列号

        this._isSelected = isSelected;
        this._isDisabled = isDisabled;
        this._isMerged = isMerged;
        this._mergeInfo = mergeInfo;

        // ★★★ 分页/冻结信息 ★★★
        this._pageInfo = pageInfo;
    }

    // ========== 基础属性（只读） ==========

    get ctx() {
        return this._ctx;
    }

    get x() {
        return this._x;
    }

    get y() {
        return this._y;
    }

    get width() {
        return this._width;
    }

    get height() {
        return this._height;
    }

    get value() {
        return this._value;
    }

    get displayValue() {
        return this._displayValue;
    }

    get style() {
        return this._style;
    }

    get sheet() {
        return this._sheet;
    }

    // ========== 行列号体系（双轨制） ==========

    /**
     * 页面行号（显示行号，受冻结/筛选/分页影响）
     * 用于视觉定位和UI布局
     */
    get row() {
        return this._row;
    }

    /**
     * 页面列号（显示列号，受隐藏列影响）
     * 用于视觉定位和UI布局
     */
    get col() {
        return this._col;
    }

    /**
     * 实际行号（真实数据行号，不受显示状态影响）
     * 用于数据访问、公式计算、跨系统通信
     *
     * ⭐ 推荐在所有数据操作中使用此属性
     */
    get realRow() {
        return this._realRow;
    }

    /**
     * 实际列号（真实数据列号，不受显示状态影响）
     * 用于数据访问、公式计算、跨系统通信
     *
     * ⭐ 推荐在所有数据操作中使用此属性
     */
    get realCol() {
        return this._realCol;
    }

    // ========== 状态属性 ==========

    get isSelected() {
        return this._isSelected;
    }

    get isDisabled() {
        return this._isDisabled;
    }

    get isMerged() {
        return this._isMerged;
    }

    get mergeInfo() {
        return this._mergeInfo;
    }

    /**
     * 分页/冻结信息对象
     *
     * @returns {object|null}
     * @property {boolean} isPaged - 是否处于分页模式
     * @property {number} currentPage - 当前页码（从0开始）
     * @property {number} pageSize - 每页行数
     * @property {number} frozenRowCount - 冻结行数
     * @property {number} frozenColCount - 冻结列数
     * @property {boolean} isInFrozenArea - 当前单元格是否在冻结区域内
     */
    get pageInfo() {
        return this._pageInfo;
    }

    // ========== 转换方法 ==========

    /**
     * 将页面行号转换为实际行号
     *
     * 如果有Sheet引用，优先使用Sheet的转换方法；
     * 否则使用简单的偏移量估算（可能不准确）。
     *
     * @param {number} pageRow - 页面行号
     * @returns {number} 实际行号
     */
    toRealRow(pageRow) {
        if (this._sheet && typeof this._sheet.toRealRow === "function") {
            return this._sheet.toRealRow(pageRow);
        }

        if (this._pageInfo?.isPaged) {
            const offset = (this._pageInfo.currentPage || 0) * (this._pageInfo.pageSize || 0);
            const frozenOffset = this._pageInfo.frozenRowCount || 0;
            return pageRow + offset + frozenOffset;
        }

        return pageRow;
    }

    /**
     * 将实际行号转换为页面行号
     *
     * @param {number} realRow - 实际行号
     * @returns {number} 页面行号
     */
    toPageRow(realRow) {
        if (this._sheet && typeof this._sheet.toPageRow === "function") {
            return this._sheet.toPageRow(realRow);
        }

        if (this._pageInfo?.isPaged) {
            const offset = (this._pageInfo.currentPage || 0) * (this._pageInfo.pageSize || 0);
            const frozenOffset = this._pageInfo.frozenRowCount || 0;
            return realRow - offset - frozenOffset;
        }

        return realRow;
    }

    /**
     * 将页面列号转换为实际列号
     *
     * @param {number} pageCol - 页面列号
     * @returns {number} 实际列号
     */
    toRealCol(pageCol) {
        if (this._sheet && typeof this._sheet.toRealCol === "function") {
            return this._sheet.toRealCol(pageCol);
        }
        return pageCol;
    }

    /**
     * 将实际列号转换为页面列号
     *
     * @param {number} realCol - 实际列号
     * @returns {number} 页面列号
     */
    toPageCol(realCol) {
        if (this._sheet && typeof this._sheet.toPageCol === "function") {
            return this._sheet.toPageCol(realCol);
        }
        return realCol;
    }

    // ========== 辅助方法 ==========

    /**
     * 获取单元格内边距（从全局配置读取）
     * @returns {number}
     */
    getPadding(sheet) {
        return sheet?.cellPadding || 6;
    }

    /**
     * 获取文本水平居中位置
     * @returns {number}
     */
    getCenterX() {
        return Math.round(this._x + this._width / 2);
    }

    /**
     * 获取文本垂直居中位置
     * @returns {number}
     */
    getCenterY() {
        return Math.round(this._y + this._height / 2);
    }

    /**
     * 绘制圆角矩形（辅助方法）
     *
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {number} radius - 圆角半径
     */
    drawRoundedRect(x, y, w, h, radius) {
        const ctx = this._ctx;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * 检查当前单元格是否在冻结区域内
     * @returns {boolean}
     */
    isInFrozenArea() {
        if (!this._pageInfo) return false;
        return this._pageInfo.isInFrozenArea || false;
    }

    /**
     * 检查当前是否处于分页模式
     * @returns {boolean}
     */
    isPagedMode() {
        return this._pageInfo?.isPaged || false;
    }
}
