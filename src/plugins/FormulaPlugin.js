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

    /** @type {FormulaEngine} */
    #engine = null;
    /** @type {FormulaBar} */
    #bar = null;

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
            this.#bar = new FormulaBar(this.workbook);
            this.workbook.formulaBar = this.#bar;
            this.#hookFormulaBar();
        }
    }

    /**
     * 将公式栏更新 hook 到渲染引擎的渲染周期
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

    /**
     * 销毁插件，清理引擎和公式栏
     */
    destroy() {
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
