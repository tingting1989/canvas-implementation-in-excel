import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { ValidationRule } from "./ValidationRule.js";

const PASTE_OPTIONS = Object.freeze({
    ALL: "all",
    VALUES_ONLY: "values_only",
    FORMULAS: "formulas",
    FORMATS: "formats",
    VALIDATION: "validation",
    NO_VALIDATION: "no_validation",
});

const CONFLICT_RESOLUTION = Object.freeze({
    OVERWRITE: "overwrite",
    MERGE: "merge",
    SKIP: "skip",
    PROMPT: "prompt",
});

export class CopyPasteHandler {
    #validationPlugin: any = null;
    #defaultConflictResolution: string = CONFLICT_RESOLUTION.OVERWRITE;

    constructor(validationPlugin: any, options: Record<string, any> = {}) {
        this.#validationPlugin = validationPlugin;
        this.#defaultConflictResolution = options.conflictResolution || CONFLICT_RESOLUTION.OVERWRITE;
    }

    shouldPasteValidation(pasteOption: string): boolean {
        switch (pasteOption) {
            case PASTE_OPTIONS.ALL:
            case PASTE_OPTIONS.FORMATS:
            case PASTE_OPTIONS.VALIDATION:
                return true;
            case PASTE_OPTIONS.VALUES_ONLY:
            case PASTE_OPTIONS.FORMULAS:
            case PASTE_OPTIONS.NO_VALIDATION:
                return false;
            default:
                return true;
        }
    }

    pasteWithRules(
        sourceRow: number,
        sourceCol: number,
        targetRow: number,
        targetCol: number,
        pasteOption: string = PASTE_OPTIONS.ALL,
        conflictResolution?: string,
    ): string[] {
        if (!this.shouldPasteValidation(pasteOption)) {
            return [];
        }

        const sourceRules: ValidationRule[] = this.#validationPlugin?.getRulesForCell(sourceRow, sourceCol) || [];
        if (sourceRules.length === 0) {
            return [];
        }

        const targetRules: ValidationRule[] = this.#validationPlugin?.getRulesForCell(targetRow, targetCol) || [];
        const resolution = conflictResolution || this.#defaultConflictResolution;

        const newRuleIds: string[] = [];

        for (const sourceRule of sourceRules) {
            const hasConflict = targetRules.some((targetRule) => targetRule.type === sourceRule.type);

            if (hasConflict) {
                const shouldApply = this.#resolveConflict(sourceRule, targetRules, resolution);
                if (!shouldApply) continue;
            }

            const newRule = this.#migrateRule(sourceRule, sourceRow, sourceCol, targetRow, targetCol);
            if (newRule) {
                try {
                    const ruleId = this.#validationPlugin.setValidation(newRule);
                    newRuleIds.push(ruleId);
                } catch (e: any) {
                    errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[CopyPasteHandler] 粘贴规则失败:", e);
                }
            }
        }

        return newRuleIds;
    }

    pasteRangeWithRules(
        sourceStartRow: number,
        sourceStartCol: number,
        targetStartRow: number,
        targetStartCol: number,
        rowCount: number,
        colCount: number,
        pasteOption: string = PASTE_OPTIONS.ALL,
    ): string[] {
        if (!this.shouldPasteValidation(pasteOption)) {
            return [];
        }

        const allNewIds: string[] = [];

        for (let dr = 0; dr < rowCount; dr++) {
            for (let dc = 0; dc < colCount; dc++) {
                const ids = this.pasteWithRules(sourceStartRow + dr, sourceStartCol + dc, targetStartRow + dr, targetStartCol + dc, pasteOption);
                allNewIds.push(...ids);
            }
        }

        return allNewIds;
    }

    getRuleSnapshot(row: number, col: number): Record<string, any>[] {
        const rules: ValidationRule[] = this.#validationPlugin?.getRulesForCell(row, col) || [];
        return rules.map((rule) => rule.toJSON());
    }

    destroy(): void {
        this.#validationPlugin = null;
    }

    #resolveConflict(sourceRule: ValidationRule, targetRules: ValidationRule[], resolution: string): boolean {
        switch (resolution) {
            case CONFLICT_RESOLUTION.OVERWRITE:
                return true;

            case CONFLICT_RESOLUTION.SKIP:
                return false;

            case CONFLICT_RESOLUTION.MERGE:
                return !targetRules.some((t) => t.type === sourceRule.type && t.operator === sourceRule.operator);

            case CONFLICT_RESOLUTION.PROMPT:
                errorHandler.warn(
                    ERROR_CODE.VALIDATION_ERROR,
                    `[CopyPasteHandler] 规则冲突：目标单元格已有 ${sourceRule.type} 类型规则，使用默认策略覆盖`,
                );
                return true;

            default:
                return true;
        }
    }

    #migrateRule(sourceRule: ValidationRule, sourceRow: number, sourceCol: number, targetRow: number, targetCol: number): Record<string, any> | null {
        const ruleConfig = sourceRule.toJSON();

        delete ruleConfig.id;
        delete ruleConfig.createdAt;
        delete ruleConfig.updatedAt;

        ruleConfig.range = this.#migrateRange(sourceRule.range, sourceRow, sourceCol, targetRow, targetCol);

        if (ruleConfig.formula) {
            ruleConfig.formula = this.#migrateFormula(ruleConfig.formula, sourceRow, sourceCol, targetRow, targetCol);
        }

        if (typeof ruleConfig.source === "string" && ruleConfig.source.startsWith("=")) {
            ruleConfig.source = this.#migrateFormula(ruleConfig.source, sourceRow, sourceCol, targetRow, targetCol);
        }

        return ruleConfig;
    }

    #migrateRange(rangeStr: string, sourceRow: number, sourceCol: number, targetRow: number, targetCol: number): string {
        const rowOffset = targetRow - sourceRow;
        const colOffset = targetCol - sourceCol;

        const numToCol = (num: number): string => {
            let result = "";
            let n = num;
            while (n >= 0) {
                result = String.fromCharCode((n % 26) + 65) + result;
                n = Math.floor(n / 26) - 1;
            }
            return result;
        };

        const colToNum = (colStr: string): number => {
            let num = 0;
            for (let i = 0; i < colStr.length; i++) {
                num = num * 26 + (colStr.charCodeAt(i) - 64);
            }
            return num - 1;
        };

        const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
        if (fullColMatch) {
            const startCol = colToNum(fullColMatch[1]) + colOffset;
            const endCol = colToNum(fullColMatch[2]) + colOffset;
            if (startCol >= 0 && endCol >= 0) {
                return `${numToCol(startCol)}:${numToCol(endCol)}`;
            }
            return rangeStr;
        }

        const rangeMatch = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
        if (rangeMatch) {
            const startRow = parseInt(rangeMatch[2]) - 1 + rowOffset;
            const startCol = colToNum(rangeMatch[1]) + colOffset;
            const endRow = parseInt(rangeMatch[4]) - 1 + rowOffset;
            const endCol = colToNum(rangeMatch[3]) + colOffset;

            if (startRow >= 0 && startCol >= 0 && endRow >= 0 && endCol >= 0) {
                return `${numToCol(startCol)}${startRow + 1}:${numToCol(endCol)}${endRow + 1}`;
            }
        }

        return rangeStr;
    }

    #migrateFormula(formula: string, sourceRow: number, sourceCol: number, targetRow: number, targetCol: number): string {
        const rowOffset = targetRow - sourceRow;
        const colOffset = targetCol - sourceCol;

        if (rowOffset === 0 && colOffset === 0) {
            return formula;
        }

        return formula.replace(/\b([A-Z]+)(\d+)\b/g, (match, colStr: string, rowStr: string) => {
            const colToNum = (c: string): number => {
                let num = 0;
                for (let i = 0; i < c.length; i++) {
                    num = num * 26 + (c.charCodeAt(i) - 64);
                }
                return num - 1;
            };

            const numToCol = (num: number): string => {
                let result = "";
                let n = num;
                while (n >= 0) {
                    result = String.fromCharCode((n % 26) + 65) + result;
                    n = Math.floor(n / 26) - 1;
                }
                return result;
            };

            const col = colToNum(colStr) + colOffset;
            const row = parseInt(rowStr) - 1 + rowOffset;

            if (col < 0 || row < 0) return match;

            return `${numToCol(col)}${row + 1}`;
        });
    }
}

export { PASTE_OPTIONS, CONFLICT_RESOLUTION };
