import { BaseLayer } from "../BaseLayer.js";
import { CONFIG } from "../../constants/config.js";
import { UI_CONFIG } from "../../constants/uiConfig.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import type { ViewportTransform } from "../ViewportTransform.js";
import type { Sheet } from "../../workbook/Sheet.js";
import type { ReactiveStore as Store } from "../../state/ReactiveStore.js";

/** 调整大小线信息 */
interface ResizeLineInfo {
    /** 线类型（col-resize / row-resize） */
    type: string;
    /** 行/列索引 */
    index: number;
    /** 线位置（像素坐标） */
    position: number;
}

/**
 * 交互层（InteractionLayer）
 *
 * 负责渲染用户交互相关的视觉指示器，包括：
 * - 冻结分割线：冻结行/列的视觉分隔线
 * - 调整大小预览线：拖拽行高/列宽时的虚线指示
 * - 编辑器边框：单元格编辑时的选中边框和填充
 * - 调试信息：开发模式下的图层状态叠加显示
 *
 * ## 图层定位
 *
 * zIndex = 40，位于 FrozenLayer(30) 之上、HeaderLayer(50) 之下。
 * 这保证了交互指示线在冻结数据之上、表头之下正确显示。
 *
 * @see BaseLayer 图层基类
 */
export class InteractionLayer extends BaseLayer {
    /**
     * @private 私有字段 - 当前调整大小线信息
     */
    #resizeLine: ResizeLineInfo | null;

    /** 是否启用调试模式（显示图层状态信息） */
    debugMode: boolean;

    /**
     * 构造交互层
     *
     * 使用直接渲染模式（offscreen: false），
     * 因为交互指示器绘制较轻量，无需离屏缓存。
     */
    constructor() {
        super("interaction", LAYER_Z_INDEX.INTERACTION, { offscreen: false });

        this.#resizeLine = null;
        this.debugMode = false;
    }

    /**
     * 绑定响应式 Store，监听状态变化
     *
     * 监听的键：
     * - scroll: 滚动位置变化 → 冻结分割线位置更新
     * - frozenOffset: 冻结偏移量变化 → 冻结分割线位置更新
     * - frozen: 冻结配置变化 → 冻结分割线显示/隐藏
     * - editor: 编辑器状态变化 → 编辑器边框显示/隐藏
     * - selection: 选区变化 → 编辑器边框位置更新
     *
     * @param store - 响应式存储
     */
    bindStore(store: Store): void {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("frozenOffset");
        this.watchForDirty("frozen");
        this.watchForDirty("editor");
        this.watchForDirty("selection");
    }

    /**
     * 设置调整大小预览线
     *
     * @param type - 线类型（HIT_TYPE.COL_RESIZE / HIT_TYPE.ROW_RESIZE），传 null 清除
     * @param index - 行/列索引
     * @param position - 线位置（像素坐标）
     */
    setResizeLine(type: string | null, index: number, position: number): void {
        this.#resizeLine = type ? { type, index, position } : null;
        this.markDirty();
    }

    /**
     * 清除调整大小预览线
     */
    clearResizeLine(): void {
        this.#resizeLine = null;
        this.markDirty();
    }

    /**
     * 获取当前调整大小线信息
     *
     * @returns 调整大小线信息，无则返回 null
     */
    getResizeLine(): ResizeLineInfo | null {
        return this.#resizeLine;
    }

    /**
     * 渲染交互指示器
     *
     * 按顺序渲染：冻结分割线 → 调整大小预览线 → 编辑器边框 → 调试信息
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param viewport - 视口坐标转换器
     * @param options - 渲染选项
     * @param options.viewW - 视口宽度
     * @param options.viewH - 视口高度
     * @param options.layers - 图层数组（调试模式使用）
     */
    render(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        viewport: ViewportTransform,
        options: { viewW?: number; viewH?: number; layers?: BaseLayer[] } = {},
    ): void {
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        this.#renderFreezeLines(ctx, sheet, viewW!, viewH!);
        this.#renderResizeLine(ctx, viewW!, viewH!);
        this.#renderEditor(ctx, sheet, viewport);

        if (this.debugMode) {
            this.#renderDebugInfo(ctx, options);
        }

        this.renderCount++;
    }

    /**
     * @private 私有方法 - 渲染冻结分割线
     *
     * 在冻结列/行的边界处绘制实线，视觉上分隔冻结区域和滚动区域。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param viewW - 视口宽度
     * @param viewH - 视口高度
     */
    #renderFreezeLines(ctx: CanvasRenderingContext2D, sheet: Sheet, viewW: number, viewH: number): void {
        const frozenColsW = sheet.frozenColsWidth ?? 0;
        const frozenRowsH = sheet.frozenRowsHeight ?? 0;

        if (frozenColsW === 0 && frozenRowsH === 0) return;

        const headerW = typeof sheet.getHeaderWidth === "function" ? sheet.getHeaderWidth() : 0;
        const headerH = typeof sheet.getHeaderHeight === "function" ? sheet.getHeaderHeight() : 0;

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;

        // 冻结列分割线（垂直）
        if (frozenColsW > 0) {
            const x = headerW + frozenColsW;
            ctx.beginPath();
            ctx.moveTo(x, headerH);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        }

        // 冻结行分割线（水平）
        if (frozenRowsH > 0) {
            const y = headerH + frozenRowsH;
            ctx.beginPath();
            ctx.moveTo(headerW, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 渲染调整大小预览线
     *
     * 绘制虚线指示器，显示拖拽行高/列宽的目标位置。
     *
     * @param ctx - Canvas 2D 上下文
     * @param viewW - 视口宽度
     * @param viewH - 视口高度
     */
    #renderResizeLine(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
        if (!this.#resizeLine) return;

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN);

        if (this.#resizeLine.type === HIT_TYPE.COL_RESIZE) {
            // 列宽调整：垂直虚线
            const x = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        } else if (this.#resizeLine.type === HIT_TYPE.ROW_RESIZE) {
            // 行高调整：水平虚线
            const y = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 渲染编辑器边框
     *
     * 当编辑器可见时，在正在编辑的单元格周围绘制选中边框和填充。
     * 支持合并单元格：合并单元格使用 mergeToViewRect 计算位置。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param viewport - 视口坐标转换器
     */
    #renderEditor(ctx: CanvasRenderingContext2D, sheet: Sheet, viewport: ViewportTransform): void {
        const store = this.getStore();
        if (!store) return;

        const editorVisible = (store.state as any).editor.visible;
        if (!editorVisible) return;

        const row = (store.state as any).editor.row;
        const col = (store.state as any).editor.col;
        if (row < 0 || col < 0) return;

        // 支持合并单元格
        const merge = (sheet as any).getMerge(row, col);
        let rect: { x: number; y: number; w: number; h: number };
        if (merge) {
            rect = (viewport as any).mergeToViewRect(merge);
        } else {
            rect = (viewport as any).cellToViewRect(row, col);
        }

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

        ctx.fillStyle = CONFIG.INTERACTION_HOVER_FILL;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    /**
     * @private 私有方法 - 渲染调试信息
     *
     * 在画布左上角显示各图层的名称、Z-Index、脏标记和渲染次数。
     *
     * @param ctx - Canvas 2D 上下文
     * @param options - 渲染选项（含 layers 数组）
     */
    #renderDebugInfo(ctx: CanvasRenderingContext2D, options: { layers?: BaseLayer[] }): void {
        const layers = options.layers || [];

        ctx.save();
        ctx.fillStyle = CONFIG.ERROR_HIGHLIGHT_FILL;
        ctx.font = `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.MONO_FONT_FAMILY}`;

        let y = UI_CONFIG.DEBUG_START_Y;
        ctx.fillText(`[Debug] Total Layers: ${layers.length}`, 10, y);

        for (const layer of layers) {
            y += UI_CONFIG.DEBUG_LINE_HEIGHT;
            const info = (layer as any).getDebugInfo();
            const status = layer.dirty ? "DIRTY" : "CLEAN";
            ctx.fillText(`  ${info.name} (z:${info.zIndex}) ${status} renders:${layer.renderCount}`, 10, y);
        }

        ctx.restore();
    }
}
