import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface ShadowContext {
    value?: any;
    row?: number;
    col?: number;
    sheet?: string;
    [key: string]: any;
}

interface SandboxGlobals {
    Math: typeof Math;
    Date: typeof Date;
    parseInt: typeof parseInt;
    parseFloat: typeof parseFloat;
    isNaN: typeof isNaN;
    isFinite: typeof isFinite;
    String: typeof String;
    Number: typeof Number;
    Boolean: typeof Boolean;
    Array: typeof Array;
    Object: typeof Object;
    JSON: typeof JSON;
    ABS: (n: number) => number;
    ROUND: (n: number, d?: number) => number;
    INT: (n: number) => number;
    MOD: (n: number, d: number) => number;
    POWER: (base: number, exp: number) => number;
    SQRT: (n: number) => number;
    MAX: (...args: number[]) => number;
    MIN: (...args: number[]) => number;
    LEN: (s: string) => number;
    LEFT: (s: string, n?: number) => string;
    RIGHT: (s: string, n?: number) => string;
    MID: (s: string, start: number, len: number) => string;
    UPPER: (s: string) => string;
    LOWER: (s: string) => string;
    TRIM: (s: string) => string;
    IF: (condition: any, trueVal: any, falseVal: any) => any;
    AND: (...args: any[]) => boolean;
    OR: (...args: any[]) => boolean;
    NOT: (arg: any) => boolean;
}

/**
 * 影子求值器
 *
 * 提供隔离的公式求值环境，防止恶意或错误公式
 * 访问全局对象（如 window、document、process 等）。
 *
 * 安全策略：
 * - 使用 Function 构造器创建沙箱函数
 * - 仅注入白名单全局对象（Math、Date 等）
 * - 设置执行超时
 * - 禁止访问 window、document、globalThis 等危险对象
 */
export class ShadowEvaluator {
    #maxExecutionTime: number = 5000;
    #sandboxGlobals: SandboxGlobals;

    constructor(config: { maxExecutionTime?: number } = {}) {
        this.#maxExecutionTime = config.maxExecutionTime ?? 5000;

        this.#sandboxGlobals = this.createSandboxGlobals();
    }

    async evaluate(formula: string, context: ShadowContext = {}): Promise<boolean> {
        const cleanedFormula = formula.replace(/^=/, "");

        try {
            const result = await this.executeInSandbox(cleanedFormula, context);
            return this.coerceToBoolean(result);
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ShadowEvaluator] 沙箱求值失败:", error);
            return false;
        }
    }

    async executeInSandbox(formula: string, context: ShadowContext): Promise<any> {
        const contextVars = Object.entries(context)
            .filter(([_, v]) => v !== undefined)
            .map(([key]) => key);

        const contextValues = Object.entries(context)
            .filter(([_, v]) => v !== undefined)
            .map(([_, v]) => v);

        const globalEntries = Object.entries(this.#sandboxGlobals);
        const globalNames = globalEntries.map(([name]) => name);
        const globalValues = globalEntries.map(([_, value]) => value);

        const allNames = [...globalNames, ...contextVars];
        const allValues = [...globalValues, ...contextValues];

        const safeFormula = this.sanitizeFormula(formula);

        const sandboxFn = new Function(...allNames, `"use strict"; return (${safeFormula});`);

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`公式执行超时 (${this.#maxExecutionTime}ms)`));
            }, this.#maxExecutionTime);

            try {
                const result = sandboxFn(...allValues);
                clearTimeout(timeoutId);
                resolve(result);
            } catch (e: any) {
                clearTimeout(timeoutId);
                reject(e);
            }
        });
    }

    sanitizeFormula(formula: string): string {
        const dangerousPatterns = [
            /\bwindow\b/gi,
            /\bdocument\b/gi,
            /\bglobalThis\b/gi,
            /\bself\b/gi,
            /\btop\b/gi,
            /\bparent\b/gi,
            /\bframes\b/gi,
            /\beval\b/gi,
            /\bFunction\b/gi,
            /\bsetTimeout\b/gi,
            /\bsetInterval\b/gi,
            /\bclearTimeout\b/gi,
            /\bclearInterval\b/gi,
            /\brequestAnimationFrame\b/gi,
            /\bfetch\b/gi,
            /\bXMLHttpRequest\b/gi,
            /\bimport\b/gi,
            /\brequire\b/gi,
            /\bprocess\b/gi,
            /\b__proto__\b/gi,
            /\bconstructor\b/gi,
            /\bprototype\b/gi,
        ];

        let sanitized = formula;
        for (const pattern of dangerousPatterns) {
            if (pattern.test(sanitized)) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ShadowEvaluator] 检测到危险模式: ${pattern.source}`);
                sanitized = sanitized.replace(pattern, "undefined");
            }
        }

        return sanitized;
    }

    coerceToBoolean(result: any): boolean {
        if (typeof result === "boolean") return result;
        if (typeof result === "number") return result !== 0;
        if (typeof result === "string") {
            const lower = result.toLowerCase().trim();
            return lower === "true" || lower === "1" || lower === "yes";
        }
        return !!result;
    }

    createSandboxGlobals(): SandboxGlobals {
        return {
            Math,
            Date,
            parseInt,
            parseFloat,
            isNaN,
            isFinite,
            String,
            Number,
            Boolean,
            Array,
            Object,
            JSON,
            ABS: (n: number) => Math.abs(n),
            ROUND: (n: number, d: number = 0) => {
                const factor = Math.pow(10, d);
                return Math.round(n * factor) / factor;
            },
            INT: (n: number) => Math.floor(n),
            MOD: (n: number, d: number) => n % d,
            POWER: (base: number, exp: number) => Math.pow(base, exp),
            SQRT: (n: number) => Math.sqrt(n),
            MAX: (...args: number[]) => Math.max(...args),
            MIN: (...args: number[]) => Math.min(...args),
            LEN: (s: string) => String(s).length,
            LEFT: (s: string, n: number = 1) => String(s).substring(0, n),
            RIGHT: (s: string, n: number = 1) => {
                const str = String(s);
                return str.substring(str.length - n);
            },
            MID: (s: string, start: number, len: number) => String(s).substring(start - 1, start - 1 + len),
            UPPER: (s: string) => String(s).toUpperCase(),
            LOWER: (s: string) => String(s).toLowerCase(),
            TRIM: (s: string) => String(s).trim(),
            IF: (condition: any, trueVal: any, falseVal: any) => (condition ? trueVal : falseVal),
            AND: (...args: any[]) => args.every(Boolean),
            OR: (...args: any[]) => args.some(Boolean),
            NOT: (arg: any) => !arg,
        };
    }
}
