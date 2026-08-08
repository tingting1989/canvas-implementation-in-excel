/**
 * SearchNavigator 单元测试
 *
 * 覆盖设计文档 10.1 章节的导航相关用例
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SearchState } from "../SearchState.js";
import { SearchNavigator } from "../SearchNavigator.js";

describe("SearchNavigator", () => {
    let state;
    let navigator;
    let mockSelectionManager;

    beforeEach(() => {
        state = new SearchState();
        
        mockSelectionManager = {
            setActive: jest.fn(),
        };
        
        navigator = new SearchNavigator(state, mockSelectionManager);
    });

    describe("goToFirst()", () => {
        it("应跳转到第一个结果", () => {
            state.setResults([
                { row: 10, col: 5, data: "test1" },
                { row: 20, col: 3, data: "test2" },
                { row: 30, col: 7, data: "test3" },
            ]);

            const result = navigator.goToFirst();

            expect(result).toMatchObject({ row: 10, col: 5 });
            expect(state.getCurrentIndex()).toBe(0);
            expect(mockSelectionManager.setActive).toHaveBeenCalledWith(10, 5);
        });

        it("应在无结果时返回 null", () => {
            state.setResults([]);

            const result = navigator.goToFirst();

            expect(result).toBeNull();
            expect(mockSelectionManager.setActive).not.toHaveBeenCalled();
        });
    });

    describe("goToNext() - 循环模式", () => {
        it("应跳转到下一个结果", () => {
            state.setResults([
                { row: 1, col: 1, data: "a" },
                { row: 2, col: 2, data: "b" },
                { row: 3, col: 3, data: "c" },
            ]);
            
            // 先到第一个
            navigator.goToFirst();

            const result = navigator.goToNext();

            expect(result).toMatchObject({ row: 2, col: 2 });
            expect(state.getCurrentIndex()).toBe(1);
        });

        it("应在最后一个时循环回到第一个", () => {
            state.setResults([
                { row: 1, col: 1, data: "a" },
                { row: 2, col: 2, data: "b" },
                { row: 3, col: 3, data: "c" },
            ]);
            
            // 设置到最后一个
            state.setCurrentIndex(2);

            const result = navigator.goToNext();

            expect(result).toMatchObject({ row: 1, col: 1 }); // 循环到第一个
            expect(state.getCurrentIndex()).toBe(0);
        });

        it("应在仅有一个结果时始终返回同一个", () => {
            state.setResults([
                { row: 5, col: 5, data: "only" },
            ]);

            const result1 = navigator.goToFirst();
            const result2 = navigator.goToNext();

            expect(result1).toMatchObject(result2);
        });
    });

    describe("goToPrevious() - 循环模式", () => {
        it("应跳转到上一个结果", () => {
            state.setResults([
                { row: 1, col: 1, data: "a" },
                { row: 2, col: 2, data: "b" },
                { row: 3, col: 3, data: "c" },
            ]);
            
            // 设置到第二个
            state.setCurrentIndex(1);

            const result = navigator.goToPrevious();

            expect(result).toMatchObject({ row: 1, col: 1 });
            expect(state.getCurrentIndex()).toBe(0);
        });

        it("应在第一个时循环到最后一个", () => {
            state.setResults([
                { row: 1, col: 1, data: "a" },
                { row: 2, col: 2, data: "b" },
                { row: 3, col: 3, data: "c" },
            ]);
            
            // 在第一个位置
            state.setCurrentIndex(0);

            const result = navigator.goToPrevious();

            expect(result).toMatchObject({ row: 3, col: 3 }); // 循环到最后一个
            expect(state.getCurrentIndex()).toBe(2);
        });
    });

    describe("goTo(index)", () => {
        it("应跳转到指定索引的结果", () => {
            state.setResults([
                { row: 10, col: 10, data: "x" },
                { row: 20, col: 20, data: "y" },
                { row: 30, col: 30, data: "z" },
            ]);

            const result = navigator.goTo(2);

            expect(result).toMatchObject({ row: 30, col: 30 });
            expect(state.getCurrentIndex()).toBe(2);
        });

        it("应在索引越界时返回 null", () => {
            state.setResults([
                { row: 1, col: 1, data: "a" },
            ]);

            const resultInvalidHigh = navigator.goTo(5);
            const resultInvalidLow = navigator.goTo(-1);

            expect(resultInvalidHigh).toBeNull();
            expect(resultInvalidLow).toBeNull();
        });
    });

    describe("边界情况", () => {
        it("应在 SelectionManager 为空时不报错", () => {
            const navWithoutSelection = new SearchNavigator(state, null);

            state.setResults([{ row: 1, col: 1, data: "test" }]);

            // 不应抛出异常
            expect(() => navWithoutSelection.goToFirst()).not.toThrow();
        });

        it("应连续导航多次而不出错", () => {
            state.setResults([
                { row: 1, col: 1, data: "a" },
                { row: 2, col: 2, data: "b" },
                { row: 3, col: 3, data: "c" },
            ]);

            // 连续导航 10 次
            for (let i = 0; i < 10; i++) {
                const result = navigator.goToNext();
                expect(result).toBeDefined();
            }

            // 验证最终状态有效
            expect(state.getCurrentIndex()).toBeGreaterThanOrEqual(0);
            expect(state.getCurrentIndex()).toBeLessThan(3);
        });
    });
});