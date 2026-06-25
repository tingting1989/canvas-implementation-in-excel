/**
 * 统计函数
 *
 * 提供数据统计和计数功能：
 * - COUNT: 统计数值个数
 * - COUNTA: 统计非空单元格数
 * - COUNTBLANK: 统计空单元格数
 *
 * @module formula/functions/statistical
 */

import { isNumber } from "../../core/utils.js";
import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { _flatten, _isBlank, _validateArgs } from "./utils/index.js";

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const statisticalFunctions = {
    /**
     * COUNT - 统计数值个数
     *
     * 计算范围内包含数值的单元格数量
     *
     * 语法: COUNT(value1, [value2], ...)
     *
     * @param {Array} args - 值或范围数组
     * @returns {number} 数值型数据的个数
     *
     * @example
     * =COUNT(1, "a", 3, "", 5)   // 返回 3 (只统计 1, 3, 5)
     * =COUNT(A1:A100)            // 统计 A 列中的数值个数
     */
    COUNT: (args) => {
        if (!_validateArgs(args, 1, Infinity, "COUNT")) return "#VALUE!";

        return _flatten(args).filter((v) => isNumber(v)).length;
    },

    /**
     * COUNTA - 统计非空单元格数
     *
     * 计算范围内非空单元格的数量（包括文本、数值、错误值等）
     *
     * 语法: COUNTA(value1, [value2], ...)
     *
     * @param {Array} args - 值或范围数组
     * @returns {number} 非空单元格的个数
     *
     * @example
     * =COUNTA(1, "", "text", null)  // 返回 2 (统计 1 和 "text")
     * =COUNTA(A1:D10)              // 统计区域中非空单元格数
     */
    COUNTA: (args) => {
        if (!_validateArgs(args, 1, Infinity, "COUNTA")) return "#VALUE!";

        let count = 0;
        for (const item of args) {
            if (Array.isArray(item)) {
                const flattened = _flatten(item);
                if (flattened.length === 0) {
                    count++;
                } else {
                    count += flattened.filter((v) => !_isBlank(v)).length;
                }
            } else if (!_isBlank(item)) {
                count++;
            }
        }
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
     * @param {Array} args - 包含一个范围的数组
     * @returns {number} 空单元格的数量
     *
     * @example
     * =COUNTBLANK(A1:A10)              // 计算 A1:A10 中空单元格数
     * =COUNTBLANK(A1:D10)              // 计算整个区域中的空单元格
     */
    COUNTBLANK: (args) => {
        if (!_validateArgs(args, 1, Infinity, "COUNTBLANK")) return "#VALUE!";

        const flatRange = _flatten(args);

        let blankCount = 0;
        for (const value of flatRange) {
            if (_isBlank(value)) {
                blankCount++;
            }
        }

        return blankCount;
    },
};
