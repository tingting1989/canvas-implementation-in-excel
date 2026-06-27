/**
 * 渲染器注册表
 *
 * 管理全局可用的自定义渲染器类（BaseColumnType 子类）。
 * 允许用户在运行时动态添加和查询渲染器。
 *
 * @module types/RendererRegistry
 */

import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 渲染器注册表类
 *
 * 提供全局渲染器的注册、查询、注销和管理功能。
 */
class RendererRegistry {
    /** @type {Map<string, Function>} 渲染器类映射 (name → Constructor) */
    #renderers = new Map();

    /**
     * 注册渲染器类
     *
     * @param {string} name - 渲染器名称（唯一标识）
     * @param {Function} rendererClass - 渲染器构造函数（必须继承 BaseColumnType）
     * @returns {boolean} 注册成功返回 true，失败返回 false
     *
     * @throws {Error} 当参数无效时会记录警告并返回 false
     *
     * @example
     * import { registerRenderer } from './types/index.js';
     * import { ProgressBarType } from './types/renderers/ProgressBarType.js';
     *
     * registerRenderer('progress', ProgressBarType);
     */
    static registerRenderer(name, rendererClass) {
        if (!name || typeof name !== "string") {
            errorHandler.warn(ERROR_CODE.INVALID_RENDERER_NAME, "Renderer name must be a non-empty string");
            return false;
        }

        if (typeof rendererClass !== "function") {
            errorHandler.warn(ERROR_CODE.INVALID_RENDERER_CLASS, "Renderer must be a constructor function");
            return false;
        }

        if (this.#renderers.has(name)) {
            errorHandler.warn(ERROR_CODE.DUPLICATE_RENDERER, `Renderer "${name}" already registered, will be overwritten`);
        }

        this.#renderers.set(name, rendererClass);
        return true;
    }

    /**
     * 获取渲染器实例
     *
     * @param {string} name - 渲染器名称
     * @param {object} [options={}] - 渲染器配置选项
     * @returns {import('./BaseColumnType.js').BaseColumnType|null} 渲染器实例，未找到返回 null
     *
     * @example
     * const renderer = getRenderer('progress', { color: '#ff5722' });
     */
    static getRenderer(name, options = {}) {
        const RendererClass = this.#renderers.get(name);
        if (!RendererClass) {
            errorHandler.warn(ERROR_CODE.RENDERER_NOT_FOUND, `Renderer "${name}" not found`);
            return null;
        }
        try {
            return new RendererClass(options);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.RENDERER_INSTANTIATION_ERROR, `Failed to instantiate renderer "${name}"`, { originalError: error });
            return null;
        }
    }

    /**
     * 检查渲染器是否已注册
     *
     * @param {string} name - 渲染器名称
     * @returns {boolean}
     */
    static hasRenderer(name) {
        return this.#renderers.has(name);
    }

    /**
     * 注销渲染器
     *
     * @param {string} name - 渲染器名称
     * @returns {boolean} 成功返回 true，不存在返回 false
     */
    static unregisterRenderer(name) {
        return this.#renderers.delete(name);
    }

    /**
     * 获取所有已注册的渲染器名称
     *
     * @returns {string[]}
     */
    static getRegisteredRenderers() {
        return Array.from(this.#renderers.keys());
    }

    /**
     * 清空所有已注册的渲染器（主要用于测试）
     *
     * @returns {void}
     */
    static clear() {
        this.#renderers.clear();
    }

    /**
     * 获取已注册渲染器的数量
     *
     * @returns {number}
     */
    static size() {
        return this.#renderers.size;
    }
}

// 导出单例方法（绑定到静态方法上）
export const registerRenderer = RendererRegistry.registerRenderer.bind(RendererRegistry);
export const getRenderer = RendererRegistry.getRenderer.bind(RendererRegistry);
export const hasRenderer = RendererRegistry.hasRenderer.bind(RendererRegistry);
export const unregisterRenderer = RendererRegistry.unregisterRenderer.bind(RendererRegistry);
export const getRegisteredRenderers = RendererRegistry.getRegisteredRenderers.bind(RendererRegistry);

// 导出类本身（用于高级用法或测试）
export default RendererRegistry;
