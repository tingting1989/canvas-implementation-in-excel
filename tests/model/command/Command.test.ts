import { describe, it, expect } from "vitest";
import { Command } from "@/model/command/Command";

describe("Command", () => {
    describe("构造函数", () => {
        it("CMD-01: 应正确创建实例", () => {
            const cmd = new Command();
            expect(cmd).toBeInstanceOf(Command);
        });
    });

    describe("redo()", () => {
        it("CMD-02: 基类 redo 为空实现，不抛错", () => {
            const cmd = new Command();
            expect(() => cmd.redo()).not.toThrow();
        });
    });

    describe("undo()", () => {
        it("CMD-03: 基类 undo 为空实现，不抛错", () => {
            const cmd = new Command();
            expect(() => cmd.undo()).not.toThrow();
        });
    });

    describe("子类继承", () => {
        it("CMD-04: 子类可重写 redo/undo", () => {
            const log: string[] = [];
            class MyCommand extends Command {
                redo() { log.push("redo"); }
                undo() { log.push("undo"); }
            }
            const cmd = new MyCommand();
            cmd.redo();
            cmd.undo();
            expect(log).toEqual(["redo", "undo"]);
        });
    });
});