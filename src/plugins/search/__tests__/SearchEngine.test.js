/**
 * SearchEngine 单元测试
 *
 * 覆盖设计文档 10.1 章节的所有用例
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SearchEngine } from "../SearchEngine.js";

describe("SearchEngine", () => {
    let engine;

    beforeEach(() => {
        engine = new SearchEngine();
    });

    describe("基础文本搜索", () => {
        it("应正确执行简单文本搜索", async () => {
            const data = [
                { row: 0, col: 0, value: "Hello World" },
                { row: 1, col: 0, value: "Hello Canvas" },
                { row: 2, col: 0, value: "Goodbye" },
            ];

            const results = await engine.executeQuery(data, "Hello");

            expect(results).toHaveLength(2);
            expect(results[0]).toMatchObject({ row: 0, col: 0 });
            expect(results[1]).toMatchObject({ row: 1, col: 0 });
        });

        it("应支持大小写不敏感搜索（默认）", async () => {
            const data = [
                { row: 0, col: 0, value: "Hello" },
                { row: 1, col: 0, value: "hello" },
                { row: 2, col: 0, value: "HELLO" },
            ];

            const results = await engine.executeQuery(data, "hello");

            expect(results).toHaveLength(3);
        });

        it("应返回空结果当无匹配时", async () => {
            const data = [
                { row: 0, col: 0, value: "Hello World" },
            ];

            const results = await engine.executeQuery(data, "xyz");

            expect(results).toHaveLength(0);
        });

        it("应处理空数据数组", async () => {
            const results = await engine.executeQuery([], "test");

            expect(results).toHaveLength(0);
        });
    });

    describe("高级搜索选项", () => {
        it("应支持大小写敏感搜索", async () => {
            const data = [
                { row: 0, col: 0, value: "Hello" },
                { row: 1, col: 0, value: "hello" },
                { row: 2, col: 0, value: "HELLO" },
            ];

            const results = await engine.executeQuery(data, "Hello", {
                caseSensitive: true,
            });

            expect(results).toHaveLength(1);
            expect(results[0].row).toBe(0);
        });

        it("应支持全词匹配", async () => {
            const data = [
                { row: 0, col: 0, value: "cat" },
                { row: 1, col: 0, value: "category" },
                { row: 2, col: 0, value: "the cat sat" },
            ];

            const results = await engine.executeQuery(data, "cat", {
                wholeWord: true,
            });

            // 应匹配 "cat" 和 "the cat sat" 中的 "cat"，但不匹配 "category"
            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.length).toBeLessThanOrEqual(2); // 排除 category
        });

        it("应支持正则表达式搜索", async () => {
            const data = [
                { row: 0, col: 0, value: "abc123" },
                { row: 1, col: 0, value: "xyz456" },
                { row: 2, col: 0, value: "no numbers" },
            ];

            const results = await engine.executeQuery(
                data,
                "\\d+",
                { useRegex: true }
            );

            expect(results).toHaveLength(2);
        });

        it("应处理无效正则表达式（不抛异常）", async () => {
            const data = [
                { row: 0, col: 0, value: "test" },
            ];

            // 不应抛出异常，而是返回空结果
            const results = await engine.executeQuery(
                data,
                "[invalid regex",
                { useRegex: true }
            );

            expect(results).toHaveLength(0);
        });
    });

    describe("性能和边界情况", () => {
        it("应在结果过多时截断至 maxResults", async () => {
            // 创建大量包含相同关键词的数据
            const data = Array.from({ length: 20000 }, (_, i) => ({
                row: i,
                col: 0,
                value: "test value",
            }));

            const results = await engine.executeQuery(data, "test");

            // 默认最大值是 10000
            expect(results.length).toBeLessThanOrEqual(10000);
        });

        it("应正确处理空字符串查询", async () => {
            const data = [
                { row: 0, col: 0, value: "Hello" },
            ];

            const results = await engine.executeQuery(data, "");

            expect(results).toHaveLength(0);
        });

        it("应正确处理特殊字符", async () => {
            const data = [
                { row: 0, col: 0, value: "price: $100.00" },
                { row: 1, col: 0, value: "email@test.com" },
                { row: 2, col: 0, value: "path\\to\\file" },
            ];

            const results = await engine.executeQuery(data, "$100");

            expect(results).toHaveLength(1);
            expect(results[0].row).toBe(0);
        });

        it("应支持 Unicode 字符搜索", async () => {
            const data = [
                { row: 0, col: 0, value: "你好世界" },
                { row: 1, col: 0, value: "こんにちは" },
                { row: 2, col: 0, value: "Hello 你好" },
            ];

            const results = await engine.executeQuery(data, "你好");

            expect(results).toHaveLength(2); // 匹配第 0 行和第 2 行
        });

        it("应记录正确的 matchIndex 和 matchLength", async () => {
            const data = [
                { row: 0, col: 0, value: "Hello World Hello" },
            ];

            const results = await engine.executeQuery(data, "Hello");

            // 应找到 2 个匹配项
            expect(results).toHaveLength(2);

            // 第一个匹配在位置 0
            expect(results[0].matchIndex).toBe(0);
            expect(results[0].matchLength).toBe(5);

            // 第二个匹配在位置 12 ("Hello World " 的长度)
            expect(results[1].matchIndex).toBe(12);
            expect(results[1].matchLength).toBe(5);
        });
    });
});