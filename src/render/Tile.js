import { CONFIG } from "../constants/config";

/**
 * 瓦片（Tile）—— 瓦片渲染架构的基本单元
 *
 * 核心概念：
 * 将整个表格区域按 TILE_SIZE x TILE_SIZE 像素切割为若干瓦片，
 * 每个瓦片拥有独立的离屏 Canvas，独立渲染和缓存。
 * 滚动时只重绘脏（dirty）瓦片，避免全量重绘，这是处理大数据量表格的关键优化。
 *
 * 瓦片坐标系：
 * - tileRow / tileCol 是瓦片在瓦片网格中的行列号（不是单元格行列号）
 * - 瓦片 (0,0) 覆盖像素区域 [0, TILE_SIZE) x [0, TILE_SIZE)
 * - 瓦片 (1,0) 覆盖像素区域 [TILE_SIZE, 2*TILE_SIZE) x [0, TILE_SIZE)
 *
 * 脏标记机制（dirty flag）：
 * - dirty = true 表示瓦片内容已过期，需要重新绘制
 * - dirty = false 表示瓦片内容是最新的，可以直接复用缓存
 * - 当单元格数据/样式变化时，将对应瓦片标记为 dirty
 * - TileRenderer.render() 只重绘 dirty 的瓦片
 *
 * LRU 缓存淘汰：
 * - LRU 顺序由 TileCache 内部的双向链表维护
 * - 瓦片被访问时，TileCache 将其移至链表尾部（最近使用）
 * - 淘汰时从链表头部移除（最久未使用），O(1) 复杂度
 *
 * 高清屏适配（DPR）：
 * - Canvas 物理像素 = 逻辑像素 x DPR
 * - 例如 TILE_SIZE=256, DPR=2 时，Canvas 实际尺寸为 512x512
 * - 通过 ctx.scale(DPR, DPR) 让绘制代码仍以逻辑像素工作
 * - 最终 drawImage 时缩放回逻辑尺寸，实现高清渲染
 */
export class Tile {
    /**
     * 创建瓦片实例
     *
     * @param {number} tileRow - 瓦片行号（瓦片网格坐标，非单元格行号）
     * @param {number} tileCol - 瓦片列号（瓦片网格坐标，非单元格列号）
     */
    constructor(tileRow, tileCol) {
        /** @type {number} 瓦片行号 */
        this.tileRow = tileRow;
        /** @type {number} 瓦片列号 */
        this.tileCol = tileCol;
        /** @type {boolean} 脏标记，true 表示需要重新绘制 */
        this.dirty = true;
        /** @type {number} 设备像素比，从 CONFIG.DPR 读取并缓存到实例 */
        this.dpr = CONFIG.DPR;
        /** @type {HTMLCanvasElement} 离屏 Canvas，瓦片的绘制目标 */
        this.canvas = document.createElement("canvas");
        // Canvas 物理像素尺寸 = 逻辑尺寸 x DPR，确保高清屏清晰
        this.canvas.width = CONFIG.TILE_SIZE * CONFIG.DPR;
        this.canvas.height = CONFIG.TILE_SIZE * CONFIG.DPR;
        /** @type {CanvasRenderingContext2D} 离屏 Canvas 的 2D 渲染上下文 */
        this.ctx = this.canvas.getContext("2d");
        // 缩放上下文，使后续绘制代码以逻辑像素坐标工作
        this.ctx.scale(CONFIG.DPR, CONFIG.DPR);
    }

    /**
     * 获取瓦片的缓存键
     * 格式为 tileRow:tileCol，用于 TileCache 的 Map 键
     *
     * @returns {string} 缓存键
     */
    getKey() {
        return `${this.tileRow}:${this.tileCol}`;
    }

    /**
     * 将瓦片标记为脏（需要重新绘制）
     */
    markDirty() {
        this.dirty = true;
    }

    /**
     * 清空瓦片内容并标记为脏
     */
    clear() {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.clearRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        this.dirty = true;
    }

    /**
     * 销毁瓦片，释放 Canvas 资源（包括 GPU 内存）
     *
     * 先将宽高置零以主动通知浏览器释放 GPU 端纹理内存，
     * 再断开引用让 JS GC 回收宿主对象。
     */
    destroy() {
        // 将 Canvas 尺寸置零，主动释放 GPU 端纹理/缓冲区
        // 这是 Canvas 2D 释放 GPU 资源的可靠手段，比单纯靠 GC 更快
        if (this.canvas) {
            this.canvas.width = 0;
            this.canvas.height = 0;
        }
        // 断开引用，让 JS GC 回收宿主对象
        this.ctx = null;
        this.canvas = null;
    }
}
