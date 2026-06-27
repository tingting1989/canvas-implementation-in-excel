import { describe, it, expect } from "vitest";
import { BaseColumnType } from "@/types/BaseColumnType";
import { NumericColumnType } from "@/types/NumericColumnType";
import { getType, registerType, getRegisteredTypes, resolveCellType, formatValue, parseValue, validateValue } from "@/types";

describe("BaseColumnType - Base Class", () => {
    it("should have default name 'text'", () => {
        const ct = new BaseColumnType();
        expect(ct.name).toBe("text");
    });

    it("should have default editorType 'text'", () => {
        const ct = new BaseColumnType();
        expect(ct.editorType).toBe("text");
    });

    it("should format value as string", () => {
        const ct = new BaseColumnType();
        expect(ct.format(42)).toBe("42");
        expect(ct.format("hello")).toBe("hello");
    });

    it("should return empty string for null/undefined in format", () => {
        const ct = new BaseColumnType();
        expect(ct.format(null)).toBe("");
        expect(ct.format(undefined)).toBe("");
    });

    it("should validate as true by default", () => {
        const ct = new BaseColumnType();
        expect(ct.validate("anything")).toBe(true);
    });

    it("should parse input as-is by default", () => {
        const ct = new BaseColumnType();
        expect(ct.parse("hello")).toBe("hello");
    });

    it("should return base style from getDefaultStyle", () => {
        const ct = new BaseColumnType();
        const base = { color: "red" };
        expect(ct.getDefaultStyle(base)).toBe(base);
    });

    it("should return empty editor options", () => {
        const ct = new BaseColumnType();
        expect(ct.getEditorOptions()).toEqual({});
    });

    it("should return empty string as default value", () => {
        const ct = new BaseColumnType();
        expect(ct.getDefaultValue()).toBe("");
    });

    it("should compare strings", () => {
        const ct = new BaseColumnType();
        expect(ct.compare("a", "b")).toBeLessThan(0);
        expect(ct.compare("b", "a")).toBeGreaterThan(0);
    });

    it("should reverse comparison for desc order", () => {
        const ct = new BaseColumnType();
        expect(ct.compare("a", "b", "desc")).toBeGreaterThan(0);
    });
});

describe("NumericColumnType - Format", () => {
    it("should return empty string for null/undefined", () => {
        const nct = new NumericColumnType();
        expect(nct.format(null)).toBe("");
        expect(nct.format(undefined)).toBe("");
    });

    it("should format number as string by default", () => {
        const nct = new NumericColumnType();
        expect(nct.format(42)).toBe("42");
    });

    it("should format with thousand separator", () => {
        const nct = new NumericColumnType({ numericFormat: { pattern: "0,0" } });
        expect(nct.format(1234)).toBe("1,234");
    });

    it("should format with decimal places", () => {
        const nct = new NumericColumnType({ numericFormat: { pattern: "0,0.00" } });
        expect(nct.format(1234.5)).toBe("1,234.50");
    });

    it("should format as percentage", () => {
        const nct = new NumericColumnType({ numericFormat: { pattern: "0%" } });
        expect(nct.format(0.5)).toBe("50%");
    });

    it("should format as percentage with decimals", () => {
        const nct = new NumericColumnType({ numericFormat: { pattern: "0.00%" } });
        expect(nct.format(0.5)).toBe("50.00%");
    });

    it("should format as currency", () => {
        const nct = new NumericColumnType({ numericFormat: { pattern: "$0,0.00" } });
        expect(nct.format(1234.5)).toBe("$1,234.50");
    });

    it("should format with scientific notation", () => {
        const nct = new NumericColumnType({ numericFormat: { pattern: "0.00E+00" } });
        expect(nct.format(1234)).toBe("1.23e+3");
    });

    it("should handle string numbers", () => {
        const nct = new NumericColumnType();
        expect(nct.format("42")).toBe("42");
    });

    it("should return original string for NaN", () => {
        const nct = new NumericColumnType();
        expect(nct.format("abc")).toBe("abc");
    });
});

describe("NumericColumnType - Validate", () => {
    it("should validate numbers as true", () => {
        const nct = new NumericColumnType();
        expect(nct.validate(42)).toBe(true);
    });

    it("should validate empty values as true", () => {
        const nct = new NumericColumnType();
        expect(nct.validate("")).toBe(true);
        expect(nct.validate(null)).toBe(true);
    });

    it("should reject non-numeric strings", () => {
        const nct = new NumericColumnType();
        expect(nct.validate("abc")).toBe(false);
    });

    it("should enforce min constraint", () => {
        const nct = new NumericColumnType({ min: 10 });
        expect(nct.validate(5)).toContain("不能小于");
        expect(nct.validate(15)).toBe(true);
    });

    it("should enforce max constraint", () => {
        const nct = new NumericColumnType({ max: 100 });
        expect(nct.validate(150)).toContain("不能大于");
        expect(nct.validate(50)).toBe(true);
    });

    it("should return 'invalid' with allowInvalid", () => {
        const nct = new NumericColumnType({ allowInvalid: true });
        expect(nct.validate("abc")).toBe("invalid");
    });
});

describe("NumericColumnType - Parse", () => {
    it("should parse numeric strings to numbers", () => {
        const nct = new NumericColumnType();
        expect(nct.parse("42")).toBe(42);
    });

    it("should parse strings with commas", () => {
        const nct = new NumericColumnType();
        expect(nct.parse("1,234")).toBe(1234);
    });

    it("should return empty string for empty input", () => {
        const nct = new NumericColumnType();
        expect(nct.parse("")).toBe("");
    });

    it("should return original input for non-numeric", () => {
        const nct = new NumericColumnType();
        expect(nct.parse("abc")).toBe("abc");
    });
});

describe("NumericColumnType - Compare", () => {
    it("should compare numbers in ascending order", () => {
        const nct = new NumericColumnType();
        expect(nct.compare(1, 2)).toBeLessThan(0);
        expect(nct.compare(2, 1)).toBeGreaterThan(0);
    });

    it("should compare numbers in descending order", () => {
        const nct = new NumericColumnType();
        expect(nct.compare(1, 2, "desc")).toBeGreaterThan(0);
    });

    it("should handle NaN as -Infinity", () => {
        const nct = new NumericColumnType();
        expect(nct.compare(NaN, 1)).toBeLessThan(0);
    });
});

describe("NumericColumnType - Default Style", () => {
    it("should return right-aligned style", () => {
        const nct = new NumericColumnType();
        const style = nct.getDefaultStyle({ color: "black" });
        expect(style.textAlign).toBe("right");
        expect(style.color).toBe("black");
    });
});

describe("Type Registry", () => {
    it("should have text type registered", () => {
        const t = getType("text");
        expect(t.name).toBe("text");
    });

    it("should have numeric type registered", () => {
        const t = getType("numeric");
        expect(t.name).toBe("numeric");
    });

    it("should fall back to text for unknown type", () => {
        const t = getType("nonexistent");
        expect(t.name).toBe("text");
    });

    it("should create new instance with options", () => {
        const t = getType("numeric", { min: 0, max: 100 });
        expect(t.options.min).toBe(0);
        expect(t.options.max).toBe(100);
    });

    it("should register and retrieve custom type", () => {
        class CustomType extends BaseColumnType {
            get name() { return "custom"; }
        }
        registerType(new CustomType());
        const t = getType("custom");
        expect(t.name).toBe("custom");
    });

    it("should list all registered types", () => {
        const types = getRegisteredTypes();
        expect(types).toContain("text");
        expect(types).toContain("numeric");
    });
});

describe("resolveCellType", () => {
    it("should return text type by default", () => {
        const ct = resolveCellType(0, 0, new Map(), new Map());
        expect(ct.name).toBe("text");
    });

    it("should prefer cell-level type over column-level", () => {
        const cellTypes = new Map();
        cellTypes.set("0,0", { name: "numeric", options: {} });
        const columnsConfig = new Map();
        columnsConfig.set(0, { type: "text" });
        const ct = resolveCellType(0, 0, cellTypes, columnsConfig);
        expect(ct.name).toBe("numeric");
    });

    it("should use column-level type when no cell-level type", () => {
        const columnsConfig = new Map();
        columnsConfig.set(0, { type: "numeric" });
        const ct = resolveCellType(0, 0, new Map(), columnsConfig);
        expect(ct.name).toBe("numeric");
    });
});

describe("formatValue / parseValue / validateValue", () => {
    it("should format value using type", () => {
        const nct = new NumericColumnType({ numericFormat: { pattern: "0,0.00" } });
        expect(formatValue(nct, 1234)).toBe("1,234.00");
    });

    it("should return empty string for null/undefined", () => {
        expect(formatValue(null, null)).toBe("");
    });

    it("should parse value using type", () => {
        const nct = new NumericColumnType();
        expect(parseValue(nct, "42")).toBe(42);
    });

    it("should validate value using type", () => {
        const nct = new NumericColumnType({ min: 0 });
        expect(validateValue(nct, -1, null)).toContain("不能小于");
        expect(validateValue(nct, 5, null)).toBe(true);
    });

    it("should use custom validator from colConfig", () => {
        const ct = new BaseColumnType();
        const colConfig = { validator: (v) => v === "ok" };
        expect(validateValue(ct, "ok", colConfig)).toBe(true);
        expect(validateValue(ct, "bad", colConfig)).toBe(false);
    });
});