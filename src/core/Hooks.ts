import { HOOKS } from "../constants/hookNames.js";
import { errorHandler } from "./ErrorHandler.js";
import { isFunction } from "../utils/helper.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

/**
 * 钩子回调函数类型
 *
 * 接受任意参数，返回任意值。
 * 返回值在 runHooksUntil/runHooksUntilWithCallback 中用于短路判断。
 */
type HookCallback = (...args: unknown[]) => unknown;

/**
 * 钩子调用器类型
 *
 * 自定义回调执行方式的函数，用于 runHooksWithCallback 等方法。
 * 允许调用方控制回调的执行上下文和参数传递。
 *
 * @param {HookCallback} callback - 需要执行的钩子回调函数
 * @returns {unknown} 回调的执行结果
 */
type HookInvoker = (callback: HookCallback) => unknown;

/**
 * Hooks — 钩子系统（发布-订阅模式的增强实现）
 *
 * 提供灵活的钩子注册、执行和管理机制，支持多种执行策略。
 * 与 EventBus 的区别：Hooks 侧重于"拦截和修改"数据流，EventBus 侧重于"通知"事件发生。
 *
 * 核心能力：
 * - `addHook()/addHookOnce()`: 注册持久/一次性钩子
 * - `removeHook()/clearHook()/clearAllHooks()`: 注销和清理钩子
 * - `runHooks()`: 顺序执行所有钩子（忽略返回值）
 * - `runHooksUntil()`: 顺序执行直到返回非 undefined 值（短路模式）
 * - `runHooksWithCallback()/runHooksUntilWithCallback()`: 自定义执行器模式
 * - `init()`: 从常量注册表初始化所有默认钩子名称
 *
 * @example
 * const hooks = new Hooks();
 * hooks.init();
 * hooks.addHook('beforeRender', (data) => { data.modified = true; });
 * hooks.runHooks('beforeRender', renderData);
 */
export class Hooks {
    /**
     * 钩子注册表 - 钩子名称到回调函数数组的映射
     *
     * 每个钩子名称对应一个回调函数数组，按注册顺序执行。
     */
    hooks: Map<string, HookCallback[]> = new Map();

    /**
     * 是否已从常量注册表初始化默认钩子
     *
     * init() 方法具有幂等性，重复调用不会重复注册。
     */
    initialized: boolean = false;

    /**
     * 从常量注册表初始化所有默认钩子名称
     *
     * 遍历 HOOKS 常量对象的所有值，为每个钩子名称创建空数组。
     * 此方法具有幂等性，多次调用仅首次生效。
     *
     * @returns {void}
     */
    init(): void {
        if (this.initialized) return;

        const defaultHookNames = Object.values(HOOKS);

        defaultHookNames.forEach((hookName) => {
            this.hooks.set(hookName as string, []);
        });

        this.initialized = true;
    }

    /**
     * 注册持久钩子回调
     *
     * 将回调函数追加到指定钩子的回调列表末尾。
     * 回调会在每次 runHooks 时执行，直到被显式移除。
     *
     * @param {string} hookName - 钩子名称
     * @param {HookCallback} callback - 回调函数（必须是函数类型，否则抛出异常）
     * @returns {void}
     * @throws {Error} 当 callback 不是函数时抛出 HOOK_CALLBACK_INVALID 错误
     */
    addHook(hookName: string, callback: HookCallback): void {
        if (!isFunction(callback)) {
            errorHandler.throw(ERROR_CODE.HOOK_CALLBACK_INVALID, "Hook callback must be a function");
        }

        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }

        this.hooks.get(hookName)!.push(callback as HookCallback);
    }

    /**
     * 注册一次性钩子回调（执行后自动移除）
     *
     * 包装原始回调：首次执行后自动调用 removeHook 移除自身。
     * 适用于只需响应一次的场景（如初始化完成通知）。
     *
     * @param {string} hookName - 钩子名称
     * @param {HookCallback} callback - 回调函数（仅执行一次后自动注销）
     * @returns {void}
     * @throws {Error} 当 callback 不是函数时抛出 HOOK_CALLBACK_INVALID 错误
     */
    addHookOnce(hookName: string, callback: HookCallback): void {
        if (!isFunction(callback)) {
            errorHandler.throw(ERROR_CODE.HOOK_CALLBACK_INVALID, "Hook callback must be a function");
        }

        const onceCallback = (...args: unknown[]) => {
            callback(...args);
            this.removeHook(hookName, onceCallback);
        };

        this.addHook(hookName, onceCallback);
    }

    /**
     * 移除指定钩子的特定回调函数
     *
     * 通过引用匹配移除回调（使用 indexOf 查找）。
     * 注意：addHookOnce 注册的回调需使用返回的包装函数引用才能移除。
     *
     * @param {string} hookName - 钩子名称
     * @param {HookCallback} callback - 要移除的回调函数引用
     * @returns {void}
     */
    removeHook(hookName: string, callback: HookCallback): void {
        const callbacks = this.hooks.get(hookName);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 清空指定钩子的所有回调函数
     *
     * 保留钩子名称的注册，仅清空回调列表。
     *
     * @param {string} hookName - 钩子名称
     * @returns {void}
     */
    clearHook(hookName: string): void {
        if (this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }
    }

    /**
     * 清空所有钩子的回调函数
     *
     * 保留所有钩子名称的注册，仅清空每个钩子的回调列表。
     *
     * @returns {void}
     */
    clearAllHooks(): void {
        this.hooks.forEach((callbacks, hookName) => {
            this.hooks.set(hookName, []);
        });
    }

    /**
     * 顺序执行指定钩子的所有回调（忽略返回值模式）
     *
     * 所有回调按注册顺序执行，单个回调的异常不会中断后续回调。
     * 返回最后一个成功执行的回调结果。
     *
     * @param {string} hookName - 钩子名称
     * @param {unknown[]} args - 传递给每个回调的参数
     * @returns {unknown} 最后一个回调的返回值（无回调时返回 undefined）
     */
    runHooks(hookName: string, ...args: unknown[]): unknown {
        const callbacks = this.hooks.get(hookName);
        if (!callbacks || callbacks.length === 0) {
            return undefined;
        }

        const snapshot = callbacks.slice();
        let result: unknown;
        for (const callback of snapshot) {
            try {
                result = callback(...args);
            } catch (error) {
                errorHandler.error(ERROR_CODE.HOOK_EXECUTION_ERROR, `Hook "${hookName}" execution failed`, { originalError: error });
            }
        }

        return result;
    }

    /**
     * 顺序执行钩子回调直到返回非 undefined 值（短路模式）
     *
     * 遍历回调列表，首个返回非 undefined 值的回调将终止遍历并返回其结果。
     * 适用于"拦截器"模式：第一个能处理请求的拦截器消费事件。
     *
     * @param {string} hookName - 钩子名称
     * @param {unknown[]} args - 传递给每个回调的参数
     * @returns {unknown} 第一个非 undefined 的回调返回值（无匹配时返回 undefined）
     */
    runHooksUntil(hookName: string, ...args: unknown[]): unknown {
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
                errorHandler.error(ERROR_CODE.HOOK_EXECUTION_ERROR, `Hook "${hookName}" execution failed`, { originalError: error });
            }
        }

        return undefined;
    }

    /**
     * 使用自定义调用器执行所有钩子回调（自定义执行器模式）
     *
     * 允许调用方完全控制回调的执行方式（如修改参数、绑定上下文等）。
     * 所有回调都会执行，返回最后一个成功结果。
     *
     * @param {string} hookName - 钩子名称
     * @param {HookInvoker} invoker - 自定义调用器函数，接收回调并返回结果
     * @returns {unknown} 最后一个调用器的返回值（无回调时返回 undefined）
     */
    runHooksWithCallback(hookName: string, invoker: HookInvoker): unknown {
        const callbacks = this.hooks.get(hookName);
        if (!callbacks || callbacks.length === 0) {
            return undefined;
        }

        const snapshot = callbacks.slice();
        let result: unknown;
        for (const callback of snapshot) {
            try {
                result = invoker(callback);
            } catch (error) {
                errorHandler.error(ERROR_CODE.HOOK_EXECUTION_ERROR, `Hook "${hookName}" execution failed`, { originalError: error });
            }
        }

        return result;
    }

    /**
     * 使用自定义调用器执行钩子回调直到返回非 undefined 值（自定义执行器 + 短路模式）
     *
     * 结合 runHooksUntil 的短路语义和 runHooksWithCallback 的自定义执行器能力。
     *
     * @param {string} hookName - 钩子名称
     * @param {HookInvoker} invoker - 自定义调用器函数
     * @returns {unknown} 第一个非 undefined 的调用器返回值
     */
    runHooksUntilWithCallback(hookName: string, invoker: HookInvoker): unknown {
        const callbacks = this.hooks.get(hookName);
        if (!callbacks || callbacks.length === 0) {
            return undefined;
        }

        for (const callback of callbacks) {
            try {
                const result = invoker(callback);
                if (result !== undefined) {
                    return result;
                }
            } catch (error) {
                errorHandler.error(ERROR_CODE.HOOK_EXECUTION_ERROR, `Hook "${hookName}" execution failed`, { originalError: error });
            }
        }

        return undefined;
    }

    /**
     * 获取指定钩子的回调函数列表副本
     *
     * 返回数组的浅拷贝，外部修改不影响内部注册表。
     *
     * @param {string} hookName - 钩子名称
     * @returns {HookCallback[]} 回调函数数组副本（无回调时返回空数组）
     */
    getHooks(hookName: string): HookCallback[] {
        const callbacks = this.hooks.get(hookName);
        return callbacks ? callbacks.slice() : [];
    }

    /**
     * 获取所有已注册的钩子名称列表
     *
     * @returns {string[]} 钩子名称数组
     */
    getHookNames(): string[] {
        return Array.from(this.hooks.keys());
    }

    /**
     * 检查指定钩子是否注册了至少一个回调
     *
     * @param {string} hookName - 钩子名称
     * @returns {boolean} true 表示该钩子有至少一个有效回调
     */
    hasHook(hookName: string): boolean {
        const callbacks = this.hooks.get(hookName);
        return !!callbacks && callbacks.length > 0;
    }
}
