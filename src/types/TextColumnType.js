import { ColumnType } from "./ColumnType.js";

/**
 * 文本列类型
 *
 * 基础的文本类型，支持：
 * - 默认左对齐
 * - trim 空白字符
 * - 可配置最大长度限制
 */
export class TextColumnType extends ColumnType {
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
        const maxLength = this.options?.maxLength;
        if (maxLength != null && trimmed.length > maxLength) {
            return trimmed.slice(0, maxLength);
        }
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
