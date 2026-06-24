import { describe, it, expect } from "vitest";
import { StylePool, BorderStyle, CellStyle } from "@/model/styles";

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

describe("BorderStyle", () => {
    it("should have default values", () => {
        const bs = new BorderStyle();
        expect(bs.width).toBe(1);
        expect(bs.style).toBe("solid");
        expect(bs.color).toBe("#000");
    });

    it("should accept custom values", () => {
        const bs = new BorderStyle({ width: 2, style: "dashed", color: "#f00" });
        expect(bs.width).toBe(2);
        expect(bs.style).toBe("dashed");
        expect(bs.color).toBe("#f00");
    });

    it("should accept partial overrides", () => {
        const bs = new BorderStyle({ width: 3 });
        expect(bs.width).toBe(3);
        expect(bs.style).toBe("solid");
    });
});

describe("CellStyle", () => {
    it("should have default values", () => {
        const cs = new CellStyle();
        expect(cs.fontFamily).toBe("Segoe UI");
        expect(cs.fontSize).toBe(12);
        expect(cs.fontWeight).toBe("normal");
        expect(cs.color).toBe("#000");
        expect(cs.backgroundColor).toBe("transparent");
        expect(cs.textAlign).toBe("left");
        expect(cs.verticalAlign).toBe("middle");
        expect(cs.border).toBeNull();
    });

    it("should accept custom values", () => {
        const cs = new CellStyle({
            fontFamily: "Arial",
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            backgroundColor: "#fff",
            textAlign: "center",
            verticalAlign: "top",
            border: new BorderStyle(),
        });
        expect(cs.fontFamily).toBe("Arial");
        expect(cs.fontSize).toBe(16);
        expect(cs.fontWeight).toBe("bold");
        expect(cs.border).not.toBeNull();
    });

    it("should accept partial overrides", () => {
        const cs = new CellStyle({ fontSize: 18 });
        expect(cs.fontSize).toBe(18);
        expect(cs.fontFamily).toBe("Segoe UI");
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