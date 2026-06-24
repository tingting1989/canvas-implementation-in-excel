import { HOOKS } from "../constants/hookNames.js";
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";
import { isFunction } from "../core/utils.js";

/**
 * Hooks 系统
 * 参考 Handsontable 的 hooks 实现
 * https://handsontable.com/docs/javascript-data-grid/api/hooks/
 *
 * 所有钩子名称定义在 hookNames.js 中，使用 HOOKS 常量访问：
 * ```js
 * import { HOOKS } from './hookNames.js';
 * hooks.addHook(HOOKS.ON_CELL_CLICK, (row, col) => { ... });
 * ```
 */
export class Hooks {
    constructor() {
        /** 钩子映射表：钩子名 → 回调函数数组 */
        this.hooks = new Map();
        /** 是否已初始化 */
        this.initialized = false;
    }

    /**
     * 初始化 hooks（注册所有默认钩子类型）
     * 钩子名称来源：HOOKS 常量（hookNames.js）
     */
    init() {
        if (this.initialized) return;

        const defaultHookNames = Object.values(HOOKS);

        defaultHookNames.forEach((hookName) => {
            this.hooks.set(hookName, []);
        });

        this.initialized = true;
    }

    /**
     * 添加钩子监听器
     *
     * @param {string} hookName - 钩子名称（建议使用 HOOKS 常量）
     * @param {Function} callback - 回调函数
     */
    addHook(hookName, callback) {
        if (!isFunction(callback)) {
            errorHandler.throw(ERROR_CODE.HOOK_CALLBACK_INVALID, "Hook callback must be a function");
        }

        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }

        this.hooks.get(hookName).push(callback);
    }

    /**
     * 添加一次性钩子监听器（触发一次后自动移除）
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    addHookOnce(hookName, callback) {
        if (!isFunction(callback)) {
            errorHandler.throw(ERROR_CODE.HOOK_CALLBACK_INVALID, "Hook callback must be a function");
        }

        const onceCallback = (...args) => {
            callback(...args);
            this.removeHook(hookName, onceCallback);
        };

        this.addHook(hookName, onceCallback);
    }

    /**
     * 移除钩子监听器
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    removeHook(hookName, callback) {
        const callbacks = this.hooks.get(hookName);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 移除指定钩子的所有监听器
     *
     * @param {string} hookName - 钩子名称
     */
    clearHook(hookName) {
        if (this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }
    }

    /** 移除所有钩子的所有监听器 */
    clearAllHooks() {
        this.hooks.forEach((callbacks, hookName) => {
            this.hooks.set(hookName, []);
        });
    }

    /**
     * 触发钩子
     * 按注册顺序执行所有回调，返回最后一个回调的返回值
     *
     * @param {string} hookName - 钩子名称
     * @param {...*} args - 传递给回调的参数
     * @returns {*} 最后一个回调的返回值
     */
    runHooks(hookName, ...args) {
        const callbacks = this.hooks.get(hookName);
        if (!callbacks || callbacks.length === 0) {
            return undefined;
        }

        const snapshot = callbacks.slice();
        let result;
        for (const callback of snapshot) {
            try {
                result = callback(...args);
            } catch (error) {
                errorHandler.handle(ERROR_CODE.HOOK_EXECUTION_ERROR, `Hook "${hookName}" execution failed`, { originalError: error });
            }
        }

        return result;
    }

    /**
     * 触发钩子并返回第一个非 undefined 的返回值
     * 适用于 before* 类钩子，用于拦截操作
     *
     * @param {string} hookName - 钩子名称
     * @param {...*} args - 传递给回调的参数
     * @returns {*} 第一个非 undefined 的返回值
     */
    runHooksUntil(hookName, ...args) {
        const callbacks = this.hooks.get(hookName);
        if (!callbacks || callbacks.length === 0) {
            return undefined;
        }

        for (const callback of callbacks) {
            try {
                const result = callback(...args);
                if (result !== undefined) {
                    return result;
                }
            } catch (error) {
                errorHandler.handle(ERROR_CODE.HOOK_EXECUTION_ERROR, `Hook "${hookName}" execution failed`, { originalError: error });
            }
        }

        return undefined;
    }

    /**
     * 获取指定钩子的所有监听器
     *
     * @param {string} hookName - 钩子名称
     * @returns {Function[]}
     */
    getHooks(hookName) {
        return this.hooks.get(hookName) || [];
    }

    /**
     * 获取所有已注册的钩子名称
     *
     * @returns {string[]}
     */
    getHookNames() {
        return Array.from(this.hooks.keys());
    }

    /**
     * 检查指定钩子是否有监听器
     *
     * @param {string} hookName - 钩子名称
     * @returns {boolean}
     */
    hasHook(hookName) {
        const callbacks = this.hooks.get(hookName);
        return !!callbacks && callbacks.length > 0;
    }
}
