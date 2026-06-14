import { BasePlugin } from "./BasePlugin.js";
import { AutoFillStrategy } from "../editor/strategies/AutoFillStrategy.js";

/**
 * 自动填充插件
 * 将 AutoFill 功能封装为插件，支持动态加载/卸载
 *
 * 功能：
 * - 拖拽选区右下角填充手柄进行自动填充
 * - 数值序列自动递增（1,2,3 → 4,5,6）
 * - 非数值内容直接复制
 * - 多行多列选区按模式循环填充
 *
 * 使用方式：
 * ```js
 * // 方式 1：通过全局注册加载
 * PluginManager.register('autoFill', AutoFillPlugin);
 * workbook.loadPlugin('autoFill');
 *
 * // 方式 2：直接加载插件类
 * workbook.loadPluginClass(AutoFillPlugin);
 *
 * // 禁用自动填充
 * workbook.disablePlugin('autoFill');
 *
 * // 卸载插件
 * workbook.unloadPlugin('autoFill');
 * ```
 */
export class AutoFillPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'autoFill'; }

    /** @type {AutoFillStrategy|null} */
    #strategy = null;

    /**
     * 初始化自动填充插件
     * 注册 AutoFillStrategy 到事件处理器
     *
     * @param {object} options - 插件配置
     * @param {boolean} [options.enabled=true] - 是否默认启用
     */
    init(options = {}) {
        super.init(options);

        this.#strategy = new AutoFillStrategy(this.eventHandler);
        this.addStrategy('autoFill', this.#strategy);

        if (options.enabled === false) {
            this.disable();
        }
    }

    /**
     * 销毁插件
     * 策略会由基类 removeOwnStrategies() 自动清理
     */
    destroy() {
        this.#strategy = null;
        super.destroy();
    }

    /**
     * 启用自动填充
     */
    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    /**
     * 禁用自动填充
     */
    disable() {
        super.disable();
        this.#strategy?.disable();
    }
}