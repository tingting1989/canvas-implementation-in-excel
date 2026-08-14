import { ERROR_LEVEL } from "../constants/errorCodes.js";
import { isFunction } from "../utils/helper.js";

export { ERROR_LEVEL, ERROR_CODE } from "../constants/errorCodes.js";

/**
 * 错误处理器配置选项
 *
 * @property {number} [level] - 最低报告级别（低于此级别的错误将被忽略）
 * @property {boolean} [throwOnFatal] - FATAL 级别是否抛出异常（默认 true）
 * @property {boolean} [devMode] - 是否启用开发模式（启用后 DEBUG 级别日志可见）
 */
interface ErrorHandlerOptions {
    level?: number;
    throwOnFatal?: boolean;
    devMode?: boolean;
}

/**
 * 错误监听器回调函数类型
 *
 * @param {string} code - 错误码（如 'RENDER_001'）
 * @param {string} message - 错误描述信息
 * @param {number} level - 错误级别（ERROR_LEVEL 枚举值）
 * @param {Record<string, unknown>} [meta] - 附加元数据（上下文信息）
 */
type ErrorListener = (code: string, message: string, level: number, meta?: Record<string, unknown>) => void;

/**
 * ErrorHandler — 集中式错误处理器（单例模式）
 *
 * 提供统一的错误收集、分级、上报和监听机制。
 * 通过级别过滤、监听器注册和守卫函数，实现灵活的错误处理策略。
 *
 * 核心能力：
 * - `error()/warn()/info()/debug()/throw()`: 分级错误报告
 * - `guard()/guardAsync()`: 同步/异步守卫函数（捕获异常并降级为错误报告）
 * - `onError()/offError()`: 注册/注销错误监听器（用于外部系统集成）
 * - `configure()`: 运行时配置调整
 *
 * @example
 * errorHandler.configure({ level: ERROR_LEVEL.WARN, devMode: true });
 * errorHandler.onError((code, msg, level) => sendToSentry(code, msg, level));
 * errorHandler.guard(() => riskyOperation(), 'OPS_001', '操作失败');
 */
class ErrorHandler {
    /**
     * @private 私有字段 - 最低报告级别（低于此级别的错误将被静默忽略）
     */
    #level: number = ERROR_LEVEL.WARN;

    /**
     * @private 私有字段 - FATAL 级别是否抛出异常（true: 抛出 Error，false: 仅打印日志）
     */
    #throwOnFatal: boolean = true;

    /**
     * @private 私有字段 - 已注册的错误监听器列表
     */
    #listeners: ErrorListener[] = [];

    /**
     * @private 私有字段 - 是否启用开发模式（启用后 debug() 方法生效）
     */
    #devMode: boolean = false;

    /**
     * 运行时配置错误处理器
     *
     * @param {ErrorHandlerOptions} [options={}] - 配置选项
     * @param {number} [options.level] - 最低报告级别
     * @param {boolean} [options.throwOnFatal] - FATAL 是否抛异常
     * @param {boolean} [options.devMode] - 是否启用开发模式
     * @returns {void}
     */
    configure(options: ErrorHandlerOptions = {}): void {
        if (options.level !== undefined) {
            this.#level = options.level;
        }
        if (options.throwOnFatal !== undefined) {
            this.#throwOnFatal = options.throwOnFatal;
        }
        if (options.devMode !== undefined) {
            this.#devMode = options.devMode;
        }
    }

    /**
     * 注册错误监听器
     *
     * 监听器会在每次错误被报告时调用，可用于外部系统集成（Sentry、LogRocket 等）。
     * 监听器自身的异常会被静默吞没，不影响错误处理主流程。
     *
     * @param {ErrorListener} listener - 错误监听回调函数
     * @returns {void}
     */
    onError(listener: ErrorListener): void {
        if (isFunction(listener)) {
            this.#listeners.push(listener as ErrorListener);
        }
    }

    /**
     * 注销错误监听器
     *
     * @param {ErrorListener} listener - 之前注册的监听回调函数引用
     * @returns {void}
     */
    offError(listener: ErrorListener): void {
        const idx = this.#listeners.indexOf(listener);
        if (idx !== -1) {
            this.#listeners.splice(idx, 1);
        }
    }

    /**
     * 报告 ERROR 级别错误
     *
     * @param {string} code - 错误码
     * @param {string} message - 错误描述
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {void}
     */
    error(code: string, message: string, meta?: Record<string, unknown>): void {
        this.#report(ERROR_LEVEL.ERROR, code, message, meta);
    }

    /**
     * 报告 WARN 级别警告
     *
     * @param {string} code - 错误码
     * @param {string} message - 警告描述
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {void}
     */
    warn(code: string, message: string, meta?: Record<string, unknown>): void {
        this.#report(ERROR_LEVEL.WARN, code, message, meta);
    }

    /**
     * 报告 DEBUG 级别调试信息（仅 devMode 启用时生效）
     *
     * @param {string} code - 错误码
     * @param {string} message - 调试描述
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {void}
     */
    debug(code: string, message: string, meta?: Record<string, unknown>): void {
        if (!this.#devMode) return;
        this.#report(ERROR_LEVEL.DEBUG, code, message, meta);
    }

    /**
     * 报告 INFO 级别信息
     *
     * @param {string} code - 错误码
     * @param {string} message - 信息描述
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {void}
     */
    info(code: string, message: string, meta?: Record<string, unknown>): void {
        this.#report(ERROR_LEVEL.INFO, code, message, meta);
    }

    /**
     * 报告 FATAL 级别错误并可能抛出异常
     *
     * 当 #throwOnFatal 为 true 时，报告后抛出 Error 对象终止执行；
     * 为 false 时，仅打印日志不抛出。
     *
     * @param {string} code - 错误码
     * @param {string} message - 致命错误描述
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {void}
     * @throws {Error} 当 throwOnFatal 为 true 时抛出
     */
    throw(code: string, message: string, meta?: Record<string, unknown>): never | void {
        this.#report(ERROR_LEVEL.FATAL, code, message, meta);
        if (this.#throwOnFatal) {
            throw new Error(`[${code}] ${message}`);
        }
    }

    /**
     * 同步守卫函数 - 捕获异常并降级为 ERROR 级别报告
     *
     * 执行可能抛出异常的同步函数，捕获后通过 error() 报告而非向上传播。
     * 原始异常对象会保存在 meta.originalError 中。
     *
     * @param {() => T} fn - 需要守卫的同步函数
     * @param {string} code - 错误码
     * @param {string} [message] - 自定义错误描述（默认使用异常的 message）
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {T|undefined} 函数正常返回值，异常时返回 undefined
     */
    guard<T>(fn: () => T, code: string, message?: string, meta?: Record<string, unknown>): T | undefined {
        try {
            return fn();
        } catch (error) {
            this.error(code, message || (error as Error).message, { ...meta, originalError: error });
            return undefined;
        }
    }

    /**
     * 异步守卫函数 - 捕获 Promise 异常并降级为 ERROR 级别报告
     *
     * 执行可能 reject 的 Promise，捕获后通过 error() 报告而非向上传播。
     * 原始异常对象会保存在 meta.originalError 中。
     *
     * @param {Promise<T>} promise - 需要守卫的 Promise 对象
     * @param {string} code - 错误码
     * @param {string} [message] - 自定义错误描述（默认使用异常的 message）
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {Promise<T|undefined>} Promise 正常解析值，异常时解析为 undefined
     */
    async guardAsync<T>(promise: Promise<T>, code: string, message?: string, meta?: Record<string, unknown>): Promise<T | undefined> {
        try {
            return await promise;
        } catch (error) {
            this.error(code, message || (error as Error).message, { ...meta, originalError: error });
            return undefined;
        }
    }

    /**
     * 查询当前最低报告级别
     *
     * @returns {number} 当前配置的最低报告级别
     */
    get level(): number {
        return this.#level;
    }

    /**
     * 查询是否启用开发模式
     *
     * @returns {boolean} true 表示开发模式已启用
     */
    get devMode(): boolean {
        return this.#devMode;
    }

    /**
     * @private 私有方法 - 内部错误报告核心逻辑
     *
     * 执行流程：
     * 1. 级别过滤（低于 #level 的错误直接忽略）
     * 2. 控制台输出（ERROR+ 用 console.error，WARN 用 console.warn，其余用 console.log）
     * 3. 通知监听器（按注册顺序调用，监听器异常不影响主流程）
     *
     * @param {number} level - 错误级别
     * @param {string} code - 错误码
     * @param {string} message - 错误描述
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {void}
     */
    #report(level: number, code: string, message: string, meta?: Record<string, unknown>): void {
        if (level < this.#level) return;

        const prefix = this.#getLevelPrefix(level);
        const fullMessage = `[${code}] ${message}`;

        if (level >= ERROR_LEVEL.ERROR) {
            console.error(`${prefix} ${fullMessage}`, meta || "");
        } else if (level === ERROR_LEVEL.WARN) {
            console.warn(`${prefix} ${fullMessage}`, meta || "");
        } else {
            console.log(`${prefix} ${fullMessage}`, meta || "");
        }

        this.#notifyListeners(code, message, level, meta);
    }

    /**
     * @private 私有方法 - 通知所有已注册的错误监听器
     *
     * 监听器自身的异常会被静默吞没（try-catch 包裹），
     * 确保一个监听器的失败不会影响其他监听器和错误处理主流程。
     *
     * @param {string} code - 错误码
     * @param {string} message - 错误描述
     * @param {number} level - 错误级别
     * @param {Record<string, unknown>} [meta] - 附加元数据
     * @returns {void}
     */
    #notifyListeners(code: string, message: string, level: number, meta?: Record<string, unknown>): void {
        for (const listener of this.#listeners) {
            try {
                listener(code, message, level, meta);
            } catch (_) {
                // 监听器自身异常不应影响错误处理流程
            }
        }
    }

    /**
     * @private 私有方法 - 获取错误级别的控制台前缀字符串
     *
     * @param {number} level - 错误级别（ERROR_LEVEL 枚举值）
     * @returns {string} 对应的前缀字符串（如 '[ERROR]'、'[WARN]' 等）
     */
    #getLevelPrefix(level: number): string {
        switch (level) {
            case ERROR_LEVEL.DEBUG:
                return "[DEBUG]";
            case ERROR_LEVEL.INFO:
                return "[INFO]";
            case ERROR_LEVEL.WARN:
                return "[WARN]";
            case ERROR_LEVEL.ERROR:
                return "[ERROR]";
            case ERROR_LEVEL.FATAL:
                return "[FATAL]";
            default:
                return "[UNKNOWN]";
        }
    }
}

/**
 * 全局错误处理器单例
 *
 * 使用方式：import { errorHandler } from './core/ErrorHandler.js';
 */
export const errorHandler = new ErrorHandler();
