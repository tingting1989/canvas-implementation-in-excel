/**
 * 文本处理函数
 *
 * 提供字符串操作和转换功能：
 * - UPPER: 转大写
 * - LOWER: 转小写
 * - CONCAT: 连接文本（新版本）
 * - CONCATENATE: 连接文本（兼容旧版）
 *
 * TODO: 计划添加
 * - LEFT/RIGHT/MID: 提取子串
 * - LEN: 字符串长度
 * - TRIM: 去除空格
 * - SUBSTITUTE/REPLACE: 替换文本
 * - TEXT: 格式化数值为文本
 * - FIND/SEARCH: 查找子串位置
 *
 * @module formula/functions/text
 */

import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { _validateArgs } from "./utils/index.js";

/**
 * 函数定义集合（导出给主注册表使用）
 */
export const textFunctions = {
    /**
     * UPPER - 转大写字母
     *
     * 将文本字符串中所有的小写字母转换为大写形式
     *
     * 语法: UPPER(text)
     *
     * @param {Array} args - 包含一个文本的数组
     * @returns {String|String} 大写形式的文本，失败时返回 #VALUE!
     *
     * @example
     * =UPPER("hello world")      // 返回 "HELLO WORLD"
     * =UPPER(A1)                 // 将 A1 单元格内容转大写
     */
    UPPER: (args) => {
        if (!_validateArgs(args, 1, 1, "UPPER")) return "#VALUE!";

        try {
            return String(args[0] ?? "").toUpperCase();
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "UPPER: 无法转换为大写", { error: e.message, functionName: "UPPER" });
            return "#VALUE!";
        }
    },

    /**
     * LOWER - 转小写字母
     *
     * 将文本字符串中所有的大写字母转换为小写形式
     *
     * 语法: LOWER(text)
     *
     * @param {Array} args - 包含一个文本的数组
     * @returns {String|String} 小写形式的文本，失败时返回 #VALUE!
     *
     * @example
     * =LOWER("HELLO WORLD")      // 返回 "hello world"
     * =LOWER(A1)                 // 将 A1 单元格内容转小写
     */
    LOWER: (args) => {
        if (!_validateArgs(args, 1, 1, "LOWER")) return "#VALUE!";

        try {
            return String(args[0] ?? "").toLowerCase();
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "LOWER: 无法转换为小写", { error: e.message, functionName: "LOWER" });
            return "#VALUE!";
        }
    },

    /**
     * CONCAT - 连接文本（推荐使用）
     *
     * 将多个文本字符串连接为一个连续字符串
     * 这是 CONCATENATE 的现代替代品，支持范围引用
     *
     * 语法: CONCAT(text1, [text2], ...)
     *
     * @param {Array} args - 要连接的文本或范围数组
     * @returns {String|String} 连接后的字符串，失败时返回 #VALUE!
     *
     * @example
     * =CONCAT("Hello", " ", "World")   // 返回 "Hello World"
     * =CONCAT(A1, B1, C1)             // 连接三个单元格的内容
     * =CONCAT(A1:A10)                  // 连接整个范围（Excel 2019+）
     */
    CONCAT: (args) => {
        if (!_validateArgs(args, 1, Infinity, "CONCAT")) return "#VALUE!";

        try {
            return args.map((v) => String(v ?? "")).join("");
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "CONCAT: 字符串拼接失败", { error: e.message, functionName: "CONCAT" });
            return "#VALUE!";
        }
    },

    /**
     * CONCATENATE - 连接文本（兼容旧 Excel 版本）
     *
     * 将多个文本字符串连接为一个连续字符串
     * 与 CONCAT 功能相同，保留以兼容旧公式
     *
     * 语法: CONCATENATE(text1, [text2], ...)
     *
     * @param {Array} args - 要连接的文本或范围数组
     * @returns {String|String} 连接后的字符串，失败时返回 #VALUE!
     *
     * @example
     * =CONCATENATE("Hello", " ", "World")   // 返回 "Hello World"
     * =CONCATENATE(A1, "-", B1)              // 返回 "A1值-B1值"
     */
    CONCATENATE: (args) => {
        if (!_validateArgs(args, 1, Infinity, "CONCATENATE")) return "#VALUE!";

        try {
            return args.map((v) => String(v ?? "")).join("");
        } catch (e) {
            errorHandler.warn(ERROR_CODE.FORMULA_EVAL_ERROR, "CONCATENATE: 字符串拼接失败", { error: e.message, functionName: "CONCATENATE" });
            return "#VALUE!";
        }
    },
};
