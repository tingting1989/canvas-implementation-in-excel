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
 * - 使用双向链表 + Map 实现 O(1) 的 LRU 缓存淘汰
 * - 链表头部（head）为最久未使用的节点，尾部（tail）为最近使用的节点
 * - 访问瓦片时将其移至链表尾部，淘汰时从链表头部移除
 * - 淘汰时调用 tile.destroy() 释放 Canvas 资源
 */
export class TileCache {
    /** @type {{key: string, tile: Tile, prev: object|null, next: object|null}|null} 双向链表头节点（最久未使用） */
    #head = null;
    /** @type {{key: string, tile: Tile, prev: object|null, next: object|null}|null} 双向链表尾节点（最近使用） */
    #tail = null;

    /**
     * 创建瓦片缓存实例
     * 最大缓存数量从 CONFIG.TILE_CACHE_MAX 读取
     */
    constructor() {
        /** @type {Map<string, {key: string, tile: Tile, prev: object|null, next: object|null}>} 瓦片映射表 */
        this.tiles = new Map();
        /** @type {number} 最大缓存瓦片数量，超出时触发 LRU 淘汰 */
        this.maxSize = CONFIG.TILE_CACHE_MAX;
        /** @type {number} 设备像素比，从 CONFIG.DPR 读取并缓存 */
        this.dpr = CONFIG.DPR;
    }

    /**
     * 获取已缓存的瓦片（不创建新瓦片）
     * 如果命中缓存，将该节点移至链表尾部（标记为最近使用）
     *
     * @param {number} tileRow - 瓦片行号
     * @param {number} tileCol - 瓦片列号
     * @returns {Tile|null} 瓦片实例，未命中返回 null
     */
    get(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const node = this.tiles.get(key);
        if (node) {
            this.#moveToTail(node);
        }
        return node ? node.tile : null;
    }

    /**
     * 获取或创建瓦片
     * 缓存命中则移至链表尾部并返回；未命中则先淘汰再创建并追加到链表尾部
     *
     * @param {number} tileRow - 瓦片行号
     * @param {number} tileCol - 瓦片列号
     * @returns {Tile} 瓦片实例（新建的 dirty=true，渲染时会被绘制）
     */
    getOrCreate(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const node = this.tiles.get(key);
        if (node) {
            this.#moveToTail(node);
            return node.tile;
        }
        this.#evictIfNeeded();
        const tile = new Tile(tileRow, tileCol);
        const newNode = { key, tile, prev: null, next: null };
        this.tiles.set(key, newNode);
        this.#appendTail(newNode);
        return tile;
    }

    /**
     * 标记指定瓦片为脏
     */
    markDirty(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const node = this.tiles.get(key);
        if (node) {
            node.tile.markDirty();
        }
    }

    /**
     * 标记所有已缓存瓦片为脏（用于全量重绘场景）
     */
    markAllDirty() {
        for (const node of this.tiles.values()) {
            node.tile.markDirty();
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
        for (const node of this.tiles.values()) {
            const tile = node.tile;
            const tileStartRow = tile.tileRow * tileSize;
            const tileStartCol = tile.tileCol * tileSize;
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
        const node = this.tiles.get(key);
        if (node) {
            this.#removeNode(node);
            node.tile.destroy();
            this.tiles.delete(key);
        }
    }

    /**
     * 清空所有瓦片（销毁并移除）
     */
    clear() {
        for (const node of this.tiles.values()) {
            node.tile.destroy();
        }
        this.tiles.clear();
        this.#head = null;
        this.#tail = null;
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
     * 当缓存数量达到上限时，从链表头部淘汰最久未使用的 25% 瓦片
     * 淘汰时调用 tile.destroy() 释放离屏 Canvas 的 GPU 内存
     * 时间复杂度 O(k)，k 为淘汰数量，优于原来的 O(n log n) 排序
     */
    #evictIfNeeded() {
        if (this.tiles.size < this.maxSize) return;
        const evictCount = Math.max(1, Math.floor(this.maxSize * 0.25));
        for (let i = 0; i < evictCount && this.#head; i++) {
            const node = this.#head;
            this.#removeNode(node);
            node.tile.destroy();
            this.tiles.delete(node.key);
        }
    }

    /**
     * 从双向链表中摘除指定节点，O(1)
     */
    #removeNode(node) {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.#head = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.#tail = node.prev;
        }
        node.prev = null;
        node.next = null;
    }

    /**
     * 将节点追加到双向链表尾部（标记为最近使用），O(1)
     */
    #appendTail(node) {
        node.prev = this.#tail;
        node.next = null;
        if (this.#tail) {
            this.#tail.next = node;
        } else {
            this.#head = node;
        }
        this.#tail = node;
    }

    /**
     * 将已存在的节点移至链表尾部（标记为最近使用），O(1)
     * 如果节点已在尾部则跳过
     */
    #moveToTail(node) {
        if (node === this.#tail) return;
        this.#removeNode(node);
        this.#appendTail(node);
    }
}
