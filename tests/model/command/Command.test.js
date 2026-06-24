import { describe, it, expect, vi } from "vitest";
import { HistoryStack } from "@/model/history/HistoryStack";
import { Command } from "@/model/command/Command";
import { SetCellCommand } from "@/model/command/SetCellCommand";
import { BatchCommand } from "@/model/command/BatchCommand";
import { MergeCommand } from "@/model/command/MergeCommand";
import { UnmergeCommand } from "@/model/command/UnmergeCommand";
import { ToggleDisableCommand } from "@/model/command/ToggleDisableCommand";
import { Cell } from "@/model/store/Cell";
import { MergeManager } from "@/model/merge/MergeManager";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";

describe("HistoryStack", () => {
    it("should push and undo a command", () => {
        const stack = new HistoryStack();
        const undo = vi.fn();
        stack.push({ undo, redo: vi.fn() });
        stack.undo();
        expect(undo).toHaveBeenCalled();
    });

    it("should redo after undo", () => {
        const stack = new HistoryStack();
        const redo = vi.fn();
        const cmd = { undo: vi.fn(), redo };
        stack.push(cmd);
        stack.undo();
        stack.redo();
        expect(redo).toHaveBeenCalledTimes(1);
    });

    it("should clear redoStack on new push", () => {
        const stack = new HistoryStack();
        stack.push({ undo: vi.fn(), redo: vi.fn() });
        stack.push({ undo: vi.fn(), redo: vi.fn() });
        stack.undo();
        stack.undo();
        stack.push({ undo: vi.fn(), redo: vi.fn() });
        stack.redo();
        expect(stack.redoStack).toHaveLength(0);
    });

    it("should handle undo on empty stack", () => {
        const stack = new HistoryStack();
        expect(() => stack.undo()).not.toThrow();
    });

    it("should handle redo on empty stack", () => {
        const stack = new HistoryStack();
        expect(() => stack.redo()).not.toThrow();
    });

    it("should handle multiple undo/redo cycles", () => {
        const stack = new HistoryStack();
        const calls = [];
        stack.push({ undo: () => calls.push("u1"), redo: () => calls.push("r1") });
        stack.push({ undo: () => calls.push("u2"), redo: () => calls.push("r2") });
        stack.undo();
        stack.undo();
        stack.redo();
        expect(calls).toEqual(["u2", "u1", "r1"]);
    });
});

describe("Command", () => {
    it("should have empty redo and undo by default", () => {
        const cmd = new Command();
        expect(() => cmd.redo()).not.toThrow();
        expect(() => cmd.undo()).not.toThrow();
    });
});

describe("SetCellCommand", () => {
    it("should redo by setting new cell", () => {
        const store = new ChunkedCellStore();
        const oldCell = new Cell("old");
        const newCell = new Cell("new");
        const cmd = new SetCellCommand(store, 0, 0, oldCell, newCell);
        cmd.redo();
        expect(store.get(0, 0).value).toBe("new");
    });

    it("should undo by restoring old cell", () => {
        const store = new ChunkedCellStore();
        const oldCell = new Cell("old");
        const newCell = new Cell("new");
        store.set(0, 0, oldCell);
        const cmd = new SetCellCommand(store, 0, 0, oldCell, newCell);
        cmd.redo();
        cmd.undo();
        expect(store.get(0, 0).value).toBe("old");
    });

    it("should undo by deleting if oldCell is null", () => {
        const store = new ChunkedCellStore();
        const newCell = new Cell("new");
        const cmd = new SetCellCommand(store, 0, 0, null, newCell);
        cmd.redo();
        cmd.undo();
        expect(store.get(0, 0)).toBeUndefined();
    });
});

describe("BatchCommand", () => {
    it("should redo all sub-commands in order", () => {
        const store = new ChunkedCellStore();
        const cmds = [
            new SetCellCommand(store, 0, 0, null, new Cell("a")),
            new SetCellCommand(store, 0, 1, null, new Cell("b")),
            new SetCellCommand(store, 0, 2, null, new Cell("c")),
        ];
        const batch = new BatchCommand(cmds);
        batch.redo();
        expect(store.get(0, 0).value).toBe("a");
        expect(store.get(0, 1).value).toBe("b");
        expect(store.get(0, 2).value).toBe("c");
    });

    it("should undo all sub-commands in reverse order", () => {
        const store = new ChunkedCellStore();
        const old0 = new Cell("old0");
        const old1 = new Cell("old1");
        store.set(0, 0, old0);
        store.set(0, 1, old1);
        const cmds = [
            new SetCellCommand(store, 0, 0, old0, new Cell("new0")),
            new SetCellCommand(store, 0, 1, old1, new Cell("new1")),
        ];
        const batch = new BatchCommand(cmds);
        batch.redo();
        batch.undo();
        expect(store.get(0, 0).value).toBe("old0");
        expect(store.get(0, 1).value).toBe("old1");
    });

    it("should work with HistoryStack", () => {
        const stack = new HistoryStack();
        const store = new ChunkedCellStore();
        const oldCell = new Cell("old");
        store.set(0, 0, oldCell);
        const batch = new BatchCommand([
            new SetCellCommand(store, 0, 0, oldCell, new Cell("new")),
        ]);
        batch.redo();
        stack.push(batch);
        expect(store.get(0, 0).value).toBe("new");
        stack.undo();
        expect(store.get(0, 0).value).toBe("old");
        stack.redo();
        expect(store.get(0, 0).value).toBe("new");
    });
});

describe("MergeCommand", () => {
    it("should redo by merging cells", () => {
        const mm = new MergeManager();
        const cmd = new MergeCommand(mm, 0, 0, 2, 3);
        cmd.redo();
        expect(cmd.succeeded).toBe(true);
        expect(mm.getCount()).toBe(1);
    });

    it("should undo by unmerging cells", () => {
        const mm = new MergeManager();
        const cmd = new MergeCommand(mm, 0, 0, 2, 3);
        cmd.redo();
        cmd.undo();
        expect(mm.getCount()).toBe(0);
    });

    it("should not undo if merge failed", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        const cmd = new MergeCommand(mm, 1, 1, 3, 4);
        cmd.redo();
        expect(cmd.succeeded).toBe(false);
        cmd.undo();
        expect(mm.getCount()).toBe(1);
    });
});

describe("UnmergeCommand", () => {
    it("should redo by unmerging cells", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        const cmd = new UnmergeCommand(mm, 0, 0);
        cmd.redo();
        expect(mm.getCount()).toBe(0);
    });

    it("should undo by re-merging cells", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        const cmd = new UnmergeCommand(mm, 0, 0);
        cmd.redo();
        cmd.undo();
        expect(mm.getCount()).toBe(1);
        const info = mm.getMerge(0, 0);
        expect(info.topRow).toBe(0);
        expect(info.bottomRow).toBe(2);
    });

    it("should handle unmerge of non-merged cell", () => {
        const mm = new MergeManager();
        const cmd = new UnmergeCommand(mm, 5, 5);
        cmd.redo();
        expect(cmd.oldMerge).toBeNull();
        cmd.undo();
        expect(mm.getCount()).toBe(0);
    });

    it("should preserve merge info for undo", () => {
        const mm = new MergeManager();
        mm.merge(1, 2, 4, 6);
        const cmd = new UnmergeCommand(mm, 1, 2);
        cmd.redo();
        expect(cmd.oldMerge.topRow).toBe(1);
        expect(cmd.oldMerge.topCol).toBe(2);
        expect(cmd.oldMerge.bottomRow).toBe(4);
        expect(cmd.oldMerge.bottomCol).toBe(6);
    });
});

describe("ToggleDisableCommand", () => {
    it("should redo by toggling disabled state", () => {
        const store = new ChunkedCellStore();
        const cell = new Cell("test");
        cell.disabled = false;
        store.set(0, 0, cell);
        const cmd = new ToggleDisableCommand(store, 0, 0, false);
        cmd.redo();
        expect(store.get(0, 0).disabled).toBe(true);
    });

    it("should undo by restoring original disabled state", () => {
        const store = new ChunkedCellStore();
        const cell = new Cell("test");
        cell.disabled = false;
        store.set(0, 0, cell);
        const cmd = new ToggleDisableCommand(store, 0, 0, false);
        cmd.redo();
        cmd.undo();
        expect(store.get(0, 0).disabled).toBe(false);
    });

    it("should handle toggle from disabled to enabled", () => {
        const store = new ChunkedCellStore();
        const cell = new Cell("test");
        cell.disabled = true;
        store.set(0, 0, cell);
        const cmd = new ToggleDisableCommand(store, 0, 0, true);
        cmd.redo();
        expect(store.get(0, 0).disabled).toBe(false);
        cmd.undo();
        expect(store.get(0, 0).disabled).toBe(true);
    });

    it("should handle missing cell gracefully", () => {
        const store = new ChunkedCellStore();
        const cmd = new ToggleDisableCommand(store, 0, 0, false);
        expect(() => cmd.redo()).not.toThrow();
        expect(() => cmd.undo()).not.toThrow();
    });
});

describe("Command integration with HistoryStack", () => {
    it("should undo/redo SetCellCommand via HistoryStack", () => {
        const stack = new HistoryStack();
        const store = new ChunkedCellStore();
        const oldCell = new Cell("old");
        store.set(0, 0, oldCell);
        const cmd = new SetCellCommand(store, 0, 0, oldCell, new Cell("new"));
        cmd.redo();
        stack.push(cmd);
        stack.undo();
        expect(store.get(0, 0).value).toBe("old");
        stack.redo();
        expect(store.get(0, 0).value).toBe("new");
    });

    it("should undo/redo MergeCommand via HistoryStack", () => {
        const stack = new HistoryStack();
        const mm = new MergeManager();
        const cmd = new MergeCommand(mm, 0, 0, 2, 2);
        cmd.redo();
        stack.push(cmd);
        stack.undo();
        expect(mm.getCount()).toBe(0);
        stack.redo();
        expect(mm.getCount()).toBe(1);
    });

    it("should undo/redo UnmergeCommand via HistoryStack", () => {
        const stack = new HistoryStack();
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        const cmd = new UnmergeCommand(mm, 0, 0);
        cmd.redo();
        stack.push(cmd);
        stack.undo();
        expect(mm.getCount()).toBe(1);
        stack.redo();
        expect(mm.getCount()).toBe(0);
    });
});