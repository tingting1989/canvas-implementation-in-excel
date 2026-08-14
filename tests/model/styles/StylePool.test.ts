import { describe, it, expect } from "vitest";
import { StylePool, CELL_STYLE_PROPERTIES, validateStyleProperties, stylePool, DEFAULT_STYLE_ID } from "@/model/styles/index";

describe("StylePool - getStyleId", () => {
    it("should return unique IDs for different styles", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ fontSize: 14 });
        const id2 = pool.getStyleId({ fontSize: 16 });
        expect(id1).not.toBe(id2);
    });

    it("should return same ID for identical styles", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ fontSize: 14, color: "red" });
        const id2 = pool.getStyleId({ color: "red", fontSize: 14 });
        expect(id1).toBe(id2);
    });

    it("should return ID for empty style", () => {
        const pool = new StylePool();
        const id = pool.getStyleId({});
        expect(id).toBeGreaterThan(0);
    });

    it("should return ID for default empty call", () => {
        const pool = new StylePool();
        const id = pool.getStyleId();
        expect(id).toBeGreaterThan(0);
    });
});

describe("StylePool - getStyle", () => {
    it("should return style by ID", () => {
        const pool = new StylePool();
        const id = pool.getStyleId({ fontSize: 14, color: "red" });
        const style = pool.getStyle(id);
        expect(style).toEqual({ fontSize: 14, color: "red" });
    });

    it("should return empty object for unknown ID", () => {
        const pool = new StylePool();
        expect(pool.getStyle(999)).toEqual({});
    });

    it("should return shallow copy (not reference)", () => {
        const pool = new StylePool();
        const id = pool.getStyleId({ fontSize: 14 });
        const style1 = pool.getStyle(id);
        const style2 = pool.getStyle(id);
        expect(style1).toEqual(style2);
        expect(style1).not.toBe(style2);
    });
});

describe("StylePool - size", () => {
    it("should track number of unique styles", () => {
        const pool = new StylePool();
        expect(pool.size).toBe(0);
        pool.getStyleId({ fontSize: 14 });
        expect(pool.size).toBe(1);
        pool.getStyleId({ fontSize: 14 });
        expect(pool.size).toBe(1);
        pool.getStyleId({ fontSize: 16 });
        expect(pool.size).toBe(2);
    });
});

describe("StylePool - type differentiation", () => {
    it("should differentiate number vs string with same literal", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ fontSize: 14 });
        const id2 = pool.getStyleId({ fontSize: "14" as unknown as number });
        expect(id1).not.toBe(id2);
    });
});

describe("CELL_STYLE_PROPERTIES", () => {
    it("should contain known style properties", () => {
        expect(CELL_STYLE_PROPERTIES.has("fontSize")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("color")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("backgroundColor")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("textAlign")).toBe(true);
    });
});

describe("validateStyleProperties", () => {
    it("should not warn for valid properties", () => {
        const spy = vi.spyOn(console, "warn");
        validateStyleProperties({ fontSize: 14, color: "red" });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("should warn for unknown properties", () => {
        const spy = vi.spyOn(console, "warn");
        validateStyleProperties({ unknownProp: "value" });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it("should handle null/undefined", () => {
        expect(() => validateStyleProperties(null)).not.toThrow();
        expect(() => validateStyleProperties(undefined)).not.toThrow();
    });
});

describe("Global style pool and DEFAULT_STYLE_ID", () => {
    it("should have a global style pool singleton", () => {
        expect(stylePool).toBeInstanceOf(StylePool);
    });

    it("should have a default style ID", () => {
        expect(DEFAULT_STYLE_ID).toBeGreaterThan(0);
    });

    it("should return default style from DEFAULT_STYLE_ID", () => {
        const style = stylePool.getStyle(DEFAULT_STYLE_ID);
        expect(style.fontFamily).toBe("Microsoft YaHei");
        expect(style.fontSize).toBe(14);
        expect(style.color).toBe("#000");
    });
});