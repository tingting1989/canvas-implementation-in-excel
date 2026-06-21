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
 *
 * @module formula/functions/math
 */

import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { _flatten, _toNum, _validateArgs } from './utils/index.js';

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
    'SUM': (args) => {
        if (!_validateArgs(args, 1, Infinity, 'SUM')) return "#VALUE!";
        
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
    'AVERAGE': (args) => {
        if (!_validateArgs(args, 1, Infinity, 'AVERAGE')) return "#VALUE!";
        
        const flat = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));
        
        if (flat.length === 0) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_DIV_ZERO,
                'AVERAGE: 没有有效的数值可计算',
                { functionName: 'AVERAGE' }
            );
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
    'MAX': (args) => {
        if (!_validateArgs(args, 1, Infinity, 'MAX')) return "#VALUE!";
        
        const nums = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));
        
        if (nums.length === 0) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_EVAL_ERROR,
                'MAX: 没有有效的数值',
                { functionName: 'MAX' }
            );
            return 0;  // Excel 行为：无有效数值返回 0
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
    'MIN': (args) => {
        if (!_validateArgs(args, 1, Infinity, 'MIN')) return "#VALUE!";
        
        const nums = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));
        
        if (nums.length === 0) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_EVAL_ERROR,
                'MIN: 没有有效的数值',
                { functionName: 'MIN' }
            );
            return 0;  // Excel 行为：无有效数值返回 0
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
    'ABS': (args) => {
        if (!_validateArgs(args, 1, 1, 'ABS')) return "#VALUE!";
        
        const num = _toNum(args[0]);
        
        if (isNaN(num)) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_EVAL_ERROR,
                'ABS: 无法转换为数值',
                { value: args[0], functionName: 'ABS' }
            );
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
    'ROUND': (args) => {
        if (!_validateArgs(args, 1, 2, 'ROUND')) return "#VALUE!";
        
        const num = _toNum(args[0]);
        const digits = args[1] !== undefined ? _toNum(args[1]) : 0;
        
        if (isNaN(num)) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_EVAL_ERROR,
                'ROUND: 第一个参数无法转换为数值',
                { value: args[0], functionName: 'ROUND' }
            );
            return "#VALUE!";
        }
        
        if (isNaN(digits) || digits < 0) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_EVAL_ERROR,
                'ROUND: 第二个参数必须是非负整数',
                { value: args[1], functionName: 'ROUND' }
            );
            return "#VALUE!";
        }
        
        return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
    }
};