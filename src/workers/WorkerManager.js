/**
 * WorkerManager - Web Worker 统一管理器
 *
 * 核心职责：
 * - 管理 Worker 实例池（复用、懒加载、自动回收）
 * - 统一任务调度（优先级、并发控制）
 * - 健康监控（超时、错误恢复）
 * - 资源限制（内存、CPU 使用率）
 *
 * 设计模式：
 * - 单例模式（全局唯一实例）
 * - 工厂模式（动态创建 Worker）
 * - 观察者模式（状态变化通知）
 * - 池化技术（Worker 复用）
 *
 * 使用示例：
 * ```js
 * const manager = new WorkerManager();
 *
 * // 注册 Worker 类型
 * manager.register('chartData', {
 *     worker: () => new Worker(new URL('./workers/ChartDataExtractor.worker.js', import.meta.url)),
 *     maxInstances: 4,
 *     priority: 'high',
 *     timeout: 8000
 * });
 *
 * // 提交任务
 * const result = await manager.execute('chartData', {
 *     type: 'extract',
 *     dataRange: { startRow: 0, endRow: 100, ... },
 *     cellData: [...]
 * });
 * ```
 */

export class WorkerManager {
    /** @type {Map<string, WorkerConfig>} 已注册的 Worker 类型 */
    #registry = new Map();

    /** @type {Map<string, WorkerPool>} Worker 实例池 */
    #pools = new Map();

    /** @type {TaskQueue} 全局任务队列 */
    #taskQueue;

    /** @type {number} 最大并发任务数 */
    #maxConcurrency;

    /** @type {object} 性能统计 */
    #stats = {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        avgExecutionTime: 0,
        activeWorkers: 0,
        poolHits: 0,
        poolMisses: 0,
    };

    /** @type {Set<Function>} 状态变更监听器 */
    #listeners = new Set();

    constructor(options = {}) {
        this.#maxConcurrency = options.maxConcurrency || (navigator.hardwareConcurrency || 4) - 1;
        this.#taskQueue = new TaskQueue(this.#maxConcurrency);

        console.log(`[WorkerManager] Initialized with max concurrency: ${this.#maxConcurrency}`);
    }

    /**
     * 注册一种 Worker 类型
     *
     * @param {string} name - Worker 类型名称（如 'chartData', 'formula'）
     * @param {object} config - 配置项
     * @param {Function} config.worker - Worker 工厂函数
     * @param {number} [config.maxInstances=4] - 最大实例数
     * @param {string} [config.priority='normal'] - 默认优先级 ('high'|'normal'|'low')
     * @param {number} [config.timeout=10000] - 任务超时时间（毫秒）
     * @param {boolean} [config.lazyInit=true] - 是否延迟初始化
     * @returns {WorkerManager} this（支持链式调用）
     */
    register(name, config) {
        if (!name || typeof name !== "string") {
            throw new Error("[WorkerManager] Invalid worker name");
        }

        if (this.#registry.has(name)) {
            console.warn(`[WorkerManager] Worker "${name}" already registered, updating config`);
        }

        const defaultConfig = {
            maxInstances: Math.min(4, this.#maxConcurrency),
            priority: "normal",
            timeout: 10000,
            lazyInit: true,
            retryCount: 2,
            retryDelay: 1000,
        };

        const workerConfig = { ...defaultConfig, ...config, name };

        this.#registry.set(name, workerConfig);

        // 创建对应的 Worker 池
        this.#pools.set(name, new WorkerPool(workerConfig));

        console.log(`[WorkerManager] ✅ Registered worker "${name}"`, {
            maxInstances: workerConfig.maxInstances,
            timeout: workerConfig.timeout + "ms",
            lazyInit: workerConfig.lazyInit,
        });

        return this; // 支持链式调用
    }

    /**
     * 执行一个 Worker 任务
     *
     * @param {string} workerName - Worker 类型名称
     * @param {object} taskData - 要发送给 Worker 的数据
     * @param {object} [options={}] - 执行选项
     * @param {string} [options.priority] - 覆盖默认优先级
     * @param {number} [options.timeout] - 覆盖默认超时
     * @returns {Promise<any>} Worker 的返回结果
     */
    async execute(workerName, taskData, options = {}) {
        const startTime = performance.now();
        this.#stats.totalTasks++;

        try {
            // 1️⃣ 验证 Worker 是否已注册
            const config = this.#registry.get(workerName);
            if (!config) {
                throw new Error(`[WorkerManager] Worker "${workerName}" not registered`);
            }

            // 2️⃣ 获取可用的 Worker 实例
            const pool = this.#pools.get(workerName);
            const workerInstance = await pool.acquire();

            // 3️⃣ 创建并提交任务
            const task = new Task({
                id: this.#generateTaskId(),
                workerName,
                data: taskData,
                options: {
                    ...config,
                    ...options,
                },
                workerInstance,
            });

            // 4️⃣ 执行任务（带超时和重试）
            const result = await this.#executeWithRetry(task);

            // 5️⃣ 归还 Worker 到池中
            pool.release(workerInstance);
            this.#stats.poolHits++;

            // 6️⃣ 更新统计信息
            const duration = performance.now() - startTime;
            this.#updateStats(duration, true);

            return result;
        } catch (error) {
            this.#stats.failedTasks++;
            this.#stats.poolMisses++;

            console.error(`[WorkerManager] Task failed:`, error);
            throw error;
        }
    }

    /**
     * 批量执行多个任务（并行）
     *
     * @param {Array<{workerName: string, data: object}>} tasks - 任务数组
     * @param {object} [options={}] - 全局选项
     * @returns {Promise<Array<any>>} 结果数组（与输入顺序一致）
     */
    async executeBatch(tasks, options = {}) {
        const promises = tasks.map((task, index) =>
            this.execute(task.workerName, task.data, options)
                .then((result) => ({ index, result, error: null }))
                .catch((error) => ({ index, result: null, error })),
        );

        const results = await Promise.allSettled(promises);

        return results.map((r) => (r.status === "fulfilled" ? r.value : { error: r.reason }));
    }

    /**
     * 带重试的任务执行
     * @private
     */
    async #executeWithRetry(task) {
        let lastError;
        const maxRetries = task.options.retryCount || 0;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.#executeSingle(task);
            } catch (error) {
                lastError = error;

                if (attempt < maxRetries) {
                    const delay = (task.options.retryDelay || 1000) * (attempt + 1);
                    console.warn(`[WorkerManager] Retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));

                    // 重试时可能需要重新获取 Worker
                    if (error.code === "WORKER_CRASHED") {
                        const pool = this.#pools.get(task.workerName);
                        task.workerInstance = await pool.acquire(true); // 强制新建
                    }
                }
            }
        }

        throw lastError;
    }

    /**
     * 执行单个任务
     * @private
     */
    async #executeSingle(task) {
        const { workerInstance, data, options } = task;
        const taskId = task.id;

        return new Promise((resolve, reject) => {
            // 设置超时定时器
            const timeoutId = setTimeout(() => {
                reject(new Error(`[WorkerManager] Task ${taskId} timeout after ${options.timeout}ms`));
            }, options.timeout);

            // 消息处理器
            const messageHandler = (event) => {
                const response = event.data;

                // 只响应当前任务的 ID（如果 Worker 支持多任务）
                if (response.taskId && response.taskId !== taskId) {
                    return;
                }

                clearTimeout(timeoutId);
                workerInstance.removeEventListener("message", messageHandler);

                if (response.success !== false && !response.error) {
                    resolve(response.data ?? response);
                } else {
                    reject(new Error(response.error || response.message || "Unknown worker error"));
                }
            };

            // 错误处理器
            const errorHandler = (error) => {
                clearTimeout(timeoutId);
                workerInstance.removeEventListener("message", messageHandler);
                workerInstance.removeEventListener("error", errorHandler);

                reject(new Error(`[WorkerManager] Worker error: ${error.message}`));
            };

            // 注册事件监听
            workerInstance.addEventListener("message", messageHandler);
            workerInstance.addEventListener("error", errorHandler);

            // 发送任务数据
            workerInstance.postMessage({
                ...data,
                taskId,
                timestamp: Date.now(),
            });
        });
    }

    /**
     * 生成唯一的任务 ID
     * @private
     */
    #generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 更新性能统计
     * @private
     */
    #updateStats(duration, success) {
        if (success) {
            this.#stats.completedTasks++;

            // 计算平均执行时间（移动平均）
            const alpha = 0.3; // 平滑因子
            this.#stats.avgExecutionTime = alpha * duration + (1 - alpha) * this.#stats.avgExecutionTime;
        }

        // 通知监听器
        this.#notifyListeners("statsUpdated", this.getStats());
    }

    /**
     * 通知所有监听器
     * @private
     */
    #notifyListeners(event, data) {
        for (const listener of this.#listeners) {
            try {
                listener(event, data);
            } catch (e) {
                console.error("[WorkerManager] Listener error:", e);
            }
        }
    }

    /**
     * 注册状态变更监听器
     *
     * @param {Function} listener - 监听函数 (event, data) => void
     * @returns {Function} 取消注册的函数
     */
    onStateChange(listener) {
        this.#listeners.add(listener);

        // 返回取消订阅的函数
        return () => {
            this.#listeners.delete(listener);
        };
    }

    /**
     * 获取性能统计信息
     */
    getStats() {
        return {
            ...this.#stats,
            registeredWorkers: this.#registry.size,
            activePools: Array.from(this.#pools.entries()).map(([name, pool]) => ({
                name,
                available: pool.available,
                inUse: pool.inUse,
                total: pool.total,
            })),
        };
    }

    /**
     * 预热指定的 Worker 池（提前初始化）
     *
     * @param {string} workerName - Worker 名称
     * @param {number} [count=1] - 预热数量
     */
    async warmup(workerName, count = 1) {
        const pool = this.#pools.get(workerName);
        if (!pool) {
            throw new Error(`[WorkerManager] Unknown worker: ${workerName}`);
        }

        console.log(`[WorkerManager] Warming up "${workerName}" with ${count} instance(s)...`);

        for (let i = 0; i < count; i++) {
            const instance = await pool.acquire();
            pool.release(instance);
        }

        console.log(`[WorkerManager] ✅ Warmup complete for "${workerName}"`);
    }

    /**
     * 销毁指定类型的所有 Worker
     *
     * @param {string} workerName - Worker 名称
     */
    async destroyPool(workerName) {
        const pool = this.#pools.get(workerName);
        if (pool) {
            await pool.destroyAll();
            this.#pools.delete(workerName);
            this.#registry.delete(workerName);

            console.log(`[WorkerManager] Destroyed pool "${workerName}"`);
        }
    }

    /**
     * 销毁所有 Worker 和资源
     */
    async destroy() {
        console.log("[WorkerManager] Destroying all workers...");

        const destroyPromises = [];
        for (const [name, pool] of this.#pools.entries()) {
            destroyPromises.push(pool.destroyAll());
        }

        await Promise.all(destroyPromises);

        this.#pools.clear();
        this.#registry.clear();
        this.#listeners.clear();

        console.log("[WorkerManager] ✅ All workers destroyed");
    }

    /**
     * 检查是否已注册指定 Worker
     */
    hasWorker(name) {
        return this.#registry.has(name);
    }

    /**
     * 获取已注册的 Worker 名称列表
     */
    getRegisteredWorkers() {
        return Array.from(this.#registry.keys());
    }
}

/**
 * WorkerPool - Worker 实例池
 *
 * 功能：
 * - 复用 Worker 实例（避免重复创建/销毁的开销）
 * - 懒加载（按需创建）
 * - 自动扩容（达到上限前）
 * - 健康检查（崩溃后重建）
 */
class WorkerPool {
    #config;
    #available = []; // 空闲 Worker 列表
    #inUse = new Set(); // 正在使用的 Worker

    constructor(config) {
        this.#config = config;
    }

    /**
     * 获取一个可用 Worker 实例
     *
     * @param {boolean} forceNew - 是否强制创建新实例
     * @returns {Promise<Worker>}
     */
    async acquire(forceNew = false) {
        // 如果不强制新建且有可用实例，直接返回
        if (!forceNew && this.#available.length > 0) {
            const worker = this.#available.pop();
            this.#inUse.add(worker);
            return worker;
        }

        // 检查是否可以创建新实例
        if (this.total >= this.#config.maxInstances) {
            // 达到上限，等待有空闲实例
            return this.#waitForAvailable();
        }

        // 创建新实例
        try {
            const worker = await this.#createWorker();
            this.#inUse.add(worker);
            return worker;
        } catch (error) {
            console.error(`[WorkerPool] Failed to create worker:`, error);
            throw error;
        }
    }

    /**
     * 归还 Worker 到池中
     *
     * @param {Worker} worker - 要归还的 Worker 实例
     */
    release(worker) {
        if (this.#inUse.has(worker)) {
            this.#inUse.delete(worker);

            // 健康检查：只有正常的 Worker 才放回池中
            if (this.#isHealthy(worker)) {
                this.#available.push(worker);
            } else {
                // 不健康的 Worker 直接终止
                this.#terminateWorker(worker);
            }
        }
    }

    /**
     * 销毁所有 Worker
     */
    async destroyAll() {
        const allWorkers = [...this.#available, ...this.#inUse];

        for (const worker of allWorkers) {
            this.#terminateWorker(worker);
        }

        this.#available = [];
        this.#inUse.clear();
    }

    /**
     * 创建新的 Worker 实例
     * @private
     */
    async #createWorker() {
        const workerFactory = this.#config.worker;

        if (typeof workerFactory !== "function") {
            throw new Error("[WorkerPool] Invalid worker factory");
        }

        const worker = workerFactory();

        // 等待 Worker 就绪（如果有 ready 机制）
        await this.#waitForReady(worker);

        console.log(`[WorkerPool] Created new worker instance (${this.total}/${this.#config.maxInstances})`);

        return worker;
    }

    /**
     * 等待 Worker 就绪
     * @private
     */
    async #waitForReady(worker) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                worker.removeEventListener("message", handler);
                resolve(); // 超时也认为就绪
            }, 2000);

            const handler = (event) => {
                if (event.data.type === "ready" || event.data.type === "pong") {
                    clearTimeout(timeout);
                    worker.removeEventListener("message", handler);
                    resolve();
                }
            };

            worker.addEventListener("message", handler);

            // 发送 ping 测试
            worker.postMessage({ type: "ping" });
        });
    }

    /**
     * 等待有可用 Worker（当池满时）
     * @private
     */
    async #waitForAvailable() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("[WorkerPool] Timeout waiting for available worker"));
            }, 30000);

            const checkInterval = setInterval(() => {
                if (this.#available.length > 0) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    const worker = this.#available.pop();
                    this.#inUse.add(worker);
                    resolve(worker);
                }
            }, 50); // 每 50ms 检查一次
        });
    }

    /**
     * 检查 Worker 是否健康
     * @private
     */
    #isHealthy(worker) {
        // 简单检查：确保 Worker 未被终止
        try {
            return worker.readyState !== undefined ? worker.readyState === 0 : true;
        } catch {
            return false;
        }
    }

    /**
     * 终止 Worker
     * @private
     */
    #terminateWorker(worker) {
        try {
            worker.terminate();
        } catch (e) {
            // 忽略终止错误
        }
    }

    get available() {
        return this.#available.length;
    }

    get inUse() {
        return this.#inUse.size;
    }

    get total() {
        return this.#available.length + this.#inUse.size;
    }
}

/**
 * Task - 任务封装
 */
class Task {
    id;
    workerName;
    data;
    options;
    workerInstance;
    createdAt;
    status;

    constructor({ id, workerName, data, options, workerInstance }) {
        this.id = id;
        this.workerName = workerName;
        this.data = data;
        this.options = options;
        this.workerInstance = workerInstance;
        this.createdAt = Date.now();
        this.status = "pending";
    }
}

/**
 * TaskQueue - 任务队列（预留接口）
 */
class TaskQueue {
    #maxConcurrency;
    #running = 0;
    #queue = [];

    constructor(maxConcurrency) {
        this.#maxConcurrency = maxConcurrency;
    }

    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.#queue.push({ task, resolve, reject });
            this.#processNext();
        });
    }

    #processNext() {
        while (this.#running < this.#maxConcurrency && this.#queue.length > 0) {
            const { task, resolve, reject } = this.#queue.shift();
            this.#running++;

            // 执行任务
            Promise.resolve()
                .then(() => resolve(task))
                .catch(reject)
                .finally(() => {
                    this.#running--;
                    this.#processNext();
                });
        }
    }
}

// 导出单例实例（可选）
export const globalWorkerManager = new WorkerManager();
