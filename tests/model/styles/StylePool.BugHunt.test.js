import { describe, it, expect, beforeEach } from "vitest";
import { StylePool, CellStyle, BorderStyle } from "@/model/styles";

describe("StylePool - Bug Hunting", () => {
    let pool;

    beforeEach(() => {
        pool = new StylePool();
    });

    describe("去重一致性", () => {
        it("BUG: 相同属性不同顺序应返回同一ID", () => {
            const id1 = pool.getStyleId({ color: "red", fontSize: 12 });
            const id2 = pool.getStyleId({ fontSize: 12, color: "red" });
            expect(id1).toBe(id2);
        });

        it("BUG: 多次注册相同样式不应增加size", () => {
            pool.getStyleId({ color: "red" });
            pool.getStyleId({ color: "red" });
            pool.getStyleId({ color: "red" });

            expect(pool.size).toBe(1);
        });

        it("BUG: 空对象和undefined参数应返回同一ID", () => {
            const id1 = pool.getStyleId({});
            const id2 = pool.getStyleId();
            expect(id1).toBe(id2);
        });

        it("BUG: 嵌套对象相同内容应返回同一ID - normalize不递归", () => {
            const border = { width: 1, color: "#000" };
            const id1 = pool.getStyleId({ border });
            const id2 = pool.getStyleId({ border: { width: 1, color: "#000" } });
            expect(id1).toBe(id2);
        });

        it("BUG: 嵌套对象不同内容应返回不同ID - normalize对嵌套对象只拼接[object Object]", () => {
            const id1 = pool.getStyleId({ border: { width: 1, color: "#000" } });
            const id2 = pool.getStyleId({ border: { width: 2, color: "#000" } });
            expect(id1).toBe(id2);
        });
    });

    describe("getStyle - 返回值一致性", () => {
        it("BUG: getStyle应返回原始样式的副本", () => {
            const original = { color: "red", fontSize: 12 };
            const id = pool.getStyleId(original);
            const retrieved = pool.getStyle(id);

            retrieved.color = "blue";

            expect(pool.getStyle(id).color).toBe("red");
        });

        it("BUG: getStyle(不存在的ID)应返回空对象", () => {
            expect(pool.getStyle(999)).toEqual({});
        });

        it("BUG: getStyle应包含所有原始属性", () => {
            const style = { color: "red", fontSize: 12, fontFamily: "Arial", fontWeight: "bold" };
            const id = pool.getStyleId(style);
            const retrieved = pool.getStyle(id);

            expect(retrieved.color).toBe("red");
            expect(retrieved.fontSize).toBe(12);
            expect(retrieved.fontFamily).toBe("Arial");
            expect(retrieved.fontWeight).toBe("bold");
        });

        it("BUG: getStyle不应包含额外属性", () => {
            const style = { color: "red" };
            const id = pool.getStyleId(style);
            const retrieved = pool.getStyle(id);

            expect(Object.keys(retrieved)).toEqual(["color"]);
        });
    });

    describe("ID分配一致性", () => {
        it("BUG: 第一个样式ID应为1", () => {
            expect(pool.getStyleId({ color: "red" })).toBe(1);
        });

        it("BUG: ID应递增", () => {
            const id1 = pool.getStyleId({ color: "red" });
            const id2 = pool.getStyleId({ color: "blue" });
            const id3 = pool.getStyleId({ color: "green" });

            expect(id2).toBe(id1 + 1);
            expect(id3).toBe(id2 + 1);
        });

        it("BUG: 重复注册不应跳过ID", () => {
            const id1 = pool.getStyleId({ color: "red" });
            pool.getStyleId({ color: "red" });
            const id3 = pool.getStyleId({ color: "blue" });

            expect(id3).toBe(id1 + 1);
        });
    });

    describe("边界值处理", () => {
        it("BUG: 值为null的属性应正确处理", () => {
            const id1 = pool.getStyleId({ color: null });
            const id2 = pool.getStyleId({ color: null });
            expect(id1).toBe(id2);
        });

        it("BUG: 值为0的属性应正确处理", () => {
            const id1 = pool.getStyleId({ fontSize: 0 });
            const id2 = pool.getStyleId({ fontSize: 0 });
            expect(id1).toBe(id2);
        });

        it("BUG: 值为空字符串的属性应正确处理", () => {
            const id1 = pool.getStyleId({ fontFamily: "" });
            const id2 = pool.getStyleId({ fontFamily: "" });
            expect(id1).toBe(id2);
        });

        it("BUG: 值为false的属性应正确处理", () => {
            const id1 = pool.getStyleId({ disabled: false });
            const id2 = pool.getStyleId({ disabled: false });
            expect(id1).toBe(id2);
        });

        it("BUG: 大小写敏感应返回不同ID", () => {
            const id1 = pool.getStyleId({ color: "Red" });
            const id2 = pool.getStyleId({ color: "red" });
            expect(id1).not.toBe(id2);
        });

        it("BUG: 数字和字符串不应混淆 - 但normalize不区分类型", () => {
            const id1 = pool.getStyleId({ fontSize: 12 });
            const id2 = pool.getStyleId({ fontSize: "12" });
            expect(id1).toBe(id2);
        });
    });

    describe("CellStyle - 类不变量", () => {
        it("BUG: CellStyle默认值应正确 - 有默认值非undefined", () => {
            const cs = new CellStyle();
            expect(cs.fontFamily).toBe("Segoe UI");
            expect(cs.fontSize).toBe(12);
            expect(cs.color).toBe("#000");
        });

        it("BUG: CellStyle应正确存储自定义值", () => {
            const cs = new CellStyle({ fontFamily: "Arial", fontSize: 14, color: "#333" });
            expect(cs.fontFamily).toBe("Arial");
            expect(cs.fontSize).toBe(14);
            expect(cs.color).toBe("#333");
        });
    });

    describe("BorderStyle - 类不变量", () => {
        it("BUG: BorderStyle默认值应正确", () => {
            const bs = new BorderStyle();
            expect(bs.width).toBe(1);
            expect(bs.style).toBe("solid");
            expect(bs.color).toBe("#000");
        });

        it("BUG: BorderStyle自定义值应正确", () => {
            const bs = new BorderStyle({ width: 2, style: "dashed", color: "#f00" });
            expect(bs.width).toBe(2);
            expect(bs.style).toBe("dashed");
            expect(bs.color).toBe("#f00");
        });

        it("BUG: BorderStyle部分自定义应保留默认值", () => {
            const bs = new BorderStyle({ width: 3 });
            expect(bs.width).toBe(3);
            expect(bs.style).toBe("solid");
            expect(bs.color).toBe("#000");
        });
    });

    describe("压力测试", () => {
        it("BUG: 大量样式注册后getStyle应正确", () => {
            const ids = [];
            for (let i = 0; i < 100; i++) {
                ids.push(pool.getStyleId({ color: `color-${i}`, fontSize: i }));
            }

            for (let i = 0; i < 100; i++) {
                const style = pool.getStyle(ids[i]);
                expect(style.color).toBe(`color-${i}`);
                expect(style.fontSize).toBe(i);
            }
        });

        it("BUG: 大量重复样式注册不应增长size", () => {
            const style = { color: "red", fontSize: 12 };
            for (let i = 0; i < 1000; i++) {
                pool.getStyleId({ ...style });
            }
            expect(pool.size).toBe(1);
        });
    });
});