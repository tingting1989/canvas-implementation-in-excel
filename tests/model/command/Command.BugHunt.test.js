import { describe, it, expect, beforeEach } from "vitest";
import { Command } from "@/model/command/Command";
import { SetCellCommand } from "@/model/command/SetCellCommand";
import { BatchCommand } from "@/model/command/BatchCommand";
import { ToggleDisableCommand } from "@/model/command/ToggleDisableCommand";
import { MergeCommand } from "@/model/command/MergeCommand";
import { UnmergeCommand } from "@/model/command/UnmergeCommand";
import { Cell } from "@/model/store/Cell";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";
import { MergeManager } from "@/model/merge/MergeManager";
import { HistoryStack } from "@/model/history/HistoryStack";

describe("Command System - Bug Hunting", () => {
    describe("SetCellCommand - redo/undo不变量", () => {
        it("BUG: redo + undo应完全恢复原状态", () => {
            const store = new ChunkedCellStore();
            const oldCell = new Cell("old", 5, false);
            store.set(0, 0, oldCell);

            const cmd = new SetCellCommand(store, 0, 0, oldCell, new Cell("new", 10, true));
            cmd.redo();
            expect(store.get(0, 0).value).toBe("new");
            expect(store.get(0, 0).styleId).toBe(10);
            expect(store.get(0, 0).disabled).toBe(true);

            cmd.undo();
            expect(store.get(0, 0).value).toBe("old");
            expect(store.get(0, 0).styleId).toBe(5);
            expect(store.get(0, 0).disabled).toBe(false);
        });

        it("BUG: undo(oldCell=null)应删除单元格", () => {
            const store = new ChunkedCellStore();
            const cmd = new SetCellCommand(store, 0, 0, null, new Cell("new"));
            cmd.redo();
            expect(store.get(0, 0).value).toBe("new");

            cmd.undo();
            expect(store.get(0, 0)).toBeUndefined();
        });

        it("BUG: undo后再次redo应恢复新值", () => {
            const store = new ChunkedCellStore();
            const cmd = new SetCellCommand(store, 0, 0, new Cell("old"), new Cell("new"));
            cmd.redo();
            cmd.undo();
            cmd.redo();

            expect(store.get(0, 0).value).toBe("new");
        });

        it("BUG: 多个SetCellCommand对同一位置应正确覆盖", () => {
            const store = new ChunkedCellStore();
            const cmd1 = new SetCellCommand(store, 0, 0, null, new Cell("A"));
            const cmd2 = new SetCellCommand(store, 0, 0, new Cell("A"), new Cell("B"));

            cmd1.redo();
            cmd2.redo();
            expect(store.get(0, 0).value).toBe("B");

            cmd2.undo();
            expect(store.get(0, 0).value).toBe("A");

            cmd1.undo();
            expect(store.get(0, 0)).toBeUndefined();
        });
    });

    describe("BatchCommand - 原子性不变量", () => {
        it("BUG: BatchCommand的undo应逆序撤销所有子命令", () => {
            const store = new ChunkedCellStore();
            const cmds = [
                new SetCellCommand(store, 0, 0, null, new Cell("A")),
                new SetCellCommand(store, 0, 1, null, new Cell("B")),
                new SetCellCommand(store, 0, 2, null, new Cell("C")),
            ];

            const batch = new BatchCommand(cmds);
            batch.redo();

            expect(store.get(0, 0).value).toBe("A");
            expect(store.get(0, 1).value).toBe("B");
            expect(store.get(0, 2).value).toBe("C");

            batch.undo();

            expect(store.get(0, 0)).toBeUndefined();
            expect(store.get(0, 1)).toBeUndefined();
            expect(store.get(0, 2)).toBeUndefined();
        });

        it("BUG: 空BatchCommand不应报错", () => {
            const batch = new BatchCommand([]);
            expect(() => batch.redo()).not.toThrow();
            expect(() => batch.undo()).not.toThrow();
        });

        it("BUG: BatchCommand redo + undo + redo应正确", () => {
            const store = new ChunkedCellStore();
            const cmds = [
                new SetCellCommand(store, 0, 0, null, new Cell("X")),
                new SetCellCommand(store, 1, 1, null, new Cell("Y")),
            ];

            const batch = new BatchCommand(cmds);
            batch.redo();
            batch.undo();
            batch.redo();

            expect(store.get(0, 0).value).toBe("X");
            expect(store.get(1, 1).value).toBe("Y");
        });

        it("BUG: BatchCommand中子命令互相依赖时应正确", () => {
            const store = new ChunkedCellStore();
            store.set(0, 0, new Cell("original"));

            const cmds = [
                new SetCellCommand(store, 0, 0, store.get(0, 0), new Cell("step1")),
                new SetCellCommand(store, 0, 0, new Cell("step1"), new Cell("step2")),
            ];

            const batch = new BatchCommand(cmds);
            batch.redo();
            expect(store.get(0, 0).value).toBe("step2");

            batch.undo();
            expect(store.get(0, 0).value).toBe("original");
        });
    });

    describe("ToggleDisableCommand - 状态切换", () => {
        it("BUG: redo应切换禁用状态", () => {
            const store = new ChunkedCellStore();
            const cell = new Cell("test", 0, false);
            store.set(0, 0, cell);

            const cmd = new ToggleDisableCommand(store, 0, 0);
            cmd.redo();
            expect(store.get(0, 0).disabled).toBe(true);

            cmd.undo();
            expect(store.get(0, 0).disabled).toBe(false);
        });

        it("BUG: 多次redo + undo应正确切换", () => {
            const store = new ChunkedCellStore();
            store.set(0, 0, new Cell("test", 0, false));

            const cmd = new ToggleDisableCommand(store, 0, 0);
            cmd.redo();
            expect(store.get(0, 0).disabled).toBe(true);

            cmd.undo();
            expect(store.get(0, 0).disabled).toBe(false);

            cmd.redo();
            expect(store.get(0, 0).disabled).toBe(true);
        });
    });

    describe("MergeCommand / UnmergeCommand", () => {
        it("BUG: MergeCommand redo + undo应正确", () => {
            const mm = new MergeManager();
            const cmd = new MergeCommand(mm, 0, 0, 2, 2);

            cmd.redo();
            expect(mm.getMerge(0, 0)).not.toBeNull();
            expect(mm.getCount()).toBe(1);

            cmd.undo();
            expect(mm.getMerge(0, 0)).toBeNull();
            expect(mm.getCount()).toBe(0);
        });

        it("BUG: UnmergeCommand redo + undo应正确", () => {
            const mm = new MergeManager();
            mm.merge(0, 0, 2, 2);

            const cmd = new UnmergeCommand(mm, 0, 0);
            cmd.redo();
            expect(mm.getCount()).toBe(0);

            cmd.undo();
            expect(mm.getCount()).toBe(1);
            expect(mm.getMerge(0, 0)).not.toBeNull();
        });
    });

    describe("HistoryStack - 复合操作不变量", () => {
        it("BUG: undo后push新命令应清空redo栈", () => {
            const store = new ChunkedCellStore();
            const hs = new HistoryStack();

            hs.push(new SetCellCommand(store, 0, 0, null, new Cell("A")));
            hs.push(new SetCellCommand(store, 0, 1, null, new Cell("B")));

            hs.undo();
            expect(store.get(0, 1)).toBeUndefined();

            hs.push(new SetCellCommand(store, 0, 2, null, new Cell("C")));

            hs.redo();
            expect(store.get(0, 1)).toBeUndefined();
        });

        it("BUG: 连续undo/redo应正确恢复状态", () => {
            const store = new ChunkedCellStore();
            const hs = new HistoryStack();

            hs.push(new SetCellCommand(store, 0, 0, null, new Cell("A")));
            hs.push(new SetCellCommand(store, 0, 0, new Cell("A"), new Cell("B")));
            hs.push(new SetCellCommand(store, 0, 0, new Cell("B"), new Cell("C")));

            expect(store.get(0, 0).value).toBe("C");

            hs.undo();
            expect(store.get(0, 0).value).toBe("B");

            hs.undo();
            expect(store.get(0, 0).value).toBe("A");

            hs.undo();
            expect(store.get(0, 0)).toBeUndefined();

            hs.redo();
            expect(store.get(0, 0).value).toBe("A");

            hs.redo();
            expect(store.get(0, 0).value).toBe("B");

            hs.redo();
            expect(store.get(0, 0).value).toBe("C");
        });

        it("BUG: BatchCommand在HistoryStack中应原子撤销", () => {
            const store = new ChunkedCellStore();
            const hs = new HistoryStack();

            const batch = new BatchCommand([
                new SetCellCommand(store, 0, 0, null, new Cell("A")),
                new SetCellCommand(store, 0, 1, null, new Cell("B")),
                new SetCellCommand(store, 0, 2, null, new Cell("C")),
            ]);

            batch.redo();
            hs.push(batch);

            hs.undo();
            expect(store.get(0, 0)).toBeUndefined();
            expect(store.get(0, 1)).toBeUndefined();
            expect(store.get(0, 2)).toBeUndefined();

            hs.redo();
            expect(store.get(0, 0).value).toBe("A");
            expect(store.get(0, 1).value).toBe("B");
            expect(store.get(0, 2).value).toBe("C");
        });

        it("BUG: 空HistoryStack的undo/redo不应报错", () => {
            const hs = new HistoryStack();
            expect(() => hs.undo()).not.toThrow();
            expect(() => hs.redo()).not.toThrow();
        });

        it("BUG: 多次undo超过栈深度不应报错", () => {
            const hs = new HistoryStack();
            hs.push({ undo: () => {}, redo: () => {} });

            hs.undo();
            expect(() => hs.undo()).not.toThrow();
        });

        it("BUG: 多次redo超过栈深度不应报错", () => {
            const hs = new HistoryStack();
            hs.push({ undo: () => {}, redo: () => {} });

            hs.undo();
            hs.redo();
            expect(() => hs.redo()).not.toThrow();
        });
    });

    describe("Command基类", () => {
        it("BUG: 基类的redo和undo应为空操作", () => {
            const cmd = new Command();
            expect(() => cmd.redo()).not.toThrow();
            expect(() => cmd.undo()).not.toThrow();
        });
    });
});