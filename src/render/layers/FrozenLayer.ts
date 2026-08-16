import { BaseLayer } from "../BaseLayer.js";
import { TileRenderer } from "../TileRenderer.js";
import { TileCache } from "../TileCache.js";
import { OverlayRenderer } from "../OverlayRenderer.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import type { ViewportTransform } from "../ViewportTransform.js";
import type { Sheet } from "../../workbook/Sheet.js";
import type { ReactiveStore as Store } from "../../state/ReactiveStore.js";

/**
 * 冻结层（FrozenLayer）
 *
 * 负责渲染 Excel 冻结区域的单元格数据和叠加效果。
 * 当工作表配置了冻结行/列时，该图层会在视口固定位置显示冻结区域的内容，
 * 使其在滚动时保持静止不动。
 *
 * ## 渲染策略
 *
 * 冻结层将冻结区域分为最多 3 个独立区域分别渲染：
 * - **冻结列区域**：表头下方、冻结列宽度范围内，垂直方向随滚动变化
 * - **冻结行区域**：表头右侧、冻结行高度范围内，水平方向随滚动变化
 * - **冻结角区域**：冻结列与冻结行交叉的左上角区域，完全不滚动
 *
 * 每个区域使用 Canvas clip() 裁剪确保内容不会溢出。
 *
 * ## 图层层级
 *
 * zIndex = 30，位于 SelectionLayer(20) 之上、InteractionLayer(40) 之下。
 * 这保证了冻结区域的数据在非冻结数据层之上、交互指示线之下正确显示。
 *
 * ## 性能优化
 *
 * - 使用独立的 TileCache 与 TileLayer 隔离，避免缓存冲突
 * - 通过 _cachedFrozenColsW / _cachedFrozenRowsH 缓存冻结状态，
 *   仅在冻结范围变化时触发全量重绘
 *
 * @see BaseLayer 图层基类
 * @see TileRenderer 瓦片渲染器
 * @see OverlayRenderer 叠加渲染器
 */
export class FrozenLayer extends BaseLayer {
    /** 瓦片渲染器，负责冻结区域的单元格内容绘制 */
    tileRenderer: TileRenderer;

    /** 叠加渲染器，负责合并单元格边框和选区高亮 */
    overlayRenderer: OverlayRenderer;

    /** 缓存的冻结列宽度，用于检测冻结状态变化 */
    _cachedFrozenColsW: number;

    /** 缓存的冻结行高度，用于检测冻结状态变化 */
    _cachedFrozenRowsH: number;

    /**
     * 构造冻结层
     *
     * 创建独立的 TileRenderer（使用独立 TileCache）和 OverlayRenderer。
     */
    constructor() {
        super("frozen", LAYER_Z_INDEX.FROZEN);

        this.tileRenderer = new TileRenderer(new TileCache());
        this.overlayRenderer = new OverlayRenderer();

        this._cachedFrozenColsW = -1;
        this._cachedFrozenRowsH = -1;
    }

    /**
     * 标记指定单元格为脏，触发瓦片重绘
     *
     * @param row - 行索引
     * @param col - 列索引
     * @param rc - 行列管理器引用
     */
    markCellDirty(row: number, col: number, rc: object): void {
        this.tileRenderer.invalidateCell(row, col, rc);
        this.markDirty();
    }

    /**
     * 标记所有冻结区域瓦片为脏
     */
    markAllDirty(): void {
        this.tileRenderer.invalidateAll();
        this.markDirty();
    }

    /**
     * 绑定响应式 Store，监听状态变化以触发重绘
     *
     * 监听的键：
     * - frozen: 冻结配置变更（行列数变化）
     * - frozenOffset: 冻结偏移量变更（拖动调整后）
     * - scroll: 滚动位置变更（冻结区域需要重新裁剪）
     * - selection: 选区变更（选区高亮需要更新）
     *
     * @param store - 响应式存储
     */
    bindStore(store: Store): void {
        super.bindStore(store);
        this.watchForDirty("frozen");
        this.watchForDirty("frozenOffset");
        this.watchForDirty("scroll");
        this.watch("selection", () => {
            this.tileRenderer.invalidateAll();
        });
    }

    /**
     * @private 私有方法 - 检测冻结状态是否发生变化
     *
     * 对比当前 sheet 的冻结宽度和缓存的值，
     * 如果不一致则更新缓存并返回 true 表示需要重绘。
     *
     * @param sheet - 工作表实例
     * @returns 冻结状态是否发生变化
     */
    #checkFrozenStateChange(sheet: Sheet): boolean {
        const currentColsW = sheet.frozenColsWidth;
        const currentRowsH = sheet.frozenRowsHeight;

        if (currentColsW !== this._cachedFrozenColsW || currentRowsH !== this._cachedFrozenRowsH) {
            this._cachedFrozenColsW = currentColsW;
            this._cachedFrozenRowsH = currentRowsH;
            return true;
        }
        return false;
    }

    /**
     * 渲染冻结区域
     *
     * 根据冻结配置决定渲染哪些区域：
     * 1. 有冻结列时 → 渲染垂直冻结条带（从表头到底部）
     * 2. 有冻结行时 → 渲染水平冻结条带（从表头到右侧）
     * 3. 同时有冻结行和列 → 渲染左上角交叉区域
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
    render(ctx: CanvasRenderingContext2D, sheet: Sheet, viewport: ViewportTransform, options: { viewW?: number; viewH?: number; scrollX?: number; scrollY?: number } = {}): void {
        if (!this.enabled) return;

        const frozenColsW = sheet.frozenColsWidth;
        const frozenRowsH = sheet.frozenRowsHeight;

        if (frozenColsW === 0 && frozenRowsH === 0) {
            return;
        }

        if (this.#checkFrozenStateChange(sheet)) {
            this.tileRenderer.invalidateAll();
            this.markDirty();
        }

        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const viewW = options.viewW!;
        const viewH = options.viewH!;
        const scrollX = options.scrollX ?? viewport.scrollX;
        const scrollY = options.scrollY ?? viewport.scrollY;

        // 冻结列区域：表头下方，冻结列宽度范围
        if (frozenColsW > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH + frozenRowsH,
                frozenColsW,
                viewH - headerH - frozenRowsH,
                0,
                scrollY,
                frozenColsW + headerW,
                viewH,
                viewport,
            );
        }

        // 冻结行区域：表头右侧，冻结行高度范围
        if (frozenRowsH > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW + frozenColsW,
                headerH,
                viewW - headerW - frozenColsW,
                frozenRowsH,
                scrollX,
                0,
                viewW,
                frozenRowsH + headerH,
                viewport,
            );
        }

        // 冻结角区域：冻结列与冻结行交叉的左上角
        if (frozenRowsH > 0 && frozenColsW > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                frozenColsW,
                frozenRowsH,
                0,
                0,
                frozenColsW + headerW,
                frozenRowsH + headerH,
                viewport,
            );
        }

        this.renderCount++;
    }

    /**
     * @private 私有方法 - 在裁剪区域内渲染冻结数据
     *
     * 使用 ctx.clip() 将绘制限制在指定矩形区域内，
     * 然后依次渲染：
     * 1. Tile 数据（单元格内容）
     * 2. 合并单元格边框
     * 3. 选区叠加效果（仅当选区与裁剪区域相交时）
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param clipX - 裁剪区域左上角 X
     * @param clipY - 裁剪区域左上角 Y
     * @param clipW - 裁剪区域宽度
     * @param clipH - 裁剪区域高度
     * @param scrollX - 该区域的水平滚动偏移
     * @param scrollY - 该区域的垂直滚动偏移
     * @param viewW - 视口宽度（用于 overlay 计算）
     * @param viewH - 视口高度（用于 overlay 计算）
     * @param viewport - 视口坐标转换器
     */
    #renderClippedRegion(ctx: CanvasRenderingContext2D, sheet: Sheet, clipX: number, clipY: number, clipW: number, clipH: number, scrollX: number, scrollY: number, viewW: number, viewH: number, viewport: ViewportTransform): void {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();

        this.tileRenderer.render(ctx, sheet, scrollX, scrollY, viewW, viewH);
        this.overlayRenderer.renderMerges(ctx, sheet, viewport);

        // 仅当选区与裁剪区域相交时才渲染选区叠加
        if (this.#isSelectionInClipArea(sheet, viewport, clipX, clipY, clipW, clipH)) {
            this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 判断选区是否与裁剪区域相交
     *
     * 先进行矩形相交测试，再判断选区是否属于冻结区域，
     * 避免在非冻结裁剪区域中重复渲染冻结区域的选区。
     *
     * @param sheet - 工作表实例
     * @param viewport - 视口坐标转换器
     * @param clipX - 裁剪区域左上角 X
     * @param clipY - 裁剪区域左上角 Y
     * @param clipW - 裁剪区域宽度
     * @param clipH - 裁剪区域高度
     * @returns 选区是否在裁剪区域内
     */
    #isSelectionInClipArea(sheet: Sheet, viewport: ViewportTransform, clipX: number, clipY: number, clipW: number, clipH: number): boolean {
        const range = (sheet as any).selection?.getRange();
        if (!range || !(viewport as any).mergeToViewRect) return false;

        const selectionRect = (viewport as any).mergeToViewRect(range);

        const selRight = selectionRect.x + selectionRect.w;
        const selBottom = selectionRect.y + selectionRect.h;
        const clipRight = clipX + clipW;
        const clipBottom = clipY + clipH;

        // 矩形相交测试
        const intersects = selectionRect.x < clipRight && selRight > clipX && selectionRect.y < clipBottom && selBottom > clipY;

        if (!intersects) return false;

        // 判断选区和裁剪区域是否属于同一冻结区域
        const fixedCols = (sheet as any).fixedColumnsStart;
        const fixedRows = (sheet as any).fixedRowsTop;

        const isSelectionInFrozenCols = range.topCol < fixedCols || range.bottomCol < fixedCols;
        const isSelectionInFrozenRows = range.topRow < fixedRows || range.bottomRow < fixedRows;
        const isClipAreaFrozenCols = clipX >= sheet.getHeaderWidth() && clipX + clipW <= sheet.getHeaderWidth() + sheet.frozenColsWidth;
        const isClipAreaFrozenRows = clipY >= sheet.getHeaderHeight() && clipY + clipH <= sheet.getHeaderHeight() + sheet.frozenRowsHeight;

        if (isClipAreaFrozenCols && !isSelectionInFrozenCols) return false;
        if (isClipAreaFrozenRows && !isSelectionInFrozenRows) return false;

        return true;
    }
}