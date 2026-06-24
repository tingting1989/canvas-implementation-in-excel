/**
 * 冻结层 (FrozenLayer)
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
 * zIndex = 2.5，位于 TileLayer(1) 之上、HeaderLayer(3) 之下。
 * 这保证了冻结区域的数据在主数据层之上、表头之下正确显示。
 *
 * ## 性能优化
 *
 * - 使用独立的 TileCache 与 TileLayer 隔离，避免缓存冲突
 * - 通过 _cachedFrozenColsW / _cachedFrozenRowsH 缓存冻结状态，
 *   仅在冻结范围变化时触发全量重绘
 * - 支持分页模式 (useRealRows) 的行号转换
 *
 * @module render/layers/FrozenLayer
 */

import { BaseLayer } from "../BaseLayer.js";
import { TileRenderer } from "../TileRenderer.js";
import { TileCache } from "../TileCache.js";
import { OverlayRenderer } from "../OverlayRenderer.js";

export class FrozenLayer extends BaseLayer {
    constructor() {
        super("frozen", 4);

        this.tileRenderer = new TileRenderer(new TileCache());
        this.overlayRenderer = new OverlayRenderer();

        this._cachedFrozenColsW = -1;
        this._cachedFrozenRowsH = -1;
    }

    /**
     * 标记指定单元格为脏，触发瓦片重绘
     *
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {object} rc - 行列管理器引用
     */
    markCellDirty(row, col, rc) {
        this.tileRenderer.invalidateCell(row, col, rc);
        this.markDirty();
    }

    /**
     * 标记所有冻结区域瓦片为脏
     */
    markAllDirty() {
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
     * @param {import("../../store/ReactiveStore").ReactiveStore} store - 响应式存储
     */
    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("frozen");
        this.watchForDirty("frozenOffset");
        this.watchForDirty("scroll");
        this.watchForDirty("selection");
    }

    /**
     * 检测冻结状态是否发生变化
     *
     * 对比当前 sheet 的冻结宽度和缓存的值，
     * 如果不一致则更新缓存并返回 true 表示需要重绘。
     *
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @returns {boolean} 冻结状态是否发生变化
     */
    #checkFrozenStateChange(sheet) {
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
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("../ViewportTransform.js").ViewportTransform} viewport - 视口坐标转换器
     * @param {object} options - 渲染选项
     * @param {number} options.viewW - 视口宽度
     * @param {number} options.viewH - 视口高度
     * @param {number} [options.scrollX] - 水平滚动偏移（覆盖 viewport.scrollX）
     * @param {number} [options.scrollY] - 垂直滚动偏移（覆盖 viewport.scrollY）
     * @param {boolean} [options.isPaginationActive] - 是否启用分页模式
     */
    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const frozenColsW = sheet.frozenColsWidth;
        const frozenRowsH = sheet.frozenRowsH;

        if (frozenColsW === 0 && frozenRowsH === 0) {
            return;
        }

        if (this.#checkFrozenStateChange(sheet)) {
            this.tileRenderer.invalidateAll();
            this.markDirty();
        }

        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const viewW = options.viewW;
        const viewH = options.viewH;
        const scrollX = options.scrollX ?? viewport.scrollX;
        const scrollY = options.scrollY ?? viewport.scrollY;
        const isPaginationActive = options.isPaginationActive ?? false;
        const tileOptions = isPaginationActive ? { useRealRows: true } : undefined;

        if (frozenColsW > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                frozenColsW,
                viewH - headerH,
                0,
                scrollY,
                frozenColsW + headerW,
                viewH,
                viewport,
                tileOptions,
            );
        }

        if (frozenRowsH > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                viewW - headerW,
                frozenRowsH,
                scrollX,
                0,
                viewW,
                frozenRowsH + headerH,
                viewport,
                tileOptions,
            );
        }

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
                tileOptions,
            );
        }

        this.renderCount++;
    }

    /**
     * 在裁剪区域内渲染冻结数据
     *
     * 使用 ctx.clip() 将绘制限制在指定矩形区域内，
     * 然后依次渲染：
     * 1. Tile 数据（单元格内容）
     * 2. 合并单元格边框
     * 3. 选区叠加效果
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {number} clipX - 裁剪区域左上角 X
     * @param {number} clipY - 裁剪区域左上角 Y
     * @param {number} clipW - 裁剪区域宽度
     * @param {number} clipH - 裁剪区域高度
     * @param {number} scrollX - 该区域的水平滚动偏移
     * @param {number} scrollY - 该区域的垂直滚动偏移
     * @param {number} viewW - 视口宽度（用于 overlay 计算）
     * @param {number} viewH - 视口高度（用于 overlay 计算）
     * @param {import("../ViewportTransform.js").ViewportTransform} viewport - 视口坐标转换器
     * @param {object} tileOptions - 瓦片渲染选项
     */
    #renderClippedRegion(ctx, sheet, clipX, clipY, clipW, clipH, scrollX, scrollY, viewW, viewH, viewport, tileOptions) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();

        this.tileRenderer.render(ctx, sheet, scrollX, scrollY, viewW, viewH, tileOptions);
        this.overlayRenderer.renderMerges(ctx, sheet, viewport);
        this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);

        ctx.restore();
    }
}
