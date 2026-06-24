/**
 * 逻辑函数
 *
 * 提供条件判断和逻辑运算功能：
 * - IF: 条件判断
 * - AND: 逻辑与（所有条件都为真）
 * - OR: 逻辑或（任一条件为真）
 * - NOT: 逻辑非（反转逻辑值）
 *
 * TODO: 计划添加
 * - IFERROR: 错误处理
 * - IFNA: N/A 值处理
 * - XOR: 异或运算
 * - TRUE/FALSE: 常量函数
 *
 * @module formula/functions/logical
 */

import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { _validateArgs } from "./utils/index.js";

/**
 * 将值转换为布尔值（用于逻辑运算）
 *
 * 转换规则（与 Excel 一致）：
 * - 布尔值: 直接使用
 * - 数值: 0 → false, 非 0 → true
 * - 字符串 "TRUE"/"FALSE" (不区分大小写) → 对应布尔值
 * - 其他字符串 → true (Excel 行为)
 * - null/undefined → false
 * - 错误值 (#VALUE! 等) → 保持原样传播
 *
 * @param {*} value - 要转换的值
 * @returns {boolean|*} 布尔值或错误值
 */
function _toBoolean(value) {
    if (typeof value === "boolean") return value;

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        const upperValue = value.toUpperCase().trim();
        if (upperValue === "TRUE") return true;
        if (upperValue === "FALSE") return false;

        // 其他非空字符串视为 true（Excel 行为）
        return value !== "";
    }

    if (value === null || value === undefined) return false;

    // 错误值传播
    if (typeof value === "string" && value.startsWith("#")) return value;

    // 其他情况视为 true
    return true;
}

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const logicalFunctions = {
    /**
     * IF - 条件判断函数
     *
     * 根据条件是否成立返回不同的值
     *
     * 语法: IF(logical_test, value_if_true, [value_if_false])
     *
     * @param {Array} args - [条件表达式, 条件为真时的值, 条件为假时的值]
     * @returns {*} 根据条件返回对应的值，默认 false 值为 false
     *
     * @example
     * =IF(A1>100, "优秀", "一般")      // A1>100 返回 "优秀"，否则 "一般"
     * =IF(A1="", "未填写", A1)         // 空单元格提示
     * =IF(AND(A1>0, B1>0), "都大于0", "不满足")  // 复合条件
     */
    IF: (args) => {
        if (!_validateArgs(args, 2, 3, "IF")) return "#VALUE!";

        const condition = args[0];
        const trueValue = args[1];
        const falseValue = args[2] !== undefined ? args[2] : false;

        return condition ? trueValue : falseValue;
    },

    /**
     * AND - 逻辑与函数
     *
     * 检查所有参数是否都为 TRUE。所有参数都为 TRUE 时返回 TRUE，
     * 任一参数为 FALSE 时立即返回 FALSE。
     *
     * 语法: AND(logical1, [logical2], ...)
     *
     * 特性：
     * - 支持短路求值：遇到第一个 FALSE 立即返回
     * - 参数数量：1 到 255 个
     * - 自动类型转换（数值、字符串等）
     *
     * @param {Array} args - 逻辑表达式数组
     * @returns {boolean|String} 所有为真返回 true，否则返回 false；错误时返回 #VALUE!
     *
     * @example
     * =AND(TRUE, TRUE)                // 返回 TRUE
     * =AND(1, 2, 3)                  // 返回 TRUE（非零数值=TRUE）
     * =AND(A1>0, B1<100)             // A1>0 且 B1<100 时返回 TRUE
     * =AND(1, 0, 3)                  // 返回 FALSE（0=FALSE）
     * =AND("TRUE", "yes", 1)         // 返回 TRUE
     */
    AND: (args) => {
        if (!_validateArgs(args, 1, Infinity, "AND")) return "#VALUE!";

        for (let i = 0; i < args.length; i++) {
            const result = _toBoolean(args[i]);

            // 错误值传播
            if (typeof result === "string" && result.startsWith("#")) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `AND: 第 ${i + 1} 个参数是错误值`, {
                    error: result,
                    index: i,
                    functionName: "AND",
                });
                return result;
            }

            // 短路求值：遇到 FALSE 立即返回
            if (result === false) {
                return false;
            }
        }

        return true;
    },

    /**
     * OR - 逻辑或函数
     *
     * 检查是否有任一参数为 TRUE。任一参数为 TRUE 时立即返回 TRUE，
     * 所有参数都为 FALSE 时才返回 FALSE。
     *
     * 语法: OR(logical1, [logical2], ...)
     *
     * 特性：
     * - 支持短路求值：遇到第一个 TRUE 立即返回
     * - 参数数量：1 到 255 个
     * - 自动类型转换（数值、字符串等）
     *
     * @param {Array} args - 逻辑表达式数组
     * @returns {boolean|String} 任一为真返回 true，否则返回 false；错误时返回 #VALUE!
     *
     * @example
     * =OR(FALSE, FALSE)              // 返回 FALSE
     * =OR(0, 0, 5)                  // 返回 TRUE（5≠0=TRUE）
     * =OR(A1<0, B1>100)             // A1<0 或 B1>100 时返回 TRUE
     * =OR(1, 0, 0)                  // 返回 TRUE
     * =OR("", NULL, 0)              // 返回 FALSE（空/null/0 都算 FALSE）
     */
    OR: (args) => {
        if (!_validateArgs(args, 1, Infinity, "OR")) return "#VALUE!";

        for (let i = 0; i < args.length; i++) {
            const result = _toBoolean(args[i]);

            // 错误值传播
            if (typeof result === "string" && result.startsWith("#")) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `OR: 第 ${i + 1} 个参数是错误值`, {
                    error: result,
                    index: i,
                    functionName: "OR",
                });
                return result;
            }

            // 短路求值：遇到 TRUE 立即返回
            if (result === true) {
                return true;
            }
        }

        return false;
    },

    /**
     * NOT - 逻辑非函数
     *
     * 反转参数的逻辑值：TRUE 变为 FALSE，FALSE 变为 TRUE。
     *
     * 语法: NOT(logical)
     *
     * 特点：
     * - 只接受 1 个参数
     * - 支持多种输入类型的转换
     * - 与 AND/OR 配合使用实现复杂逻辑
     *
     * @param {Array} args - 包含一个逻辑值的数组
     * @returns {boolean|String} 反转后的逻辑值；错误时返回 #VALUE!
     *
     * @example
     * =NOT(TRUE)                     // 返回 FALSE
     * =NOT(FALSE)                    // 返回 TRUE
     * =NOT(0)                        // 返回 TRUE（0→FALSE→反转→TRUE）
     * =NOT(1)                        // 返回 FALSE（1→TRUE→反转→FALSE）
     * =NOT(A1>100)                   // 当 A1<=100 时返回 TRUE
     * =NOT(AND(A1>0, B1<50))        // 非(A1>0 且 B1<50)
     */
    NOT: (args) => {
        if (!_validateArgs(args, 1, 1, "NOT")) return "#VALUE!";

        const result = _toBoolean(args[0]);

        // 错误值传播
        if (typeof result === "string" && result.startsWith("#")) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "NOT: 参数是错误值", {
                error: result,
                functionName: "NOT",
            });
            return result;
        }

        return !result;
    },
};
