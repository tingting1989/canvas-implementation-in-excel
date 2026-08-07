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

/**
 * 复制/粘贴验证规则处理器
 *
 * 管理验证规则在复制/粘贴操作中的行为：
 * - 粘贴时是否携带验证规则
 * - 粘贴选项区分（全部/仅值/仅格式/仅规则）
 * - 目标已有规则的冲突解决
 * - 跨 Sheet 粘贴时的规则迁移
 *
 * @example
 * const handler = new CopyPasteHandler(validationPlugin);
 *
 * // 粘贴时携带规则
 * handler.pasteWithRules(sourceRow, sourceCol, targetRow, targetCol, pasteOption);
 */
export class CopyPasteHandler {
    /** @type {Object|null} 验证插件实例 */
    #validationPlugin = null;

    /** @type {string} 默认冲突解决策略 */
    #defaultConflictResolution = CONFLICT_RESOLUTION.OVERWRITE;

    /**
     * 构造处理器
     *
     * @param {Object} validationPlugin - DataValidationPlugin 实例
     * @param {Object} [options={}] - 配置选项
     * @param {string} [options.conflictResolution='overwrite'] - 默认冲突策略
     */
    constructor(validationPlugin, options = {}) {
        this.#validationPlugin = validationPlugin;
        this.#defaultConflictResolution = options.conflictResolution || CONFLICT_RESOLUTION.OVERWRITE;
    }

    /**
     * 判断指定粘贴选项是否应携带验证规则
     *
     * @param {string} pasteOption - 粘贴选项
     * @returns {boolean}
     */
    shouldPasteValidation(pasteOption) {
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

    /**
     * 粘贴验证规则
     *
     * 从源位置复制验证规则到目标位置，根据粘贴选项和冲突策略处理。
     *
     * @param {number} sourceRow - 源行号
     * @param {number} sourceCol - 源列号
     * @param {number} targetRow - 目标行号
     * @param {number} targetCol - 目标列号
     * @param {string} [pasteOption='all'] - 粘贴选项
     * @param {string} [conflictResolution] - 冲突解决策略
     * @returns {string[]} 新创建的规则 ID 数组
     */
    pasteWithRules(sourceRow, sourceCol, targetRow, targetCol, pasteOption = PASTE_OPTIONS.ALL, conflictResolution) {
        if (!this.shouldPasteValidation(pasteOption)) {
            return [];
        }

        const sourceRules = this.#validationPlugin?.getRulesForCell(sourceRow, sourceCol) || [];
        if (sourceRules.length === 0) {
            return [];
        }

        const targetRules = this.#validationPlugin?.getRulesForCell(targetRow, targetCol) || [];
        const resolution = conflictResolution || this.#defaultConflictResolution;

        const newRuleIds = [];

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
                } catch (e) {
                    errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[CopyPasteHandler] 粘贴规则失败:", e);
                }
            }
        }

        return newRuleIds;
    }

    /**
     * 批量粘贴验证规则（区域粘贴）
     *
     * @param {number} sourceStartRow - 源起始行
     * @param {number} sourceStartCol - 源起始列
     * @param {number} targetStartRow - 目标起始行
     * @param {number} targetStartCol - 目标起始列
     * @param {number} rowCount - 行数
     * @param {number} colCount - 列数
     * @param {string} [pasteOption='all'] - 粘贴选项
     * @returns {string[]} 新创建的规则 ID 数组
     */
    pasteRangeWithRules(sourceStartRow, sourceStartCol, targetStartRow, targetStartCol, rowCount, colCount, pasteOption = PASTE_OPTIONS.ALL) {
        if (!this.shouldPasteValidation(pasteOption)) {
            return [];
        }

        const allNewIds = [];

        for (let dr = 0; dr < rowCount; dr++) {
            for (let dc = 0; dc < colCount; dc++) {
                const ids = this.pasteWithRules(sourceStartRow + dr, sourceStartCol + dc, targetStartRow + dr, targetStartCol + dc, pasteOption);
                allNewIds.push(...ids);
            }
        }

        return allNewIds;
    }

    /**
     * 获取源位置的验证规则快照（用于粘贴预览）
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {Object[]} 规则 JSON 数组
     */
    getRuleSnapshot(row, col) {
        const rules = this.#validationPlugin?.getRulesForCell(row, col) || [];
        return rules.map((rule) => rule.toJSON());
    }

    /**
     * 销毁处理器
     */
    destroy() {
        this.#validationPlugin = null;
    }

    // ─── 私有方法 ───

    /**
     * 解决规则冲突
     *
     * @private
     * @param {ValidationRule} sourceRule - 源规则
     * @param {ValidationRule[]} targetRules - 目标已有规则
     * @param {string} resolution - 冲突策略
     * @returns {boolean} 是否应应用源规则
     */
    #resolveConflict(sourceRule, targetRules, resolution) {
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

    /**
     * 迁移规则到新位置
     *
     * 调整规则的范围引用，使其指向目标位置。
     * 跨 Sheet 粘贴时调整表名引用。
     *
     * @private
     * @param {ValidationRule} sourceRule - 源规则
     * @param {number} sourceRow - 源行号
     * @param {number} sourceCol - 源列号
     * @param {number} targetRow - 目标行号
     * @param {number} targetCol - 目标列号
     * @returns {Object|null} 新规则配置，无法迁移则返回 null
     */
    #migrateRule(sourceRule, sourceRow, sourceCol, targetRow, targetCol) {
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

    /**
     * 迁移范围引用
     *
     * @private
     * @param {string} rangeStr - 范围字符串
     * @param {number} sourceRow - 源行号
     * @param {number} sourceCol - 源列号
     * @param {number} targetRow - 目标行号
     * @param {number} targetCol - 目标列号
     * @returns {string} 迁移后的范围字符串
     */
    #migrateRange(rangeStr, sourceRow, sourceCol, targetRow, targetCol) {
        const rowOffset = targetRow - sourceRow;
        const colOffset = targetCol - sourceCol;

        const numToCol = (num) => {
            let result = "";
            let n = num;
            while (n >= 0) {
                result = String.fromCharCode((n % 26) + 65) + result;
                n = Math.floor(n / 26) - 1;
            }
            return result;
        };

        const colToNum = (colStr) => {
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

    /**
     * 迁移公式中的单元格引用
     *
     * @private
     * @param {string} formula - 公式字符串
     * @param {number} sourceRow - 源行号
     * @param {number} sourceCol - 源列号
     * @param {number} targetRow - 目标行号
     * @param {number} targetCol - 目标列号
     * @returns {string} 迁移后的公式
     */
    #migrateFormula(formula, sourceRow, sourceCol, targetRow, targetCol) {
        const rowOffset = targetRow - sourceRow;
        const colOffset = targetCol - sourceCol;

        if (rowOffset === 0 && colOffset === 0) {
            return formula;
        }

        return formula.replace(/\b([A-Z]+)(\d+)\b/g, (match, colStr, rowStr) => {
            const colToNum = (c) => {
                let num = 0;
                for (let i = 0; i < c.length; i++) {
                    num = num * 26 + (c.charCodeAt(i) - 64);
                }
                return num - 1;
            };

            const numToCol = (num) => {
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
