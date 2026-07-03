import { ERROR_LEVEL, ERROR_CODE } from "@/constants/errorCodes";
import { isFunction } from "@/utils/utils";

/**
 * 统一错误处理器
 *
 * 职责：
 * - 统一管理所有错误/警告/调试信息的输出
 * - 支持错误级别过滤（开发模式输出所有，生产模式仅输出 ERROR 及以上）
 * - 支持注册自定义错误监听器（插件可监听错误事件）
 * - 支持 throw 模式和 log 模式切换
 *
 * 使用方式：
 * ```js
 * import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../core/ErrorHandler.js";
 *
 * errorHandler.warn(ERROR_CODE.PLUGIN_ALREADY_LOADED, `Plugin "${name}" already loaded`);
 * errorHandler.handle(ERROR_CODE.PLUGIN_NOT_REGISTERED, `Plugin "${name}" not found`, { name });
 * errorHandler.throw(ERROR_CODE.HOOK_CALLBACK_INVALID, "Hook callback must be a function");
 * ```
 */
class ErrorHandler {
    /** 当前错误级别阈值，低于此级别的消息将被忽略 */
    #level = ERROR_LEVEL.WARN;

    /** 是否在 FATAL 级别时自动抛出异常 */
    #throwOnFatal = true;

    /** 自定义错误监听器列表 */
    #listeners = [];

    /** 是否处于开发模式 */
    #devMode = false;

    /**
     * 配置错误处理器
     *
     * @param {object} options
     * @param {number}  [options.level]         - 最低输出级别，默认 ERROR_LEVEL.WARN
     * @param {boolean} [options.throwOnFatal] - FATAL 级别是否自动 throw，默认 true
     * @param {boolean} [options.devMode]      - 是否开发模式，开发模式输出 DEBUG/INFO，默认 false
     */
    configure(options = {}) {
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
     * 每次发生错误时都会调用所有监听器（不受级别过滤影响）
     *
     * @param {function} listener - 监听器函数 (code, message, level, meta) => void
     */
    onError(listener) {
        if (isFunction(listener)) {
            this.#listeners.push(listener);
        }
    }

    /**
     * 移除错误监听器
     *
     * @param {function} listener - 要移除的监听器
     */
    offError(listener) {
        const idx = this.#listeners.indexOf(listener);
        if (idx !== -1) {
            this.#listeners.splice(idx, 1);
        }
    }

    /**
     * 处理错误（记录 + 通知监听器，不抛出）
     *
     * @param {string} code    - 错误码，使用 ERROR_CODE 常量
     * @param {string} message - 错误描述
     * @param {object} [meta]  - 附加元数据
     */
    handle(code, message, meta) {
        this.#report(ERROR_LEVEL.ERROR, code, message, meta);
    }

    /**
     * 记录警告
     *
     * @param {string} code    - 错误码
     * @param {string} message - 警告描述
     * @param {object} [meta]  - 附加元数据
     */
    warn(code, message, meta) {
        this.#report(ERROR_LEVEL.WARN, code, message, meta);
    }

    /**
     * 记录调试信息（仅开发模式）
     *
     * @param {string} code    - 错误码
     * @param {string} message - 调试信息
     * @param {object} [meta]  - 附加元数据
     */
    debug(code, message, meta) {
        if (!this.#devMode) return;
        this.#report(ERROR_LEVEL.DEBUG, code, message, meta);
    }

    /**
     * 记录普通信息
     *
     * @param {string} code    - 错误码
     * @param {string} message - 信息描述
     * @param {object} [meta]  - 附加元数据
     */
    info(code, message, meta) {
        this.#report(ERROR_LEVEL.INFO, code, message, meta);
    }

    /**
     * 抛出错误（记录 + 抛出异常）
     * 用于不可恢复的错误场景
     *
     * @param {string} code    - 错误码
     * @param {string} message - 错误描述
     * @param {object} [meta]  - 附加元数据
     * @throws {Error}
     */
    throw(code, message, meta) {
        this.#report(ERROR_LEVEL.FATAL, code, message, meta);
        if (this.#throwOnFatal) {
            throw new Error(`[${code}] ${message}`);
        }
    }

    /**
     * 包装 try-catch，统一处理同步异常
     *
     * @param {function} fn      - 可能抛出异常的函数
     * @param {string}   code    - 异常时使用的错误码
     * @param {string}   message - 异常时的错误描述
     * @param {object}   [meta]  - 附加元数据
     * @returns {*} fn 的返回值，异常时返回 undefined
     */
    guard(fn, code, message, meta) {
        try {
            return fn();
        } catch (error) {
            this.handle(code, message || error.message, { ...meta, originalError: error });
            return undefined;
        }
    }

    /**
     * 包装 try-catch，统一处理异步异常
     *
     * @param {Promise} promise - 可能 reject 的 Promise
     * @param {string}  code    - 异常时使用的错误码
     * @param {string}  message - 异常时的错误描述
     * @param {object}  [meta]  - 附加元数据
     * @returns {Promise} 包装后的 Promise（异常时 resolve undefined）
     */
    async guardAsync(promise, code, message, meta) {
        try {
            return await promise;
        } catch (error) {
            this.handle(code, message || error.message, { ...meta, originalError: error });
            return undefined;
        }
    }

    /**
     * 获取当前错误级别
     *
     * @returns {number}
     */
    get level() {
        return this.#level;
    }

    /**
     * 获取是否开发模式
     *
     * @returns {boolean}
     */
    get devMode() {
        return this.#devMode;
    }

    // ─── 内部方法 ──────────────────────────────────

    /**
     * 统一报告入口
     *
     * @param {number} level   - 错误级别
     * @param {string} code    - 错误码
     * @param {string} message - 错误描述
     * @param {object} [meta]  - 附加元数据
     */
    #report(level, code, message, meta) {
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
     * 通知所有已注册的监听器
     */
    #notifyListeners(code, message, level, meta) {
        for (const listener of this.#listeners) {
            try {
                listener(code, message, level, meta);
            } catch (_) {
                // 监听器自身异常不应影响错误处理流程
            }
        }
    }

    /**
     * 获取错误级别前缀字符串
     */
    #getLevelPrefix(level) {
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

/** 全局单例 */
export const errorHandler = new ErrorHandler();

export { ERROR_LEVEL, ERROR_CODE };
