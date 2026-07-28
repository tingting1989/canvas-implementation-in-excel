import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler.js";
import { BasePlugin } from "../BasePlugin.js";
import { ValidationEngine } from "./ValidationEngine.js";
import { ValidationRule } from "./ValidationRule.js";
import { ValidationUIController } from "./ValidationUIController.js";
import { ValidationPortalManager } from "./ValidationPortalManager.js";
import { ValidationDirtyFlagManager } from "./ValidationDirtyFlagManager.js";
import { CopyPasteHandler, PASTE_OPTIONS } from "./CopyPasteHandler.js";
import { initValidationCache, getValidationCache } from "./ValidationCache.js";
import { HOOKS } from "../../constants/hookNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { ERROR_STYLE } from "../../constants/enums/ErrorStyle.js";
import { stylePool } from "../../model/styles/index.js";
import { ValidationStrategy } from "../../editor/strategies/ValidationStrategy.js";
import { ValidationResult } from "@/plugins/data-validation/ValidationResult";

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

    /** @type {ValidationPortalManager|null} Portal 管理器实例（由本插件创建） */
    #portalManager = null;

    /** @type {ValidationDirtyFlagManager|null} 脏标记管理器 */
    #dirtyFlagManager = null;

    /** @type {CopyPasteHandler|null} 复制/粘贴处理器 */
    #copyPasteHandler = null;

    /** @type {Array} 初始规则配置（用于新 Sheet 自动加载） */
    #initialRules = [];

    /** @type {string} 冲突策略（用于新 Sheet 复用） */
    #conflictStrategy = "short-circuit";

    /** @type {boolean} 是否对违规单元格应用错误样式（背景色/文字色等） */
    #highlightInvalidCells = false;

    /** @type {Map<string, {cfRule: Object, styleId: number}>} 违规单元格的条件格式规则映射 key="row,col" */
    #errorStyleRules = new Map();

    /**
     * 初始化插件
     *
     * 从 options 中读取预定义的规则并注册到引擎。
     *
     * @param {Object} [options={}] - 插件配置
     * @param {Array} [options.rules=[]] - 预定义的验证规则数组
     * @param {string} [options.conflictStrategy='short-circuit'] - 规则冲突解决策略
     * @param {boolean} [options.highlightInvalidCells=false] - 是否对违规单元格应用错误样式
     * @param {Object} [options.formulaValidation={}] - v3.0 公式验证配置
     * @param {Object} [options.formulaValidation.syncFastPath] - 同步快速通道配置
     * @param {boolean} [options.formulaValidation.syncFastPath.enabled=true] - 是否启用同步快速通道
     * @param {number} [options.formulaValidation.syncFastPath.threshold=10] - 同步阈值(ms)
     * @param {number} [options.formulaValidation.syncFastPath.maxComplexity=2] - 同步最大复杂度
     * @param {Object} [options.formulaValidation.asyncValidation] - 异步验证配置
     * @param {boolean} [options.formulaValidation.asyncValidation.enabled=true] - 是否启用异步验证
     * @param {number} [options.formulaValidation.asyncValidation.timeout=500] - 异步超时(ms)
     * @param {number} [options.formulaValidation.asyncValidation.maxConcurrent=5] - 最大并发数
     * @param {number} [options.formulaValidation.asyncValidation.retryAttempts=2] - 重试次数
     * @param {Object} [options.formulaValidation.cache] - 三级缓存配置
     * @param {boolean} [options.formulaValidation.cache.enabled=true] - 是否启用缓存
     * @param {number} [options.formulaValidation.cache.l1MaxSize=500] - L1视口缓存大小
     * @param {number} [options.formulaValidation.cache.l2MaxSize=1000] - L2最近缓存大小
     * @param {boolean} [options.formulaValidation.cache.l3Enabled=true] - 是否启用L3持久化缓存
     * @param {number} [options.formulaValidation.cache.defaultTTL=3600000] - 默认缓存有效期(ms)
     *
     * @example
     * // v3.0 完整配置示例
     * const workbook = new Workbook(element, {
     *     plugins: ['dataValidation'],
     *     pluginOptions: {
     *         dataValidation: {
     *             conflictStrategy: 'short-circuit',
     *             highlightInvalidCells: true,
     *             formulaValidation: {
     *                 syncFastPath: { enabled: true, threshold: 10, maxComplexity: 2 },
     *                 asyncValidation: { enabled: true, timeout: 500, maxConcurrent: 5 },
     *                 cache: { enabled: true, l1MaxSize: 500, l2MaxSize: 1000, l3Enabled: true }
     *             },
     *             rules: [
     *                 { range: 'A1:A10', type: 'formula', formula: '=A1>0', errorMessage: '必须大于0' }
     *             ]
     *         }
     *     }
     * });
     */
    init(options = {}) {
        super.init(options);
        // v3.0 配置处理：从 options.formulaValidation 中提取配置
        const formulaValidationConfig = options.formulaValidation || {};

        // 构建 ValidationEngine 配置
        const engineConfig = {
            enableAdvancedCache: formulaValidationConfig.cache?.enabled !== false,
            syncThreshold: formulaValidationConfig.syncFastPath?.threshold || 10,
            maxComplexity: formulaValidationConfig.syncFastPath?.maxComplexity || 2,
            asyncTimeout: formulaValidationConfig.asyncValidation?.timeout || 500,
            maxConcurrent: formulaValidationConfig.asyncValidation?.maxConcurrent || 5,
            retryAttempts: formulaValidationConfig.asyncValidation?.retryAttempts || 2,
            enableDeferred: formulaValidationConfig.asyncValidation?.enabled !== false,
        };

        // v3.0 新增：初始化 ValidationCache 单例（延迟初始化，只有插件启用时才创建）
        if (formulaValidationConfig.cache) {
            initValidationCache({
                l1MaxSize: formulaValidationConfig.cache.l1MaxSize,
                l2MaxSize: formulaValidationConfig.cache.l2MaxSize,
                l3Enabled: formulaValidationConfig.cache.l3Enabled,
                defaultTTL: formulaValidationConfig.cache.defaultTTL,
            });
        } else {
            // 即使没有传入 cache 配置，也初始化缓存（使用默认配置）
            initValidationCache();
        }

        this.#engine = new ValidationEngine(this.sheet?.cellStore);
        const formulaEngine = this.workbook?.formulaEngine || null;
        this.#engine.init(formulaEngine, null, engineConfig);

        // v3.0 调试日志：输出初始化配置
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[DataValidation] v3.0 初始化配置:`, {
            formulaEngine: formulaEngine ? "✅ 已连接" : "❌ 未连接",
            enableAdvancedCache: engineConfig.enableAdvancedCache,
            syncThreshold: engineConfig.syncThreshold,
            asyncTimeout: engineConfig.asyncTimeout,
            ruleCount: options.rules?.length || 0,
        });

        if (options.conflictStrategy) {
            this.#engine.conflictStrategy = options.conflictStrategy;
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
                    errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 加载规则失败:`, e);
                }
            }
            errorHandler.info(ERROR_CODE.VALIDATION_INFO, `[DataValidation] ✅ 规则加载完成: ${successCount}/${options.rules.length}`);
        }

        this.#registerStrategy();
        this.#bindSheetSwitchListener();
        this.#initUIController();
        this.#dirtyFlagManager = new ValidationDirtyFlagManager();
        this.#copyPasteHandler = new CopyPasteHandler(this);
        this.#active = true;

        errorHandler.info(
            ERROR_CODE.VALIDATION_INFO,
            `[DataValidation] ✅ DataValidationPlugin v3.0 激活 | FormulaEngine: ${formulaEngine ? "✅" : "❌"}`,
        );
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

    #registerStrategy() {
        if (!this.eventHandler) return;

        const validationStrategy = new ValidationStrategy(this.eventHandler, this);
        this.addStrategy("validation", validationStrategy);
    }

    // registerHooks() {
    //     if (!this.hooks) return;
    //
    //     this.addHook(HOOKS.VALIDATION_FAILED, (row, col, value, result) => {});
    //
    //     this.addHook(HOOKS.AFTER_VALIDATE, (row, col, value) => {});
    //
    //     this.addHook(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, (oldRule, newRule) => {});
    //
    //     this.addHook(HOOKS.AFTER_VALIDATION_RULE_CHANGE, (newRule, oldRule) => {});
    //
    //     this.addHook(HOOKS.BEFORE_VALIDATE, (value, context) => {});
    //
    //     this.addHook(HOOKS.AFTER_BATCH_VALIDATION, (report) => {});
    // }

    /**
     * 拦截单元格赋值前的验证
     * 同步验证目标单元格的值，若验证失败且错误样式为 STOP 则阻止赋值
     * 完整触发 BEFORE_VALIDATE → VALIDATION_FAILED/AFTER_VALIDATE 流程
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 待赋值的值
     * @returns {boolean} true 允许赋值，false 阻止赋值
     */
    interceptBeforeSetValue(row, col, value) {
        if (!this.#active || !this.#engine) return true;

        const shouldContinue = this.hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATE, value, { row, col });
        if (shouldContinue === false) {
            return false;
        }

        const result = this.#engine.validateCellSync(row, col, value);

        if (!result.valid) {
            result.row = row;
            result.col = col;
            result.value = value;
            result.source = "before_set_value";

            this.hooks?.runHooks(HOOKS.VALIDATION_FAILED, row, col, value, result);

            this.#portalUI?.showErrorTooltip(row, col, result.message || "输入值无效", result.errorStyle || "stop");

            if (this.#highlightInvalidCells) {
                this.#applyErrorStyle(row, col, result.errorStyle || "stop");
            }

            if (result.errorStyle === ERROR_STYLE.STOP) {
                return false;
            }
        } else {
            result.row = row;
            result.col = col;
            result.value = value;
            result.source = "before_set_value";
            result.valid = true;

            this.hooks?.runHooks(HOOKS.AFTER_VALIDATE, result);

            if (this.#highlightInvalidCells) {
                this.#removeErrorStyle(row, col);
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

        const result = ValidationResult.success();
        result.row = row;
        result.col = col;
        result.value = value;
        result.source = "after_set_value";

        this.hooks?.runHooks(HOOKS.AFTER_VALIDATE, result);
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
            let portalManager = this.workbook?.validationPortalManager || null;

            if (!portalManager) {
                const renderEngine = this.renderEngine;
                const rootContainer = this.workbook?.container || renderEngine?.canvas?.parentElement || document.body;

                portalManager = new ValidationPortalManager(renderEngine);
                portalManager.init(rootContainer);

                this.#portalManager = portalManager;
                if (this.workbook) {
                    this.workbook.validationPortalManager = portalManager;
                }
            }

            this.#portalUI = new ValidationUIController(this.sheet, portalManager, this, this.renderEngine);
            this.#portalUI.init();

            this.#hookRenderEngine();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[DataValidation] UI 控制器初始化失败:", error);
            this.#portalUI = null;
        }
    }

    #hookRenderEngine() {
        const re = this.renderEngine;
        if (!re) return;

        this.#afterRenderCallback = () => {
            this.#renderValidationIcons();
        };
        re.addAfterRenderCallback(this.#afterRenderCallback);
    }

    #renderValidationIcons() {
        if (!this.#portalUI || !this.#engine || !this.renderEngine) return;

        const sheet = this.sheet;
        if (!sheet) return;

        const rc = sheet.rowColManager;
        const re = this.renderEngine;
        const sx = re.scrollX;
        const sy = re.scrollY;
        const viewW = re.viewW;
        const viewH = re.viewH;

        const visibleRange = rc.getVisibleRange(sx, sy, viewW, viewH);

        this.#portalUI.renderValidationIcons({
            startRow: visibleRange.topRow,
            endRow: visibleRange.bottomRow,
            startCol: visibleRange.topCol,
            endCol: visibleRange.bottomCol,
        });
    }

    /**
     * 工作表切换后的处理
     * 为新 Sheet 创建验证引擎，并重新加载初始规则
     * @param {object} newSheet - 切换后的新工作表实例
     */
    #onSheetSwitched(newSheet) {
        const formulaEngine = this.workbook?.formulaEngine || null;

        this.#engine = new ValidationEngine(newSheet.cellStore);
        this.#engine.init(formulaEngine);
        this.#engine.conflictStrategy = this.#conflictStrategy;

        for (const ruleConfig of this.#initialRules) {
            try {
                const rule = new ValidationRule(ruleConfig);
                this.#engine.addRule(rule);
            } catch (e) {
                errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[DataValidation] 新 Sheet 加载规则失败:`, e);
            }
        }
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

        const shouldContinue = this.hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, null, rule);
        if (shouldContinue === false) {
            return null;
        }

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

        const shouldContinue = this.hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATION_RULE_CHANGE, rule, null);
        if (shouldContinue === false) {
            return false;
        }

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

        const shouldContinue = this.hooks?.runHooksUntil(HOOKS.BEFORE_VALIDATE, value, { row, col });
        if (shouldContinue === false) {
            return ValidationResult.cancelled();
        }

        const result = await this.#engine.validateCell(row, col, value);

        result.source = "manual_validation";
        result.row = row;
        result.col = col;

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
     * 是否启用违规单元格样式高亮
     * @returns {boolean}
     */
    get highlightInvalidCells() {
        return this.#highlightInvalidCells;
    }

    /**
     * 设置是否启用违规单元格样式高亮
     * @param {boolean} value
     */
    set highlightInvalidCells(value) {
        this.#highlightInvalidCells = !!value;
        if (!this.#highlightInvalidCells) {
            this.#clearAllErrorStyles();
        }
    }

    /**
     * 对违规单元格应用错误样式（通过条件格式）
     *
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} errorStyle - 错误级别 "stop" | "warning" | "information"
     */
    #applyErrorStyle(row, col, errorStyle) {
        const key = `${row},${col}`;

        if (this.#errorStyleRules.has(key)) {
            this.#removeErrorStyle(row, col);
        }

        const sheet = this.sheet;
        if (!sheet?.conditionalFormat) return;

        const styleObj = VALIDATION_ERROR_STYLES[errorStyle] || VALIDATION_ERROR_STYLES.stop;
        const styleId = stylePool.getStyleId(styleObj);

        const range = { topRow: row, bottomRow: row, topCol: col, bottomCol: col };
        const cfRule = sheet.conditionalFormat.addRule(range, () => true, styleId);

        this.#errorStyleRules.set(key, { cfRule, styleId });

        sheet.styleManager?.invalidateCache();
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 移除违规单元格的错误样式
     *
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    #removeErrorStyle(row, col) {
        const key = `${row},${col}`;
        const entry = this.#errorStyleRules.get(key);
        if (!entry) return;

        const sheet = this.sheet;
        if (sheet?.conditionalFormat) {
            sheet.conditionalFormat.removeRule(entry.cfRule);
        }

        this.#errorStyleRules.delete(key);

        sheet?.styleManager?.invalidateCache();
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 清除所有违规单元格的错误样式
     *
     * @private
     */
    #clearAllErrorStyles() {
        const sheet = this.sheet;

        for (const [, entry] of this.#errorStyleRules) {
            if (sheet?.conditionalFormat) {
                sheet.conditionalFormat.removeRule(entry.cfRule);
            }
        }

        this.#errorStyleRules.clear();

        sheet?.styleManager?.invalidateCache();
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 启用插件，恢复验证拦截功能
     */
    enable() {
        super.enable();
        this.#active = true;
    }

    /**
     * 禁用插件，暂停验证拦截功能
     */
    disable() {
        this.#active = false;
        super.disable();
    }

    /**
     * 销毁插件，释放验证引擎、Portal UI、脏标记管理器和事件监听等所有资源
     */
    destroy() {
        this.disable();

        this.#clearAllErrorStyles();
        this.#unbindSheetSwitchListener();
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

    #afterRenderCallback = null;

    #unhookRenderEngine() {
        const re = this.renderEngine;
        if (re && this.#afterRenderCallback) {
            re.removeAfterRenderCallback(this.#afterRenderCallback);
            this.#afterRenderCallback = null;
        }
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
