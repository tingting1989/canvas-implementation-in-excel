/**
 * 单元格渲染上下文（CellRenderContext）
 *
 * 封装 Canvas 渲染单元格所需的全部信息，作为自定义列类型 render() 方法的
 * 唯一参数传递。是渲染管线中「渲染器」与「数据源」之间的解耦层。
 *
 * ## 设计原则
 *
 * - **纯只读数据容器**：不实现任何业务逻辑，仅持有和暴露数据
 * - **坐标系统**：x/y 为瓦片局部坐标（非视口全局坐标），由 TileRenderer 在创建时计算
 * - **行号直接使用实际行号**：无需额外转换，可直接用于访问 Sheet 数据
 *
 * ## 在渲染管线中的位置
 *
 * ```
 * TileRenderer.drawCell()
 *   → new CellRenderContext({ ctx, x, y, width, height, value, ... })
 *   → columnType.render(context)   ← 自定义渲染器在此消费 context
 * ```
 *
 * ## 属性分类
 *
 * | 分类       | 属性                                              | 说明                     |
 * |------------|---------------------------------------------------|--------------------------|
 * | Canvas     | ctx                                               | 瓦片离屏 Canvas 2D 上下文 |
 * | 位置尺寸   | x, y, width, height                               | 瓦片局部坐标 + 像素尺寸   |
 * | 数据       | value, displayValue, style                        | 原始值 / 格式化文本 / 样式 |
 * | 行列       | row, col                                          | 实际行列号               |
 * | 状态       | isSelected, isDisabled, isMerged, mergeInfo       | 选中/禁用/合并状态       |
 * | 上下文     | sheet                                             | 工作表实例（高级场景）    |
 *
 * ## 辅助方法
 *
 * | 方法              | 用途                                           |
 * |-------------------|------------------------------------------------|
 * | getPadding()      | 获取单元格内边距                               |
 * | getCenterX()      | 获取水平居中 X 坐标                            |
 * | getCenterY()      | 获取垂直几何中心 Y 坐标（图形/图标居中）       |
 * | getBaselineY()    | 获取文字基线 Y 坐标（fillText 垂直居中）       |
 * | drawRoundedRect() | 绘制圆角矩形路径（仅路径，需手动 fill/stroke） |
 *
 * ## 使用示例
 *
 * ```javascript
 * // 在自定义列类型渲染器中使用
 * render(context) {
 *     const { ctx, x, y, width, height, value } = context;
 *     // 使用辅助方法定位
 *     ctx.textAlign = "center";
 *     ctx.fillText(context.displayValue, context.getCenterX(), context.getBaselineY());
 *     // 使用辅助方法绘制圆角矩形
 *     context.drawRoundedRect(x + 2, y + 2, width - 4, height - 4, 4);
 *     ctx.fill();
 * }
 * ```
 *
 * @module types/CellRenderContext
 * @see BaseColumnType 自定义列类型基类，render(context) 接收本类实例
 * @see TileRenderer 瓦片渲染器，创建 CellRenderContext 实例
 */

import { CONFIG } from "@/constants/config";
import { calcCenteredTextY, getAreaCenter } from "@/utils/canvasUtils";

export class CellRenderContext {
    /**
     * 创建渲染上下文
     *
     * 所有属性通过构造函数一次性注入，之后不可修改（只读）。
     * 坐标为瓦片局部坐标，原点为瓦片左上角。
     *
     * @param {object} params - 构造参数
     * @param {CanvasRenderingContext2D} params.ctx - Canvas 2D 上下文（瓦片离屏 canvas）
     * @param {number} params.x - 单元格左上角 X 坐标（瓦片局部坐标，像素）
     * @param {number} params.y - 单元格左上角 Y 坐标（瓦片局部坐标，像素）
     * @param {number} params.width - 单元格宽度（像素）
     * @param {number} params.height - 单元格高度（像素）
     * @param {*} params.value - 原始单元格值（未格式化）
     * @param {string} params.displayValue - 格式化后的显示文本（由 columnType.format() 生成）
     * @param {object} params.style - 解析后的最终样式对象（含字体、颜色、对齐等）
     * @param {object|null} [params.sheet=null] - Sheet 工作表实例（高级场景，如需访问其他单元格数据）
     * @param {number} params.row - 行号（实际行号，0-based）
     * @param {number} params.col - 列号（实际列号，0-based）
     * @param {boolean} [params.isSelected=false] - 单元格是否处于选中状态
     * @param {boolean} [params.isDisabled=false] - 单元格是否处于禁用状态
     * @param {boolean} [params.isMerged=false] - 单元格是否为合并单元格的一部分
     * @param {object|null} [params.mergeInfo=null] - 合并区域信息（含 startRow/endRow/startCol/endCol）
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
        /** @private @type {CanvasRenderingContext2D} Canvas 2D 上下文 */
        this._ctx = ctx;
        /** @private @type {number} 单元格左上角 X 坐标（瓦片局部坐标） */
        this._x = x;
        /** @private @type {number} 单元格左上角 Y 坐标（瓦片局部坐标） */
        this._y = y;
        /** @private @type {number} 单元格宽度 */
        this._width = width;
        /** @private @type {number} 单元格高度 */
        this._height = height;
        /** @private @type {*} 原始单元格值 */
        this._value = value;
        /** @private @type {string} 格式化后的显示文本 */
        this._displayValue = displayValue;
        /** @private @type {object} 解析后的最终样式对象 */
        this._style = style;

        /** @private @type {object|null} 工作表实例 */
        this._sheet = sheet;

        /** @private @type {number} 行号 */
        this._row = row;
        /** @private @type {number} 列号 */
        this._col = col;

        /** @private @type {boolean} 是否选中 */
        this._isSelected = isSelected;
        /** @private @type {boolean} 是否禁用 */
        this._isDisabled = isDisabled;
        /** @private @type {boolean} 是否合并单元格 */
        this._isMerged = isMerged;
        /** @private @type {object|null} 合并区域信息 */
        this._mergeInfo = mergeInfo;
    }

    // ========== 基础属性（只读） ==========

    /** @type {CanvasRenderingContext2D} Canvas 2D 上下文（瓦片离屏 canvas） */
    get ctx() {
        return this._ctx;
    }

    /** @type {number} 单元格左上角 X 坐标（瓦片局部坐标，像素） */
    get x() {
        return this._x;
    }

    /** @type {number} 单元格左上角 Y 坐标（瓦片局部坐标，像素） */
    get y() {
        return this._y;
    }

    /** @type {number} 单元格宽度（像素） */
    get width() {
        return this._width;
    }

    /** @type {number} 单元格高度（像素） */
    get height() {
        return this._height;
    }

    /** @type {*} 原始单元格值（未格式化） */
    get value() {
        return this._value;
    }

    /** @type {string} 格式化后的显示文本 */
    get displayValue() {
        return this._displayValue;
    }

    /** @type {object} 解析后的最终样式对象（含字体、颜色、对齐等） */
    get style() {
        return this._style;
    }

    /** @type {object|null} 工作表实例（高级场景，如需访问其他单元格数据） */
    get sheet() {
        return this._sheet;
    }

    // ========== 行列号 ==========

    /** @type {number} 行号（实际行号，0-based） */
    get row() {
        return this._row;
    }

    /** @type {number} 列号（实际列号，0-based） */
    get col() {
        return this._col;
    }

    // ========== 状态属性 ==========

    /** @type {boolean} 单元格是否处于选中状态 */
    get isSelected() {
        return this._isSelected;
    }

    /** @type {boolean} 单元格是否处于禁用状态 */
    get isDisabled() {
        return this._isDisabled;
    }

    /** @type {boolean} 单元格是否为合并单元格的一部分 */
    get isMerged() {
        return this._isMerged;
    }

    /** @type {object|null} 合并区域信息（含 startRow/endRow/startCol/endCol） */
    get mergeInfo() {
        return this._mergeInfo;
    }

    // ========== 辅助方法 ==========

    /**
     * 获取单元格内边距
     *
     * 优先使用 Sheet 级别的 cellPadding 配置，回退到全局 CONFIG.CELL_PADDING。
     *
     * @param {object} [sheet] - 工作表实例（可选，优先读取其 cellPadding）
     * @returns {number} 内边距值（像素）
     */
    getPadding(sheet) {
        return sheet?.cellPadding || CONFIG.CELL_PADDING;
    }

    /**
     * 获取单元格水平居中 X 坐标
     *
     * 计算公式：x + width / 2，结果四舍五入取整。
     *
     * @returns {number} 水平居中 X 坐标（像素，整数）
     */
    getCenterX() {
        return Math.round(this._x + this._width / 2);
    }

    /**
     * 获取单元格垂直几何中心 Y 坐标
     *
     * 计算公式：y + height / 2，结果四舍五入取整。
     *
     * 适用场景：
     * - 配合 ctx.textBaseline = "middle" 使用
     * - 绘制图形、图标、复选框等非文字元素的垂直居中定位
     *
     * 注意：如果需要使用 ctx.fillText() 绘制文字并垂直居中，
     * 应使用 getBaselineY() 而非本方法，因为文字渲染需要考虑基线偏移。
     *
     * @returns {number} 垂直几何中心 Y 坐标（像素，整数）
     */
    getCenterY() {
        return Math.round(this._y + this._height / 2);
    }

    /**
     * 获取 Canvas fillText 的垂直居中基线 Y 坐标
     *
     * 与 getCenterY() 的区别：
     * - getCenterY() 返回几何中心，适用于图形/图标居中
     * - getBaselineY() 返回带字体基线偏移的 Y 坐标，适用于 fillText 文字居中
     *
     * 内部调用 calcCenteredTextY() 计算基线偏移，考虑了字体大小和
     * 文字基线（ascent/descent）的视觉修正。
     *
     * @param {string|number} [fontOrSize] - CSS font 字符串（如 "12px Arial"）或字体大小（px 数值）
     *                                      默认使用 style.fontSize 或 CONFIG.DEFAULT_FONT_SIZE
     * @returns {number} 带基线偏移的 textY 坐标，可直接用于 ctx.fillText(text, x, textY)
     *
     * @example
     * // 在自定义渲染器中使用
     * render(context) {
     *     const { ctx, displayValue } = context;
     *     ctx.textAlign = "center";
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
     * 绘制圆角矩形路径
     *
     * 仅创建路径（beginPath → closePath），不执行 fill 或 stroke。
     * 调用方需在调用后手动执行 ctx.fill() 或 ctx.stroke()。
     *
     * 使用二次贝塞尔曲线（quadraticCurveTo）绘制四个圆角，
     * 确保圆角过渡平滑。
     *
     * @param {number} x - 矩形左上角 X 坐标
     * @param {number} y - 矩形左上角 Y 坐标
     * @param {number} w - 矩形宽度
     * @param {number} h - 矩形高度
     * @param {number} radius - 圆角半径（像素）
     */
    drawRoundedRect(x, y, w, h, radius) {
        const ctx = this._ctx;
        ctx.beginPath();
        // 从左上角圆弧结束点开始，顺时针绘制
        ctx.moveTo(x + radius, y);
        // 上边：左上角结束点 → 右上角开始点
        ctx.lineTo(x + w - radius, y);
        // 右上角圆弧
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        // 右边：右上角结束点 → 右下角开始点
        ctx.lineTo(x + w, y + h - radius);
        // 右下角圆弧
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        // 下边：右下角结束点 → 左下角开始点
        ctx.lineTo(x + radius, y + h);
        // 左下角圆弧
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        // 左边：左下角结束点 → 左上角开始点
        ctx.lineTo(x, y + radius);
        // 左上角圆弧
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}
