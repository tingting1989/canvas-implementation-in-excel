import { describe, it, expect, vi } from "vitest";
import { BatchOperationManager } from "@/workbook/managers/BatchOperationManager";
import { HistoryStack } from "@/model/history/HistoryStack";
import { SetCellCommand } from "@/model/command/SetCellCommand";
import { Cell } from "@/model/store/Cell";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";

describe("BatchOperationManager - Basic State", () => {
    it("should not be in batch mode initially", () => {
        const bom = new BatchOperationManager();
        expect(bom.inBatch).toBe(false);
    });

    it("should enter batch mode after beginBatch", () => {
        const bom = new BatchOperationManager();
        bom.beginBatch();
        expect(bom.inBatch).toBe(true);
    });

    it("should exit batch mode after endBatch", () => {
        const bom = new BatchOperationManager();
        const history = new HistoryStack();
        bom.beginBatch();
        bom.endBatch(history);
        expect(bom.inBatch).toBe(false);
    });
});

describe("BatchOperationManager - Non-batch Mode", () => {
    it("should push command directly to history when not in batch", () => {
        const bom = new BatchOperationManager();
        const history = new HistoryStack();
        const cmd = { undo: vi.fn(), redo: vi.fn() };
        bom.pushCommand(cmd, history);
        expect(history.undoStack).toHaveLength(1);
        expect(history.undoStack[0]).toBe(cmd);
    });
});

describe("BatchOperationManager - Batch Mode", () => {
    it("should buffer commands in batch mode", () => {
        const bom = new BatchOperationManager();
        const history = new HistoryStack();
        const cmd1 = { undo: vi.fn(), redo: vi.fn() };
        const cmd2 = { undo: vi.fn(), redo: vi.fn() };

        bom.beginBatch();
        bom.pushCommand(cmd1, history);
        bom.pushCommand(cmd2, history);

        expect(history.undoStack).toHaveLength(0);
    });

    it("should push BatchCommand to history on endBatch", () => {
        const bom = new BatchOperationManager();
        const history = new HistoryStack();
        const cmd1 = { undo: vi.fn(), redo: vi.fn() };
        const cmd2 = { undo: vi.fn(), redo: vi.fn() };

        bom.beginBatch();
        bom.pushCommand(cmd1, history);
        bom.pushCommand(cmd2, history);
        bom.endBatch(history);

        expect(history.undoStack).toHaveLength(1);
    });

    it("should not push anything on endBatch if no commands", () => {
        const bom = new BatchOperationManager();
        const history = new HistoryStack();

        bom.beginBatch();
        bom.endBatch(history);

        expect(history.undoStack).toHaveLength(0);
    });

    it("should undo all batched commands at once", () => {
        const store = new ChunkedCellStore();
        const history = new HistoryStack();
        const bom = new BatchOperationManager();

        bom.beginBatch();

        const old0 = new Cell("old0");
        const old1 = new Cell("old1");
        store.set(0, 0, old0);
        store.set(0, 1, old1);

        const cmd0 = new SetCellCommand(store, 0, 0, old0, new Cell("new0"));
        const cmd1 = new SetCellCommand(store, 0, 1, old1, new Cell("new1"));
        cmd0.redo();
        cmd1.redo();

        bom.pushCommand(cmd0, history);
        bom.pushCommand(cmd1, history);
        bom.endBatch(history);

        expect(store.get(0, 0).value).toBe("new0");
        expect(store.get(0, 1).value).toBe("new1");

        history.undo();
        expect(store.get(0, 0).value).toBe("old0");
        expect(store.get(0, 1).value).toBe("old1");
    });

    it("should redo all batched commands at once", () => {
        const store = new ChunkedCellStore();
        const history = new HistoryStack();
        const bom = new BatchOperationManager();

        bom.beginBatch();

        const old0 = new Cell("old0");
        const old1 = new Cell("old1");
        store.set(0, 0, old0);
        store.set(0, 1, old1);

        const cmd0 = new SetCellCommand(store, 0, 0, old0, new Cell("new0"));
        const cmd1 = new SetCellCommand(store, 0, 1, old1, new Cell("new1"));
        cmd0.redo();
        cmd1.redo();

        bom.pushCommand(cmd0, history);
        bom.pushCommand(cmd1, history);
        bom.endBatch(history);

        history.undo();
        history.redo();

        expect(store.get(0, 0).value).toBe("new0");
        expect(store.get(0, 1).value).toBe("new1");
    });

    it("should clear batch buffer on beginBatch", () => {
        const bom = new BatchOperationManager();
        const history = new HistoryStack();

        bom.beginBatch();
        bom.pushCommand({ undo: vi.fn(), redo: vi.fn() }, history);
        bom.endBatch(history);

        bom.beginBatch();
        bom.endBatch(history);
        expect(history.undoStack).toHaveLength(1);
    });
});