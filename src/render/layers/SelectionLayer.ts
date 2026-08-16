import { BaseLayer } from "../BaseLayer.js";
import { OverlayRenderer } from "../OverlayRenderer.js";
import { CONFIG } from "../../constants/config.js";
import { SELECTION_CONFIG } from "../../constants/selectionConfig.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import type { ViewportTransform } from "../ViewportTransform.js";
import type { Sheet } from "../../workbook/Sheet.js";
import type { ReactiveStore as Store } from "../../state/ReactiveStore.js";

/** 列移动状态信息 */
interface ColumnMoveState {
    /** 源列号 */
    sourceCol: number;
    /** 目标列号 */
    targetCol: number;
    /** 拖拽起始 X 坐标 */
    dragStartX: number;
    /** 当前拖拽 X 坐标 */
    dragX: number;
    /** 源列宽度 */
    colW: number;
}

/** 行移动状态信息 */
interface RowMoveState {
    /** 源行号 */
    sourceRow: number;
    /** 目标行号 */
    targetRow: number;
    /** 拖拽起始 Y 坐标 */
    dragStartY: number;
    /** 当前拖拽 Y 坐标 */
    dragY: number;
    /** 源行高度 */
    rowH: number;
}

/**
 * 选区层（SelectionLayer）
 *
 * 负责渲染选区叠加效果和列/行移动指示器，包括：
 * - 选区边框和高亮
 * - 合并单元格叠加
 * - 列移动幽灵列和插入指示器
 * - 行移动幽灵行和插入指示器
 *
 * ## 图层定位
 *
 * zIndex = 20，位于 TileLayer(10) 之上、FrozenLayer(30) 之下。
 * 这保证了选区高亮在主数据之上、冻结数据之下正确显示。
 *
 * ## 裁剪策略
 *
 * 当存在冻结区域时，选区渲染会被裁剪到非冻结区域，
 * 避免在冻结区域中重复渲染选区叠加效果。
 *
 * @see BaseLayer 图层基类
 * @see OverlayRenderer 叠加渲染器
 */
export class SelectionLayer extends BaseLayer {
    /**
     * @private 私有字段 - 列移动状态
     */
    #columnMoveState: ColumnMoveState | null;

    /**
     * @private 私有字段 - 行移动状态
     */
    #rowMoveState: RowMoveState | null;

    /** 叠加渲染器，负责选区边框和合并单元格渲染 */
    overlayRenderer: OverlayRenderer;

    /**
     * 构造选区层
     *
     * 使用直接渲染模式（offscreen: false），
     * 因为选区绘制较轻量，无需离屏缓存。
     */
    constructor() {
        super("selection", LAYER_Z_INDEX.SELECTION, { offscreen: false });

        this.#columnMoveState = null;
        this.#rowMoveState = null;

        this.overlayRenderer = new OverlayRenderer();
    }

    /**
     * 绑定响应式 Store，监听状态变化
     *
     * 监听的键：
     * - selection: 选区变化 → 选区高亮更新
     * - frozenOffset: 冻结偏移量变化 → 裁剪区域更新
     * - frozen: 冻结配置变化 → 裁剪区域更新
     * - scroll: 滚动位置变化 → 选区位置更新
     * - viewport: 视口尺寸变化 → 选区布局更新
     *
     * @param store - 响应式存储
     */
    bindStore(store: Store): void {
        super.bindStore(store);
        this.watchForDirty("selection");
        this.watchForDirty("frozenOffset");
        this.watchForDirty("frozen");
        this.watchForDirty("scroll");
        this.watchForDirty("viewport");
    }

    /**
     * 设置列移动状态
     *
     * @param state - 列移动状态信息，传 null 清除
     */
    setColumnMoveState(state: ColumnMoveState | null): void {
        this.#columnMoveState = state;
        this.markDirty();
    }

    /**
     * 设置行移动状态
     *
     * @param state - 行移动状态信息，传 null 清除
     */
    setRowMoveState(state: RowMoveState | null): void {
        this.#rowMoveState = state;
        this.markDirty();
    }

    /**
     * 是否正在执行列移动
     *
     * @returns 是否有列移动状态
     */
    hasColumnMove(): boolean {
        return this.#columnMoveState !== null;
    }

    /**
     * 是否正在执行行移动
     *
     * @returns 是否有行移动状态
     */
    hasRowMove(): boolean {
        return this.#rowMoveState !== null;
    }

    /**
     * 判断指定列是否为列移动的源列
     *
     * @param col - 列号
     * @returns 是否为源列
     */
    isColumnSource(col: number): boolean {
        return this.#columnMoveState !== null && this.#columnMoveState.sourceCol === col;
    }

    /**
     * 判断指定行是否为行移动的源行
     *
     * @param row - 行号
     * @returns 是否为源行
     */
    isRowSource(row: number): boolean {
        return this.#rowMoveState !== null && this.#rowMoveState.sourceRow === row;
    }

    /**
     * 渲染选区叠加效果
     *
     * 按顺序渲染：选区叠加 → 列移动指示器 → 行移动指示器
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

        this.#renderOverlay(ctx, sheet, viewport, viewW!, viewH!);

        if (this.#columnMoveState) {
            this.#renderColumnMoveIndicator(ctx, sheet, viewport, viewW!, viewH!);
        }

        if (this.#rowMoveState) {
            this.#renderRowMoveIndicator(ctx, sheet, viewport, viewW!, viewH!);
        }

        this.renderCount++;
    }

    /**
     * @private 私有方法 - 渲染选区叠加效果（含裁剪）
     *
     * 当存在冻结区域时，将选区渲染裁剪到非冻结区域，
     * 避免在冻结区域中重复渲染选区叠加效果。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param viewport - 视口坐标转换器
     * @param viewW - 视口宽度
     * @param viewH - 视口高度
     */
    #renderOverlay(ctx: CanvasRenderingContext2D, sheet: Sheet, viewport: ViewportTransform, viewW: number, viewH: number): void {
        const frozenColsW = sheet.frozenColsWidth ?? 0;
        const frozenRowsH = sheet.frozenRowsHeight ?? 0;
        const headerW = typeof sheet.getHeaderWidth === "function" ? sheet.getHeaderWidth() : 0;
        const headerH = typeof sheet.getHeaderHeight === "function" ? sheet.getHeaderHeight() : 0;

        // 裁剪到非冻结区域
        let clipped = false;
        if (frozenColsW > 0 || frozenRowsH > 0) {
            const clipX = headerW + frozenColsW;
            const clipY = headerH + frozenRowsH;
            const clipW = viewW - headerW - frozenColsW;
            const clipH = viewH - headerH - frozenRowsH;
            if (clipW > 0 && clipH > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(clipX, clipY, clipW, clipH);
                ctx.clip();
                clipped = true;
            }
        }

        this.overlayRenderer.renderMerges(ctx, sheet, viewport);
        this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);

        if (clipped) {
            ctx.restore();
        }
    }

    /**
     * @private 私有方法 - 构建表头字体字符串
     *
     * @param defaultStyle - 默认样式对象
     * @returns CSS 字体字符串
     */
    #buildHeaderFont(defaultStyle: Record<string, unknown> | null): string {
        const fontSize = (defaultStyle as any)?.fontSize || 12;
        const fontFamily = (defaultStyle as any)?.fontFamily || "Segoe UI";
        return `${fontSize}px ${fontFamily}`;
    }

    /**
     * @private 私有方法 - 绘制表头文本
     *
     * @param ctx - Canvas 2D 上下文
     * @param text - 文本内容
     * @param x - X 坐标
     * @param y - Y 坐标
     * @param color - 文字颜色
     * @param font - 字体字符串
     */
    #drawHeaderText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: string): void {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, x, y);
    }

    /**
     * @private 私有方法 - 渲染列移动指示器
     *
     * 绘制幽灵列（半透明拖拽预览）和插入指示器（竖线）。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param vt - 视口坐标转换器
     * @param viewW - 视口宽度
     * @param viewH - 视口高度
     */
    #renderColumnMoveIndicator(ctx: CanvasRenderingContext2D, sheet: Sheet, vt: ViewportTransform, viewW: number, viewH: number): void {
        const state = this.#columnMoveState;
        if (!state) return;

        const headerW = (vt as any).headerW;
        const headerH = (vt as any).headerH;
        const headerFont = this.#buildHeaderFont((sheet as any).getDefaultStyle());

        const colScreenX = (vt as any).colToViewX(state.sourceCol);
        // 幽灵列 X 位置 = 当前拖拽位置 - (拖拽起始偏移 - 列屏幕位置)
        const ghostLeft = state.dragX - (state.dragStartX - colScreenX);

        ctx.save();

        // 幽灵列数据区域
        ctx.fillStyle = CONFIG.GHOST_FILL;
        ctx.fillRect(ghostLeft, headerH, state.colW, viewH - headerH);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
        ctx.strokeRect(ghostLeft, headerH, state.colW, viewH - headerH);

        // 幽灵列表头区域
        ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
        ctx.fillRect(ghostLeft, 0, state.colW, headerH);
        this.#drawHeaderText(
            ctx,
            (sheet as any).getColHeader(state.sourceCol),
            ghostLeft + (sheet as any).cellPadding,
            headerH - 8,
            CONFIG.GHOST_TEXT_COLOR,
            headerFont,
        );

        // 插入指示器
        if (state.targetCol >= 0 && state.targetCol !== state.sourceCol) {
            const indicatorX = this.#getColumnIndicatorX(vt, state);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(indicatorX - SELECTION_CONFIG.INDICATOR_HALF, headerH, SELECTION_CONFIG.INDICATOR_WIDTH, viewH - headerH);
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 获取列插入指示器 X 坐标
     *
     * @param vt - 视口坐标转换器
     * @param state - 列移动状态
     * @returns 指示器 X 坐标
     */
    #getColumnIndicatorX(vt: ViewportTransform, state: ColumnMoveState): number {
        if (state.targetCol > state.sourceCol) {
            return (vt as any).colRightToViewX(state.targetCol);
        }
        return (vt as any).colToViewX(state.targetCol);
    }

    /**
     * @private 私有方法 - 渲染行移动指示器
     *
     * 绘制幽灵行（半透明拖拽预览）和插入指示器（横线）。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param vt - 视口坐标转换器
     * @param viewW - 视口宽度
     * @param viewH - 视口高度
     */
    #renderRowMoveIndicator(ctx: CanvasRenderingContext2D, sheet: Sheet, vt: ViewportTransform, viewW: number, viewH: number): void {
        const state = this.#rowMoveState;
        if (!state) return;

        const headerW = (vt as any).headerW;
        const headerH = (vt as any).headerH;
        const headerFont = this.#buildHeaderFont((sheet as any).getDefaultStyle());

        const rowScreenY = (vt as any).rowToViewY(state.sourceRow);
        // 幽灵行 Y 位置 = 当前拖拽位置 - (拖拽起始偏移 - 行屏幕位置)
        const ghostTop = state.dragY - (state.dragStartY - rowScreenY);

        ctx.save();

        // 幽灵行数据区域
        ctx.fillStyle = CONFIG.GHOST_FILL;
        ctx.fillRect(headerW, ghostTop, viewW - headerW, state.rowH);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
        ctx.strokeRect(headerW, ghostTop, viewW - headerW, state.rowH);

        // 幽灵行表头区域
        ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
        ctx.fillRect(0, ghostTop, headerW, state.rowH);
        this.#drawHeaderText(
            ctx,
            String(state.sourceRow + 1),
            (sheet as any).cellPadding,
            ghostTop + state.rowH - 8,
            CONFIG.GHOST_TEXT_COLOR,
            headerFont,
        );

        // 插入指示器
        if (state.targetRow >= 0 && state.targetRow !== state.sourceRow) {
            const indicatorY = this.#getRowIndicatorY(vt, state);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(headerW, indicatorY - SELECTION_CONFIG.INDICATOR_HALF, viewW - headerW, SELECTION_CONFIG.INDICATOR_WIDTH);
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 获取行插入指示器 Y 坐标
     *
     * @param vt - 视口坐标转换器
     * @param state - 行移动状态
     * @returns 指示器 Y 坐标
     */
    #getRowIndicatorY(vt: ViewportTransform, state: RowMoveState): number {
        if (state.targetRow > state.sourceRow) {
            return (vt as any).rowBottomToViewY(state.targetRow);
        }
        return (vt as any).rowToViewY(state.targetRow);
    }
}
