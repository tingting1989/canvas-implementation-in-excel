import { BaseColumnType } from "./BaseColumnType.js";
import { TextColumnType } from "./TextColumnType.js";
import { NumericColumnType } from "./NumericColumnType.js";
import { DateColumnType } from "./DateColumnType.js";
import { BooleanColumnType } from "./BooleanColumnType.js";
import { SelectColumnType } from "./SelectColumnType.js";
import { isFunction } from "../utils/utils.js";
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 全局类型注册表
 * key: 类型名称字符串
 * value: { instance: BaseColumnType, constructor: Function }
 */
const registry = new Map();
const typeConstructors = {
    text: TextColumnType,
    numeric: NumericColumnType,
    date: DateColumnType,
    boolean: BooleanColumnType,
    select: SelectColumnType,
};

Object.entries(typeConstructors).forEach(([name, Constructor]) => {
    registry.set(name, {
        instance: new Constructor(),
        constructor: Constructor,
    });
});

/**
 * 获取指定名称的类型实例
 * 如果传入 options，则创建新实例（使用原型构造函数 + 新 options）
 *
 * @param {string} name - 类型名称
 * @param {object} [options] - 类型配置选项
 * @returns {BaseColumnType}
 */
export function getType(name, options = undefined) {
    const entry = registry.get(name);
    if (!entry) {
        errorHandler.warn(ERROR_CODE.TYPE_NOT_REGISTERED, `Type "${name}" not registered, falling back to text`);
        return registry.get("text").instance;
    }
    if (!options) return entry.instance;

    // 使用保存的构造函数创建新实例，确保类型正确
    const { constructor: TypeConstructor } = entry;
    return new TypeConstructor(options);
}

/**
 * 注册自定义类型
 *
 * @param {BaseColumnType} typeInstance - 类型实例
 *
 * @example
 * import { registerType } from './types/index.js';
 * import { BaseColumnType } from './types/BaseColumnType.js';
 *
 * class MyCustomType extends BaseColumnType {
 *   get name() { return 'myCustom'; }
 *   // ...
 * }
 * registerType(new MyCustomType());
 */
export function registerType(typeInstance) {
    if (!typeInstance || !typeInstance.name) {
        errorHandler.warn(ERROR_CODE.TYPE_INVALID_INSTANCE, "Invalid type instance, registration skipped");
        return;
    }

    registry.set(typeInstance.name, {
        instance: typeInstance,
        constructor: typeInstance.constructor,
    });
}

/**
 * 获取所有已注册的类型名称
 * @returns {string[]}
 */
export function getRegisteredTypes() {
    return Array.from(registry.keys());
}

/**
 * 从配置对象中提取类型相关选项
 * @param {object} config - 列配置或单元格类型配置
 * @returns {object} 类型选项对象
 */
function extractTypeOptions(config) {
    return {
        allowInvalid: config.allowInvalid,
        source: config.source,
        numericFormat: config.numericFormat,
        min: config.min,
        max: config.max,
        maxLength: config.maxLength,
        dateFormat: config.dateFormat,
        labels: config.labels,
    };
}

/**
 * 从列配置创建 BaseColumnType 实例
 * 用于 Sheet 获取列级别的类型行为
 *
 * @param {object} colConfig - 列配置对象
 * @returns {BaseColumnType}
 */
export function getColumnTypeFromConfig(colConfig) {
    if (!colConfig?.type) {
        return registry.get("text").instance;
    }
    return getType(colConfig.type, extractTypeOptions(colConfig));
}

/**
 * 解析指定单元格的类型实例（BaseColumnType）
 *
 * 优先级：
 *   1. cellTypes Map 中的单元格级别类型配置
 *   2. columnsConfig Map 中的列级别类型配置
 *   3. 默认 text 类型
 *
 * @param {number} r - 行号
 * @param {number} c - 列号
 * @param {Map<string, object>} [cellTypes] - 单元格类型配置映射 (key: "r,c")
 * @param {Map<number, object>} [columnsConfig] - 列配置映射
 * @returns {BaseColumnType}
 */
export function resolveCellType(r, c, cellTypes, columnsConfig) {
    // 1. 单元格级别类型配置
    const cellKey = `${r},${c}`;
    if (cellTypes?.has(cellKey)) {
        const def = cellTypes.get(cellKey);
        return getType(def.name, def.options);
    }

    // 2. 列级别类型配置
    const colConfig = columnsConfig?.get(c);
    if (colConfig?.type) {
        return getType(colConfig.type, extractTypeOptions(colConfig));
    }

    // 3. 默认 text 类型 - 返回实例而非整个 entry 对象
    const defaultEntry = registry.get("text");
    return defaultEntry ? defaultEntry.instance : null;
}

export function formatValue(cellType, value) {
    if (value === undefined || value === null) return "";
    return cellType ? cellType.format(value) : String(value);
}

export function parseValue(cellType, input) {
    if (input === "" || input === undefined || input === null) return "";
    return cellType ? cellType.parse(input) : input;
}

export function validateValue(cellType, value, colConfig) {
    if (cellType) {
        const result = cellType.validate(value);
        if (result !== true) return result;
    }
    if (colConfig && isFunction(colConfig.validator)) {
        try {
            return colConfig.validator(value);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.TYPE_PARSE_ERROR, "Validator execution failed", { originalError: error });
            return false;
        }
    }
    return true;
}