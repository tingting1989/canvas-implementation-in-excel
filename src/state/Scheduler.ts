import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

const raf: (fn: () => void) => number =
    typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16) as unknown as number;
const caf: (id: number) => void =
    typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : (clearTimeout as unknown as (id: number) => void);

/** 调度器任务 */
interface SchedulerJob {
    /** 任务唯一标识，用于去重 */
    id?: unknown;
    /** 任务执行函数 */
    run: () => void;
}

/**
 * 异步任务调度器 (Scheduler)
 *
 * 核心设计：
 * - 使用 requestAnimationFrame 将任务调度到下一帧执行，避免在同一帧内重复渲染
 * - 任务去重：通过 job.id 判断，相同 id 的任务只保留一个
 * - 支持手动 flush（立即执行队列）和 nextTick（等待队列清空）
 * - 与 ReactiveStore 配合，管理异步 watcher 的执行时机
 *
 * @class Scheduler
 */
export class Scheduler {
    /** 待执行的任务队列 */
    _queue: SchedulerJob[] = [];
    /** 是否正在刷新队列（防止 flush 重入） */
    _flushing: boolean = false;
    /** 是否已调度 raf 回调（防止重复调度） */
    _pendingRaf: boolean = false;
    /** raf 返回的 id，用于取消 */
    _rafId: number = 0;

    /**
     * 将任务加入队列
     * 如果 job.id 已存在于队列中，则跳过（去重）。
     * 入队后自动调度一次 raf flush。
     * @param job - 任务对象
     */
    queueJob(job: SchedulerJob): void {
        if (job.id !== undefined) {
            const exists = this._queue.some((j) => j.id === job.id);
            if (exists) return;
        }
        this._queue.push(job);
        this._scheduleFlush();
    }

    /** 调度一次 raf flush，如果已有待执行的 raf，则跳过 */
    _scheduleFlush(): void {
        if (this._pendingRaf) return;
        this._pendingRaf = true;
        this._rafId = raf(() => {
            this._pendingRaf = false;
            this.flush();
        });
    }

    /**
     * 立即执行队列中的所有任务
     * 将队列中的任务一次性取出并逐个执行，
     * 执行期间新入队的任务不会在本次 flush 中执行（避免无限循环）。
     */
    flush(): void {
        if (this._flushing) return;
        this._flushing = true;

        const jobs = this._queue.splice(0);
        for (const job of jobs) {
            try {
                job.run();
            } catch (err) {
                errorHandler.error(ERROR_CODE.GENERIC_ERROR, "[Scheduler] job error:", err);
            }
        }

        this._flushing = false;
    }

    /**
     * 返回一个 Promise，在队列清空后 resolve
     * 通过 raf 轮询检查队列是否为空。
     * @returns Promise
     */
    nextTick(): Promise<void> {
        return new Promise((resolve) => {
            if (this._queue.length === 0) {
                resolve();
                return;
            }
            const check = () => {
                if (this._queue.length === 0) {
                    resolve();
                } else {
                    raf(check);
                }
            };
            raf(check);
        });
    }

    /** 取消所有待执行的任务，取消已调度的 raf，清空任务队列 */
    cancel(): void {
        if (this._pendingRaf) {
            caf(this._rafId);
        }
        this._pendingRaf = false;
        this._queue.length = 0;
    }

    /** 当前队列中待执行的任务数量 */
    get pending(): number {
        return this._queue.length;
    }
}
