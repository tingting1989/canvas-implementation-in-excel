import { BaseColumnType } from "./BaseColumnType.js";
import { CONFIG } from "@/constants/config";

/**
 * 多行文本列类型（TextareaColumnType）
 *
 * 专门用于处理多行文本内容的单元格类型。
 *
 * ## 核心特性
 * - **Canvas 多行渲染**：支持自动换行、行高控制、超出截断（末行省略号）
 * - **编辑器集成**：使用 `<textarea>` 元素进行多行文本输入
 * - **样式默认值**：左对齐 + 顶部对齐
 * - **配置选项**：maxLength（最大字符数）、maxRows（最大显示行数）
 *
 * ## 使用场景
 * - 备注字段、评论内容、日志记录等需要多行显示的单元格
 * - 需要保留换行符的富文本输入
 *
 * ## 配置示例
 * ```js
 * // 列级别配置
 * { type: "textarea", width: 200, maxLength: 500, maxRows: 5 }
 *
 * // 单元格级别配置
 * { row: 0, col: 2, type: "textarea", maxLength: 200 }
 * ```
 *
 * ## 渲染逻辑
 * 1. 将文本按 `\n` 分割为段落
 * 2. 每个段落内按 `maxWidth` 自动折行
 * 3. 根据 `maxRows` 或单元格高度限制可见行数
 * 4. 超出时在最后一行追加省略号 `...`
 *
 * @module types/TextareaColumnType
 */
export class TextareaColumnType extends BaseColumnType {
    /**
     * 类型标识名称
     * @type {"textarea"}
     */
    get name() {
        return "textarea";
    }

    /**
     * 关联的编辑器类型标识
     * @type {"textarea"}
     */
    get editorType() {
        return "textarea";
    }

    /**
     * 格式化值为显示字符串
     *
     * 将任意类型转换为字符串表示：
     * - null/undefined → 空字符串 ""
     * - 其他类型 → String(value)
     *
     * @param {*} value 原始值
     * @returns {string} 格式化后的字符串
     */
    format(value) {
        if (value === undefined || value === null) return "";
        return String(value);
    }

    /**
     * 验证值是否有效
     *
     * 规则：
     * - 空/null/undefined → 通过验证
     * - 非空字符串 → 检查长度是否超过 maxLength 配置
     *
     * @param {*} value 待验证的值
     * @returns {boolean|string} true 表示通过验证，字符串为错误信息
     */
    validate(value) {
        if (value === "" || value === undefined || value === null) return true;
        const str = String(value);
        const maxLength = this.options?.maxLength;
        if (maxLength != null && str.length > maxLength) {
            return `文本长度不能超过 ${maxLength} 个字符`;
        }
        return true;
    }

    /**
     * 解析用户输入的原始值
     *
     * 处理规则：
     * - 调用 trim() 移除首尾空白
     * - 空白字符串返回 ""
     * - 非 string 类型保持原样（兼容特殊输入源）
     *
     * 注意：此方法不执行长度截断，
     * 长度限制由 validate() 或 UI 层处理
     *
     * @param {*} input 用户输入的原始值
     * @returns {*} 解析后的值
     */
    parse(input) {
        const trimmed = input?.trim?.() ?? input;
        if (trimmed === "") return "";
        return trimmed;
    }

    /**
     * 获取类型的默认样式
     *
     * 多行文本的默认样式特点：
     * - textAlign: "left" — 左对齐（便于阅读长文本）
     * - verticalAlign: "middle" — 垂直居中（与标准文本类型一致）
     *
     * 仅当 baseStyle 中未定义对应属性时才设置默认值
     *
     * @param {Object} baseStyle 基础样式对象
     * @returns {Object} 合并后的样式对象
     */
    getDefaultStyle(baseStyle) {
        const style = { ...baseStyle };
        if (!style.textAlign) {
            style.textAlign = "left";
        }
        if (!style.verticalAlign) {
            style.verticalAlign = "middle";
        }
        return style;
    }

    /**
     * 获取传递给编辑器的选项参数
     *
     * 从类型配置中提取编辑器所需的参数：
     * - maxLength: 最大允许输入的字符数
     * - maxRows: 最大显示行数（用于渲染截断）
     *
     * @returns {Object} 编辑器选项
     */
    getEditorOptions() {
        return {
            maxLength: this.options?.maxLength,
            maxRows: this.options?.maxRows,
        };
    }

    /**
     * 自定义 Canvas 渲染方法
     *
     * 实现多行文本的自动换行和截断显示。
     * 当类型实例拥有 render 方法时，TileRenderer 会优先调用此方法
     * 而非默认的单行文本绘制逻辑。
     *
     * ### 渲染流程
     * 1. **安全检查**：null/undefined/空值直接跳过
     * 2. **字体设置**：根据 style 构建 font 字符串
     * 3. **文本分词**：调用 #wrapText() 拆分为多行
     * 4. **行数限制**：根据 maxRows 配置或单元格高度计算最大可见行
     * 5. **逐行绘制**：支持左/中/右三种水平对齐方式
     * 6. **省略号处理**：超出部分在末行追加 "..."
     *
     * @param {import('./CellRenderContext.js').CellRenderContext} context 单元格渲染上下文
     * @param {CanvasRenderingContext2D} context.ctx Canvas 2D 绑定上下文
     * @param {number} context.x 单元格左上角 X 坐标
     * @param {number} context.y 单元格左上角 Y 坐标
     * @param {number} context.width 单元格宽度（px）
     * @param {number} context.height 单元格高度（px）
     * @param {*} context.value 单元格原始值
     * @param {Object} context.style 单元格样式对象
     * @param {import('../workbook/Sheet.js').default} [context.sheet] 所属工作表引用
     */
    render(context) {
        const { ctx, x, y, width, height, value, style, sheet } = context;

        if (value === undefined || value === null || value === "") return;

        const text = String(value);

        const padding = context.getPadding(sheet);
        const maxTextWidth = width - padding * 2;

        if (maxTextWidth <= 0) return;

        const fontStyle = style.fontStyle === "italic" ? "italic" : "";
        const fontWeight = style.fontWeight || "normal";
        const fontSize = style.fontSize || CONFIG.DEFAULT_FONT_SIZE;
        const fontFamily = style.fontFamily || CONFIG.DEFAULT_FONT_FAMILY;
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`.trim().replace(/\s+/g, " ");
        ctx.fillStyle = style.color || CONFIG.CELL_TEXT_COLOR;
        ctx.textAlign = style.textAlign || "left";

        const lineHeight = fontSize * CONFIG.TEXTAREA_LINE_HEIGHT_RATIO;
        const lines = this.#wrapText(ctx, text, maxTextWidth);
        const configuredMaxRows = this.options?.maxRows;
        const availableHeight = height - padding * 2;
        const calculatedMaxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
        const maxLines = configuredMaxRows > 0 ? configuredMaxRows : calculatedMaxLines;
        const visibleLines = lines.slice(0, maxLines);
        const showEllipsis = lines.length > visibleLines.length && visibleLines.length > 0;

        const totalTextHeight = visibleLines.length * lineHeight;
        const verticalAlign = style.verticalAlign || "middle";

        ctx.textBaseline = "middle";

        let startY;

        switch (verticalAlign) {
            case "middle":
                startY = y + (height - totalTextHeight) / 2;
                break;
            case "bottom":
                startY = y + height - padding - totalTextHeight;
                break;
            default:
                startY = y + padding;
                break;
        }

        if (startY < y) startY = y;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();

        for (let i = 0; i < visibleLines.length; i++) {
            const lineText = showEllipsis && i === visibleLines.length - 1 ? visibleLines[i] + CONFIG.TEXTAREA_ELLIPSIS : visibleLines[i];

            let textX;
            switch (ctx.textAlign) {
                case "center":
                    textX = x + width / 2;
                    break;
                case "right":
                    textX = x + width - padding;
                    break;
                default:
                    textX = x + padding;
            }

            const textY = startY + i * lineHeight + lineHeight / 2;

            if (textY + lineHeight / 2 > y + height) break;

            ctx.fillText(lineText, textX, textY);
        }

        ctx.restore();
    }

    /**
     * 文本自动换行算法
     *
     * 将单段文本按 maxWidth 限制拆分为多行数组。
     *
     * ### 算法说明
     * 采用贪心逐字符试探策略：
     * 1. 从左到右逐字符累加到 currentLine
     * 2. 每次累加后测量宽度
     * 3. 若超宽且当前行非空，则将当前行加入结果并重置
     * 4. 最后将剩余字符作为新的一行
     *
     * 此方法仅处理单个段落内的自动换行，
     * 不包含 `\n` 分割逻辑（由 render 方法负责段落分割）。
     *
     * @param {CanvasRenderingContext2D} ctx 已设置 font 的 Canvas 上下文
     * @param {string} text 待拆分的文本（不含换行符的单段文本）
     * @param {number} maxWidth 最大可用宽度（px）
     * @returns {string[]} 拆分后的行数组
     *
     * @example
     * // 宽度足够时返回原文本
     * wrapText(ctx, "Hello", 100) → ["Hello"]
     *
     * // 宽度不足时自动拆分
     * wrapText(ctx, "HelloWorld", 40) → ["Hello", "World"]
     */
    #wrapText(ctx, text, maxWidth) {
        let currentLine = "";
        const lines = [];

        for (const char of text) {
            const testLine = currentLine + char;

            if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }
}
