import { isNumber } from "lodash-es";

/**
 * 公式函数注册表
 *
 * 每个函数签名为 (args: Array, context: { sheet, workbook }) => any
 * - args: 已求值的参数数组
 * - context: 提供 sheet/workbook 引用，用于跨表引用
 */

export const FUNCTIONS = {
    SUM(args) {
        const flat = _flatten(args);
        return flat.reduce((acc, v) => {
            const n = _toNum(v);
            return isNaN(n) ? acc : acc + n;
        }, 0);
    },

    AVERAGE(args) {
        const flat = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));
        if (flat.length === 0) return "#DIV/0!";
        return flat.reduce((acc, v) => acc + v, 0) / flat.length;
    },

    COUNT(args) {
        return _flatten(args).filter((v) => isNumber(v)).length;
    },

    COUNTA(args) {
        return _flatten(args).filter((v) => v !== "" && v !== null && v !== undefined).length;
    },

    MAX(args) {
        const nums = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));
        if (nums.length === 0) return 0;
        return Math.max(...nums);
    },

    MIN(args) {
        const nums = _flatten(args)
            .map(_toNum)
            .filter((v) => !isNaN(v));
        if (nums.length === 0) return 0;
        return Math.min(...nums);
    },

    IF(args) {
        if (args.length < 2) return "#VALUE!";
        const condition = args[0];
        return condition ? args[1] : (args[2] ?? false);
    },

    ABS(args) {
        return Math.abs(_toNum(args[0]));
    },

    ROUND(args) {
        const num = _toNum(args[0]);
        const digits = args[1] !== undefined ? _toNum(args[1]) : 0;
        return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
    },

    UPPER(args) {
        return String(args[0] ?? "").toUpperCase();
    },

    LOWER(args) {
        return String(args[0] ?? "").toLowerCase();
    },

    CONCAT(args) {
        return args.map(String).join("");
    },

    CONCATENATE(args) {
        return args.map(String).join("");
    },
};

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