/**
 * 查找引用函数
 *
 * 提供数据查找和引用功能：
 * - VLOOKUP: 垂直查找
 * - HLOOKUP: 水平查找
 * - INDEX: 按索引取值
 * - MATCH: 查找位置
 *
 * @module formula/functions/lookup
 */

import { ERROR_CODE } from "../../../constants/errorCodes.js";
import { isString } from "../../../utils/helper.js";
import { _flatten, _toNum, _validateArgs } from "./utils";
import { errorHandler } from "../../../core/ErrorHandler";

type FormulaResult = number | string;

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const lookupFunctions: Record<string, (args: unknown[]) => FormulaResult> = {
    /**
     * VLOOKUP - 垂直查找函数
     *
     * 在表格的第一列中查找值，并返回该行中指定列的值
     *
     * 语法: VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])
     *
     * @param args - [查找值, 表格范围, 列序号, 匹配模式]
     * @returns 找到的值，未找到时返回 #N/A 或 #VALUE!
     *
     * @example
     * =VLOOKUP("苹果", A1:D10, 3, FALSE)    // 精确匹配查找"苹果"，返回第3列
     * =VLOOKUP(100, A1:E20, 2, TRUE)       // 近似匹配查找<=100的最大值
     */
    VLOOKUP: (args) => {
        if (!_validateArgs(args, 3, 4, "VLOOKUP")) return "#VALUE!";

        const lookupValue = args[0];
        const tableArray = args[1];
        const colIndex = Math.floor(_toNum(args[2]));
        const rangeLookup = args[3] !== undefined ? args[3] : true;

        if (isNaN(colIndex) || colIndex < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "VLOOKUP: col_index_num 必须是 >=1 的整数", { value: args[2], functionName: "VLOOKUP" });
            return "#VALUE!";
        }

        let flatTable: unknown[][];
        if (Array.isArray(tableArray)) {
            flatTable = Array.isArray(tableArray[0]) ? (tableArray as unknown[][]) : [tableArray];
        } else {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "VLOOKUP: table_array 必须是数组", { functionName: "VLOOKUP" });
            return "#VALUE!";
        }

        if (colIndex > flatTable[0].length) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `VLOOKUP: col_index_num (${colIndex}) 超出表格列数 (${flatTable[0].length})`, {
                colIndex,
                tableCols: flatTable[0].length,
                functionName: "VLOOKUP",
            });
            return "#REF!";
        }

        for (let i = 0; i < flatTable.length; i++) {
            const row = flatTable[i];
            const firstColValue = row[0];

            if (rangeLookup === false || rangeLookup === 0) {
                if (firstColValue === lookupValue) {
                    return row[colIndex - 1] as FormulaResult;
                }
            } else {
                if (_toNum(firstColValue) <= _toNum(lookupValue)) {
                    if (i === flatTable.length - 1 || _toNum(flatTable[i + 1][0]) > _toNum(lookupValue)) {
                        return row[colIndex - 1] as FormulaResult;
                    }
                }
            }
        }

        errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "VLOOKUP: 未找到匹配值", { lookupValue, functionName: "VLOOKUP" });
        return "#N/A";
    },

    /**
     * HLOOKUP - 水平查找函数
     *
     * 在表格的第一行中查找值，并返回该列中指定行的值
     *
     * 语法: HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])
     *
     * @param args - [查找值, 表格范围, 行序号, 匹配模式(可选)]
     * @returns 找到的值，未找到时返回 #N/A 或 #VALUE!
     *
     * @example
     * =HLOOKUP("Q2", A1:E5, 3, FALSE)    // 精确匹配查找"Q2"，返回第3行
     * =HLOOKUP(100, A1:E5, 2, TRUE)      // 近似匹配查找<=100的最大值
     */
    HLOOKUP: (args) => {
        if (!_validateArgs(args, 3, 4, "HLOOKUP")) return "#VALUE!";

        const lookupValue = args[0];
        const tableArray = args[1];
        const rowIndex = Math.floor(_toNum(args[2]));
        const rangeLookup = args[3] !== undefined ? args[3] : true;

        if (isNaN(rowIndex) || rowIndex < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "HLOOKUP: row_index_num 必须是 >=1 的整数", { value: args[2], functionName: "HLOOKUP" });
            return "#VALUE!";
        }

        let flatTable: unknown[][];
        if (Array.isArray(tableArray)) {
            flatTable = Array.isArray(tableArray[0]) ? (tableArray as unknown[][]) : [tableArray];
        } else {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "HLOOKUP: table_array 必须是数组", { functionName: "HLOOKUP" });
            return "#VALUE!";
        }

        if (flatTable.length === 0 || rowIndex > flatTable.length) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "HLOOKUP: row_index_num 超出表格行数", {
                rowIndex,
                tableRows: flatTable.length,
                functionName: "HLOOKUP",
            });
            return "#REF!";
        }

        const firstRow = flatTable[0];

        for (let c = 0; c < firstRow.length; c++) {
            const firstRowValue = firstRow[c];

            if (rangeLookup === false || rangeLookup === 0) {
                if (firstRowValue === lookupValue) {
                    return flatTable[rowIndex - 1][c] as FormulaResult;
                }
            } else {
                if (_toNum(firstRowValue) <= _toNum(lookupValue)) {
                    if (c === firstRow.length - 1 || _toNum(firstRow[c + 1]) > _toNum(lookupValue)) {
                        return flatTable[rowIndex - 1][c] as FormulaResult;
                    }
                }
            }
        }

        errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "HLOOKUP: 未找到匹配值", { lookupValue, functionName: "HLOOKUP" });
        return "#N/A";
    },

    /**
     * INDEX - 按索引取值
     *
     * 返回表格或数组中指定行列交叉处的值
     *
     * 语法: INDEX(array, row_num, [column_num])
     *
     * @param args - [数组或范围, 行号, 列号(可选)]
     * @returns 指定位置的值，越界时返回 #REF!
     *
     * @example
     * =INDEX(A1:C5, 2, 3)    // 返回第2行第3列的值
     * =INDEX(A1:A5, 3)       // 返回一维数组中第3个元素
     */
    INDEX: (args) => {
        if (!_validateArgs(args, 2, 3, "INDEX")) return "#VALUE!";

        const array = args[0];
        const rowNum = _toNum(args[1]);
        const colNum = args[2] !== undefined ? _toNum(args[2]) : undefined;

        if (isNaN(rowNum) || rowNum < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "INDEX: row_num 必须是 >=1 的整数", { value: args[1], functionName: "INDEX" });
            return "#VALUE!";
        }
        if (colNum !== undefined && (isNaN(colNum) || colNum < 1)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "INDEX: column_num 必须是 >=1 的整数", { value: args[2], functionName: "INDEX" });
            return "#VALUE!";
        }

        if (!Array.isArray(array)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "INDEX: array 必须是数组", { functionName: "INDEX" });
            return "#VALUE!";
        }

        const is2D = Array.isArray(array[0]);

        if (is2D) {
            const r = Math.floor(rowNum) - 1;
            const c = colNum !== undefined ? Math.floor(colNum) - 1 : 0;

            if (r >= array.length || c >= (array as unknown[][])[0].length) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "INDEX: 索引越界", { rowNum, colNum, functionName: "INDEX" });
                return "#REF!";
            }
            return (array as unknown[][])[r][c] as FormulaResult;
        } else {
            const idx = Math.floor(rowNum) - 1;
            if (idx >= array.length) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "INDEX: 索引越界", { rowNum, functionName: "INDEX" });
                return "#REF!";
            }
            return array[idx] as FormulaResult;
        }
    },

    /**
     * MATCH - 查找位置
     *
     * 在数组中查找值，返回其相对位置
     *
     * 语法: MATCH(lookup_value, lookup_array, [match_type])
     *
     * match_type 取值：
     * - 0: 精确匹配
     * - 1（默认）: 查找 <= lookup_value 的最大值（数组需升序）
     * - -1: 查找 >= lookup_value 的最小值（数组需降序）
     *
     * @param args - [查找值, 查找范围, 匹配类型(可选)]
     * @returns 位置（从1开始），未找到时返回 #N/A
     *
     * @example
     * =MATCH("苹果", A1:A10, 0)     // 精确匹配，返回位置
     * =MATCH(50, B1:B10, 1)         // 近似匹配，返回<=50的最大值位置
     */
    MATCH: (args) => {
        if (!_validateArgs(args, 2, 3, "MATCH")) return "#VALUE!";

        const lookupValue = args[0];
        const lookupArray = args[1];
        const matchType = args[2] !== undefined ? _toNum(args[2]) : 1;

        if (isNaN(matchType)) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MATCH: match_type 参数无效", { value: args[2], functionName: "MATCH" });
            return "#VALUE!";
        }

        let flat: unknown[];
        if (Array.isArray(lookupArray)) {
            flat = Array.isArray(lookupArray[0]) ? _flatten(lookupArray) : lookupArray;
        } else {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MATCH: lookup_array 必须是数组", { functionName: "MATCH" });
            return "#VALUE!";
        }

        if (matchType === 0) {
            for (let i = 0; i < flat.length; i++) {
                if (flat[i] === lookupValue) return i + 1;
                if (isString(flat[i]) && isString(lookupValue) && (flat[i] as string).toLowerCase() === (lookupValue as string).toLowerCase())
                    return i + 1;
            }
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MATCH: 未找到精确匹配", { lookupValue, functionName: "MATCH" });
            return "#N/A";
        }

        if (matchType === 1) {
            let bestIndex = -1;
            for (let i = 0; i < flat.length; i++) {
                const val = _toNum(flat[i]);
                const target = _toNum(lookupValue);
                if (!isNaN(val) && !isNaN(target) && val <= target) {
                    bestIndex = i;
                }
            }
            if (bestIndex === -1) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MATCH: 未找到近似匹配(升序)", { lookupValue, functionName: "MATCH" });
                return "#N/A";
            }
            return bestIndex + 1;
        }

        if (matchType === -1) {
            let bestIndex = -1;
            for (let i = 0; i < flat.length; i++) {
                const val = _toNum(flat[i]);
                const target = _toNum(lookupValue);
                if (!isNaN(val) && !isNaN(target) && val >= target) {
                    bestIndex = i;
                }
            }
            if (bestIndex === -1) {
                errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MATCH: 未找到近似匹配(降序)", { lookupValue, functionName: "MATCH" });
                return "#N/A";
            }
            return bestIndex + 1;
        }

        errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "MATCH: match_type 值无效，需为 -1/0/1", { matchType, functionName: "MATCH" });
        return "#VALUE!";
    },
};
