import {BasePlugin} from "./BasePlugin.js";
import {RowMoveStrategy} from "../editor/strategies/RowMoveStrategy.js";

/**
 * 行拖拽移动插件
 *
 * 参考 Handsontable ManualRowMove API：
 * - 用户拖拽行头即可移动整行数据
 * - 支持 beforeRowMove / afterRowMove 钩子
 * - 可通过 pluginOptions.rowMove.enabled = false 禁用
 *
 * 用法：
 * ```js
 * const wb = new Workbook('grid', {
 *     plugins: ['rowMove'],
 *     pluginOptions: {
 *         rowMove: { enabled: true }
 *     }
 * });
 * ```
 */
export class RowMovePlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'rowMove'; }

    /** 行移动交互策略实例 */
    #strategy = null;

    /**
     * 初始化插件
     * @param {Object} options - 插件配置
     * @param {boolean} [options.enabled=true] - 是否启用行移动
     */
    init(options = {}) {
        super.init(options);
        this.#strategy = new RowMoveStrategy(this.eventHandler);
        this.addStrategy('rowMove', this.#strategy);

        if (options.enabled === false) {
            this.disable();
        }
    }

    destroy() {
        this.#strategy = null;
        super.destroy();
    }

    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    disable() {
        super.disable();
        this.#strategy?.disable();
    }
}