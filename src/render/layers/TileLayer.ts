import { BaseLayer } from "../BaseLayer.js";
import { TileRenderer } from "../TileRenderer.js";
import { TileCache } from "../TileCache.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import type { ViewportTransform } from "../ViewportTransform.js";
import type { Sheet } from "../../workbook/Sheet.js";
import type { ReactiveStore as Store } from "../../state/ReactiveStore.js";

/**
 * 瓦片层（TileLayer）
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
 * 位于 FrozenLayer(30)、HeaderLayer(50)、SelectionLayer(20) 之下。
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
 * @see BaseLayer 图层基类
 * @see TileRenderer 瓦片渲染器
 * @see TileCache 瓦片缓存
 */
export class TileLayer extends BaseLayer {
    /** 瓦片渲染器，负责瓦片的创建、管理和绘制 */
    tileRenderer: TileRenderer;

    /**
     * 异步内容就绪回调
     * 当瓦片内的异步资源（如图片）加载完成时触发
     */
    onContentReady: (() => void) | null;

    /**
     * 构造瓦片层
     *
     * @param tileCache - 外部共享的瓦片缓存实例。
     *   传入 null 时会创建新的独立缓存。传入已有实例可实现跨图层缓存共享。
     */
    constructor(tileCache: TileCache | null = null) {
        super("tiles", LAYER_Z_INDEX.TILE);

        this.tileRenderer = new TileRenderer(tileCache || new TileCache());

        this.onContentReady = null;

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
     * - frozen/frozenOffset: 冻结变化 → 影响裁剪区域
     * - selection: 选区变化 → 需要重绘选区高亮
     *
     * @param store - 响应式存储
     */
    bindStore(store: Store): void {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("viewport");
        this.watchForDirty("tile");
        this.watchForDirty("frozen");
        this.watchForDirty("frozenOffset");
        this.watch("selection", () => {
            this.tileRenderer.invalidateAll();
        });
    }

    /**
     * 渲染主数据区域
     *
     * 将渲染完全委托给 TileRenderer，
     * 由其内部的瓦片系统完成高效的数据绘制。
     * 当存在冻结区域时，使用 Canvas clip() 裁剪非冻结区域，避免重叠。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param viewport - 视口坐标转换器
     * @param options - 渲染选项
     * @param options.viewW - 视口宽度
     * @param options.viewH - 视口高度
     * @param options.scrollX - 水平滚动偏移（覆盖 viewport.scrollX）
     * @param options.scrollY - 垂直滚动偏移（覆盖 viewport.scrollY）
     */
    render(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        viewport: ViewportTransform,
        options: { viewW?: number; viewH?: number; scrollX?: number; scrollY?: number } = {},
    ): void {
        if (!this.enabled) return;

        const scrollX = options.scrollX ?? viewport.scrollX;
        const scrollY = options.scrollY ?? viewport.scrollY;
        const viewW = options.viewW;
        const viewH = options.viewH;

        // 裁剪非冻结区域，避免冻结区域数据重叠
        const frozenColsW = sheet.frozenColsWidth ?? 0;
        const frozenRowsH = sheet.frozenRowsHeight ?? 0;
        const headerW = typeof sheet.getHeaderWidth === "function" ? sheet.getHeaderWidth() : 0;
        const headerH = typeof sheet.getHeaderHeight === "function" ? sheet.getHeaderHeight() : 0;

        let clipped = false;
        if (frozenColsW > 0 || frozenRowsH > 0) {
            const clipX = headerW + frozenColsW;
            const clipY = headerH + frozenRowsH;
            const clipW = viewW! - headerW - frozenColsW;
            const clipH = viewH! - headerH - frozenRowsH;
            if (clipW > 0 && clipH > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(clipX, clipY, clipW, clipH);
                ctx.clip();
                clipped = true;
            }
        }

        this.tileRenderer.render(ctx, sheet, scrollX, scrollY, viewW!, viewH!);

        if (clipped) {
            ctx.restore();
        }

        this.renderCount++;
    }

    /**
     * 标记指定单元格为脏
     *
     * 定位到该单元格所在的瓦片并标记为脏，
     * 同时将自身也标记为脏以确保下一帧会重新渲染。
     *
     * @param row - 行索引
     * @param col - 列索引
     * @param rc - 行列管理器引用（用于坐标计算）
     */
    markCellDirty(row: number, col: number, rc: object): void {
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
    markAllDirty(): void {
        this.tileRenderer.invalidateAll();
        this.markDirty();
    }
}
