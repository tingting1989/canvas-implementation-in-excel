/**
 * 统计函数
 *
 * 提供数据统计和计数功能：
 * - COUNT: 统计数值个数
 * - COUNTA: 统计非空单元格数
 * - COUNTBLANK: 统计空单元格数
 * - STDEV: 样本标准差
 * - STDEVP: 总体标准差
 * - VAR: 样本方差
 * - VARP: 总体方差
 * - MEDIAN: 中位数
 * - RANK: 排名
 *
 * @module formula/functions/statistical
 */

import { isNumber } from "../../../utils/helper.js";
import { _flatten, _isBlank, _toNum, _validateArgs, _forEachLeaf, _collectNums } from "./utils";
import { ERROR_CODE } from "../../../constants/errorCodes.js";
import { errorHandler } from "../../../core/ErrorHandler.js";

type FormulaResult = number | string;

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const statisticalFunctions: Record<string, (args: unknown[]) => FormulaResult> = {
    /**
     * COUNT - 统计数值个数
     *
     * 计算范围内包含数值的单元格数量
     *
     * 语法: COUNT(value1, [value2], ...)
     *
     * @param args - 值或范围数组
     * @returns 数值型数据的个数
     *
     * @example
     * =COUNT(1, "a", 3, "", 5)   // 返回 3 (只统计 1, 3, 5)
     * =COUNT(A1:A100)            // 统计 A 列中的数值个数
     */
    COUNT: (args) => {
        if (!_validateArgs(args, 1, Infinity, "COUNT")) return "#VALUE!";

        let count = 0;
        _forEachLeaf(args, (v) => {
            if (isNumber(v)) count++;
        });
        return count;
    },

    /**
     * COUNTA - 统计非空单元格数
     *
     * 计算范围内非空单元格的数量（包括文本、数值、错误值等）
     *
     * 语法: COUNTA(value1, [value2], ...)
     *
     * @param args - 值或范围数组
     * @returns 非空单元格的个数
     *
     * @example
     * =COUNTA(1, "", "text", null)  // 返回 2 (统计 1 和 "text")
     * =COUNTA(A1:D10)              // 统计区域中非空单元格数
     */
    COUNTA: (args) => {
        if (!_validateArgs(args, 1, Infinity, "COUNTA")) return "#VALUE!";

        let count = 0;
        _forEachLeaf(args, (v) => {
            if (!_isBlank(v)) count++;
        });
        return count;
    },

    /**
     * COUNTBLANK - 统计空单元格数
     *
     * 计算范围内空单元格的数量。空单元格包括：
     * - 空字符串 ("")
     * - null 值
     * - undefined 值
     *
     * 注意：与 Excel 行为一致，公式返回的空字符串也算空单元格
     *
     * 语法: COUNTBLANK(range)
     *
     * @param args - 包含一个范围的数组
     * @returns 空单元格的数量
     *
     * @example
     * =COUNTBLANK(A1:A10)              // 计算 A1:A10 中空单元格数
     * =COUNTBLANK(A1:D10)              // 计算整个区域中的空单元格
     */
    COUNTBLANK: (args) => {
        if (!_validateArgs(args, 1, Infinity, "COUNTBLANK")) return "#VALUE!";

        let blankCount = 0;
        _forEachLeaf(args, (v) => {
            if (_isBlank(v)) blankCount++;
        });
        return blankCount;
    },

    /**
     * STDEV - 样本标准差
     *
     * 基于样本估算标准差（分母为 n-1）
     *
     * 语法: STDEV(number1, [number2], ...)
     *
     * @param args - 数值或范围数组
     * @returns 样本标准差，数据不足时返回 #DIV/0!
     *
     * @example
     * =STDEV(2, 4, 4, 4, 5, 5, 7, 9)   // 返回约 2.138
     * =STDEV(A1:A10)                    // A1:A10 的样本标准差
     */
    STDEV: (args) => {
        if (!_validateArgs(args, 1, Infinity, "STDEV")) return "#VALUE!";

        const nums = _collectNums(args);
        if (nums.length < 2) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "STDEV: 样本至少需要2个数据", { count: nums.length, functionName: "STDEV" });
            return "#DIV/0!";
        }

        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const ss = nums.reduce((a, v) => a + (v - mean) ** 2, 0);
        return Math.sqrt(ss / (nums.length - 1));
    },

    /**
     * STDEVP - 总体标准差
     *
     * 基于整个总体计算标准差（分母为 n）
     *
     * 语法: STDEVP(number1, [number2], ...)
     *
     * @param args - 数值或范围数组
     * @returns 总体标准差，无数据时返回 #DIV/0!
     *
     * @example
     * =STDEVP(2, 4, 4, 4, 5, 5, 7, 9)  // 返回约 1.987
     * =STDEVP(A1:A10)                   // A1:A10 的总体标准差
     */
    STDEVP: (args) => {
        if (!_validateArgs(args, 1, Infinity, "STDEVP")) return "#VALUE!";

        const nums = _collectNums(args);
        if (nums.length < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "STDEVP: 至少需要1个数据", { count: nums.length, functionName: "STDEVP" });
            return "#DIV/0!";
        }

        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const ss = nums.reduce((a, v) => a + (v - mean) ** 2, 0);
        return Math.sqrt(ss / nums.length);
    },

    /**
     * VAR - 样本方差
     *
     * 基于样本估算方差（分母为 n-1）
     *
     * 语法: VAR(number1, [number2], ...)
     *
     * @param args - 数值或范围数组
     * @returns 样本方差，数据不足时返回 #DIV/0!
     *
     * @example
     * =VAR(1, 2, 3, 4, 5)    // 返回 2.5
     * =VAR(A1:A10)            // A1:A10 的样本方差
     */
    VAR: (args) => {
        if (!_validateArgs(args, 1, Infinity, "VAR")) return "#VALUE!";

        const nums = _collectNums(args);
        if (nums.length < 2) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "VAR: 样本至少需要2个数据", { count: nums.length, functionName: "VAR" });
            return "#DIV/0!";
        }

        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const ss = nums.reduce((a, v) => a + (v - mean) ** 2, 0);
        return ss / (nums.length - 1);
    },

    /**
     * VARP - 总体方差
     *
     * 基于整个总体计算方差（分母为 n）
     *
     * 语法: VARP(number1, [number2], ...)
     *
     * @param args - 数值或范围数组
     * @returns 总体方差，无数据时返回 #DIV/0!
     *
     * @example
     * =VARP(1, 2, 3, 4, 5)   // 返回 2
     * =VARP(A1:A10)           // A1:A10 的总体方差
     */
    VARP: (args) => {
        if (!_validateArgs(args, 1, Infinity, "VARP")) return "#VALUE!";

        const nums = _collectNums(args);
        if (nums.length < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "VARP: 至少需要1个数据", { count: nums.length, functionName: "VARP" });
            return "#DIV/0!";
        }

        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const ss = nums.reduce((a, v) => a + (v - mean) ** 2, 0);
        return ss / nums.length;
    },

    /**
     * MEDIAN - 中位数
     *
     * 返回一组数值的中位数
     *
     * 语法: MEDIAN(number1, [number2], ...)
     *
     * @param args - 数值或范围数组
     * @returns 中位数，无数据时返回 #NUM!
     *
     * @example
     * =MEDIAN(1, 2, 3, 4, 5)    // 返回 3
     * =MEDIAN(1, 2, 3, 4)       // 返回 2.5
     * =MEDIAN(A1:A10)           // A1:A10 的中位数
     */
    MEDIAN: (args) => {
        if (!_validateArgs(args, 1, Infinity, "MEDIAN")) return "#VALUE!";

        const nums = _collectNums(args);
        if (nums.length === 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MEDIAN: 无有效数据", { functionName: "MEDIAN" });
            return "#NUM!";
        }

        nums.sort((a, b) => a - b);
        const mid = Math.floor(nums.length / 2);

        if (nums.length % 2 === 0) {
            return (nums[mid - 1] + nums[mid]) / 2;
        }
        return nums[mid];
    },

    /**
     * RANK - 排名函数
     *
     * 返回数值在数据集中的排名
     *
     * 语法: RANK(number, ref, [order])
     *
     * @param args - [数值, 数据范围, 排序方式(可选，0=降序，1=升序)]
     * @returns 排名位置，数值不在范围中时返回 #N/A
     *
     * @example
     * =RANK(5, A1:A10)          // 降序排名（默认）
     * =RANK(5, A1:A10, 1)       // 升序排名
     * =RANK(3, {7,5,3,1})       // 返回 3（降序第3名）
     */
    RANK: (args) => {
        if (!_validateArgs(args, 2, 3, "RANK")) return "#VALUE!";

        const number = _toNum(args[0]);
        if (isNaN(number)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "RANK: 数值参数无效", { value: args[0], functionName: "RANK" });
            return "#VALUE!";
        }

        const ref = _flatten(args[1] as unknown[])
            .map(_toNum)
            .filter((v) => !isNaN(v));
        const order = args[2] !== undefined ? _toNum(args[2]) : 0;

        const sorted = [...ref].sort((a, b) => (order === 0 ? b - a : a - b));
        const rank = sorted.findIndex((v) => Math.abs(v - number) < 1e-10);

        if (rank === -1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "RANK: 数值不在参考范围中", { number, functionName: "RANK" });
            return "#N/A";
        }

        return rank + 1;
    },
};
