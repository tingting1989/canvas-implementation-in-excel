import { describe, it, expect, vi } from "vitest";
import { BatchCommand } from "@/model/command/BatchCommand";
import { Command } from "@/model/command/Command";

describe("BatchCommand", () => {
    describe("构造函数", () => {
        it("BC-01: 应正确创建实例", () => {
            const cmd = new BatchCommand([]);
            expect(cmd).toBeInstanceOf(BatchCommand);
            expect(cmd.commands).toHaveLength(0);
        });
    });

    describe("redo()", () => {
        it("BC-02: 应按正序执行所有子命令的 redo", () => {
            const log: number[] = [];
            const cmds = [1, 2, 3].map((n) => {
                const c = new Command();
                c.redo = () => log.push(n);
                return c;
            });
            const batch = new BatchCommand(cmds);
            batch.redo();
            expect(log).toEqual([1, 2, 3]);
        });

        it("BC-03: 空命令列表不报错", () => {
            const batch = new BatchCommand([]);
            expect(() => batch.redo()).not.toThrow();
        });
    });

    describe("undo()", () => {
        it("BC-04: 应按逆序执行所有子命令的 undo", () => {
            const log: number[] = [];
            const cmds = [1, 2, 3].map((n) => {
                const c = new Command();
                c.undo = () => log.push(n);
                return c;
            });
            const batch = new BatchCommand(cmds);
            batch.undo();
            expect(log).toEqual([3, 2, 1]);
        });

        it("BC-05: 空命令列表不报错", () => {
            const batch = new BatchCommand([]);
            expect(() => batch.undo()).not.toThrow();
        });
    });

    describe("redo/undo 循环", () => {
        it("BC-06: redo 后 undo 应恢复状态", () => {
            const log: string[] = [];
            const cmds = [1, 2].map((n) => {
                const c = new Command();
                c.redo = () => log.push(`redo${n}`);
                c.undo = () => log.push(`undo${n}`);
                return c;
            });
            const batch = new BatchCommand(cmds);
            batch.redo();
            batch.undo();
            expect(log).toEqual(["redo1", "redo2", "undo2", "undo1"]);
        });
    });

    describe("单命令", () => {
        it("BC-07: 单个子命令也能正常工作", () => {
            const log: string[] = [];
            const c = new Command();
            c.redo = () => log.push("redo");
            c.undo = () => log.push("undo");
            const batch = new BatchCommand([c]);
            batch.redo();
            batch.undo();
            expect(log).toEqual(["redo", "undo"]);
        });
    });
});