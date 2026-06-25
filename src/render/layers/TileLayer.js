/**
 * 瓦片层 (TileLayer)
 *
 * 负责渲染 Excel 主数据区域的单元格内容。
 * 这是渲染引擎中最核心的图层，承载着绝大部分的数据渲染工作。
 *
 * ## 瓦片化渲染策略
 *
 * 将可视区域划分为固定大小的瓦片（默认 256×256 px），
 * 每个瓦片作为独立的离屏 Canvas 进行缓存渲染：
 * - 未变化的瓦片直接从缓存复制，无需重绘
 * - 只有脏瓦片才会触发实际的内容绘制
 * - 滚动时只需平移瓦片位置，极大减少绘制开销
 *
 * ## 图层定位
 *
 * zIndex = 10，是所有数据图层中最底层的。
 * 位于 FrozenLayer(40)、HeaderLayer(50)、OverlayLayer(20) 之下。
 * 这保证了主数据区域作为背景层，其他图层在其上叠加。
 *
 * ## 内容就绪回调
 *
 * 提供 onContentReady 回调机制，
 * 当异步加载的单元格内容（如图片）准备完毕时通知外部。
 * 典型用途：图片加载完成后触发整体重绘。
 *
 * ## 脏标记传播
 *
 * 支持细粒度的脏标记管理：
 * - markCellDirty(): 标记单个单元格所在瓦片为脏
 * - markAllDirty(): 标记所有瓦片为脏（通常在全量刷新时使用）
 *
 * @module render/layers/TileLayer
 */

import { BaseLayer } from "../BaseLayer.js";
import { TileRenderer } from "../TileRenderer.js";
import { TileCache } from "../TileCache.js";

export class TileLayer extends BaseLayer {
    /**
     * 构造瓦片层
     *
     * @param {TileCache|null} [tileCache=null] - 外部共享的瓦片缓存实例。
     *   传入 null 时会创建新的独立缓存。传入已有实例可实现跨图层缓存共享。
     */
    constructor(tileCache = null) {
        super("tiles", 10);

        /** 瓦片渲染器，负责瓦片的创建、管理和绘制 */
        this.tileRenderer = new TileRenderer(tileCache || new TileCache());

        /**
         * 异步内容就绪回调
         * 当瓦片内的异步资源（如图片）加载完成时触发
         * @type {Function|null}
         */
        this.onContentReady = null;

        /**
         * 注册瓦片渲染器的 contentReady 回调
         * 实现两层通知：外部回调 + 自动标记脏
         */
        this.tileRenderer.onContentReady = () => {
            if (this.onContentReady) {
                this.onContentReady();
            }
            this.markDirty();
        };
    }

    /**
     * 绑定响应式 Store，监听状态变化
     *
     * 监听的键：
     * - scroll: 滚动位置变化 → 瓦片可见集变化，可能需要新瓦片
     * - viewport: 视口尺寸变化 → 瓦片覆盖范围变化
     * - tile: 瓦片相关配置变化 → 可能影响瓦片大小或缓存策略
     *
     * @param {import("../../store/ReactiveStore").ReactiveStore} store - 响应式存储
     */
    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("viewport");
        this.watchForDirty("tile");
    }

    /**
     * 渲染主数据区域
     *
     * 将渲染完全委托给 TileRenderer，
     * 由其内部的瓦片系统完成高效的数据绘制。
     *
     * 支持分页模式 (useRealRows)，在该模式下会进行行号的页内/真实转换。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("../ViewportTransform.js").ViewportTransform} viewport - 视口坐标转换器
     * @param {object} options - 渲染选项
     * @param {number} options.viewW - 视口宽度
     * @param {number} options.viewH - 视口高度
     * @param {number} [options.scrollX] - 水平滚动偏移（覆盖 viewport.scrollX）
     * @param {number} [options.scrollY] - 垂直滚动偏移（覆盖 viewport.scrollY）
     * @param {boolean} [options.useRealRows] - 是否使用真实行号（分页模式）
     */
    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const scrollX = options.scrollX ?? viewport.scrollX;
        const scrollY = options.scrollY ?? viewport.scrollY;
        const viewW = options.viewW;
        const viewH = options.viewH;
        const useRealRows = options.useRealRows;

        this.tileRenderer.render(ctx, sheet, scrollX, scrollY, viewW, viewH, useRealRows ? { useRealRows: true } : undefined);

        this.renderCount++;
    }

    /**
     * 标记指定单元格为脏
     *
     * 定位到该单元格所在的瓦片并标记为脏，
     * 同时将自身也标记为脏以确保下一帧会重新渲染。
     *
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {object} rc - 行列管理器引用（用于坐标计算）
     */
    markCellDirty(row, col, rc) {
        this.tileRenderer.invalidateCell(row, col, rc);
        this.markDirty();
    }

    /**
     * 标记所有瓦片为脏
     *
     * 清除瓦片缓存中的所有脏标记重置，
     * 强制下一帧对所有可见瓦片进行完整重绘。
     *
     * 典型调用场景：
     * - 全局样式变更（字体、字号、颜色主题切换）
     * - 语言切换（影响文本测量结果）
     * - 全局格式刷操作
     */
    markAllDirty() {
        this.tileRenderer.invalidateAll();
        this.markDirty();
    }
}