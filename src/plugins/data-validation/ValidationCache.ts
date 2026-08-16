import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface CacheEntry {
    data: any;
    timestamp: number;
    ttl: number;
}

interface CacheGetResult {
    result: any;
    source: "l1" | "l2" | "l3" | null;
}

interface CacheStats {
    l1Size: number;
    l2Size: number;
    l3Size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
}

const L1_MAX_SIZE = 500;
const L2_MAX_SIZE = 2000;
const DEFAULT_TTL = 30000;
const L3_DB_NAME = "validation_cache";
const L3_STORE_NAME = "validation_results";

/**
 * 验证缓存
 *
 * 实现三级缓存架构，优化验证性能：
 * - L1 缓存：视口缓存（Map），容量小、速度最快
 * - L2 缓存：最近缓存（Map），容量中等、速度较快
 * - L3 缓存：持久化缓存（IndexedDB），容量大、速度较慢
 */
export class ValidationCache {
    #l1Cache: Map<string, CacheEntry> = new Map();
    #l2Cache: Map<string, CacheEntry> = new Map();
    #l3Db: IDBDatabase | null = null;
    #l3Ready: boolean = false;
    #defaultTTL: number = DEFAULT_TTL;
    #stats: { hits: number; misses: number } = { hits: 0, misses: 0 };

    constructor(config: { defaultTTL?: number } = {}) {
        this.#defaultTTL = config.defaultTTL ?? DEFAULT_TTL;
        this.#initL3();
    }

    async get(key: string): Promise<CacheGetResult> {
        if (this.#l1Cache.has(key)) {
            const entry = this.#l1Cache.get(key)!;
            if (!this.#isExpired(entry)) {
                this.#stats.hits++;
                return { result: entry.data, source: "l1" };
            }
            this.#l1Cache.delete(key);
        }

        if (this.#l2Cache.has(key)) {
            const entry = this.#l2Cache.get(key)!;
            if (!this.#isExpired(entry)) {
                this.#stats.hits++;
                this.#l1Cache.set(key, entry);
                if (this.#l1Cache.size > L1_MAX_SIZE) {
                    const firstKey = this.#l1Cache.keys().next().value;
                    if (firstKey !== undefined) this.#l1Cache.delete(firstKey);
                }
                return { result: entry.data, source: "l2" };
            }
            this.#l2Cache.delete(key);
        }

        if (this.#l3Ready) {
            const result = await this.#getFromL3(key);
            if (result) {
                this.#stats.hits++;
                this.#l1Cache.set(key, result);
                this.#l2Cache.set(key, result);
                if (this.#l2Cache.size > L2_MAX_SIZE) {
                    const firstKey = this.#l2Cache.keys().next().value;
                    if (firstKey !== undefined) this.#l2Cache.delete(firstKey);
                }
                return { result: result.data, source: "l3" };
            }
        }

        this.#stats.misses++;
        return { result: null, source: null };
    }

    async set(key: string, data: any, ttl?: number): Promise<void> {
        const entry: CacheEntry = {
            data,
            timestamp: Date.now(),
            ttl: ttl ?? this.#defaultTTL,
        };

        this.#l1Cache.set(key, entry);
        if (this.#l1Cache.size > L1_MAX_SIZE) {
            const firstKey = this.#l1Cache.keys().next().value;
            if (firstKey !== undefined) this.#l1Cache.delete(firstKey);
        }

        this.#l2Cache.set(key, entry);
        if (this.#l2Cache.size > L2_MAX_SIZE) {
            const firstKey = this.#l2Cache.keys().next().value;
            if (firstKey !== undefined) this.#l2Cache.delete(firstKey);
        }

        if (this.#l3Ready) {
            await this.#setToL3(key, entry);
        }
    }

    invalidate(key: string): void {
        this.#l1Cache.delete(key);
        this.#l2Cache.delete(key);

        if (this.#l3Ready) {
            this.#deleteFromL3(key);
        }
    }

    invalidateByPrefix(prefix: string): void {
        for (const key of this.#l1Cache.keys()) {
            if (key.startsWith(prefix)) this.#l1Cache.delete(key);
        }
        for (const key of this.#l2Cache.keys()) {
            if (key.startsWith(prefix)) this.#l2Cache.delete(key);
        }

        if (this.#l3Ready) {
            this.#deleteFromL3ByPrefix(prefix);
        }
    }

    clear(): void {
        this.#l1Cache.clear();
        this.#l2Cache.clear();

        if (this.#l3Ready && this.#l3Db) {
            try {
                const tx = this.#l3Db.transaction(L3_STORE_NAME, "readwrite");
                const store = tx.objectStore(L3_STORE_NAME);
                store.clear();
            } catch (e: any) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] 清空 L3 缓存失败:", e);
            }
        }
    }

    getStats(): CacheStats {
        const total = this.#stats.hits + this.#stats.misses;
        return {
            l1Size: this.#l1Cache.size,
            l2Size: this.#l2Cache.size,
            l3Size: 0,
            hitRate: total > 0 ? this.#stats.hits / total : 0,
            totalHits: this.#stats.hits,
            totalMisses: this.#stats.misses,
        };
    }

    #isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > entry.ttl;
    }

    #initL3(): void {
        if (typeof indexedDB === "undefined") {
            errorHandler.info(ERROR_CODE.VALIDATION_INFO, "[ValidationCache] IndexedDB 不可用，L3 缓存已禁用");
            return;
        }

        try {
            const request = indexedDB.open(L3_DB_NAME, 1);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(L3_STORE_NAME)) {
                    db.createObjectStore(L3_STORE_NAME, { keyPath: "key" });
                }
            };

            request.onsuccess = (event: Event) => {
                this.#l3Db = (event.target as IDBOpenDBRequest).result;
                this.#l3Ready = true;
                errorHandler.info(ERROR_CODE.VALIDATION_INFO, "[ValidationCache] L3 缓存 (IndexedDB) 初始化成功");
            };

            request.onerror = () => {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 缓存初始化失败");
                this.#l3Ready = false;
            };
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 缓存初始化异常:", e);
            this.#l3Ready = false;
        }
    }

    async #getFromL3(key: string): Promise<CacheEntry | null> {
        if (!this.#l3Db) return null;

        return new Promise((resolve) => {
            try {
                const tx = this.#l3Db!.transaction(L3_STORE_NAME, "readonly");
                const store = tx.objectStore(L3_STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => {
                    const result = request.result;
                    if (result && result.entry && !this.#isExpired(result.entry)) {
                        resolve(result.entry);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => resolve(null);
            } catch (e: any) {
                resolve(null);
            }
        });
    }

    async #setToL3(key: string, entry: CacheEntry): Promise<void> {
        if (!this.#l3Db) return;

        return new Promise((resolve) => {
            try {
                const tx = this.#l3Db!.transaction(L3_STORE_NAME, "readwrite");
                const store = tx.objectStore(L3_STORE_NAME);
                store.put({ key, entry });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e: any) {
                resolve();
            }
        });
    }

    #deleteFromL3(key: string): void {
        if (!this.#l3Db) return;

        try {
            const tx = this.#l3Db.transaction(L3_STORE_NAME, "readwrite");
            const store = tx.objectStore(L3_STORE_NAME);
            store.delete(key);
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 删除失败:", e);
        }
    }

    #deleteFromL3ByPrefix(prefix: string): void {
        if (!this.#l3Db) return;

        try {
            const tx = this.#l3Db.transaction(L3_STORE_NAME, "readwrite");
            const store = tx.objectStore(L3_STORE_NAME);
            const request = store.openCursor();

            request.onsuccess = (event: Event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    if (cursor.value.key.startsWith(prefix)) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] L3 前缀删除失败:", e);
        }
    }

    destroy(): void {
        this.#l1Cache.clear();
        this.#l2Cache.clear();

        if (this.#l3Db) {
            this.#l3Db.close();
            this.#l3Db = null;
        }
        this.#l3Ready = false;
    }
}

let _globalCache: ValidationCache | null = null;

export function getValidationCache(config?: { defaultTTL?: number }): ValidationCache {
    if (!_globalCache) {
        _globalCache = new ValidationCache(config);
    }
    return _globalCache;
}

export function resetValidationCache(): void {
    if (_globalCache) {
        _globalCache.destroy();
        _globalCache = null;
    }
}
