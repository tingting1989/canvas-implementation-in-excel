import { ThemeManager } from "./ThemeManager.js";
import { stylePool } from "../model/styles/index.js";

/** 单元格类型到样式类型的映射 */
const typeToStyleMap: Record<string, string> = {
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
 * 主题样式提供者 (Theme Style Provider)
 *
 * 提供基于主题的样式获取服务，
 * 与 stylePool 集成实现样式复用。
 *
 * @class ThemeStyleProvider
 */
export class ThemeStyleProvider {
    /** 订阅者集合 */
    #subscribers: Set<() => void> = new Set();

    /** 主题管理器实例 */
    themeManager: ThemeManager;

    constructor() {
        this.themeManager = new ThemeManager();
    }

    /**
     * 订阅主题变化
     * @param callback - 主题变化时的回调函数
     * @returns 取消订阅的函数
     */
    subscribe(callback: () => void): () => boolean {
        this.#subscribers.add(callback);
        return () => this.#subscribers.delete(callback);
    }

    /** 通知所有订阅者主题已切换 */
    #notifySubscribers(): void {
        this.#subscribers.forEach((callback) => callback());
    }

    /**
     * 获取单元格样式 ID
     * @param _row - 行号
     * @param _col - 列号
     * @param cellType - 单元格类型
     * @returns 样式 ID
     */
    getCellStyleId(_row: number, _col: number, cellType: string): number | undefined {
        const styleType = typeToStyleMap[cellType] || "cell.default";
        return this.themeManager.getStyleId(styleType);
    }

    /**
     * 获取单元格样式配置
     * @param _row - 行号
     * @param _col - 列号
     * @param cellType - 单元格类型
     * @returns 样式配置
     */
    getCellStyle(_row: number, _col: number, cellType: string): Record<string, unknown> {
        const styleType = typeToStyleMap[cellType] || "cell.default";
        const styleId = this.themeManager.getStyleId(styleType);
        if (styleId) {
            return stylePool.getStyle(styleId);
        }

        return this.themeManager.getStyle(styleType);
    }

    /**
     * 获取当前主题的指定样式类型
     * @param styleType - 样式类型
     * @returns 样式配置对象
     */
    getStyle(styleType: string): Record<string, unknown> {
        return this.themeManager.getStyle(styleType);
    }

    /**
     * 获取当前主题的指定样式 ID
     * @param styleType - 样式类型
     * @returns 样式 ID
     */
    getStyleId(styleType: string): number | undefined {
        return this.themeManager.getStyleId(styleType);
    }

    /**
     * 获取当前主题名称
     */
    getCurrentTheme(): string {
        return this.themeManager.getCurrentTheme();
    }

    /**
     * 切换主题
     * @param themeName - 主题名称
     * @returns 是否切换成功
     */
    setTheme(themeName: string): boolean {
        const result = this.themeManager.setTheme(themeName);
        if (result) {
            this.#notifySubscribers();
        }
        return result;
    }

    /**
     * 注册新主题
     * @param name - 主题名称
     * @param config - 主题配置
     */
    registerTheme(name: string, config: any): void {
        this.themeManager.registerTheme(name, config);
    }

    /**
     * 获取所有已注册主题列表
     */
    getThemes(): string[] {
        return this.themeManager.getThemes();
    }
}

/** 主题样式提供者单例 */
export const themeStyleProvider: ThemeStyleProvider = new ThemeStyleProvider();
