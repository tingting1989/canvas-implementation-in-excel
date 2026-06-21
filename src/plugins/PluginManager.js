import { BasePlugin } from "./BasePlugin.js";
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 插件管理器
 * 负责插件的注册、加载、卸载和生命周期管理
 *
 * 职责：
 * - 维护全局插件注册表（PluginClass 映射）
 * - 管理每个 Workbook 实例的插件实例
 * - 提供插件的加载、卸载、启用、禁用操作
 *
 * 使用方式：
 * ```js
 * // 全局注册插件类
 * PluginManager.register('myPlugin', MyPlugin);
 *
 * // 在 Workbook 实例上加载插件
 * workbook.loadPlugin('myPlugin', { option1: true });
 *
 * // 获取插件实例
 * const plugin = workbook.getPlugin('myPlugin');
 * ```
 */
export class PluginManager {
    /** 全局插件注册表：插件名 → 插件类 */
    static #registry = new Map();

    /** @type {import("../workbook/Workbook.js").Workbook} */
    #workbook = null;
    /** 已加载的插件实例：插件名 → 插件实例 */
    #plugins = new Map();

    /**
     * @param {import("../workbook/Workbook.js").Workbook} workbook - Workbook 实例
     */
    constructor(workbook) {
        this.#workbook = workbook;
    }

    /**
     * 全局注册插件类
     * 注册后所有 Workbook 实例均可通过 loadPlugin 加载该插件
     *
     * @param {string} name - 插件名称
     * @param {typeof BasePlugin} PluginClass - 插件类（必须继承 BasePlugin）
     */
    static register(name, PluginClass) {
        if (!(PluginClass.prototype instanceof BasePlugin)) {
            errorHandler.throw(ERROR_CODE.PLUGIN_INVALID_CLASS, `Plugin "${name}" must extend BasePlugin`);
        }
        PluginManager.#registry.set(name, PluginClass);
    }

    /**
     * 全局注销插件类
     *
     * @param {string} name - 插件名称
     */
    static unregister(name) {
        PluginManager.#registry.delete(name);
    }

    /**
     * 获取全局已注册的插件名称列表
     *
     * @returns {string[]}
     */
    static getRegisteredNames() {
        return Array.from(PluginManager.#registry.keys());
    }

    /**
     * 加载插件
     * 实例化插件类并调用 init()
     *
     * @param {string} name - 插件名称
     * @param {object} [options={}] - 插件配置
     * @returns {BasePlugin|null} 插件实例，如果未注册则返回 null
     */
    loadPlugin(name, options = {}) {
        if (this.#plugins.has(name)) {
            errorHandler.warn(ERROR_CODE.PLUGIN_ALREADY_LOADED, `Plugin "${name}" is already loaded`);
            return this.#plugins.get(name);
        }

        const PluginClass = PluginManager.#registry.get(name);
        if (!PluginClass) {
            errorHandler.handle(ERROR_CODE.PLUGIN_NOT_REGISTERED, `Plugin "${name}" is not registered. Use PluginManager.register() first.`);
            return null;
        }

        const instance = new PluginClass(this.#workbook);
        instance.init(options);
        this.#plugins.set(name, instance);

        return instance;
    }

    /**
     * 直接加载插件类（无需全局注册）
     * 适用于一次性或动态创建的插件
     *
     * @param {typeof BasePlugin} PluginClass - 插件类
     * @param {object} [options={}] - 插件配置
     * @returns {BasePlugin} 插件实例
     */
    loadPluginClass(PluginClass, options = {}) {
        const name = PluginClass.PLUGIN_NAME;
        if (this.#plugins.has(name)) {
            errorHandler.warn(ERROR_CODE.PLUGIN_ALREADY_LOADED, `Plugin "${name}" is already loaded`);
            return this.#plugins.get(name);
        }

        const instance = new PluginClass(this.#workbook);
        instance.init(options);
        this.#plugins.set(name, instance);

        return instance;
    }

    /**
     * 卸载插件
     * 调用 destroy() 并从管理器中移除
     *
     * @param {string} name - 插件名称
     */
    unloadPlugin(name) {
        const plugin = this.#plugins.get(name);
        if (plugin) {
            plugin.destroy();
            this.#plugins.delete(name);
        }
    }

    /**
     * 获取已加载的插件实例
     *
     * @param {string} name - 插件名称
     * @returns {BasePlugin|null}
     */
    getPlugin(name) {
        return this.#plugins.get(name) || null;
    }

    /**
     * 获取所有已加载的插件名称
     *
     * @returns {string[]}
     */
    getLoadedNames() {
        return Array.from(this.#plugins.keys());
    }

    /**
     * 启用指定插件
     *
     * @param {string} name - 插件名称
     */
    enablePlugin(name) {
        const plugin = this.#plugins.get(name);
        if (plugin) {
            plugin.enable();
        }
    }

    /**
     * 禁用指定插件
     *
     * @param {string} name - 插件名称
     */
    disablePlugin(name) {
        const plugin = this.#plugins.get(name);
        if (plugin) {
            plugin.disable();
        }
    }

    /**
     * 销毁所有已加载的插件
     */
    destroyAll() {
        for (const [, plugin] of this.#plugins) {
            plugin.destroy();
        }
        this.#plugins.clear();
    }

    /**
     * 检查指定插件是否已加载
     *
     * @param {string} name - 插件名称
     * @returns {boolean}
     */
    hasPlugin(name) {
        return this.#plugins.has(name);
    }
}
