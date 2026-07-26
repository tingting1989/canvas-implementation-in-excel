import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";
import { NumberValidator } from "./validators/NumberValidator.js";
import { TextLengthValidator } from "./validators/TextLengthValidator.js";
import { ListValidator } from "./validators/ListValidator.js";
import { UniqueValidatorV3 } from "./validators/UniqueValidatorV3.js";
import { FormulaValidator } from "./validators/FormulaValidator.js";
import { DateValidator } from "./validators/DateValidator.js";
import { TimeValidator } from "./validators/TimeValidator.js";
import { RegexValidator } from "./validators/RegexValidator.js";
import { ValidationResult } from "./ValidationResult.js";
import { ListSourceResolver } from "./ListSourceResolver.js";

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

    /** @type {boolean} 是否已销毁 */
    #destroyed = false;

    /** @type {Object} CellStore 实例 */
    #cellStore;

    /** @type {Map<string, Map<string, import('./ValidationResult.js').ValidationResult>>} 验证结果缓存 */
    #cache = new Map();

    /** @type {number} 缓存最大容量 */
    #maxCacheSize = 10000;

    /** @type {string} 规则冲突解决策略：short-circuit|priority|aggregate */
    #conflictStrategy = "short-circuit";

    /** @type {ListSourceResolver|null} 动态数据源解析器 */
    #sourceResolver = null;

    /**
     * 构造验证引擎
     * @param {Object} cellStore - CellStore 实例
     */
    constructor(cellStore) {
        this.#cellStore = cellStore;
    }

    /**
     * 初始化引擎（注册所有内置验证器）
     * 内置验证器类型：number、text、list、unique、custom、date、time、regex
     * @param {Object|null} [formulaEngine=null] - 公式引擎实例，custom 类型验证器需要
     * @param {Object|null} [sheetManager=null] - SheetManager 实例，动态区域引用需要
     */
    async init(formulaEngine = null, sheetManager = null) {
        this.#sourceResolver = new ListSourceResolver(this.#cellStore, sheetManager);

        this.registerValidator("number", new NumberValidator());
        this.registerValidator("text", new TextLengthValidator());

        const listValidator = new ListValidator();
        listValidator.setSourceResolver(this.#sourceResolver);
        this.registerValidator("list", listValidator);

        this.registerValidator("unique", new UniqueValidatorV3(this.#cellStore));
        this.registerValidator("custom", new FormulaValidator(formulaEngine));
        this.registerValidator("date", new DateValidator());
        this.registerValidator("time", new TimeValidator());
        this.registerValidator("regex", new RegexValidator());
    }

    /**
     * 注册验证器
     * @param {string} type - 验证类型标识（如 "number"、"list"）
     * @param {Object} validator - 验证器实例，需提供 validate(value, rule, context) 方法
     */
    registerValidator(type, validator) {
        this.#validators.set(type, validator);
    }

    /**
     * 添加验证规则
     * 校验规则有效性，通过后存入规则表并使受影响范围的缓存失效
     * @param {import('./ValidationRule.js').ValidationRule} rule - 规则实例
     * @returns {string} 规则 ID
     * @throws {Error} 规则校验失败时抛出异常
     */
    addRule(rule) {
        const validation = rule.validate();
        if (!validation.valid) {
            throw new Error(`规则验证失败: ${validation.errors.join(", ")}`);
        }

        this.#rules.set(rule.id, rule);
        this.invalidateCache(rule.range);
        return rule.id;
    }

    /**
     * 移除验证规则
     * 移除后使受影响范围的缓存失效
     * @param {string} ruleId - 规则 ID
     * @returns {boolean} 是否成功移除
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
     * 获取指定单元格关联的所有验证规则
     * 返回结果按 priority 升序排列（优先级数值越小越先执行）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {import('./ValidationRule.js').ValidationRule[]} 规则数组
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
     * 异步验证单个单元格
     * 先查缓存，命中则直接返回；否则按冲突策略执行验证并写入缓存
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 待验证的值
     * @returns {Promise<import('./ValidationResult.js').ValidationResult>} 验证结果
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
     * 同步验证单个单元格
     * 用于 BEFORE_SET_VALUE_AT 钩子拦截（必须同步返回），不经过缓存
     * 优先使用验证器的 validateSync 方法，不存在则回退到 validate
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 待验证的值
     * @returns {import('./ValidationResult.js').ValidationResult} 验证结果
     */
    validateCellSync(row, col, value) {
        const rules = this.getRulesForCell(row, col);

        if (rules.length === 0) {
            return ValidationResult.success();
        }

        const context = { row, col, sheet: this.#cellStore?.sheetName || "" };

        switch (this.#conflictStrategy) {
            case "short-circuit":
                return this.validateWithShortCircuitSync(rules, value, context);
            case "priority":
                return this.validateWithPrioritySync(rules, value, context);
            case "aggregate":
                return this.validateWithAggregateSync(rules, value, context);
            default:
                return this.validateWithShortCircuitSync(rules, value, context);
        }
    }

    /**
     * 批量验证区域内的所有单元格
     * @param {string} range - 区域范围字符串（如 "A1:A100"）
     * @returns {Promise<{total: number, valid: number, invalid: number, results: Array}>} 批量验证报告
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
     * 按优先级逐条验证，第一条失败规则的结果即为最终结果
     * @private
     * @param {ValidationRule[]} rules - 按优先级排序的规则数组
     * @param {*} value - 待验证的值
     * @param {object} context - 验证上下文 { row, col, sheet }
     * @returns {Promise<ValidationResult>} 验证结果
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
     * 按优先级逐条验证，最后一条规则的结果即为最终结果
     * @private
     * @param {ValidationRule[]} rules - 按优先级排序的规则数组
     * @param {*} value - 待验证的值
     * @param {object} context - 验证上下文 { row, col, sheet }
     * @returns {Promise<ValidationResult>} 验证结果
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
     * 收集所有失败规则的错误信息，用分号拼接
     * @private
     * @param {ValidationRule[]} rules - 按优先级排序的规则数组
     * @param {*} value - 待验证的值
     * @param {object} context - 验证上下文 { row, col, sheet }
     * @returns {Promise<ValidationResult>} 验证结果
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
     * 短路策略验证（同步版本）
     * 用于 BEFORE_SET_VALUE_AT 钩子拦截，必须同步返回
     * 优先使用验证器的 validateSync 方法，不存在则回退到 validate
     * @private
     * @param {ValidationRule[]} rules - 按优先级排序的规则数组
     * @param {*} value - 待验证的值
     * @param {object} context - 验证上下文
     * @returns {ValidationResult} 验证结果
     */
    validateWithShortCircuitSync(rules, value, context) {
        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            const validateFn = validator.validateSync || validator.validate;
            const result = validateFn.call(validator, value, rule, context);
            if (!result.valid) return result;
        }
        return ValidationResult.success();
    }

    /**
     * 优先级策略验证（同步版本）
     * @private
     * @param {ValidationRule[]} rules - 按优先级排序的规则数组
     * @param {*} value - 待验证的值
     * @param {object} context - 验证上下文
     * @returns {ValidationResult} 验证结果
     */
    validateWithPrioritySync(rules, value, context) {
        let lastResult = ValidationResult.success();

        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            const validateFn = validator.validateSync || validator.validate;
            lastResult = validateFn.call(validator, value, rule, context);
        }

        return lastResult;
    }

    /**
     * 聚合策略验证（同步版本）
     * @private
     * @param {ValidationRule[]} rules - 按优先级排序的规则数组
     * @param {*} value - 待验证的值
     * @param {object} context - 验证上下文
     * @returns {ValidationResult} 验证结果
     */
    validateWithAggregateSync(rules, value, context) {
        const errors = [];

        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            const validateFn = validator.validateSync || validator.validate;
            const result = validateFn.call(validator, value, rule, context);
            if (!result.valid) {
                errors.push(result.message);
            }
        }

        return errors.length > 0 ? ValidationResult.failure(errors.join("; "), "warning") : ValidationResult.success();
    }

    /**
     * 检查单元格是否在范围内
     * 支持三种范围模式：
     * 1. 整列 "A:A" 或 "B:C"
     * 2. 整行 "1:1" 或 "2:5"
     * 3. 标准区域 "A1:B100"
     * @private
     * @param {number} row - 行号（0-based）
     * @param {number} col - 列号（0-based）
     * @param {string} rangeStr - 范围字符串
     * @returns {boolean} 单元格是否在范围内
     */
    isCellInRange(row, col, rangeStr) {
        try {
            const colToNum = (colStr) => {
                let num = 0;
                for (let i = 0; i < colStr.length; i++) {
                    num = num * 26 + (colStr.charCodeAt(i) - 64);
                }
                return num - 1;
            };

            // 模式 1: 整列 "A:A", "B:C"
            const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
            if (fullColMatch) {
                const startCol = colToNum(fullColMatch[1]);
                const endCol = colToNum(fullColMatch[2]);
                return col >= startCol && col <= endCol;
            }

            // 模式 2: 整行 "1:1", "2:5"
            const fullRowMatch = rangeStr.match(/^(\d+):(\d+)$/);
            if (fullRowMatch) {
                const startRow = parseInt(fullRowMatch[1]) - 1;
                const endRow = parseInt(fullRowMatch[2]) - 1;
                return row >= startRow && row <= endRow;
            }

            // 模式 3: 标准区域 "A1:B100"
            const rangeMatch = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
            if (rangeMatch) {
                const startRow = parseInt(rangeMatch[2]) - 1;
                const startCol = colToNum(rangeMatch[1]);
                const endRow = parseInt(rangeMatch[4]) - 1;
                const endCol = colToNum(rangeMatch[3]);

                return row >= startRow && row <= endRow && col >= startCol && col <= endCol;
            }

            return false;
        } catch (e) {
            console.error(`[VE-ERROR] isCellInRange failed for range="${rangeStr}"`, e);
            return false;
        }
    }

    /**
     * 获取范围内的所有单元格数据
     * 仅支持标准区域模式 "A1:B100"
     * @private
     * @param {string} rangeStr - 范围字符串
     * @returns {Array<{row: number, col: number, value: *}>} 单元格数据数组
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
     * 从缓存中读取验证结果
     * 缓存结构为两级 Map：外层 key 为 "row,col"，内层 key 为值的字符串表示
     * @param {string} key - 缓存键，格式为 "row,col"
     * @param {*} value - 单元格值，用于匹配内层缓存
     * @returns {ValidationResult|null} 缓存的验证结果，未命中返回 null
     */
    getFromCache(key, value) {
        const cellCache = this.#cache.get(key);
        if (cellCache && cellCache.has(String(value))) {
            return cellCache.get(String(value));
        }
        return null;
    }

    /**
     * 将验证结果写入缓存
     * 当内层缓存达到 #maxCacheSize 时，淘汰最早的条目（FIFO）
     * @param {string} key - 缓存键，格式为 "row,col"
     * @param {*} value - 单元格值
     * @param {ValidationResult} result - 验证结果
     */
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

    /**
     * 使指定范围内的缓存失效
     * range 为 null 时清空全部缓存
     * @param {string|null} range - 范围字符串，null 表示全部
     */
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

    /** 清空全部验证结果缓存 */
    clearAllCache() {
        this.#cache.clear();
    }

    /** @returns {Map<string, ValidationRule>} 规则映射表的浅拷贝 */
    get rules() {
        return new Map(this.#rules);
    }

    /**
     * 设置规则冲突解决策略
     * @param {string} strategy - 策略名称，可选值：short-circuit | priority | aggregate
     * @throws {Error} 策略名称无效时抛出异常
     */
    set conflictStrategy(strategy) {
        const validStrategies = ["short-circuit", "priority", "aggregate"];
        if (!validStrategies.includes(strategy)) {
            throw new Error(`无效的冲突策略: ${strategy}`);
        }
        this.#conflictStrategy = strategy;
    }

    /** @returns {string} 当前冲突解决策略 */
    get conflictStrategy() {
        return this.#conflictStrategy;
    }

    /** @returns {ListSourceResolver|null} 动态数据源解析器 */
    get sourceResolver() {
        return this.#sourceResolver;
    }

    /**
     * 销毁引擎，清空验证器注册表、规则存储和缓存
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;

        this.#validators.clear();
        this.#rules.clear();
        this.#cache.clear();
        this.#sourceResolver?.destroy();
        this.#sourceResolver = null;
        this.#cellStore = null;
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationEngine] 已销毁");
    }
}
