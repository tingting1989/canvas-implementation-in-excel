/**
 * 空值类型常量
 *
 * 用于区分不同类型的"空值"：
 * - BLANK：空白单元格（无任何内容）
 * - EMPTY_STRING：空字符串（""）
 * - NULL：JavaScript null
 * - UNDEFINED：JavaScript undefined
 *
 * 注意：在 Excel/表格场景中，这些类型通常被统一处理
 */
export const NULL_VALUE_TYPES = {
    BLANK: "blank",
    EMPTY_STRING: "emptyString",
    NULL: "null",
    UNDEFINED: "undefined",
};

/**
 * 空值处理器
 *
 * 提供统一的空值判断、类型检测、格式化等操作。
 * 在筛选场景中，空值需要特殊处理：
 * - 统一用 NULL_KEY 表示所有类型的空值
 * - 在 UI 上显示为 BLANK_DISPLAY（"(空白)"）
 *
 * @example
 * NullValueHandler.isNullValue(null);        // true
 * NullValueHandler.isNullValue("");           // true
 * NullValueHandler.isNullValue("   ");       // true (空白字符串)
 * NullValueHandler.normalizeToKey(null);      // "__EXCEL_NULL__"
 * NullValueHandler.formatForDisplay(null);    // "(空白)"
 */
export class NullValueHandler {
    /** UI 上显示的空白单元格文本 */
    static BLANK_DISPLAY = "(空白)";

    /** 统一表示所有空值的键（用于筛选唯一值存储） */
    static NULL_KEY = "__EXCEL_NULL__";

    /**
     * 判断值是否为空
     *
     * 视为空值的情况：
     * - null
     * - undefined
     * - 空字符串 ""
     * - 只包含空白字符的字符串 "  "（trim 后为空）
     *
     * @param {*} value - 待检测的值
     * @returns {boolean} 是否为空值
     */
    static isNullValue(value) {
        return value === null || value === undefined || value === "" || (typeof value === "string" && value.trim() === "");
    }

    /**
     * 获取空值的具体类型
     *
     * @param {*} value - 待检测的值
     * @returns {string|null} 空值类型，或 null（非空值）
     */
    static getNullType(value) {
        if (value === null) return NULL_VALUE_TYPES.NULL;
        if (value === undefined) return NULL_VALUE_TYPES.UNDEFINED;
        if (value === "") return NULL_VALUE_TYPES.EMPTY_STRING;
        if (typeof value === "string" && value.trim() === "") return NULL_VALUE_TYPES.BLANK;
        return null;
    }

    /**
     * 将值规范化为筛选用的键
     *
     * 所有空值类型统一转换为 NULL_KEY，
     * 确保在唯一值列表中空值只出现一次。
     *
     * @param {*} value - 待规范化的值
     * @returns {string} 规范化后的键
     * @example
     * NullValueHandler.normalizeToKey(null);      // "__EXCEL_NULL__"
     * NullValueHandler.normalizeToKey("apple");   // "apple"
     */
    static normalizeToKey(value) {
        if (this.isNullValue(value)) {
            return this.NULL_KEY;
        }
        return String(value);
    }

    /**
     * 格式化值用于显示
     *
     * 空值显示为 BLANK_DISPLAY，非空值转为字符串。
     *
     * @param {*} value - 待格式化的值
     * @returns {string} 用于显示的字符串
     */
    static formatForDisplay(value) {
        if (this.isNullValue(value)) {
            return this.BLANK_DISPLAY;
        }
        return String(value);
    }

    /**
     * 判断值是否为纯空白（空字符串或仅空白字符）
     *
     * @param {*} value - 待检测的值
     * @returns {boolean} 是否为纯空白
     */
    static isBlankOnly(value) {
        return value === "" || (typeof value === "string" && value.trim() === "");
    }
}
