/**
 * 条件函数
 *
 * 提供条件判断和数据筛选功能：
 * - SUMIF: 单条件求和
 * - SUMIFS: 多条件求和
 * - COUNTIF: 单条件计数
 * - COUNTIFS: 多条件计数
 *
 * TODO: 计划添加
 * - AVERAGEIF/AVERAGEIFS: 条件平均值
 * - MAXIFS/MINIFS: 条件极值
 *
 * @module formula/functions/conditional
 */

import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { _flatten, _toNum, _validateArgs, _matchCriteria, _matchWildcard } from './utils/index.js';

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const conditionalFunctions = {
    /**
     * SUMIF - 单条件求和
     *
     * 对满足条件的单元格进行求和
     *
     * 语法: SUMIF(range, criteria, [sum_range])
     *
     * @param {Array} args - [条件范围, 条件表达式, 求和范围(可选)]
     * @returns {number|String} 满足条件的数值之和，错误时返回 #VALUE!
     *
     * 支持的条件格式：
     * - 数值比较: ">100", "<=50", "=200"
     * - 文本匹配: "苹果", "*张*"(通配符)
     * - 精确匹配: 100 (数值)
     *
     * @example
     * =SUMIF(A1:A10, ">100")                    // 求 A 列大于 100 的值的和
     * =SUMIF(B1:B10, "苹果", C1:C10)            // B列是"苹果"时，对C列求和
     * =SUMIF(A1:A10, "*张*")                    // 包含"张"字的单元格求和
     */
    'SUMIF': (args) => {
        if (!_validateArgs(args, 2, 3, 'SUMIF')) return "#VALUE!";

        const range = args[0];
        const criteria = args[1];
        const sumRange = args[2] !== undefined ? args[2] : range;

        const flatRange = Array.isArray(range) ? _flatten(range) : [range];
        const flatSumRange = Array.isArray(sumRange) ? _flatten(sumRange) : [sumRange];

        if (flatRange.length !== flatSumRange.length) {
            errorHandler.handle(
                ERROR_CODE.FORMULA_EVAL_ERROR,
                'SUMIF: range 和 sum_range 长度不匹配',
                { 
                    rangeLength: flatRange.length, 
                    sumRangeLength: flatSumRange.length,
                    functionName: 'SUMIF'
                }
            );
            return "#VALUE!";
        }

        let sum = 0;
        for (let i = 0; i < flatRange.length; i++) {
            try {
                if (_matchCriteria(flatRange[i], criteria)) {
                    const num = _toNum(flatSumRange[i]);
                    if (!isNaN(num)) {
                        sum += num;
                    }
                }
            } catch (e) {
                errorHandler.warn(
                    ERROR_CODE.FORMULA_EVAL_ERROR,
                    `SUMIF: 条件匹配失败 at index ${i}`,
                    { 
                        error: e.message, 
                        index: i,
                        functionName: 'SUMIF'
                    }
                );
                continue;
            }
        }

        return sum;
    },

    /**
     * SUMIFS - 多条件求和
     *
     * 对同时满足多个条件的单元格进行求和
     *
     * 语法: SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)
     *
     * @param {Array} args - [求和范围, 条件范围1, 条件1, 条件范围2, 条件2, ...]
     * @returns {number|String} 同时满足所有条件的数值之和，错误时返回 #VALUE!
     *
     * 特点：
     * - 参数数量必须为奇数（sum_range + 成对的条件）
     * - 所有条件范围的长度必须与 sum_range 一致
     * - 条件之间是 AND 关系（必须同时满足）
     *
     * @example
     * =SUMIFS(C2:C100, B2:B100, "北京", D2:D100, ">10000")
     *   // 北京地区且销售额>10000的订单总和
     *
     * =SUMIFS(A1:A10, B1:B10, ">=2024-01-01", B1:B10, "<=2024-12-31")
     *   // 2024年数据总和
     */
    'SUMIFS': (args) => {
        if (!_validateArgs(args, 3, Infinity, 'SUMIFS')) return "#VALUE!";
        
        if ((args.length - 1) % 2 !== 0) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_ARGUMENT_COUNT_INVALID,
                'SUMIFS 需要奇数个参数（sum_range + 成对的 criteria_range 和 criteria）',
                { 
                    received: args.length, 
                    functionName: 'SUMIFS'
                }
            );
            return "#VALUE!";
        }

        const sumRange = args[0];
        const flatSumRange = Array.isArray(sumRange) ? _flatten(sumRange) : [sumRange];

        const conditionPairs = [];
        for (let i = 1; i < args.length; i += 2) {
            const criteriaRange = args[i];
            const criteria = args[i + 1];
            
            conditionPairs.push({
                range: Array.isArray(criteriaRange) ? _flatten(criteriaRange) : [criteriaRange],
                criteria: criteria,
                pairIndex: Math.floor((i - 1) / 2)
            });
        }

        for (const pair of conditionPairs) {
            if (pair.range.length !== flatSumRange.length) {
                errorHandler.handle(
                    ERROR_CODE.FORMULA_EVAL_ERROR,
                    `SUMIFS: 条件范围 ${pair.pairIndex + 1} 与 sum_range 长度不匹配`,
                    { 
                        expectedLength: flatSumRange.length, 
                        actualLength: pair.range.length,
                        pairIndex: pair.pairIndex,
                        functionName: 'SUMIFS'
                    }
                );
                return "#VALUE!";
            }
        }

        let sum = 0;
        for (let i = 0; i < flatSumRange.length; i++) {
            let allMatch = true;

            for (const pair of conditionPairs) {
                try {
                    if (!_matchCriteria(pair.range[i], pair.criteria)) {
                        allMatch = false;
                        break;
                    }
                } catch (e) {
                    errorHandler.warn(
                        ERROR_CODE.FORMULA_EVAL_ERROR,
                        `SUMIFS: 条件 ${pair.pairIndex + 1} 匹配失败 at index ${i}`,
                        { 
                            error: e.message, 
                            index: i,
                            pairIndex: pair.pairIndex,
                            functionName: 'SUMIFS'
                        }
                    );
                    allMatch = false;
                    break;
                }
            }

            if (allMatch) {
                const num = _toNum(flatSumRange[i]);
                if (!isNaN(num)) {
                    sum += num;
                }
            }
        }

        return sum;
    },

    /**
     * COUNTIF - 单条件计数函数
     *
     * 统计范围内满足指定条件的单元格数量
     *
     * 语法: COUNTIF(range, criteria)
     *
     * 特点：
     * - 支持多种条件格式（比较运算符、通配符、精确匹配）
     * - 自动忽略空值（除非条件是统计空值）
     * - 对文本、数值都有效
     *
     * @param {Array} args - [统计范围, 条件表达式]
     * @returns {number|String} 满足条件的单元格数量，错误时返回 #VALUE!
     *
     * 支持的条件格式：
     * - 数值比较: ">100", "<=50", "=200", "<>0"(不等于)
     * - 文本匹配: "苹果", "*张*"(包含), "张?"(以张开头+1字符)
     * - 通配符: "*" (任意多个字符), "?" (单个字符)
     * - 精确匹配: 100 (数值), "文本" (字符串)
     * - 空值统计: "" (空字符串)
     *
     * @example
     * =COUNTIF(A1:A10, ">100")              // 统计大于100的单元格数量
     * =COUNTIF(B1:B20, "已完成")             // 统计状态为"已完成"的数量
     * =COUNTIF(C1:C15, "*北京*")             // 统计包含"北京"的数量
     * =COUNTIF(D1:D100, "")                  // 统计空单元格数量
     * =COUNTIF(E1:E50, "<>")                 // 统计非空单元格数量
     */
    'COUNTIF': (args) => {
        if (!_validateArgs(args, 2, 2, 'COUNTIF')) return "#VALUE!";

        const range = args[0];
        const criteria = args[1];

        const flatRange = Array.isArray(range) ? _flatten(range) : [range];

        let count = 0;
        for (let i = 0; i < flatRange.length; i++) {
            try {
                if (_matchCriteria(flatRange[i], criteria)) {
                    count++;
                }
            } catch (e) {
                errorHandler.warn(
                    ERROR_CODE.FORMULA_EVAL_ERROR,
                    `COUNTIF: 条件匹配失败 at index ${i}`,
                    { 
                        error: e.message, 
                        index: i,
                        value: flatRange[i],
                        criteria: criteria,
                        functionName: 'COUNTIF'
                    }
                );
                continue;
            }
        }

        return count;
    },

    /**
     * COUNTIFS - 多条件计数函数
     *
     * 统计同时满足多个条件的单元格数量
     *
     * 语法: COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], ...)
     *
     * 特点：
     * - 参数数量必须为偶数（成对的 criteria_range 和 criteria）
     * - 所有条件范围的长度必须一致
     * - 条件之间是 AND 关系（必须同时满足所有条件）
     * - 每个条件范围可以不同（与 SUMIFS 不同，没有单独的 sum_range）
     *
     * @param {Array} args - [条件范围1, 条件1, 条件范围2, 条件2, ...]
     * @returns {number|String} 同时满足所有条件的单元格数量，错误时返回 #VALUE!
     *
     * @example
     * =COUNTIFS(A1:A100, ">18", B1:B100, "男")
     *   // 统计年龄>18且性别为"男"的数量
     *
     * =COUNTIFS(C2:C50, ">=2024-01-01", C2:C50, "<=2024-03-31", D2:D50, "已完成")
     *   // 统计2024年Q1且状态为"已完成"的项目数
     *
     * =COUNTIFS(E1:E200, "<>北京", F1:F200, ">50000")
     *   // 统计非北京地区且金额>50000的记录数
     */
    'COUNTIFS': (args) => {
        if (!_validateArgs(args, 2, Infinity, 'COUNTIFS')) return "#VALUE!";
        
        // 参数数量必须是偶数（成对的条件范围和条件）
        if (args.length % 2 !== 0) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_ARGUMENT_COUNT_INVALID,
                'COUNTIFS 需要偶数个参数（成对的 criteria_range 和 criteria）',
                { 
                    received: args.length, 
                    functionName: 'COUNTIFS'
                }
            );
            return "#VALUE!";
        }

        const conditionPairs = [];
        for (let i = 0; i < args.length; i += 2) {
            const criteriaRange = args[i];
            const criteria = args[i + 1];
            
            conditionPairs.push({
                range: Array.isArray(criteriaRange) ? _flatten(criteriaRange) : [criteriaRange],
                criteria: criteria,
                pairIndex: Math.floor(i / 2)
            });
        }

        // 验证所有条件范围长度一致
        const referenceLength = conditionPairs[0].range.length;
        for (const pair of conditionPairs) {
            if (pair.range.length !== referenceLength) {
                errorHandler.handle(
                    ERROR_CODE.FORMULA_EVAL_ERROR,
                    `COUNTIFS: 条件范围 ${pair.pairIndex + 1} 与条件范围 1 长度不匹配`,
                    { 
                        expectedLength: referenceLength, 
                        actualLength: pair.range.length,
                        pairIndex: pair.pairIndex,
                        functionName: 'COUNTIFS'
                    }
                );
                return "#VALUE!";
            }
        }

        let count = 0;
        for (let i = 0; i < referenceLength; i++) {
            let allMatch = true;

            for (const pair of conditionPairs) {
                try {
                    if (!_matchCriteria(pair.range[i], pair.criteria)) {
                        allMatch = false;
                        break;
                    }
                } catch (e) {
                    errorHandler.warn(
                        ERROR_CODE.FORMULA_EVAL_ERROR,
                        `COUNTIFS: 条件 ${pair.pairIndex + 1} 匹配失败 at index ${i}`,
                        { 
                            error: e.message, 
                            index: i,
                            pairIndex: pair.pairIndex,
                            functionName: 'COUNTIFS'
                        }
                    );
                    allMatch = false;
                    break;
                }
            }

            if (allMatch) {
                count++;
            }
        }

        return count;
    }
};