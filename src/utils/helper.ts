export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const toDisplayString = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
};

export const generateId = (): string => Math.random().toString(36).substring(2, 9);

export const isNumber = (value: unknown): value is number => typeof value === "number" && !Number.isNaN(value);

export const isFunction = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === "function";

export const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === "string";

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const isUndefined = (value: unknown): value is undefined => value === undefined;

export const isNull = (value: unknown): value is null => value === null;

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): ((...args: Parameters<T>) => void) & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<T>) => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            fn(...args);
            timer = null;
        }, delay);
    };
    debounced.cancel = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };
    return debounced;
}