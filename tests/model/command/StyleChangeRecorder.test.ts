import { describe, it, expect, vi } from "vitest";
import { StyleChangeRecorder, StyleChangeCommand } from "@/model/command/StyleChangeRecorder";

function createMockStyleManager() {
    return {
        applyStyleId: vi.fn(),
    };
}

describe("StyleChangeRecorder", () => {
    describe("构造函数", () => {
        it("SCR-01: 应正确创建实例", () => {
            const recorder = new StyleChangeRecorder();
            expect(recorder).toBeInstanceOf(StyleChangeRecorder);
        });

        it("SCR-02: 初始 size 为 0", () => {
            const recorder = new StyleChangeRecorder();
            expect(recorder.size).toBe(0);
        });
    });

    describe("record()", () => {
        it("SCR-03: 记录变更后 size 增加", () => {
            const recorder = new StyleChangeRecorder();
            recorder.record("cell", "0,0", 1, 2);
            expect(recorder.size).toBe(1);
        });

        it("SCR-04: 多次记录应累积", () => {
            const recorder = new StyleChangeRecorder();
            recorder.record("cell", "0,0", 1, 2);
            recorder.record("cell", "0,1", 3, 4);
            recorder.record("row", "5", 1, 5);
            expect(recorder.size).toBe(3);
        });
    });

    describe("buildCommand()", () => {
        it("SCR-05: 无变更时返回 null", () => {
            const recorder = new StyleChangeRecorder();
            const manager = createMockStyleManager();
            expect(recorder.buildCommand(manager)).toBeNull();
        });

        it("SCR-06: 有变更时返回 StyleChangeCommand", () => {
            const recorder = new StyleChangeRecorder();
            recorder.record("cell", "0,0", 1, 2);
            const manager = createMockStyleManager();
            const cmd = recorder.buildCommand(manager);
            expect(cmd).toBeInstanceOf(StyleChangeCommand);
        });

        it("SCR-07: 构建后 size 归零", () => {
            const recorder = new StyleChangeRecorder();
            recorder.record("cell", "0,0", 1, 2);
            const manager = createMockStyleManager();
            recorder.buildCommand(manager);
            expect(recorder.size).toBe(0);
        });
    });

    describe("reset()", () => {
        it("SCR-08: 清空所有记录", () => {
            const recorder = new StyleChangeRecorder();
            recorder.record("cell", "0,0", 1, 2);
            recorder.record("cell", "0,1", 3, 4);
            recorder.reset();
            expect(recorder.size).toBe(0);
        });
    });
});

describe("StyleChangeCommand", () => {
    describe("redo()", () => {
        it("SCC-01: 正序应用新样式ID", () => {
            const manager = createMockStyleManager();
            const cmd = new StyleChangeCommand(manager, [
                { type: "cell", key: "0,0", oldStyleId: 1, newStyleId: 5 },
                { type: "cell", key: "0,1", oldStyleId: 2, newStyleId: 6 },
            ]);
            cmd.redo();
            expect(manager.applyStyleId).toHaveBeenCalledTimes(2);
            expect(manager.applyStyleId).toHaveBeenNthCalledWith(1, "cell", "0,0", 5);
            expect(manager.applyStyleId).toHaveBeenNthCalledWith(2, "cell", "0,1", 6);
        });
    });

    describe("undo()", () => {
        it("SCC-02: 逆序恢复旧样式ID", () => {
            const manager = createMockStyleManager();
            const cmd = new StyleChangeCommand(manager, [
                { type: "cell", key: "0,0", oldStyleId: 1, newStyleId: 5 },
                { type: "cell", key: "0,1", oldStyleId: 2, newStyleId: 6 },
            ]);
            cmd.undo();
            expect(manager.applyStyleId).toHaveBeenCalledTimes(2);
            expect(manager.applyStyleId).toHaveBeenNthCalledWith(1, "cell", "0,1", 2);
            expect(manager.applyStyleId).toHaveBeenNthCalledWith(2, "cell", "0,0", 1);
        });
    });

    describe("redo/undo 循环", () => {
        it("SCC-03: redo 后 undo 应恢复状态", () => {
            const manager = createMockStyleManager();
            const cmd = new StyleChangeCommand(manager, [
                { type: "cell", key: "0,0", oldStyleId: 1, newStyleId: 5 },
            ]);
            cmd.redo();
            expect(manager.applyStyleId).toHaveBeenCalledWith("cell", "0,0", 5);
            cmd.undo();
            expect(manager.applyStyleId).toHaveBeenCalledWith("cell", "0,0", 1);
        });
    });

    describe("空变更", () => {
        it("SCC-04: 空变更列表不报错", () => {
            const manager = createMockStyleManager();
            const cmd = new StyleChangeCommand(manager, []);
            expect(() => cmd.redo()).not.toThrow();
            expect(() => cmd.undo()).not.toThrow();
        });
    });
});