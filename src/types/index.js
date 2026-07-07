/**
 * @license Apache-2.0
 *
 * Copyright 2026 jiangsuiting <1158973435@qq.com>
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
 * 列类型管理系统（Column Type Management System）
 *
 * @module types/index
 * @description
 *
 * ## 📋 模块概述
 *
 * 本模块是 Canvas Spreadsheet 的**数据类型核心引擎**，负责：
 * 1. **类型注册与发现**：管理所有可用的列数据类型（文本、数字、日期等）
 * 2. **类型实例化**：根据配置创建和管理类型实例
 * 3. **数据处理管道**：提供格式化、解析、验证等数据转换功能
 * 4. **扩展机制**：支持自定义类型的动态注册
 *
 * ## 🏗️ 架构设计
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    types/index.js (本文件)                    │
 * │                                                             │
 * │  ┌─────────────────────────────────────────────────────┐   │
 * │  │              TypeRegistry (单例注册表)                │   │
 * │  │                                                      │   │
 * │  │  内置类型 (Built-in Types):                           │   │
 * │  │  ├── text      → TextColumnType     文本类型          │   │
 * │  │  ├── numeric   → NumericColumnType  数字类型          │   │
 * │  │  ├── date      → DateColumnType     日期类型          │   │
 * │  │  ├── boolean   → BooleanColumnType  布尔类型          │   │
 * │  │  ├── select    → SelectColumnType   下拉选择          │   │
 * │  │  ├── textarea  → TextareaColumnType 多行文本         │   │
 * │  │  │                                                    │   │
 * │  │  渲染器类型 (Renderer Types):                          │   │
 * │  │  ├── checkbox     → BooleanCheckboxType 复选框        │   │
 * │  │  ├── progressBar  → ProgressBarType    进度条         │   │
 * │  │  ├── starRating   → StarRatingType     星级评分       │   │
 * │  │  ├── sparkline    → SparklineType      迷你图         │   │
 * │  │  └── colorPreview → ColorPreviewType   颜色预览       │   │
 * │  │                                                    │   │
 * │  │  自定义类型 (Custom Types):                          │   │
 * │  │  └── [用户通过 API 注册]                              │   │
 * │  └─────────────────────────────────────────────────────┘   │
 * │                                                             │
 * │  公共 API 函数:                                              │
 * │  ├─ 注册: registerColumnTypeClass(), registerColumnTypeInstance()
 * │  ├─ 查询: getColumnTypeInstance(), hasColumnType()
 * │  ├─ 管理: unregisterColumnType(), listRegisteredColumnTypes()
 * │  ├─ 数据处理: formatCellValue(), parseCellValue(), validateCellValue()
 * │  └─ 配置解析: resolveCellTypeFromConfig()
 * ├─────────────────────────────────────────────────────────────┤
 * │  类型实现类:                                                  │
 * │  ├── BaseColumnType.js       (基类)                         │
 * │  ├── TextColumnType.js       (文本)                         │
 * │  ├── NumericColumnType.js    (数字)                         │
 * │  ├── DateColumnType.js       (日期)                         │
 * │  ├── BooleanColumnType.js    (布尔)                         │
 * │  ├── SelectColumnType.js     (选择)                         │
 * │  ├── TextareaColumnType.js   (多行文本)                     │
 * │  └── renderers/             (渲染器类型)                    │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## 💡 使用示例
 *
 * ### 基础用法：获取和使用类型实例
 * ```javascript
 * import { getColumnTypeInstance } from '@/types/index.js';
 *
 * // 获取文本类型实例
 * const textType = getColumnTypeInstance('text');
 *
 * // 格式化值
 * const formatted = textType.format(12345);  // "12345"
 *
 * // 解析输入
 * const parsed = textType.parse("Hello");    // "Hello"
 *
 * // 验证值
 * const isValid = textType.validate("test"); // true
 * ```
 *
 * ### 高级用法：注册自定义类型
 * ```javascript
 * import {
 *     registerColumnTypeClass,
 *     BaseColumnType
 * } from '@/types/index.js';
 *
 * class EmailType extends BaseColumnType {
 *     get name() { return 'email'; }
 *     get editorType() { return 'text'; }
 *
 *     validate(value) {
 *         if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
 *             return '请输入有效的邮箱地址';
 *         }
 *         return true;
 *     }
 *
 *     format(value) {
 *         return value ? value.toLowerCase() : '';
 *     }
 * }
 *
 * registerColumnTypeClass('email', EmailType);
 * ```
 *
 * ### 完整的数据处理流程
 * ```javascript
 * import {
 *     resolveCellTypeFromConfig,
 *     formatCellValue,
 *     parseCellValue,
 *     validateCellValue
 * } from '@/types/index.js';
 *
 * // 根据单元格位置和配置确定类型
 * const cellType = resolveCellTypeFromConfig(row, col, cellTypesMap, columnsConfig);
 *
 * // 用户输入 → 解析 → 验证 → 存储
 * const userInput = document.getElementById('cell-input').value;
 * const parsedValue = parseCellValue(cellType, userInput);
 * const validationResult = validateCellValue(cellType, parsedValue, columnConfig);
 *
 * if (validationResult === true) {
 *     cellStore.setValue(row, col, parsedValue);
 * } else {
 *     showError(validationResult);  // 显示错误信息
 * }
 *
 * // 存储的值 → 格式化 → 显示
 * const displayValue = formatCellValue(cellType, cellStore.getValue(row, col));
 * renderer.renderText(displayValue);
 * ```
 *
 * ## ⚙️ 设计原则
 *
 * 1. **单一职责**: 每个类型只负责一种数据的处理逻辑
 * 2. **开放封闭**: 通过继承 BaseColumnType 扩展新类型
 * 3. **依赖倒置**: 依赖抽象接口而非具体实现
 * 4. **里氏替换**: 子类可以完全替代父类使用
 *
 * @author Canvas Spreadsheet Team
 * @version 2.0.0
 * @see {@link module:types/BaseColumnType} 基础类型类
 * @see {@link module:types/renderers/index} 渲染器类型注册表
 */

// ════════════════════════════════════════════
// 导入基础列类型实现
// ════════════════════════════════════════════

/**
 * 文本列类型（Text Column Type）
 *
 * 最基础的通用文本类型，支持任意字符串输入。
 *
 * 特性：
 * - 无格式限制，接受任意字符
 * - 自动去除首尾空白（可选）
 * - 支持最大长度限制
 * - 默认回退类型（fallback type）
 *
 * 适用场景：姓名、地址、描述、备注等自由文本字段
 *
 * @class TextColumnType
 * @extends BaseColumnType
 */
import { TextColumnType } from "./TextColumnType.js";

/**
 * 数字列类型（Numeric Column Type）
 *
 * 用于数值型数据的输入、显示和验证。
 *
 * 特性：
 * - 🔢 支持整数和小数
 * - 📊 千分位分隔符显示（可选）
 * - 🎯 最小/最大值范围限制
 * - 🔣 自定义数字格式化模板
 * - ✅ 数值有效性验证
 *
 * 适用场景：金额、数量、百分比、温度、坐标等数值字段
 *
 * @class NumericColumnType
 * @extends BaseColumnType
 */
import { NumericColumnType } from "./NumericColumnType.js";

/**
 * 日期列类型（Date Column Type）
 *
 * 用于日期和时间数据的处理。
 *
 * 特性：
 * - 📅 支持多种日期格式（YYYY-MM-DD, MM/DD/YYYY 等）
 * - 🕐 可选时间部分支持
 * - 🌍 本地化日期显示
 * - ✅ 日期有效性验证（如 2023-02-30 无效）
 * - 🔄 ISO 8601 标准输出
 *
 * 适用场景：出生日期、截止时间、创建时间、计划日期等
 *
 * @class DateColumnType
 * @extends BaseColumnType
 */
import { DateColumnType } from "./DateColumnType.js";

/**
 * 布尔列类型（Boolean Column Type）
 *
 * 用于布尔值（true/false）的处理。
 *
 * 特性：
 * - ☑️ 支持 true/false / 1/0 / 是/否 等多种表示
 * - 🎨 可视化为复选框（配合 BooleanCheckboxType）
 * - ✅ 严格的布尔转换规则
 * - 🔄 统一的存储格式（boolean 类型）
 *
 * 适用场景：开关状态、是否确认、权限标记、激活状态等
 *
 * @class BooleanColumnType
 * @extends BaseColumnType
 */
import { BooleanColumnType } from "./BooleanColumnType.js";

/**
 * 选择列类型（Select Column Type）
 *
 * 用于从预定义选项列表中选择值的场景。
 *
 * 特性：
 * - 📋 下拉选择框 UI
 * - 🔍 输入时自动过滤选项
 * - ✅ 只接受预定义的有效值
 * - 🏷️ 支持标签/值分离（display/value）
 * - ➕ 允许添加新选项（可选）
 *
 * 适用场景：状态、类别、优先级、部门、性别等枚举字段
 *
 * @class SelectColumnType
 * @extends BaseColumnType
 */
import { SelectColumnType } from "./SelectColumnType.js";

/**
 * 多行文本列类型（Textarea Column Type）
 *
 * 用于长文本或多行内容的编辑。
 *
 * 特性：
 * - 📝 支持多行输入（自动换行）
 * - 📏 最大长度限制（字符数）
 * - 📄 行数统计
 * - 🔤 可选的自动调整高度
 * - 🚫 可禁用某些特殊字符
 *
 * 适用场景：评论、描述、日志、富文本内容等大段文字
 *
 * @class TextareaColumnType
 * @extends BaseColumnType
 */
import { TextareaColumnType } from "./TextareaColumnType.js";

// ════════════════════════════════════════════
// 导入渲染器类型注册表
// ════════════════════════════════════════════

/**
 * 内置渲染器类型注册表
 *
 * 包含所有可视化渲染器类型（复选框、进度条、星级评分等）。
 *
 * @constant {Object} BUILTIN_RENDERER_TYPE_REGISTRY
 * @see {@link module:types/renderers/index} 详细文档
 */
import { BUILTIN_RENDERER_TYPE_REGISTRY } from "./renderers/index.js";

// ════════════════════════════════════════════
// 导入工具依赖
// ════════════════════════════════════════════

import { isFunction } from "@/utils/utils";
import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler";

// ════════════════════════════════════════════
// 核心类：类型注册表（Type Registry）
// ════════════════════════════════════════════

/**
 * 列类型注册表（Column Type Registry）
 *
 * 采用**单例模式**的全局类型管理中心，负责：
 * - 维护所有可用类型的映射关系
 * - 管理类型的生命周期（注册、查询、注销）
 * - 提供线程安全的实例缓存机制
 *
 * ## 🎯 设计特点
 *
 * 1. **懒加载初始化**：首次调用时才创建实例并加载内置类型
 * 2. **双重存储**：同时保存构造器和默认实例，优化性能
 * 3. **安全覆盖**：允许重复注册但会发出警告
 * 4. **优雅降级**：类型不存在时返回文本类型作为 fallback
 *
 * ## 📌 数据结构
 *
 * ```javascript
 * registry = Map<string, TypeEntry>
 *
 * TypeEntry = {
 *     instance: BaseColumnType | null,    // 默认实例（可能为 null）
 *     constructor: Function               // 类构造器（始终存在）
 * }
 * ```
 *
 * @class TypeRegistry
 * @example
 * ```js
 * // 内部使用（通常不直接操作此类）
 * const registry = TypeRegistry.getInstance();
 * registry.register('myType', MyTypeClass);
 * const instance = registry.get('myType');
 * ```
 */
class TypeRegistry {
    /**
     * 单例实例引用（私有静态字段）
     * @static
     * @private
     * @type {TypeRegistry|null}
     */
    static #instance = null;

    /**
     * 类型映射表（私有实例字段）
     * @private
     * @type {Map<string, {instance: BaseColumnType|null, constructor: Function}>}
     */
    #registry = new Map();

    /**
     * 构造函数（私有化，强制使用 getInstance()）
     *
     * 实现单例模式的典型方式：
     * - 如果实例已存在，直接返回已有实例
     * - 否则创建新实例并初始化内置类型
     *
     * @constructor
     * @throws {Error} 不应被外部直接调用（通过 getInstance() 访问）
     */
    constructor() {
        if (TypeRegistry.#instance) {
            return TypeRegistry.#instance;
        }
        TypeRegistry.#instance = this;
        this.#initializeBuiltinTypes();
    }

    /**
     * 获取单例实例（Get Singleton Instance）
     *
     * 全局唯一的访问入口，确保整个应用只有一个注册表实例。
     *
     * @static
     * @returns {TypeRegistry} 全局唯一的注册表实例
     *
     * @example
     * ```js
     * const registry = TypeRegistry.getInstance();
     * console.log(registry.size);  // 当前已注册类型数量
     * ```
     */
    static getInstance() {
        if (!TypeRegistry.#instance) {
            TypeRegistry.#instance = new TypeRegistry();
        }
        return TypeRegistry.#instance;
    }

    /**
     * 初始化内置类型（Initialize Built-in Types）
     *
     * 在首次创建实例时自动调用，注册所有系统预定义的类型。
     * 包括基础数据类型和可视化渲染器类型。
     *
     * @private
     */
    #initializeBuiltinTypes() {
        /**
         * 内置类型定义集合
         * @type {Object.<string, Function>}
         */
        const builtinTypeDefinitions = {
            // 基础数据类型（6 种）
            text: TextColumnType,
            numeric: NumericColumnType,
            date: DateColumnType,
            boolean: BooleanColumnType,
            select: SelectColumnType,
            textarea: TextareaColumnType,

            // 可视化渲染器类型（5 种，从渲染器注册表展开）
            ...BUILTIN_RENDERER_TYPE_REGISTRY,
        };

        for (const [typeName, TypeConstructor] of Object.entries(builtinTypeDefinitions)) {
            this.#registry.set(typeName, {
                instance: new TypeConstructor(),
                constructor: TypeConstructor,
            });
        }

        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✅ 已加载 ${this.#registry.size} 个内置类型`, Array.from(this.#registry.keys()));
    }

    /**
     * 注册新的列类型类（Register Column Type Class）
     *
     * 通过类的构造器注册新类型。这是最常用的注册方式，
     * 适用于大多数自定义类型开发场景。
     *
     * @param {string} typeName - 类型标识符（唯一名称，建议小写+驼峰）
     *                            例：'email', 'phoneNumber', 'currency'
     * @param {Function} TypeClass - 类型类（必须继承自 BaseColumnType 或具有相同接口）
     * @param {Object} [options={}] - 创建默认实例时的配置选项
     * @returns {boolean} 注册成功返回 true，失败返回 false
     *
     * @example
     * ```js
     * // 定义自定义类型
     * class PhoneNumberType extends BaseColumnType {
     *     get name() { return 'phoneNumber'; }
     *     get editorType() { return 'text'; }
     *
     *     validate(value) {
     *         if (!/^1[3-9]\d{9}$/.test(value)) {
     *             return '请输入有效的手机号码';
     *         }
     *         return true;
     *     }
     * }
     *
     * // 注册到系统
     * const success = registry.register('phoneNumber', PhoneNumberType, {
     *     maxLength: 11
     * });
     * console.log(success);  // true
     * ```
     *
     * @fires warn 当参数无效或类型已存在时
     */
    register(typeName, TypeClass, options = {}) {
        if (!typeName || typeof typeName !== "string" || !typeName.trim()) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_NAME, "类型名称必须是非空字符串");
            return false;
        }

        if (typeof TypeClass !== "function" || TypeClass.prototype === undefined) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_CLASS, "类型必须是构造函数（类或带有 prototype 的函数）");
            return false;
        }

        if (this.#registry.has(typeName)) {
            errorHandler.warn(ERROR_CODE.TYPE_DUPLICATE, `类型 "${typeName}" 已注册，将被覆盖（overwrite）`);
        }

        let defaultInstance = null;
        try {
            defaultInstance = new TypeClass(options);
        } catch (error) {
            errorHandler.warn(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `无法为类型 "${typeName}" 创建默认实例`, { originalError: error });
        }

        this.#registry.set(typeName, {
            instance: defaultInstance,
            constructor: TypeClass,
        });

        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✓ 已注册类型: ${typeName}`);
        return true;
    }

    /**
     * 注册列类型实例（Register Column Type Instance）
     *
     * 直接注册一个已经创建好的类型实例。
     * 适用于需要共享复杂配置的场景，或从外部导入预配置的实例。
     *
     * @param {BaseColumnType} typeInstance - 类型实例对象（必须具有 name 属性）
     * @returns {boolean} 注册成功返回 true，失败返回 false
     *
     * @example
     * ```js
     * // 创建并配置一个复杂的数字类型实例
     * const currencyType = new NumericColumnType({
     *     numericFormat: '$#,##0.00',
     *     min: 0,
     *     max: 1000000
     * });
     *
     * // 直接注册实例
     * registry.registerInstance(currencyType);
     *
     * // 后续使用时会复用同一个实例（带配置）
     * const instance = registry.get('numeric');  // 返回 currencyType
     * ```
     */
    registerInstance(typeInstance) {
        if (!typeInstance || !typeInstance.name) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_INSTANCE, "无效的类型实例，跳过注册");
            return false;
        }

        this.#registry.set(typeInstance.name, {
            instance: typeInstance,
            constructor: typeInstance.constructor,
        });

        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✓ 已注册类型实例: ${typeInstance.name}`);
        return true;
    }

    /**
     * 获取列类型实例（Get Column Type Instance）
     *
     * 根据类型名称获取对应的类型实例。支持两种模式：
     *
     * 1. **无配置模式**（推荐）：返回缓存的默认实例（性能最优）
     * 2. **有配置模式**：根据配置创建新实例（灵活但稍慢）
     *
     * ### Fallback 机制
     * 如果请求的类型不存在，会自动降级返回 **text** 类型实例，
     * 确保系统不会因类型缺失而崩溃。
     *
     * @param {string} typeName - 类型名称
     * @param {Object} [options=undefined] - 可选的配置项（传入则创建新实例）
     * @returns {BaseColumnType|null} 类型实例，失败时返回 null
     *
     * @example
     * ```js
     * // 模式1：获取默认实例（高性能）
     * const textType = registry.get('text');
     * console.log(textType.format('hello'));  // "hello"
     *
     * // 模式2：带配置创建新实例
     * const numberType = registry.get('numeric', {
     *     numericFormat: '0.00%',
     *     min: 0,
     *     max: 100
     * });
     * console.log(numberType.format(0.756));  // "75.60%"
     *
     * // 不存在的类型（自动 fallback 到 text）
     * const unknownType = registry.get('nonexistent');
     * console.log(unknownType.name);  // "text"
     * ```
     */
    get(typeName, options = undefined) {
        const typeEntry = this.#registry.get(typeName);

        if (!typeEntry) {
            errorHandler.warn(ERROR_CODE.TYPE_NOT_REGISTERED, `类型 "${typeName}" 未注册，将使用文本类型作为后备（fallback）`);

            const fallbackEntry = this.#registry.get("text");
            return fallbackEntry ? fallbackEntry.instance : null;
        }

        if (!options) {
            if (typeEntry.instance) return typeEntry.instance;

            try {
                typeEntry.instance = new typeEntry.constructor();
            } catch (error) {
                errorHandler.handle(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `无法实例化类型 "${typeName}"`, { originalError: error });
                return null;
            }
            return typeEntry.instance;
        }

        try {
            return new typeEntry.constructor(options);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `无法使用配置实例化类型 "${typeName}"`, { originalError: error });
            return null;
        }
    }

    /**
     * 检查类型是否已注册（Check if Type is Registered）
     *
     * 快速判断某个类型名称是否存在于注册表中。
     *
     * @param {string} typeName - 要检查的类型名称
     * @returns {boolean} 存在返回 true，否则返回 false
     *
     * @example
     * ```js
     * if (registry.has('customEmail')) {
     *     console.log('自定义邮箱类型已就绪');
     * } else {
     *     console.log('需要先注册 customEmail 类型');
     * }
     * ```
     */
    has(typeName) {
        return this.#registry.has(typeName);
    }

    /**
     * 注销列类型（Unregister Column Type）
     *
     * 从注册表中移除指定类型。
     * ⚠️ 注意：注销后如果再获取该类型会触发 fallback 机制。
     *
     * @param {string} typeName - 要移除的类型名称
     * @returns {boolean} 成功删除返回 true，类型不存在返回 false
     *
     * @example
     * ```js
     * // 移除自定义类型
     * if (registry.unregister('deprecatedType')) {
     *     console.log('已成功移除废弃的类型');
     * }
     * ```
     */
    unregister(typeName) {
        const removed = this.#registry.delete(typeName);
        if (removed) {
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✗ 已注销类型: ${typeName}`);
        }
        return removed;
    }

    /**
     * 列出所有已注册的类型名称（List All Registered Type Names）
     *
     * 返回当前注册表中所有类型的名称数组。
     * 可用于调试、UI 展示或文档生成。
     *
     * @returns {string[]} 类型名称数组
     *
     * @example
     * ```js
     * const allTypes = registry.list();
     * console.log(`当前共有 ${allTypes.length} 个类型:`);
     * console.log(allTypes.join(', '));
     * // 输出: "text, numeric, date, boolean, select, textarea, checkbox, progressBar, ..."
     * ```
     */
    list() {
        return Array.from(this.#registry.keys());
    }

    /**
     * 清空所有类型（Clear All Types）
     *
     * 危险操作！会移除包括内置类型在内的所有注册项。
     * 通常仅在测试或重置场景中使用。
     *
     * @example
     * ```js
     * // ⚠️ 谨慎使用
     * registry.clear();
     * console.log(registry.size);  // 0
     * // 所有类型都不可用了（包括 text、numeric 等）
     * ```
     */
    clear() {
        const previousSize = this.#registry.size;
        this.#registry.clear();

        if (previousSize > 0) {
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] 🗑️ 已清空 ${previousSize} 个类型`);
        }
    }

    /**
     * 重置为初始状态（Reset to Initial State）
     *
     * 清空后重新加载所有内置类型，恢复到刚创建时的状态。
     * 适用于测试环境清理或运行时重置。
     *
     * @example
     * ```js
     * // 先注册了一些自定义类型...
     * registry.register('custom1', CustomType1);
     * registry.register('custom2', CustomType2);
     *
     * console.log(registry.size);  // 13 (11 内置 + 2 自定义)
     *
     * // 重置（清除所有自定义类型，恢复内置类型）
     * registry.reset();
     * console.log(registry.size);  // 11 (只有内置类型)
     * ```
     */
    reset() {
        this.#registry.clear();
        this.#initializeBuiltinTypes();
    }

    /**
     * 获取已注册类型的总数（Get Total Count of Registered Types）
     *
     * @returns {number} 当前注册表中的类型数量
     *
     * @example
     * ```js
     * console.log(`系统提供 ${registry.size} 种数据类型`);
     * // 输出: "系统提供 11 种数据类型"
     * ```
     */
    get size() {
        return this.#registry.size;
    }
}

// ════════════════════════════════════════════
// 创建全局单例实例
// ════════════════════════════════════════════

/**
 * 全局类型注册表单例实例（Global Type Registry Singleton Instance）
 *
 * 这是整个类型系统的核心入口点。所有公共 API 函数都是对
 * 这个实例的方法调用封装。
 *
 * @constant {TypeRegistry}
 * @private
 */
const globalTypeRegistry = TypeRegistry.getInstance();

// ════════════════════════════════════════════
// 导出核心类（供高级用途）
// ════════════════════════════════════════════

export { TypeRegistry };

// ════════════════════════════════════════════
// 公共 API 函数：类型注册与管理
// ════════════════════════════════════════════

/**
 * 获取列类型实例（Get Column Type Instance）
 *
 * 从全局注册表中获取指定类型的实例。这是最常用的 API，
 * 用于在工作簿中实际使用某种数据类型。
 *
 * ## 📌 使用时机
 * - 需要对特定类型的值进行格式化、解析、验证时
 * - 动态创建基于类型的 UI 组件时
 * - 编写自定义渲染器或编辑器时
 *
 * @param {string} typeName - 类型名称（不区分大小写，但建议使用标准名称）
 *                            标准名称：'text', 'numeric', 'date', 'boolean',
 *                                      'select', 'textarea', 'checkbox',
 *                                      'progressBar', 'starRating', 'sparkline',
 *                                      'colorPreview'
 * @param {Object} [options=undefined] - 可选的类型配置（传入则创建新实例）
 * @returns {BaseColumnType|null} 类型实例，失败返回 null
 *
 * @example
 * ```js
 * import { getColumnTypeInstance } from '@canvas-sheet/core';
 *
 * // 获取文本类型（最常用）
 * const textType = getColumnTypeInstance('text');
 * const formatted = textType.format(userInput);
 *
 * // 获取带配置的数字类型
 * const percentType = getColumnTypeInstance('numeric', {
 *     numericFormat: '0.00%',
 *     min: 0,
 *     max: 100
 * });
 *
 * // 不存在的类型（自动 fallback 到 text）
 * const unknown = getColumnTypeInstance('nonExistent');
 * console.log(unknown.name);  // "text"
 * ```
 *
 * @see {@link hasColumnType} 先检查是否存在
 * @see {@link listRegisteredColumnTypes} 查看所有可用类型
 */
export function getColumnTypeInstance(typeName, options = undefined) {
    return globalTypeRegistry.get(typeName, options);
}

/**
 * 检查列类型是否已注册（Check if Column Type Exists）
 *
 * 在尝试获取类型之前，先检查其是否有效。
 * 特别适合用于用户输入验证或条件判断场景。
 *
 * @param {string} typeName - 要检查的类型名称
 * @returns {boolean} 存在返回 true，否则返回 false
 *
 * @example
 * ```js
 * import { hasColumnType, getColumnTypeInstance } from '@canvas-sheet/core';
 *
 * function safeGetType(name) {
 *     if (!hasColumnType(name)) {
 *         throw new Error(`未知类型: ${name}`);
 *     }
 *     return getColumnTypeInstance(name);
 * }
 *
 * // 条件判断
 * if (hasColumnType('starRating')) {
 *     enableStarRatingFeature();
 * }
 * ```
 *
 * @see {@link getColumnTypeInstance} 获取实例
 * @see {@link listRegisteredColumnTypes} 列出所有名称
 */
export function hasColumnType(typeName) {
    return globalTypeRegistry.has(typeName);
}

/**
 * 注册列类型类（Register Column Type Class）
 *
 * 通过类的构造器向系统注册新的数据类型。
 * 这是最推荐的注册方式，适用于绝大多数自定义类型开发。
 *
 * @param {string} typeName - 类型标识符（必须唯一，建议使用 camelCase）
 * @param {Function} TypeClass - 类型类（需继承 BaseColumnType）
 * @param {Object} [options={}] - 默认实例的配置选项
 * @returns {boolean} 注册成功返回 true，失败返回 false
 *
 * @example
 * ```js
 * import { registerColumnTypeClass, BaseColumnType } from '@canvas-sheet/core';
 *
 * class UrlType extends BaseColumnType {
 *     get name() { return 'url'; }
 *     get editorType() { return 'text'; }
 *
 *     validate(value) {
 *         if (!/^https?:\/\//.test(value)) {
 *             return '请输入有效的 URL（以 http:// 或 https:// 开头）';
 *         }
 *         return true;
 *     }
 *
 *     format(value) {
 *         return value;  // URL 保持原样
 *     }
 * }
 *
 * // 注册到系统
 * const success = registerColumnTypeClass('url', UrlType, {
 *     maxLength: 2048
 * });
 *
 * if (success) {
 *     console.log('URL 类型注册成功！');
 *     // 现在可以在列定义中使用 type: 'url'
 * }
 * ```
 *
 * @see {@link registerColumnTypeInstance} 注册实例版本
 * @see {@link unregisterColumnType} 注销类型
 */
export function registerColumnTypeClass(typeName, TypeClass, options = {}) {
    return globalTypeRegistry.register(typeName, TypeClass, options);
}

/**
 * 注册列类型实例（Register Column Type Instance）
 *
 * 直接注册一个已创建好的类型实例。
 * 适用于需要共享复杂配置或从外部导入预配置实例的场景。
 *
 * @param {BaseColumnType} typeInstance - 类型实例（必须有 name 属性）
 * @returns {boolean} 注册成功返回 true，失败返回 false
 *
 * @example
 * ```js
 * import { registerColumnTypeInstance, NumericColumnType } from '@canvas-sheet/core';
 *
 * // 创建一个预配置的货币类型实例
 * const usdCurrencyType = new NumericColumnType({
 *     numericFormat: '$#,##0.00',
 *     min: 0,
 *     decimalPlaces: 2
 * });
 *
 * // 注册实例（后续获取时复用此配置）
 * registerColumnTypeInstance(usdCurrencyType);
 *
 * // 使用时自动获得相同的配置
 * const currencyInstance = getColumnTypeInstance('numeric');
 * console.log(currencyInstance.format(1234.5));  // "$1,234.50"
 * ```
 *
 * @see {@link registerColumnTypeClass} 注册类版本
 */
export function registerColumnTypeInstance(typeInstance) {
    return globalTypeRegistry.registerInstance(typeInstance);
}

/**
 * 注销列类型（Unregister Column Type）
 *
 * 从系统中永久移除指定的类型。⚠️ 此操作不可逆！
 *
 * @param {string} typeName - 要移除的类型名称
 * @returns {boolean} 成功移除返回 true，类型不存在返回 false
 *
 * @example
 * ```js
 * import { unregisterColumnType } from '@canvas-sheet/core';
 *
 * // 移除不再需要的自定义类型
 * if (unregisterColumnType('legacyCustomType')) {
 *     console.log('旧版自定义类型已移除');
 * }
 * ```
 *
 * @see {@link registerColumnTypeClass} 注册类型
 * @see {@link resetToBuiltinTypes} 重置所有类型
 */
export function unregisterColumnType(typeName) {
    return globalTypeRegistry.unregister(typeName);
}

/**
 * 列出所有已注册的列类型名称（List All Registered Column Type Names）
 *
 * 返回当前系统中所有可用类型的名称数组。
 * 适用于 UI 下拉框填充、文档生成、调试诊断等场景。
 *
 * @returns {string[]} 类型名称数组（按注册顺序）
 *
 * @example
 * ```js
 * import { listRegisteredColumnTypes } from '@canvas-sheet/core';
 *
 * // 填充类型选择下拉框
 * const typeSelector = document.getElementById('column-type-selector');
 * listRegisteredColumnTypes().forEach(typeName => {
 *     const option = document.createElement('option');
 *     option.value = typeName;
 *     option.textContent = formatTypeName(typeName);  // 'starRating' -> '星级评分'
 *     typeSelector.appendChild(option);
 * });
 *
 * // 调试输出
 * console.log(`系统提供 ${listRegisteredColumnTypes().length} 种类型`);
 * ```
 *
 * @see {@link hasColumnType} 检查单个类型
 * @see {@link getRegisteredTypeCount} 获取数量
 */
export function listRegisteredColumnTypes() {
    return globalTypeRegistry.list();
}

/**
 * 清空所有列类型（Clear All Column Types）
 *
 * 危险操作！会移除包括内置类型在内的所有注册项。
 * 仅用于测试环境或特殊重置场景。
 *
 * @example
 * ```js
 * import { clearAllColumnTypes } from '@canvas-sheet/core';
 *
 * // ⚠️ 测试前清空
 * beforeAll(() => {
 *     clearAllColumnTypes();
 * });
 *
 * // 清空后需要重新注册才能使用
 * clearAllColumnTypes();
 * registerColumnTypeClass('text', TextColumnType);  // 必须重新注册
 * ```
 *
 * @see {@link resetToBuiltinTypes} 更安全的重置方式
 */
export function clearAllColumnTypes() {
    globalTypeRegistry.clear();
}

/**
 * 重置为内置列类型（Reset to Built-in Column Types）
 *
 * 清空所有类型（包括自定义类型），然后重新加载系统内置类型。
 * 这是比 `clearAllColumnTypes` 更安全的重置方式。
 *
 * @example
 * ```js
 * import { resetToBuiltinTypes } from '@canvas-sheet/core';
 *
 * // 重置到初始状态（清除所有自定义类型）
 * resetToBuiltinTypes();
 * console.log(getRegisteredTypeCount());  // 11 (只有内置类型)
 * ```
 *
 * @see {@link clearAllColumnTypes} 彻底清空
 */
export function resetToBuiltinTypes() {
    globalTypeRegistry.reset();
}

/**
 * 获取已注册列类型的总数（Get Registered Column Type Count）
 *
 * @returns {number} 当前注册表中的类型数量（含内置 + 自定义）
 *
 * @example
 * ```js
 * import { getRegisteredTypeCount } from '@canvas-sheet/core';
 *
 * console.log(`当前系统支持 ${getRegisteredTypeCount()} 种数据类型`);
 * // 输出: "当前系统支持 12 种数据类型" (11 内置 + 1 自定义)
 * ```
 *
 * @see {@link listRegisteredColumnTypes} 获取详细列表
 */
export function getRegisteredTypeCount() {
    return globalTypeRegistry.size;
}

// ════════════════════════════════════════════
// 公共 API 函数：配置解析工具
// ════════════════════════════════════════════

/**
 * 从列配置中提取类型相关的选项（Extract Type-specific Options from Column Config）
 *
 * 工具函数：从完整的列配置对象中筛选出与类型行为相关的配置项。
 * 这些选项会被传递给类型构造器或方法。
 *
 * ## 📋 可提取的配置项
 *
 * | 配置键名 | 类型 | 用途说明 |
 * |---------|------|---------|
 * | `source` | Array\|Function | 下拉选项的数据源（Select 类型专用）|
 * | `allowInvalid` | boolean | 是否允许无效值（宽松模式）|
 * | `strict` | boolean | 是否启用严格验证模式 |
 * | `numericFormat` | string | 数字格式化模板（Numeric 类型专用）|
 * | `min` | number | 最小值约束 |
 * | `max` | number | 最大值约束 |
 * | `maxLength` | number | 最大长度限制 |
 * | `dateFormat` | string | 日期格式化模板（Date 类型专用）|
 * | `labels` | Object | 显示标签映射（Select 类型专用）|
 * | `maxRows` | number | 最大行数限制（Textarea 类型专用）|
 *
 * @param {Object} columnConfig - 完整的列配置对象
 * @returns {Object} 过滤后的类型选项对象（只包含有效配置项）
 *
 * @example
 * ```js
 * import { extractColumnTypeOptions } from '@canvas-sheet/core';
 *
 * const columnDefinition = {
 *     type: 'numeric',
 *     header: '价格',
 *     width: 120,
 *     numericFormat: '¥#,##0.00',  // ← 类型相关
 *     min: 0,                       // ← 类型相关
 *     max: 99999,                   // ← 类型相关
 *     sortable: true,               // ← 非（会被过滤掉）
 *     resizable: true               // ← 非（会被过滤掉）
 * };
 *
 * const typeOptions = extractColumnTypeOptions(columnDefinition);
 * console.log(typeOptions);
 * // 输出: { numericFormat: '¥#,##0.00', min: 0, max: 99999 }
 *
 * // 传递给类型实例
 * const numericType = getColumnTypeInstance('numeric', typeOptions);
 * ```
 *
 * @internal 此函数主要供内部使用，普通用户通常不需要直接调用
 */
export function extractColumnTypeOptions(columnConfig) {
    const { source, allowInvalid, strict, numericFormat, min, max, maxLength, dateFormat, labels, maxRows } = columnConfig;

    return Object.fromEntries(
        Object.entries({
            source,
            allowInvalid,
            strict,
            numericFormat,
            min,
            max,
            maxLength,
            dateFormat,
            labels,
            maxRows,
        }).filter(([, value]) => value !== undefined),
    );
}

// ════════════════════════════════════════════
// 公共 API 函数：类型解析与推断
// ════════════════════════════════════════════

/**
 * 从列配置中推断并获取列类型实例（Resolve Column Type from Configuration）
 *
 * 高级工具函数：根据列定义配置智能地获取合适的类型实例。
 * 自动处理配置缺失的情况（fallback 到 text 类型）。
 *
 * ## 🎯 解析优先级
 *
 * 1. **显式指定**：如果 `colConfig.type` 存在，直接使用该类型
 * 2. **隐式推断**：如果未指定类型，默认使用 **text** 类型
 *
 * @param {Object} colConfig - 列配置对象（至少包含 type 字段）
 * @param {string} [colConfig.type] - 列类型名称
 * @returns {BaseColumnType|null} 推断出的类型实例
 *
 * @example
 * ```js
 * import { resolveColumnTypeFromConfig } from '@canvas-sheet/core';
 *
 * // 场景1：明确指定了类型
 * const config1 = { type: 'date', dateFormat: 'YYYY-MM-DD' };
 * const dateType = resolveColumnTypeFromConfig(config1);
 * console.log(dateType.name);  // "date"
 *
 * // 场景2：未指定类型（自动 fallback）
 * const config2 = { header: '备注' };  // 没有 type 字段
 * const textType = resolveColumnTypeFromConfig(config2);
 * console.log(textType.name);  // "text" (默认)
 * ```
 *
 * @see {@link resolveCellTypeFromPosition} 更精细的位置级解析
 */
export function resolveColumnTypeFromConfig(colConfig) {
    if (!colConfig?.type) {
        return globalTypeRegistry.get("text");
    }
    return globalTypeRegistry.get(colConfig.type, extractColumnTypeOptions(colConfig));
}

/**
 * 根据单元格位置解析类型实例（Resolve Cell Type by Position）
 *
 * 最精细的类型解析函数，综合考虑以下因素来确定单元格应该使用的类型：
 *
 * ## 📍 解析优先级（由高到低）
 *
 * 1. **单元格级别覆盖**（最高优先级）
 *    - 检查 `cellTypes` Map 中是否有该单元格 `(row, col)` 的特殊类型定义
 *    - 适用于：单个单元格需要不同于整列的类型
 *
 * 2. **列级别定义**
 *    - 检查 `columnsConfig` Map 中该列 `col` 的默认类型
 *    - 适用于：整列统一使用某种类型
 *
 * 3. **全局默认值**（最低优先级）
 *    - 如果以上都没有，返回 **text** 类型作为最终 fallback
 *
 * @param {number} row - 行索引（从 0 开始）
 * @param {number} col - 列索引（从 0 开始）
 * @param {Map<string, {name: string, options?: Object}>|undefined} cellTypes - 单元格级别类型覆盖映射
 *        键格式：`${row},${col}`，值：{ name: 类型名, options: 配置 }
 * @param {Map<number, Object>|undefined} columnsConfig - 列级别配置映射
 *        键：列索引，值：列配置对象（含 type 字段）
 * @returns {BaseColumnType|null} 解析出的类型实例
 *
 * @example
 * ```js
 * import { resolveCellTypeFromPosition } from '@canvas-sheet/core';
 *
 * // 场景1：单元格有特殊类型覆盖
 * const cellTypes = new Map([
 *     ['2,3', { name: 'starRating', options: { maxStars: 5 } }]
 * ]);
 * const columnsConfig = new Map([
 *     [3, { type: 'select', source: ['A', 'B', 'C'] }]
 * ]);
 *
 * // 第 2 行第 3 列 → 使用 starRating（单元格级别优先）
 * const cellType1 = resolveCellTypeFromPosition(2, 3, cellTypes, columnsConfig);
 * console.log(cellType1.name);  // "starRating"
 *
 * // 第 5 行第 3 列 → 使用 select（列级别）
 * const cellType2 = resolveCellTypeFromPosition(5, 3, cellTypes, columnsConfig);
 * console.log(cellType2.name);  // "select"
 *
 * // 第 0 行第 99 列 → 使用 text（全局默认）
 * const cellType3 = resolveCellTypeFromPosition(0, 99, cellTypes, columnsConfig);
 * console.log(cellType3.name);  // "text"
 * ```
 *
 * @see {@link resolveColumnTypeFromConfig} 简化版的列级解析
 */
export function resolveCellTypeFromPosition(row, col, cellTypes, columnsConfig) {
    const cellKey = `${row},${col}`;

    if (cellTypes?.has(cellKey)) {
        const cellTypeDef = cellTypes.get(cellKey);
        return globalTypeRegistry.get(cellTypeDef.name, cellTypeDef.options);
    }

    const colConfig = columnsConfig?.get(col);
    if (colConfig?.type) {
        return globalTypeRegistry.get(colConfig.type, extractColumnTypeOptions(colConfig));
    }

    return globalTypeRegistry.get("text");
}

// ════════════════════════════════════════════
// 公共 API 函数：数据处理管道
// ════════════════════════════════════════════

/**
 * 格式化单元格值以供显示（Format Cell Value for Display）
 *
 * 将内部存储的原始值转换为用户友好的显示格式。
 * 这是**数据展示层**的核心函数。
 *
 * ## 🔄 转换流程
 *
 * ```
 * 内部值 (raw value)
 *     ↓
 * [null/undefined 检查]
 *     ↓ (是) → 返回 ""
 *     ↓ (否)
 * [cellType.format()]
 *     ↓
 * 显示值 (display string)
 * ```
 *
 * @param {BaseColumnType|null} cellType - 单元格类型实例（可以为 null）
 * @param {*} rawValue - 内部存储的原始值（任意类型）
 * @returns {string} 格式化后的显示字符串
 *
 * @example
 * ```js
 * import { getColumnTypeInstance, formatCellValue } from '@canvas-sheet/core';
 *
 * const dateType = getColumnTypeInstance('date');
 * const internalValue = new Date('2026-01-15');
 *
 * const displayString = formatCellValue(dateType, internalValue);
 * console.log(displayString);  // "2026-01-15" (取决于 locale 和 format 设置)
 *
 * // 无类型时退化为 String()
 * console.log(formatCellValue(null, 123));  // "123"
 * console.log(formatCellValue(undefined, null));  // "" (空值)
 * ```
 *
 * @see {@link parseCellValue} 反向操作：解析用户输入
 * @see {@link validateCellValue} 验证值的有效性
 */
export function formatCellValue(cellType, rawValue) {
    if (rawValue === undefined || rawValue === null) return "";
    return cellType ? cellType.format(rawValue) : String(rawValue);
}

/**
 * 解析用户输入为内部存储值（Parse User Input to Internal Value）
 *
 * 将用户在编辑器中输入的字符串转换为适合内部存储的值。
 * 这是**数据录入层**的核心函数。
 *
 * ## 🔄 转换流程
 *
 * ```
 * 用户输入 (user input string)
 *     ↓
 * [空值检查: "", undefined, null]
 *     ↓ (是) → 返回 ""
 *     ↓ (否)
 * [cellType.parse()]
 *     ↓
 * 内部值 (typed value)
 * ```
 *
 * @param {BaseColumnType|null} cellType - 单元格类型实例（可以为 null）
 * @param {string} input - 用户输入的原始字符串
 * @returns {*} 解析后的内部值（类型取决于 cellType 的实现）
 *
 * @example
 * ```js
 * import { getColumnTypeInstance, parseCellValue } from '@canvas-sheet/core';
 *
 * const numberType = getColumnTypeInstance('numeric');
 * const userInput = "1,234.56";
 *
 * const internalValue = parseCellValue(numberType, userInput);
 * console.log(internalValue);  // 1234.56 (数字类型)
 * console.log(typeof internalValue);  // "number"
 *
 * // 空输入处理
 * console.log(parseCellValue(dateType, ""));  // ""
 * console.log(parseCellValue(null, "anything"));  // "anything" (无类型时原样返回)
 * ```
 *
 * @see {@link formatCellValue} 反向操作：格式化为显示
 * @see {@link validateCellValue} 解析后的验证步骤
 */
export function parseCellValue(cellType, input) {
    if (input === "" || input === undefined || input === null) return "";
    return cellType ? cellType.parse(input) : input;
}

/**
 * 验证单元格值的有效性（Validate Cell Value）
 *
 * 对值进行两层验证：
 * 1. **类型级验证**：调用 `cellType.validate()` 检查是否符合类型约束
 * 2. **自定义验证器**：可选的列级业务逻辑验证（通过 `colConfig.validator`）
 *
 * ## ✅ 返回值约定
 *
 * - `true`：验证通过（值有效）
 * - `string`：验证失败，返回错误信息（可直接展示给用户）
 * - `false`：验证失败，无具体信息（通用错误）
 *
 * @param {BaseColumnType|null} cellType - 单元格类型实例（可以为 null）
 * @param {*} value - 待验证的值
 * @param {Object|undefined} colConfig - 列配置（可选，包含 validator 函数）
 * @param {Function} [colConfig.validator] - 自定义验证函数 `(value) => true|string|false`
 * @returns {boolean|string} 验证结果（true=通过，string=错误信息，false=失败）
 *
 * @example
 * ```js
 * import { getColumnTypeInstance, validateCellValue } from '@canvas-sheet/core';
 *
 * const emailType = getColumnTypeInstance('text');  // 假设有 email 子类型
 *
 * // 场景1：类型验证通过
 * const result1 = validateCellValue(emailType, 'test@example.com');
 * console.log(result1);  // true
 *
 * // 场景2：类型验证失败（返回错误信息）
 * const result2 = validateCellValue(emailType, 'invalid-email');
 * console.log(result2);  // "请输入有效的邮箱地址"
 *
 * // 场景3：自定义验证器
 * const columnConfig = {
 *     validator: (value) => {
 *         if (value.length > 50) return '内容过长（最多50字符）';
 *         return true;
 *     }
 * };
 * const result3 = validateCellValue(textType, 'a'.repeat(100), columnConfig);
 * console.log(result3);  // "内容过长（最多50字符）"
 * ```
 *
 * @see {@link formatCellValue} 格式化前的准备
 * @see {@link parseCellValue} 解析后的必要步骤
 */
export function validateCellValue(cellType, value, colConfig) {
    if (cellType) {
        const typeValidationResult = cellType.validate(value);
        if (typeValidationResult !== true) return typeValidationResult;
    }

    if (colConfig && isFunction(colConfig.validator)) {
        try {
            return colConfig.validator(value);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.TYPE_PARSE_ERROR, "自定义验证器执行失败", { originalError: error });
            return false;
        }
    }

    return true;
}
