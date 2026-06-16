import { Tile } from "./Tile.js";
import { CONFIG } from "../constants/config";

/**
 * 瓦片缓存（TileCache）—— 管理所有瓦片的生命周期和缓存淘汰
 *
 * 核心职责：
 * 1. 存储和检索瓦片（Map 结构，键为 tileRow:tileCol）
 * 2. 按需创建新瓦片（getOrCreate）
 * 3. LRU 缓存淘汰（超出上限时淘汰最久未使用的 25% 瓦片）
 * 4. 脏标记管理（单个/区域/全部标记为脏）
 * 5. 瓦片销毁和内存释放
 *
 * 缓存淘汰策略：
 * - 当瓦片数量达到 maxSize 上限时，触发淘汰
 * - 按 lastUsed 时间戳排序，淘汰最久未使用的 25% 瓦片
 * - 淘汰时调用 tile.destroy() 释放 Canvas 资源
 */
export class TileCache {
    /**
     * 创建瓦片缓存实例
     * 最大缓存数量从 CONFIG.TILE_CACHE_MAX 读取
     */
    constructor() {
        /** @type {Map<string, Tile>} 瓦片映射表，键为 tileRow:tileCol */
        this.tiles = new Map();
        /** @type {number} 最大缓存瓦片数量，超出时触发 LRU 淘汰 */
        this.maxSize = CONFIG.TILE_CACHE_MAX;
        /** @type {number} 设备像素比，从 CONFIG.DPR 读取并缓存 */
        this.dpr = CONFIG.DPR;
    }

    /**
     * 获取已缓存的瓦片（不创建新瓦片）
     * 如果命中缓存，更新 lastUsed 时间戳
     *
     * @param {number} tileRow - 瓦片行号
     * @param {number} tileCol - 瓦片列号
     * @returns {Tile|null} 瓦片实例，未命中返回 null
     */
    get(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const tile = this.tiles.get(key);
        if (tile) {
            tile.touch();
        }
        return tile || null;
    }

    /**
     * 获取或创建瓦片
     * 缓存命中则更新 lastUsed 并返回；未命中则先淘汰再创建
     *
     * @param {number} tileRow - 瓦片行号
     * @param {number} tileCol - 瓦片列号
     * @returns {Tile} 瓦片实例（新建的 dirty=true，渲染时会被绘制）
     */
    getOrCreate(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        let tile = this.tiles.get(key);
        if (tile) {
            tile.touch();
            return tile;
        }
        this.#evictIfNeeded();
        tile = new Tile(tileRow, tileCol);
        this.tiles.set(key, tile);
        return tile;
    }

    /**
     * 标记指定瓦片为脏
     */
    markDirty(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const tile = this.tiles.get(key);
        if (tile) {
            tile.markDirty();
        }
    }

    /**
     * 标记所有已缓存瓦片为脏（用于全量重绘场景）
     */
    markAllDirty() {
        for (const tile of this.tiles.values()) {
            tile.markDirty();
        }
    }

    /**
     * 标记与指定像素区域重叠的所有瓦片为脏
     * 通过矩形相交测试判断瓦片是否与区域重叠
     *
     * @param {number} startRow - 区域起始像素 Y 坐标
     * @param {number} startCol - 区域起始像素 X 坐标
     * @param {number} endRow - 区域结束像素 Y 坐标
     * @param {number} endCol - 区域结束像素 X 坐标
     */
    invalidateRegion(startRow, startCol, endRow, endCol) {
        const tileSize = CONFIG.TILE_SIZE;
        for (const [key, tile] of this.tiles) {
            const tileStartRow = tile.tileRow;
            const tileStartCol = tile.tileCol;
            const tileEndRow = tileStartRow + tileSize;
            const tileEndCol = tileStartCol + tileSize;
            if (tileEndRow >= startRow && tileStartRow <= endRow && tileEndCol >= startCol && tileStartCol <= endCol) {
                tile.markDirty();
            }
        }
    }

    /**
     * 移除并销毁指定瓦片
     */
    remove(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const tile = this.tiles.get(key);
        if (tile) {
            tile.destroy();
            this.tiles.delete(key);
        }
    }

    /**
     * 清空所有瓦片（销毁并移除）
     */
    clear() {
        for (const tile of this.tiles.values()) {
            tile.destroy();
        }
        this.tiles.clear();
    }

    /**
     * 获取当前缓存的瓦片数量
     * @returns {number}
     */
    get size() {
        return this.tiles.size;
    }

    /**
     * LRU 缓存淘汰
     * 当缓存数量达到上限时，按 lastUsed 排序，淘汰最久未使用的 25% 瓦片
     * 淘汰时调用 tile.destroy() 释放离屏 Canvas 的 GPU 内存
     */
    #evictIfNeeded() {
        if (this.tiles.size < this.maxSize) return;
        const evictCount = Math.max(1, Math.floor(this.maxSize * 0.25));
        const entries = [...this.tiles.entries()];
        entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        for (let i = 0; i < Math.min(evictCount, entries.length); i++) {
            const [key, tile] = entries[i];
            tile.destroy();
            this.tiles.delete(key);
        }
    }
}
