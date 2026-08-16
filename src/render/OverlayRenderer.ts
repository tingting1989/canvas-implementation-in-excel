import { CONFIG } from "../constants/config.js";
import type { Sheet } from "../workbook/Sheet.js";
import type { ViewportTransform } from "./ViewportTransform.js";

/** 选区范围 */
interface SelectionRange {
    topRow: number;
    topCol: number;
    bottomRow: number;
    bottomCol: number;
}

/**
 * 叠加层渲染器 (OverlayRenderer)
 *
 * 负责绘制所有叠加在单元格数据之上的视觉效果，
 * 包括选区高亮、合并单元格边框、填充手柄等。
 *
 * 这些内容不属于基础数据，而是交互状态的视觉反馈，
 * 因此被封装为独立渲染器，供 FrozenLayer 和 SelectionLayer 复用。
 *
 * ## 渲染层次（自底向上）
 *
 * 1. **范围高亮**：浅蓝色半透明背景填充整个选区
 * 2. **行列头高亮**：选区跨越的行列头背景加深
 * 3. **活动单元格高亮**：焦点单元格单独高亮（考虑合并）
 * 4. **选区边框**：蓝色实线边框包围整个选区
 * 5. **填充手柄**：选区右下角的小方块
 *
 * ## 设计决策
 *
 * OverlayRenderer 不是 Layer 子类，而是纯渲染工具类。
 * 这样设计的原因是：
 * - FrozenLayer 和 SelectionLayer 都需要渲染选区效果
 * - 避免代码重复，遵循 DRY 原则
 * - 选区效果属于"装饰性"渲染，不需要独立的生命周期管理
 *
 * @module render/OverlayRenderer
 */
export class OverlayRenderer {
    /**
     * 渲染所有合并单元格的边框
     *
     * 遍历工作表中所有合并单元格，对可见范围内的合并区域绘制边框。
     * 使用 CONFIG.GRID_COLOR 作为边框颜色，与普通网格线保持一致。
     *
     * 性能优化：
     * - 跳过宽度为 0 的隐藏列中的合并单元格（topCol 和 bottomCol 均为隐藏列时跳过）
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param vt - 视口坐标转换器
     */
    renderMerges(ctx: CanvasRenderingContext2D, sheet: Sheet, vt: ViewportTransform): void {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;

        for (const merge of (sheet as any).getAllMerges()) {
            const { topRow, topCol, bottomRow, bottomCol } = merge;
            const rc = (sheet as any).rowColManager;

            if (rc.getColWidth(topCol) <= 0 && rc.getColWidth(bottomCol) <= 0) continue;

            const rect = vt.mergeToViewRect({ topRow, topCol, bottomRow, bottomCol });
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        }
    }

    /**
     * 渲染完整的选区叠加效果
     *
     * 按顺序执行 5 个子渲染步骤，构建完整的选区视觉效果：
     *
     * 1. **范围高亮**：浅蓝半透明背景填充选区
     * 2. **行列头高亮**：较深半透明背景填充选区对应的行列头
     * 3. **活动单元格**：焦点单元格高亮（合并单元格时高亮整个合并区域）
     * 4. **选区边框**：蓝色实线边框包围选区
     * 5. **填充手柄**：右下角小方块
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 工作表实例
     * @param vt - 视口坐标转换器
     * @param viewW - 视口宽度（预留参数，当前未使用）
     * @param viewH - 视口高度（预留参数，当前未使用）
     */
    renderSelection(ctx: CanvasRenderingContext2D, sheet: Sheet, vt: ViewportTransform, viewW: number, viewH: number): void {
        const range = (sheet as any).selection.getRange();
        const [focusRow, focusCol] = (sheet as any).selection.getFocus();

        this.#renderRangeHighlight(ctx, vt, range);
        this.#renderHeaderHighlight(ctx, vt, range);
        this.#renderActiveCell(ctx, vt, focusRow, focusCol, sheet);
        this.#renderRangeBorder(ctx, vt, range);
        this.#renderFillHandle(ctx, vt, range);
    }

    /**
     * @private 私有方法 - 渲染选区范围的高亮背景
     *
     * 使用极低透明度的浅蓝色填充整个选区矩形区域，
     * 让用户直观看到当前选区的覆盖范围。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderRangeHighlight(ctx: CanvasRenderingContext2D, vt: ViewportTransform, range: SelectionRange): void {
        const rect = vt.mergeToViewRect(range);
        ctx.fillStyle = CONFIG.RANGE_HIGHLIGHT_FILL;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    /**
     * @private 私有方法 - 渲染选区跨越的行列头高亮背景
     *
     * 在列表头区域绘制水平条带（选区起始列到结束列），
     * 在行号头区域绘制垂直条带（选区起始行到结束行），
     * 透明度比范围高亮更深，以便与单元格区域区分。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderHeaderHighlight(ctx: CanvasRenderingContext2D, vt: ViewportTransform, range: SelectionRange): void {
        ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_FILL;

        const colX1 = vt.colToViewX(range.topCol);
        const colX2 = vt.colRightToViewX(range.bottomCol);
        ctx.fillRect(colX1, 0, colX2 - colX1, vt.headerH);

        const rowY1 = vt.rowToViewY(range.topRow);
        const rowY2 = vt.rowBottomToViewY(range.bottomRow);
        ctx.fillRect(0, rowY1, vt.headerW, rowY2 - rowY1);
    }

    /**
     * @private 私有方法 - 渲染活动单元格（焦点单元格）的高亮
     *
     * 如果焦点单元格属于某个合并单元格，则高亮整个合并区域；
     * 否则只高亮单个单元格。透明度介于范围高亮和行列头高亮之间。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param row - 焦点单元格行索引
     * @param col - 焦点单元格列索引
     * @param sheet - 工作表实例
     */
    #renderActiveCell(ctx: CanvasRenderingContext2D, vt: ViewportTransform, row: number, col: number, sheet: Sheet): void {
        const merge = (sheet as any).getMerge(row, col);

        let rect: { x: number; y: number; w: number; h: number };
        if (merge) {
            rect = vt.mergeToViewRect(merge);
        } else {
            rect = vt.cellToViewRect(row, col);
        }

        ctx.fillStyle = CONFIG.ACTIVE_CELL_HIGHLIGHT_FILL;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    /**
     * @private 私有方法 - 渲染选区的边框
     *
     * 使用蓝色实线绘制选区外边框，绘制完成后恢复默认线宽，
     * 避免影响后续绘制操作。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderRangeBorder(ctx: CanvasRenderingContext2D, vt: ViewportTransform, range: SelectionRange): void {
        const rect = vt.mergeToViewRect(range);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
    }

    /**
     * @private 私有方法 - 渲染选区右下角的填充手柄
     *
     * 一个小方块，位于选区右下角外侧。
     * 用户可拖拽此手柄进行自动填充操作（向下/向右拖拽复制数据）。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderFillHandle(ctx: CanvasRenderingContext2D, vt: ViewportTransform, range: SelectionRange): void {
        const x2 = vt.colRightToViewX(range.bottomCol);
        const y2 = vt.rowBottomToViewY(range.bottomRow);

        ctx.fillStyle = CONFIG.SELECTION_COLOR;
        const hs = CONFIG.FILL_HANDLE_SIZE;
        ctx.fillRect(x2 - hs, y2 - hs, hs, hs);
    }
}
