/**
 * 单元格渲染上下文（v3.0 - 纯数据容器）
 *
 * 封装 Canvas 渲染所需的所有信息，作为 render() 方法的参数传递。
 * 提供统一的接口，避免暴露内部复杂结构。
 *
 * ## 设计原则
 *
 * **单一职责**：CellRenderContext 是纯只读数据容器，不实现任何业务逻辑。
 * 行号直接使用实际行号，无需转换。
 *
 * ## 使用方式
 *
 * ```javascript
 * render(context) {
 *     const row = context.row;
 *     const col = context.col;
 *     // 直接使用行号访问数据...
 * }
 * ```
 *
 * @module types/CellRenderContext
 */
import { CONFIG } from "@/constants/config";
import { calcCenteredTextY, getAreaCenter } from "@/utils/canvasUtils";

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
     * @param {number} params.row - 行号
     * @param {number} params.col - 列号
     * @param {boolean} [params.isSelected=false] - 是否被选中
     * @param {boolean} [params.isDisabled=false] - 是否禁用
     * @param {boolean} [params.isMerged=false] - 是否为合并单元格
     * @param {object|null} [params.mergeInfo=null] - 合并区域信息
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
        isSelected = false,
        isDisabled = false,
        isMerged = false,
        mergeInfo = null,
    }) {
        this._ctx = ctx;
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
        this._value = value;
        this._displayValue = displayValue;
        this._style = style;

        this._sheet = sheet;

        this._row = row;
        this._col = col;

        this._isSelected = isSelected;
        this._isDisabled = isDisabled;
        this._isMerged = isMerged;
        this._mergeInfo = mergeInfo;
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

    // ========== 行列号 ==========

    get row() {
        return this._row;
    }

    get col() {
        return this._col;
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
     * 获取文本垂直居中位置（几何中心）
     *
     * 适用于：
     * - 配合 ctx.textBaseline = "middle" 使用
     * - 绘制图形、图标等非文字元素
     *
     * @returns {number} 几何中心 Y 坐标
     */
    getCenterY() {
        return Math.round(this._y + this._height / 2);
    }

    /**
     * 获取 Canvas fillText 的垂直居中基线 Y 坐标
     *
     * 与 getCenterY() 不同，此方法考虑了字体基线偏移，
     * 直接用于 ctx.fillText(text, x, y) 的 y 参数。
     *
     * 适用场景：
     * - 单元格文字渲染
     * - 表头文字渲染
     * - 任何需要 fillText 垂直居中的场景
     *
     * @param {string|number} [fontOrSize] - CSS font 字符串 或 字体大小（px）
     *                                      默认使用样式的 fontSize
     * @returns {number} 带基线偏移的 textY 坐标
     *
     * @example
     * // 在自定义渲染器中使用
     * render(context) {
     *     const { ctx, displayValue } = context;
     *     ctx.textAlign = "center";
     *     // 不需要设置 textBaseline，getBaselineY() 已处理偏移
     *     ctx.fillText(displayValue, context.getCenterX(), context.getBaselineY());
     * }
     */
    getBaselineY(fontOrSize) {
        if (fontOrSize === undefined) {
            fontOrSize = this._style?.fontSize || CONFIG.DEFAULT_FONT_SIZE || 14;
        }
        return calcCenteredTextY(this._y, this._height, fontOrSize);
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
}
