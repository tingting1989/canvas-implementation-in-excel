import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { UI_CONFIG } from "../../constants/uiConfig.js";
import { colToIndex, indexToCol } from "../../utils/cellRef.js";
import { NumberValidator } from "./validators/NumberValidator.js";
import { TextLengthValidator } from "./validators/TextLengthValidator.js";
import { ListValidator } from "./validators/ListValidator.js";
import { UniqueValidator } from "./validators/UniqueValidator.js";
import { FormulaValidator } from "./validators/FormulaValidator.js";
import { DateTimeValidator } from "./validators/DateTimeValidator.js";
import { RegexValidator } from "./validators/RegexValidator.js";
import { ValidationResult } from "./ValidationResult.js";
import { ListSourceResolver } from "./ListSourceResolver.js";
import { complexityAnalyzer } from "./ComplexityAnalyzer.js";
import { getValidationCache } from "./ValidationCache.js";
import { ValidationRule } from "./ValidationRule.js";

export class ValidationEngine {
    #validators: Map<string, any> = new Map();
    #rules: Map<string, ValidationRule> = new Map();
    #destroyed: boolean = false;
    #cellStore: any;
    #cache: Map<string, Map<string, ValidationResult>> = new Map();
    #maxCacheSize: number = 10000;
    #conflictStrategy: string = "short-circuit";
    #sourceResolver: ListSourceResolver | null = null;
    #formulaEngine: any = null;
    #enableAdvancedCache: boolean = true;

    constructor(cellStore: any) {
        this.#cellStore = cellStore;
    }

    init(formulaEngine: any = null, sheetManager: any = null, config: Record<string, any> = {}): void {
        this.#formulaEngine = formulaEngine;
        this.#enableAdvancedCache = config.enableAdvancedCache !== false;

        this.#sourceResolver = new ListSourceResolver(this.#cellStore, sheetManager);

        this.registerValidator("number", new NumberValidator());
        this.registerValidator("text", new TextLengthValidator());

        const listValidator = new ListValidator();
        listValidator.setSourceResolver(this.#sourceResolver);
        this.registerValidator("list", listValidator);

        this.registerValidator("unique", new UniqueValidator(this.#cellStore));

        const formulaConfig = {
            syncThreshold: config.syncThreshold || 10,
            asyncTimeout: config.asyncTimeout || 500,
            enableDeferred: config.enableDeferred !== false,
            enableCache: this.#enableAdvancedCache,
        };
        this.registerValidator("formula", new FormulaValidator(formulaEngine, formulaConfig));

        const dateTimeValidator = new DateTimeValidator();
        this.registerValidator("date", dateTimeValidator);
        this.registerValidator("time", dateTimeValidator);
        this.registerValidator("datetime", dateTimeValidator);
        this.registerValidator("regex", new RegexValidator());
    }

    registerValidator(type: string, validator: any): void {
        this.#validators.set(type, validator);
        ValidationRule.registerValidType(type);
    }

    addRule(rule: ValidationRule): string {
        const validation = rule.validate();
        if (!validation.valid) {
            throw new Error(`规则验证失败: ${validation.errors.join(", ")}`);
        }

        this.#rules.set(rule.id, rule);
        this.invalidateCache(rule.range);
        return rule.id;
    }

    removeRule(ruleId: string): boolean {
        const rule = this.#rules.get(ruleId);
        if (rule) {
            this.#rules.delete(ruleId);
            this.invalidateCache(rule.range);
            return true;
        }
        return false;
    }

    getRulesForCell(row: number, col: number): ValidationRule[] {
        const rules: ValidationRule[] = [];
        for (const rule of this.#rules.values()) {
            if (this.isCellInRange(row, col, rule.range)) {
                rules.push(rule);
            }
        }
        return rules.sort((a: any, b: any) => a.priority - b.priority);
    }

    async validateCell(row: number, col: number, value: any, rules?: ValidationRule[]): Promise<ValidationResult> {
        const cacheKey = `${row},${col}`;

        try {
            if (this.#enableAdvancedCache) {
                const cache = getValidationCache();
                try {
                    const cached = cache ? await cache.get(cacheKey) : null;

                    if (cached && cached.result !== null && cached.result !== undefined) {
                        return cached.result.valid
                            ? ValidationResult.success({ source: "advanced-cache" })
                            : ValidationResult.failure(cached.result.rule?.errorMessage || "验证失败", cached.result.rule?.errorStyle || "stop", {
                                  ...cached.result.metadata,
                                  source: "advanced-cache",
                              });
                    }
                } catch (cacheError: any) {
                    errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationEngine] 三级缓存读取失败，降级到传统缓存", { error: cacheError });
                }
            }

            const legacyCached = this.getFromCache(cacheKey, value);
            if (legacyCached) {
                return legacyCached;
            }

            if (!rules || !Array.isArray(rules)) {
                rules = this.getRulesForCell(row, col);
            }

            if (rules.length === 0) {
                return ValidationResult.success();
            }

            const context = {
                row,
                col,
                sheet: this.#cellStore?.sheetName || "default",
                workbook: this.#cellStore?.workbook || null,
            };

            let result: ValidationResult;
            switch (this.#conflictStrategy) {
                case "short-circuit":
                    result = await this.validateWithShortCircuit(rules, value, context);
                    break;
                case "priority":
                    result = await this.validateWithPriority(rules, value, context);
                    break;
                case "aggregate":
                    result = await this.validateWithAggregate(rules, value, context);
                    break;
                default:
                    result = await this.validateWithShortCircuit(rules, value, context);
            }

            if (this.#enableAdvancedCache && result) {
                const cache = getValidationCache();
                if (cache) {
                    cache
                        .set(
                            cacheKey,
                            {
                                valid: result.valid,
                                value,
                                ruleId: result.ruleId,
                                metadata: result.metadata,
                            },
                            {
                                source: "validation-engine",
                                sheet: context.sheet,
                            },
                        )
                        .catch((cacheError: any) => {
                            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationEngine] 缓存写入失败（不影响主流程）", {
                                error: cacheError,
                            });
                        });
                }
            }

            return result;
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ValidationEngine] validateCell() 异常", { error, row, col, value });

            return ValidationResult.failure(`验证引擎异常: ${error.message}`, "warning", { error: error.message, row, col });
        }
    }

    validateCellSync(row: number, col: number, value: any): ValidationResult {
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

    async validateRange(range: string): Promise<{ total: number; valid: number; invalid: number; results: any[] }> {
        const cells = this.getCellsInRange(range);
        const results: any[] = [];

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

    async validateWithShortCircuit(rules: ValidationRule[], value: any, context: Record<string, any>): Promise<ValidationResult> {
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

    async validateWithPriority(rules: ValidationRule[], value: any, context: Record<string, any>): Promise<ValidationResult> {
        let lastResult: ValidationResult = ValidationResult.success();

        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            lastResult = await validator.validate(value, rule, context);
        }

        this.setToCache(`${context.row},${context.col}`, value, lastResult);
        return lastResult;
    }

    async validateWithAggregate(rules: ValidationRule[], value: any, context: Record<string, any>): Promise<ValidationResult> {
        const errors: string[] = [];

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

    validateWithShortCircuitSync(rules: ValidationRule[], value: any, context: Record<string, any>): ValidationResult {
        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            const validateFn = validator.validateSync || validator.validate;
            const result = validateFn.call(validator, value, rule, context);
            if (!result.valid) return result;
        }
        return ValidationResult.success();
    }

    validateWithPrioritySync(rules: ValidationRule[], value: any, context: Record<string, any>): ValidationResult {
        let lastResult: ValidationResult = ValidationResult.success();

        for (const rule of rules) {
            const validator = this.#validators.get(rule.type);
            if (!validator) continue;

            const validateFn = validator.validateSync || validator.validate;
            lastResult = validateFn.call(validator, value, rule, context);
        }

        return lastResult;
    }

    validateWithAggregateSync(rules: ValidationRule[], value: any, context: Record<string, any>): ValidationResult {
        const errors: string[] = [];

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

    isCellInRange(row: number, col: number, rangeStr: string): boolean {
        try {
            const colToNum = (colStr: string): number => {
                let num = 0;
                for (let i = 0; i < colStr.length; i++) {
                    num = num * 26 + (colStr.charCodeAt(i) - 64);
                }
                return num - 1;
            };

            const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
            if (fullColMatch) {
                const startCol = colToNum(fullColMatch[1]);
                const endCol = colToNum(fullColMatch[2]);
                return col >= startCol && col <= endCol;
            }

            const fullRowMatch = rangeStr.match(/^(\d+):(\d+)$/);
            if (fullRowMatch) {
                const startRow = parseInt(fullRowMatch[1]) - 1;
                const endRow = parseInt(fullRowMatch[2]) - 1;
                return row >= startRow && row <= endRow;
            }

            const rangeMatch = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
            if (rangeMatch) {
                const startRow = parseInt(rangeMatch[2]) - 1;
                const startCol = colToNum(rangeMatch[1]);
                const endRow = parseInt(rangeMatch[4]) - 1;
                const endCol = colToNum(rangeMatch[3]);

                return row >= startRow && row <= endRow && col >= startCol && col <= endCol;
            }

            return false;
        } catch (e: any) {
            console.error(`[VE-ERROR] isCellInRange failed for range="${rangeStr}"`, e);
            return false;
        }
    }

    getCellsInRange(rangeStr: string): Array<{ row: number; col: number; value: any }> {
        const cells: Array<{ row: number; col: number; value: any }> = [];
        const match = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);

        if (!match) return cells;

        const colToNum = (col: string): number => {
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

    getFromCache(key: string, value: any): ValidationResult | null {
        const cellCache = this.#cache.get(key);
        if (cellCache && cellCache.has(String(value))) {
            return cellCache.get(String(value)) ?? null;
        }
        return null;
    }

    setToCache(key: string, value: any, result: ValidationResult): void {
        if (!this.#cache.has(key)) {
            this.#cache.set(key, new Map());
        }

        const cellCache = this.#cache.get(key)!;

        if (cellCache.size >= this.#maxCacheSize) {
            const oldestKey = cellCache.keys().next().value as string;
            cellCache.delete(oldestKey);
        }

        cellCache.set(String(value), result);
    }

    invalidateCache(range: string | null): void {
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

    clearAllCache(): void {
        this.#cache.clear();
    }

    get rules(): Map<string, ValidationRule> {
        return new Map(this.#rules);
    }

    set conflictStrategy(strategy: string) {
        const validStrategies = ["short-circuit", "priority", "aggregate"];
        if (!validStrategies.includes(strategy)) {
            throw new Error(`无效的冲突策略: ${strategy}`);
        }
        this.#conflictStrategy = strategy;
    }

    get conflictStrategy(): string {
        return this.#conflictStrategy;
    }

    get sourceResolver(): ListSourceResolver | null {
        return this.#sourceResolver;
    }

    static #calcShiftedIndex(index: number, from: number, to: number): number {
        if (index === from) return to;
        if (from < to) return index > from && index <= to ? index - 1 : index;
        return index >= to && index < from ? index + 1 : index;
    }

    static #shiftRangeStr(rangeStr: string, axis: typeof UI_CONFIG.AXIS_COL | typeof UI_CONFIG.AXIS_ROW, from: number, to: number): string {
        try {
            const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
            if (fullColMatch) {
                if (axis === UI_CONFIG.AXIS_COL) {
                    const startCol = colToIndex(fullColMatch[1]);
                    const endCol = colToIndex(fullColMatch[2]);
                    const newStart = ValidationEngine.#calcShiftedIndex(startCol, from, to);
                    const newEnd = ValidationEngine.#calcShiftedIndex(endCol, from, to);
                    return `${indexToCol(newStart)}:${indexToCol(newEnd)}`;
                }
                return rangeStr;
            }

            const fullRowMatch = rangeStr.match(/^(\d+):(\d+)$/);
            if (fullRowMatch) {
                if (axis === UI_CONFIG.AXIS_ROW) {
                    const startRow = parseInt(fullRowMatch[1]) - 1;
                    const endRow = parseInt(fullRowMatch[2]) - 1;
                    const newStart = ValidationEngine.#calcShiftedIndex(startRow, from, to);
                    const newEnd = ValidationEngine.#calcShiftedIndex(endRow, from, to);
                    return `${newStart + 1}:${newEnd + 1}`;
                }
                return rangeStr;
            }

            const rangeMatch = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
            if (rangeMatch) {
                const startCol = colToIndex(rangeMatch[1]);
                const startRow = parseInt(rangeMatch[2]) - 1;
                const endCol = colToIndex(rangeMatch[3]);
                const endRow = parseInt(rangeMatch[4]) - 1;

                const newStartCol = axis === UI_CONFIG.AXIS_COL ? ValidationEngine.#calcShiftedIndex(startCol, from, to) : startCol;
                const newEndCol = axis === UI_CONFIG.AXIS_COL ? ValidationEngine.#calcShiftedIndex(endCol, from, to) : endCol;
                const newStartRow = axis === UI_CONFIG.AXIS_ROW ? ValidationEngine.#calcShiftedIndex(startRow, from, to) : startRow;
                const newEndRow = axis === UI_CONFIG.AXIS_ROW ? ValidationEngine.#calcShiftedIndex(endRow, from, to) : endRow;

                return `${indexToCol(newStartCol)}${newStartRow + 1}:${indexToCol(newEndCol)}${newEndRow + 1}`;
            }

            return rangeStr;
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ValidationEngine] shiftRangeStr failed for range="${rangeStr}"`, { error: e });
            return rangeStr;
        }
    }

    static #isRangeCoveringAxis(rangeStr: string, axis: typeof UI_CONFIG.AXIS_COL | typeof UI_CONFIG.AXIS_ROW, index: number): boolean {
        try {
            const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
            if (fullColMatch && axis === UI_CONFIG.AXIS_COL) {
                const startCol = colToIndex(fullColMatch[1]);
                const endCol = colToIndex(fullColMatch[2]);
                return index >= startCol && index <= endCol;
            }

            const fullRowMatch = rangeStr.match(/^(\d+):(\d+)$/);
            if (fullRowMatch && axis === UI_CONFIG.AXIS_ROW) {
                const startRow = parseInt(fullRowMatch[1]) - 1;
                const endRow = parseInt(fullRowMatch[2]) - 1;
                return index >= startRow && index <= endRow;
            }

            const rangeMatch = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
            if (rangeMatch) {
                if (axis === UI_CONFIG.AXIS_COL) {
                    const startCol = colToIndex(rangeMatch[1]);
                    const endCol = colToIndex(rangeMatch[3]);
                    return index >= startCol && index <= endCol;
                }
                const startRow = parseInt(rangeMatch[2]) - 1;
                const endRow = parseInt(rangeMatch[4]) - 1;
                return index >= startRow && index <= endRow;
            }

            return false;
        } catch (e: any) {
            return false;
        }
    }

    static #shiftRangeStrForInsert(rangeStr: string, axis: typeof UI_CONFIG.AXIS_COL | typeof UI_CONFIG.AXIS_ROW, atIndex: number): string {
        try {
            const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
            if (fullColMatch) {
                if (axis === UI_CONFIG.AXIS_COL) {
                    const startCol = colToIndex(fullColMatch[1]);
                    const endCol = colToIndex(fullColMatch[2]);
                    const newStart = startCol >= atIndex ? startCol + 1 : startCol;
                    const newEnd = endCol >= atIndex ? endCol + 1 : endCol;
                    return `${indexToCol(newStart)}:${indexToCol(newEnd)}`;
                }
                return rangeStr;
            }

            const fullRowMatch = rangeStr.match(/^(\d+):(\d+)$/);
            if (fullRowMatch) {
                if (axis === UI_CONFIG.AXIS_ROW) {
                    const startRow = parseInt(fullRowMatch[1]) - 1;
                    const endRow = parseInt(fullRowMatch[2]) - 1;
                    const newStart = startRow >= atIndex ? startRow + 1 : startRow;
                    const newEnd = endRow >= atIndex ? endRow + 1 : endRow;
                    return `${newStart + 1}:${newEnd + 1}`;
                }
                return rangeStr;
            }

            const rangeMatch = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
            if (rangeMatch) {
                const startCol = colToIndex(rangeMatch[1]);
                const startRow = parseInt(rangeMatch[2]) - 1;
                const endCol = colToIndex(rangeMatch[3]);
                const endRow = parseInt(rangeMatch[4]) - 1;

                const newStartCol = axis === UI_CONFIG.AXIS_COL && startCol >= atIndex ? startCol + 1 : startCol;
                const newEndCol = axis === UI_CONFIG.AXIS_COL && endCol >= atIndex ? endCol + 1 : endCol;
                const newStartRow = axis === UI_CONFIG.AXIS_ROW && startRow >= atIndex ? startRow + 1 : startRow;
                const newEndRow = axis === UI_CONFIG.AXIS_ROW && endRow >= atIndex ? endRow + 1 : endRow;

                return `${indexToCol(newStartCol)}${newStartRow + 1}:${indexToCol(newEndCol)}${newEndRow + 1}`;
            }

            return rangeStr;
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ValidationEngine] shiftRangeStrForInsert failed for range="${rangeStr}"`, { error: e });
            return rangeStr;
        }
    }

    static #shiftRangeStrForDelete(rangeStr: string, axis: typeof UI_CONFIG.AXIS_COL | typeof UI_CONFIG.AXIS_ROW, atIndex: number): string {
        try {
            const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
            if (fullColMatch) {
                if (axis === UI_CONFIG.AXIS_COL) {
                    const startCol = colToIndex(fullColMatch[1]);
                    const endCol = colToIndex(fullColMatch[2]);
                    const newStart = startCol > atIndex ? startCol - 1 : startCol;
                    const newEnd = endCol > atIndex ? endCol - 1 : endCol;
                    return `${indexToCol(newStart)}:${indexToCol(newEnd)}`;
                }
                return rangeStr;
            }

            const fullRowMatch = rangeStr.match(/^(\d+):(\d+)$/);
            if (fullRowMatch) {
                if (axis === UI_CONFIG.AXIS_ROW) {
                    const startRow = parseInt(fullRowMatch[1]) - 1;
                    const endRow = parseInt(fullRowMatch[2]) - 1;
                    const newStart = startRow > atIndex ? startRow - 1 : startRow;
                    const newEnd = endRow > atIndex ? endRow - 1 : endRow;
                    return `${newStart + 1}:${newEnd + 1}`;
                }
                return rangeStr;
            }

            const rangeMatch = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
            if (rangeMatch) {
                const startCol = colToIndex(rangeMatch[1]);
                const startRow = parseInt(rangeMatch[2]) - 1;
                const endCol = colToIndex(rangeMatch[3]);
                const endRow = parseInt(rangeMatch[4]) - 1;

                const newStartCol = axis === UI_CONFIG.AXIS_COL && startCol > atIndex ? startCol - 1 : startCol;
                const newEndCol = axis === UI_CONFIG.AXIS_COL && endCol > atIndex ? endCol - 1 : endCol;
                const newStartRow = axis === UI_CONFIG.AXIS_ROW && startRow > atIndex ? startRow - 1 : startRow;
                const newEndRow = axis === UI_CONFIG.AXIS_ROW && endRow > atIndex ? endRow - 1 : endRow;

                return `${indexToCol(newStartCol)}${newStartRow + 1}:${indexToCol(newEndCol)}${newEndRow + 1}`;
            }

            return rangeStr;
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ValidationEngine] shiftRangeStrForDelete failed for range="${rangeStr}"`, { error: e });
            return rangeStr;
        }
    }

    shiftRuleRangesForColumnMove(fromCol: number, toCol: number): void {
        if (fromCol === toCol || this.#destroyed) return;

        for (const rule of this.#rules.values()) {
            const newRange = ValidationEngine.#shiftRangeStr(rule.range, UI_CONFIG.AXIS_COL, fromCol, toCol);
            if (newRange !== rule.range) {
                this.invalidateCache(rule.range);
                rule.range = newRange;
                rule.updatedAt = new Date();
            }
        }

        this.#cache.clear();
    }

    shiftRuleRangesForRowMove(fromRow: number, toRow: number): void {
        if (fromRow === toRow || this.#destroyed) return;

        for (const rule of this.#rules.values()) {
            const newRange = ValidationEngine.#shiftRangeStr(rule.range, UI_CONFIG.AXIS_ROW, fromRow, toRow);
            if (newRange !== rule.range) {
                this.invalidateCache(rule.range);
                rule.range = newRange;
                rule.updatedAt = new Date();
            }
        }

        this.#cache.clear();
    }

    shiftRuleRangesForColumnInsert(atCol: number): void {
        if (this.#destroyed) return;

        for (const rule of this.#rules.values()) {
            const newRange = ValidationEngine.#shiftRangeStrForInsert(rule.range, UI_CONFIG.AXIS_COL, atCol);
            if (newRange !== rule.range) {
                this.invalidateCache(rule.range);
                rule.range = newRange;
                rule.updatedAt = new Date();
            }
        }

        this.#cache.clear();
    }

    shiftRuleRangesForColumnDelete(atCol: number): void {
        if (this.#destroyed) return;

        const toRemove: string[] = [];

        for (const [ruleId, rule] of this.#rules) {
            if (ValidationEngine.#isRangeCoveringAxis(rule.range, UI_CONFIG.AXIS_COL, atCol)) {
                toRemove.push(ruleId);
                continue;
            }

            const newRange = ValidationEngine.#shiftRangeStrForDelete(rule.range, UI_CONFIG.AXIS_COL, atCol);
            if (newRange !== rule.range) {
                this.invalidateCache(rule.range);
                rule.range = newRange;
                rule.updatedAt = new Date();
            }
        }

        for (const ruleId of toRemove) {
            this.#rules.delete(ruleId);
        }

        this.#cache.clear();
    }

    shiftRuleRangesForRowInsert(atRow: number): void {
        if (this.#destroyed) return;

        for (const rule of this.#rules.values()) {
            const newRange = ValidationEngine.#shiftRangeStrForInsert(rule.range, UI_CONFIG.AXIS_ROW, atRow);
            if (newRange !== rule.range) {
                this.invalidateCache(rule.range);
                rule.range = newRange;
                rule.updatedAt = new Date();
            }
        }

        this.#cache.clear();
    }

    shiftRuleRangesForRowDelete(atRow: number): void {
        if (this.#destroyed) return;

        const toRemove: string[] = [];

        for (const [ruleId, rule] of this.#rules) {
            if (ValidationEngine.#isRangeCoveringAxis(rule.range, UI_CONFIG.AXIS_ROW, atRow)) {
                toRemove.push(ruleId);
                continue;
            }

            const newRange = ValidationEngine.#shiftRangeStrForDelete(rule.range, UI_CONFIG.AXIS_ROW, atRow);
            if (newRange !== rule.range) {
                this.invalidateCache(rule.range);
                rule.range = newRange;
                rule.updatedAt = new Date();
            }
        }

        for (const ruleId of toRemove) {
            this.#rules.delete(ruleId);
        }

        this.#cache.clear();
    }

    destroy(): void {
        if (this.#destroyed) return;
        this.#destroyed = true;

        this.#validators.clear();
        this.#rules.clear();
        this.#cache.clear();

        if (this.#enableAdvancedCache) {
            const cache = getValidationCache();
            if (cache) {
                try {
                    cache.clear();
                    errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationEngine] 三级缓存已清空");
                } catch (error: any) {
                    errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationEngine] 三级缓存清空失败", { error });
                }
            }
        }

        this.#sourceResolver?.destroy();
        this.#sourceResolver = null;
        this.#cellStore = null;
        this.#formulaEngine = null;
    }
}
