/**
 * 单元格渲染上下文（v2.0 - 纯数据容器 + PageContext 集成）
 *
 * 封装 Canvas 渲染所需的所有信息，作为 render() 方法的参数传递。
 * 提供统一的接口，避免暴露内部复杂结构。
 *
 * ## v2.0 核心改进（破坏性变更）
 *
 * - ❌ **移除**：toRealRow() / toPageRow() / toRealCol() / toPageCol() 转换方法
 * - ✅ **新增**：pageContext 属性（PageContext 引用，权威转换源）
 * - ✅ **保留**：pageInfo 属性（仅用于简单状态查询）
 *
 * ## 设计原则
 *
 * **单一职责**：CellRenderContext 是纯只读数据容器，不实现任何业务逻辑。
 * 所有行号/坐标转换委托给 PageContext（Single Source of Truth）。
 *
 * ## 使用方式
 *
 * ```javascript
 * render(context) {
 *     const pc = context.pageContext;
 *
 *     if (pc) {
 *         const realRow = pc.toRealRow(context.row);
 *         const pageY = pc.getPageRowY(context.row);
 *     }
 *
 *     if (context.pageInfo?.isInFrozenArea) {
 *         // 简单状态检查...
 *     }
 * }
 * ```
 *
 * @module types/CellRenderContext
 */
import {CONFIG} from "@/constants/config";

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
     * @param {object|null} params.sheet - Sheet 工作表实例（高级场景必需）
     * @param {number} params.row - 页面行号（显示行号，受冻结/筛选/分页影响）
     * @param {number} params.col - 页面列号（显示列号，受隐藏列影响）
     * @param {number} [params.realRow] - 实际行号（真实数据行号）
     * @param {number} [params.realCol] - 实际列号（真实数据列号）
     * @param {boolean} [params.isSelected=false] - 是否被选中
     * @param {boolean} [params.isDisabled=false] - 是否禁用
     * @param {boolean} [params.isMerged=false] - 是否为合并单元格
     * @param {object|null} [params.mergeInfo=null] - 合并区域信息
     * @param {object|null} [params.pageInfo=null] - 分页/冻结状态信息（仅用于简单查询）
     * @param {import('../model/grid/PageContext.js').PageContext|null} [params.pageContext=null] - PageContext 实例（⭐ 行号转换的权威来源）
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
        pageContext = null,  // ★ v2.0 新增：PageContext 引用
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

        // ★★★ 分页/冻结状态信息（仅用于简单查询）★★★
        this._pageInfo = pageInfo;

        // ★★★ PageContext 引用（行号转换的权威来源）★★★
        this._pageContext = pageContext;
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
     * 分页/冻结信息对象（仅用于简单状态查询，不提供转换能力）
     *
     * ⚠️ 注意：此属性仅用于兼容性检查（如 isPaged、isInFrozenArea）。
     * 所有行号/坐标转换必须通过 `pageContext` 属性完成。
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

    /**
     * PageContext 引用（权威的行号转换源）⭐ 核心 API
     *
     * 提供 PageContext 完整的转换能力：
     * - **行号转换**：toRealRow() / toPageRow()
     * - **坐标转换**：getPageRowY() / getRealRowY() / pageRowAt() / realRowAt()
     * - **列坐标**：getColX() / getColWidth() / colAt()
     * - **状态查询**：isActive / pageStart / pageEnd
     *
     * @returns {import('../model/grid/PageContext.js').PageContext|null}
     *
     * @example
     * render(context) {
     *     const pc = context.pageContext;  // 获取 PageContext
     *
     *     if (pc) {
     *         const realRow = pc.toRealRow(context.row);       // 行号转换
     *         const pageY = pc.getPageRowY(context.row);        // 坐标转换
     *         const globalY = pc.getRealRowY(realRow);           // 全局坐标
     *
     *         console.log('分页模式:', pc.isActive);
     *         console.log('当前页范围:', pc.pageStart, '-', pc.pageEnd);
     *     }
     * }
     */
    get pageContext() {
        return this._pageContext;
    }

    // ========== 辅助方法 ==========

    /**
     * 获取单元格内边距（从全局配置读取）
     * @returns {number}
     */
    getPadding(sheet) {
        return sheet?.cellPadding || CONFIG.CELL_PADDING;
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