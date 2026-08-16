import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import type { ValidationRule } from "./ValidationRule.js";

interface CopyPasteOptions {
    copyValidation?: boolean;
    pasteMode?: "all" | "values" | "validation";
    conflictResolution?: "overwrite" | "skip" | "merge";
}

interface ClipboardData {
    sourceRange: { startRow: number; startCol: number; endRow: number; endCol: number };
    sourceSheet?: string;
    rules: Map<string, ValidationRule>;
    values: Map<string, any>;
    timestamp: number;
}

/**
 * 复制粘贴处理器
 *
 * 管理验证规则在复制粘贴操作时的行为：
 * - 复制时：记录源区域的验证规则
 * - 粘贴时：根据策略决定是否迁移验证规则
 * - 支持冲突解决策略（覆盖/跳过/合并）
 */
export class CopyPasteHandler {
    #plugin: any;
    #clipboard: ClipboardData | null = null;

    constructor(plugin: any) {
        this.#plugin = plugin;
    }

    onCopy(startRow: number, startCol: number, endRow: number, endCol: number, sheetName?: string): void {
        const rules = new Map<string, ValidationRule>();
        const values = new Map<string, any>();

        const engine = this.#plugin?.engine;
        if (!engine) return;

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const cellRules = engine.getRulesForCell(row, col);
                if (cellRules && cellRules.length > 0) {
                    rules.set(`${row},${col}`, cellRules[0]);
                }

                const cellValue = this.#plugin?.sheet?.cellStore?.get(row, col)?.value;
                if (cellValue !== undefined) {
                    values.set(`${row},${col}`, cellValue);
                }
            }
        }

        this.#clipboard = {
            sourceRange: { startRow, startCol, endRow, endCol },
            sourceSheet: sheetName,
            rules,
            values,
            timestamp: Date.now(),
        };
    }

    onPaste(targetRow: number, targetCol: number, options: CopyPasteOptions = {}): boolean {
        if (!this.#clipboard) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[CopyPasteHandler] 剪贴板为空，无法粘贴");
            return false;
        }

        const { copyValidation = true, pasteMode = "all", conflictResolution = "overwrite" } = options;

        const { sourceRange, rules, values } = this.#clipboard;
        const rowOffset = targetRow - sourceRange.startRow;
        const colOffset = targetCol - sourceRange.startCol;

        const engine = this.#plugin?.engine;
        if (!engine) return false;

        let success = true;

        for (let row = sourceRange.startRow; row <= sourceRange.endRow; row++) {
            for (let col = sourceRange.startCol; col <= sourceRange.endCol; col++) {
                const targetR = row + rowOffset;
                const targetC = col + colOffset;
                const key = `${row},${col}`;

                if (pasteMode === "all" || pasteMode === "values") {
                    const value = values.get(key);
                    if (value !== undefined) {
                        try {
                            this.#plugin?.sheet?.setCell?.(targetR, targetC, value);
                        } catch (e: any) {
                            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[CopyPasteHandler] 粘贴值失败 (${targetR},${targetC}):`, e);
                            success = false;
                        }
                    }
                }

                if ((pasteMode === "all" || pasteMode === "validation") && copyValidation) {
                    const rule = rules.get(key);
                    if (rule) {
                        this.pasteRule(targetR, targetC, rule, conflictResolution);
                    }
                }
            }
        }

        return success;
    }

    pasteRule(targetRow: number, targetCol: number, sourceRule: ValidationRule, conflictResolution: string = "overwrite"): void {
        const engine = this.#plugin?.engine;
        if (!engine) return;

        const existingRules = engine.getRulesForCell(targetRow, targetCol);

        if (existingRules.length > 0) {
            switch (conflictResolution) {
                case "skip":
                    return;
                case "merge":
                    break;
                case "overwrite":
                default:
                    for (const existing of existingRules) {
                        engine.removeRule(existing.id);
                    }
                    break;
            }
        }

        try {
            const newRule = new (sourceRule.constructor as any)({
                ...sourceRule.toJSON(),
                id: undefined,
                range: `${targetRow},${targetCol}`,
            });
            engine.addRule(newRule);
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[CopyPasteHandler] 粘贴规则失败 (${targetRow},${targetCol}):`, e);
        }
    }

    hasClipboardData(): boolean {
        return this.#clipboard !== null;
    }

    clearClipboard(): void {
        this.#clipboard = null;
    }

    getClipboardInfo(): { sourceRange: ClipboardData["sourceRange"]; ruleCount: number; valueCount: number } | null {
        if (!this.#clipboard) return null;
        return {
            sourceRange: this.#clipboard.sourceRange,
            ruleCount: this.#clipboard.rules.size,
            valueCount: this.#clipboard.values.size,
        };
    }
}
