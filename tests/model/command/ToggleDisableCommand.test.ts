import { describe, it, expect, vi } from "vitest";
import { ToggleDisableCommand } from "@/model/command/ToggleDisableCommand";

function createMockStore(disabled: boolean = false) {
    const cell = { disabled };
    return {
        cell,
        get: vi.fn().mockReturnValue(cell),
    };
}

describe("ToggleDisableCommand", () => {
    describe("构造函数", () => {
        it("TD-01: 应正确创建实例", () => {
            const store = createMockStore();
            const cmd = new ToggleDisableCommand(store, 0, 0, false);
            expect(cmd).toBeInstanceOf(ToggleDisableCommand);
            expect(cmd.row).toBe(0);
            expect(cmd.col).toBe(0);
            expect(cmd.oldState).toBe(false);
        });
    });

    describe("redo()", () => {
        it("TD-02: oldState=false 时应切换为禁用", () => {
            const store = createMockStore(false);
            const cmd = new ToggleDisableCommand(store, 0, 0, false);
            cmd.redo();
            expect(store.cell.disabled).toBe(true);
        });

        it("TD-03: oldState=true 时应切换为启用", () => {
            const store = createMockStore(true);
            const cmd = new ToggleDisableCommand(store, 0, 0, true);
            cmd.redo();
            expect(store.cell.disabled).toBe(false);
        });

        it("TD-04: 单元格不存在时不报错", () => {
            const store = { get: vi.fn().mockReturnValue(null) };
            const cmd = new ToggleDisableCommand(store as any, 0, 0, false);
            expect(() => cmd.redo()).not.toThrow();
        });
    });

    describe("undo()", () => {
        it("TD-05: 应恢复为 oldState", () => {
            const store = createMockStore(true);
            const cmd = new ToggleDisableCommand(store, 0, 0, false);
            cmd.redo();
            cmd.undo();
            expect(store.cell.disabled).toBe(false);
        });

        it("TD-06: oldState=true 时撤销应恢复为禁用", () => {
            const store = createMockStore(false);
            const cmd = new ToggleDisableCommand(store, 0, 0, true);
            cmd.redo();
            cmd.undo();
            expect(store.cell.disabled).toBe(true);
        });

        it("TD-07: 单元格不存在时不报错", () => {
            const store = { get: vi.fn().mockReturnValue(null) };
            const cmd = new ToggleDisableCommand(store as any, 0, 0, false);
            expect(() => cmd.undo()).not.toThrow();
        });
    });

    describe("redo/undo 循环", () => {
        it("TD-08: 多次 redo/undo 应正确切换", () => {
            const store = createMockStore(false);
            const cmd = new ToggleDisableCommand(store, 0, 0, false);
            cmd.redo();
            expect(store.cell.disabled).toBe(true);
            cmd.undo();
            expect(store.cell.disabled).toBe(false);
            cmd.redo();
            expect(store.cell.disabled).toBe(true);
        });
    });
});