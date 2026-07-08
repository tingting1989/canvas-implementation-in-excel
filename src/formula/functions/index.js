/**
 * @license Apache-2.0
 *
 * Copyright (c) 2024 jiangsuiting
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * 公式函数注册表（Formula Function Registry）
 *
 * @module FormulaFunctions
 * @description
 *
 * ## 📋 模块概述
 * 本模块是公式引擎的核心组件之一，负责管理所有公式函数的生命周期，
 * 包括内置函数的自动注册、自定义函数的动态注册、函数查找、错误处理等。
 *
 * ## 🏗️ 架构设计
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    index.js (主入口)                         │
 * │  ┌─────────────────────────────────────────────────────┐    │
 * │  │              FunctionRegistry (单例)                  │    │
 * │  │  - register() / unregister() / get() / has()         │    │
 * │  │  - list() / getInfo() / getStats()                   │    │
 * │  └─────────────────────────────────────────────────────┘    │
 * │                          ↓                                   │
 * │  ┌─────────────────────────────────────────────────────┐    │
 * │  │              FUNCTIONS_MAP (Map)                     │    │
 * │  │  Key: "SUM" → { implementation, category, ... }      │    │
 * │  └─────────────────────────────────────────────────────┘    │
 * ├─────────────────────────────────────────────────────────────┤
 * │  内置函数模块（自动加载）                                     │
 * │  ├── math.js          数学函数 (SUM, AVERAGE, MAX, MIN...)  │
 * │  ├── statistical.js   统计函数 (COUNT, COUNTA, STDEV...)     │
 * │  ├── logical.js       逻辑函数 (IF, AND, OR...)             │
 * │  ├── text.js          文本函数 (CONCATENATE, LEFT, RIGHT..)  │
 * │  ├── conditional.js   条件函数 (IFERROR, IFNA...)            │
 * │  └── lookup.js        查找函数 (VLOOKUP, HLOOKUP, MATCH...)  │
 * ├─────────────────────────────────────────────────────────────┤
 * │  工具模块（内部使用）                                         │
 * │  ├── helpers.js      _flatten, _toNum, _isBlank...           │
 * │  ├── validation.js   _validateArgs, _validateNumericArg...    │
 * │  └── matching.js     _matchCriteria, _matchWildcard...        │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## 🎯 核心职责
 *
 * 1. **函数注册中心**：统一管理所有公式函数（内置 + 自定义）
 * 2. **生命周期管理**：支持动态注册、注销、查询、统计
 * 3. **异常隔离**：包装每个函数实现，防止自定义函数崩溃影响整个引擎
 * 4. **分类管理**：区分内置函数（builtin）和自定义函数（custom）
 * 5. **大小写标准化**：统一将函数名转大写存储（Excel 风格）
 *
 * ## 🔧 使用方式
 *
 * ### 基础用法
 * ```js
 * import { registry } from './functions/index.js';
 *
 * // ✅ 注册自定义函数
 * registry.register('DOUBLE', (args) => args[0] * 2);
 *
 * // ✅ 在单元格中使用 =DOUBLE(A1)
 *
 * // ✅ 调用函数
 * const result = registry.get('SUM')([1, 2, 3]);  // 6
 *
 * // ✅ 查询信息
 * registry.has('SUM');        // true
 * registry.list();            // ['SUM', 'AVERAGE', 'IF', ...]
 * registry.getStats();        // { total: 16, builtin: 16, custom: 1 }
 * ```
 *
 * ### 高级用法（带上下文）
 * ```js
 * registry.register('CROSS_SHEET_SUM', (args, ctx) => {
 *     const otherSheet = ctx.workbook.sheets.get('Sheet2');
 *     const value = otherSheet.cellStore.get(0, 0)?.value || 0;
 *     return args[0] + value;
 * });
 * ```
 *
 * ## ⚠️ 重要注意事项
 *
 * - 函数名会**自动转大写**（`sum` 和 `SUM` 是同一个函数）
 * - 自定义函数会覆盖同名内置函数（会有警告日志）
 * - 所有函数都会被**异常包装**，执行失败返回 `#ERROR!`
 * - 内置函数被注销时会记录警告（但不阻止操作）
 *
 * ## 📊 性能特征
 *
 * - **时间复杂度**：
 *   - `register()` / `unregister()` / `get()` / `has()`: O(1) (Map 操作)
 *   - `list()`: O(n) (遍历所有键)
 *   - `getStats()`: O(n) (遍历所有条目)
 * - **空间复杂度**：O(n) (n 为已注册函数数量)
 * - **内存占用**：每个函数约 200 字节（含元数据）
 *
 * @author Canvas Spreadsheet Team
 * @version 2.0.0
 * @license UNLICENSED
 */

import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler.js";

// ════════════════════════════════════════════
// 导入内置函数模块
// ════════════════════════════════════════════

/** 数学函数模块：SUM, AVERAGE, MAX, MIN, ROUND, ABS 等 */
import { mathFunctions } from "./math.js";

/** 统计函数模块：COUNT, COUNTA, STDEV, VAR 等 */
import { statisticalFunctions } from "./statistical.js";

/** 逻辑函数模块：IF, AND, OR, NOT 等 */
import { logicalFunctions } from "./logical.js";

/** 文本函数模块：CONCATENATE, LEFT, RIGHT, MID, LEN 等 */
import { textFunctions } from "./text.js";

/** 条件函数模块：IFERROR, IFNA 等 */
import { conditionalFunctions } from "./conditional.js";

/** 查找函数模块：VLOOKUP, HLOOKUP, MATCH, INDEX 等 */
import { lookupFunctions } from "./lookup.js";

// ════════════════════════════════════════════
// 常量定义
// ════════════════════════════════════════════

/**
 * 函数类别常量（Function Category Constants）
 *
 * 用于标识函数的来源和类型，在注册、查询、统计时使用。
 * 使用常量而非字符串字面量的好处：
 * - 类型安全：拼写错误会在编译/运行时立即发现
 * - 代码智能提示：IDE 可以提供自动补全
 * - 易于重构：修改常量值即可全局生效
 * - 语义明确：比魔法字符串更具可读性
 *
 * @example
 * ```js
 * import { FUNCTION_CATEGORY } from './functions/index.js';
 *
 * // 注册内置函数
 * registry.register('SUM', sumImpl, { category: FUNCTION_CATEGORY.BUILTIN });
 *
 * // 注册自定义函数
 * registry.register('MYFUNC', myFuncImpl);  // 默认为 CUSTOM
 *
 * // 检查函数类别
 * const info = registry.getInfo('SUM');
 * if (info.category === FUNCTION_CATEGORY.BUILTIN) {
 *     console.log('这是内置函数');
 * }
 * ```
 */
const FUNCTION_CATEGORY = Object.freeze({
    /** 内置函数类别：系统自动加载的数学、统计、逻辑等函数 */
    BUILTIN: "builtin",

    /** 自定义函数类别：用户通过 API 手动注册的函数 */
    CUSTOM: "custom",
});

/**
 * @constant {string} FUNCTION_CATEGORY.BUILTIN
 * @description 内置函数类别标识
 * @default "builtin"
 */

/**
 * @constant {string} FUNCTION_CATEGORY.CUSTOM
 * @description 自定义函数类别标识
 * @default "custom"
 */

// 导出常量供外部使用
export { FUNCTION_CATEGORY };

// ════════════════════════════════════════════
// 内部数据结构
// ════════════════════════════════════════════

/**
 * 全局函数注册表（内部 Map 存储）
 *
 * 数据结构：
 * ```js
 * Map<string, FunctionEntry>
 * // Key: 大写的函数名，如 "SUM", "AVERAGE"
 * // Value: {
 * //   implementation: Function,      // 包装后的函数（带异常捕获）
 * //   originalImplementation: Function, // 原始函数（用于调试）
 * //   category: FUNCTION_CATEGORY.BUILTIN | FUNCTION_CATEGORY.CUSTOM, // 函数类别
 * //   module: string,                // 所属模块（如 "Math", "Statistical"）
 * //   registeredAt: number           // 注册时间戳
 * // }
 * ```
 *
 * @type {Map<string, Object>}
 * @private
 */
const FUNCTIONS_MAP = new Map();

// ════════════════════════════════════════════
// FunctionRegistry 类定义
// ════════════════════════════════════════════

/**
 * 函数注册器类（Singleton Pattern）
 *
 * 采用单例模式确保全局只有一个注册表实例，
 * 避免多实例导致的函数状态不一致问题。
 *
 * 设计原则：
 * - **单一职责**：只负责函数的注册、查找、注销
 * - **开放封闭**：通过 `register()` 扩展功能，无需修改源码
 * - **依赖倒置**：不依赖具体的函数实现，只依赖函数接口 `(args, ctx?) => any`
 * - **防御性编程**：对所有输入进行验证，对异常进行捕获
 *
 * 使用方式：
 * ```js
 * const registry = new FunctionRegistry();
 *
 * // 注册内置函数（通常在构造时自动完成）
 * registry.register('SUM', sumImpl, { category: FUNCTION_CATEGORY.BUILTIN, module: 'Math' });
 *
 * // 注册自定义函数
 * registry.register('MYFUNC', myFuncImpl);
 *
 * // 调用函数
 * const result = registry.get('SUM')([1, 2, 3]);
 * ```
 *
 * @class FunctionRegistry
 * @example
 * ```js
 * // 创建实例并初始化内置函数
 * const registry = new FunctionRegistry();
 * console.log(registry.list());  // ['SUM', 'AVERAGE', 'IF', ...]
 *
 * // 注册自定义函数
 * registry.register('DOUBLE', (args) => args[0] * 2);
 * console.log(registry.has('DOUBLE'));  // true
 *
 * // 统计信息
 * console.log(registry.getStats());
 * // { total: 17, builtin: 16, custom: 1, modules: ['Math', 'Statistical', ...] }
 * ```
 */
class FunctionRegistry {
    /**
     * 创建函数注册器实例
     *
     * 在构造时会自动加载并注册所有内置函数模块。
     * 这保证了公式引擎在启动后立即可用。
     *
     * @constructor
     * @throws {Error} 当内置函数模块加载失败时抛出异常（由 errorHandler 处理）
     *
     * @example
     * ```js
     * const registry = new FunctionRegistry();
     * // 此时已自动注册了所有内置函数：
     * // - Math: SUM, AVERAGE, MAX, MIN, ROUND, ABS
     * // - Statistical: COUNT, COUNTA, STDEV
     * // - Logical: IF
     * // - Text: CONCATENATE, LEFT, RIGHT, LEN
     * // - Conditional: IFERROR, IFNA
     * // - Lookup: VLOOKUP, HLOOKUP, MATCH
     * ```
     */
    constructor() {
        /** @type {Map<string, Object>} 内部函数存储 */
        this._functions = FUNCTIONS_MAP;

        // 自动注册所有内置函数模块
        this._registerModule("Math", mathFunctions);
        this._registerModule("Statistical", statisticalFunctions);
        this._registerModule("Logical", logicalFunctions);
        this._registerModule("Text", textFunctions);
        this._registerModule("Conditional", conditionalFunctions);
        this._registerModule("Lookup", lookupFunctions);
    }

    // ════════════════════════════════════════════
    // 私有方法（内部使用）
    // ════════════════════════════════════════════

    /**
     * 批量注册一个模块的所有函数
     *
     * 用于在初始化时加载内置函数模块。
     * 会遍历 functionsObj 的所有属性，逐一调用 register()。
     *
     * @param {string} moduleName - 模块名称（用于日志和元数据标记）
     *                              如 "Math"、"Statistical"、"Logical"
     * @param {Object.<string, Function>} functionsObj - 函数对象
     *        键值对格式：{ "SUM": sumFunction, "AVG": avgFunction }
     *
     * @private
     * @example
     * ```js
     * // 内部调用示例
     * this._registerModule("Math", {
     *     SUM: (args) => args.reduce((a, b) => a + b, 0),
     *     AVERAGE: (args) => args.reduce((a, b) => a + b, 0) / args.length,
     *     MAX: (args) => Math.max(...args),
     *     MIN: (args) => Math.min(...args),
     * });
     * ```
     */
    _registerModule(moduleName, functionsObj) {
        for (const [name, fn] of Object.entries(functionsObj)) {
            this.register(name, fn, {
                category: FUNCTION_CATEGORY.BUILTIN,
                module: moduleName,
            });
        }
    }

    // ════════════════════════════════════════════
    // 公共 API：核心方法
    // ════════════════════════════════════════════

    /**
     * 注册单个函数到注册表
     *
     * 这是注册函数的核心方法，负责：
     * 1. 参数验证（name 必须是非空字符串，fn 必须是函数）
     * 2. 名称标准化（自动转大写）
     * 3. 冲突检测（同名函数存在时发出警告）
     * 4. 异常包装（创建安全包装器，捕获运行时错误）
     * 5. 元数据记录（类别、模块、时间戳等）
     *
     * @param {string} name - 函数名称（会自动转大写，如 "sum" → "SUM"）
     *                        推荐使用大写字母以符合 Excel 规范
     * @param {Function} fn - 函数实现
     *        签名：(args: Array<*>, ctx?: Object) => any
     *        - args: 函数参数数组（从 AST 中提取）
     *        - ctx: 可选上下文对象（包含 sheet, workbook 等引用）
     * @param {Object} [options={}] - 注册选项
     * @param {string} [options.category=FUNCTION_CATEGORY.CUSTOM] - 函数类别
     *        - {@link FUNCTION_CATEGORY.BUILTIN}: 内置函数（由系统自动注册）
     *        - {@link FUNCTION_CATEGORY.CUSTOM}: 用户自定义函数（通过 API 手动注册）
     * @param {string} [options.module='unknown'] - 所属模块名称
     *        如 "Math"、"Statistical"、用户自定义等
     *
     * @throws {Error} 当 name 不是有效字符串时抛出 FORMULA_INVALID_FUNCTION_NAME
     * @throws {Error} 当 fn 不是函数类型时抛出 FORMULA_INVALID_FUNCTION
     *
     * @returns {void}
     *
     * @example
     * ```js
     * // 基础用法
     * registry.register('DOUBLE', (args) => args[0] * 2);
     *
     * // 高级用法（使用上下文）
     * registry.register('GET_CELL_VALUE', (args, ctx) => {
     *     const row = args[0];
     *     const col = args[1];
     *     return ctx.sheet.cellStore.get(row, col)?.value ?? '';
     * }, { category: FUNCTION_CATEGORY.CUSTOM, module: 'Utils' });
     *
     * // 在单元格中使用
     * // =DOUBLE(A1)  → 返回 A1 单元格值的 2 倍
     * // =GET_CELL_VALUE(0, 1)  → 返回第 0 行第 1 列的值
     * ```
     *
     * @see {@link #unregister} 反向操作：注销函数
     * @see {@link #get} 获取已注册的函数
     * @see {@link #has} 检查函数是否存在
     */
    register(name, fn, options = {}) {
        if (typeof name !== "string" || name.trim() === "") {
            errorHandler.throw(ERROR_CODE.FORMULA_INVALID_FUNCTION_NAME, "函数名必须为非空字符串");
        }

        if (typeof fn !== "function") {
            errorHandler.throw(ERROR_CODE.FORMULA_INVALID_FUNCTION, "函数必须是 Function 类型");
        }

        const upperName = name.toUpperCase();

        if (this._functions.has(upperName)) {
            errorHandler.warn(ERROR_CODE.FORMULA_FUNCTION_OVERRIDE, `函数 ${upperName} 已存在，将被覆盖`, { functionName: upperName });
        }

        /**
         * 异常安全的函数包装器
         *
         * 捕获所有同步异常，防止自定义函数崩溃导致整个公式引擎停止工作。
         * 异常发生时返回 Excel 兼容的错误标识符 "#ERROR!"。
         *
         * @param {...*} args - 传递给原始函数的参数
         * @returns {*} 函数计算结果或 "#ERROR!" 错误标识符
         */
        const wrappedFn = function wrappedFn(...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                errorHandler.handle(ERROR_CODE.FORMULA_EVAL_ERROR, `函数 ${upperName} 执行失败`, {
                    functionName: upperName,
                    error: error.message,
                    stack: error.stack,
                });
                return "#ERROR!";
            }
        };

        this._functions.set(upperName, {
            implementation: wrappedFn,
            originalImplementation: fn,
            category: options.category || FUNCTION_CATEGORY.CUSTOM,
            module: options.module || "unknown",
            registeredAt: Date.now(),
        });
    }

    /**
     * 获取已注册的函数实现
     *
     * 返回的是经过异常包装的安全版本，不是原始实现。
     * 如果需要调试原始实现，请使用 {@link #getInfo}。
     *
     * @param {string} name - 函数名称（不区分大小写）
     * @returns {Function|undefined} 函数实现（可调用），未找到时返回 undefined
     *
     * @example
     * ```js
     * const sumFn = registry.get('SUM');
     * if (sumFn) {
     *     const result = sumFn([1, 2, 3, 4, 5]);  // 15
     *     console.log(result);
     * }
     *
     * const unknownFn = registry.get('NONEXISTENT');
     * console.log(unknownFn);  // undefined
     * ```
     *
     * @see {@link #has} 先检查再获取
     * @see {@link #getInfo} 获取详细信息（包含原始实现）
     */
    get(name) {
        const entry = this._functions.get(name.toUpperCase());
        return entry ? entry.implementation : undefined;
    }

    /**
     * 检查函数是否已注册
     *
     * @param {string} name - 函数名称（不区分大小写）
     * @returns {boolean} true 表示函数已存在，false 表示未找到
     *
     * @example
     * ```js
     * if (registry.has('VLOOKUP')) {
     *     const vlookup = registry.get('VLOOKUP');
     *     // 安全使用 vlookup...
     * }
     *
     * if (!registry.has('MY_CUSTOM_FUNC')) {
     *     registry.register('MY_CUSTOM_FUNC', (args) => args[0] * 100);
     * }
     * ```
     *
     * @see {@link #get} 获取函数
     * @see {@link #list} 列出所有已注册函数
     */
    has(name) {
        return this._functions.has(name.toUpperCase());
    }

    // ════════════════════════════════════════════
    // 公共 API：管理方法
    // ════════════════════════════════════════════

    /**
     * 注销（移除）已注册的函数
     *
     * 注意事项：
     * - 可以注销内置函数（但会发出警告）
     * - 注销后再次调用 get() 将返回 undefined
     * - 已使用该函数的公式单元格可能显示 #NAME? 错误
     *
     * @param {string} name - 要移除的函数名称（不区分大小写）
     * @returns {boolean} 成功移除返回 true，函数不存在返回 false
     *
     * @example
     * ```js
     * // 注销自定义函数
     * registry.unregister('MY_TEMP_FUNC');  // true
     *
     * // 尝试注销不存在的函数
     * registry.unregister('NOT_EXIST');  // false
     *
     * // 注销内置函数（会有警告日志）
     * registry.unregister('SUM');
     * // WARN: 尝试注销内置函数 SUM
     * // 返回 true（但仍会被移除）
     * ```
     *
     * @see {@link #register} 反向操作：注册函数
     * @see {@link #clear} 清除所有函数（慎用！）
     */
    unregister(name) {
        const upperName = name.toUpperCase();

        if (this._functions.has(upperName)) {
            const entry = this._functions.get(upperName);

            if (entry.category === FUNCTION_CATEGORY.BUILTIN) {
                errorHandler.warn(ERROR_CODE.FORMULA_FUNCTION_OVERRIDE, `尝试注销内置函数 ${upperName}`, { functionName: upperName });
            }

            return this._functions.delete(upperName);
        }

        return false;
    }

    /**
     * 获取所有已注册的函数名称列表
     *
     * 返回的列表是数组的浅拷贝，修改不影响原数据。
     * 名称全部为大写字母，按注册顺序排列。
     *
     * @returns {string[]} 函数名称数组（大写）
     *                 例：['SUM', 'AVERAGE', 'MAX', 'MIN', 'IF', 'MYFUNC']
     *
     * @example
     * ```js
     * const allFuncs = registry.list();
     * console.log(`共 ${allFuncs.length} 个函数`);
     * console.log(allFuncs.slice(0, 5));  // ['SUM', 'AVERAGE', 'MAX', 'MIN', 'ROUND']
     *
     * // 搜索特定前缀的函数
     * const countFuncs = allFuncs.filter(name => name.startsWith('COUNT'));
     * console.log(countFuncs);  // ['COUNT', 'COUNTA']
     * ```
     *
     * @see {@link #getStats} 获取统计信息（含分类计数）
     * @see {@link #has} 检查单个函数
     */
    list() {
        return [...this._functions.keys()];
    }

    // ════════════════════════════════════════════
    // 公共 API：查询方法
    // ════════════════════════════════════════════

    /**
     * 获取函数的详细信息（元数据）
     *
     * 返回的信息包括：
     * - 函数名称（标准化后的大写形式）
     * - 分类（builtin / custom）
     * - 所属模块（Math / Statistical / Logical / ...）
     * - 注册时间（ISO 8601 格式）
     * - 是否为内置函数
     *
     * 注意：此方法不返回函数实现本身，如需调用函数请使用 {@link #get}。
     *
     * @param {string} name - 函数名称（不区分大小写）
     * @returns {Object|undefined} 函数元数据对象，未找到时返回 undefined
     * @returns {string} returns.name - 函数名称（大写）
     * @returns {string} returns.category - 函数类别（FUNCTION_CATEGORY.BUILTIN 或 FUNCTION_CATEGORY.CUSTOM）
     * @returns {string} returns.module - 所属模块
     * @returns {string} returns.registeredAt - ISO 8601 时间戳
     * @returns {boolean} returns.isBuiltin - 是否为内置函数
     *
     * @example
     * ```js
     * const info = registry.getInfo('SUM');
     * console.log(info);
     * // {
     * //   name: 'SUM',
     * //   category: FUNCTION_CATEGORY.BUILTIN,
     * //   module: 'Math',
     * //   registeredAt: '2024-01-15T08:30:00.000Z',
     * //   isBuiltin: true
     * // }
     *
     * // 调试用途：查看原始实现
     * if (info) {
     *     const originalFn = registry._functions.get(info.name)?.originalImplementation;
     *     console.log(originalFn.toString());  // 输出函数源码
     * }
     * ```
     *
     * @see {@link #get} 获取可调用的函数实现
     * @see {@link #getStats} 获取全局统计
     */
    getInfo(name) {
        const entry = this._functions.get(name.toUpperCase());

        if (!entry) return undefined;

        return {
            name: name.toUpperCase(),
            category: entry.category,
            module: entry.module,
            registeredAt: new Date(entry.registeredAt).toISOString(),
            isBuiltin: entry.category === FUNCTION_CATEGORY.BUILTIN,
        };
    }

    /**
     * 获取注册表的统计摘要信息
     *
     * 提供全局视角的数据概览，用于：
     * - 调试和诊断问题
     * - 性能监控
     * - 功能展示（如"已加载 X 个内置函数 + Y 个自定义函数"）
     *
     * @returns {Object} 统计信息对象
     * @returns {number} returns.total - 总函数数量（builtin + custom）
     * @returns {number} returns.builtin - 内置函数数量
     * @returns {number} returns.custom - 自定义函数数量
     * @returns {string[]} returns.modules - 已使用的模块名称列表（去重）
     *
     * @example
     * ```js
     * const stats = registry.getStats();
     * console.log(`📊 函数注册表统计:`);
     * console.log(`   总计: ${stats.total} 个函数`);
     * console.log(`   内置: ${stats.builtin} 个`);
     * console.log(`   自定义: ${stats.custom} 个`);
     * console.log(`   模块: ${stats.modules.join(', ')}`);
     *
     * // 输出示例:
     * // 📊 函数注册表统计:
     * //    总计: 17 个函数
     * //    内置: 16 个
     * //    自定义: 1 个
     * //    模块: Math, Statistical, Logical, Text, Conditional, Lookup
     * ```
     *
     * @see {@link #list} 获取完整函数列表
     * @see {@link #getInfo} 获取单个函数详情
     */
    getStats() {
        let builtinCount = 0;
        let customCount = 0;

        for (const [, entry] of this._functions) {
            if (entry.category === FUNCTION_CATEGORY.BUILTIN) {
                builtinCount += 1;
            } else {
                customCount += 1;
            }
        }

        return {
            total: this._functions.size,
            builtin: builtinCount,
            custom: customCount,
            modules: [...new Set([...this._functions.values()].filter((e) => e.module !== "unknown").map((e) => e.module))],
        };
    }

    // ════════════════════════════════════════════
    // 公共 API：高级方法（可选实现）
    // ════════════════════════════════════════════

    /**
     * 清除所有已注册的函数（危险操作！）
     *
     * ⚠️ **警告**：此方法会清空整个注册表，包括所有内置函数！
     * 仅在特殊场景下使用（如单元测试、热重载等）。
     *
     * 清除后需要重新注册所有必要的函数才能正常使用公式引擎。
     *
     * @returns {void}
     *
     * @example
     * ```js
     * // ⚠️ 危险操作示例（仅在测试中使用）
     * registry.clear();
     * console.log(registry.list());  // []
     * console.log(registry.getStats());  // { total: 0, builtin: 0, custom: 0, modules: [] }
     *
     * // 需要手动重新注册或重建实例
     * registry.register('SUM', (args) => args.reduce((a, b) => a + b, 0));
     * ```
     *
     * @see {@link #unregister} 移除单个函数（更安全）
     * @see {@link #reset} 重置为初始状态（推荐替代方案）
     */
    clear() {
        this._functions.clear();
    }

    /**
     * 重置注册表到初始状态（清除所有自定义函数，保留内置函数）
     *
     * 比 {@link clear} 更安全，因为会重新加载内置函数模块。
     * 适用于需要"恢复出厂设置"的场景。
     *
     * @returns {void}
     *
     * @example
     * ```js
     * // 用户注册了一些临时函数
     * registry.register('TEMP_FUNC', () => 42);
     * registry.register('DEBUG_HELPER', () => 'debug');
     *
     * // 发现状态混乱，需要重置
     * registry.reset();
     *
     * // 现在：自定义函数已清除，内置函数完好
     * console.log(registry.has('TEMP_FUNC'));  // false
     * console.log(registry.has('SUM'));        // true ✅
     * ```
     *
     * @see {@link #clear} 完全清空（更激进）
     * @see {@link #unregister} 移除单个函数（更精确）
     */
    reset() {
        this.clear();
        this._registerModule("Math", mathFunctions);
        this._registerModule("Statistical", statisticalFunctions);
        this._registerModule("Logical", logicalFunctions);
        this._registerModule("Text", textFunctions);
        this._registerModule("Conditional", conditionalFunctions);
        this._registerModule("Lookup", lookupFunctions);
    }
}

// ════════════════════════════════════════════
// 导出单例实例（唯一公共 API 入口）
// ════════════════════════════════════════════

/**
 * 全局函数注册表单例实例
 *
 * 这是本模块唯一的导出对象，所有公式函数的操作都通过它进行。
 * 采用单例模式确保全局状态一致性。
 *
 * ## 🎯 推荐使用方式
 *
 * ### 方式一：从公共 API 导入（推荐用于外部使用者）
 * ```js
 * import { functionRegistry } from '@canvas-sheet/core';
 *
 * functionRegistry.register('MYFUNC', (args) => args[0] * 2);
 * const result = functionRegistry.get('MYFUNC')([21]);  // 42
 * ```
 *
 * ### 方式二：从模块内部导入（推荐用于内部开发者）
 * ```js
 * import { registry } from '@/formula/functions/index.js';
 *
 * registry.register('MYFUNCTION', (args, ctx) => {
 *     return args[0] * 2;  // 简单的乘法示例
 * });
 *
 * // 调用函数（通常由公式引擎内部调用）
 * const result = registry.get('MYFUNCTION')([21]);  // 42
 *
 * // 查询信息
 * console.log(registry.has('MYFUNCTION'));  // true
 * console.log(registry.list());              // ['SUM', ..., 'MYFUNCTION']
 * console.log(registry.getStats());          // { total: 17, builtin: 16, custom: 1 }
 * ```
 *
 * ### ⚠️ 重要提示：命名差异说明
 *
 * - **内部变量名**：`registry` (模块私有，用于代码实现)
 * - **公共导出名**：`functionRegistry` (遵循 camelCase 规范，表示这是一个实例而非类)
 * - **不要尝试**：`new functionRegistry()` 或 `new FunctionRegistry()` (❌ 它是实例，不是类！)
 *
 * ## 📌 快速参考卡
 *
 * | 方法 | 用途 | 示例 |
 * |------|------|------|
 * | `register()` | 注册新函数 | `functionRegistry.register('FN', impl)` |
 * | `unregister()` | 注销函数 | `functionRegistry.unregister('FN')` |
 * | `get()` | 获取函数 | `functionRegistry.get('SUM')([1,2,3])` |
 * | `has()` | 检查存在性 | `functionRegistry.has('SUM')` |
 * | `list()` | 列出所有函数 | `functionRegistry.list()` |
 * | `getInfo()` | 函数详情 | `functionRegistry.getInfo('SUM')` |
 * | `getStats()` | 统计信息 | `functionRegistry.getStats()` |
 * | `clear()` | 清空全部 | `functionRegistry.clear()` (⚠️ 危险) |
 * | `reset()` | 重置为默认 | `functionRegistry.reset()` |
 *
 * @type {FunctionRegistry}
 * @global
 * @example
 * ```js
 * // 完整使用流程示例（公共 API 方式）
 * import { functionRegistry, FUNCTION_CATEGORY } from '@canvas-sheet/core';
 *
 * // 步骤 1: 检查函数是否已存在
 * if (!functionRegistry.has('TAX_CALC')) {
 *     // 步骤 2: 注册自定义税务计算函数
 *     registry.register('TAX_CALC', (args, ctx) => {
 *         const amount = args[0];
 *         const rate = args[1] ?? 0.13;  // 默认税率 13%
 *         return amount * rate;
 *     });
 *
 *     console.log('✅ TAX_CALC 函数注册成功');
 * }
 *
 * // 步骤 3: 使用函数
 * const tax = registry.get('TAX_CALC')([10000]);  // 1300
 * console.log(`税费: ${tax}`);
 *
 * // 步骤 4: 查看统计
 * console.log(registry.getStats());
 * // { total: 17, builtin: 16, custom: 1, modules: [...] }
 * ```
 */
export const registry = new FunctionRegistry();
