import { NullValueHandler } from "./NullValueTypes.js";
import {DateTimeParser} from "../../utils/DateTimeParser.js";


/**
 * 筛选引擎
 *
 * 负责核心的筛选逻辑，包括：
 * - 提取列的唯一值列表
 * - 计算需要隐藏的行
 * - 评估各种筛选条件（等于、包含、大于、正则等）
 *
 * @example
 * const engine = new FilterEngine(sheet, filterState);
 * const uniqueValues = engine.extractUniqueValues(0);
 * const hiddenRows = engine.computeHiddenRows();
 */
export class FilterEngine {
    #sheet;
    #filterState;

    constructor(sheet, filterState) {
        this.#sheet = sheet;
        this.#filterState = filterState;
    }

    /**
     * 提取指定列的唯一值列表
     *
     * 从单元格数据中收集该列所有不重复的值，并进行排序。
     * 结果会被缓存以提高性能。
     *
     * @param {number} col - 列索引
     * @returns {string[]} 唯一值数组，已排序，空值始终排在最后
     */
    extractUniqueValues(col) {
        const cached = this.#filterState.getUniqueValuesCache(col);
        if (cached && this.#filterState.isCacheValid(col)) {
            return cached;
        }

        const values = new Set();
        const hasNullValues = new Set([false]);

        const rowCount = this.#sheet.rowCount || 1000;

        for (let row = 0; row < rowCount; row++) {
            const cell = this.#sheet.data.cellStore.get(row, col);
            const cellValue = cell?.value;

            if (NullValueHandler.isNullValue(cellValue)) {
                values.add(NullValueHandler.NULL_KEY);
                hasNullValues.clear();
                hasNullValues.add(true);
            } else {
                const key = String(cellValue);
                values.add(key);
            }
        }

        const result = Array.from(values).filter((v) => v !== NullValueHandler.NULL_KEY);
        result.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        if (hasNullValues.has(true)) {
            result.push(NullValueHandler.NULL_KEY);
        }

        this.#filterState.cacheUniqueValues(col, result);
        return result;
    }

    /**
     * 计算需要隐藏的行
     *
     * 根据所有列的筛选条件，遍历每一行判断是否应该显示。
     * 多个列的筛选条件是 AND 关系（同时满足）。
     *
     * @returns {Set<number>} 需要隐藏的行索引集合
     */
    computeHiddenRows() {
        const filters = this.#filterState.getAllFilters();
        if (filters.size === 0) {
            return new Set();
        }

        const rowCount = this.#sheet.rowCount || 1000;
        const hiddenRows = new Set();

        for (let row = 0; row < rowCount; row++) {
            let visible = true;

            for (const [col, filter] of filters) {
                if (!this.#rowMatchesFilter(row, col, filter)) {
                    visible = false;
                    break;
                }
            }

            if (!visible) {
                hiddenRows.add(row);
            }
        }

        return hiddenRows;
    }

    /**
     * 判断指定行的单元格是否匹配筛选条件
     *
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {Object} filter - 筛选配置
     * @returns {boolean} 是否匹配
     * @private
     */
    #rowMatchesFilter(row, col, filter) {
        const cell = this.#sheet.data.cellStore.get(row, col);
        const cellValue = cell?.value;
        const isNullCell = NullValueHandler.isNullValue(cellValue);

        if (filter.type === "values") {
            const cellKey = isNullCell ? NullValueHandler.NULL_KEY : String(cellValue);
            return !filter.uncheckedValues.has(cellKey);
        }

        if (filter.type === "condition") {
            return this.#evaluateConditionWithNull(cellValue, isNullCell, filter.operator, filter.value, filter.valueEnd);
        }

        return true;
    }

    /**
     * 评估带空值处理的筛选条件
     *
     * @param {*} cellValue - 单元格值
     * @param {boolean} isNullCell - 是否为空值单元格
     * @param {string} operator - 操作符
     * @param {*} conditionValue - 条件值
     * @param {*} [conditionValueEnd] - 范围结束值
     * @returns {boolean} 是否匹配
     * @private
     */
    #evaluateConditionWithNull(cellValue, isNullCell, operator, conditionValue, conditionValueEnd) {
        const isConditionEmpty = NullValueHandler.isNullValue(conditionValue);

        if (operator === "eq") {
            if (isConditionEmpty) {
                return isNullCell;
            }
            if (isNullCell) return false;
            return cellValue == conditionValue;
        }

        if (operator === "neq") {
            if (isConditionEmpty) {
                return !isNullCell;
            }
            if (isNullCell) return true;
            return cellValue != conditionValue;
        }

        const textOperators = ["contains", "notContains", "startsWith", "endsWith", "regex"];
        if (textOperators.includes(operator)) {
            if (isNullCell) {
                return operator === "notContains" || operator === "regex";
            }
            return this.#evaluateTextCondition(cellValue, operator, conditionValue);
        }

        const numericOperators = ["gt", "gte", "lt", "lte", "between"];
        if (numericOperators.includes(operator)) {
            if (isNullCell) {
                return false;
            }
            return this.#evaluateNumericCondition(cellValue, operator, conditionValue, conditionValueEnd);
        }

        const dateOperators = [
            "dateEq",
            "dateNeq",
            "dateBefore",
            "dateAfter",
            "dateBetween",
            "dateToday",
            "dateYesterday",
            "dateTomorrow",
            "dateThisWeek",
            "dateLastWeek",
            "dateNextWeek",
            "dateThisMonth",
            "dateLastMonth",
            "dateNextMonth",
            "dateThisYear",
            "dateLastYear",
        ];
        if (dateOperators.includes(operator)) {
            return this.#evaluateDateCondition(cellValue, isNullCell, operator, conditionValue, conditionValueEnd);
        }

        return true;
    }

    /**
     * 评估文本条件
     *
     * @param {*} value - 单元格值
     * @param {string} operator - 操作符
     * @param {*} conditionValue - 条件值
     * @returns {boolean} 是否匹配
     * @private
     */
    #evaluateTextCondition(value, operator, conditionValue) {
        const strValue = String(value);

        switch (operator) {
            case "contains":
                return strValue.toLowerCase().includes(String(conditionValue).toLowerCase());
            case "notContains":
                return !strValue.toLowerCase().includes(String(conditionValue).toLowerCase());
            case "startsWith":
                return strValue.toLowerCase().startsWith(String(conditionValue).toLowerCase());
            case "endsWith":
                return strValue.toLowerCase().endsWith(String(conditionValue).toLowerCase());
            case "regex":
                return this.#evaluateRegexCondition(strValue, conditionValue);
            default:
                return true;
        }
    }

    /**
     * 评估正则表达式条件
     *
     * @param {string} value - 字符串值
     * @param {string} regexPattern - 正则表达式模式
     * @returns {boolean} 是否匹配
     * @private
     */
    #evaluateRegexCondition(value, regexPattern) {
        try {
            const regex = new RegExp(regexPattern);
            return regex.test(value);
        } catch (e) {
            console.warn("[FilterEngine] Invalid regex pattern:", regexPattern, e);
            return false;
        }
    }

    /**
     * 评估数值条件
     *
     * @param {*} value - 单元格值
     * @param {string} operator - 操作符
     * @param {*} conditionValue - 条件值
     * @param {*} [conditionValueEnd] - 范围结束值（between 时使用）
     * @returns {boolean} 是否匹配
     * @private
     */
    #evaluateNumericCondition(value, operator, conditionValue, conditionValueEnd) {
        const numValue = Number(value);
        const numCondition = Number(conditionValue);
        const numConditionEnd = conditionValueEnd !== undefined ? Number(conditionValueEnd) : undefined;

        if (isNaN(numValue)) {
            return false;
        }

        switch (operator) {
            case "gt":
                return numCondition !== undefined && !isNaN(numCondition) && numValue > numCondition;
            case "gte":
                return numCondition !== undefined && !isNaN(numCondition) && numValue >= numCondition;
            case "lt":
                return numCondition !== undefined && !isNaN(numCondition) && numValue < numCondition;
            case "lte":
                return numCondition !== undefined && !isNaN(numCondition) && numValue <= numCondition;
            case "between":
                if (isNaN(numCondition) || isNaN(numConditionEnd)) {
                    return false;
                }
                return numValue >= numCondition && numValue <= numConditionEnd;
            default:
                return true;
        }
    }

    /**
     * 评估日期条件
     *
     * @param {*} cellValue - 单元格值
     * @param {boolean} isNullCell - 是否为空值
     * @param {string} operator - 操作符
     * @param {*} conditionValue - 条件值
     * @param {*} [conditionValueEnd] - 范围结束值
     * @returns {boolean} 是否匹配
     * @private
     */
    #evaluateDateCondition(cellValue, isNullCell, operator, conditionValue, conditionValueEnd) {
        const now = new Date();
        const cellDate = this.#parseDate(cellValue);

        if (isNullCell) {
            const showOnNullDateOperators = ["dateNeq"];
            return showOnNullDateOperators.includes(operator);
        }

        if (!cellDate) {
            return false;
        }

        switch (operator) {
            case "dateEq":
                return this.#compareDates(cellDate, conditionValue) === 0;
            case "dateNeq":
                return this.#compareDates(cellDate, conditionValue) !== 0;
            case "dateBefore":
                return this.#compareDates(cellDate, conditionValue) < 0;
            case "dateAfter":
                return this.#compareDates(cellDate, conditionValue) > 0;
            case "dateBetween":
                return this.#compareDates(cellDate, conditionValue) >= 0 && this.#compareDates(cellDate, conditionValueEnd) <= 0;
            case "dateToday":
                return this.#isSameDay(cellDate, now);
            case "dateYesterday":
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                return this.#isSameDay(cellDate, yesterday);
            case "dateTomorrow":
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                return this.#isSameDay(cellDate, tomorrow);
            case "dateThisWeek":
                return this.#isSameWeek(cellDate, now);
            case "dateLastWeek":
                const lastWeek = new Date(now);
                lastWeek.setDate(lastWeek.getDate() - 7);
                return this.#isSameWeek(cellDate, lastWeek);
            case "dateNextWeek":
                const nextWeek = new Date(now);
                nextWeek.setDate(nextWeek.getDate() + 7);
                return this.#isSameWeek(cellDate, nextWeek);
            case "dateThisMonth":
                return cellDate.getFullYear() === now.getFullYear() && cellDate.getMonth() === now.getMonth();
            case "dateLastMonth":
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                return cellDate.getFullYear() === lastMonth.getFullYear() && cellDate.getMonth() === lastMonth.getMonth();
            case "dateNextMonth":
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                return cellDate.getFullYear() === nextMonth.getFullYear() && cellDate.getMonth() === nextMonth.getMonth();
            case "dateThisYear":
                return cellDate.getFullYear() === now.getFullYear();
            case "dateLastYear":
                return cellDate.getFullYear() === now.getFullYear() - 1;
            default:
                return true;
        }
    }

    /**
     * 解析日期值
     *
     * @param {*} value - 要解析的值
     * @returns {Date|null} 解析后的 Date 对象，解析失败返回 null
     * @private
     */
    #parseDate(value) {
        return DateTimeParser.parseAny(value);
    }

    /**
     * 比较两个日期
     *
     * @param {Date} date1 - 日期1
     * @param {Date} date2 - 日期2
     * @returns {number} -1: date1 < date2, 0: 相等, 1: date1 > date2
     * @private
     */
    #compareDates(date1, date2) {
        const d1 = this.#parseDate(date1);
        const d2 = this.#parseDate(date2);

        if (!d1 || !d2) return NaN;

        const t1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
        const t2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());

        if (t1 < t2) return -1;
        if (t1 > t2) return 1;
        return 0;
    }

    /**
     * 判断两个日期是否是同一天
     *
     * @param {Date} date1 - 日期1
     * @param {Date} date2 - 日期2
     * @returns {boolean} 是否同一天
     * @private
     */
    #isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();
    }

    /**
     * 判断两个日期是否在同一周
     *
     * @param {Date} date1 - 日期1
     * @param {Date} date2 - 日期2
     * @returns {boolean} 是否同一周
     * @private
     */
    #isSameWeek(date1, date2) {
        if (!date1 || !date2) return false;
        const d1 = new Date(Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate()));
        const d2 = new Date(Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate()));
        const week1 = Math.floor(d1.getTime() / (7 * 24 * 60 * 60 * 1000));
        const week2 = Math.floor(d2.getTime() / (7 * 24 * 60 * 60 * 1000));
        return week1 === week2;
    }
}
