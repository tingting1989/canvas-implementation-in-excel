import { describe, it, expect, vi } from "vitest";
import { UnmergeCommand } from "@/model/command/UnmergeCommand";

function createMockManager() {
    return {
        merge: vi.fn().mockReturnValue(true),
        unmerge: vi.fn(),
        getMerge: vi.fn().mockReturnValue({ topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 3 }),
    };
}

describe("UnmergeCommand", () => {
    describe("构造函数", () => {
        it("UC-01: 应正确创建实例", () => {
            const manager = createMockManager();
            const cmd = new UnmergeCommand(manager, 0, 0);
            expect(cmd).toBeInstanceOf(UnmergeCommand);
            expect(cmd.row).toBe(0);
            expect(cmd.col).toBe(0);
            expect(cmd.oldMerge).toBeNull();
        });
    });

    describe("redo()", () => {
        it("UC-02: 应先快照再拆分", () => {
            const manager = createMockManager();
            const cmd = new UnmergeCommand(manager, 0, 0);
            cmd.redo();
            expect(manager.getMerge).toHaveBeenCalledWith(0, 0);
            expect(cmd.oldMerge).toEqual({ topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 3 });
            expect(manager.unmerge).toHaveBeenCalledWith(0, 0);
        });

        it("UC-03: getMerge 返回 null 时不调用 unmerge", () => {
            const manager = createMockManager();
            manager.getMerge.mockReturnValue(null);
            const cmd = new UnmergeCommand(manager, 0, 0);
            cmd.redo();
            expect(cmd.oldMerge).toBeNull();
            expect(manager.unmerge).not.toHaveBeenCalled();
        });
    });

    describe("undo()", () => {
        it("UC-04: 有快照时应恢复原合并区域", () => {
            const manager = createMockManager();
            const cmd = new UnmergeCommand(manager, 0, 0);
            cmd.redo();
            cmd.undo();
            expect(manager.merge).toHaveBeenCalledWith(0, 0, 2, 3);
        });

        it("UC-05: 无快照时不调用 merge", () => {
            const manager = createMockManager();
            const cmd = new UnmergeCommand(manager, 0, 0);
            cmd.undo();
            expect(manager.merge).not.toHaveBeenCalled();
        });
    });

    describe("redo/undo 循环", () => {
        it("UC-06: 多次 redo/undo 应正确切换", () => {
            const manager = createMockManager();
            const cmd = new UnmergeCommand(manager, 1, 2);
            cmd.redo();
            expect(cmd.oldMerge).not.toBeNull();
            cmd.undo();
            expect(manager.merge).toHaveBeenCalledTimes(1);
            manager.getMerge.mockReturnValue({ topRow: 1, topCol: 2, bottomRow: 4, bottomCol: 5 });
            cmd.redo();
            expect(cmd.oldMerge).toEqual({ topRow: 1, topCol: 2, bottomRow: 4, bottomCol: 5 });
        });
    });
});