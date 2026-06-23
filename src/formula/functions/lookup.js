/**
 * 查找引用函数
 *
 * 提供数据查找和引用功能：
 * - VLOOKUP: 垂直查找
 *
 * TODO: 计划添加
 * - HLOOKUP: 水平查找
 * - INDEX/MATCH: 高级查找
 * - INDIRECT: 间接引用
 * - OFFSET: 偏移引用
 *
 * @module formula/functions/lookup
 */

import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { _flatten, _toNum, _validateArgs } from "./utils/index.js";

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const lookupFunctions = {
    /**
     * VLOOKUP - 垂直查找函数
     *
     * 在表格的第一列中查找值，并返回该行中指定列的值
     *
     * 语法: VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])
     *
     * @param {Array} args - [查找值, 表格范围, 列序号, 匹配模式]
     * @returns {*} 找到的值，未找到时返回 #N/A 或 #VALUE!
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

        // 参数校验
        if (isNaN(colIndex) || colIndex < 1) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "VLOOKUP: col_index_num 必须是 >=1 的整数", { value: args[2], functionName: "VLOOKUP" });
            return "#VALUE!";
        }

        // 展平表格（假设是二维数组）
        let flatTable;
        if (Array.isArray(tableArray)) {
            flatTable = Array.isArray(tableArray[0]) ? tableArray : [tableArray]; // 一维数组转二维
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

        // 查找逻辑
        for (let i = 0; i < flatTable.length; i++) {
            const row = flatTable[i];
            const firstColValue = row[0];

            if (rangeLookup === false || rangeLookup === 0) {
                // 精确匹配
                if (firstColValue === lookupValue) {
                    return row[colIndex - 1];
                }
            } else {
                // 近似匹配（查找 <= lookupValue 的最大值）
                if (_toNum(firstColValue) <= _toNum(lookupValue)) {
                    if (i === flatTable.length - 1 || _toNum(flatTable[i + 1][0]) > _toNum(lookupValue)) {
                        return row[colIndex - 1];
                    }
                }
            }
        }

        // 未找到
        return "#N/A";
    },
};
