import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { BasePlugin } from "../base/BasePlugin.js";
import { ValidationEngine } from "./ValidationEngine.js";
import { ValidationRule } from "./ValidationRule.js";
import { ValidationUIController } from "./ValidationUIController.js";
import { ValidationPortalManager } from "./ValidationPortalManager.js";
import { ValidationDirtyFlagManager } from "./ValidationDirtyFlagManager.js";
import { CopyPasteHandler, PASTE_OPTIONS } from "./CopyPasteHandler.js";
import { getValidationCache, initValidationCache } from "./ValidationCache.js";
import { HOOKS } from "../../constants/hookNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { ERROR_STYLE } from "../../constants/enums/ErrorStyle.js";
import { stylePool } from "../../model/styles";
import { ValidationStrategy } from "./ValidationStrategy.js";
import { ValidationResult } from "./ValidationResult.js";

const VALIDATION_ERROR_STYLES = Object.freeze({
    stop: {
        backgroundColor: "#FFCDD2",
        color: "#B71C1C",
        textDecoration: "line-through",
        fontWeight: "bold",
    },
    warning: {
        backgroundColor: "#FFF9C4",
        color: "#F57F17",
        fontStyle: "italic",
    },
    information: {
        border: "2px dashed #2196F3",
    },
});

interface PluginOptions {
    rules?: Record<string, any>[];
    conflictStrategy?: string;
    highlightInvalidCells?: boolean;
    formulaValidation?: {
        syncFastPath?: { enabled?: boolean; threshold?: number; maxComplexity?: number };
        asyncValidation?: { enabled?: boolean; timeout?: number; maxConcurrent?: number; retryAttempts?: number };
        cache?: { enabled?: boolean; l1MaxSize?: number; l2MaxSize?: number; l3Enabled?: boolean; defaultTTL?: number };
    };
    [key: string]: any;
}

/**
 * 数据验证插件
 *
 * 提供单元格数据验证功能，支持以下验证类型：
 * - 数值范围（number）
 * - 文本长度（text）
 * - 下拉列表（list）
 * - 唯一性检查（unique）
 * - 自定义公式（formula）
 * - 日期/时间（date/time/datetime）
 * - 正则表达式（regex）
 */
export class DataValidationPlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "dataValidation";
    }

    #active: boolean = false;
    #engine: ValidationEngine | null = null;
    #portalUI: ValidationUIController | null = null;
    #portalManager: ValidationPortalManager | null = null;
    #dirtyFlagManager: ValidationDirtyFlagManager | null = null;
    #copyPasteHandler: CopyPasteHandler | null = null;
    #initialRules: Record<string, any>[] = [];
    #conflictStrategy: string = "short-circuit";
    #highlightInvalidCells: boolean = false;
    #errorStyleRules: Map<string, { cfRule: any; styleId: number }> = new Map();
    #sheetSwitchUnsubscribe: (() => void) | null = null;
    #columnMoveUnsubscribe: (() => void) | null = null;
    #rowMoveUnsubscribe: (() => void) | null = null;
    #columnInsertUnsubscribe: (() => void) | null = null;
    #columnDeleteUnsubscribe: (() => void) | null = null;
    #rowInsertUnsubscribe: (() => void) | null = null;
    #rowDeleteUnsubscribe: (() => void) | null = null;
    #afterRenderCallback: (() => void) | null = null;

    init(options: PluginOptions = {}): void {
        super.init(options);

        const formulaValidationConfig = options.formulaValidation || {};

        const engineConfig = {
            enableAdvancedCache: formulaValidationConfig.cache?.enabled !== false,
            syncThreshold: formulaValidationConfig.syncFastPath?.threshold || 10,
            maxComplexity: formulaValidationConfig.syncFastPath?.maxComplexity || 2,
            asyncTimeout: formulaValidationConfig.asyncValidation?.timeout || 500,
            maxConcurrent: formulaValidationConfig.asyncValidation?.maxConcurrent || 5,
            retryAttempts: formulaValidationConfig.asyncValidation?.retryAttempts || 2,
            enableDeferred: formulaValidationConfig.asyncValidation?.enabled !== false,
        };

        if (formulaValidationConfig.cache) {
            initValidationCache({
                l1MaxSize: formulaValidationConfig.cache.l1MaxSize,
                l2MaxSize: formulaValidationConfig.cache.l2MaxSize,
                l3Enabled: formulaValidationConfig.cache.l3Enabled,
                defaultTTL: formulaValidationConfig.cache.defaultTTL,
            });
        } else {
            initValidationCache();
        }

        this.#engine = new ValidationEngine((this as any).sheet?.cellStore);
        const formulaEngine = (this as any).workbook?.formulaEngine || null;
        this.#engine.init(formulaEngine, null, engineConfig);

        if (options.conflictStrategy) {
            this.#engine.conflictStrategy = options.conflictStrategy as any;
            this.#conflictStrategy = options.conflictStrategy;
        }

        if (options.highlightInvalidCells !== undefined) {
            this.#highlightInvalidCells = !!options.highlightInvalidCells;
        }

        if (options.rules && Array.isArray(options.rules)) {
            this.#initialRules = [...options.rules];
            let successCount = 0;
            for (const ruleConfig of options.rules) {
                try {
                    const rule = new ValidationRule(ruleConfig);
                    this.#engine.addRule(rule);
                    successCount++;
                } catch (e) {
                    errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 加载规则失败:`, e);
                }
            }
        }

        this.#registerStrategy();
        this.#bindSheetSwitchListener();
        this.#bindColumnMoveListener();
        this.#bindRowMoveListener();
        this.#bindColumnInsertDeleteListeners();
        this.#bindRowInsertDeleteListeners();
        this.#initUIController();
        this.#dirtyFlagManager = new ValidationDirtyFlagManager();
        this.#copyPasteHandler = new CopyPasteHandler(this);
        this.#active = true;
    }

    get active(): boolean {
        return this.#active;
    }

    get engine(): ValidationEngine | null {
        return this.#engine;
    }

    get uiController(): ValidationUIController | null {
        return this.#portalUI;
    }

    get dirtyFlagManager(): ValidationDirtyFlagManager | null {
        return this.#dirtyFlagManager;
    }

    get copyPasteHandler(): CopyPasteHandler | null {
        return this.#copyPasteHandler;
    }

    #registerStrategy(): void {
        if (!(this as any).eventHandler) return;
        const validationStrategy = new ValidationStrategy((this as any).eventHandler, this);
        this.addStrategy("validation", validationStrategy);
    }

    interceptBeforeSetValue(row: number, col: number, value: any): boolean {
        if (!this.#active || !this.#engine) return true;

        const shouldContinue = (this as any).hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATE, value, { row, col });
        if (shouldContinue === false) {
            return false;
        }

        const result = this.#engine.validateCellSync(row, col, value);

        if (result.deferred && result.needsAsyncValidation) {
            this.#engine
                .validateCell(row, col, value)
                .then((asyncResult) => {
                    asyncResult.row = row;
                    asyncResult.col = col;
                    asyncResult.value = value;
                    asyncResult.source = "before_set_value_async";

                    if (!asyncResult.valid) {
                        (this as any).hooks?.runHooks(HOOKS.VALIDATION_FAILED, row, col, value, asyncResult);
                        this.#portalUI?.showErrorTooltip(row, col, asyncResult.message || "输入值无效", asyncResult.errorStyle || "stop");

                        if (this.#highlightInvalidCells) {
                            this.#applyErrorStyle(row, col, asyncResult.errorStyle || "stop");
                        }

                        this.#portalUI?.setIconStatus(row, col, false, asyncResult.errorStyle || "stop");
                    } else {
                        (this as any).hooks?.runHooks(HOOKS.AFTER_VALIDATE, asyncResult);

                        if (this.#highlightInvalidCells) {
                            this.#removeErrorStyle(row, col);
                        }

                        this.#portalUI?.setIconStatus(row, col, true, "stop");
                    }
                })
                .catch(() => {});
        }

        if (!result.valid) {
            result.row = row;
            result.col = col;
            result.value = value;
            result.source = "before_set_value";

            (this as any).hooks?.runHooks(HOOKS.VALIDATION_FAILED, row, col, value, result);
            this.#portalUI?.showErrorTooltip(row, col, result.message || "输入值无效", result.errorStyle || "stop");

            if (this.#highlightInvalidCells) {
                this.#applyErrorStyle(row, col, result.errorStyle || "stop");
            }

            this.#portalUI?.setIconStatus(row, col, false, result.errorStyle || "stop");

            if (result.errorStyle === (ERROR_STYLE as any).STOP) {
                return false;
            }
        } else {
            result.row = row;
            result.col = col;
            result.value = value;
            result.source = "before_set_value";
            result.valid = true;

            (this as any).hooks?.runHooks(HOOKS.AFTER_VALIDATE, result);

            if (this.#highlightInvalidCells) {
                this.#removeErrorStyle(row, col);
            }

            this.#portalUI?.setIconStatus(row, col, true, "stop");
        }

        return true;
    }

    handleAfterSetValue(row: number, col: number, value: any): void {
        if (!this.#active || !this.#engine) return;
        this.#dirtyFlagManager?.markDirty(row, col, 2, "user_edit");

        const result = ValidationResult.success();
        result.row = row;
        result.col = col;
        result.value = value;
        result.source = "after_set_value";

        (this as any).hooks?.runHooks(HOOKS.AFTER_VALIDATE, result);
    }

    interceptBeforePaste(data: any): boolean {
        if (!this.#active || !this.#copyPasteHandler) return true;

        if (data?.sourceRow !== undefined && data?.targetRow !== undefined) {
            this.#copyPasteHandler!.pasteWithRules(
                data.sourceRow,
                data.sourceCol,
                data.targetRow,
                data.targetCol,
                data.pasteOption || PASTE_OPTIONS.ALL,
            );
        }

        return true;
    }

    #bindSheetSwitchListener(): void {
        const sheet = (this as any).sheet;
        if (!sheet?.bus) return;
        this.#unbindSheetSwitchListener();

        this.#sheetSwitchUnsubscribe = sheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, (envelope: any) => {
            const { currentSheet } = envelope.payload;
            const newSheet = (this as any).workbook.sheets.get(currentSheet);
            if (newSheet) {
                this.#onSheetSwitched(newSheet);
            }
        });
    }

    #unbindSheetSwitchListener(): void {
        if (this.#sheetSwitchUnsubscribe) {
            this.#sheetSwitchUnsubscribe();
            this.#sheetSwitchUnsubscribe = null;
        }
    }

    #bindColumnMoveListener(): void {
        const sheet = (this as any).sheet;
        if (!sheet?.bus) return;
        this.#unbindColumnMoveListener();

        this.#columnMoveUnsubscribe = sheet.bus.on(SHEET_EVENTS.COLUMN_MOVED, (envelope: any) => {
            const { fromCol, toCol } = envelope.payload;
            this.#handleColumnMove(fromCol, toCol);
        });
    }

    #unbindColumnMoveListener(): void {
        if (this.#columnMoveUnsubscribe) {
            this.#columnMoveUnsubscribe();
            this.#columnMoveUnsubscribe = null;
        }
    }

    #bindRowMoveListener(): void {
        const sheet = (this as any).sheet;
        if (!sheet?.bus) return;
        this.#unbindRowMoveListener();

        this.#rowMoveUnsubscribe = sheet.bus.on(SHEET_EVENTS.ROW_MOVED, (envelope: any) => {
            const { fromRow, toRow } = envelope.payload;
            this.#handleRowMove(fromRow, toRow);
        });
    }

    #unbindRowMoveListener(): void {
        if (this.#rowMoveUnsubscribe) {
            this.#rowMoveUnsubscribe();
            this.#rowMoveUnsubscribe = null;
        }
    }

    #handleColumnMove(fromCol: number, toCol: number): void {
        if (!this.#active || !this.#engine) return;
        if (fromCol === toCol) return;

        this.#engine.shiftRuleRangesForColumnMove(fromCol, toCol);

        this.#dirtyFlagManager?.clear();
        this.#portalUI?.clearAllStatus();
        this.#portalUI?.clearPendingValidations();

        if (this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }

        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #handleRowMove(fromRow: number, toRow: number): void {
        if (!this.#active || !this.#engine) return;
        if (fromRow === toRow) return;

        this.#engine.shiftRuleRangesForRowMove(fromRow, toRow);

        this.#dirtyFlagManager?.clear();
        this.#portalUI?.clearAllStatus();
        this.#portalUI?.clearPendingValidations();

        if (this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }

        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #bindColumnInsertDeleteListeners(): void {
        const sheet = (this as any).sheet;
        if (!sheet?.bus) return;
        this.#unbindColumnInsertDeleteListeners();

        this.#columnInsertUnsubscribe = sheet.bus.on(SHEET_EVENTS.COLUMN_INSERTED, (envelope: any) => {
            const { atCol } = envelope.payload;
            this.#handleColumnInsert(atCol);
        });

        this.#columnDeleteUnsubscribe = sheet.bus.on(SHEET_EVENTS.COLUMN_DELETED, (envelope: any) => {
            const { atCol } = envelope.payload;
            this.#handleColumnDelete(atCol);
        });
    }

    #unbindColumnInsertDeleteListeners(): void {
        if (this.#columnInsertUnsubscribe) {
            this.#columnInsertUnsubscribe();
            this.#columnInsertUnsubscribe = null;
        }
        if (this.#columnDeleteUnsubscribe) {
            this.#columnDeleteUnsubscribe();
            this.#columnDeleteUnsubscribe = null;
        }
    }

    #bindRowInsertDeleteListeners(): void {
        const sheet = (this as any).sheet;
        if (!sheet?.bus) return;
        this.#unbindRowInsertDeleteListeners();

        this.#rowInsertUnsubscribe = sheet.bus.on(SHEET_EVENTS.ROW_INSERTED, (envelope: any) => {
            const { atRow } = envelope.payload;
            this.#handleRowInsert(atRow);
        });

        this.#rowDeleteUnsubscribe = sheet.bus.on(SHEET_EVENTS.ROW_DELETED, (envelope: any) => {
            const { atRow } = envelope.payload;
            this.#handleRowDelete(atRow);
        });
    }

    #unbindRowInsertDeleteListeners(): void {
        if (this.#rowInsertUnsubscribe) {
            this.#rowInsertUnsubscribe();
            this.#rowInsertUnsubscribe = null;
        }
        if (this.#rowDeleteUnsubscribe) {
            this.#rowDeleteUnsubscribe();
            this.#rowDeleteUnsubscribe = null;
        }
    }

    #handleColumnInsert(atCol: number): void {
        if (!this.#active || !this.#engine) return;

        this.#engine.shiftRuleRangesForColumnInsert(atCol);

        this.#dirtyFlagManager?.clear();
        this.#portalUI?.clearAllStatus();
        this.#portalUI?.clearPendingValidations();

        if (this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }

        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #handleColumnDelete(atCol: number): void {
        if (!this.#active || !this.#engine) return;

        this.#engine.shiftRuleRangesForColumnDelete(atCol);

        this.#dirtyFlagManager?.clear();
        this.#portalUI?.clearAllStatus();
        this.#portalUI?.clearPendingValidations();

        if (this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }

        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #handleRowInsert(atRow: number): void {
        if (!this.#active || !this.#engine) return;

        this.#engine.shiftRuleRangesForRowInsert(atRow);

        this.#dirtyFlagManager?.clear();
        this.#portalUI?.clearAllStatus();
        this.#portalUI?.clearPendingValidations();

        if (this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }

        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #handleRowDelete(atRow: number): void {
        if (!this.#active || !this.#engine) return;

        this.#engine.shiftRuleRangesForRowDelete(atRow);

        this.#dirtyFlagManager?.clear();
        this.#portalUI?.clearAllStatus();
        this.#portalUI?.clearPendingValidations();

        if (this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }

        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #initUIController(): void {
        try {
            let portalManager = (this as any).workbook?.validationPortalManager || null;

            if (!portalManager) {
                const renderEngine = (this as any).renderEngine;
                const rootContainer = (this as any).workbook?.container || renderEngine?.canvas?.parentElement || document.body;

                portalManager = new ValidationPortalManager(renderEngine);
                portalManager.init(rootContainer);

                this.#portalManager = portalManager;
                if ((this as any).workbook) {
                    (this as any).workbook.validationPortalManager = portalManager;
                }
            }

            this.#portalUI = new ValidationUIController((this as any).sheet, portalManager, this, (this as any).renderEngine);
            this.#portalUI.init();
            this.#hookRenderEngine();
        } catch (error) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[DataValidation] UI 控制器初始化失败:", error);
            this.#portalUI = null;
        }
    }

    #hookRenderEngine(): void {
        const re = (this as any).renderEngine;
        if (!re) return;

        this.#afterRenderCallback = () => {
            this.#renderValidationIcons();
        };
        re.addAfterRenderCallback(this.#afterRenderCallback);
    }

    #renderValidationIcons(): void {
        if (!this.#portalUI || !this.#engine || !(this as any).renderEngine) return;

        const sheet = (this as any).sheet;
        if (!sheet) return;

        const re = (this as any).renderEngine;
        const sx = re.scrollX;
        const sy = re.scrollY;
        const viewW = re.viewW;
        const viewH = re.viewH;

        const rc = sheet.rowColManager;
        const headerH = (sheet as any).getHeaderHeight?.() ?? 0;
        const headerW = (sheet as any).getHeaderWidth?.() ?? 0;
        const frozenColsW = (sheet as any).frozenColsWidth ?? 0;
        const frozenRowsH = (sheet as any).frozenRowsHeight ?? 0;
        const fixedCols = (sheet as any).fixedColumnsStart ?? 0;
        const fixedRows = (sheet as any).fixedRowsTop ?? 0;

        const scrolledRange = rc.getVisibleRange(sx, sy, viewW - headerW, viewH - headerH);

        let startRow = scrolledRange.topRow;
        let endRow = scrolledRange.bottomRow;
        let startCol = scrolledRange.topCol;
        let endCol = scrolledRange.bottomCol;

        if (fixedRows > 0) {
            startRow = Math.min(startRow, 0);
            endRow = Math.max(endRow, fixedRows - 1);
        }
        if (fixedCols > 0) {
            startCol = Math.min(startCol, 0);
            endCol = Math.max(endCol, fixedCols - 1);
        }

        this.#portalUI.renderValidationIcons({
            startRow,
            endRow,
            startCol,
            endCol,
            scrollX: sx,
            scrollY: sy,
            headerH,
            headerW,
            frozenColsW,
            frozenRowsH,
            viewW,
            viewH,
        });
    }

    #onSheetSwitched(newSheet: any): void {
        const formulaEngine = (this as any).workbook?.formulaEngine || null;

        this.#engine = new ValidationEngine(newSheet.cellStore);
        this.#engine.init(formulaEngine);
        this.#engine.conflictStrategy = this.#conflictStrategy as any;

        this.#portalUI?.clearPendingValidations();

        for (const ruleConfig of this.#initialRules) {
            try {
                const rule = new ValidationRule(ruleConfig);
                this.#engine.addRule(rule);
            } catch (e) {
                errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 新 Sheet 加载规则失败:`, e);
            }
        }

        this.#bindColumnMoveListener();
        this.#bindRowMoveListener();
        this.#bindColumnInsertDeleteListeners();
        this.#bindRowInsertDeleteListeners();
    }

    setValidation(ruleOptions: Record<string, any>): string | null {
        const rule = new ValidationRule(ruleOptions);
        const validation = rule.validate();

        if (!validation.valid) {
            throw new Error(`规则无效: ${validation.errors.join(", ")}`);
        }

        const shouldContinue = (this as any).hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, null, rule);
        if (shouldContinue === false) {
            return null;
        }

        const ruleId = this.#engine!.addRule(rule);
        (this as any).hooks?.runHooks(HOOKS.AFTER_VALIDATION_RULE_CHANGE, rule, null);

        this.#portalUI?.onRuleChanged(rule, false);
        (this as any).renderEngine?.invalidateAll();
        (this as any).render();

        return ruleId;
    }

    removeValidation(ruleId: string): boolean {
        const rule = this.#engine!.rules.get(ruleId);
        if (!rule) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 规则不存在: ${ruleId}`);
            return false;
        }

        const shouldContinue = (this as any).hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, rule, null);
        if (shouldContinue === false) {
            return false;
        }

        const success = this.#engine!.removeRule(ruleId);

        if (success) {
            (this as any).hooks?.runHooks(HOOKS.AFTER_VALIDATION_RULE_CHANGE, null, rule);
            this.#portalUI?.onRuleChanged(rule, true);
            (this as any).renderEngine?.invalidateAll();
            (this as any).render();
        }

        return success;
    }

    registerValidator(type: string, validator: any): void {
        if (!this.#engine) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[DataValidation] 引擎未初始化，无法注册验证器");
            return;
        }
        this.#engine.registerValidator(type, validator);
    }

    registerValidType(type: string): void {
        ValidationRule.registerValidType(type);
    }

    async validateCell(row: number, col: number, value: any): Promise<ValidationResult> {
        if (!this.#engine) {
            return ValidationResult.success();
        }

        const shouldContinue = (this as any).hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATE, value, { row, col });
        if (shouldContinue === false) {
            return ValidationResult.cancelled();
        }

        const result = await this.#engine.validateCell(row, col, value);
        result.source = "manual_validation";
        result.row = row;
        result.col = col;

        (this as any).hooks?.runHooks(HOOKS.AFTER_VALIDATE, result);

        return result;
    }

    async validateRange(range: string): Promise<{ total: number; valid: number; invalid: number; results: any[] }> {
        if (!this.#engine) {
            return { total: 0, valid: 0, invalid: 0, results: [] };
        }

        const report = await this.#engine.validateRange(range);
        (this as any).hooks?.runHooks(HOOKS.AFTER_BATCH_VALIDATION, report);
        return report;
    }

    getRulesForCell(row: number, col: number): ValidationRule[] {
        if (!this.#engine) return [];
        return this.#engine.getRulesForCell(row, col);
    }

    getAllRules(): ValidationRule[] {
        if (!this.#engine) return [];
        return Array.from(this.#engine.rules.values());
    }

    getRuleById(ruleId: string): ValidationRule | null {
        if (!this.#engine) return null;
        return this.#engine.rules.get(ruleId) || null;
    }

    get highlightInvalidCells(): boolean {
        return this.#highlightInvalidCells;
    }

    set highlightInvalidCells(value: boolean) {
        this.#highlightInvalidCells = !!value;
        if (!this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }
    }

    #applyErrorStyle(row: number, col: number, errorStyle: string): void {
        const key = `${row},${col}`;
        if (this.#errorStyleRules.has(key)) {
            this.#removeErrorStyle(row, col);
        }

        const sheet = (this as any).sheet;
        if (!sheet?.conditionalFormat) return;

        const styleObj = (VALIDATION_ERROR_STYLES as any)[errorStyle] || VALIDATION_ERROR_STYLES.stop;
        const styleId = stylePool.getStyleId(styleObj);

        const range = { topRow: row, bottomRow: row, topCol: col, bottomCol: col };
        const cfRule = sheet.conditionalFormat.addRule(range, () => true, styleId);

        this.#errorStyleRules.set(key, { cfRule, styleId });
        sheet.styleManager?.invalidateCache();
        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #removeErrorStyle(row: number, col: number): void {
        const key = `${row},${col}`;
        const entry = this.#errorStyleRules.get(key);
        if (!entry) return;

        const sheet = (this as any).sheet;
        if (sheet?.conditionalFormat) {
            sheet.conditionalFormat.removeRule(entry.cfRule);
        }

        this.#errorStyleRules.delete(key);
        sheet?.styleManager?.invalidateCache();
        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    #clearAllErrorStyles(): void {
        const sheet = (this as any).sheet;
        for (const [, entry] of this.#errorStyleRules) {
            if (sheet?.conditionalFormat) {
                sheet.conditionalFormat.removeRule(entry.cfRule);
            }
        }
        this.#errorStyleRules.clear();
        sheet?.styleManager?.invalidateCache();
        (this as any).renderEngine?.invalidateAll();
        (this as any).render();
    }

    enable(): void {
        super.enable();
        this.#active = true;
    }

    disable(): void {
        this.#active = false;
        super.disable();
    }

    destroy(): void {
        this.disable();
        this.#clearAllErrorStyles();
        this.#unbindSheetSwitchListener();
        this.#unbindColumnMoveListener();
        this.#unbindRowMoveListener();
        this.#unbindColumnInsertDeleteListeners();
        this.#unbindRowInsertDeleteListeners();
        this.#unhookRenderEngine();

        if (this.#engine) {
            this.#engine.destroy();
            this.#engine = null;
        }

        if (this.#portalUI) {
            this.#portalUI.destroy();
            this.#portalUI = null;
        }

        if (this.#portalManager) {
            this.#portalManager.destroy();
            this.#portalManager = null;
        }

        if (this.#dirtyFlagManager) {
            this.#dirtyFlagManager.destroy();
            this.#dirtyFlagManager = null;
        }

        if (this.#copyPasteHandler) {
            this.#copyPasteHandler.destroy();
            this.#copyPasteHandler = null;
        }
        super.destroy();
    }

    #unhookRenderEngine(): void {
        const re = (this as any).renderEngine;
        if (re && this.#afterRenderCallback) {
            re.removeAfterRenderCallback(this.#afterRenderCallback);
            this.#afterRenderCallback = null;
        }
    }

    exportRules(): Record<string, any>[] {
        if (!this.#engine) return [];
        return this.getAllRules().map((rule) => rule.toJSON());
    }

    importRules(rulesJSON: Record<string, any>[]): string[] {
        if (!Array.isArray(rulesJSON)) {
            throw new Error("导入数据必须是数组格式");
        }

        const importedIds: string[] = [];
        for (const json of rulesJSON) {
            try {
                const rule = ValidationRule.fromJSON(json);
                const ruleId = this.setValidation(rule);
                if (ruleId) importedIds.push(ruleId);
            } catch (e) {
                errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 导入规则失败:`, e);
            }
        }

        return importedIds;
    }
}
