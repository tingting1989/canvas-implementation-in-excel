import { ThemeManager } from "./ThemeManager.js";
import { stylePool } from "../model/styles/index.js";
const typeToStyleMap = {
    numeric: "cell.numeric",
    text: "cell.text",
    hyperlink: "cell.hyperlink",
    date: "cell.date",
    checkbox: "cell.checkbox",
    textarea: "cell.textarea",
    header: "cell.header",
    selected: "cell.selected",
};
/**
 * 主题样式提供者
 *
 * 提供基于主题的样式获取服务，
 * 与 stylePool 集成实现样式复用。
 *
 * @class ThemeStyleProvider
 */
export class ThemeStyleProvider {
    /** 订阅者集合（用于主题切换时通知所有 SheetStyleManager） */
    #subscribers = new Set();

    constructor() {
        /**
         * 主题管理器实例
         * @type {ThemeManager}
         */
        this.themeManager = new ThemeManager();
    }

    /**
     * 订阅主题变化
     * @param {Function} callback - 主题变化时的回调函数
     * @returns {Function} 取消订阅的函数
     */
    subscribe(callback) {
        this.#subscribers.add(callback);
        return () => this.#subscribers.delete(callback);
    }

    /**
     * 通知所有订阅者主题已切换
     * @private
     */
    #notifySubscribers() {
        this.#subscribers.forEach((callback) => callback());
    }

    /**
     * 获取单元格样式 ID
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} cellType - 单元格类型
     * @returns {number} 样式 ID
     */
    getCellStyleId(row, col, cellType) {
        const styleType = typeToStyleMap[cellType] || "cell.default";
        return this.themeManager.getStyleId(styleType);
    }

    /**
     * 获取单元格样式配置
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} cellType - 单元格类型
     * @returns {object} 样式配置
     */
    getCellStyle(row, col, cellType) {
        const styleType = typeToStyleMap[cellType] || "cell.default";
        const styleId = this.themeManager.getStyleId(styleType);
        if (styleId) {
            return stylePool.getStyle(styleId);
        }

        // 如果没有找到对应的样式 ID，返回主题中的样式配置
        return this.themeManager.getStyle(styleType);
    }

    /**
     * 获取当前主题的指定样式类型
     *
     * @param {string} styleType - 样式类型（如 'cell.default', 'cell.hyperlink'）
     * @returns {object} 样式配置对象
     */
    getStyle(styleType) {
        return this.themeManager.getStyle(styleType);
    }

    /**
     * 获取当前主题的指定样式 ID
     *
     * @param {string} styleType - 样式类型
     * @returns {number|undefined} 样式 ID
     */
    getStyleId(styleType) {
        return this.themeManager.getStyleId(styleType);
    }

    /**
     * 获取当前主题名称
     *
     * @returns {string} 当前主题名称
     */
    getCurrentTheme() {
        return this.themeManager.getCurrentTheme();
    }

    /**
     * 切换主题
     *
     * @param {string} themeName - 主题名称
     * @returns {boolean} 是否切换成功
     */
    setTheme(themeName) {
        const result = this.themeManager.setTheme(themeName);
        if (result) {
            this.#notifySubscribers();
        }
        return result;
    }

    /**
     * 注册新主题
     *
     * @param {string} name - 主题名称
     * @param {object} config - 主题配置
     */
    registerTheme(name, config) {
        this.themeManager.registerTheme(name, config);
    }

    /**
     * 获取所有已注册主题列表
     *
     * @returns {string[]} 主题名称数组
     */
    getThemes() {
        return this.themeManager.getThemes();
    }
}

/**
 * 主题样式提供者单例
 * @type {ThemeStyleProvider}
 */
export const themeStyleProvider = new ThemeStyleProvider();
