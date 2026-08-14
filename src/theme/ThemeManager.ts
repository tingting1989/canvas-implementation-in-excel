import { stylePool } from "../model/styles/index.js";
import { darkThemeConfig, defaultThemeConfig, styleTypes } from "./config.js";
import type { ThemeConfig } from "./config.js";
import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

/** ThemeManager 配置选项 */
interface ThemeManagerOptions {
    /** 默认主题名称 */
    defaultTheme?: string;
    /** 是否持久化主题配置 */
    persist?: boolean;
}

/**
 * 主题管理器 (Theme Manager)
 *
 * 负责管理所有主题的注册、切换、获取等操作，
 * 并与 stylePool 集成实现样式复用。
 *
 * @class ThemeManager
 */
export class ThemeManager {
    /** 主题注册表 */
    themes: Record<string, ThemeConfig> = {};

    /** 样式 ID 缓存 */
    styleIds: Record<string, number> = {};

    /** 是否持久化主题配置 */
    persist: boolean;

    /** 当前主题名称 */
    currentTheme: string;

    /**
     * 创建主题管理器实例
     * @param options - 配置选项
     */
    constructor(options: ThemeManagerOptions = {}) {
        this.themes = {};
        this.styleIds = {};
        this.persist = options.persist !== false;

        if (options.defaultTheme) {
            this.currentTheme = options.defaultTheme;
        } else if (this.persist) {
            const saved = localStorage.getItem("canvas-sheet-theme");
            this.currentTheme = saved || "default";
        } else {
            this.currentTheme = "default";
        }

        if (this.persist) {
            this.#loadCustomThemesFromStorage();
        }

        this.#registerBuiltInThemes();
    }

    /** 注册内置主题 */
    #registerBuiltInThemes(): void {
        this.registerTheme("default", defaultThemeConfig);
        this.registerTheme("dark", darkThemeConfig);
    }

    /** 从 localStorage 加载自定义主题 */
    #loadCustomThemesFromStorage(): void {
        try {
            const themesJson = localStorage.getItem("canvas-sheet-themes");
            if (themesJson) {
                const customThemes = JSON.parse(themesJson) as Record<string, ThemeConfig>;
                Object.keys(customThemes).forEach((name) => {
                    if (!this.themes[name]) {
                        this.registerTheme(name, customThemes[name]);
                    }
                });
            }
        } catch (e) {
            errorHandler.warn(ERROR_CODE.THEME_STORAGE_LOAD_FAILED, `Failed to load custom themes from storage: ${(e as Error).message}`, {
                error: e,
            });
        }
    }

    /** 保存配置到 localStorage */
    #saveToStorage(): void {
        try {
            localStorage.setItem("canvas-sheet-theme", this.currentTheme);
            const customThemes: Record<string, ThemeConfig> = {};
            Object.keys(this.themes).forEach((name) => {
                if (name !== "default" && name !== "dark") {
                    customThemes[name] = this.themes[name];
                }
            });
            localStorage.setItem("canvas-sheet-themes", JSON.stringify(customThemes));
        } catch (e) {
            errorHandler.warn(ERROR_CODE.THEME_STORAGE_SAVE_FAILED, `Failed to save theme to storage: ${(e as Error).message}`, { error: e });
        }
    }

    /** 验证主题配置结构 */
    #validateThemeConfig(config: unknown): void {
        if (!config || typeof config !== "object") {
            errorHandler.throw(ERROR_CODE.THEME_CONFIG_INVALID_TYPE, "Theme config must be an object");
        }
        const cfg = config as Record<string, unknown>;
        if (!cfg.config || typeof cfg.config !== "object") {
            errorHandler.throw(ERROR_CODE.THEME_CONFIG_MISSING_CONFIG, 'Theme config must have a "config" property');
        }
        const innerConfig = cfg.config as Record<string, unknown>;
        if (!innerConfig.cell || typeof innerConfig.cell !== "object") {
            errorHandler.throw(ERROR_CODE.THEME_CONFIG_MISSING_CELL, 'Theme config must have "config.cell" property');
        }
    }

    /** 从主题配置中获取样式 */
    #getStyleFromConfig(config: ThemeConfig | null, type: string): Record<string, unknown> {
        if (!config?.config?.cell) return {};

        const parts = type.split(".");
        let result: unknown = config.config;
        for (const part of parts) {
            if (!result) return {};
            result = (result as Record<string, unknown>)[part];
        }
        return (result as Record<string, unknown>) || {};
    }

    /** 预注册样式到 stylePool */
    #preRegisterStyles(themeName: string, config: ThemeConfig): void {
        styleTypes.forEach((type) => {
            const style = this.#getStyleFromConfig(config, type);
            if (style && Object.keys(style).length > 0) {
                this.styleIds[`${themeName}.${type}`] = stylePool.getStyleId(style);
            }
        });
    }

    /** 触发主题变更事件 */
    #emitThemeChange(themeName: string): void {
        const event = new CustomEvent("canvas-sheet-theme-change", {
            detail: { themeName },
        });
        document.dispatchEvent(event);
    }

    /**
     * 获取指定主题配置
     * @param name - 主题名称
     * @returns 主题配置，不存在返回 null
     */
    getTheme(name: string): ThemeConfig | null {
        return this.themes[name] || null;
    }

    /**
     * 切换到指定主题
     * @param name - 主题名称
     * @returns 是否切换成功
     */
    setTheme(name: string): boolean {
        if (!this.themes[name]) {
            errorHandler.throw(ERROR_CODE.THEME_NOT_FOUND, `Theme "${name}" does not exist`);
        }

        this.currentTheme = name;

        if (this.persist) {
            localStorage.setItem("canvas-sheet-theme", name);
        }

        this.#emitThemeChange(name);

        return true;
    }

    /**
     * 注册新主题
     * @param name - 主题名称（唯一）
     * @param config - 主题配置对象
     */
    registerTheme(name: string, config: ThemeConfig): void {
        if (this.themes[name]) {
            errorHandler.throw(ERROR_CODE.THEME_ALREADY_EXISTS, `Theme "${name}" already exists`);
        }

        this.#validateThemeConfig(config);

        this.themes[name] = config;

        this.#preRegisterStyles(name, config);

        if (this.persist) {
            this.#saveToStorage();
        }
    }

    /**
     * 获取当前主题的指定样式
     * @param type - 样式类型
     * @returns 样式配置对象
     */
    getStyle(type: string): Record<string, unknown> {
        const theme = this.themes[this.currentTheme];
        return this.#getStyleFromConfig(theme, type);
    }

    /**
     * 获取指定样式的 stylePool ID
     * @param type - 样式类型
     * @returns 样式 ID
     */
    getStyleId(type: string): number | undefined {
        return this.styleIds[`${this.currentTheme}.${type}`];
    }

    /**
     * 获取当前主题名称
     */
    getCurrentTheme(): string {
        return this.currentTheme;
    }

    /**
     * 获取所有已注册主题列表
     */
    getThemes(): string[] {
        return Object.keys(this.themes);
    }

    /**
     * 删除指定主题
     * @param name - 主题名称
     * @returns 是否删除成功
     */
    removeTheme(name: string): boolean {
        if (!this.themes[name]) {
            return false;
        }

        if (name === this.currentTheme) {
            errorHandler.throw(ERROR_CODE.THEME_CANNOT_REMOVE_ACTIVE, "Cannot remove the currently active theme");
        }

        delete this.themes[name];

        const keysToDelete = Object.keys(this.styleIds).filter((key) => key.startsWith(`${name}.`));
        keysToDelete.forEach((key) => delete this.styleIds[key]);

        if (this.persist) {
            this.#saveToStorage();
        }

        return true;
    }
}
