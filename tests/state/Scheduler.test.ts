import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "@/state/Scheduler";

describe("Scheduler", () => {
    let scheduler: Scheduler;

    beforeEach(() => {
        scheduler = new Scheduler();
    });

    afterEach(() => {
        scheduler.cancel();
    });

    describe("构造函数和基础属性", () => {
        it("SCH-01: 应正确创建实例", () => {
            expect(scheduler).toBeInstanceOf(Scheduler);
        });

        it("SCH-02: 初始队列为空", () => {
            expect(scheduler.pending).toBe(0);
        });

        it("SCH-03: 初始未在刷新", () => {
            expect(scheduler._flushing).toBe(false);
        });

        it("SCH-04: 初始无待执行 raf", () => {
            expect(scheduler._pendingRaf).toBe(false);
        });
    });

    describe("queueJob()", () => {
        it("SCH-05: 应将任务加入队列", () => {
            const run = vi.fn();
            scheduler.queueJob({ run });
            expect(scheduler.pending).toBe(1);
        });

        it("SCH-06: 相同 id 的任务应去重", () => {
            const run = vi.fn();
            const id = "dup";
            scheduler.queueJob({ id, run });
            scheduler.queueJob({ id, run });
            expect(scheduler.pending).toBe(1);
        });

        it("SCH-07: 不同 id 的任务不去重", () => {
            const run = vi.fn();
            scheduler.queueJob({ id: "a", run });
            scheduler.queueJob({ id: "b", run });
            expect(scheduler.pending).toBe(2);
        });

        it("SCH-08: 无 id 的任务不去重", () => {
            const run = vi.fn();
            scheduler.queueJob({ run });
            scheduler.queueJob({ run });
            expect(scheduler.pending).toBe(2);
        });

        it("SCH-09: 入队后应调度 raf", () => {
            scheduler.queueJob({ run: vi.fn() });
            expect(scheduler._pendingRaf).toBe(true);
        });
    });

    describe("flush()", () => {
        it("SCH-10: 应执行队列中所有任务", () => {
            const run1 = vi.fn();
            const run2 = vi.fn();
            scheduler.queueJob({ run: run1 });
            scheduler.queueJob({ run: run2 });
            scheduler.flush();
            expect(run1).toHaveBeenCalled();
            expect(run2).toHaveBeenCalled();
        });

        it("SCH-11: 执行后队列应为空", () => {
            scheduler.queueJob({ run: vi.fn() });
            scheduler.flush();
            expect(scheduler.pending).toBe(0);
        });

        it("SCH-12: 防止重入", () => {
            const run = vi.fn(() => {
                scheduler.queueJob({ run: vi.fn() });
            });
            scheduler.queueJob({ run });
            scheduler.flush();
            expect(run).toHaveBeenCalledOnce();
        });

        it("SCH-13: 任务出错时不影响其他任务", () => {
            const run1 = vi.fn(() => {
                throw new Error("test error");
            });
            const run2 = vi.fn();
            scheduler.queueJob({ run: run1 });
            scheduler.queueJob({ run: run2 });
            scheduler.flush();
            expect(run2).toHaveBeenCalled();
        });
    });

    describe("cancel()", () => {
        it("SCH-14: 应清空任务队列", () => {
            scheduler.queueJob({ run: vi.fn() });
            scheduler.cancel();
            expect(scheduler.pending).toBe(0);
        });

        it("SCH-15: 取消后 pendingRaf 为 false", () => {
            scheduler.queueJob({ run: vi.fn() });
            scheduler.cancel();
            expect(scheduler._pendingRaf).toBe(false);
        });

        it("SCH-16: 多次 cancel 不抛异常", () => {
            expect(() => { scheduler.cancel(); scheduler.cancel(); }).not.toThrow();
        });
    });

    describe("pending", () => {
        it("SCH-17: 应返回队列长度", () => {
            expect(scheduler.pending).toBe(0);
            scheduler.queueJob({ run: vi.fn() });
            expect(scheduler.pending).toBe(1);
            scheduler.queueJob({ run: vi.fn() });
            expect(scheduler.pending).toBe(2);
        });
    });

    describe("nextTick()", () => {
        it("SCH-18: 队列为空时立即 resolve", async () => {
            await scheduler.nextTick();
            expect(true).toBe(true);
        });

        it("SCH-19: 队列非空时等待清空后 resolve", async () => {
            scheduler.queueJob({ run: vi.fn() });
            scheduler.flush();
            await scheduler.nextTick();
            expect(scheduler.pending).toBe(0);
        });
    });
});