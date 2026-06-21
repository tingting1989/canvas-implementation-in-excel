import { isNumber } from "lodash-es";
import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";

/**
 * 公式函数注册表（可扩展）
 *
 * 每个函数签名为 (args: Array, context: { sheet, workbook }) => any
 * - args: 已求值的参数数组
 * - context: 提供 sheet/workbook 引用，用于跨表引用
 *
 * 使用方式：
 * ```js
 * import { registerFunction, FUNCTIONS } from './functions/index.js';
 *
 * // 注册自定义函数
 * registerFunction('MYFUNC', (args, ctx) => {
 *     return args[0] * 2 + args[1];
 * });
 *
 * // 在单元格中使用：=MYFUNC(A1, B1)
 * ```
 */

const FUNCTIONS_MAP = new Map();

function _registerBuiltin(name, fn) {
    FUNCTIONS_MAP.set(name.toUpperCase(), fn);
}

_registerBuiltin('SUM', (args) => {
    const flat = _flatten(args);
    return flat.reduce((acc, v) => {
        const n = _toNum(v);
        return isNaN(n) ? acc : acc + n;
    }, 0);
});

_registerBuiltin('AVERAGE', (args) => {
    const flat = _flatten(args)
        .map(_toNum)
        .filter((v) => !isNaN(v));
    if (flat.length === 0) return "#DIV/0!";
    return flat.reduce((acc, v) => acc + v, 0) / flat.length;
});

_registerBuiltin('COUNT', (args) => {
    return _flatten(args).filter((v) => isNumber(v)).length;
});

_registerBuiltin('COUNTA', (args) => {
    return _flatten(args).filter((v) => v !== "" && v !== null && v !== undefined).length;
});

_registerBuiltin('MAX', (args) => {
    const nums = _flatten(args)
        .map(_toNum)
        .filter((v) => !isNaN(v));
    if (nums.length === 0) return 0;
    return Math.max(...nums);
});

_registerBuiltin('MIN', (args) => {
    const nums = _flatten(args)
        .map(_toNum)
        .filter((v) => !isNaN(v));
    if (nums.length === 0) return 0;
    return Math.min(...nums);
});

_registerBuiltin('IF', (args) => {
    if (args.length < 2) return "#VALUE!";
    const condition = args[0];
    return condition ? args[1] : (args[2] ?? false);
});

_registerBuiltin('ABS', (args) => {
    return Math.abs(_toNum(args[0]));
});

_registerBuiltin('ROUND', (args) => {
    const num = _toNum(args[0]);
    const digits = args[1] !== undefined ? _toNum(args[1]) : 0;
    return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
});

_registerBuiltin('UPPER', (args) => {
    return String(args[0] ?? "").toUpperCase();
});

_registerBuiltin('LOWER', (args) => {
    return String(args[0] ?? "").toLowerCase();
});

_registerBuiltin('CONCAT', (args) => {
    return args.map(String).join("");
});

_registerBuiltin('CONCATENATE', (args) => {
    return args.map(String).join("");
});

export const FUNCTIONS = FUNCTIONS_MAP;

/**
 * 注册自定义公式函数
 *
 * @param {string} name - 函数名（如 'MYFUNC'，会自动转大写）
 * @param {Function} fn - 函数实现 (args: Array, context: { sheet, workbook }) => any
 * @throws {Error} 参数类型错误时抛出
 *
 * @example
 * ```js
 * // 基础用法
 * registerFunction('DOUBLE', (args) => args[0] * 2);
 *
 * // 使用上下文（访问工作簿和其他工作表）
 * registerFunction('CROSS_SUM', (args, ctx) => {
 *     const otherSheet = ctx.workbook.sheets.get('Sheet2');
 *     return args[0] + otherSheet.cellStore.get(0, 0)?.value || 0;
 * });
 * ```
 */
export function registerFunction(name, fn) {
    if (typeof name !== 'string' || name.trim() === '') {
        errorHandler.throw(
            ERROR_CODE.FORMULA_INVALID_FUNCTION_NAME,
            '函数名必须为非空字符串'
        );
    }
    if (typeof fn !== 'function') {
        errorHandler.throw(
            ERROR_CODE.FORMULA_INVALID_FUNCTION,
            '函数必须是 Function 类型'
        );
    }
    const upperName = name.toUpperCase();
    if (FUNCTIONS_MAP.has(upperName)) {
        errorHandler.warn(
            ERROR_CODE.FORMULA_FUNCTION_OVERRIDE,
            `函数 ${upperName} 已存在，将被覆盖`,
            { functionName: upperName }
        );
    }
    FUNCTIONS_MAP.set(upperName, fn);
}

/**
 * 注销自定义公式函数
 *
 * @param {string} name - 要移除的函数名
 * @returns {boolean} 是否成功移除
 */
export function unregisterFunction(name) {
    return FUNCTIONS_MAP.delete(name.toUpperCase());
}

/**
 * 检查函数是否已注册
 *
 * @param {string} name - 函数名
 * @returns {boolean}
 */
export function hasFunction(name) {
    return FUNCTIONS_MAP.has(name.toUpperCase());
}

/**
 * 获取所有已注册的函数名列表
 *
 * @returns {string[]}
 */
export function getRegisteredFunctions() {
    return [...FUNCTIONS_MAP.keys()];
}

function _flatten(arr) {
    const result = [];
    for (const item of arr) {
        if (Array.isArray(item)) {
            result.push(..._flatten(item));
        } else {
            result.push(item);
        }
    }
    return result;
}

function _toNum(v) {
    if (isNumber(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
        const n = parseFloat(v);
        return isNaN(n) ? NaN : n;
    }
    return NaN;
}