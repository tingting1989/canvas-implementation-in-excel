// src/core/utils.js
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const formatCellValue = (value) => {
    if (value === null || value === undefined) return "";
    return String(value);
};

export const generateId = () => Math.random().toString(36).substring(2, 9);