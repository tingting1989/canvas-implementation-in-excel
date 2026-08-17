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
 */

import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { mathFunctions } from "./math.js";
import { statisticalFunctions } from "./statistical.js";
import { logicalFunctions } from "./logical.js";
import { textFunctions } from "./text.js";
import { conditionalFunctions } from "./conditional.js";
import { lookupFunctions } from "./lookup.js";

type FormulaFn = (args: unknown[], ctx?: unknown) => unknown;

interface FunctionEntry {
    implementation: FormulaFn;
    originalImplementation: FormulaFn;
    category: string;
    module: string;
    registeredAt: number;
}

interface FunctionInfo {
    name: string;
    category: string;
    module: string;
    registeredAt: string;
    isBuiltin: boolean;
}

interface FunctionStats {
    total: number;
    builtin: number;
    custom: number;
    modules: string[];
}

interface RegisterOptions {
    category?: string;
    module?: string;
}

const FUNCTION_CATEGORY = Object.freeze({
    BUILTIN: "builtin",
    CUSTOM: "custom",
});

export { FUNCTION_CATEGORY };

const FUNCTIONS_MAP = new Map<string, FunctionEntry>();

class FunctionRegistry {
    private _functions: Map<string, FunctionEntry>;

    constructor() {
        this._functions = FUNCTIONS_MAP;

        this._registerModule("Math", mathFunctions);
        this._registerModule("Statistical", statisticalFunctions);
        this._registerModule("Logical", logicalFunctions);
        this._registerModule("Text", textFunctions);
        this._registerModule("Conditional", conditionalFunctions);
        this._registerModule("Lookup", lookupFunctions);
    }

    _registerModule(moduleName: string, functionsObj: Record<string, FormulaFn>): void {
        for (const [name, fn] of Object.entries(functionsObj)) {
            this.register(name, fn, {
                category: FUNCTION_CATEGORY.BUILTIN,
                module: moduleName,
            });
        }
    }

    register(name: string, fn: FormulaFn, options: RegisterOptions = {}): void {
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

        const wrappedFn = function wrappedFn(this: unknown, ...args: unknown[]): unknown {
            try {
                return fn.apply(this, args as [unknown[], unknown?]);
            } catch (error) {
                errorHandler.error(ERROR_CODE.FORMULA_EVAL_ERROR, `函数 ${upperName} 执行失败`, {
                    functionName: upperName,
                    error: (error as Error).message,
                    stack: (error as Error).stack,
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

    get(name: string): FormulaFn | undefined {
        const entry = this._functions.get(name.toUpperCase());
        return entry ? entry.implementation : undefined;
    }

    has(name: string): boolean {
        return this._functions.has(name.toUpperCase());
    }

    unregister(name: string): boolean {
        const upperName = name.toUpperCase();

        if (this._functions.has(upperName)) {
            const entry = this._functions.get(upperName)!;

            if (entry.category === FUNCTION_CATEGORY.BUILTIN) {
                errorHandler.warn(ERROR_CODE.FORMULA_FUNCTION_OVERRIDE, `尝试注销内置函数 ${upperName}`, { functionName: upperName });
            }

            return this._functions.delete(upperName);
        }

        return false;
    }

    list(): string[] {
        return [...this._functions.keys()];
    }

    getInfo(name: string): FunctionInfo | undefined {
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

    getStats(): FunctionStats {
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

    clear(): void {
        this._functions.clear();
    }

    reset(): void {
        this.clear();
        this._registerModule("Math", mathFunctions);
        this._registerModule("Statistical", statisticalFunctions);
        this._registerModule("Logical", logicalFunctions);
        this._registerModule("Text", textFunctions);
        this._registerModule("Conditional", conditionalFunctions);
        this._registerModule("Lookup", lookupFunctions);
    }
}

export const functionRegistry = new FunctionRegistry();
