import { BaseColumnType } from "./BaseColumnType.js";

/**
 * 文本列类型
 *
 * 基础的文本类型，支持：
 * - 默认左对齐
 * - trim 空白字符
 * - 可配置最大长度限制
 */
export class TextColumnType extends BaseColumnType {
    get name() {
        return "text";
    }

    get editorType() {
        return "text";
    }

    format(value) {
        if (value === undefined || value === null) return "";
        return String(value);
    }

    validate(value) {
        if (value === "" || value === undefined || value === null) return true;
        const str = String(value);
        const maxLength = this.options?.maxLength;
        if (maxLength != null && str.length > maxLength) {
            return `文本长度不能超过 ${maxLength} 个字符`;
        }
        return true;
    }

    parse(input) {
        const trimmed = input?.trim?.() ?? input;

        if (trimmed === "") return "";

        // parse() 只负责 trim 和类型转换，不做长度截断
        // 长度限制应该由 validate() 检查，或者由 UI 层处理
        return trimmed;
    }

    getDefaultStyle(baseStyle) {
        // 文本默认左对齐
        if (!baseStyle?.textAlign) {
            return { ...baseStyle, textAlign: "left" };
        }
        return baseStyle;
    }
}