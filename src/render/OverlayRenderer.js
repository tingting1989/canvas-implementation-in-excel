/**
 * 叠加层渲染器 (OverlayRenderer)
 *
 * 负责绘制所有叠加在单元格数据之上的视觉效果，
 * 包括选区高亮、合并单元格边框、填充手柄、拖拽参考线等。
 *
 * 这些内容不属于基础数据，而是交互状态的视觉反馈，
 * 因此被封装为独立渲染器，供 FrozenLayer 和 OverlayLayer 复用。
 *
 * ## 渲染层次（自底向上）
 *
 * 1. **范围高亮**：浅蓝色半透明背景填充整个选区
 * 2. **行列头高亮**：选区跨越的行列头背景加深
 * 3. **活动单元格高亮**：焦点单元格单独高亮（考虑合并）
 * 4. **选区边框**：蓝色实线边框包围整个选区
 * 5. **填充手柄**：选区右下角的 5×5 小方块
 * 6. **拖拽参考线**：调整列宽/行高时的蓝色虚线
 *
 * ## 设计决策
 *
 * OverlayRenderer 不是 Layer 子类，而是纯渲染工具类。
 * 这样设计的原因是：
 * - FrozenLayer 和 OverlayLayer 都需要渲染选区效果
 * - 避免代码重复，遵循 DRY 原则
 * - 选区效果属于"装饰性"渲染，不需要独立的生命周期管理
 *
 * @module render/OverlayRenderer
 */

import { CONFIG } from "../constants/config";

export class OverlayRenderer {
    /**
     * 渲染所有合并单元格的边框
     *
     * 遍历工作表中所有合并单元格，对可见范围内的合并单元绘制边框。
     * 使用 CONFIG.SELECTION_COLOR 作为边框颜色，线宽 2px。
     *
     * 性能优化：
     * - 分页模式下跳过不在当前页的合并单元格
     * - 跳过宽度为 0 的隐藏列中的合并单元格
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     */
    renderMerges(ctx, sheet, vt) {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = 1;

        const pageStart = sheet.rowColManager.pageStartRow;
        const pageEnd = sheet.rowColManager.pageEndRow;

        for (const merge of sheet.getAllMerges()) {
            const { topRow, topCol, bottomRow, bottomCol } = merge;
            const rc = sheet.rowColManager;

            if (pageStart >= 0 && pageEnd > pageStart) {
                if (bottomRow < pageStart || topRow >= pageEnd) continue;
            }

            if (rc.getColWidth(topCol) <= 0 && rc.getColWidth(bottomCol) <= 0) continue;

            const pageTopRow = sheet.toPageRow(topRow);
            const pageBottomRow = sheet.toPageRow(bottomRow);

            const rect = vt.mergeToViewRect({ topRow: pageTopRow, topCol, bottomRow: pageBottomRow, bottomCol });
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        }
    }

    /**
     * 渲染完整的选区叠加效果
     *
     * 按顺序执行 6 个子渲染步骤，构建完整的选区视觉效果：
     *
     * 1. **范围高亮**：rgba(76,139,245,0.08) 浅蓝背景
     * 2. **行列头高亮**：rgba(76,139,245,0.18) 较深的行列头背景
     * 3. **活动单元格**：rgba(76,139,245,0.12) 焦点单元格高亮
     * 4. **选区边框**：2px 蓝色实线边框
     * 5. **填充手柄**：右下角 5×5 蓝色小方块
     * 6. **拖拽参考线**：[4,3] 虚线模式的蓝色参考线（如有）
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} viewW - 视口宽度（用于计算参考线范围）
     * @param {number} viewH - 视口高度（用于计算参考线范围）
     */
    renderSelection(ctx, sheet, vt, viewW, viewH) {
        const range = sheet.selection.getRange();
        const [focusRow, focusCol] = sheet.selection.getFocus();

        this.#renderRangeHighlight(ctx, vt, range);
        this.#renderHeaderHighlight(ctx, vt, range);
        this.#renderActiveCell(ctx, vt, focusRow, focusCol, sheet);
        this.#renderRangeBorder(ctx, vt, range);
        this.#renderFillHandle(ctx, vt, range);
    }

    /**
     * 渲染选区范围的高亮背景
     *
     * 使用极低透明度的浅蓝色填充整个选区矩形区域
     */
    #renderRangeHighlight(ctx, vt, range) {
        const rect = vt.mergeToViewRect(range);
        ctx.fillStyle = "rgba(76, 139, 245, 0.08)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    /**
     * 渲染选区跨越的行列头高亮背景
     *
     * 列标头区域：选区起始列到结束列的水平条带
     * 行号头区域：选区起始行到结束行的垂直条带
     * 透明度比范围高亮更深，以便区分
     */
    #renderHeaderHighlight(ctx, vt, range) {
        ctx.fillStyle = "rgba(76, 139, 245, 0.18)";

        const colX1 = vt.colToViewX(range.topCol);
        const colX2 = vt.colRightToViewX(range.bottomCol);
        ctx.fillRect(colX1, 0, colX2 - colX1, vt.headerH);

        const rowY1 = vt.rowToViewY(range.topRow);
        const rowY2 = vt.rowBottomToViewY(range.bottomRow);
        ctx.fillRect(0, rowY1, vt.headerW, rowY2 - rowY1);
    }

    /**
     * 渲染活动单元格（焦点单元格）的高亮
     *
     * 如果焦点单元格属于某个合并单元格，则高亮整个合并区域；
     * 否则只高亮单个单元格
     */
    #renderActiveCell(ctx, vt, row, col, sheet) {
        const merge = sheet.getMerge(row, col);

        let rect;
        if (merge) {
            rect = vt.mergeToViewRect(merge);
        } else {
            rect = vt.cellToViewRect(row, col);
        }

        ctx.fillStyle = "rgba(76, 139, 245, 0.12)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    /**
     * 渲染选区的边框
     *
     * 使用 2px 宽度的蓝色实线绘制选区外边框
     */
    #renderRangeBorder(ctx, vt, range) {
        const rect = vt.mergeToViewRect(range);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.lineWidth = 1;
    }

    /**
     * 渲染选区右下角的填充手柄
     *
     * 5×5 像素的蓝色小方块，位于选区右下角外侧
     * 用户可拖拽此手柄进行填充操作
     */
    #renderFillHandle(ctx, vt, range) {
        const x2 = vt.colRightToViewX(range.bottomCol);
        const y2 = vt.rowBottomToViewY(range.bottomRow);

        ctx.fillStyle = CONFIG.SELECTION_COLOR;
        ctx.fillRect(x2 - 5, y2 - 5, 5, 5);
    }
}