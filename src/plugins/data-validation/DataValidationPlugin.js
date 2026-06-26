import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../../core/ErrorHandler.js";
import { BasePlugin } from "../BasePlugin.js";
import { ValidationEngine } from "./ValidationEngine.js";
import { ValidationRule } from "./ValidationRule.js";
import { HOOKS } from "../../constants/hookNames.js";

/**
 * 数据验证插件
 *
 * 提供单元格数据验证功能，支持以下验证类型：
 * - 数值范围（number）
 * - 文本长度（text）
 * - 下拉列表（list）
 * - 唯一性检查（unique）
 * - 自定义公式（custom）- Phase 2
 * - 日期/时间（date/time）- Phase 2
 * - 正则表达式（regex）- Phase 2
 *
 * ## 核心功能
 * 1. 规则管理：添加、删除、修改验证规则
 * 2. 实时验证：在用户输入时即时验证
 * 3. 批量验证：对整个区域进行批量校验
 * 4. UI 反馈：显示错误提示、下拉箭头等
 *
 * ## 钩子事件
 * - BEFORE_VALIDATION_RULE_CHANGE - 规则变更前
 * - AFTER_VALIDATION_RULE_CHANGE - 规则变更后
 * - BEFORE_VALIDATE - 单元格验证前（可拦截）
 * - AFTER_VALIDATE - 单元格验证完成后
 * - VALIDATION_FAILED - 验证失败时
 * - AFTER_BATCH_VALIDATION - 批量验证完成后
 *
 * @extends BasePlugin
 *
 * @example
 * // 通过配置初始化
 * const workbook = new Workbook('grid', {
 *     plugins: ['dataValidation'],
 *     pluginOptions: {
 *         dataValidation: {
 *             rules: [
 *                 {
 *                     range: 'A:A',
 *                     type: 'number',
 *                     operator: 'greaterThan',
 *                     value: 0,
 *                     errorMessage: '必须输入正数'
 *                 }
 *             ]
 *         }
 *     }
 * });
 *
 * @example
 * // 运行时 API 调用
 * const dv = workbook.getPlugin('dataValidation');
 * const ruleId = dv.setValidation({
 *     range: 'B2:B100',
 *     type: 'number',
 *     operator: 'between',
 *     value: [0, 10000]
 * });
 */
export class DataValidationPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "dataValidation";
    }

    /** @type {boolean} 插件是否处于激活状态 */
    #active = false;

    /** @type {ValidationEngine|null} 验证引擎实例 */
    #engine = null;

    /** @type {Object|null} Portal UI 管理器实例（Phase 2 实现） */
    #portalUI = null;

    /**
     * 初始化插件
     *
     * 从 options 中读取预定义的规则并注册到引擎。
     *
     * @param {Object} [options={}] - 插件配置
     * @param {Array} [options.rules=[]] - 预定义的验证规则数组
     * @param {string} [options.conflictStrategy='short-circuit'] - 规则冲突解决策略
     */
    async init(options = {}) {
        await super.init(options);

        try {
            this.#engine = new ValidationEngine(this.sheet?.cellStore);
            const formulaEngine = this.workbook?.formulaEngine || null;
            await this.#engine.init(formulaEngine);

            if (options.conflictStrategy) {
                this.#engine.conflictStrategy = options.conflictStrategy;
            }

            if (options.rules && Array.isArray(options.rules)) {
                for (const ruleConfig of options.rules) {
                    try {
                        const rule = new ValidationRule(ruleConfig);
                        this.#engine.addRule(rule);
                    } catch (e) {
                        errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 加载规则失败:`, e);
                    }
                }
            }

            this.registerHooks();
            this.#active = true;

            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[DataValidation] 初始化完成，已加载 ${this.#engine.rules.size} 条规则`);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[DataValidation] 初始化失败:", error);
            throw error;
        }
    }

    get active() {
        return this.#active;
    }

    get engine() {
        return this.#engine;
    }

    registerHooks() {
        if (!this.hooks) return;

        this.addHook(HOOKS.BEFORE_SET_VALUE_AT, (row, col, value) => {
            return this.interceptBeforeSetValue(row, col, value);
        });

        this.addHook(HOOKS.AFTER_SET_VALUE_AT, (row, col, oldValue, newValue) => {
            this.handleAfterSetValue(row, col, newValue);
        });

        this.addHook(HOOKS.BEFORE_PASTE, (data) => {
            return this.interceptBeforePaste(data);
        });
    }

    async interceptBeforeSetValue(row, col, value) {
        if (!this.#active || !this.#engine) return true;

        const result = await this.validateCell(row, col, value);

        if (result.valid) return true;

        this.hooks?.call(HOOKS.VALIDATION_FAILED, row, col, value, result);

        if (result.errorStyle === "stop") {
            return false;
        }

        return true;
    }

    handleAfterSetValue(row, col, value) {
        if (!this.#active || !this.#engine) return;

        this.hooks?.call(HOOKS.AFTER_VALIDATE, row, col, value);
    }

    interceptBeforePaste(data) {
        return true;
    }

    setValidation(ruleOptions) {
        const rule = new ValidationRule(ruleOptions);
        const validation = rule.validate();

        if (!validation.valid) {
            throw new Error(`规则无效: ${validation.errors.join(", ")}`);
        }

        this.hooks?.call(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, null, rule);

        const ruleId = this.#engine.addRule(rule);

        this.hooks?.call(HOOKS.AFTER_VALIDATION_RULE_CHANGE, rule, null);

        this.renderEngine?.invalidateAll();
        this.render();

        return ruleId;
    }

    removeValidation(ruleId) {
        const rule = this.#engine.rules.get(ruleId);

        if (!rule) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 规则不存在: ${ruleId}`);
            return false;
        }

        this.hooks?.call(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, rule, null);

        const success = this.#engine.removeRule(ruleId);

        if (success) {
            this.hooks?.call(HOOKS.AFTER_VALIDATION_RULE_CHANGE, null, rule);
            this.renderEngine?.invalidateAll();
            this.render();
        }

        return success;
    }

    async validateCell(row, col, value) {
        if (!this.#engine) {
            return ValidationResult.success();
        }

        this.hooks?.call(HOOKS.BEFORE_VALIDATE, value, null);

        const result = await this.#engine.validateCell(row, col, value);

        this.hooks?.call(HOOKS.AFTER_VALIDATE, result);

        return result;
    }

    async validateRange(range) {
        if (!this.#engine) {
            return { total: 0, valid: 0, invalid: 0, results: [] };
        }

        const report = await this.#engine.validateRange(range);

        this.hooks?.call(HOOKS.AFTER_BATCH_VALIDATION, report);

        return report;
    }

    getRulesForCell(row, col) {
        if (!this.#engine) return [];
        return this.#engine.getRulesForCell(row, col);
    }

    getAllRules() {
        if (!this.#engine) return [];
        return Array.from(this.#engine.rules.values());
    }

    getRuleById(ruleId) {
        if (!this.#engine) return null;
        return this.#engine.rules.get(ruleId);
    }

    enable() {
        super.enable();
        this.#active = true;
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[DataValidation] 已启用");
    }

    disable() {
        this.#active = false;
        super.disable();
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[DataValidation] 已禁用");
    }

    destroy() {
        this.disable();

        if (this.#engine) {
            this.#engine.destroy();
            this.#engine = null;
        }

        if (this.#portalUI) {
            this.#portalUI.destroy();
            this.#portalUI = null;
        }

        super.destroy();
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[DataValidation] 已销毁");
    }

    exportRules() {
        if (!this.#engine) return [];

        return this.getAllRules().map((rule) => rule.toJSON());
    }

    importRules(rulesJSON) {
        if (!Array.isArray(rulesJSON)) {
            throw new Error("导入数据必须是数组格式");
        }

        const importedIds = [];

        for (const json of rulesJSON) {
            try {
                const rule = ValidationRule.fromJSON(json);
                const ruleId = this.setValidation(rule);
                importedIds.push(ruleId);
            } catch (e) {
                errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 导入规则失败:`, e);
            }
        }

        return importedIds;
    }
}

