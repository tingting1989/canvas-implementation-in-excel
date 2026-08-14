import { describe, it, expect, vi } from "vitest";
import { MergeCommand } from "@/model/command/MergeCommand";

function createMockManager(mergeResult: boolean = true) {
    return {
        merge: vi.fn().mockReturnValue(mergeResult),
        unmerge: vi.fn(),
    };
}

describe("MergeCommand", () => {
    describe("构造函数", () => {
        it("MC-01: 应正确创建实例", () => {
            const manager = createMockManager();
            const cmd = new MergeCommand(manager, 0, 0, 2, 3);
            expect(cmd).toBeInstanceOf(MergeCommand);
            expect(cmd.topRow).toBe(0);
            expect(cmd.topCol).toBe(0);
            expect(cmd.bottomRow).toBe(2);
            expect(cmd.bottomCol).toBe(3);
            expect(cmd.succeeded).toBe(false);
        });
    });

    describe("redo()", () => {
        it("MC-02: 合并成功时 succeeded 为 true", () => {
            const manager = createMockManager(true);
            const cmd = new MergeCommand(manager, 0, 0, 2, 3);
            cmd.redo();
            expect(cmd.succeeded).toBe(true);
            expect(manager.merge).toHaveBeenCalledWith(0, 0, 2, 3);
        });

        it("MC-03: 合并失败时 succeeded 为 false", () => {
            const manager = createMockManager(false);
            const cmd = new MergeCommand(manager, 0, 0, 2, 3);
            cmd.redo();
            expect(cmd.succeeded).toBe(false);
        });
    });

    describe("undo()", () => {
        it("MC-04: 合并成功时撤销应调用 unmerge", () => {
            const manager = createMockManager(true);
            const cmd = new MergeCommand(manager, 0, 0, 2, 3);
            cmd.redo();
            cmd.undo();
            expect(manager.unmerge).toHaveBeenCalledWith(0, 0);
        });

        it("MC-05: 合并失败时撤销不调用 unmerge", () => {
            const manager = createMockManager(false);
            const cmd = new MergeCommand(manager, 0, 0, 2, 3);
            cmd.redo();
            cmd.undo();
            expect(manager.unmerge).not.toHaveBeenCalled();
        });

        it("MC-06: 未执行 redo 直接调用 undo 不报错", () => {
            const manager = createMockManager();
            const cmd = new MergeCommand(manager, 0, 0, 2, 3);
            expect(() => cmd.undo()).not.toThrow();
            expect(manager.unmerge).not.toHaveBeenCalled();
        });
    });

    describe("redo/undo 循环", () => {
        it("MC-07: 多次 redo/undo 应正确切换", () => {
            const manager = createMockManager(true);
            const cmd = new MergeCommand(manager, 1, 2, 4, 5);
            cmd.redo();
            expect(cmd.succeeded).toBe(true);
            cmd.undo();
            expect(manager.unmerge).toHaveBeenCalledTimes(1);
            cmd.redo();
            expect(cmd.succeeded).toBe(true);
        });
    });
});