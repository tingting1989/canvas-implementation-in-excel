import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../../core/ErrorHandler.js";
import { NumberValidator } from "./validators/NumberValidator.js";
import { TextLengthValidator } from "./validators/TextLengthValidator.js";
import { ListValidator } from "./validators/ListValidator.js";
import { UniqueValidatorV3 } from "./validators/UniqueValidatorV3.js";
import { FormulaValidator } from "./validators/FormulaValidator.js";
import { DateValidator } from "./validators/DateValidator.js";
import { TimeValidator } from "./validators/TimeValidator.js";
import { RegexValidator } from "./validators/RegexValidator.js";
import { ValidationResult } from "./ValidationResult.js";

/**
 * 数据验证引擎
 *
 * 协调各验证器的工作，提供统一的验证入口。
 * 支持单单元格验证、批量验证、快速预检等模式。
 *
 * 核心功能：
 * 1. 根据 ValidationRule.type 分发到对应的验证器
 * 2. 支持多规则冲突解决策略（短路、优先级、聚合）
 * 3. 提供批量验证优化（分块处理、防抖等）
 *
 * @example
 * const engine = new ValidationEngine(cellStore);
 * await engine.init();
 *
 * const result = await engine.validateCell(0, 0, 50);
 * const report = await engine.validateRange('A1:A100');
 */
export class ValidationEngine {
    /** @type {Map<string, Object>} 验证器注册表 */
    #validators = new Map();

    /** @type {Map<string, import('./ValidationRule.js').ValidationRule>} 规则存储 */
    #rules = new Map();

    /** @type {Object} CellStore 实例 */
    #cellStore;

    /** @type {Map<string, Map<string, import('./ValidationResult.js').ValidationResult>>} 验证结果缓存 */
    #cache = new Map();

    /** @type {number} 缓存最大容量 */
    #maxCacheSize = 10000;

    /** @type {string} 规则冲突解决策略：short-circuit|priority|aggregate */
    #conflictStrategy = "short-circuit";

    /**
     * 构造验证引擎
     * @param {Object} cellStore - CellStore 实例
     */
    constructor(cellStore) {
        this.#cellStore = cellStore;
    }

    /**
     * 初始化引擎（注册所有内置验证器）
     */
    async init(formulaEngine = null) {
        this.registerValidator("number", new NumberValidator());
        this.registerValidator("text", new TextLengthValidator());
        this.registerValidator("list", new ListValidator());
        this.registerValidator("unique", new UniqueValidatorV3(this.#cellStore));
        this.registerValidator("custom", new FormulaValidator(formulaEngine));
        this.registerValidator("date", new DateValidator());
        this.registerValidator("time", new TimeValidator());
        this.registerValidator("regex", new RegexValidator());

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationEngine] 初始化完成，已注册验证器:", [...this.#validators.keys()]);
    }

    /**
     * 注册验证器
     * @param {string} type - 验证类型
     * @param {Object} validator - 验证器实例
     */
    registerValidator(type, validator) {
        this.#validators.set(type, validator);
    }

    /**
     * 添加验证规则
     * @param {import('./ValidationRule.js').ValidationRule} rule - 规则
     * @returns {string} 规则ID
     */
    addRule(rule) {
        const validation = rule.validate();
        if (!validation.valid) {
            throw new Error(`规则验证失败: ${validation.errors.join(", ")}`);
        }

        this.#rules.set(rule.id, rule);
        this.invalidateCache(rule.range);

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationEngine] 添加规则: ${rule.id} (${rule.type}) 范围: ${rule.range}`);
        return rule.id;
    }

    /**
     * 移除验证规则
     * @param {string} ruleId - 规则ID
     * @returns {boolean}
     */
    removeRule(ruleId) {
        const rule = this.#rules.get(ruleId);
        if (rule) {
            this.#rules.delete(ruleId);
            this.invalidateCache(rule.range);
            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationEngine] 移除规则: ${ruleId}`);
            return true;
        }
        return false;
    }

    /**
     * 获取指定区域的规则列表
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {import('./ValidationRule.js').ValidationRule[]}
     */
    getRulesForCell(row, col) {
        const rules = [];
        for (const rule of this.#rules.values()) {
            if (this.isCellInRange(row, col, rule.range)) {
                rules.push(rule);
            }
        }
        return rules.sort((a, b) => a.priority - b.priority);
    }

    /**
     * 验证单个单元格
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 单元格值
     * @returns {Promise<import('./ValidationResult.js').ValidationResult>}
     */
    async validateCell(row, col, value) {
        const cacheKey = `${row},${col}`;
        const cachedResult = this.getFromCache(cacheKey, value);

        if (cachedResult) {
            return cachedResult;
        }

        const rules = this.getRulesForCell(row, col);

        if (rules.length === 0) {
            return ValidationResult.success();
        }

        const context = { row, col, sheet: this.#cellStore.sheetName };

        switch (this.#conflictStrategy) {
            case "short-circuit":
                return await this.validateWithShortCircuit(rules, value, context);
            case "priority":
                return await this.validateWithPriority(rules, value, context);
            case "aggregate":
                return await this.validateWithAggregate(rules, value, context);
            default:
                return await this.validateWithShortCircuit(rules, value, context);
        }
    }

    /**
     * 批量验证区域
     * @param {string} range - 区域范围（如 "A1:A100"）
     * @returns {Promise<{total: number, valid: number, invalid: number, results: Array}>}
     */
    async validateRange(range) {
        const cells = this.getCellsInRange(range);
        const results = [];

        for (const { row, col, value } of cells) {
            const result = await this.validateCell(row, col, value);
            results.push({ row, col, ...result.toJSON() });
        }

        const validCount = results.filter((r) => r.valid).length;

        return {
            total: results.length,
            valid: validCount,
            invalid: results.length - validCount,
            results,
        };
    }

    /**
     * 短路策略验证（任一失败即失败）
     * @private
     */
    async validateWithShortCircuit(rules, value, context) {
        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ValidationEngine] 未找到类型为 ${rule.type} 的验证器`);
                continue;
            }

            const result = await validator.validate(value, rule, context);
            if (!result.valid) {
                this.setToCache(`${context.row},${context.col}`, value, result);
                return result;
            }
        }

        const successResult = ValidationResult.success();
        this.setToCache(`${context.row},${context.col}`, value, successResult);
        return successResult;
    }

    /**
     * 优先级策略验证（最高优先级决定结果）
     * @private
     */
    async validateWithPriority(rules, value, context) {
        let lastResult = ValidationResult.success();

        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            lastResult = await validator.validate(value, rule, context);
        }

        this.setToCache(`${context.row},${context.col}`, value, lastResult);
        return lastResult;
    }

    /**
     * 聚合策略验证（全部通过才算通过）
     * @private
     */
    async validateWithAggregate(rules, value, context) {
        const errors = [];

        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            const result = await validator.validate(value, rule, context);
            if (!result.valid) {
                errors.push(result.message);
            }
        }

        const finalResult = errors.length > 0 ? ValidationResult.failure(errors.join("; "), "warning") : ValidationResult.success();

        this.setToCache(`${context.row},${context.col}`, value, finalResult);
        return finalResult;
    }

    /**
     * 检查单元格是否在范围内
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} rangeStr - 范围字符串
     * @returns {boolean}
     */
    isCellInRange(row, col, rangeStr) {
        try {
            const match = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
            if (!match) return false;

            const colToNum = (col) => {
                let num = 0;
                for (let i = 0; i < col.length; i++) {
                    num = num * 26 + (col.charCodeAt(i) - 64);
                }
                return num - 1;
            };

            const startRow = parseInt(match[2]) - 1;
            const startCol = colToNum(match[1]);
            const endRow = parseInt(match[4]) - 1;
            const endCol = colToNum(match[3]);

            return row >= startRow && row <= endRow && col >= startCol && col <= endCol;
        } catch (e) {
            return false;
        }
    }

    /**
     * 获取范围内的所有单元格数据
     * @private
     * @param {string} rangeStr - 范围字符串
     * @returns {Array<{row: number, col: number, value: *}>}
     */
    getCellsInRange(rangeStr) {
        const cells = [];
        const match = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);

        if (!match) return cells;

        const colToNum = (col) => {
            let num = 0;
            for (let i = 0; i < col.length; i++) {
                num = num * 26 + (col.charCodeAt(i) - 64);
            }
            return num - 1;
        };

        const startRow = parseInt(match[2]) - 1;
        const startCol = colToNum(match[1]);
        const endRow = parseInt(match[4]) - 1;
        const endCol = colToNum(match[3]);

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const cell = this.#cellStore.get(row, col);
                cells.push({
                    row,
                    col,
                    value: cell?.value,
                });
            }
        }

        return cells;
    }

    /**
     * 缓存操作方法
     */
    getFromCache(key, value) {
        const cellCache = this.#cache.get(key);
        if (cellCache && cellCache.has(String(value))) {
            return cellCache.get(String(value));
        }
        return null;
    }

    setToCache(key, value, result) {
        if (!this.#cache.has(key)) {
            this.#cache.set(key, new Map());
        }

        const cellCache = this.#cache.get(key);

        if (cellCache.size >= this.#maxCacheSize) {
            const oldestKey = cellCache.keys().next().value;
            cellCache.delete(oldestKey);
        }

        cellCache.set(String(value), result);
    }

    invalidateCache(range) {
        if (!range) {
            this.#cache.clear();
            return;
        }

        for (const key of this.#cache.keys()) {
            const [row, col] = key.split(",").map(Number);
            if (this.isCellInRange(row, col, range)) {
                this.#cache.delete(key);
            }
        }
    }

    clearAllCache() {
        this.#cache.clear();
    }

    get rules() {
        return new Map(this.#rules);
    }

    set conflictStrategy(strategy) {
        const validStrategies = ["short-circuit", "priority", "aggregate"];
        if (!validStrategies.includes(strategy)) {
            throw new Error(`无效的冲突策略: ${strategy}`);
        }
        this.#conflictStrategy = strategy;
    }

    get conflictStrategy() {
        return this.#conflictStrategy;
    }

    destroy() {
        this.#validators.clear();
        this.#rules.clear();
        this.#cache.clear();
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationEngine] 已销毁");
    }
}
