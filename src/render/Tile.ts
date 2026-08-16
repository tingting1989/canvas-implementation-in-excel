import { CONFIG } from "../constants/config.js";

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
 *
 * 脏标记机制（dirty flag）：
 * - dirty = true 表示瓦片内容已过期，需要重新绘制
 * - dirty = false 表示瓦片内容是最新的，可以直接复用缓存
 *
 * LRU 缓存淘汰：
 * - LRU 顺序由 TileCache 内部的双向链表维护
 * - 淘汰时从链表头部移除（最久未使用），O(1) 复杂度
 *
 * 高清屏适配（DPR）：
 * - Canvas 物理像素 = 逻辑像素 x DPR
 * - 通过 ctx.scale(DPR, DPR) 让绘制代码仍以逻辑像素工作
 */
export class Tile {
    /** 瓦片行号（瓦片网格坐标，非单元格行号） */
    tileRow: number;

    /** 瓦片列号（瓦片网格坐标，非单元格列号） */
    tileCol: number;

    /** 脏标记，true 表示需要重新绘制 */
    dirty: boolean;

    /** 设备像素比，从 CONFIG.DPR 读取并缓存到实例 */
    dpr: number;

    /** 离屏 Canvas，瓦片的绘制目标 */
    canvas: HTMLCanvasElement | null;

    /** 离屏 Canvas 的 2D 渲染上下文 */
    ctx: CanvasRenderingContext2D | null;

    /**
     * 创建瓦片实例
     *
     * @param tileRow - 瓦片行号（瓦片网格坐标，非单元格行号）
     * @param tileCol - 瓦片列号（瓦片网格坐标，非单元格列号）
     */
    constructor(tileRow: number, tileCol: number) {
        this.tileRow = tileRow;
        this.tileCol = tileCol;
        this.dirty = true;
        this.dpr = CONFIG.DPR;

        this.canvas = document.createElement("canvas");
        this.canvas.width = CONFIG.TILE_SIZE * CONFIG.DPR;
        this.canvas.height = CONFIG.TILE_SIZE * CONFIG.DPR;

        this.ctx = this.canvas.getContext("2d");
        this.ctx!.scale(CONFIG.DPR, CONFIG.DPR);
    }

    /**
     * 获取瓦片的缓存键
     *
     * 格式为 tileRow:tileCol，用于 TileCache 的 Map 键。
     *
     * @returns 缓存键
     */
    getKey(): string {
        return `${this.tileRow}:${this.tileCol}`;
    }

    /**
     * 将瓦片标记为脏（需要重新绘制）
     */
    markDirty(): void {
        this.dirty = true;
    }

    /**
     * 清空瓦片内容并标记为脏
     */
    clear(): void {
        this.ctx!.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx!.clearRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        this.dirty = true;
    }

    /**
     * 销毁瓦片，释放 Canvas 资源（包括 GPU 内存）
     *
     * 先将宽高置零以主动通知浏览器释放 GPU 端纹理内存，
     * 再断开引用让 JS GC 回收宿主对象。
     */
    destroy(): void {
        if (this.canvas) {
            this.canvas.width = 0;
            this.canvas.height = 0;
        }
        this.ctx = null;
        this.canvas = null;
    }
}
