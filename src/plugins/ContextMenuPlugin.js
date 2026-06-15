import { BasePlugin } from "./BasePlugin.js";
import { ContextMenuStrategy } from "../editor/strategies/ContextMenuStrategy.js";

/**
 * 右键菜单插件
 * 将右键菜单功能封装为插件，支持动态加载/卸载
 *
 * 功能：
 * - 右键单元格显示上下文菜单
 * - 插入/删除行和列
 * - 合并/取消合并单元格
 * - 清空单元格内容
 *
 * 使用方式：
 * ```js
 * // 加载插件
 * workbook.loadPluginClass(ContextMenuPlugin);
 *
 * // 自定义菜单项
 * workbook.loadPluginClass(ContextMenuPlugin, {
 *     customItems: [
 *         { label: '自定义操作', action: (row, col) => console.log(row, col) }
 *     ]
 * });
 *
 * // 禁用右键菜单
 * workbook.disablePlugin('contextMenu');
 * ```
 */
export class ContextMenuPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "contextMenu";
    }

    /** @type {ContextMenuStrategy|null} */
    #strategy = null;

    /**
     * 初始化右键菜单插件
     * 注册 ContextMenuStrategy 到事件处理器
     *
     * @param {object} options - 插件配置
     * @param {boolean} [options.enabled=true] - 是否默认启用
     */
    init(options = {}) {
        super.init(options);

        this.#strategy = new ContextMenuStrategy(this.eventHandler);
        this.addStrategy("contextMenu", this.#strategy);

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
     * 启用右键菜单
     */
    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    /**
     * 禁用右键菜单
     */
    disable() {
        super.disable();
        this.#strategy?.disable();
    }
}
