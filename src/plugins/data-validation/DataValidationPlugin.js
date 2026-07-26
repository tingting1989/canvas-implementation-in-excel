import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";
import { BasePlugin } from "../BasePlugin.js";
import { ValidationEngine } from "./ValidationEngine.js";
import { ValidationRule } from "./ValidationRule.js";
import { ValidationUIController } from "./ValidationUIController.js";
import { ValidationDirtyFlagManager } from "./ValidationDirtyFlagManager.js";
import { CopyPasteHandler, PASTE_OPTIONS } from "./CopyPasteHandler.js";
import { HOOKS } from "../../constants/hookNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { ERROR_STYLE } from "../../constants/enums/ErrorStyle.js";

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
 * const workbook = new Workbook(document.getElementById('wrap'), {
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

    /** @type {ValidationUIController|null} UI 控制器实例 */
    #portalUI = null;

    /** @type {ValidationDirtyFlagManager|null} 脏标记管理器 */
    #dirtyFlagManager = null;

    /** @type {CopyPasteHandler|null} 复制/粘贴处理器 */
    #copyPasteHandler = null;

    /** @type {Array} 初始规则配置（用于新 Sheet 自动加载） */
    #initialRules = [];

    /** @type {string} 冲突策略（用于新 Sheet 复用） */
    #conflictStrategy = "short-circuit";

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
        super.init(options);
        try {
            this.#engine = new ValidationEngine(this.sheet?.cellStore);
            const formulaEngine = this.workbook?.formulaEngine || null;
            await this.#engine.init(formulaEngine);

            if (options.conflictStrategy) {
                this.#engine.conflictStrategy = options.conflictStrategy;
                this.#conflictStrategy = options.conflictStrategy;
            }

            if (options.rules && Array.isArray(options.rules)) {
                this.#initialRules = [...options.rules];
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
            this.#bindSheetSwitchListener();
            this.#initUIController();
            this.#dirtyFlagManager = new ValidationDirtyFlagManager();
            this.#copyPasteHandler = new CopyPasteHandler(this);
            this.#active = true;
        } catch (error) {
            throw error;
        }
    }

    /** @returns {boolean} 插件是否处于激活状态 */
    get active() {
        return this.#active;
    }

    /** @returns {ValidationEngine|null} 验证引擎实例 */
    get engine() {
        return this.#engine;
    }

    /** @returns {ValidationUIController|null} UI 控制器实例 */
    get uiController() {
        return this.#portalUI;
    }

    /** @returns {ValidationDirtyFlagManager|null} 脏标记管理器 */
    get dirtyFlagManager() {
        return this.#dirtyFlagManager;
    }

    /** @returns {CopyPasteHandler|null} 复制/粘贴处理器 */
    get copyPasteHandler() {
        return this.#copyPasteHandler;
    }

    /**
     * 注册插件钩子
     * 拦截单元格赋值和粘贴操作，在操作前后执行验证逻辑
     */
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

    /**
     * 拦截单元格赋值前的验证
     * 同步验证目标单元格的值，若验证失败且错误样式为 STOP 则阻止赋值
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 待赋值的值
     * @returns {boolean} true 允许赋值，false 阻止赋值
     */
    interceptBeforeSetValue(row, col, value) {
        if (!this.#active || !this.#engine) return true;

        const rules = this.#engine.getRulesForCell(row, col);

        const result = this.#engine.validateCellSync(row, col, value);

        if (!result.valid) {
            this.hooks?.runHooks(HOOKS.VALIDATION_FAILED, row, col, value, result);

            this.#portalUI?.showErrorTooltip(row, col, result.message || "输入值无效", result.errorStyle || "stop");

            if (result.errorStyle === ERROR_STYLE.STOP) {
                return false;
            }
        }

        return true;
    }

    /**
     * 单元格赋值后的处理
     * 标记为脏，触发 AFTER_VALIDATE 钩子通知验证完成
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 赋值后的新值
     */
    handleAfterSetValue(row, col, value) {
        if (!this.#active || !this.#engine) return;

        this.#dirtyFlagManager?.markDirty(row, col, "user_edit");
        this.hooks?.runHooks(HOOKS.AFTER_VALIDATE, row, col, value);
    }

    /**
     * 拦截粘贴操作前的验证
     * 根据粘贴选项决定是否携带验证规则，并处理规则冲突
     * @param {object} data - 粘贴数据
     * @param {number} [data.sourceRow] - 源行号
     * @param {number} [data.sourceCol] - 源列号
     * @param {number} [data.targetRow] - 目标行号
     * @param {number} [data.targetCol] - 目标列号
     * @param {string} [data.pasteOption='all'] - 粘贴选项
     * @returns {boolean} true 允许粘贴，false 阻止粘贴
     */
    interceptBeforePaste(data) {
        if (!this.#active || !this.#copyPasteHandler) return true;

        if (data?.sourceRow !== undefined && data?.targetRow !== undefined) {
            this.#copyPasteHandler.pasteWithRules(
                data.sourceRow,
                data.sourceCol,
                data.targetRow,
                data.targetCol,
                data.pasteOption || PASTE_OPTIONS.ALL,
            );
        }

        return true;
    }

    /** @type {Function|null} Sheet 切换事件取消订阅函数 */
    #sheetSwitchUnsubscribe = null;

    /**
     * 绑定工作表切换事件监听
     * 当用户切换 Sheet 时，重新初始化验证引擎并加载初始规则
     */
    #bindSheetSwitchListener() {
        if (!this.sheet?.bus) return;

        this.#unbindSheetSwitchListener();

        this.#sheetSwitchUnsubscribe = this.sheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, (envelope) => {
            const { currentSheet } = envelope.payload;
            const newSheet = this.workbook.sheets.get(currentSheet);
            if (newSheet) {
                this.#onSheetSwitched(newSheet);
            }
        });
    }

    /**
     * 解除工作表切换事件监听
     */
    #unbindSheetSwitchListener() {
        if (this.#sheetSwitchUnsubscribe) {
            this.#sheetSwitchUnsubscribe();
            this.#sheetSwitchUnsubscribe = null;
        }
    }

    /**
     * 初始化 UI 控制器
     * @private
     */
    #initUIController() {
        try {
            const portalManager = this.workbook?.validationPortalManager || null;
            this.#portalUI = new ValidationUIController(this.sheet, portalManager, this, this.renderEngine);
            this.#portalUI.init();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[DataValidation] UI 控制器初始化失败:", error);
            this.#portalUI = null;
        }
    }

    /**
     * 工作表切换后的处理
     * 为新 Sheet 创建验证引擎，并重新加载初始规则
     * @param {object} newSheet - 切换后的新工作表实例
     */
    async #onSheetSwitched(newSheet) {
        const formulaEngine = this.workbook?.formulaEngine || null;

        this.#engine = new ValidationEngine(newSheet.cellStore);
        await this.#engine.init(formulaEngine);
        this.#engine.conflictStrategy = this.#conflictStrategy;

        for (const ruleConfig of this.#initialRules) {
            try {
                const rule = new ValidationRule(ruleConfig);
                this.#engine.addRule(rule);
            } catch (e) {
                errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 新 Sheet 加载规则失败:`, e);
            }
        }

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[DataValidation] Sheet 切换完成，已重新加载 ${this.#engine.rules.size} 条规则`);
    }

    /**
     * 添加验证规则
     * 校验规则有效性，触发变更前后钩子，添加到引擎并刷新渲染
     * @param {object} ruleOptions - 规则配置选项，参见 ValidationRule 构造参数
     * @returns {string} 规则 ID
     * @throws {Error} 规则无效时抛出异常
     */
    setValidation(ruleOptions) {
        const rule = new ValidationRule(ruleOptions);
        const validation = rule.validate();

        if (!validation.valid) {
            throw new Error(`规则无效: ${validation.errors.join(", ")}`);
        }

        this.hooks?.runHooks(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, null, rule);

        const ruleId = this.#engine.addRule(rule);

        this.hooks?.runHooks(HOOKS.AFTER_VALIDATION_RULE_CHANGE, rule, null);

        this.#portalUI?.onRuleChanged(rule, false);
        this.renderEngine?.invalidateAll();
        this.render();

        return ruleId;
    }

    /**
     * 移除验证规则
     * 触发变更前后钩子，从引擎中移除规则并刷新渲染
     * @param {string} ruleId - 要移除的规则 ID
     * @returns {boolean} 是否成功移除
     */
    removeValidation(ruleId) {
        const rule = this.#engine.rules.get(ruleId);

        if (!rule) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 规则不存在: ${ruleId}`);
            return false;
        }

        this.hooks?.runHooks(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, rule, null);

        const success = this.#engine.removeRule(ruleId);

        if (success) {
            this.hooks?.runHooks(HOOKS.AFTER_VALIDATION_RULE_CHANGE, null, rule);
            this.#portalUI?.onRuleChanged(rule, true);
            this.renderEngine?.invalidateAll();
            this.render();
        }

        return success;
    }

    /**
     * 异步验证单个单元格的值
     * 触发 BEFORE_VALIDATE 和 AFTER_VALIDATE 钩子
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 待验证的值
     * @returns {Promise<ValidationResult>} 验证结果
     */
    async validateCell(row, col, value) {
        if (!this.#engine) {
            return ValidationResult.success();
        }

        this.hooks?.runHooks(HOOKS.BEFORE_VALIDATE, value, null);

        const result = await this.#engine.validateCell(row, col, value);

        this.hooks?.runHooks(HOOKS.AFTER_VALIDATE, result);

        return result;
    }

    /**
     * 批量验证指定区域的所有单元格
     * 触发 AFTER_BATCH_VALIDATION 钩子
     * @param {object} range - 验证范围，包含 startRow/startCol/endRow/endCol
     * @returns {Promise<{total: number, valid: number, invalid: number, results: Array}>} 批量验证报告
     */
    async validateRange(range) {
        if (!this.#engine) {
            return { total: 0, valid: 0, invalid: 0, results: [] };
        }

        const report = await this.#engine.validateRange(range);

        this.hooks?.runHooks(HOOKS.AFTER_BATCH_VALIDATION, report);

        return report;
    }

    /**
     * 获取指定单元格关联的所有验证规则
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {ValidationRule[]} 规则数组
     */
    getRulesForCell(row, col) {
        if (!this.#engine) return [];
        return this.#engine.getRulesForCell(row, col);
    }

    /**
     * 获取所有验证规则
     * @returns {ValidationRule[]} 规则数组
     */
    getAllRules() {
        if (!this.#engine) return [];
        return Array.from(this.#engine.rules.values());
    }

    /**
     * 根据 ID 获取验证规则
     * @param {string} ruleId - 规则 ID
     * @returns {ValidationRule|null} 规则实例，不存在则返回 null
     */
    getRuleById(ruleId) {
        if (!this.#engine) return null;
        return this.#engine.rules.get(ruleId);
    }

    /**
     * 启用插件，恢复验证拦截功能
     */
    enable() {
        super.enable();
        this.#active = true;
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[DataValidation] 已启用");
    }

    /**
     * 禁用插件，暂停验证拦截功能
     */
    disable() {
        this.#active = false;
        super.disable();
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[DataValidation] 已禁用");
    }

    /**
     * 销毁插件，释放验证引擎、Portal UI、脏标记管理器和事件监听等所有资源
     */
    destroy() {
        this.disable();

        this.#unbindSheetSwitchListener();

        if (this.#engine) {
            this.#engine.destroy();
            this.#engine = null;
        }

        if (this.#portalUI) {
            this.#portalUI.destroy();
            this.#portalUI = null;
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
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[DataValidation] 已销毁");
    }

    /**
     * 导出所有验证规则为 JSON 数组，用于持久化存储
     * @returns {object[]} 规则 JSON 对象数组
     */
    exportRules() {
        if (!this.#engine) return [];

        return this.getAllRules().map((rule) => rule.toJSON());
    }

    /**
     * 从 JSON 数组导入验证规则
     * 逐条解析并调用 setValidation 添加，跳过无效规则
     * @param {object[]} rulesJSON - 规则 JSON 对象数组
     * @returns {string[]} 成功导入的规则 ID 数组
     * @throws {Error} 输入不是数组时抛出异常
     */
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
