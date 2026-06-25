/**
 * 条件匹配引擎
 *
 * 提供强大的条件匹配功能，支持：
 * - 比较运算符 (>, <, >=, <=, =, <>)
 * - 文本精确匹配
 * - 通配符匹配 (*, ?)
 * - 数值直接匹配
 * - 空值/非空判断
 *
 * @module formula/functions/utils/matching
 */

import { errorHandler, ERROR_CODE } from "../../../core/ErrorHandler.js";
import {_isBlank, _toNum} from "./helpers.js";

/**
 * 条件匹配核心函数
 *
 * 判断值是否满足给定的条件表达式
 *
 * 支持的条件格式：
 * 1. 比较运算符: ">100", "<=50", "=abc", "<>空"
 * 2. 通配符: "*张*", "苹果?", "A*B"
 * 3. 数值直接匹配: 100, 3.14
 * 4. 文本精确匹配: "苹果", "北京"
 * 5. 空值判断: "" 匹配空白单元格
 *
 * @param {*} value - 要检查的单元格值
 * @param {string|number} criteria - 条件表达式
 * @returns {boolean} 是否满足条件
 *
 * @example
 * _matchCriteria(150, ">100")        // true
 * _matchCriteria(50, "<60")          // true
 * _matchCriteria("苹果", "*果")      // true
 * _matchCriteria(100, 100)           // true (数值精确匹配)
 * _matchCriteria("", "")             // true (空值匹配)
 * _matchCriteria("张三", "*张*")     // true (通配符)
 */
export function _matchCriteria(value, criteria) {
    if (criteria === undefined || criteria === null) {
        return value === undefined || value === null;
    }

    const criteriaStr = String(criteria).trim();

    if (criteriaStr === "") {
        return _isBlank(value);
    }

    const operators = [">=", "<=", "<>", ">", "<", "="];
    for (const op of operators) {
        if (criteriaStr.startsWith(op)) {
            const conditionValue = criteriaStr.substring(op.length).trim();
            if (conditionValue === "" && [">=", "<=", ">", "<"].includes(op)) {
                return false;
            }
            return _compareWithOperator(value, op, conditionValue);
        }
    }

    if (typeof criteria === "number" && typeof value === "string") {
        return false;
    }

    const numCriteria = Number(criteria);
    if (!isNaN(numCriteria) && typeof criteria !== "boolean") {
        const numValue = _toNum(value);
        if (!isNaN(numValue)) {
            return Math.abs(numValue - numCriteria) < 1e-10;
        }
        return false;
    }

    if (typeof value === "boolean" && typeof criteria === "boolean") {
        return value === criteria;
    }

    if (typeof criteriaStr === "string") {
        if (criteriaStr.includes("*") || criteriaStr.includes("?")) {
            return _matchWildcard(String(value ?? ""), criteriaStr);
        }
        return String(value ?? "") === criteriaStr;
    }

    return value === criteria;
}

/**
 * 使用比较运算符进行数值/文本比较
 *
 * 支持的运算符：
 * - > : 大于
 * - < : 小于
 * - >= : 大于等于
 * - <= : 小于等于
 * - / == : 等于
 * - <> / != : 不等于
 *
 * 自动检测条件值的类型（数值或文本）并选择合适的比较策略
 *
 * @param {*} value - 要比较的值
 * @param {string} operator - 比较运算符
 * @param {string} conditionValue - 条件值（字符串形式）
 * @returns {boolean} 比较结果
 */
function _compareWithOperator(value, operator, conditionValue) {
    const numCondition = parseFloat(conditionValue);

    if (!isNaN(numCondition) && conditionValue.trim() !== "") {
        const numValue = _toNum(value);

        if (isNaN(numValue)) {
            switch (operator) {
                case "=":
                case "==":
                    return false;
                case "<>":
                case "!=":
                    return true;
                default:
                    return false;
            }
        }

        switch (operator) {
            case ">":
                return numValue > numCondition;
            case "<":
                return numValue < numCondition;
            case ">=":
                return numValue >= numCondition;
            case "<=":
                return numValue <= numCondition;
            case "=":
            case "==":
                return Math.abs(numValue - numCondition) < 1e-10;
            case "<>":
            case "!=":
                return Math.abs(numValue - numCondition) >= 1e-10;
            default:
                return false;
        }
    } else {
        const strValue = String(value ?? "");
        switch (operator) {
            case "=":
            case "==":
                return strValue === conditionValue;
            case "<>":
            case "!=":
                return strValue !== conditionValue;
            case ">":
                return strValue.localeCompare(conditionValue) > 0;
            case "<":
                return strValue.localeCompare(conditionValue) < 0;
            case ">=":
                return strValue.localeCompare(conditionValue) >= 0;
            case "<=":
                return strValue.localeCompare(conditionValue) <= 0;
            default:
                return false;
        }
    }
}

/**
 * 通配符匹配函数
 *
 * 支持 Excel 风格的通配符模式：
 * - * : 匹配 0 个或多个字符
 * - ? : 匹配恰好 1 个字符
 *
 * 将通配符模式转换为正则表达式进行匹配
 *
 * @param {string} text - 要匹配的文本
 * @param {string} pattern - 通配符模式
 * @returns {boolean} 是否匹配
 *
 * @example
 * _matchWildcard("苹果", "*果")       // true
 * _matchWildcard("张三丰", "*张*")     // true
 * _matchWildcard("ABCD", "A?D")      // false (? 只匹配一个字符)
 * _matchWildcard("Hello123", "*")    // true (* 可以匹配所有内容)
 */
export function _matchWildcard(text, pattern) {
    if (!pattern || pattern.length === 0) return text === "" || text === null || text === undefined;

    if (pattern === "*") return true;

    if (pattern.length > 100) {
        const simplePattern = pattern.replace(/\*/g, "").replace(/\?/g, "");
        if (simplePattern.length === 0) return true;
        return text.toLowerCase().includes(simplePattern.toLowerCase());
    }

    const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*+/g, ".*")
        .replace(/\?/g, ".");

    try {
        const regex = new RegExp(`^${regexPattern}$`, "i");
        return regex.test(String(text ?? ""));
    } catch (e) {
        const simplePattern = pattern.replace(/\*/g, "").replace(/\?/g, "");
        return String(text ?? "").toLowerCase().includes(simplePattern.toLowerCase());
    }
}