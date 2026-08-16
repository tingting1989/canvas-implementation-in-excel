import { Tile } from "./Tile.js";
import { CONFIG } from "../constants/config.js";

/** 双向链表节点 */
interface ListNode {
    key: string;
    tile: Tile;
    prev: ListNode | null;
    next: ListNode | null;
}

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
 * ## 缓存淘汰策略
 *
 * 使用双向链表 + Map 实现 O(1) 的 LRU 缓存淘汰：
 * - 链表头部（head）为最久未使用的节点，尾部（tail）为最近使用的节点
 * - 访问瓦片时将其移至链表尾部（标记为最近使用）
 * - 淘汰时从链表头部移除，调用 tile.destroy() 释放 Canvas 资源
 * - 淘汰比例为 maxCacheSize × 25%，避免频繁触发淘汰
 *
 * @see Tile 瓦片实例，包含离屏 Canvas 和脏标记
 */
export class TileCache {
    /** @private 私有字段 - 双向链表头节点（最久未使用，LRU 端） */
    #head: ListNode | null = null;

    /** @private 私有字段 - 双向链表尾节点（最近使用，MRU 端） */
    #tail: ListNode | null = null;

    /** 瓦片映射表，键为 "tileRow:tileCol" */
    tiles: Map<string, ListNode>;

    /** 最大缓存瓦片数量，超出时触发 LRU 淘汰 */
    maxSize: number;

    /** 设备像素比，从 CONFIG.DPR 读取并缓存 */
    dpr: number;

    constructor() {
        this.tiles = new Map();
        this.maxSize = CONFIG.TILE_CACHE_MAX;
        this.dpr = CONFIG.DPR;
    }

    /**
     * 获取已缓存的瓦片（不创建新瓦片）
     *
     * 如果命中缓存，将该节点移至链表尾部（标记为最近使用）。
     *
     * @param tileRow - 瓦片行号
     * @param tileCol - 瓦片列号
     * @returns 瓦片实例，未命中返回 null
     */
    get(tileRow: number, tileCol: number): Tile | null {
        const key = `${tileRow}:${tileCol}`;
        const node = this.tiles.get(key);
        if (node) {
            this.#moveToTail(node);
        }
        return node ? node.tile : null;
    }

    /**
     * 获取或创建瓦片
     *
     * 缓存命中则移至链表尾部并返回；
     * 未命中则先检查是否需要淘汰，再创建新瓦片并追加到链表尾部。
     *
     * @param tileRow - 瓦片行号
     * @param tileCol - 瓦片列号
     * @returns 瓦片实例
     */
    getOrCreate(tileRow: number, tileCol: number): Tile {
        const key = `${tileRow}:${tileCol}`;
        const node = this.tiles.get(key);
        if (node) {
            this.#moveToTail(node);
            return node.tile;
        }
        this.#evictIfNeeded();
        const tile = new Tile(tileRow, tileCol);
        const newNode: ListNode = { key, tile, prev: null, next: null };
        this.tiles.set(key, newNode);
        this.#appendTail(newNode);
        return tile;
    }

    /**
     * 标记指定瓦片为脏
     *
     * @param tileRow - 瓦片行号
     * @param tileCol - 瓦片列号
     */
    markDirty(tileRow: number, tileCol: number): void {
        const key = `${tileRow}:${tileCol}`;
        const node = this.tiles.get(key);
        if (node) {
            node.tile.markDirty();
        }
    }

    /**
     * 标记所有已缓存瓦片为脏
     *
     * 用于全量重绘场景，如切换工作表、样式全局变更等。
     */
    markAllDirty(): void {
        for (const node of this.tiles.values()) {
            node.tile.markDirty();
        }
    }

    /**
     * 标记与指定像素区域重叠的所有瓦片为脏
     *
     * 通过矩形相交测试判断瓦片是否与区域重叠。
     *
     * @param startRow - 区域起始行（数据坐标）
     * @param startCol - 区域起始列（数据坐标）
     * @param endRow - 区域结束行（数据坐标）
     * @param endCol - 区域结束列（数据坐标）
     */
    invalidateRegion(startRow: number, startCol: number, endRow: number, endCol: number): void {
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
     *
     * @param tileRow - 瓦片行号
     * @param tileCol - 瓦片列号
     */
    remove(tileRow: number, tileCol: number): void {
        const key = `${tileRow}:${tileCol}`;
        const node = this.tiles.get(key);
        if (node) {
            this.#removeNode(node);
            node.tile.destroy();
            this.tiles.delete(key);
        }
    }

    /**
     * 清空所有瓦片
     *
     * 逐一销毁所有瓦片的离屏 Canvas 资源，清空 Map 和双向链表。
     */
    clear(): void {
        for (const node of this.tiles.values()) {
            node.tile.destroy();
        }
        this.tiles.clear();
        this.#head = null;
        this.#tail = null;
    }

    /**
     * 获取当前缓存的瓦片数量
     */
    get size(): number {
        return this.tiles.size;
    }

    /**
     * @private 私有方法 - LRU 缓存淘汰
     *
     * 当缓存数量达到上限时，从链表头部淘汰最久未使用的 25% 瓦片。
     */
    #evictIfNeeded(): void {
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
     * @private 私有方法 - 从双向链表中摘除指定节点
     *
     * 处理前驱/后继指针的重新连接，以及 head/tail 的更新。
     * 时间复杂度 O(1)。
     *
     * @param node - 要摘除的链表节点
     */
    #removeNode(node: ListNode): void {
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
     * @private 私有方法 - 将节点追加到双向链表尾部（标记为最近使用）
     *
     * 时间复杂度 O(1)。
     *
     * @param node - 要追加的链表节点
     */
    #appendTail(node: ListNode): void {
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
     * @private 私有方法 - 将已存在的节点移至链表尾部（标记为最近使用）
     *
     * 先从当前位置摘除，再追加到尾部。
     * 如果节点已在尾部则跳过。
     * 时间复杂度 O(1)。
     *
     * @param node - 要移动的链表节点
     */
    #moveToTail(node: ListNode): void {
        if (node === this.#tail) return;
        this.#removeNode(node);
        this.#appendTail(node);
    }
}
