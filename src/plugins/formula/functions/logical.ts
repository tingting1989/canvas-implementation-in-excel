/**
 * 逻辑函数
 *
 * 提供条件判断和逻辑运算功能：
 * - IF: 条件判断
 * - AND: 逻辑与（所有条件都为真）
 * - OR: 逻辑或（任一条件为真）
 * - NOT: 逻辑非（反转逻辑值）
 * - IFERROR: 错误捕获和处理
 * - IFNA: #N/A 错误专门处理
 * - XOR: 异或运算（奇数个TRUE返回TRUE）
 * - TRUE/FALSE: 布尔常量函数
 *
 * @module formula/functions/logical
 */

import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";
import { _validateArgs } from "./utils";

type FormulaResult = boolean | string | number | unknown;

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
 * @param value - 要转换的值
 * @returns 布尔值或错误值
 */
function _toBoolean(value: unknown): boolean | string {
    if (typeof value === "boolean") return value;

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        const upperValue = value.toUpperCase().trim();

        // 错误值传播（必须在字符串处理内部）
        if (value.startsWith("#")) return value;

        if (upperValue === "TRUE") return true;
        if (upperValue === "FALSE") return false;

        // 其他非空字符串视为 true（Excel 行为）
        return value !== "";
    }

    if (value === null || value === undefined) return false;

    // 对象：尝试转换为原始值
    if (typeof value === "object" && value !== null) {
        if (typeof value.valueOf === "function") {
            const primitive = value.valueOf();
            return _toBoolean(primitive);
        }
        return true;
    }

    // 其他情况视为 true
    return true;
}

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const logicalFunctions: Record<string, (args: unknown[]) => FormulaResult> = {
    /**
     * IF - 条件判断函数
     *
     * 根据条件是否成立返回不同的值
     *
     * 语法: IF(logical_test, value_if_true, [value_if_false])
     *
     * @param args - [条件表达式, 条件为真时的值, 条件为假时的值]
     * @returns 根据条件返回对应的值，默认 false 值为 false
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
     * @param args - 逻辑表达式数组
     * @returns 所有为真返回 true，否则返回 false；错误时返回 #VALUE!
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
     * @param args - 逻辑表达式数组
     * @returns 任一为真返回 true，否则返回 false；错误时返回 #VALUE!
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
     * @param args - 包含一个逻辑值的数组
     * @returns 反转后的逻辑值；错误时返回 #VALUE!
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

    /**
     * XOR - 异或逻辑运算函数
     *
     * 检查参数中 TRUE 值的个数是否为奇数。奇数个 TRUE 返回 TRUE，
     * 偶数个 TRUE（包括0个）返回 FALSE。与 OR 不同的是，XOR 要求恰好奇数个条件成立。
     *
     * 语法: XOR(logical1, [logical2], ...)
     *
     * 特性：
     * - 参数数量：1 到 255 个
     * - 自动类型转换（数值、字符串等）
     * - 奇数判定：TRUE 的计数为奇数时返回 TRUE
     *
     * 应用场景：
     * - 互斥条件判断（只能选其一）
     * - 奇偶校验
     * - 复杂逻辑组合
     *
     * @param args - 逻辑表达式数组
     * @returns 奇数个TRUE返回true，否则返回false；错误时返回 #VALUE!
     *
     * @example
     * =XOR(TRUE)                     // 返回 TRUE（1个TRUE，奇数）
     * =XOR(TRUE, FALSE)              // 返回 TRUE（1个TRUE，奇数）
     * =XOR(TRUE, TRUE)               // 返回 FALSE（2个TRUE，偶数）
     * =XOR(FALSE, FALSE)             // 返回 FALSE（0个TRUE，偶数）
     * =XOR(1, 3, 5)                 // 返回 TRUE（3个非零值=3个TRUE，奇数）
     * =XOR(A1>10, B1>20, C1>30)     // 恰好1个或3个条件成立时返回 TRUE
     */
    XOR: (args) => {
        if (!_validateArgs(args, 1, Infinity, "XOR")) return "#VALUE!";

        let trueCount = 0;

        for (let i = 0; i < args.length; i++) {
            const result = _toBoolean(args[i]);

            if (typeof result === "string" && result.startsWith("#")) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `XOR: 第 ${i + 1} 个参数是错误值`, {
                    error: result,
                    index: i,
                    functionName: "XOR",
                });
                return result;
            }

            if (result === true) {
                trueCount++;
            }
        }

        return trueCount % 2 === 1;
    },

    /**
     * TRUE - 布尔常量函数（返回逻辑真）
     *
     * 返回布尔值 TRUE。主要用于公式中需要显式指定 TRUE 值的场景，
     * 或与其他逻辑函数配合使用。
     *
     * 语法: TRUE()
     *
     * 特点：
     * - 不接受任何参数
     * - 始终返回布尔值 true
     * - 与 FALSE() 形成对称
     *
     * @param args - 空数组（不接受参数）
     * @returns 始终返回 true；如果提供了参数则返回 #VALUE!
     *
     * @example
     * =TRUE()                        // 返回 TRUE
     * =IF(A1>100, TRUE(), FALSE())   // 显式返回布尔值
     * =AND(TRUE(), A1>0)             // 显式指定一个条件为TRUE
     */
    TRUE: (args) => {
        if (args.length > 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "TRUE: 函数不需要参数", {
                argCount: args.length,
                expectedCount: 0,
                functionName: "TRUE",
            });
            return "#VALUE!";
        }
        return true;
    },

    /**
     * FALSE - 布尔常量函数（返回逻辑假）
     *
     * 返回布尔值 FALSE。主要用于公式中需要显式指定 FALSE 值的场景，
     * 或与其他逻辑函数配合使用。
     *
     * 语法: FALSE()
     *
     * 特点：
     * - 不接受任何参数
     * - 始终返回布尔值 false
     * - 与 TRUE() 形成对称
     *
     * @param args - 空数组（不接受参数）
     * @returns 始终返回 false；如果提供了参数则返回 #VALUE!
     *
     * @example
     * =FALSE()                       // 返回 FALSE
     * =IF(A1="", FALSE(), TRUE())    // 空单元格返回FALSE
     * =OR(FALSE(), A1<0)             // 显式指定一个条件为FALSE
     */
    FALSE: (args) => {
        if (args.length > 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "FALSE: 函数不需要参数", {
                argCount: args.length,
                expectedCount: 0,
                functionName: "FALSE",
            });
            return "#VALUE!";
        }
        return false;
    },
};
