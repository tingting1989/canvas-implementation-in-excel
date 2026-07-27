import { stylePool } from "../model/styles/index.js";
import { darkThemeConfig, defaultThemeConfig, styleTypes } from "./config.js";
import { ERROR_CODE, errorHandler } from "../core/ErrorHandler.js";
/**
 * 主题管理器类
 *
 * 负责管理所有主题的注册、切换、获取等操作，
 * 并与 stylePool 集成实现样式复用。
 *
 * @class ThemeManager
 */
export class ThemeManager {
    /**
     * 创建主题管理器实例
     *
     * @param {object} options - 配置选项
     * @param {string} [options.defaultTheme='default'] - 默认主题名称
     * @param {boolean} [options.persist=true] - 是否持久化主题配置
     */
    constructor(options = {}) {
        /**
         * 主题注册表
         * @type {Map<string, object>}
         */
        this.themes = {};

        /**
         * 样式 ID 缓存
         * @type {Map<string, number>}
         */
        this.styleIds = {};

        /**
         * 是否持久化主题配置
         * @type {boolean}
         */
        this.persist = options.persist !== false;

        /**
         * 当前主题名称
         * @type {string}
         */
        if (options.defaultTheme) {
            this.currentTheme = options.defaultTheme;
        } else if (this.persist) {
            const saved = localStorage.getItem("canvas-sheet-theme");
            this.currentTheme = saved || "default";
        } else {
            this.currentTheme = "default";
        }

        // 加载持久化的自定义主题（不影响 currentTheme）
        if (this.persist) {
            this.#loadCustomThemesFromStorage();
        }

        // 注册内置主题
        this.#registerBuiltInThemes();
    }

    /**
     * 注册内置主题
     * @private
     */
    #registerBuiltInThemes() {
        this.registerTheme("default", defaultThemeConfig);
        this.registerTheme("dark", darkThemeConfig);
    }

    /**
     * 从 localStorage 加载自定义主题（不影响 currentTheme）
     * @private
     */
    #loadCustomThemesFromStorage() {
        try {
            const themesJson = localStorage.getItem("canvas-sheet-themes");
            if (themesJson) {
                const customThemes = JSON.parse(themesJson);
                Object.keys(customThemes).forEach((name) => {
                    if (!this.themes[name]) {
                        this.registerTheme(name, customThemes[name]);
                    }
                });
            }
        } catch (e) {
            errorHandler.warn(ERROR_CODE.THEME_STORAGE_LOAD_FAILED, `Failed to load custom themes from storage: ${e.message}`, { error: e });
        }
    }

    /**
     * 保存配置到 localStorage
     * @private
     */
    #saveToStorage() {
        try {
            localStorage.setItem("canvas-sheet-theme", this.currentTheme);
            // 只保存自定义主题（排除内置主题）
            const customThemes = {};
            Object.keys(this.themes).forEach((name) => {
                if (name !== "default" && name !== "dark") {
                    customThemes[name] = this.themes[name];
                }
            });
            localStorage.setItem("canvas-sheet-themes", JSON.stringify(customThemes));
        } catch (e) {
            errorHandler.warn(ERROR_CODE.THEME_STORAGE_SAVE_FAILED, `Failed to save theme to storage: ${e.message}`, { error: e });
        }
    }

    /**
     * 验证主题配置结构
     * @private
     */
    #validateThemeConfig(config) {
        if (!config || typeof config !== "object") {
            errorHandler.throw(ERROR_CODE.THEME_CONFIG_INVALID_TYPE, "Theme config must be an object");
        }
        if (!config.config || typeof config.config !== "object") {
            errorHandler.throw(ERROR_CODE.THEME_CONFIG_MISSING_CONFIG, 'Theme config must have a "config" property');
        }
        if (!config.config.cell || typeof config.config.cell !== "object") {
            errorHandler.throw(ERROR_CODE.THEME_CONFIG_MISSING_CELL, 'Theme config must have "config.cell" property');
        }
    }

    /**
     * 从主题配置中获取样式
     * @private
     */
    #getStyleFromConfig(config, type) {
        if (!config?.config?.cell) return {};

        const parts = type.split(".");
        let result = config.config;
        for (const part of parts) {
            if (!result) return {};
            result = result[part];
        }
        return result || {};
    }

    /**
     * 预注册样式到 stylePool
     * @private
     */
    #preRegisterStyles(themeName, config) {
        styleTypes.forEach((type) => {
            const style = this.#getStyleFromConfig(config, type);
            if (style && Object.keys(style).length > 0) {
                this.styleIds[`${themeName}.${type}`] = stylePool.getStyleId(style);
            }
        });
    }

    /**
     * 触发主题变更事件
     * @private
     */
    #emitThemeChange(themeName) {
        const event = new CustomEvent("canvas-sheet-theme-change", {
            detail: { themeName },
        });
        document.dispatchEvent(event);
    }

    /**
     * 获取指定主题配置
     *
     * @param {string} name - 主题名称
     * @returns {object|null} 主题配置，如果不存在返回 null
     */
    getTheme(name) {
        return this.themes[name] || null;
    }

    /**
     * 切换到指定主题
     *
     * @param {string} name - 主题名称
     * @returns {boolean} 是否切换成功
     * @throws {Error} 如果主题不存在抛出错误
     */
    setTheme(name) {
        if (!this.themes[name]) {
            errorHandler.throw(ERROR_CODE.THEME_NOT_FOUND, `Theme "${name}" does not exist`);
        }

        this.currentTheme = name;

        // 持久化当前主题
        if (this.persist) {
            localStorage.setItem("canvas-sheet-theme", name);
        }

        // 触发主题切换事件
        this.#emitThemeChange(name);

        return true;
    }

    /**
     * 注册新主题
     *
     * @param {string} name - 主题名称（唯一）
     * @param {object} config - 主题配置对象
     * @throws {Error} 如果主题已存在抛出错误
     */
    registerTheme(name, config) {
        if (this.themes[name]) {
            errorHandler.throw(ERROR_CODE.THEME_ALREADY_EXISTS, `Theme "${name}" already exists`);
        }

        // 验证配置结构
        this.#validateThemeConfig(config);

        // 注册主题
        this.themes[name] = config;

        // 预注册样式到 stylePool
        this.#preRegisterStyles(name, config);

        // 持久化
        if (this.persist) {
            this.#saveToStorage();
        }
    }

    /**
     * 获取当前主题的指定样式
     *
     * @param {string} type - 样式类型（如 'cell.default', 'cell.hyperlink'）
     * @returns {object} 样式配置对象
     */
    getStyle(type) {
        const theme = this.themes[this.currentTheme];
        return this.#getStyleFromConfig(theme, type);
    }

    /**
     * 获取指定样式的 stylePool ID
     *
     * @param {string} type - 样式类型
     * @returns {number|undefined} 样式 ID
     */
    getStyleId(type) {
        return this.styleIds[`${this.currentTheme}.${type}`];
    }

    /**
     * 获取当前主题名称
     *
     * @returns {string} 当前主题名称
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * 获取所有已注册主题列表
     *
     * @returns {string[]} 主题名称数组
     */
    getThemes() {
        return Object.keys(this.themes);
    }

    /**
     * 删除指定主题
     *
     * @param {string} name - 主题名称
     * @returns {boolean} 是否删除成功
     */
    removeTheme(name) {
        if (!this.themes[name]) {
            return false;
        }

        // 不能删除当前使用的主题
        if (name === this.currentTheme) {
            errorHandler.throw(ERROR_CODE.THEME_CANNOT_REMOVE_ACTIVE, "Cannot remove the currently active theme");
        }

        delete this.themes[name];

        // 删除相关的样式 ID 缓存
        const keysToDelete = Object.keys(this.styleIds).filter((key) => key.startsWith(`${name}.`));
        keysToDelete.forEach((key) => delete this.styleIds[key]);

        // 持久化
        if (this.persist) {
            this.#saveToStorage();
        }

        return true;
    }
}
