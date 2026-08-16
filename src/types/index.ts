/**
 * 列类型管理系统（Column Type Management System）
 *
 * @module types/index
 * @description
 *
 * 本模块是 Canvas Spreadsheet 的数据类型核心引擎，负责：
 * 1. 类型注册与发现：管理所有可用的列数据类型（文本、数字、日期等）
 * 2. 类型实例化：根据配置创建和管理类型实例
 * 3. 数据处理管道：提供格式化、解析、验证等数据转换功能
 * 4. 扩展机制：支持自定义类型的动态注册
 */

import { TextColumnType } from "./TextColumnType.js";
import { NumericColumnType } from "./NumericColumnType.js";
import { DateColumnType } from "./DateColumnType.js";
import { SelectColumnType } from "./SelectColumnType.js";
import { TextareaColumnType } from "./TextareaColumnType.js";
import { HyperlinkColumnType } from "./HyperlinkColumnType.js";
import { BUILTIN_RENDERER_TYPE_REGISTRY } from "./renderers/index.js";
import { isFunction } from "../utils/helper.js";
import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";
import { BaseColumnType } from "./BaseColumnType.js";

interface TypeEntry {
    instance: BaseColumnType | null;
    constructor: new (options?: any) => BaseColumnType;
}

class TypeRegistry {
    static #instance: TypeRegistry | null = null;
    #registry: Map<string, TypeEntry> = new Map();

    constructor() {
        if (TypeRegistry.#instance) {
            return TypeRegistry.#instance;
        }
        TypeRegistry.#instance = this;
        this.#initializeBuiltinTypes();
    }

    static getInstance(): TypeRegistry {
        if (!TypeRegistry.#instance) {
            TypeRegistry.#instance = new TypeRegistry();
        }
        return TypeRegistry.#instance;
    }

    #initializeBuiltinTypes(): void {
        const builtinTypeDefinitions: Record<string, new (options?: any) => BaseColumnType> = {
            text: TextColumnType,
            numeric: NumericColumnType,
            date: DateColumnType,
            select: SelectColumnType,
            textarea: TextareaColumnType,
            hyperlink: HyperlinkColumnType,
            ...BUILTIN_RENDERER_TYPE_REGISTRY,
        };

        for (const [typeName, TypeConstructor] of Object.entries(builtinTypeDefinitions)) {
            this.#registry.set(typeName, {
                instance: new TypeConstructor(),
                constructor: TypeConstructor,
            });
        }

        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✅ 已加载 ${this.#registry.size} 个内置类型`, {
            types: Array.from(this.#registry.keys()),
        });
    }

    register(typeName: string, TypeClass: new (options?: any) => BaseColumnType, options: Record<string, any> = {}): boolean {
        if (!typeName || typeof typeName !== "string" || !typeName.trim()) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_NAME, "类型名称必须是非空字符串");
            return false;
        }

        if (typeof TypeClass !== "function" || (TypeClass as any).prototype === undefined) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_CLASS, "类型必须是构造函数（类或带有 prototype 的函数）");
            return false;
        }

        if (this.#registry.has(typeName)) {
            errorHandler.warn(ERROR_CODE.TYPE_DUPLICATE, `类型 "${typeName}" 已注册，将被覆盖（overwrite）`);
        }

        let defaultInstance: BaseColumnType | null = null;
        try {
            defaultInstance = new TypeClass(options);
        } catch (error) {
            errorHandler.warn(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `无法为类型 "${typeName}" 创建默认实例`, { originalError: error });
        }

        this.#registry.set(typeName, {
            instance: defaultInstance,
            constructor: TypeClass as new (options?: any) => BaseColumnType,
        });

        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✓ 已注册类型: ${typeName}`);
        return true;
    }

    registerInstance(typeInstance: BaseColumnType): boolean {
        if (!typeInstance || !typeInstance.name) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_INSTANCE, "无效的类型实例，跳过注册");
            return false;
        }

        this.#registry.set(typeInstance.name, {
            instance: typeInstance,
            constructor: typeInstance.constructor as new (options?: any) => BaseColumnType,
        });

        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✓ 已注册类型实例: ${typeInstance.name}`);
        return true;
    }

    get(typeName: string, options?: Record<string, any>): BaseColumnType | null {
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
                errorHandler.error(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `无法实例化类型 "${typeName}"`, { originalError: error });
                return null;
            }
            return typeEntry.instance;
        }

        try {
            return new typeEntry.constructor(options);
        } catch (error) {
            errorHandler.error(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `无法使用配置实例化类型 "${typeName}"`, { originalError: error });
            return null;
        }
    }

    has(typeName: string): boolean {
        return this.#registry.has(typeName);
    }

    unregister(typeName: string): boolean {
        const removed = this.#registry.delete(typeName);
        if (removed) {
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] ✗ 已注销类型: ${typeName}`);
        }
        return removed;
    }

    list(): string[] {
        return Array.from(this.#registry.keys());
    }

    clear(): void {
        const previousSize = this.#registry.size;
        this.#registry.clear();

        if (previousSize > 0) {
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[TypeRegistry] 🗑️ 已清空 ${previousSize} 个类型`);
        }
    }

    reset(): void {
        this.#registry.clear();
        this.#initializeBuiltinTypes();
    }

    get size(): number {
        return this.#registry.size;
    }
}

const globalTypeRegistry = TypeRegistry.getInstance();

export { TypeRegistry };

export function getColumnTypeInstance(typeName: string, options?: Record<string, any>): BaseColumnType | null {
    return globalTypeRegistry.get(typeName, options);
}

export function hasColumnType(typeName: string): boolean {
    return globalTypeRegistry.has(typeName);
}

export function registerColumnTypeClass(
    typeName: string,
    TypeClass: new (options?: any) => BaseColumnType,
    options: Record<string, any> = {},
): boolean {
    return globalTypeRegistry.register(typeName, TypeClass, options);
}

export function registerColumnTypeInstance(typeInstance: BaseColumnType): boolean {
    return globalTypeRegistry.registerInstance(typeInstance);
}

export function unregisterColumnType(typeName: string): boolean {
    return globalTypeRegistry.unregister(typeName);
}

export function listRegisteredColumnTypes(): string[] {
    return globalTypeRegistry.list();
}

export function clearAllColumnTypes(): void {
    globalTypeRegistry.clear();
}

export function resetToBuiltinTypes(): void {
    globalTypeRegistry.reset();
}

export function getRegisteredTypeCount(): number {
    return globalTypeRegistry.size;
}

export function extractColumnTypeOptions(columnConfig: Record<string, any>): Record<string, any> {
    if (!columnConfig || typeof columnConfig !== "object") {
        return {};
    }

    const NON_TYPE_KEYS = new Set([
        "type",
        "header",
        "name",
        "title",
        "width",
        "height",
        "sortable",
        "resizable",
        "frozen",
        "hidden",
        "locked",
        "className",
        "style",
        "cssClass",
        "data",
        "value",
        "values",
    ]);

    const { source, allowInvalid, strict, numericFormat, min, max, maxLength, dateFormat, labels, maxRows, width, options, ...rest } = columnConfig;

    const standardOptions = Object.fromEntries(
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

    const typeSpecificOptions: Record<string, any> = {};

    if (options && typeof options === "object" && !Array.isArray(options)) {
        Object.assign(typeSpecificOptions, options);
    }

    for (const [key, value] of Object.entries(rest)) {
        if (NON_TYPE_KEYS.has(key)) {
            continue;
        }

        typeSpecificOptions[key] = value;
    }

    return { ...standardOptions, ...typeSpecificOptions };
}

export function resolveColumnTypeFromConfig(colConfig: Record<string, any> | null | undefined): BaseColumnType | null {
    if (!colConfig?.type) {
        return globalTypeRegistry.get("text");
    }
    return globalTypeRegistry.get(colConfig.type, extractColumnTypeOptions(colConfig));
}

export function resolveCellTypeFromPosition(
    row: number,
    col: number,
    cellTypes?: Map<string, { name: string; options?: Record<string, any> }>,
    columnsConfig?: Map<number, Record<string, any>>,
): BaseColumnType | null {
    const cellKey = `${row},${col}`;

    if (cellTypes?.has(cellKey)) {
        const cellTypeDef = cellTypes.get(cellKey)!;
        return globalTypeRegistry.get(cellTypeDef.name, cellTypeDef.options);
    }

    const colConfig = columnsConfig?.get(col);
    if (colConfig?.type) {
        return globalTypeRegistry.get(colConfig.type, extractColumnTypeOptions(colConfig));
    }

    return globalTypeRegistry.get("text");
}

export function formatCellValue(cellType: BaseColumnType | null, rawValue: any): string {
    if (rawValue === undefined || rawValue === null) return "";
    return cellType ? cellType.format(rawValue) : String(rawValue);
}

export function parseCellValue(cellType: BaseColumnType | null, input: any): any {
    if (input === "" || input === undefined || input === null) return "";
    return cellType ? cellType.parse(input) : input;
}

export function validateCellValue(cellType: BaseColumnType | null, value: any, colConfig?: Record<string, any>): boolean | string {
    if (cellType) {
        const typeValidationResult = cellType.validate(value);
        if (typeValidationResult !== true) return typeValidationResult;
    }

    if (colConfig && isFunction(colConfig.validator)) {
        try {
            return colConfig.validator(value) as boolean | string;
        } catch (error) {
            errorHandler.error(ERROR_CODE.TYPE_PARSE_ERROR, "自定义验证器执行失败", { originalError: error });
            return false;
        }
    }

    return true;
}
