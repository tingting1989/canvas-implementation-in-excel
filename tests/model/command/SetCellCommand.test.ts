import { describe, it, expect, vi } from "vitest";
import { SetCellCommand } from "@/model/command/SetCellCommand";

function createMockStore() {
    return {
        data: new Map<string, any>(),
        get(row: number, col: number) {
            return this.data.get(`${row},${col}`) || null;
        },
        set(row: number, col: number, cell: any) {
            this.data.set(`${row},${col}`, cell);
        },
        delete(row: number, col: number) {
            this.data.delete(`${row},${col}`);
        },
    };
}

describe("SetCellCommand", () => {
    describe("构造函数", () => {
        it("SC-01: 应正确创建实例", () => {
            const store = createMockStore();
            const cmd = new SetCellCommand(store, 0, 0, null, { value: "hello" });
            expect(cmd).toBeInstanceOf(SetCellCommand);
            expect(cmd.row).toBe(0);
            expect(cmd.col).toBe(0);
            expect(cmd.oldCell).toBeNull();
            expect(cmd.newCell).toEqual({ value: "hello" });
        });
    });

    describe("redo()", () => {
        it("SC-02: 应将单元格设置为新值", () => {
            const store = createMockStore();
            const cmd = new SetCellCommand(store, 2, 3, null, { value: "world" });
            cmd.redo();
            expect(store.get(2, 3)).toEqual({ value: "world" });
        });

        it("SC-03: 新值为 null 时也应设置", () => {
            const store = createMockStore();
            store.set(1, 1, { value: "old" });
            const cmd = new SetCellCommand(store, 1, 1, { value: "old" }, null);
            cmd.redo();
            expect(store.get(1, 1)).toBeNull();
        });
    });

    describe("undo()", () => {
        it("SC-04: oldCell 存在时应恢复旧值", () => {
            const store = createMockStore();
            const cmd = new SetCellCommand(store, 0, 0, { value: "old" }, { value: "new" });
            cmd.redo();
            cmd.undo();
            expect(store.get(0, 0)).toEqual({ value: "old" });
        });

        it("SC-05: oldCell 为 null 时应删除单元格", () => {
            const store = createMockStore();
            const cmd = new SetCellCommand(store, 0, 0, null, { value: "new" });
            cmd.redo();
            cmd.undo();
            expect(store.get(0, 0)).toBeNull();
        });
    });

    describe("redo/undo 循环", () => {
        it("SC-06: 多次 redo/undo 应正确切换", () => {
            const store = createMockStore();
            const cmd = new SetCellCommand(store, 0, 0, { value: "A" }, { value: "B" });
            cmd.redo();
            expect(store.get(0, 0)).toEqual({ value: "B" });
            cmd.undo();
            expect(store.get(0, 0)).toEqual({ value: "A" });
            cmd.redo();
            expect(store.get(0, 0)).toEqual({ value: "B" });
            cmd.undo();
            expect(store.get(0, 0)).toEqual({ value: "A" });
        });
    });
});