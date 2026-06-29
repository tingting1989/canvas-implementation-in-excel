import { describe, it, expect, beforeEach } from "vitest";
import { Sheet } from "../../src/workbook/Sheet.js";
import { stylePool } from "../../src/model/styles/index.js";

describe("Workbook - defaultStyle inheritance", () => {
    it("should apply top-level defaultStyle to all sheets via Sheet.setDefaultStyle", () => {
        const sheet1 = new Sheet("Sheet1");
        const sheet2 = new Sheet("Sheet2");
        const globalStyle = { fontSize: 14, color: "#000" };

        sheet1.setDefaultStyle(globalStyle);
        sheet2.setDefaultStyle(globalStyle);

        const style1 = sheet1.resolveStyle(0, 0);
        const style2 = sheet2.resolveStyle(0, 0);
        expect(style1.fontSize).toBe(14);
        expect(style1.color).toBe("#000");
        expect(style2.fontSize).toBe(14);
        expect(style2.color).toBe("#000");
    });

    it("should deep-merge sheet-level defaultStyle over workbook-level", () => {
        const sheet = new Sheet("Sheet1");
        sheet.setDefaultStyle({ fontSize: 14, color: "#000" });
        sheet.setDefaultStyle({ fontSize: 14, color: "#333", backgroundColor: "#fff" });

        const style = sheet.resolveStyle(0, 0);
        expect(style.fontSize).toBe(14);
        expect(style.color).toBe("#333");
        expect(style.backgroundColor).toBe("#fff");
    });

    it("should use sheet-level defaultStyle alone when no workbook-level", () => {
        const sheet = new Sheet("Sheet1");
        sheet.setDefaultStyle({ fontSize: 16, fontWeight: "bold" });

        const style = sheet.resolveStyle(0, 0);
        expect(style.fontSize).toBe(16);
        expect(style.fontWeight).toBe("bold");
    });

    it("should fall back to DEFAULT_STYLE when no defaultStyle configured", () => {
        const sheet = new Sheet("Sheet1");
        const style = sheet.resolveStyle(0, 0);
        expect(style).toBeDefined();
        expect(typeof style).toBe("object");
    });

    it("should not affect other sheets when one sheet changes its defaultStyle at runtime", () => {
        const sheet1 = new Sheet("Sheet1");
        const sheet2 = new Sheet("Sheet2");

        sheet1.setDefaultStyle({ fontSize: 14 });
        sheet2.setDefaultStyle({ fontSize: 12 });

        sheet1.setDefaultStyle({ fontSize: 18 });

        const style2 = sheet2.resolveStyle(0, 0);
        expect(style2.fontSize).toBe(12);
    });

    it("should preserve flat style structure during merge", () => {
        const sheet = new Sheet("Sheet1");
        sheet.setDefaultStyle({ fontSize: 14, color: "#000" });
        sheet.setDefaultStyle({ color: "#333" });

        const style = sheet.resolveStyle(0, 0);
        expect(style.fontSize).toBe(14);
        expect(style.color).toBe("#333");
    });

    it("should return default style via getDefaultStyle", () => {
        const sheet = new Sheet("Sheet1");
        sheet.setDefaultStyle({ fontSize: 14 });
        const defaultStyle = sheet.getDefaultStyle();
        expect(defaultStyle.fontSize).toBe(14);
    });
});