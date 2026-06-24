// src/core/utils.js
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const formatCellValue = (value) => {
    if (value === null || value === undefined) return "";
    return String(value);
};

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const isNumber = (value) => typeof value === "number" && !Number.isNaN(value);

export const isFunction = (value) => typeof value === "function";

export const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const isString = (value) => typeof value === "string";

export const isBoolean = (value) => typeof value === "boolean";

export function debounce(fn, delay) {
    let timer = null;
    const debounced = (...args) => {
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
