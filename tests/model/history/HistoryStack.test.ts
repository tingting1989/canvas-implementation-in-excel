import { describe, it, expect, vi } from "vitest";
import { HistoryStack } from "@/model/history/HistoryStack";
import { Command } from "@/model/command/Command";

describe("HistoryStack - Basic Operations", () => {
    it("should start with empty undo and redo stacks", () => {
        const hs = new HistoryStack();
        expect(hs.undoStack).toEqual([]);
        expect(hs.redoStack).toEqual([]);
    });

    it("should push command to undo stack", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() } as unknown as Command;
        hs.push(cmd);
        expect(hs.undoStack).toHaveLength(1);
        expect(hs.undoStack[0]).toBe(cmd);
    });

    it("should clear redo stack on push", () => {
        const hs = new HistoryStack();
        const cmd1 = { undo: vi.fn(), redo: vi.fn() } as unknown as Command;
        const cmd2 = { undo: vi.fn(), redo: vi.fn() } as unknown as Command;
        hs.push(cmd1);
        hs.undo();
        expect(hs.redoStack).toHaveLength(1);
        hs.push(cmd2);
        expect(hs.redoStack).toHaveLength(0);
    });
});

describe("HistoryStack - Undo", () => {
    it("should undo the last command", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() } as unknown as Command;
        hs.push(cmd);
        hs.undo();
        expect(cmd.undo).toHaveBeenCalledTimes(1);
    });

    it("should move undone command to redo stack", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() } as unknown as Command;
        hs.push(cmd);
        hs.undo();
        expect(hs.undoStack).toHaveLength(0);
        expect(hs.redoStack).toHaveLength(1);
        expect(hs.redoStack[0]).toBe(cmd);
    });

    it("should undo commands in LIFO order", () => {
        const hs = new HistoryStack();
        const order: string[] = [];
        const cmd1 = { undo: () => order.push("cmd1"), redo: vi.fn() } as unknown as Command;
        const cmd2 = { undo: () => order.push("cmd2"), redo: vi.fn() } as unknown as Command;
        const cmd3 = { undo: () => order.push("cmd3"), redo: vi.fn() } as unknown as Command;
        hs.push(cmd1);
        hs.push(cmd2);
        hs.push(cmd3);
        hs.undo();
        hs.undo();
        hs.undo();
        expect(order).toEqual(["cmd3", "cmd2", "cmd1"]);
    });

    it("should do nothing when undo stack is empty", () => {
        const hs = new HistoryStack();
        expect(() => hs.undo()).not.toThrow();
    });
});

describe("HistoryStack - Redo", () => {
    it("should redo the last undone command", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() } as unknown as Command;
        hs.push(cmd);
        hs.undo();
        hs.redo();
        expect(cmd.redo).toHaveBeenCalledTimes(1);
    });

    it("should move redone command to undo stack", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() } as unknown as Command;
        hs.push(cmd);
        hs.undo();
        hs.redo();
        expect(hs.redoStack).toHaveLength(0);
        expect(hs.undoStack).toHaveLength(1);
    });

    it("should do nothing when redo stack is empty", () => {
        const hs = new HistoryStack();
        expect(() => hs.redo()).not.toThrow();
    });
});

describe("HistoryStack - Type Safety", () => {
    it("should accept Command instances", () => {
        const hs = new HistoryStack();
        class TestCommand extends Command {
            redo(): void {}
            undo(): void {}
        }
        const cmd = new TestCommand();
        hs.push(cmd);
        expect(hs.undoStack[0]).toBe(cmd);
    });
});