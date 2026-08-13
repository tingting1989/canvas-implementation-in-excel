/**
 * ValidationCache - 三级验证结果缓存架构
 *
 * 🎯 核心功能：
 * - L1: 视口缓存 (Map) - 当前可见区域的验证结果（<0.01ms 读取）
 * - L2: 最近缓存 (LRU) - 最近访问的验证结果（~0.1ms 读取）
 * - L3: 持久化缓存 (IndexedDB) - 跨会话保存的验证结果（~5-10ms 读取）
 *
 * 📌 设计目标：
 * - P99 缓存读取时间 < 1ms
 * - 支持批量写入和失效
 * - 自动淘汰和容量管理
 * - 与单轨异步架构无缝集成
 *
 * 🏗️ 架构设计：
 * ```
 * 用户请求 → L1(视口) → L2(LRU) → L3(IndexedDB) → 未命中
 *    ↑           ↑          ↑                    ↑
 *   <0.01ms    ~0.1ms     ~5-10ms              需要计算
 *
 * 写入时：同时更新所有启用的层级（L3 异步写入不阻塞）
 * 淘汰时：L1 FIFO, L2 LRU, L3 TTL 过期自动清理
 * ```
 *
 * @module data-validation
 * @author Canvas Spreadsheet Team
 * @version 3.0.0
 */

import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { isString } from "../../utils/helper.js";

/**
 * 缓存配置常量
 */
export const CACHE_CONFIG = Object.freeze({
    L1_MAX_SIZE: 500, // L1 视口缓存最大条目数
    L2_MAX_SIZE: 2000, // L2 最近缓存最大条目数
    DEFAULT_TTL_MS: 300000, // 默认缓存有效期 (5分钟)
    L3_DB_NAME: "validation-cache-v1", // IndexedDB 数据库名
    CLEANUP_INTERVAL_MS: 60000, // 过期数据清理间隔 (1分钟)
    MAX_L3_WRITE_RETRIES: 3, // L3 写入最大重试次数
});

/**
 * ValidationCache 类
 *
 * 实现三级缓存架构，为公式验证系统提供高性能的缓存服务。
 * 所有公开方法都是异步的（除了简单的内存操作），确保不会阻塞主线程。
 */
export class ValidationCache {
    /**
     * 构造函数
     * @param {object} [config={}] - 配置选项
     * @param {number} [config.l1MaxSize=500] - L1 视口缓存最大条目数
     * @param {number} [config.l2MaxSize=2000] - L2 最近缓存最大条目数
     * @param {boolean} [config.l3Enabled=true] - 是否启用 L3 持久化缓存
     * @param {number} [config.defaultTTL=300000] - 默认缓存有效期 (ms)
     */
    constructor(config = {}) {
        this.config = {
            l1MaxSize: CACHE_CONFIG.L1_MAX_SIZE,
            l2MaxSize: CACHE_CONFIG.L2_MAX_SIZE,
            l3Enabled: true,
            defaultTTL: CACHE_CONFIG.DEFAULT_TTL_MS,
            ...config,
        };

        // 初始化各级缓存
        this.#initL1Cache();
        this.#initL2Cache();

        // 初始化 L3 持久化缓存（如果启用）
        if (this.config.l3Enabled) {
            this.#initL3Cache().catch((error) => {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] ⚠️ L3 持久化缓存初始化失败，将仅使用内存缓存", { error });
                this.config.l3Enabled = false;
            });
        }

        // 性能统计计数器
        this.stats = {
            hits: { l1: 0, l2: 0, l3: 0 },
            misses: 0,
            writes: 0,
            evictions: 0,
        };
    }

    /**
     * 更新缓存配置（运行时动态调整）
     * @param {Object} newConfig - 新配置项
     * @param {number} [newConfig.l1MaxSize] - L1缓存新最大容量
     * @param {number} [newConfig.l2MaxSize] - L2缓存新最大容量
     * @param {boolean} [newConfig.l3Enabled] - 是否启用L3持久化缓存
     * @param {number} [newConfig.defaultTTL] - 默认缓存有效期(ms)
     */
    updateConfig(newConfig = {}) {
        const oldL1MaxSize = this.config.l1MaxSize;
        const oldL2MaxSize = this.config.l2MaxSize;

        // 合并新配置
        this.config = {
            ...this.config,
            ...newConfig,
        };

        // 如果 L1 最大容量减小，需要淘汰多余条目
        if (newConfig.l1MaxSize && newConfig.l1MaxSize < oldL1MaxSize) {
            this.#evictL1ToSize(newConfig.l1MaxSize);
        }

        // 如果 L2 最大容量减小，需要淘汰多余条目
        if (newConfig.l2MaxSize && newConfig.l2MaxSize < oldL2MaxSize) {
            this.#evictL2ToSize(newConfig.l2MaxSize);
        }

        // 处理 L3 启用/禁用切换
        if (newConfig.l3Enabled !== undefined && newConfig.l3Enabled !== true) {
            // 禁用 L3：关闭数据库连接
            if (this.#l3Db) {
                this.#l3Db.close();
                this.#l3Db = null;
                this.#l3Ready = false;
            }
        } else if (newConfig.l3Enabled === true && !this.#l3Ready) {
            // 启用 L3：重新初始化
            this.#initL3Cache().catch((error) => {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 持久化缓存重新初始化失败", { error });
            });
        }

        errorHandler.info(ERROR_CODE.VALIDATION_INFO, `[ValidationCache] 配置已更新`, this.config);
    }

    #evictL1ToSize(maxSize) {
        while (this.#l1Cache.size > maxSize) {
            const firstKey = this.#l1Cache.keys().next().value;
            this.#l1Cache.delete(firstKey);
            this.stats.evictions++;
        }
    }

    #evictL2ToSize(maxSize) {
        while (this.#l2Cache.size > maxSize) {
            const firstKey = this.#l2Cache.keys().next().value;
            this.#l2Cache.delete(firstKey);
            this.stats.evictions++;
        }
    }

    // ════════════════════════════════════════
    // L1: 视口缓存 (Map) - 当前可见区域
    // ════════════════════════════════════════
    #l1Cache;

    /**
     * 初始化 L1 视口缓存
     * 使用 Map 结构，按插入顺序存储，FIFO 淘汰策略
     * @private
     */
    #initL1Cache() {
        this.#l1Cache = new Map();
    }

    // ════════════════════════════════════════
    // L2: 最近缓存 (LRU) - 最近访问的结果
    // ════════════════════════════════════════
    #l2Cache;

    /**
     * 初始化 L2 最近缓存
     * 使用 Map 实现 LRU（利用 Map 的插入顺序特性）
     * @private
     */
    #initL2Cache() {
        this.#l2Cache = new Map();
    }

    // ════════════════════════════════════════
    // L3: 持久化缓存 (IndexedDB) - 跨会话保存
    // ════════════════════════════════════════
    #l3Db = null;
    #l3Ready = false;

    /**
     * 初始化 L3 持久化缓存（IndexedDB）
     * 异步初始化，不阻塞主线程
     * @private
     * @returns {Promise<void>}
     */
    async #initL3Cache() {
        try {
            this.#l3Db = await new Promise((resolve, reject) => {
                const request = indexedDB.open(this.config.l3DbName || CACHE_CONFIG.L3_DB_NAME, 1);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    // 创建对象存储（如果不存在）
                    if (!db.objectStoreNames.contains("results")) {
                        const store = db.createObjectStore("results", { keyPath: "key" });

                        // 创建索引以支持范围查询和过期清理
                        store.createIndex("timestamp", "timestamp", { unique: false });
                        store.createIndex("expiresAt", "expiresAt", { unique: false });
                        store.createIndex("sheet", "sheet", { unique: false });
                    }
                };
            });

            this.#l3Ready = true;
            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationCache] ✅ L3 持久化缓存初始化成功");

            // 启动定期清理过期数据的定时器
            this.#startExpirationCleanup();
        } catch (error) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] ⚠️ L3 持久化缓存初始化失败", { error });
            throw error; // 抛出错误让调用者处理
        }
    }

    /**
     * 定期清理过期数据（每分钟执行一次）
     * 使用 IndexedDB 的 expiresAt 索引进行高效范围删除
     * @private
     */
    #startExpirationCleanup() {
        setInterval(async () => {
            if (!this.#l3Ready || !this.#l3Db) return;

            try {
                const tx = this.#l3Db.transaction(["results"], "readwrite");
                const store = tx.objectStore("results");
                const index = store.index("expiresAt");
                const now = Date.now();

                // 删除所有已过期的记录
                const range = IDBKeyRange.upperBound(now);
                const request = index.openCursor(range);

                let deletedCount = 0;
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        deletedCount++;
                        cursor.continue();
                    } else if (deletedCount > 0) {
                        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationCache] 清理了 ${deletedCount} 条过期缓存记录`);
                    }
                };
            } catch (error) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] 过期数据清理失败", { error });
            }
        }, CACHE_CONFIG.CLEANUP_INTERVAL_MS);
    }

    // ════════════════════════════════════════
    // 公共 API：缓存读写操作
    // ════════════════════════════════════════

    /**
     * 获取缓存的验证结果（自动从 L1 → L2 → L3 查找）
     *
     * 采用逐级查找策略，优先返回最快的结果。
     * 命中后会自动提升缓存层级（如 L3 → L2 → L1）。
     *
     * @param {string} key - 缓存键（格式: "row,col" 或 "sheet!row,col"）
     * @returns {Promise<{result: object|null, source: string}>}
     * @returns {object|null} returns.result - 缓存的验证结果数据
     * @returns {string} returns.source - 命中的缓存层级 ('l1' | 'l2' | 'l3' | null)
     *
     * @example
     * ```javascript
     * const cache = new ValidationCache();
     * const { result, source } = await cache.get('5,2');
     * if (result) {
     *   console.log(`从 ${source} 层级获取到缓存`);
     * }
     * ```
     */
    async get(key) {
        // 参数校验
        if (!isString(key) || key.trim().length === 0) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] get() 参数无效: key 必须是非空字符串");
            return { result: null, source: null };
        }

        try {
            // 1️⃣ 尝试 L1 视口缓存 (<0.01ms)
            if (this.#l1Cache.has(key)) {
                const entry = this.#l1Cache.get(key);
                if (!this.#isExpired(entry)) {
                    this.stats.hits.l1++;
                    return { result: entry.data, source: "l1" };
                }
                this.#l1Cache.delete(key); // 过期删除
            }

            // 2️⃣ 尝试 L2 最近缓存 (~0.1ms)
            if (this.#l2Cache.has(key)) {
                const entry = this.#l2Cache.get(key);
                if (!this.#isExpired(entry)) {
                    // 提升到 L1（如果 L1 未满）
                    if (this.#l1Cache.size < this.config.l1MaxSize) {
                        this.#l1Cache.set(key, entry);
                    }

                    // 更新 L2 的访问顺序（移到末尾，表示最近使用）
                    this.#l2Cache.delete(key);
                    this.#l2Cache.set(key, entry);

                    this.stats.hits.l2++;
                    return { result: entry.data, source: "l2" };
                }
                this.#l2Cache.delete(key); // 过期删除
            }

            // 3️⃣ 尝试 L3 持久化缓存 (~5-10ms)
            if (this.config.l3Enabled && this.#l3Ready) {
                try {
                    const result = await this.#getFromL3(key);
                    if (result && !this.#isExpired(result)) {
                        // 提升到 L1 和 L2
                        this.#setToL1(key, result.data);
                        this.#setToL2(key, result);

                        this.stats.hits.l3++;
                        return { result: result.data, source: "l3" };
                    }
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 读取失败", { error });
                }
            }

            // 所有层级都未命中
            this.stats.misses++;
            return { result: null, source: null };
        } catch (error) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] get() 操作异常", { error, key });
            return { result: null, source: null };
        }
    }

    /**
     * 写入缓存（同时更新所有启用的层级）
     *
     * 写入策略：
     * - L1 和 L2 同步写入（保证一致性）
     * - L3 异步写入（不阻塞主流程，失败不影响主流程）
     *
     * @param {string} key - 缓存键
     * @param {object} data - 验证结果数据
     * @param {object} [options={}] - 可选配置
     * @param {number} [options.ttl=300000] - 缓存有效期 (ms)，默认5分钟
     * @param {string} [options.source='unknown'] - 数据来源标识
     * @param {string} [options.sheet='default'] - 所属工作表
     *
     * @example
     * ```javascript
     * await cache.set('5,2', {
     *   valid: true,
     *   value: '张三',
     *   ruleId: 'rule_001'
     * }, {
     *   ttl: 60000,      // 1分钟有效
     *   source: 'async-pipeline',
     *   sheet: 'Sheet1'
     * });
     * ```
     */
    async set(key, data, options = {}) {
        // 参数校验
        if (!isString(key) || key.trim().length === 0) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] set() 参数无效: key 必须是非空字符串");
            return;
        }

        try {
            const ttl = options.ttl || this.config.defaultTTL;
            const now = Date.now();

            const cacheEntry = {
                data,
                timestamp: now,
                expiresAt: now + ttl,
                source: options.source || "unknown",
                sheet: options.sheet || "default",
            };

            // 同步写入 L1 和 L2
            this.#setToL1(key, cacheEntry);
            this.#setToL2(key, cacheEntry);

            // 异步写入 L3（不阻塞主流程）
            if (this.config.l3Enabled && this.#l3Ready) {
                this.#setToL3(key, cacheEntry).catch((error) => {
                    errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 写入失败（不影响主流程）", { error });
                });
            }

            this.stats.writes++;
        } catch (error) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] set() 操作异常", { error, key });
        }
    }

    /**
     * 写入 L1 缓存（FIFO 淘汰策略）
     * @private
     */
    #setToL1(key, entry) {
        // 如果已满，淘汰最旧的（第一个元素）
        if (this.#l1Cache.size >= this.config.l1MaxSize) {
            const firstKey = this.#l1Cache.keys().next().value;
            this.#l1Cache.delete(firstKey);
            this.stats.evictions++;
        }

        this.#l1Cache.set(key, entry);
    }

    /**
     * 写入 L2 缓存（LRU 策略）
     * 利用 Map 的插入顺序特性实现 LRU：最近访问的放在最后面
     * @private
     */
    #setToL2(key, entry) {
        // 如果已存在，先删除（为了更新访问顺序）
        if (this.#l2Cache.has(key)) {
            this.#l2Cache.delete(key);
        }

        // 如果已满，淘汰最旧的（即第一个元素）
        if (this.#l2Cache.size >= this.config.l2MaxSize) {
            const firstKey = this.#l2Cache.keys().next().value;
            this.#l2Cache.delete(firstKey);
            this.stats.evictions++;
        }

        this.#l2Cache.set(key, entry);
    }

    /**
     * 写入 L3 持久化缓存（IndexedDB）
     * @private
     * @returns {Promise<void>}
     */
    async #setToL3(key, entry) {
        if (!this.#l3Ready || !this.#l3Db) return;

        return new Promise((resolve, reject) => {
            const tx = this.#l3Db.transaction(["results"], "readwrite");
            const store = tx.objectStore("results");

            const request = store.put({
                key,
                ...entry,
            });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * 从 L3 读取
     * @private
     * @returns {Promise<object|null>}
     */
    async #getFromL3(key) {
        if (!this.#l3Ready || !this.#l3Db) return null;

        return new Promise((resolve, reject) => {
            const tx = this.#l3Db.transaction(["results"], "readonly");
            const store = tx.objectStore("results");
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    }

    /**
     * 检查缓存是否过期
     * @private
     * @param {object} entry - 缓存条目
     * @returns {boolean} 是否已过期
     */
    #isExpired(entry) {
        if (!entry || !entry.expiresAt) return false;
        return Date.now() > entry.expiresAt;
    }

    // ════════════════════════════════════════
    // 批量操作
    // ════════════════════════════════════════

    /**
     * 批量获取缓存
     *
     * 高效批量查询，内部使用 Promise.all 并行执行
     *
     * @param {string[]} keys - 缓存键数组
     * @returns {Promise<Map<string, {result: object, source: string}>>} 结果 Map
     *
     * @example
     * ```javascript
     * const results = await cache.getBatch(['0,0', '0,1', '1,0']);
     * for (const [key, { result, source }] of results) {
     *   console.log(`${key}: 来自 ${source}`);
     * }
     * ```
     */
    async getBatch(keys) {
        const results = new Map();

        await Promise.all(
            keys.map(async (key) => {
                const cached = await this.get(key);
                if (cached.result) {
                    results.set(key, cached);
                }
            }),
        );

        return results;
    }

    /**
     * 批量设置缓存
     *
     * @param {Array<{key: string, data: object, options?: object}>} entries - 批量条目数组
     * @returns {Promise<void>}
     *
     * @example
     * ```javascript
     * await cache.setBatch([
     *   { key: '0,0', data: { valid: true }, options: { ttl: 60000 } },
     *   { key: '0,1', data: { valid: false }, options: { ttl: 120000 } }
     * ]);
     * ```
     */
    async setBatch(entries) {
        await Promise.all(entries.map(({ key, data, options }) => this.set(key, data, options)));
    }

    /**
     * 使指定键的缓存失效
     *
     * 同时清除所有层级的缓存，并异步清理 L3
     *
     * @param {string|string[]} keys - 要失效的键或键数组
     *
     * @example
     * ```javascript
     * // 失效单个键
     * await cache.invalidate('5,2');
     *
     * // 批量失效
     * await cache.invalidate(['0,0', '0,1', '1,0']);
     * ```
     */
    async invalidate(keys) {
        const keyArray = Array.isArray(keys) ? keys : [keys];

        // 清除内存缓存（同步）
        for (const key of keyArray) {
            this.#l1Cache.delete(key);
            this.#l2Cache.delete(key);
        }

        // 异步清除 L3（不阻塞）
        if (this.config.l3Enabled && this.#l3Ready) {
            this.#invalidateL3(keyArray).catch((error) => {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 失败处理失败", { error });
            });
        }
    }

    /**
     * 使 L3 中的缓存失效
     * @private
     * @param {string[]} keys - 键数组
     * @returns {Promise<void>}
     */
    async #invalidateL3(keys) {
        if (!this.#l3Ready || !this.#l3Db) return;

        const tx = this.#l3Db.transaction(["results"], "readwrite");
        const store = tx.objectStore("results");

        for (const key of keys) {
            store.delete(key);
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * 清空所有层级的缓存
     *
     * 用于以下场景：
     * - 工作表切换时清除旧数据
     * - 内存紧张时释放资源
     * - 测试时重置状态
     *
     * @returns {Promise<void>}
     */
    async clearAll() {
        // 清空内存缓存（同步）
        this.#l1Cache.clear();
        this.#l2Cache.clear();

        // 清空持久化缓存（异步）
        if (this.config.l3Enabled && this.#l3Ready) {
            try {
                const tx = this.#l3Db.transaction(["results"], "readwrite");
                const store = tx.objectStore("results");
                store.clear();

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            } catch (error) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 清空失败", { error });
            }
        }

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationCache] ✅ 所有缓存已清空");

        // 重置统计计数器
        this.stats = {
            hits: { l1: 0, l2: 0, l3: 0 },
            misses: 0,
            writes: 0,
            evictions: 0,
        };
    }

    // ════════════════════════════════════════
    // 统计和调试工具
    // ════════════════════════════════════════

    /**
     * 获取缓存统计信息
     *
     * 用于性能监控和调试分析
     *
     * @returns {object} 统计信息对象
     * @returns {object} returns.size - 各层级的当前大小
     * @returns {object} returns.hits - 各层级的命中次数
     * @returns {number} returns.misses - 未命中次数
     * @returns {string} returns.hitRate - 总命中率百分比
     * @returns {number} returns.writes - 总写入次数
     * @returns {number} returns.evictions - 总淘汰次数
     * @returns {object} returns.config - 当前配置信息
     */
    getStats() {
        const totalHits = this.stats.hits.l1 + this.stats.hits.l2 + this.stats.hits.l3;
        const totalRequests = totalHits + this.stats.misses;

        return {
            size: {
                l1: this.#l1Cache.size,
                l2: this.#l2Cache.size,
                l3: this.config.l3Enabled ? "persistent" : "disabled",
            },
            hits: { ...this.stats.hits },
            misses: this.stats.misses,
            hitRate: totalRequests > 0 ? `${((totalHits / totalRequests) * 100).toFixed(2)}%` : "N/A",
            writes: this.stats.writes,
            evictions: this.stats.evictions,
            config: {
                l1MaxSize: this.config.l1MaxSize,
                l2MaxSize: this.config.l2MaxSize,
                l3Enabled: this.config.l3Enabled,
                defaultTTL: `${this.config.defaultTTL / 1000}s`,
            },
        };
    }

    /**
     * 打印缓存状态到控制台（用于调试）
     *
     * 在开发模式下输出详细的缓存统计信息，
     * 生产模式下仅输出关键指标。
     */
    printStats() {
        const stats = this.getStats();

        console.groupCollapsed("📊 [ValidationCache] 缓存统计");
        console.log("📦 容量:", stats.size);
        console.log("✅ 命中次数:", stats.hits);
        console.log("❌ 未命中:", stats.misses);
        console.log("🎯 命中率:", stats.hitRate);
        console.log("✍️ 写入次数:", stats.writes);
        console.log("🗑️ 淘汰次数:", stats.evictions);
        console.log("⚙️ 配置:", stats.config);
        console.groupEnd();
    }
}

// 导出单例实例（延迟初始化，首次访问时创建）
let validationCacheInstance = null;

/**
 * 获取 ValidationCache 单例实例
 * 延迟初始化：只有在首次调用且插件启用时才创建实例
 * @returns {ValidationCache|null} 缓存实例
 */
export function getValidationCache() {
    return validationCacheInstance;
}

/**
 * 初始化 ValidationCache 单例
 * 由 DataValidationPlugin 在启用时调用
 * @param {object} [config={}] - 配置选项
 * @returns {ValidationCache} 缓存实例
 */
export function initValidationCache(config = {}) {
    if (!validationCacheInstance) {
        validationCacheInstance = new ValidationCache(config);
    } else if (config && Object.keys(config).length > 0) {
        // 如果已存在实例但传入了新配置，更新配置
        validationCacheInstance.updateConfig(config);
    }
    return validationCacheInstance;
}

/**
 * 检查缓存是否已初始化
 * @returns {boolean}
 */
export function isValidationCacheInitialized() {
    return validationCacheInstance !== null;
}

// 为了向后兼容，提供默认导出（延迟初始化）
export default ValidationCache;
