/**
 * 条件函数
 *
 * 提供条件判断和数据筛选功能：
 * - SUMIF: 单条件求和
 * - SUMIFS: 多条件求和
 * - COUNTIF: 单条件计数
 * - COUNTIFS: 多条件计数
 * - IFERROR: 错误处理
 * - IFNA: N/A 值处理
 *
 * @module formula/functions/conditional
 */

import { errorHandler } from "../../../core/ErrorHandler.js";
import { isString } from "../../../utils/helper.js";
import { _toNum, _validateArgs, _matchCriteria, _flatten } from "./utils";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

type FormulaResult = number | string | unknown;

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const conditionalFunctions: Record<string, (args: unknown[]) => FormulaResult> = {
    /**
     * SUMIF - 单条件求和
     *
     * 对满足条件的单元格进行求和
     *
     * 语法: SUMIF(range, criteria, [sum_range])
     *
     * @param args - [条件范围, 条件表达式, 求和范围(可选)]
     * @returns 满足条件的数值之和，错误时返回 #VALUE!
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
    SUMIF: (args) => {
        if (!_validateArgs(args, 2, 3, "SUMIF")) return "#VALUE!";

        const range = args[0];
        const criteria = args[1];
        const sumRange = args[2] !== undefined ? args[2] : range;

        const flatRange = Array.isArray(range) ? _flatten(range) : [range];
        const flatSumRange = Array.isArray(sumRange) ? _flatten(sumRange) : [sumRange];

        if (flatRange.length !== flatSumRange.length) {
            errorHandler.error(ERROR_CODE.FORMULA_EVAL_ERROR, "SUMIF: range 和 sum_range 长度不匹配", {
                rangeLength: flatRange.length,
                sumRangeLength: flatSumRange.length,
                functionName: "SUMIF",
            });
            return "#VALUE!";
        }

        let sum = 0;
        for (let i = 0; i < flatRange.length; i++) {
            try {
                if (_matchCriteria(flatRange[i], criteria as string | number)) {
                    const num = _toNum(flatSumRange[i]);
                    if (!isNaN(num)) {
                        sum += num;
                    }
                }
            } catch (e) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `SUMIF: 条件匹配失败 at index ${i}`, {
                    error: (e as Error).message,
                    index: i,
                    functionName: "SUMIF",
                });
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
     * @param args - [求和范围, 条件范围1, 条件1, 条件范围2, 条件2, ...]
     * @returns 同时满足所有条件的数值之和，错误时返回 #VALUE!
     *
     * @example
     * =SUMIFS(C2:C100, B2:B100, "北京", D2:D100, ">10000")
     * =SUMIFS(A1:A10, B1:B10, ">=2024-01-01", B1:B10, "<=2024-12-31")
     */
    SUMIFS: (args) => {
        if (!_validateArgs(args, 3, Infinity, "SUMIFS")) return "#VALUE!";

        if ((args.length - 1) % 2 !== 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_ARGUMENT_COUNT_INVALID, "SUMIFS 需要奇数个参数（sum_range + 成对的 criteria_range 和 criteria）", {
                received: args.length,
                functionName: "SUMIFS",
            });
            return "#VALUE!";
        }

        const sumRange = args[0];
        const flatSumRange = Array.isArray(sumRange) ? _flatten(sumRange) : [sumRange];

        const conditionPairs: { range: unknown[]; criteria: unknown; pairIndex: number }[] = [];
        for (let i = 1; i < args.length; i += 2) {
            const criteriaRange = args[i];
            const criteria = args[i + 1];

            conditionPairs.push({
                range: Array.isArray(criteriaRange) ? _flatten(criteriaRange) : [criteriaRange],
                criteria: criteria,
                pairIndex: Math.floor((i - 1) / 2),
            });
        }

        for (const pair of conditionPairs) {
            if (pair.range.length !== flatSumRange.length) {
                errorHandler.error(ERROR_CODE.FORMULA_EVAL_ERROR, `SUMIFS: 条件范围 ${pair.pairIndex + 1} 与 sum_range 长度不匹配`, {
                    expectedLength: flatSumRange.length,
                    actualLength: pair.range.length,
                    pairIndex: pair.pairIndex,
                    functionName: "SUMIFS",
                });
                return "#VALUE!";
            }
        }

        let sum = 0;
        for (let i = 0; i < flatSumRange.length; i++) {
            let allMatch = true;

            for (const pair of conditionPairs) {
                try {
                    if (!_matchCriteria(pair.range[i], pair.criteria as string | number)) {
                        allMatch = false;
                        break;
                    }
                } catch (e) {
                    errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `SUMIFS: 条件 ${pair.pairIndex + 1} 匹配失败 at index ${i}`, {
                        error: (e as Error).message,
                        index: i,
                        pairIndex: pair.pairIndex,
                        functionName: "SUMIFS",
                    });
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
     * @param args - [统计范围, 条件表达式]
     * @returns 满足条件的单元格数量，错误时返回 #VALUE!
     *
     * @example
     * =COUNTIF(A1:A10, ">100")              // 统计大于100的单元格数量
     * =COUNTIF(B1:B20, "已完成")             // 统计状态为"已完成"的数量
     */
    COUNTIF: (args) => {
        if (!_validateArgs(args, 2, 2, "COUNTIF")) return "#VALUE!";

        const range = args[0];
        const criteria = args[1];

        const flatRange = Array.isArray(range) ? _flatten(range) : [range];

        let count = 0;
        for (let i = 0; i < flatRange.length; i++) {
            try {
                if (_matchCriteria(flatRange[i], criteria as string | number)) {
                    count++;
                }
            } catch (e) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `COUNTIF: 条件匹配失败 at index ${i}`, {
                    error: (e as Error).message,
                    index: i,
                    value: flatRange[i],
                    criteria: criteria,
                    functionName: "COUNTIF",
                });
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
     * @param args - [条件范围1, 条件1, 条件范围2, 条件2, ...]
     * @returns 同时满足所有条件的单元格数量，错误时返回 #VALUE!
     *
     * @example
     * =COUNTIFS(A1:A100, ">18", B1:B100, "男")
     *   // 统计年龄>18且性别为"男"的数量
     */
    COUNTIFS: (args) => {
        if (!_validateArgs(args, 2, Infinity, "COUNTIFS")) return "#VALUE!";

        if (args.length % 2 !== 0) {
            errorHandler.warn(ERROR_CODE.FORMULA_ARGUMENT_COUNT_INVALID, "COUNTIFS 需要偶数个参数（成对的 criteria_range 和 criteria）", {
                received: args.length,
                functionName: "COUNTIFS",
            });
            return "#VALUE!";
        }

        const conditionPairs: { range: unknown[]; criteria: unknown; pairIndex: number }[] = [];
        for (let i = 0; i < args.length; i += 2) {
            const criteriaRange = args[i];
            const criteria = args[i + 1];

            conditionPairs.push({
                range: Array.isArray(criteriaRange) ? _flatten(criteriaRange) : [criteriaRange],
                criteria: criteria,
                pairIndex: Math.floor(i / 2),
            });
        }

        const referenceLength = conditionPairs[0].range.length;
        for (const pair of conditionPairs) {
            if (pair.range.length !== referenceLength) {
                errorHandler.error(ERROR_CODE.FORMULA_EVAL_ERROR, `COUNTIFS: 条件范围 ${pair.pairIndex + 1} 与条件范围 1 长度不匹配`, {
                    expectedLength: referenceLength,
                    actualLength: pair.range.length,
                    pairIndex: pair.pairIndex,
                    functionName: "COUNTIFS",
                });
                return "#VALUE!";
            }
        }

        let count = 0;
        for (let i = 0; i < referenceLength; i++) {
            let allMatch = true;

            for (const pair of conditionPairs) {
                try {
                    if (!_matchCriteria(pair.range[i], pair.criteria as string | number)) {
                        allMatch = false;
                        break;
                    }
                } catch (e) {
                    errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `COUNTIFS: 条件 ${pair.pairIndex + 1} 匹配失败 at index ${i}`, {
                        error: (e as Error).message,
                        index: i,
                        pairIndex: pair.pairIndex,
                        functionName: "COUNTIFS",
                    });
                    allMatch = false;
                    break;
                }
            }

            if (allMatch) {
                count++;
            }
        }

        return count;
    },

    /**
     * IFERROR - 错误处理函数
     *
     * 如果公式计算结果为错误，则返回指定值；否则返回公式结果
     *
     * 语法: IFERROR(value, value_if_error)
     *
     * @param args - [计算值, 错误时的替代值]
     * @returns 正常结果或错误替代值
     *
     * @example
     * =IFERROR(A1/B1, 0)            // 除零时返回 0
     * =IFERROR(VLOOKUP(...), "未找到")  // 查找失败时返回"未找到"
     */
    IFERROR: (args) => {
        if (!_validateArgs(args, 2, 2, "IFERROR")) return "#VALUE!";

        const value = args[0];
        const valueIfError = args[1];

        if (isString(value) && value.startsWith("#")) {
            return valueIfError;
        }

        return value;
    },

    /**
     * IFNA - N/A 值处理函数
     *
     * 如果公式计算结果为 #N/A，则返回指定值；否则返回公式结果
     *
     * 语法: IFNA(value, value_if_na)
     *
     * @param args - [计算值, N/A时的替代值]
     * @returns 正常结果或 N/A 替代值
     *
     * @example
     * =IFNA(VLOOKUP(...), "不存在")   // 查找返回 #N/A 时显示"不存在"
     * =IFNA(MATCH(...), 0)            // 未匹配到时返回 0
     */
    IFNA: (args) => {
        if (!_validateArgs(args, 2, 2, "IFNA")) return "#VALUE!";

        const value = args[0];
        const valueIfNA = args[1];

        if (value === "#N/A") {
            return valueIfNA;
        }

        return value;
    },
};
