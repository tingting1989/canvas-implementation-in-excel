import { describe, it, expect, vi } from "vitest";
import { HistoryStack } from "@/model/history/HistoryStack";
import { SetCellCommand } from "@/model/command/SetCellCommand";
import { Cell } from "@/model/store/Cell";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";

describe("HistoryStack - Basic Operations", () => {
    it("should start with empty undo and redo stacks", () => {
        const hs = new HistoryStack();
        expect(hs.undoStack).toEqual([]);
        expect(hs.redoStack).toEqual([]);
    });

    it("should push command to undo stack", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() };
        hs.push(cmd);
        expect(hs.undoStack).toHaveLength(1);
        expect(hs.undoStack[0]).toBe(cmd);
    });

    it("should clear redo stack on push", () => {
        const hs = new HistoryStack();
        const cmd1 = { undo: vi.fn(), redo: vi.fn() };
        const cmd2 = { undo: vi.fn(), redo: vi.fn() };
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
        const cmd = { undo: vi.fn(), redo: vi.fn() };
        hs.push(cmd);
        hs.undo();
        expect(cmd.undo).toHaveBeenCalledTimes(1);
    });

    it("should move undone command to redo stack", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() };
        hs.push(cmd);
        hs.undo();
        expect(hs.undoStack).toHaveLength(0);
        expect(hs.redoStack).toHaveLength(1);
        expect(hs.redoStack[0]).toBe(cmd);
    });

    it("should undo commands in LIFO order", () => {
        const hs = new HistoryStack();
        const order = [];
        const cmd1 = { undo: () => order.push("cmd1"), redo: vi.fn() };
        const cmd2 = { undo: () => order.push("cmd2"), redo: vi.fn() };
        const cmd3 = { undo: () => order.push("cmd3"), redo: vi.fn() };
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
        const cmd = { undo: vi.fn(), redo: vi.fn() };
        hs.push(cmd);
        hs.undo();
        hs.redo();
        expect(cmd.redo).toHaveBeenCalledTimes(1);
    });

    it("should move redone command back to undo stack", () => {
        const hs = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() };
        hs.push(cmd);
        hs.undo();
        hs.redo();
        expect(hs.undoStack).toHaveLength(1);
        expect(hs.redoStack).toHaveLength(0);
    });

    it("should redo commands in LIFO order", () => {
        const hs = new HistoryStack();
        const order = [];
        const cmd1 = { undo: vi.fn(), redo: () => order.push("cmd1") };
        const cmd2 = { undo: vi.fn(), redo: () => order.push("cmd2") };
        hs.push(cmd1);
        hs.push(cmd2);
        hs.undo();
        hs.undo();
        hs.redo();
        hs.redo();
        expect(order).toEqual(["cmd1", "cmd2"]);
    });

    it("should do nothing when redo stack is empty", () => {
        const hs = new HistoryStack();
        expect(() => hs.redo()).not.toThrow();
    });
});

describe("HistoryStack - Integration with SetCellCommand", () => {
    it("should undo and redo SetCellCommand correctly", () => {
        const store = new ChunkedCellStore();
        const oldCell = new Cell("old");
        const newCell = new Cell("new");
        store.set(0, 0, oldCell);

        const hs = new HistoryStack();
        const cmd = new SetCellCommand(store, 0, 0, oldCell, newCell);
        cmd.redo();
        hs.push(cmd);

        expect(store.get(0, 0).value).toBe("new");

        hs.undo();
        expect(store.get(0, 0).value).toBe("old");

        hs.redo();
        expect(store.get(0, 0).value).toBe("new");
    });

    it("should clear redo stack after new push (branch discard)", () => {
        const store = new ChunkedCellStore();
        const hs = new HistoryStack();

        const cmd1 = new SetCellCommand(store, 0, 0, null, new Cell("A"));
        cmd1.redo();
        hs.push(cmd1);

        const cmd2 = new SetCellCommand(store, 0, 1, null, new Cell("B"));
        cmd2.redo();
        hs.push(cmd2);

        hs.undo();
        expect(hs.redoStack).toHaveLength(1);

        const cmd3 = new SetCellCommand(store, 0, 2, null, new Cell("C"));
        cmd3.redo();
        hs.push(cmd3);

        expect(hs.redoStack).toHaveLength(0);
        expect(store.get(0, 1)).toBeUndefined();
    });
});