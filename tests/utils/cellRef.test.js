import { describe, it, expect } from "vitest";
import { indexToCol, colToIndex } from "@/utils/cellRef.js";

describe("cellRef 工具函数", () => {
    describe("indexToCol — 列索引转列字母", () => {
        it("CR-01: 0 → A", () => {
            expect(indexToCol(0)).toBe("A");
        });

        it("CR-02: 25 → Z", () => {
            expect(indexToCol(25)).toBe("Z");
        });

        it("CR-03: 26 → AA", () => {
            expect(indexToCol(26)).toBe("AA");
        });

        it("CR-04: 27 → AB", () => {
            expect(indexToCol(27)).toBe("AB");
        });

        it("CR-05: 51 → AZ", () => {
            expect(indexToCol(51)).toBe("AZ");
        });

        it("CR-06: 52 → BA", () => {
            expect(indexToCol(52)).toBe("BA");
        });

        it("CR-07: 701 → ZZ", () => {
            expect(indexToCol(701)).toBe("ZZ");
        });

        it("CR-08: 702 → AAA", () => {
            expect(indexToCol(702)).toBe("AAA");
        });

        it("CR-09: 703 → AAB", () => {
            expect(indexToCol(703)).toBe("AAB");
        });

        it("CR-10: 与 HeaderLabelManager 新增列一致 — 递增序列", () => {
            const cases = [
                [0, "A"], [1, "B"], [2, "C"],
                [24, "Y"], [25, "Z"],
                [26, "AA"], [27, "AB"],
                [50, "AY"], [51, "AZ"],
                [52, "BA"], [53, "BB"],
            ];
            for (const [index, expected] of cases) {
                expect(indexToCol(index)).toBe(expected);
            }
        });
    });

    describe("colToIndex — 列字母转列索引", () => {
        it("CR-11: A → 0", () => {
            expect(colToIndex("A")).toBe(0);
        });

        it("CR-12: Z → 25", () => {
            expect(colToIndex("Z")).toBe(25);
        });

        it("CR-13: AA → 26", () => {
            expect(colToIndex("AA")).toBe(26);
        });

        it("CR-14: AB → 27", () => {
            expect(colToIndex("AB")).toBe(27);
        });

        it("CR-15: ZZ → 701", () => {
            expect(colToIndex("ZZ")).toBe(701);
        });

        it("CR-16: AAA → 702", () => {
            expect(colToIndex("AAA")).toBe(702);
        });

        it("CR-17: 小写输入不区分大小写", () => {
            expect(colToIndex("aa")).toBe(26);
            expect(colToIndex("zz")).toBe(701);
            expect(colToIndex("aaa")).toBe(702);
        });
    });

    describe("indexToCol ↔ colToIndex 双向一致性", () => {
        it("CR-18: 0~1000 双向转换一致", () => {
            for (let i = 0; i <= 1000; i++) {
                expect(colToIndex(indexToCol(i))).toBe(i);
            }
        });

        it("CR-19: 常用列字母双向转换一致", () => {
            const labels = ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA", "AAZ", "ABA"];
            for (const label of labels) {
                expect(indexToCol(colToIndex(label))).toBe(label);
            }
        });
    });
});