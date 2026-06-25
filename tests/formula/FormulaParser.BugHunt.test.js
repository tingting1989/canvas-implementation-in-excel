import { describe, it, expect } from "vitest";
import { parseFormula, colToIndex, indexToCol } from "@/formula/FormulaParser";

describe("FormulaParser BugHunt - colToIndex edge cases", () => {
    it("should handle very large column indices (XFD = 16384)", () => {
        expect(colToIndex("XFD")).toBe(16383);
    });

    it("should handle single letter A", () => {
        expect(colToIndex("A")).toBe(0);
    });

    it("should handle Z correctly as last of single-letter columns", () => {
        expect(colToIndex("Z")).toBe(25);
    });

    it("should handle AA as first two-letter column", () => {
        expect(colToIndex("AA")).toBe(26);
    });

    it("should handle AZ as last column starting with A in double letters", () => {
        expect(colToIndex("AZ")).toBe(51);
    });

    it("should handle BA after AZ", () => {
        expect(colToIndex("BA")).toBe(52);
    });
});

describe("FormulaParser BugHunt - indexToCol edge cases", () => {
    it("should convert 0 to A", () => {
        expect(indexToCol(0)).toBe("A");
    });

    it("should convert very large index back and forth", () => {
        for (const idx of [0, 1, 25, 26, 27, 51, 52, 701, 702, 1000, 5000, 16383]) {
            const label = indexToCol(idx);
            expect(colToIndex(label)).toBe(idx);
        }
    });
});

describe("FormulaParser BugHunt - Tokenizer abuse", () => {
    it("should handle extremely long number string", () => {
        const longNum = "9".repeat(300);
        const ast = parseFormula(longNum);
        expect(ast.type).toBe("literal");
        expect(ast.value).toBe(parseFloat(longNum));
    });

    it("should handle deeply nested parentheses", () => {
        const depth = 50;
        let expr = "1";
        for (let i = 0; i < depth; i++) {
            expr = `(${expr}+1)`;
        }
        const ast = parseFormula(expr);
        expect(ast.type).toBe("binaryOp");
    });

    it("should handle many arguments to function", () => {
        const args = Array(200).fill("1").join(",");
        const ast = parseFormula(`SUM(${args})`);
        expect(ast.type).toBe("function");
        expect(ast.args.length).toBe(200);
    });

    it("should throw for only operators with no operands", () => {
        expect(() => parseFormula("+")).toThrow();
        expect(() => parseFormula("*+")).toThrow();
    });

    it("should handle special characters in strings", () => {
        expect(parseFormula('"hello\\nworld"').value).toBe("hello\\nworld");
        expect(parseFormula('"a&b<c>d"').value).toBe("a&b<c>d");
    });

    it("should handle consecutive operators gracefully or error", () => {
        expect(() => parseFormula("1++2")).toThrow();
    });

    it("should handle trailing operator", () => {
        expect(() => parseFormula("1+")).toThrow();
    });

    it("should handle unclosed string", () => {
        const ast = parseFormula('"unclosed');
        expect(ast.type).toBe("literal");
    });

    it("should handle function name that looks like cell ref followed by paren", () => {
        const ast = parseFormula("A1(1)");
        expect(ast.type).toBe("function");
        expect(ast.name).toBe("A1");
    });

    it("should handle sheet reference with exclamation", () => {
        const ast = parseFormula("Sheet2!B5");
        expect(ast.type).toBe("cellRef");
        expect(ast.sheet).toBe("Sheet2");
        expect(ast.row).toBe(4);
        expect(ast.col).toBe(1);
    });

    it("should handle range with reversed order (normalizes)", () => {
        const ast = parseFormula("Z1:A1");
        expect(ast.topCol).toBeLessThan(ast.bottomCol);
    });

    it("should handle whitespace-only input", () => {
        const ast = parseFormula("   ");
        expect(ast.type).toBe("literal");
        expect(ast.value).toBe("");
    });

    it("should handle formula starting with minus sign", () => {
        const ast = parseFormula("-5");
        expect(ast.type).toBe("unaryOp");
        expect(ast.operator).toBe("-");
    });

    it("should handle power chain right-associativity correctly", () => {
        const ast = parseFormula("2^3^4");
        expect(ast.right.type).toBe("binaryOp");
    });

    it("should handle mixed comparison and arithmetic precedence", () => {
        const ast = parseFormula("1+2>3*4");
        expect(ast.operator).toBe(">");
    });

    it("should treat unknown word as string literal", () => {
        const ast = parseFormula("unknownword");
        expect(ast.type).toBe("literal");
        expect(ast.value).toBe("unknownword");
    });

    it("should handle ampersand concatenation", () => {
        const ast = parseFormula('"a"&"b"');
        expect(ast.operator).toBe("&");
    });

    it("should handle not-equal operator <>", () => {
        const ast = parseFormula("1<>2");
        expect(ast.operator).toBe("<>");
    });

    it("should handle complex real-world-like formula", () => {
        const ast = parseFormula('IF(AVERAGE(B1:B10)>100,SUM(C1:C10)*1.1,SUM(C1:C10))');
        expect(ast.type).toBe("function");
        expect(ast.name).toBe("IF");
    });
});