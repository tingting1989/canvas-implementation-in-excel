import { describe, it, expect } from "vitest";
import { parseFormula, colToIndex, indexToCol } from "@/formula/FormulaParser";

describe("FormulaParser - colToIndex", () => {
    it("should convert A to 0", () => {
        expect(colToIndex("A")).toBe(0);
    });

    it("should convert B to 1", () => {
        expect(colToIndex("B")).toBe(1);
    });

    it("should convert Z to 25", () => {
        expect(colToIndex("Z")).toBe(25);
    });

    it("should convert AA to 26", () => {
        expect(colToIndex("AA")).toBe(26);
    });

    it("should convert AB to 27", () => {
        expect(colToIndex("AB")).toBe(27);
    });

    it("should convert AZ to 51", () => {
        expect(colToIndex("AZ")).toBe(51);
    });

    it("should convert BA to 52", () => {
        expect(colToIndex("BA")).toBe(52);
    });

    it("should convert ZZ to 701", () => {
        expect(colToIndex("ZZ")).toBe(701);
    });

    it("should convert AAA to 702", () => {
        expect(colToIndex("AAA")).toBe(702);
    });

    it("should be case-insensitive", () => {
        expect(colToIndex("a")).toBe(0);
        expect(colToIndex("aa")).toBe(26);
        expect(colToIndex("Aa")).toBe(26);
    });
});

describe("FormulaParser - indexToCol", () => {
    it("should convert 0 to A", () => {
        expect(indexToCol(0)).toBe("A");
    });

    it("should convert 1 to B", () => {
        expect(indexToCol(1)).toBe("B");
    });

    it("should convert 25 to Z", () => {
        expect(indexToCol(25)).toBe("Z");
    });

    it("should convert 26 to AA", () => {
        expect(indexToCol(26)).toBe("AA");
    });

    it("should convert 27 to AB", () => {
        expect(indexToCol(27)).toBe("AB");
    });

    it("should convert 701 to ZZ", () => {
        expect(indexToCol(701)).toBe("ZZ");
    });

    it("should convert 702 to AAA", () => {
        expect(indexToCol(702)).toBe("AAA");
    });
});

describe("FormulaParser - colToIndex/indexToCol roundtrip", () => {
    it("should be idempotent for indices 0-100", () => {
        for (let i = 0; i <= 100; i++) {
            expect(colToIndex(indexToCol(i))).toBe(i);
        }
    });

    it("should be idempotent for large indices", () => {
        for (const i of [255, 701, 702, 1000, 5000]) {
            expect(colToIndex(indexToCol(i))).toBe(i);
        }
    });
});

describe("FormulaParser - Number Literals", () => {
    it("should parse integer", () => {
        const ast = parseFormula("42");
        expect(ast).toEqual({ type: "literal", value: 42 });
    });

    it("should parse float", () => {
        const ast = parseFormula("3.14");
        expect(ast).toEqual({ type: "literal", value: 3.14 });
    });

    it("should parse zero", () => {
        const ast = parseFormula("0");
        expect(ast).toEqual({ type: "literal", value: 0 });
    });

    it("should parse decimal starting with dot", () => {
        const ast = parseFormula(".5");
        expect(ast).toEqual({ type: "literal", value: 0.5 });
    });
});

describe("FormulaParser - String Literals", () => {
    it("should parse double-quoted string", () => {
        const ast = parseFormula('"hello"');
        expect(ast).toEqual({ type: "literal", value: "hello" });
    });

    it("should parse single-quoted string", () => {
        const ast = parseFormula("'world'");
        expect(ast).toEqual({ type: "literal", value: "world" });
    });

    it("should parse empty string", () => {
        const ast = parseFormula('""');
        expect(ast).toEqual({ type: "literal", value: "" });
    });

    it("should parse string with spaces", () => {
        const ast = parseFormula('"hello world"');
        expect(ast).toEqual({ type: "literal", value: "hello world" });
    });
});

describe("FormulaParser - Cell References", () => {
    it("should parse A1", () => {
        const ast = parseFormula("A1");
        expect(ast).toEqual({ type: "cellRef", sheet: null, row: 0, col: 0 });
    });

    it("should parse B5", () => {
        const ast = parseFormula("B5");
        expect(ast).toEqual({ type: "cellRef", sheet: null, row: 4, col: 1 });
    });

    it("should parse AA10", () => {
        const ast = parseFormula("AA10");
        expect(ast).toEqual({ type: "cellRef", sheet: null, row: 9, col: 26 });
    });

    it("should parse lowercase cell ref", () => {
        const ast = parseFormula("a1");
        expect(ast).toEqual({ type: "cellRef", sheet: null, row: 0, col: 0 });
    });
});

describe("FormulaParser - Range References", () => {
    it("should parse A1:B10", () => {
        const ast = parseFormula("A1:B10");
        expect(ast).toEqual({
            type: "rangeRef",
            sheet: null,
            topRow: 0,
            topCol: 0,
            bottomRow: 9,
            bottomCol: 1,
        });
    });

    it("should normalize reversed range B10:A1", () => {
        const ast = parseFormula("B10:A1");
        expect(ast).toEqual({
            type: "rangeRef",
            sheet: null,
            topRow: 0,
            topCol: 0,
            bottomRow: 9,
            bottomCol: 1,
        });
    });

    it("should parse large range", () => {
        const ast = parseFormula("A1:ZZ100");
        expect(ast.type).toBe("rangeRef");
        expect(ast.topRow).toBe(0);
        expect(ast.topCol).toBe(0);
        expect(ast.bottomRow).toBe(99);
        expect(ast.bottomCol).toBe(701);
    });
});

describe("FormulaParser - Sheet References", () => {
    it("should parse Sheet2!A1", () => {
        const ast = parseFormula("Sheet2!A1");
        expect(ast).toEqual({ type: "cellRef", sheet: "Sheet2", row: 0, col: 0 });
    });

    it("should parse Sheet2!A1:B10", () => {
        const ast = parseFormula("Sheet2!A1:B10");
        expect(ast.type).toBe("rangeRef");
        expect(ast.sheet).toBe("Sheet2");
        expect(ast.topRow).toBe(0);
        expect(ast.topCol).toBe(0);
        expect(ast.bottomRow).toBe(9);
        expect(ast.bottomCol).toBe(1);
    });
});

describe("FormulaParser - Function Calls", () => {
    it("should parse SUM(A1:A10)", () => {
        const ast = parseFormula("SUM(A1:A10)");
        expect(ast).toEqual({
            type: "function",
            name: "SUM",
            args: [
                {
                    type: "rangeRef",
                    sheet: null,
                    topRow: 0,
                    topCol: 0,
                    bottomRow: 9,
                    bottomCol: 0,
                },
            ],
        });
    });

    it("should parse IF(A1>0, \"yes\", \"no\")", () => {
        const ast = parseFormula('IF(A1>0,"yes","no")');
        expect(ast.type).toBe("function");
        expect(ast.name).toBe("IF");
        expect(ast.args).toHaveLength(3);
    });

    it("should parse nested function SUM(AVERAGE(B1:B5))", () => {
        const ast = parseFormula("SUM(AVERAGE(B1:B5))");
        expect(ast.type).toBe("function");
        expect(ast.name).toBe("SUM");
        expect(ast.args[0].type).toBe("function");
        expect(ast.args[0].name).toBe("AVERAGE");
    });

    it("should parse function with no args", () => {
        const ast = parseFormula("RAND()");
        expect(ast).toEqual({
            type: "function",
            name: "RAND",
            args: [],
        });
    });

    it("should parse function with multiple args", () => {
        const ast = parseFormula("SUM(1,2,3)");
        expect(ast.type).toBe("function");
        expect(ast.name).toBe("SUM");
        expect(ast.args).toHaveLength(3);
    });
});

describe("FormulaParser - Arithmetic Operators", () => {
    it("should parse addition", () => {
        const ast = parseFormula("1+2");
        expect(ast).toEqual({
            type: "binaryOp",
            operator: "+",
            left: { type: "literal", value: 1 },
            right: { type: "literal", value: 2 },
        });
    });

    it("should respect operator precedence: * before +", () => {
        const ast = parseFormula("1+2*3");
        expect(ast.operator).toBe("+");
        expect(ast.left.value).toBe(1);
        expect(ast.right.operator).toBe("*");
    });

    it("should respect right-associativity of ^", () => {
        const ast = parseFormula("2^3^2");
        expect(ast.operator).toBe("^");
        expect(ast.left.value).toBe(2);
        expect(ast.right.operator).toBe("^");
    });

    it("should parse parenthesized expression", () => {
        const ast = parseFormula("(1+2)*3");
        expect(ast.operator).toBe("*");
        expect(ast.left.operator).toBe("+");
    });

    it("should parse unary minus", () => {
        const ast = parseFormula("-5");
        expect(ast).toEqual({
            type: "unaryOp",
            operator: "-",
            operand: { type: "literal", value: 5 },
        });
    });

    it("should parse all arithmetic operators", () => {
        for (const op of ["+", "-", "*", "/", "^", "&"]) {
            const ast = parseFormula(`1${op}2`);
            expect(ast.type).toBe("binaryOp");
            expect(ast.operator).toBe(op);
        }
    });
});

describe("FormulaParser - Comparison Operators", () => {
    it("should parse =", () => {
        const ast = parseFormula("A1=B1");
        expect(ast.operator).toBe("=");
    });

    it("should parse <>", () => {
        const ast = parseFormula("A1<>B1");
        expect(ast.operator).toBe("<>");
    });

    it("should parse <=", () => {
        const ast = parseFormula("A1<=B1");
        expect(ast.operator).toBe("<=");
    });

    it("should parse >=", () => {
        const ast = parseFormula("A1>=B1");
        expect(ast.operator).toBe(">=");
    });

    it("should parse <", () => {
        const ast = parseFormula("A1<B1");
        expect(ast.operator).toBe("<");
    });

    it("should parse >", () => {
        const ast = parseFormula("A1>B1");
        expect(ast.operator).toBe(">");
    });
});

describe("FormulaParser - Whitespace Handling", () => {
    it("should skip spaces", () => {
        const ast = parseFormula("1 + 2");
        expect(ast).toEqual({
            type: "binaryOp",
            operator: "+",
            left: { type: "literal", value: 1 },
            right: { type: "literal", value: 2 },
        });
    });

    it("should skip tabs", () => {
        const ast = parseFormula("1\t+\t2");
        expect(ast.type).toBe("binaryOp");
    });

    it("should skip newlines", () => {
        const ast = parseFormula("1\n+\n2");
        expect(ast.type).toBe("binaryOp");
    });
});

describe("FormulaParser - Complex Expressions", () => {
    it("should parse mixed arithmetic and comparison", () => {
        const ast = parseFormula("A1+B1>C1");
        expect(ast.operator).toBe(">");
        expect(ast.left.operator).toBe("+");
    });

    it("should parse string concatenation with &", () => {
        const ast = parseFormula('"Hello"&" "&"World"');
        expect(ast.operator).toBe("&");
    });

    it("should parse complex IF with nested expressions", () => {
        const ast = parseFormula('IF(A1>0,SUM(B1:B10),0)');
        expect(ast.type).toBe("function");
        expect(ast.name).toBe("IF");
        expect(ast.args).toHaveLength(3);
        expect(ast.args[0].operator).toBe(">");
        expect(ast.args[1].name).toBe("SUM");
    });
});

describe("FormulaParser - Edge Cases", () => {
    it("should parse empty formula as empty literal", () => {
        const ast = parseFormula("");
        expect(ast).toEqual({ type: "literal", value: "" });
    });

    it("should throw for unexpected token", () => {
        expect(() => parseFormula("!!!")).toThrow();
    });

    it("should throw for unmatched parenthesis", () => {
        expect(() => parseFormula("(1+2")).toThrow();
    });

    it("should throw for missing function closing paren", () => {
        expect(() => parseFormula("SUM(1,2")).toThrow();
    });
});