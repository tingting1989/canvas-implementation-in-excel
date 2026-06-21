/**
 * 公式函数注册表（模块化版本）
 *
 * 架构设计：
 * ┌─────────────────────────────────────────────┐
 * │              index.js (主入口)               │
 * │  - FunctionRegistry 类                       │
 * │  - 自动加载所有函数模块                       │
 * │  - 提供 API: registerFunction, unregister    │
 * ├─────────────────────────────────────────────┤
 * │  math.js          (6个函数)                  │
 * │  statistical.js   (3个函数)                  │
 * │  logical.js       (1个函数)                  │
 * │  text.js          (4个函数)                  │
 * │  conditional.js   (2个函数)                  │
 * ├─────────────────────────────────────────────┤
 * │  utils/                                      │
 * │  ├── helpers.js      (_flatten, _toNum...)   │
 * │  ├── validation.js   (_validateArgs)         │
 * │  └── matching.js     (_matchCriteria)        │
 * └─────────────────────────────────────────────┘
 *
 * 使用方式：
 * ```js
 * import { registerFunction, FUNCTIONS } from './functions/index.js';
 *
 * // 注册自定义函数
 * registerFunction('MYFUNC', (args, ctx) => {
 *     return args[0] * 2 + args[1];
 * });
 *
 * // 在单元格中使用：=MYFUNC(A1, B1)
 * ```
 */

import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";

// 导入所有功能模块
import { mathFunctions } from './math.js';
import { statisticalFunctions } from './statistical.js';
import { logicalFunctions } from './logical.js';
import { textFunctions } from './text.js';
import { conditionalFunctions } from './conditional.js';
import { lookupFunctions } from './lookup.js';

/**
 * 函数注册表（内部使用）
 */
const FUNCTIONS_MAP = new Map();

/**
 * 函数注册器类
 *
 * 管理所有公式函数的注册、查找和生命周期
 */
class FunctionRegistry {
    constructor() {
        this._functions = FUNCTIONS_MAP;
        
        // 自动注册所有内置函数模块
        this._registerModule('Math', mathFunctions);
        this._registerModule('Statistical', statisticalFunctions);
        this._registerModule('Logical', logicalFunctions);
        this._registerModule('Text', textFunctions);
        this._registerModule('Conditional', conditionalFunctions);
        this._registerModule('Lookup', lookupFunctions);
    }

    /**
     * 注册整个模块的函数
     *
     * @param {string} moduleName - 模块名称（用于日志）
     * @param {Object} functionsObj - 函数对象 { name: implementation }
     * @private
     */
    _registerModule(moduleName, functionsObj) {
        for (const [name, fn] of Object.entries(functionsObj)) {
            this.register(name, fn, { 
                category: 'builtin',
                module: moduleName 
            });
        }
    }

    /**
     * 注册单个函数（带包装器和错误处理）
     *
     * @param {string} name - 函数名（会自动转大写）
     * @param {Function} fn - 函数实现 (args: Array) => any
     * @param {Object} options - 注册选项
     * @param {string} [options.category='custom'] - 函数类别
     * @param {string} [options.module] - 所属模块
     */
    register(name, fn, options = {}) {
        if (typeof name !== 'string' || name.trim() === '') {
            errorHandler.throw(
                ERROR_CODE.FORMULA_INVALID_FUNCTION_NAME,
                '函数名必须为非空字符串'
            );
        }
        
        if (typeof fn !== 'function') {
            errorHandler.throw(
                ERROR_CODE.FORMULA_INVALID_FUNCTION,
                '函数必须是 Function 类型'
            );
        }

        const upperName = name.toUpperCase();
        
        if (this._functions.has(upperName)) {
            errorHandler.warn(
                ERROR_CODE.FORMULA_FUNCTION_OVERRIDE,
                `函数 ${upperName} 已存在，将被覆盖`,
                { functionName: upperName }
            );
        }

        // 包装函数，添加异常捕获
        const wrappedFn = function(...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                errorHandler.handle(
                    ERROR_CODE.FORMULA_EVAL_ERROR,
                    `函数 ${upperName} 执行失败`,
                    { 
                        functionName: upperName, 
                        error: error.message,
                        stack: error.stack 
                    }
                );
                return "#ERROR!";
            }
        };

        this._functions.set(upperName, {
            implementation: wrappedFn,
            originalImplementation: fn,
            category: options.category || 'custom',
            module: options.module || 'unknown',
            registeredAt: Date.now()
        });
    }

    /**
     * 获取函数实现
     *
     * @param {string} name - 函数名（不区分大小写）
     * @returns {Function|undefined} 函数实现或 undefined
     */
    get(name) {
        const entry = this._functions.get(name.toUpperCase());
        return entry ? entry.implementation : undefined;
    }

    /**
     * 检查函数是否已注册
     *
     * @param {string} name - 函数名
     * @returns {boolean}
     */
    has(name) {
        return this._functions.has(name.toUpperCase());
    }

    /**
     * 注销函数
     *
     * @param {string} name - 要移除的函数名
     * @returns {boolean} 是否成功移除
     */
    unregister(name) {
        const upperName = name.toUpperCase();
        
        if (this._functions.has(upperName)) {
            const entry = this._functions.get(upperName);
            
            if (entry.category === 'builtin') {
                errorHandler.warn(
                    ERROR_CODE.FORMULA_FUNCTION_OVERRIDE,
                    `尝试注销内置函数 ${upperName}`,
                    { functionName: upperName }
                );
            }
            
            return this._functions.delete(upperName);
        }
        
        return false;
    }

    /**
     * 获取所有已注册的函数名列表
     *
     * @returns {string[]}
     */
    list() {
        return [...this._functions.keys()];
    }

    /**
     * 获取函数详细信息
     *
     * @param {string} name - 函数名
     * @returns {Object|undefined} 函数元数据
     */
    getInfo(name) {
        const entry = this._functions.get(name.toUpperCase());
        
        if (!entry) return undefined;
        
        return {
            name: name.toUpperCase(),
            category: entry.category,
            module: entry.module,
            registeredAt: new Date(entry.registeredAt).toISOString(),
            isBuiltin: entry.category === 'builtin'
        };
    }

    /**
     * 获取统计信息
     *
     * @returns {Object} 注册表统计
     */
    getStats() {
        let builtinCount = 0;
        let customCount = 0;
        
        for (const [, entry] of this._functions) {
            if (entry.category === 'builtin') {
                builtinCount++;
            } else {
                customCount++;
            }
        }

        return {
            total: this._functions.size,
            builtin: builtinCount,
            custom: customCount,
            modules: [...new Set(
                [...this._functions.values()]
                    .filter(e => e.module !== 'unknown')
                    .map(e => e.module)
            )]
        };
    }
}

/**
 * 全局单例实例
 */
export const registry = new FunctionRegistry();

/**
 * 向后兼容的导出别名
 * @deprecated 建议直接使用 registry 对象
 */
export const FUNCTIONS = registry;

// ════════════════════════════════════════════
// 公共 API 函数（保持向后兼容）
// ════════════════════════════════════════════

/**
 * 注册自定义公式函数
 *
 * @param {string} name - 函数名（如 'MYFUNC'，会自动转大写）
 * @param {Function} fn - 函数实现 (args: Array, context?: Object) => any
 * @throws {Error} 参数类型错误时抛出
 *
 * @example
 * ```js
 * // 基础用法
 * registerFunction('DOUBLE', (args) => args[0] * 2);
 *
 * // 使用上下文（访问工作簿和其他工作表）
 * registerFunction('CROSS_SUM', (args, ctx) => {
 *     const otherSheet = ctx.workbook.sheets.get('Sheet2');
 *     return args[0] + otherSheet.cellStore.get(0, 0)?.value || 0;
 * });
 * ```
 */
export function registerFunction(name, fn) {
    registry.register(name, fn, { category: 'custom' });
}

/**
 * 注销自定义公式函数
 *
 * @param {string} name - 要移除的函数名
 * @returns {boolean} 是否成功移除
 */
export function unregisterFunction(name) {
    return registry.unregister(name);
}

/**
 * 检查函数是否已注册
 *
 * @param {string} name - 函数名
 * @returns {boolean}
 */
export function hasFunction(name) {
    return registry.has(name);
}

/**
 * 获取所有已注册的函数名列表
 *
 * @returns {string[]}
 */
export function getRegisteredFunctions() {
    return registry.list();
}

/**
 * 获取注册表统计信息
 *
 * @returns {Object} 统计数据
 */
export function getFunctionStats() {
    return registry.getStats();
}

// 初始化日志
console.log('[FormulaEngine] ✅ 函数注册表初始化完成');
console.log(`  统计信息:`, registry.getStats());