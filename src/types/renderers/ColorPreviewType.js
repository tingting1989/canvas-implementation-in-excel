/**
 * 颜色预览渲染器（ColorPreviewType）
 *
 * 将颜色值（hex / rgb / rgba / hsl / hsla）渲染为可视化的圆角颜色块，
 * 而非直接显示颜色文本。适用于需要直观展示颜色值的场景，
 * 如调色板、主题配置、数据可视化中的颜色标注等。
 *
 * ## 渲染效果
 *
 * - **有值**：在单元格中央绘制一个圆角正方形颜色块，填充色为解析后的颜色值
 * - **空值**：不绘制任何内容
 * - **边框**：默认绘制 1px 浅灰色边框，可通过 options.showBorder = false 关闭
 *
 * ## 值验证
 *
 * validate() 支持多种颜色格式的有效性检查：
 * - hex：#RGB、#RRGGBB、#RRGGBBAA
 * - rgb/rgba：rgb(r, g, b)、rgba(r, g, b, a)
 * - hsl/hsla：hsl(h, s%, l%)、hsla(h, s%, l%, a)
 * - CSS 命名颜色：red、blue、transparent 等
 *
 * ## 自定义选项（this.options）
 *
 * | 选项            | 默认值                              | 说明                       |
 * |-----------------|--------------------------------------|----------------------------|
 * | borderRadius    | CONFIG.COLOR_PREVIEW_BORDER_RADIUS   | 颜色块圆角半径（像素）     |
 * | showBorder      | true                                 | 是否显示颜色块边框         |
 *
 * ## 颜色标准化
 *
 * 内部使用 StyleConverter 的 toArgb / fromArgb 进行颜色值的标准化：
 * - 输入任意格式 → toArgb() → 8 位 ARGB 字符串 → fromArgb() → 标准 CSS 颜色格式
 * - 对于缺少 # 前缀的 hex 值（如 "FF0000"），自动补全后重试
 * - 无法解析的颜色值回退为 "transparent"，确保渲染不会报错
 *
 * @module types/renderers/ColorPreviewType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see StyleConverter 颜色转换工具，提供 toArgb / fromArgb 方法
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import { toArgb, fromArgb } from "../../shared/StyleConverter.js";

export class ColorPreviewType extends BaseColumnType {
    /** @type {string} 类型名称标识 */
    get name() {
        return "colorPreview";
    }

    /** @type {string} 关联的编辑器类型（颜色值使用文本编辑器输入） */
    get editorType() {
        return "text";
    }

    /**
     * 格式化颜色值为显示文本
     *
     * 直接将值转为字符串，不做任何颜色格式转换。
     * 实际的视觉展示由 render() 方法绘制颜色块完成。
     *
     * @param {*} value - 单元格值
     * @returns {string} 值的字符串表示
     */
    format(value) {
        return String(value ?? "");
    }

    /**
     * 验证颜色值是否有效
     *
     * 空值和 null/undefined 视为合法（允许单元格为空）。
     * 非空值通过 #isValidColor() 检查是否为可解析的颜色格式。
     *
     * @param {*} value - 待验证的值
     * @returns {true|string} true 表示有效，字符串表示错误信息
     */
    validate(value) {
        if (value === "" || value == null) return true;
        const str = String(value).trim();
        if (!this.#isValidColor(str)) return "无效的颜色值";
        return true;
    }

    /**
     * 自定义渲染方法：绘制颜色预览块
     *
     * 绘制流程：
     * 1. 解析颜色值，空值则跳过渲染
     * 2. 计算颜色块尺寸和位置（居中于单元格，四周留 padding）
     * 3. 绘制圆角矩形颜色块（填充色为标准化后的颜色值）
     * 4. 如果 showBorder 不为 false，绘制浅灰色边框
     *
     * 颜色块尺寸 = min(width - padding×2, height - padding×2)，
     * 确保在窄列或矮行中不会溢出，且保持正方形。
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {CanvasRenderingContext2D} context.ctx - Canvas 2D 上下文
     * @param {number} context.x - 单元格左上角 X 坐标
     * @param {number} context.y - 单元格左上角 Y 坐标
     * @param {number} context.width - 单元格宽度
     * @param {number} context.height - 单元格高度
     * @param {*} context.value - 单元格值（颜色字符串）
     */
    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const colorStr = String(value ?? "").trim();
        if (!colorStr) return;

        const padding = CONFIG.COLOR_PREVIEW_PADDING;
        // 颜色块取宽高各自减去双倍 padding 后的较小值，保持正方形
        const size = Math.min(width - padding * 2, height - padding * 2);
        // 居中定位
        const colorX = x + (width - size) / 2;
        const colorY = y + (height - size) / 2;
        const radius = this.options?.borderRadius || CONFIG.COLOR_PREVIEW_BORDER_RADIUS;

        // 第 1 步：绘制圆角矩形颜色块
        ctx.fillStyle = this.#normalizeColor(colorStr);
        context.drawRoundedRect(colorX, colorY, size, size, radius);
        ctx.fill();

        // 第 2 步：绘制边框（默认开启，可通过 options.showBorder = false 关闭）
        if (this.options?.showBorder !== false) {
            ctx.strokeStyle = CONFIG.COLOR_PREVIEW_BORDER_COLOR;
            ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
            context.drawRoundedRect(colorX, colorY, size, size, radius);
            ctx.stroke();
        }
    }

    /**
     * 验证颜色字符串是否为有效的 CSS 颜色值
     *
     * 利用 StyleConverter 的 toArgb() 方法进行验证：
     * - toArgb() 内部使用浏览器 API 或正则表达式解析颜色
     * - 如果成功返回 8 位 ARGB 字符串（如 "FFFF0000"），则颜色有效
     * - 如果抛出异常或返回值长度不为 8，则颜色无效
     *
     * 支持的颜色格式：
     * - hex：#RGB、#RRGGBB、#RRGGBBAA
     * - rgb/rgba：rgb(255, 0, 0)、rgba(255, 0, 0, 0.5)
     * - hsl/hsla：hsl(0, 100%, 50%)、hsla(0, 100%, 50%, 0.5)
     * - CSS 命名颜色：red、blue、transparent 等
     *
     * @param {string} color - 待验证的颜色字符串
     * @returns {boolean} 是否为有效颜色
     */
    #isValidColor(color) {
        if (!color || typeof color !== "string") return false;
        const trimmedColor = color.trim();
        if (trimmedColor === "") return false;

        try {
            const argb = toArgb(trimmedColor);
            if (argb && argb.length === 8) return true;
        } catch {
            // toArgb 解析失败，颜色无效
        }

        return false;
    }

    /**
     * 标准化颜色值为 Canvas 可用的 CSS 颜色字符串
     *
     * 将任意格式的颜色输入转换为标准 CSS 颜色格式，确保 Canvas 能正确渲染。
     * 转换流程：输入颜色 → toArgb() → 8 位 ARGB → fromArgb() → 标准 CSS 颜色。
     *
     * 回退策略（按优先级）：
     * 1. 直接使用 toArgb + fromArgb 标准化
     * 2. 对于缺少 # 前缀的 hex 值（如 "FF0000"、"F00"），自动补 # 后重试
     * 3. 所有尝试失败，返回 "transparent" 作为安全回退
     *
     * @param {string} color - 输入颜色字符串
     * @returns {string} 标准化后的 CSS 颜色字符串，或 "transparent"
     */
    #normalizeColor(color) {
        if (!color || color.trim() === "") return "transparent";

        const trimmedColor = color.trim();

        // 策略 1：直接标准化
        try {
            const argb = toArgb(trimmedColor);
            if (argb && argb.length === 8) {
                return fromArgb(argb);
            }
        } catch {
            // 转换失败，尝试备选策略
        }

        // 策略 2：补 # 前缀后重试（处理 "FF0000" 或 "F00" 格式）
        if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmedColor)) {
            try {
                const argb = toArgb(`#${trimmedColor}`);
                if (argb && argb.length === 8) {
                    return fromArgb(argb);
                }
            } catch {
                // 补前缀后仍失败，继续回退
            }
        }

        // 策略 3：安全回退，返回透明色
        return "transparent";
    }
}
