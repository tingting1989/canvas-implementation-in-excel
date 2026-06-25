import { BasePlugin } from "./BasePlugin.js";
import { FormulaEngine } from "../formula/FormulaEngine.js";
import { FormulaBar } from "../ui/FormulaBar.js";

/**
 * 公式引擎插件
 * 将公式计算功能封装为可插拔的插件，按需加载
 *
 * 功能：
 * - 公式解析与求值（SUM、AVERAGE、IF 等）
 * - 单元格引用、范围引用、跨表引用
 * - 依赖追踪与级联重算
 * - 公式栏 UI（显示/编辑公式）
 *
 * 不加载此插件时，Sheet 不会创建 FormulaEngine，减小开销。
 * 公式检测逻辑（Sheet.setCell 中的 "=" 前缀判断）始终保留，
 * 但仅在 formulaEngine 存在时才执行求值。
 *
 * 使用方式：
 * ```js
 * // 按需加载
 * PluginManager.register('formula', FormulaPlugin);
 * workbook.loadPlugin('formula', { showFormulaBar: true });
 * ```
 */
export class FormulaPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "formula";
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有实例字段
    // ═══════════════════════════════════════════════════════════════

    /**
     * 插件是否处于激活状态（已初始化且未禁用）
     * @type {boolean}
     * @private
     */
    #active = false;

    /** @type {FormulaEngine} */
    #engine = null;

    /** @type {FormulaBar} */
    #bar = null;

    // ═══════════════════════════════════════════════════════════════
    // 只读属性
    // ═══════════════════════════════════════════════════════════════

    /**
     * 插件是否处于激活状态
     * @returns {boolean}
     */
    get active() {
        return this.#active;
    }

    /**
     * 获取公式引擎实例
     * @returns {FormulaEngine|null}
     */
    get engine() {
        return this.#engine;
    }

    /**
     * 获取公式栏实例
     * @returns {FormulaBar|null}
     */
    get bar() {
        return this.#bar;
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    /**
     * 初始化公式插件
     * 创建 FormulaEngine 和 FormulaBar，注入到 Workbook
     *
     * @param {object} options - 插件配置
     * @param {boolean} [options.showFormulaBar=true] - 是否显示公式栏
     */
    init(options = {}) {
        super.init(options);

        const showFormulaBar = options.showFormulaBar !== false;

        this.#engine = new FormulaEngine(this.workbook);
        this.workbook.formulaEngine = this.#engine;

        if (showFormulaBar) {
            const container = this.workbook.renderEngine?.outerWrap;
            this.#bar = new FormulaBar(this.workbook, container);
            this.workbook.formulaBar = this.#bar;
            this.#hookFormulaBar();
        }

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 将公式栏更新 hook 到渲染引擎的渲染周期
     * @private
     */
    #hookFormulaBar() {
        const re = this.workbook.renderEngine;
        if (!re) return;

        const original = re.onAfterRender;
        re.onAfterRender = () => {
            if (original) original();
            this.#bar?.update();
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // 启用 / 禁用 / 销毁
    // ═══════════════════════════════════════════════════════════════

    /**
     * 启用插件
     *
     * 恢复激活状态。注意：不会自动重新创建引擎或公式栏，
     * 需要手动调用 init() 或在启用前确保资源存在。
     */
    enable() {
        super.enable();
        this.#active = true;
    }

    /**
     * 禁用插件
     *
     * 停止公式计算功能，但保留引擎和公式栏实例。
     * 禁用后用户无法使用公式功能，但不会销毁已创建的资源。
     */
    disable() {
        super.disable();
        this.#active = false;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 销毁插件
     *
     * 先禁用（停止激活状态），再清理引擎和公式栏，
     * 最后调用父类销毁清理所有注册资源。
     */
    destroy() {
        this.disable();

        if (this.#bar) {
            this.#bar.destroy();
            this.#bar = null;
        }

        if (this.#engine) {
            this.#engine.destroy();
            this.#engine = null;
        }

        this.workbook.formulaEngine = null;
        this.workbook.formulaBar = null;

        super.destroy();
    }
}
