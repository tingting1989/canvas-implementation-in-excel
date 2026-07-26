/**
 * 布尔复选框渲染器（CheckboxColumnType）
 *
 * 将布尔值渲染为可视化的复选框（☑ 或 ☐），而非简单的 TRUE/FALSE 文字。
 * 适用于需要直观展示布尔状态的场景，如任务完成状态、启用/禁用开关等。
 *
 * ## 渲染效果
 *
 * - **未选中**（value 为 falsy）：空心圆角方框，边框为 uncheckedColor
 * - **选中**（value 为 truthy）：填充背景色 + 白色对勾
 * - **禁用态**（isDisabled）：半透明遮罩覆盖，降低视觉权重
 *
 * ## 值解析
 *
 * parse() 支持多种输入格式的布尔转换：
 * - true/yes/1/是 → true
 * - false/no/0/否 → false
 * - 其他值 → 原样返回（不转换）
 *
 * ## 自定义选项（this.options）
 *
 * | 选项            | 默认值                          | 说明           |
 * |-----------------|----------------------------------|----------------|
 * | size            | CONFIG.CHECKBOX_SIZE_RATIO       | 复选框占单元格尺寸的比例 |
 * | checkedColor    | CONFIG.CHECKBOX_CHECKED_COLOR    | 选中时背景色     |
 * | uncheckedColor  | CONFIG.CHECKBOX_UNCHECKED_COLOR  | 未选中时边框色   |
 *
 * @module types/renderers/CheckboxColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";

export class CheckboxColumnType extends BaseColumnType {
    /** @type {string} 类型名称标识 */
    get name() {
        return "checkbox";
    }

    /** @type {string} 关联的编辑器类型（复选框使用文本编辑器输入） */
    get editorType() {
        return "text";
    }

    /**
     * 获取默认样式
     *
     * 复选框始终居中对齐，覆盖基类的默认对齐方式。
     *
     * @param {Object} baseStyle - 基础样式
     * @returns {Object} 合并后的样式（textAlign 强制为 "center"）
     */
    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "center" };
    }

    /**
     * 格式化值为显示文本
     *
     * 复选框类型的显示由 render() 绘制图形，format() 仅提供纯文本回退。
     *
     * @param {*} value - 单元格值
     * @returns {string} 值的字符串表示
     */
    format(value) {
        return String(value ?? "");
    }

    /**
     * 解析用户输入为布尔值
     *
     * 支持的输入格式：
     * - true/yes/1/是 → true
     * - false/no/0/否 → false
     * - 空值 → 空字符串
     * - 其他 → 原样返回（不转换）
     *
     * @param {*} input - 用户输入值
     * @returns {boolean|string} 解析后的布尔值，或原样返回的输入
     */
    parse(input) {
        if (input === "" || input == null) return "";
        const str = String(input).toLowerCase().trim();
        if (["true", "yes", "1", "是"].includes(str)) return true;
        if (["false", "no", "0", "否"].includes(str)) return false;
        return input;
    }

    /**
     * 自定义渲染方法：绘制复选框图形
     *
     * 绘制流程：
     * 1. 计算复选框尺寸和位置（居中于单元格）
     * 2. 绘制空心圆角方框（未选中状态）
     * 3. 如果选中：填充背景色 + 绘制白色对勾
     * 4. 如果禁用：覆盖半透明遮罩
     *
     * 复选框尺寸 = min(width, height) × sizeRatio，
     * 确保在窄列或矮行中不会溢出。
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {CanvasRenderingContext2D} context.ctx - Canvas 2D 上下文
     * @param {number} context.x - 单元格左上角 X 坐标
     * @param {number} context.y - 单元格左上角 Y 坐标
     * @param {number} context.width - 单元格宽度
     * @param {number} context.height - 单元格高度
     * @param {*} context.value - 单元格值（Boolean(value) 判断选中状态）
     * @param {boolean} context.isDisabled - 是否为禁用态
     */
    render(context) {
        const { ctx, x, y, width, height, value, isDisabled } = context;

        const isChecked = Boolean(value);
        const sizeRatio = this.options?.size || CONFIG.CHECKBOX_SIZE_RATIO;
        // 复选框尺寸取宽高较小值 × 比例，确保不溢出
        const boxSize = Math.min(width, height) * sizeRatio;
        // 居中定位
        const boxX = x + (width - boxSize) / 2;
        const boxY = y + (height - boxSize) / 2;
        const radius = boxSize * CONFIG.CHECKBOX_CORNER_RADIUS_RATIO;

        // 第 1 步：绘制空心圆角方框（未选中状态的边框）
        ctx.strokeStyle = this.options?.uncheckedColor || CONFIG.CHECKBOX_UNCHECKED_COLOR;
        ctx.lineWidth = CONFIG.CHECKBOX_BORDER_LINE_WIDTH;
        context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
        ctx.stroke();

        if (isChecked) {
            // 第 2 步：选中状态 - 填充背景色
            ctx.fillStyle = this.options?.checkedColor || CONFIG.CHECKBOX_CHECKED_COLOR;
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();

            // 第 3 步：绘制白色对勾
            ctx.strokeStyle = CONFIG.CHECKBOX_CHECK_MARK_COLOR;
            ctx.lineWidth = CONFIG.CHECKBOX_CHECK_MARK_LINE_WIDTH;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            // 对勾以复选框中心为原点，按比例缩放
            const checkSize = boxSize * CONFIG.CHECKBOX_CHECK_MARK_SIZE_RATIO;
            const cx = boxX + boxSize / 2;
            const cy = boxY + boxSize / 2;

            ctx.beginPath();
            // 对勾左段：从中心偏左到中心偏下
            ctx.moveTo(cx - checkSize * 0.4, cy);
            ctx.lineTo(cx - checkSize * 0.1, cy + checkSize * 0.35);
            // 对勾右段：从中心偏下到中心偏右上
            ctx.lineTo(cx + checkSize * 0.45, cy - checkSize * 0.35);
            ctx.stroke();
        }

        if (isDisabled) {
            // 第 4 步：禁用态 - 半透明遮罩覆盖
            ctx.globalAlpha = CONFIG.CHECKBOX_DISABLED_ALPHA;
            ctx.fillStyle = CONFIG.CHECKBOX_DISABLED_FILL;
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}
