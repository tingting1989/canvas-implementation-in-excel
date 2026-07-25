/**
 * 数学运算函数
 *
 * 提供基础的数学计算功能：
 * - SUM: 求和
 * - AVERAGE: 平均值
 * - MAX: 最大值
 * - MIN: 最小值
 * - ABS: 绝对值
 * - ROUND: 四舍五入
 * - ROUNDUP: 向上取整
 * - ROUNDDOWN: 向下取整
 * - INT: 取整
 * - MOD: 取模
 * - POWER: 幂运算
 * - SUMPRODUCT: 数组乘积求和
 * - SUBTOTAL: 分类汇总
 *
 * @module formula/functions/math
 */

import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler.js";
import { _flatten, _toNum, _validateArgs } from "./utils/index.js";

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const mathFunctions = {
    /**
     * SUM - 求和函数
     *
     * 对所有数值参数求和，忽略非数值项
     *
     * 语法: SUM(number1, [number2], ...)
     *
     * @param {Array} args - 数值或范围数组
     * @returns {number} 所有数值的总和
     *
     * @example
     * =SUM(1, 2, 3)           // 返回 6
     * =SUM(A1:A10)            // 求 A1:A10 的和
     * =SUM(A1:B5, C1:C10)     // 多个范围的和
     */
    SUM: (args) => {
        if (!_validateArgs(args, 1, Infinity, "SUM")) return "#VALUE!";

        const flat = _flatten(args);
        let sum = 0;
        for (const v of flat) {
            const n = _toNum(v);
            if (!isNaN(n)) sum += n;
        }
        return sum;
    },

    /**
     * AVERAGE - 算术平均值
     *
     * 计算所有数值参数的算术平均数
     *
     * 语法: AVERAGE(number1, [number2], ...)
     *
     * @param {Array} args - 数值或范围数组
     * @returns {number|String} 平均值，无有效数值时返回 #DIV/0!
     *
     * @example
     * =AVERAGE(1, 2, 3, 4, 5)   // 返回 3
     * =AVERAGE(A1:A100)         // 计算范围内平均值
     */
    AVERAGE: (args) => {
        if (!_validateArgs(args, 1, Infinity, "AVERAGE")) return "#VALUE!";

        const flat = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));

        if (flat.length === 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "AVERAGE: 没有有效的数值可计算", { functionName: "AVERAGE" });
            return "#DIV/0!";
        }

        return flat.reduce((acc, v) => acc + v, 0) / flat.length;
    },

    /**
     * MAX - 最大值
     *
     * 返回一组数值中的最大值
     *
     * 语法: MAX(number1, [number2], ...)
     *
     * @param {Array} args - 数值或范围数组
     * @returns {number} 最大值，无有效数值时返回 0
     *
     * @example
     * =MAX(1, 5, 3, 9, 2)      // 返回 9
     * =MAX(A1:D10)             // 找出区域中的最大值
     */
    MAX: (args) => {
        if (!_validateArgs(args, 1, Infinity, "MAX")) return "#VALUE!";

        const nums = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));

        if (nums.length === 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MAX: 没有有效的数值", { functionName: "MAX" });
            return 0; // Excel 行为：无有效数值返回 0
        }

        return Math.max(...nums);
    },

    /**
     * MIN - 最小值
     *
     * 返回一组数值中的最小值
     *
     * 语法: MIN(number1, [number2], ...)
     *
     * @param {Array} args - 数值或范围数组
     * @returns {number} 最小值，无有效数值时返回 0
     *
     * @example
     * =MIN(1, 5, 3, 9, 2)      // 返回 1
     * =MIN(A1:D10)             // 找出区域中的最小值
     */
    MIN: (args) => {
        if (!_validateArgs(args, 1, Infinity, "MIN")) return "#VALUE!";

        const nums = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));

        if (nums.length === 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MIN: 没有有效的数值", { functionName: "MIN" });
            return 0; // Excel 行为：无有效数值返回 0
        }

        return Math.min(...nums);
    },

    /**
     * ABS - 绝对值
     *
     * 返回数值的绝对值（不带符号的数值）
     *
     * 语法: ABS(number)
     *
     * @param {Array} args - 包含一个数值的数组
     * @returns {number|String} 绝对值，无法转换时返回 #VALUE!
     *
     * @example
     * =ABS(-100)               // 返回 100
     * =ABS(50)                 // 返回 50
     * =ABS(A1)                 // 返回 A1 的绝对值
     */
    ABS: (args) => {
        if (!_validateArgs(args, 1, 1, "ABS")) return "#VALUE!";

        const num = _toNum(args[0]);

        if (isNaN(num)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "ABS: 无法转换为数值", { value: args[0], functionName: "ABS" });
            return "#VALUE!";
        }

        return Math.abs(num);
    },

    /**
     * ROUND - 四舍五入
     *
     * 将数值四舍五入到指定位数的小数
     *
     * 语法: ROUND(number, num_digits)
     *
     * @param {Array} args - [要四舍五入的数值, 小数位数]
     * @returns {number|String} 四舍五入后的数值，参数无效时返回 #VALUE!
     *
     * @example
     * =ROUND(3.14159, 2)       // 返回 3.14
     * =ROUND(1234.5678, -2)    // 返回 1200
     * =ROUND(99.5, 0)          // 返回 100
     */
    ROUND: (args) => {
        if (!_validateArgs(args, 1, 2, "ROUND")) return "#VALUE!";

        const num = _toNum(args[0]);
        const digits = args[1] !== undefined ? _toNum(args[1]) : 0;

        if (isNaN(num)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "ROUND: 第一个参数无法转换为数值", { value: args[0], functionName: "ROUND" });
            return "#VALUE!";
        }

        if (isNaN(digits)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "ROUND: 第二个参数无法转换为数值", { value: args[1], functionName: "ROUND" });
            return "#VALUE!";
        }

        return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
    },

    /**
     * ROUNDUP - 向上舍入（远离零）
     *
     * 将数值向上舍入到指定位数，远离零方向
     *
     * 语法: ROUNDUP(number, num_digits)
     *
     * @param {Array} args - [要舍入的数值, 小数位数]
     * @returns {number|String} 向上舍入后的数值，参数无效时返回 #VALUE!
     *
     * @example
     * =ROUNDUP(3.14159, 2)     // 返回 3.15
     * =ROUNDUP(-3.14159, 2)    // 返回 -3.15
     * =ROUNDUP(1234, -2)       // 返回 1300
     */
    ROUNDUP: (args) => {
        if (!_validateArgs(args, 1, 2, "ROUNDUP")) return "#VALUE!";

        const num = _toNum(args[0]);
        const digits = args[1] !== undefined ? _toNum(args[1]) : 0;

        if (isNaN(num)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "ROUNDUP: 无法转换为数值", { value: args[0], functionName: "ROUNDUP" });
            return "#VALUE!";
        }
        if (isNaN(digits)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "ROUNDUP: 位数参数无效", { value: args[1], functionName: "ROUNDUP" });
            return "#VALUE!";
        }

        const factor = Math.pow(10, digits);
        return (num >= 0 ? Math.ceil(num * factor) : -Math.ceil(-num * factor)) / factor;
    },

    /**
     * ROUNDDOWN - 向下舍入（趋向零）
     *
     * 将数值向下舍入到指定位数，趋向零方向
     *
     * 语法: ROUNDDOWN(number, num_digits)
     *
     * @param {Array} args - [要舍入的数值, 小数位数]
     * @returns {number|String} 向下舍入后的数值，参数无效时返回 #VALUE!
     *
     * @example
     * =ROUNDDOWN(3.14159, 2)   // 返回 3.14
     * =ROUNDDOWN(-3.14159, 2)  // 返回 -3.14
     * =ROUNDDOWN(1234, -2)     // 返回 1200
     */
    ROUNDDOWN: (args) => {
        if (!_validateArgs(args, 1, 2, "ROUNDDOWN")) return "#VALUE!";

        const num = _toNum(args[0]);
        const digits = args[1] !== undefined ? _toNum(args[1]) : 0;

        if (isNaN(num)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "ROUNDDOWN: 无法转换为数值", { value: args[0], functionName: "ROUNDDOWN" });
            return "#VALUE!";
        }
        if (isNaN(digits)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "ROUNDDOWN: 位数参数无效", { value: args[1], functionName: "ROUNDDOWN" });
            return "#VALUE!";
        }

        const factor = Math.pow(10, digits);
        return (num >= 0 ? Math.floor(num * factor) : -Math.floor(-num * factor)) / factor;
    },

    /**
     * INT - 向下取整
     *
     * 将数值向下取整为最接近的整数
     *
     * 语法: INT(number)
     *
     * @param {Array} args - 包含一个数值的数组
     * @returns {number|String} 向下取整后的整数，参数无效时返回 #VALUE!
     *
     * @example
     * =INT(8.9)     // 返回 8
     * =INT(-8.9)    // 返回 -9
     */
    INT: (args) => {
        if (!_validateArgs(args, 1, 1, "INT")) return "#VALUE!";

        const num = _toNum(args[0]);
        if (isNaN(num)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "INT: 无法转换为数值", { value: args[0], functionName: "INT" });
            return "#VALUE!";
        }

        return Math.floor(num);
    },

    /**
     * MOD - 取模运算
     *
     * 返回两数相除的余数，结果符号与除数相同
     *
     * 语法: MOD(number, divisor)
     *
     * @param {Array} args - [被除数, 除数]
     * @returns {number|String} 余数，除数为 0 时返回 #DIV/0!
     *
     * @example
     * =MOD(7, 3)      // 返回 1
     * =MOD(-7, 3)     // 返回 2
     * =MOD(7, -3)     // 返回 -2
     */
    MOD: (args) => {
        if (!_validateArgs(args, 2, 2, "MOD")) return "#VALUE!";

        const n = _toNum(args[0]);
        const d = _toNum(args[1]);

        if (isNaN(n) || isNaN(d)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MOD: 参数无法转换为数值", { functionName: "MOD" });
            return "#VALUE!";
        }
        if (d === 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MOD: 除数为零", { functionName: "MOD" });
            return "#DIV/0!";
        }

        return n - d * Math.floor(n / d);
    },

    /**
     * POWER - 幂运算
     *
     * 返回底数按指定指数乘幂后的结果
     *
     * 语法: POWER(base, exponent)
     *
     * @param {Array} args - [底数, 指数]
     * @returns {number|String} 幂运算结果，溢出时返回 #NUM!
     *
     * @example
     * =POWER(2, 10)    // 返回 1024
     * =POWER(5, 0.5)   // 返回 2.236...
     */
    POWER: (args) => {
        if (!_validateArgs(args, 2, 2, "POWER")) return "#VALUE!";

        const base = _toNum(args[0]);
        const exponent = _toNum(args[1]);

        if (isNaN(base) || isNaN(exponent)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "POWER: 参数无法转换为数值", { functionName: "POWER" });
            return "#VALUE!";
        }

        const result = Math.pow(base, exponent);
        if (!isFinite(result)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "POWER: 结果溢出", { base, exponent, functionName: "POWER" });
            return "#NUM!";
        }

        return result;
    },

    /**
     * SUMPRODUCT - 数组乘积求和
     *
     * 将多个数组对应元素相乘后求和
     *
     * 语法: SUMPRODUCT(array1, [array2], ...)
     *
     * @param {Array} args - 一个或多个数组
     * @returns {number|String} 乘积之和，数组长度不一致时返回 #VALUE!
     *
     * @example
     * =SUMPRODUCT({1,2;3,4})           // 返回 10（单数组求和）
     * =SUMPRODUCT({1,2},{3,4})         // 返回 11（1*3 + 2*4）
     * =SUMPRODUCT(A1:B3,C1:D3)        // 两区域对应乘积求和
     */
    SUMPRODUCT: (args) => {
        if (!_validateArgs(args, 1, Infinity, "SUMPRODUCT")) return "#VALUE!";

        const arrays = args.map((a) => (Array.isArray(a) ? _flatten(a) : [a]));
        const len = arrays[0].length;

        for (let i = 1; i < arrays.length; i++) {
            if (arrays[i].length !== len) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "SUMPRODUCT: 数组长度不一致", { functionName: "SUMPRODUCT" });
                return "#VALUE!";
            }
        }

        let sum = 0;
        for (let i = 0; i < len; i++) {
            let product = 1;
            for (let j = 0; j < arrays.length; j++) {
                const n = _toNum(arrays[j][i]);
                if (isNaN(n)) {
                    product = 0;
                    break;
                }
                product *= n;
            }
            sum += product;
        }

        return sum;
    },

    /**
     * SUBTOTAL - 分类汇总
     *
     * 返回列表或数据库的分类汇总
     *
     * 语法: SUBTOTAL(function_num, ref1, [ref2], ...)
     *
     * function_num 取值：
     * - 1: AVERAGE（平均值）
     * - 2: SUM（求和）
     * - 3: COUNT（计数）
     * - 4: MAX（最大值）
     * - 5: MIN（最小值）
     * - 6: PRODUCT（乘积）
     * - 7: STDEV（样本标准差）
     * - 8: STDEVP（总体标准差）
     * - 9: SUM（求和，同 2）
     * - 10: VAR（样本方差）
     * - 11: VARP（总体方差）
     *
     * @param {Array} args - [函数编号, 数据范围1, 数据范围2, ...]
     * @returns {number|String} 分类汇总结果，参数无效时返回 #VALUE!
     *
     * @example
     * =SUBTOTAL(9, A1:A10)     // 对 A1:A10 求和
     * =SUBTOTAL(1, B1:B20)     // 对 B1:B20 求平均值
     * =SUBTOTAL(7, C1:C5)      // 对 C1:C5 求样本标准差
     */
    SUBTOTAL: (args) => {
        if (!_validateArgs(args, 2, Infinity, "SUBTOTAL")) return "#VALUE!";

        const funcNum = _toNum(args[0]);
        if (isNaN(funcNum) || funcNum < 1 || funcNum > 11) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "SUBTOTAL: 函数编号无效，需为 1-11", { value: args[0], functionName: "SUBTOTAL" });
            return "#VALUE!";
        }

        const flat = _flatten(args.slice(1))
            .map(_toNum)
            .filter((v) => !isNaN(v));

        if (flat.length === 0) return 0;

        switch (funcNum) {
            case 1:
                return flat.reduce((a, b) => a + b, 0) / flat.length;
            case 2:
                return flat.reduce((a, b) => a + b, 0);
            case 3:
                return flat.length;
            case 4:
                return Math.max(...flat);
            case 5:
                return Math.min(...flat);
            case 6:
                return flat.reduce((a, b) => a * b, 1);
            case 7:
                return _stdev(flat, true);
            case 8:
                return _stdev(flat);
            case 9:
                return flat.reduce((a, b) => a + b, 0);
            case 10:
                return _variance(flat, true);
            case 11:
                return _variance(flat);
            default:
                return "#VALUE!";
        }
    },
};

/**
 * 计算标准差
 *
 * @param {number[]} arr - 数值数组
 * @param {boolean} [isSample=false] - 是否为样本标准差（true=样本，false=总体）
 * @returns {number|String} 标准差，数据不足时返回 #DIV/0!
 */
function _stdev(arr, isSample) {
    const n = arr.length;
    if (n < (isSample ? 2 : 1)) {
        errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, isSample ? "样本标准差至少需要2个数据" : "总体标准差至少需要1个数据", {
            count: n,
            isSample,
            functionName: "_stdev",
        });
        return "#DIV/0!";
    }
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const ss = arr.reduce((a, v) => a + (v - mean) ** 2, 0);
    return Math.sqrt(ss / (isSample ? n - 1 : n));
}

/**
 * 计算方差
 *
 * @param {number[]} arr - 数值数组
 * @param {boolean} [isSample=false] - 是否为样本方差（true=样本，false=总体）
 * @returns {number|String} 方差，数据不足时返回 #DIV/0!
 */
function _variance(arr, isSample) {
    const n = arr.length;
    if (n < (isSample ? 2 : 1)) {
        errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, isSample ? "样本方差至少需要2个数据" : "总体方差至少需要1个数据", {
            count: n,
            isSample,
            functionName: "_variance",
        });
        return "#DIV/0!";
    }
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const ss = arr.reduce((a, v) => a + (v - mean) ** 2, 0);
    return ss / (isSample ? n - 1 : n);
}
