import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

const CACHE_CONFIG = Object.freeze({
    L1_MAX_SIZE: 256,
    L1_TTL_MS: 2000,
    L2_MAX_SIZE: 2048,
    L2_TTL_MS: 30000,
    L3_MAX_SIZE: 16384,
    L3_TTL_MS: 300000,
});

interface CacheEntry {
    value: any;
    timestamp: number;
    accessCount: number;
    ruleVersion: number;
}

interface CacheStats {
    l1: { size: number; hits: number; misses: number; hitRate: string };
    l2: { size: number; hits: number; misses: number; hitRate: string };
    l3: { size: number; hits: number; misses: number; hitRate: string };
}

export class ValidationCache {
    #l1Cache: Map<string, CacheEntry> = new Map();
    #l2Cache: Map<string, CacheEntry> = new Map();
    #l3Cache: Map<string, CacheEntry> = new Map();
    #stats: { l1: { hits: number; misses: number }; l2: { hits: number; misses: number }; l3: { hits: number; misses: number } } = {
        l1: { hits: 0, misses: 0 },
        l2: { hits: 0, misses: 0 },
        l3: { hits: 0, misses: 0 },
    };
    #ruleVersions: Map<string, number> = new Map();
    #dirtyCells: Set<string> = new Set();
    #enabled: boolean = true;
    config: Record<string, any> = {};

    constructor(config: Record<string, any> = {}) {
        this.config = { ...CACHE_CONFIG, ...config };
        this.#enabled = config.enabled !== false;
    }

    updateConfig(newConfig: Record<string, any> = {}): void {
        this.config = { ...this.config, ...newConfig };
    }

    async get(key: string): Promise<{ result: any; source: string | null }> {
        if (!this.#enabled || !key || typeof key !== "string" || key.trim().length === 0) {
            return { result: null, source: null };
        }

        try {
            if (this.#l1Cache.has(key)) {
                const entry = this.#l1Cache.get(key)!;
                if (!this.#isExpiredEntry(entry)) {
                    this.#stats.l1.hits++;
                    return { result: entry.value, source: "l1" };
                }
                this.#l1Cache.delete(key);
            }

            if (this.#l2Cache.has(key)) {
                const entry = this.#l2Cache.get(key)!;
                if (!this.#isExpiredEntry(entry)) {
                    if (this.#l1Cache.size < (this.config.l1MaxSize || CACHE_CONFIG.L1_MAX_SIZE)) {
                        this.#l1Cache.set(key, entry);
                    }
                    this.#l2Cache.delete(key);
                    this.#l2Cache.set(key, entry);
                    this.#stats.l2.hits++;
                    return { result: entry.value, source: "l2" };
                }
                this.#l2Cache.delete(key);
            }

            if (this.#l3Cache.has(key)) {
                const entry = this.#l3Cache.get(key)!;
                if (!this.#isExpiredEntry(entry)) {
                    this.#promoteToL1(key, entry);
                    this.#promoteToL2(key, entry);
                    this.#stats.l3.hits++;
                    return { result: entry.value, source: "l3" };
                }
                this.#l3Cache.delete(key);
            }

            this.#stats.l3.misses++;
            return { result: null, source: null };
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] get() 操作异常", { error, key });
            return { result: null, source: null };
        }
    }

    async set(key: string, data: any, options: Record<string, any> = {}): Promise<void> {
        if (!this.#enabled || !key || typeof key !== "string" || key.trim().length === 0) {
            return;
        }

        try {
            const now = Date.now();
            const entry: CacheEntry = {
                value: data,
                timestamp: now,
                accessCount: 1,
                ruleVersion: 0,
            };

            if (this.#l1Cache.size >= (this.config.l1MaxSize || CACHE_CONFIG.L1_MAX_SIZE)) {
                this.#evictLRU(this.#l1Cache, Math.floor((this.config.l1MaxSize || CACHE_CONFIG.L1_MAX_SIZE) * 0.3));
            }
            this.#l1Cache.set(key, entry);

            if (this.#l2Cache.size >= (this.config.l2MaxSize || CACHE_CONFIG.L2_MAX_SIZE)) {
                this.#evictLRU(this.#l2Cache, Math.floor((this.config.l2MaxSize || CACHE_CONFIG.L2_MAX_SIZE) * 0.3));
            }
            this.#l2Cache.set(key, { ...entry });
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ValidationCache] set() 操作异常", { error, key });
        }
    }

    invalidate(row: number, col: number): void {
        const cellPrefix = `${row},${col}`;

        for (const key of this.#l1Cache.keys()) {
            if (key.startsWith(cellPrefix)) {
                this.#l1Cache.delete(key);
            }
        }

        for (const key of this.#l2Cache.keys()) {
            if (key.startsWith(cellPrefix)) {
                this.#l2Cache.delete(key);
            }
        }

        for (const key of this.#l3Cache.keys()) {
            if (key.startsWith(cellPrefix)) {
                this.#l3Cache.delete(key);
            }
        }

        this.#dirtyCells.add(cellPrefix);
    }

    invalidateRule(ruleId: string): void {
        const currentVersion = this.#ruleVersions.get(ruleId) || 0;
        this.#ruleVersions.set(ruleId, currentVersion + 1);

        for (const key of this.#l1Cache.keys()) {
            if (key.endsWith(`:${ruleId}`)) {
                this.#l1Cache.delete(key);
            }
        }

        for (const key of this.#l2Cache.keys()) {
            if (key.endsWith(`:${ruleId}`)) {
                this.#l2Cache.delete(key);
            }
        }

        for (const key of this.#l3Cache.keys()) {
            if (key.endsWith(`:${ruleId}`)) {
                this.#l3Cache.delete(key);
            }
        }
    }

    invalidateRange(startRow: number, startCol: number, endRow: number, endCol: number): void {
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                this.invalidate(row, col);
            }
        }
    }

    markDirty(row: number, col: number): void {
        this.#dirtyCells.add(`${row},${col}`);
    }

    isDirty(row: number, col: number): boolean {
        return this.#dirtyCells.has(`${row},${col}`);
    }

    clearDirtyCells(): Set<string> {
        const dirty = new Set(this.#dirtyCells);
        this.#dirtyCells.clear();
        return dirty;
    }

    getStats(): CacheStats {
        return {
            l1: {
                size: this.#l1Cache.size,
                hits: this.#stats.l1.hits,
                misses: this.#stats.l1.misses,
                hitRate: this.#calcHitRate(this.#stats.l1),
            },
            l2: {
                size: this.#l2Cache.size,
                hits: this.#stats.l2.hits,
                misses: this.#stats.l2.misses,
                hitRate: this.#calcHitRate(this.#stats.l2),
            },
            l3: {
                size: this.#l3Cache.size,
                hits: this.#stats.l3.hits,
                misses: this.#stats.l3.misses,
                hitRate: this.#calcHitRate(this.#stats.l3),
            },
        };
    }

    clear(): void {
        this.#l1Cache.clear();
        this.#l2Cache.clear();
        this.#l3Cache.clear();
        this.#dirtyCells.clear();
        this.#ruleVersions.clear();
        this.#stats = {
            l1: { hits: 0, misses: 0 },
            l2: { hits: 0, misses: 0 },
            l3: { hits: 0, misses: 0 },
        };
    }

    destroy(): void {
        this.clear();
        this.#enabled = false;
    }

    #makeKey(row: number, col: number, ruleId: string): string {
        return `${row},${col}:${ruleId}`;
    }

    #isValid(entry: CacheEntry, ruleId: string): boolean {
        const currentVersion = this.#ruleVersions.get(ruleId) || 0;
        if (entry.ruleVersion !== currentVersion) {
            return false;
        }

        const age = Date.now() - entry.timestamp;
        if (age > CACHE_CONFIG.L3_TTL_MS) {
            return false;
        }

        return true;
    }

    #isExpiredEntry(entry: CacheEntry): boolean {
        const age = Date.now() - entry.timestamp;
        return age > CACHE_CONFIG.L3_TTL_MS;
    }

    #promoteToL1(key: string, entry: CacheEntry): void {
        if (this.#l1Cache.size >= CACHE_CONFIG.L1_MAX_SIZE) {
            this.#evictLRU(this.#l1Cache, 1);
        }
        this.#l1Cache.set(key, { ...entry, timestamp: Date.now() });
    }

    #promoteToL2(key: string, entry: CacheEntry): void {
        if (this.#l2Cache.size >= CACHE_CONFIG.L2_MAX_SIZE) {
            this.#evictLRU(this.#l2Cache, 1);
        }
        this.#l2Cache.set(key, { ...entry, timestamp: Date.now() });
    }

    #evictLRU(cache: Map<string, CacheEntry>, count: number): void {
        const entries = [...cache.entries()].sort((a, b) => a[1].accessCount - b[1].accessCount);

        for (let i = 0; i < Math.min(count, entries.length); i++) {
            cache.delete(entries[i][0]);
        }
    }

    #calcHitRate(stats: { hits: number; misses: number }): string {
        const total = stats.hits + stats.misses;
        if (total === 0) return "0.0%";
        return `${((stats.hits / total) * 100).toFixed(1)}%`;
    }
}

let validationCacheInstance: ValidationCache | null = null;

export function getValidationCache(): ValidationCache | null {
    return validationCacheInstance;
}

export function initValidationCache(config: Record<string, any> = {}): ValidationCache {
    if (!validationCacheInstance) {
        validationCacheInstance = new ValidationCache(config);
    } else if (config && Object.keys(config).length > 0) {
        validationCacheInstance.updateConfig(config);
    }
    return validationCacheInstance;
}

export function isValidationCacheInitialized(): boolean {
    return validationCacheInstance !== null;
}

export { CACHE_CONFIG };
