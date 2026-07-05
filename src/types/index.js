import { TextColumnType } from "./TextColumnType.js";
import { NumericColumnType } from "./NumericColumnType.js";
import { DateColumnType } from "./DateColumnType.js";
import { BooleanColumnType } from "./BooleanColumnType.js";
import { SelectColumnType } from "./SelectColumnType.js";
import { BUILTIN_RENDERERS } from "./renderers/index.js";
import { isFunction } from "@/utils/utils";
import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler";

class TypeRegistry {
    static #instance = null;
    #registry = new Map();

    constructor() {
        if (TypeRegistry.#instance) {
            return TypeRegistry.#instance;
        }
        TypeRegistry.#instance = this;
        this.#initBuiltins();
    }

    static getInstance() {
        if (!TypeRegistry.#instance) {
            TypeRegistry.#instance = new TypeRegistry();
        }
        return TypeRegistry.#instance;
    }

    #initBuiltins() {
        const builtins = {
            text: TextColumnType,
            numeric: NumericColumnType,
            date: DateColumnType,
            boolean: BooleanColumnType,
            select: SelectColumnType,
            ...BUILTIN_RENDERERS,
        };

        for (const [name, Constructor] of Object.entries(builtins)) {
            this.#registry.set(name, {
                instance: new Constructor(),
                constructor: Constructor,
            });
        }
    }

    register(name, TypeClass, options = {}) {
        if (!name || typeof name !== "string" || !name.trim()) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_NAME, "Type name must be a non-empty string");
            return false;
        }

        if (typeof TypeClass !== "function" || TypeClass.prototype === undefined) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_CLASS, "Type must be a constructor function (class or function with prototype)");
            return false;
        }

        if (this.#registry.has(name)) {
            errorHandler.warn(ERROR_CODE.TYPE_DUPLICATE, `Type "${name}" already registered, will be overwritten`);
        }

        let instance = null;
        try {
            instance = new TypeClass(options);
        } catch (error) {
            errorHandler.warn(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `Failed to create default instance for type "${name}"`, { originalError: error });
        }

        this.#registry.set(name, {
            instance,
            constructor: TypeClass,
        });
        return true;
    }

    registerInstance(typeInstance) {
        if (!typeInstance || !typeInstance.name) {
            errorHandler.warn(ERROR_CODE.TYPE_INVALID_INSTANCE, "Invalid type instance, registration skipped");
            return false;
        }

        this.#registry.set(typeInstance.name, {
            instance: typeInstance,
            constructor: typeInstance.constructor,
        });
        return true;
    }

    get(name, options = undefined) {
        const entry = this.#registry.get(name);
        if (!entry) {
            errorHandler.warn(ERROR_CODE.TYPE_NOT_REGISTERED, `Type "${name}" not registered, falling back to text`);
            const fallback = this.#registry.get("text");
            return fallback ? fallback.instance : null;
        }

        if (!options) {
            if (entry.instance) return entry.instance;
            try {
                entry.instance = new entry.constructor();
            } catch (error) {
                errorHandler.handle(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `Failed to instantiate type "${name}"`, { originalError: error });
                return null;
            }
            return entry.instance;
        }

        try {
            return new entry.constructor(options);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.TYPE_INSTANTIATION_ERROR, `Failed to instantiate type "${name}"`, { originalError: error });
            return null;
        }
    }

    has(name) {
        return this.#registry.has(name);
    }

    unregister(name) {
        return this.#registry.delete(name);
    }

    list() {
        return Array.from(this.#registry.keys());
    }

    clear() {
        this.#registry.clear();
    }

    reset() {
        this.#registry.clear();
        this.#initBuiltins();
    }

    get size() {
        return this.#registry.size;
    }
}

const registry = TypeRegistry.getInstance();

function _extractTypeOptions(config) {
    const { source, allowInvalid, strict, numericFormat, min, max, maxLength, dateFormat, labels } = config;
    return Object.fromEntries(
        Object.entries({ source, allowInvalid, strict, numericFormat, min, max, maxLength, dateFormat, labels }).filter(([, v]) => v !== undefined),
    );
}

export { TypeRegistry };

export function getType(name, options = undefined) {
    return registry.get(name, options);
}

export function extractTypeOptions(config) {
    return _extractTypeOptions(config);
}

export function registerType(typeInstance) {
    return registry.registerInstance(typeInstance);
}

export function registerTypeClass(name, TypeClass, options = {}) {
    return registry.register(name, TypeClass, options);
}

export function hasType(name) {
    return registry.has(name);
}

export function unregisterType(name) {
    return registry.unregister(name);
}

export function getRegisteredTypes() {
    return registry.list();
}

export function clearTypes() {
    registry.clear();
}

export function resetTypes() {
    registry.reset();
}

export function getRegistrySize() {
    return registry.size;
}

export function getColumnTypeFromConfig(colConfig) {
    if (!colConfig?.type) {
        return registry.get("text");
    }
    return registry.get(colConfig.type, _extractTypeOptions(colConfig));
}

export function resolveCellType(r, c, cellTypes, columnsConfig) {
    const cellKey = `${r},${c}`;
    if (cellTypes?.has(cellKey)) {
        const def = cellTypes.get(cellKey);
        return registry.get(def.name, def.options);
    }

    const colConfig = columnsConfig?.get(c);
    if (colConfig?.type) {
        return registry.get(colConfig.type, _extractTypeOptions(colConfig));
    }

    return registry.get("text");
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
