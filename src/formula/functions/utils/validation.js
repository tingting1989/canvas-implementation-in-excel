/**
 * 参数校验工具
 *
 * 提供统一的参数验证机制：
 * - 参数数量检查
 * - 类型验证
 * - 错误日志记录
 *
 * @module formula/functions/utils/validation
 */

import { errorHandler, ERROR_CODE } from "../../../core/ErrorHandler.js";
import { _toNum } from "./helpers.js";

/**
 * 统一的参数校验器
 *
 * 检查函数参数是否符合要求，并记录结构化错误日志
 *
 * @param {Array} args - 函数参数数组
 * @param {number} minArgs - 最小参数数量
 * @param {number} [maxArgs=Infinity] - 最大参数数量（不限制时传 Infinity）
 * @param {string} functionName - 函数名称（用于日志）
 * @returns {boolean} 校验是否通过（true=通过，false=失败）
 *
 * @example
 * // 基础用法：SUM 至少需要 1 个参数
 * if (!_validateArgs(args, 1, Infinity, 'SUM')) return "#VALUE!";
 *
 * // 限制范围：ABS 只接受 1 个参数
 * if (!_validateArgs(args, 1, 1, 'ABS')) return "#VALUE!";
 *
 * // IF 接受 2-3 个参数
 * if (!_validateArgs(args, 2, 3, 'IF')) return "#VALUE!";
 */
export function _validateArgs(args, minArgs, maxArgs = Infinity, functionName) {
    if (!Array.isArray(args)) {
        errorHandler.handle(ERROR_CODE.FORMULA_EVAL_ERROR, `${functionName}: 参数必须是数组`, {
            receivedType: typeof args,
            functionName,
        });
        return false;
    }

    const argCount = args.length;

    if (argCount < minArgs || argCount > maxArgs) {
        const range = maxArgs === Infinity ? `至少 ${minArgs} 个` : `${minArgs}-${maxArgs} 个`;

        errorHandler.warn(ERROR_CODE.FORMULA_ARGUMENT_COUNT_INVALID, `${functionName} 需要 ${range}参数`, {
            received: argCount,
            expected: range,
            functionName,
        });
        return false;
    }

    return true;
}

/**
 * 验证数值参数
 *
 * 检查指定位置的参数是否为有效数值
 *
 * @param {Array} args - 函数参数数组
 * @param {number} index - 参数索引（从 0 开始）
 * @param {string} paramName - 参数名称（用于错误信息）
 * @param {string} functionName - 函数名称
 * @returns {{ valid: boolean, value?: number }} 验证结果
 *
 * @example
 * const result = _validateNumericArg(args, 0, '数值', 'SQRT');
 * if (!result.valid) return "#VALUE!";
 * return Math.sqrt(result.value);
 */
export function _validateNumericArg(args, index, paramName, functionName) {
    const value = _toNum(args[index]);

    if (isNaN(value)) {
        errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, `${functionName}: ${paramName}无法转换为数值`, {
            value: args[index],
            index,
            functionName,
        });
        return { valid: false };
    }

    return { valid: true, value };
}
