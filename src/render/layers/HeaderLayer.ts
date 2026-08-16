import { BaseLayer } from "../BaseLayer.js";
import { HeaderRenderer } from "../HeaderRenderer.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import type { ViewportTransform } from "../ViewportTransform.js";
import type { Sheet } from "../../workbook/Sheet.js";
import type { ReactiveStore as Store } from "../../state/ReactiveStore.js";

/**
 * 表头层（HeaderLayer）
 *
 * 负责渲染 Excel 的行号头和列标头。
 * 表头位于视口的最顶层（zIndex=50），包含：
 * - 列标头 (A, B, C...)：显示在数据区上方
 * - 行号头 (1, 2, 3...)：显示在数据区左侧
 * - 左上角空白角：行号头和列标头的交叉区域
 *
 * ## 图层定位
 *
 * zIndex = 50，位于 InteractionLayer(40) 之上、SelectionLayer(20) 之下。
 * 这保证了表头始终显示在冻结区域数据之上，但在交互层（调试信息等）之下。
 *
 * ## 滚动行为
 *
 * - 列标头：水平方向跟随滚动同步移动，冻结列部分保持静止
 * - 行号头：垂直方向跟随滚动同步移动，冻结行部分保持静止
 * - 表头的滚动同步由 HeaderRenderer 内部处理
 *
 * ## 重绘触发
 *
 * 监听 scroll/frozen/viewport/selection 四个状态键的变化，
 * 任一变化都会触发表头重绘以确保视觉一致性。
 *
 * @see BaseLayer 图层基类
 * @see HeaderRenderer 表头渲染器
 */
export class HeaderLayer extends BaseLayer {
    /**
     * @private 私有字段 - 选区层引用（用于拖拽指示器渲染）
     */
    #selectionLayer: object | null = null;

    /** 表头渲染器，负责行列头的实际绘制 */
    headerRenderer: HeaderRenderer;

    /**
     * 构造表头层
     *
     * 使用直接渲染模式（offscreen: false），
     * 因为表头绘制较轻量，无需离屏缓存。
     */
    constructor() {
        super("headers", LAYER_Z_INDEX.HEADER, { offscreen: false });

        this.headerRenderer = new HeaderRenderer();
    }

    /**
     * 设置拖拽指示器层引用
     *
     * 用于在列拖拽时在表头中渲染拖拽指示器。
     *
     * @param layer - 选区层实例
     */
    setDragIndicator(layer: object | null): void {
        this.#selectionLayer = layer;
    }

    /**
     * 绑定响应式 Store，监听状态变化
     *
     * 监听的键：
     * - scroll: 滚动位置变化 → 表头需要重新定位
     * - frozen: 冻结配置变化 → 表头需要调整冻结部分的渲染
     * - viewport: 视口尺寸变化 → 表头需要重新计算布局
     * - selection: 选区变化 → 表头需要高亮选中行列的头
     *
     * @param store - 响应式存储
     */
    bindStore(store: Store): void {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("frozen");
        this.watchForDirty("viewport");
        this.watchForDirty("selection");
    }

    /**
     * 渲染表头
     *
     * 将渲染委托给 HeaderRenderer 实例，
     * 由其内部完成行列头的完整绘制流程。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param viewport - 视口坐标转换器
     * @param options - 渲染选项
     * @param options.viewW - 视口宽度
     * @param options.viewH - 视口高度
     */
    render(ctx: CanvasRenderingContext2D, sheet: Sheet, viewport: ViewportTransform, options: { viewW?: number; viewH?: number } = {}): void {
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        this.headerRenderer.render(ctx, sheet, viewport, viewW, viewH, this.#selectionLayer);

        this.renderCount++;
    }
}