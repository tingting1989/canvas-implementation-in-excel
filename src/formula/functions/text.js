/**
 * 文本处理函数
 *
 * 提供字符串操作和转换功能：
 * - UPPER: 转大写
 * - LOWER: 转小写
 * - CONCAT: 连接文本（新版本）
 * - CONCATENATE: 连接文本（兼容旧版）
 * - LEFT: 从左侧截取
 * - RIGHT: 从右侧截取
 * - MID: 从中间截取
 * - LEN: 字符串长度
 * - TRIM: 去除首尾空格
 * - FIND: 查找子串（区分大小写）
 * - SEARCH: 查找子串（不区分大小写）
 * - SUBSTITUTE: 替换文本
 * - TEXT: 格式化数值为文本
 *
 * @module formula/functions/text
 */

import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler.js";
import { isNumber } from "../../utils/helper.js";
import { _validateArgs, _toNum } from "./utils/index.js";

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const textFunctions = {
    /**
     * UPPER - 转大写字母
     *
     * 将文本字符串中所有的小写字母转换为大写形式
     *
     * 语法: UPPER(text)
     *
     * @param {Array} args - 包含一个文本的数组
     * @returns {String|String} 大写形式的文本，失败时返回 #VALUE!
     *
     * @example
     * =UPPER("hello world")      // 返回 "HELLO WORLD"
     * =UPPER(A1)                 // 将 A1 单元格内容转大写
     */
    UPPER: (args) => {
        if (!_validateArgs(args, 1, 1, "UPPER")) return "#VALUE!";

        try {
            return String(args[0] ?? "").toUpperCase();
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "UPPER: 无法转换为大写", { error: e.message, functionName: "UPPER" });
            return "#VALUE!";
        }
    },

    /**
     * LOWER - 转小写字母
     *
     * 将文本字符串中所有的大写字母转换为小写形式
     *
     * 语法: LOWER(text)
     *
     * @param {Array} args - 包含一个文本的数组
     * @returns {String|String} 小写形式的文本，失败时返回 #VALUE!
     *
     * @example
     * =LOWER("HELLO WORLD")      // 返回 "hello world"
     * =LOWER(A1)                 // 将 A1 单元格内容转小写
     */
    LOWER: (args) => {
        if (!_validateArgs(args, 1, 1, "LOWER")) return "#VALUE!";

        try {
            return String(args[0] ?? "").toLowerCase();
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "LOWER: 无法转换为小写", { error: e.message, functionName: "LOWER" });
            return "#VALUE!";
        }
    },

    /**
     * CONCAT - 连接文本（推荐使用）
     *
     * 将多个文本字符串连接为一个连续字符串
     * 这是 CONCATENATE 的现代替代品，支持范围引用
     *
     * 语法: CONCAT(text1, [text2], ...)
     *
     * @param {Array} args - 要连接的文本或范围数组
     * @returns {String|String} 连接后的字符串，失败时返回 #VALUE!
     *
     * @example
     * =CONCAT("Hello", " ", "World")   // 返回 "Hello World"
     * =CONCAT(A1, B1, C1)             // 连接三个单元格的内容
     * =CONCAT(A1:A10)                  // 连接整个范围（Excel 2019+）
     */
    CONCAT: (args) => {
        if (!_validateArgs(args, 1, Infinity, "CONCAT")) return "#VALUE!";

        try {
            return args.map((v) => String(v ?? "")).join("");
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "CONCAT: 字符串拼接失败", { error: e.message, functionName: "CONCAT" });
            return "#VALUE!";
        }
    },

    /**
     * CONCATENATE - 连接文本（兼容旧 Excel 版本）
     *
     * 将多个文本字符串连接为一个连续字符串
     * 与 CONCAT 功能相同，保留以兼容旧公式
     *
     * 语法: CONCATENATE(text1, [text2], ...)
     *
     * @param {Array} args - 要连接的文本或范围数组
     * @returns {String|String} 连接后的字符串，失败时返回 #VALUE!
     *
     * @example
     * =CONCATENATE("Hello", " ", "World")   // 返回 "Hello World"
     * =CONCATENATE(A1, "-", B1)              // 返回 "A1值-B1值"
     */
    CONCATENATE: (args) => {
        if (!_validateArgs(args, 1, Infinity, "CONCATENATE")) return "#VALUE!";

        try {
            return args.map((v) => String(v ?? "")).join("");
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "CONCATENATE: 字符串拼接失败", { error: e.message, functionName: "CONCATENATE" });
            return "#VALUE!";
        }
    },

    /**
     * LEFT - 从左侧截取字符
     *
     * 返回文本字符串最左边的字符
     *
     * 语法: LEFT(text, [num_chars])
     *
     * @param {Array} args - [文本, 截取字符数(可选，默认1)]
     * @returns {String|String} 截取的子串，参数无效时返回 #VALUE!
     *
     * @example
     * =LEFT("Hello World", 5)   // 返回 "Hello"
     * =LEFT(A1)                // 返回 A1 第一个字符
     */
    LEFT: (args) => {
        if (!_validateArgs(args, 1, 2, "LEFT")) return "#VALUE!";

        const text = String(args[0] ?? "");
        const numChars = args[1] !== undefined ? _toNum(args[1]) : 1;

        if (isNaN(numChars) || numChars < 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "LEFT: num_chars 参数无效", { value: args[1], functionName: "LEFT" });
            return "#VALUE!";
        }

        return text.substring(0, Math.floor(numChars));
    },

    /**
     * RIGHT - 从右侧截取字符
     *
     * 返回文本字符串最右边的字符
     *
     * 语法: RIGHT(text, [num_chars])
     *
     * @param {Array} args - [文本, 截取字符数(可选，默认1)]
     * @returns {String|String} 截取的子串，参数无效时返回 #VALUE!
     *
     * @example
     * =RIGHT("Hello World", 5)  // 返回 "World"
     * =RIGHT(A1, 3)            // 返回 A1 最后3个字符
     */
    RIGHT: (args) => {
        if (!_validateArgs(args, 1, 2, "RIGHT")) return "#VALUE!";

        const text = String(args[0] ?? "");
        const numChars = args[1] !== undefined ? _toNum(args[1]) : 1;

        if (isNaN(numChars) || numChars < 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "RIGHT: num_chars 参数无效", { value: args[1], functionName: "RIGHT" });
            return "#VALUE!";
        }

        const start = Math.max(0, text.length - Math.floor(numChars));
        return text.substring(start);
    },

    /**
     * MID - 从中间截取字符
     *
     * 返回文本字符串中从指定位置开始的特定数目的字符
     *
     * 语法: MID(text, start_num, num_chars)
     *
     * @param {Array} args - [文本, 起始位置(从1开始), 截取字符数]
     * @returns {String|String} 截取的子串，参数无效时返回 #VALUE!
     *
     * @example
     * =MID("Hello World", 7, 5)  // 返回 "World"
     * =MID(A1, 2, 3)            // 从第2个字符开始截取3个字符
     */
    MID: (args) => {
        if (!_validateArgs(args, 3, 3, "MID")) return "#VALUE!";

        const text = String(args[0] ?? "");
        const startPos = _toNum(args[1]);
        const numChars = _toNum(args[2]);

        if (isNaN(startPos) || isNaN(numChars) || startPos < 1 || numChars < 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MID: 参数无效", { startPos: args[1], numChars: args[2], functionName: "MID" });
            return "#VALUE!";
        }

        return text.substring(Math.floor(startPos) - 1, Math.floor(startPos) - 1 + Math.floor(numChars));
    },

    /**
     * LEN - 字符串长度
     *
     * 返回文本字符串中的字符个数
     *
     * 语法: LEN(text)
     *
     * @param {Array} args - 包含一个文本的数组
     * @returns {number} 字符串长度
     *
     * @example
     * =LEN("Hello")    // 返回 5
     * =LEN(A1)         // 返回 A1 内容的字符数
     */
    LEN: (args) => {
        if (!_validateArgs(args, 1, 1, "LEN")) return "#VALUE!";

        return String(args[0] ?? "").length;
    },

    /**
     * TRIM - 去除首尾空格
     *
     * 删除文本字符串的首尾空格
     *
     * 语法: TRIM(text)
     *
     * @param {Array} args - 包含一个文本的数组
     * @returns {String} 去除首尾空格后的文本
     *
     * @example
     * =TRIM("  Hello  ")   // 返回 "Hello"
     * =TRIM(A1)            // 去除 A1 内容的首尾空格
     */
    TRIM: (args) => {
        if (!_validateArgs(args, 1, 1, "TRIM")) return "#VALUE!";

        return String(args[0] ?? "").trim();
    },

    /**
     * FIND - 查找子串位置（区分大小写）
     *
     * 在文本中查找子串，返回其起始位置（从1开始）
     *
     * 语法: FIND(find_text, within_text, [start_num])
     *
     * @param {Array} args - [查找文本, 被查找文本, 起始位置(可选，默认1)]
     * @returns {number|String} 子串位置，未找到时返回 #VALUE!
     *
     * @example
     * =FIND("World", "Hello World")    // 返回 7
     * =FIND("o", "Hello", 5)          // 从第5个字符开始查找，返回 #VALUE!
     */
    FIND: (args) => {
        if (!_validateArgs(args, 2, 3, "FIND")) return "#VALUE!";

        const findText = String(args[0] ?? "");
        const withinText = String(args[1] ?? "");
        const startNum = args[2] !== undefined ? _toNum(args[2]) : 1;

        if (isNaN(startNum) || startNum < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "FIND: start_num 参数无效", { value: args[2], functionName: "FIND" });
            return "#VALUE!";
        }

        const index = withinText.indexOf(findText, Math.floor(startNum) - 1);
        if (index === -1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "FIND: 未找到子串", { findText, withinText, functionName: "FIND" });
            return "#VALUE!";
        }

        return index + 1;
    },

    /**
     * SEARCH - 查找子串位置（不区分大小写）
     *
     * 在文本中查找子串，返回其起始位置（从1开始），不区分大小写
     *
     * 语法: SEARCH(find_text, within_text, [start_num])
     *
     * @param {Array} args - [查找文本, 被查找文本, 起始位置(可选，默认1)]
     * @returns {number|String} 子串位置，未找到时返回 #VALUE!
     *
     * @example
     * =SEARCH("world", "Hello World")   // 返回 7（不区分大小写）
     * =SEARCH("W", "Hello World", 2)   // 从第2个字符开始查找
     */
    SEARCH: (args) => {
        if (!_validateArgs(args, 2, 3, "SEARCH")) return "#VALUE!";

        const findText = String(args[0] ?? "");
        const withinText = String(args[1] ?? "");
        const startNum = args[2] !== undefined ? _toNum(args[2]) : 1;

        if (isNaN(startNum) || startNum < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "SEARCH: start_num 参数无效", { value: args[2], functionName: "SEARCH" });
            return "#VALUE!";
        }

        const lowerWithin = withinText.toLowerCase();
        const lowerFind = findText.toLowerCase();
        const index = lowerWithin.indexOf(lowerFind, Math.floor(startNum) - 1);
        if (index === -1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "SEARCH: 未找到子串", { findText, withinText, functionName: "SEARCH" });
            return "#VALUE!";
        }

        return index + 1;
    },

    /**
     * SUBSTITUTE - 替换文本
     *
     * 将文本中的旧文本替换为新文本，可指定替换第几次出现
     *
     * 语法: SUBSTITUTE(text, old_text, new_text, [instance_num])
     *
     * @param {Array} args - [原文本, 旧文本, 新文本, 替换第几次(可选)]
     * @returns {String} 替换后的文本
     *
     * @example
     * =SUBSTITUTE("2024-01-01", "-", "/")         // 返回 "2024/01/01"
     * =SUBSTITUTE("a-b-c", "-", "/", 2)           // 只替换第2个，返回 "a-b/c"
     */
    SUBSTITUTE: (args) => {
        if (!_validateArgs(args, 3, 4, "SUBSTITUTE")) return "#VALUE!";

        const text = String(args[0] ?? "");
        const oldText = String(args[1] ?? "");
        const newText = String(args[2] ?? "");
        const instanceNum = args[3] !== undefined ? _toNum(args[3]) : undefined;

        if (oldText === "") return text;

        if (instanceNum === undefined || isNaN(instanceNum)) {
            return text.split(oldText).join(newText);
        }

        let count = 0;
        let result = "";
        let i = 0;
        while (i < text.length) {
            if (text.substring(i, i + oldText.length) === oldText) {
                count++;
                if (count === instanceNum) {
                    result += newText;
                } else {
                    result += oldText;
                }
                i += oldText.length;
            } else {
                result += text[i];
                i++;
            }
        }
        return result;
    },

    /**
     * TEXT - 格式化数值为文本
     *
     * 将数值按指定格式转换为文本字符串
     *
     * 语法: TEXT(value, [format_text])
     *
     * @param {Array} args - [数值, 格式字符串(可选，默认"0")]
     * @returns {String} 格式化后的文本
     *
     * @example
     * =TEXT(1234.567, "#,##0.00")   // 返回 "1,234.57"
     * =TEXT(0.15, "0%")             // 返回 "15%"
     * =TEXT(3.14, "0.00")           // 返回 "3.14"
     */
    TEXT: (args) => {
        if (!_validateArgs(args, 1, 2, "TEXT")) return "#VALUE!";

        const value = args[0];
        const format = args[1] !== undefined ? String(args[1]) : "0";

        if (isNumber(value) || _toNum(value) === _toNum(value)) {
            const num = _toNum(value);
            if (isNaN(num)) return String(value ?? "");
            return _formatNumber(num, format);
        }

        return String(value ?? "");
    },
};

/**
 * 数值格式化辅助函数
 *
 * 支持的格式：0, #,##0, 0.00, #,##0.00, 百分比格式
 *
 * @param {number} num - 要格式化的数值
 * @param {string} format - 格式字符串
 * @returns {string} 格式化后的文本
 */
function _formatNumber(num, format) {
    if (format === "0") return String(Math.round(num));
    if (format === "#,##0") return Math.round(num).toLocaleString();
    if (format === "0.00") return num.toFixed(2);
    if (format === "#,##0.00") return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const percentMatch = format.match(/^(0?\.?0*)%$/);
    if (percentMatch) {
        const decimalPart = percentMatch[1];
        const decimals = decimalPart ? (decimalPart.match(/0/g) || []).length - 1 : 0;
        return (num * 100).toFixed(Math.max(0, decimals)) + "%";
    }

    const decimalMatch = format.match(/^0\.(0+)$/);
    if (decimalMatch) {
        return num.toFixed(decimalMatch[1].length);
    }

    const commaMatch = format.match(/^#,##0\.(0+)$/);
    if (commaMatch) {
        return num.toLocaleString(undefined, { minimumFractionDigits: commaMatch[1].length, maximumFractionDigits: commaMatch[1].length });
    }

    return String(num);
}
