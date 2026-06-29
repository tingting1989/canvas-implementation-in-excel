import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";

/**
 * 验证-条件格式桥接器
 *
 * 职责：
 * 1. 监听验证结果变化
 * 2. 自动生成/更新条件格式规则
 * 3. 确保视觉反馈一致性
 *
 * @example
 * const bridge = new ValidationFormattingBridge(conditionalFormatPlugin, validationPlugin);
 * bridge.onValidationChanged(0, 0, result, rule);
 */
export class ValidationFormattingBridge {
    /**
     * @type {Map<string, string>} ruleId → conditionalFormatId 映射
     * @private
     */
    #formatMap = new Map();

    /**
     * @type {Object|null} 条件格式插件实例
     * @private
     */
    #conditionalFormatPlugin;

    /**
     * @type {Object|null} 数据验证插件实例
     * @private
     */
    #validationPlugin;

    /**
     * @type {boolean} 是否启用桥接功能
     */
    enabled = true;

    /**
     * 条件格式规则模板
     */
    static FORMAT_TEMPLATES = {
        /** 数值超出范围 */
        NUMBER_OUT_OF_RANGE: {
            style: {
                backgroundColor: "#FFCDD2",
                color: "#B71C1C",
                textDecoration: "line-through",
            },
            icon: "❌",
        },

        /** 文本长度不符 */
        TEXT_LENGTH_INVALID: {
            style: {
                backgroundColor: "#FFF9C4",
                color: "#F57F17",
                fontStyle: "italic",
            },
            icon: "⚠️",
        },

        /** 下拉列表无效选项 */
        LIST_INVALID_OPTION: {
            style: {
                backgroundColor: "#FFCDD2",
                border: "2px solid #F44336",
            },
            icon: "🔽",
        },

        /** 唯一性冲突 */
        DUPLICATE_VALUE: {
            style: {
                backgroundColor: "#FCE4EC",
                color: "#880E4F",
                borderBottom: "2px dashed #C2185B",
            },
            icon: "⚠️",
        },

        /** 日期/时间无效 */
        DATETIME_INVALID: {
            style: {
                backgroundColor: "#FFCDD2",
                color: "#C62828",
            },
            icon: "📅",
        },

        /** 正则不匹配 */
        REGEX_MISMATCH: {
            style: {
                backgroundColor: "#FFF9C4",
                color: "#E65100",
                border: "1px dashed #FF9800",
            },
            icon: "✗",
        },

        /** 公式验证失败 */
        FORMULA_VALIDATION_FAILED: {
            style: {
                backgroundColor: "#FCE4EC",
                color: "#AD1457",
                fontWeight: "bold",
            },
            icon: "📊",
        },
    };

    /**
     * 构造桥接器
     * @param {Object} conditionalFormatPlugin - 条件格式插件实例
     * @param {Object} validationPlugin - 数据验证插件实例
     */
    constructor(conditionalFormatPlugin, validationPlugin) {
        this.#conditionalFormatPlugin = conditionalFormatPlugin;
        this.#validationPlugin = validationPlugin;
    }

    /**
     * 当验证结果变化时，同步更新条件格式
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {import('./ValidationResult.js').ValidationResult} result - 验证结果
     * @param {import('./ValidationRule.js').ValidationRule} rule - 关联的验证规则
     */
    onValidationChanged(row, col, result, rule) {
        if (!this.enabled) return;

        if (!result.valid) {
            this.#applyErrorFormat(row, col, rule, result);
        } else {
            this.#removeErrorFormat(row, col, rule);
        }
    }

    /**
     * 批量同步（用于批量验证完成后）
     *
     * @param {Object} report - 验证报告
     * @param {Array} report.violations - 违规记录数组
     */
    syncBatchResults(report) {
        if (!this.enabled || !report?.violations) return;

        report.violations.forEach((violation) => {
            const rule = this.#validationPlugin?.getRuleById(violation.ruleId);
            if (rule) {
                this.#applyErrorFormat(violation.row, violation.col, rule, violation);
            }
        });
    }

    /**
     * 应用错误条件格式
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {import('./ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} result - 验证结果
     */
    #applyErrorFormat(row, col, rule, result) {
        if (!this.#conditionalFormatPlugin) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationFormattingBridge] 条件格式插件未初始化");
            return;
        }

        const formatKey = this.#getFormatTemplateKey(rule.type);
        const template = ValidationFormattingBridge.FORMAT_TEMPLATES[formatKey];

        if (!template) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ValidationFormattingBridge] 未找到类型 ${rule.type} 的格式模板`);
            return;
        }

        try {
            const format = { ...template.style };

            if (result.message) {
                format.tooltip = result.message;
            }

            this.#conditionalFormatPlugin.applyFormat(row, col, format, {
                source: `validation_${rule.id}`,
                priority: 1000,
                temporary: true,
            });

            this.#formatMap.set(`${row},${col}`, rule.id);

            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationFormattingBridge] 应用错误格式 (${row},${col}) [${rule.type}]`);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[ValidationFormattingBridge] 应用格式失败 (${row},${col}):`, error);
        }
    }

    /**
     * 移除错误条件格式
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {import('./ValidationRule.js').ValidationRule} rule - 规则
     */
    #removeErrorFormat(row, col, rule) {
        if (!this.#conditionalFormatPlugin) return;

        try {
            this.#conditionalFormatPlugin.removeFormat(row, col, `validation_${rule.id}`);
            this.#formatMap.delete(`${row},${col}`);

            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationFormattingBridge] 移除错误格式 (${row},${col})`);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[ValidationFormattingBridge] 移除格式失败 (${row},${col}):`, error);
        }
    }

    /**
     * 根据验证类型获取格式模板键
     * @private
     * @param {string} type - 验证类型
     * @returns {string}
     */
    #getFormatTemplateKey(type) {
        const typeToKey = {
            number: "NUMBER_OUT_OF_RANGE",
            text: "TEXT_LENGTH_INVALID",
            list: "LIST_INVALID_OPTION",
            unique: "DUPLICATE_VALUE",
            date: "DATETIME_INVALID",
            time: "DATETIME_INVALID",
            regex: "REGEX_MISMATCH",
            custom: "FORMULA_VALIDATION_FAILED",
        };

        return typeToKey[type] || "NUMBER_OUT_OF_RANGE";
    }

    /**
     * 清除所有验证相关的条件格式
     */
    clearAllFormats() {
        if (!this.#conditionalFormatPlugin) return;

        for (const [cellKey, ruleId] of this.#formatMap) {
            const [row, col] = cellKey.split(",").map(Number);
            try {
                this.#conditionalFormatPlugin.removeFormat(row, col, `validation_${ruleId}`);
            } catch (error) {
                errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[ValidationFormattingBridge] 清除格式失败 (${cellKey}):`, error);
            }
        }

        this.#formatMap.clear();
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationFormattingBridge] 已清除所有验证格式");
    }

    /**
     * 获取当前格式映射（用于调试）
     * @returns {Map<string, string>}
     */
    getFormatMapping() {
        return new Map(this.#formatMap);
    }

    /**
     * 启用/禁用桥接功能
     * @param {boolean} enabled - 是否启用
     */
    setEnabled(enabled) {
        this.enabled = enabled;

        if (!enabled) {
            this.clearAllFormats();
        }

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationFormattingBridge] 桥接功能已${enabled ? "启用" : "禁用"}`);
    }

    /**
     * 销毁桥接器
     */
    destroy() {
        this.clearAllFormats();
        this.#conditionalFormatPlugin = null;
        this.#validationPlugin = null;
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationFormattingBridge] 已销毁");
    }
}
