import { describe, it, expect, vi } from "vitest";
import { StylePool, CELL_STYLE_PROPERTIES, validateStyleProperties } from "@/model/styles";

describe("StylePool - getStyleId", () => {
    it("should return unique IDs for different styles", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ color: "red" });
        const id2 = pool.getStyleId({ color: "blue" });
        expect(id1).not.toBe(id2);
    });

    it("should return same ID for identical styles", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ color: "red", fontSize: 12 });
        const id2 = pool.getStyleId({ fontSize: 12, color: "red" });
        expect(id1).toBe(id2);
    });

    it("should return same ID for empty style", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({});
        const id2 = pool.getStyleId({});
        expect(id1).toBe(id2);
    });

    it("should return ID 1 for first style", () => {
        const pool = new StylePool();
        const id = pool.getStyleId({ color: "red" });
        expect(id).toBe(1);
    });

    it("should increment IDs", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ color: "red" });
        const id2 = pool.getStyleId({ color: "blue" });
        expect(id2).toBe(id1 + 1);
    });

    it("should handle default parameter", () => {
        const pool = new StylePool();
        const id = pool.getStyleId();
        expect(id).toBe(1);
    });

    it("should normalize key order", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ a: 1, b: 2 });
        const id2 = pool.getStyleId({ b: 2, a: 1 });
        expect(id1).toBe(id2);
    });

    it("should handle deep values", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ border: { width: 1, color: "#000" } });
        const id2 = pool.getStyleId({ border: { width: 1, color: "#000" } });
        expect(id1).toBe(id2);
    });

    it("should differentiate by value", () => {
        const pool = new StylePool();
        const id1 = pool.getStyleId({ color: "red" });
        const id2 = pool.getStyleId({ color: "Red" });
        expect(id1).not.toBe(id2);
    });
});

describe("StylePool - getStyle", () => {
    it("should return style object by ID", () => {
        const pool = new StylePool();
        const id = pool.getStyleId({ color: "red", fontSize: 14 });
        const style = pool.getStyle(id);
        expect(style.color).toBe("red");
        expect(style.fontSize).toBe(14);
    });

    it("should return empty object for unknown ID", () => {
        const pool = new StylePool();
        expect(pool.getStyle(999)).toEqual({});
    });

    it("should return a copy, not the original", () => {
        const pool = new StylePool();
        const id = pool.getStyleId({ color: "red" });
        const style = pool.getStyle(id);
        style.color = "blue";
        expect(pool.getStyle(id).color).toBe("red");
    });
});

describe("StylePool - size", () => {
    it("should start at 0", () => {
        const pool = new StylePool();
        expect(pool.size).toBe(0);
    });

    it("should increment with unique styles", () => {
        const pool = new StylePool();
        pool.getStyleId({ color: "red" });
        pool.getStyleId({ color: "blue" });
        expect(pool.size).toBe(2);
    });

    it("should not increment with duplicate styles", () => {
        const pool = new StylePool();
        pool.getStyleId({ color: "red" });
        pool.getStyleId({ color: "red" });
        expect(pool.size).toBe(1);
    });
});

describe("CELL_STYLE_PROPERTIES", () => {
    it("should contain core font properties", () => {
        expect(CELL_STYLE_PROPERTIES.has("fontFamily")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("fontSize")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("fontWeight")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("fontStyle")).toBe(true);
    });

    it("should contain color and alignment properties", () => {
        expect(CELL_STYLE_PROPERTIES.has("color")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("backgroundColor")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("textAlign")).toBe(true);
        expect(CELL_STYLE_PROPERTIES.has("verticalAlign")).toBe(true);
    });

    it("should contain border property", () => {
        expect(CELL_STYLE_PROPERTIES.has("border")).toBe(true);
    });
});

describe("validateStyleProperties", () => {
    it("should not warn for valid properties", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        validateStyleProperties({ color: "red", fontSize: 14 });
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("should warn for unknown properties", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        validateStyleProperties({ unknownProp: "value" });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unknownProp"));
        warnSpy.mockRestore();
    });

    it("should handle null/undefined gracefully", () => {
        expect(() => validateStyleProperties(null)).not.toThrow();
        expect(() => validateStyleProperties(undefined)).not.toThrow();
    });
});

describe("StylePool - deduplication stress test", () => {
    it("should handle many duplicate styles efficiently", () => {
        const pool = new StylePool();
        const style = { color: "red", fontSize: 12, fontFamily: "Arial" };
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(pool.getStyleId({ ...style }));
        }
        expect(ids.size).toBe(1);
        expect(pool.size).toBe(1);
    });

    it("should handle many unique styles", () => {
        const pool = new StylePool();
        for (let i = 0; i < 50; i++) {
            pool.getStyleId({ color: `color-${i}` });
        }
        expect(pool.size).toBe(50);
    });
});