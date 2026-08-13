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

import { CONFIG } from "../constants/config.js";

/**
 * 叠加层渲染器
 *
 * 纯渲染工具类，无状态、无生命周期。
 * 所有方法均为无副作用的绘制操作，由调用方（Layer）负责管理调用时机和上下文状态。
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
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     */
    renderMerges(ctx, sheet, vt) {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;

        for (const merge of sheet.getAllMerges()) {
            const { topRow, topCol, bottomRow, bottomCol } = merge;
            const rc = sheet.rowColManager;

            // 跳过完全隐藏的合并单元格（起始列和结束列宽度均为 0）
            if (rc.getColWidth(topCol) <= 0 && rc.getColWidth(bottomCol) <= 0) continue;

            // 将合并区域的数据坐标转换为视口坐标，绘制边框
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
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} viewW - 视口宽度（预留参数，当前未使用）
     * @param {number} viewH - 视口高度（预留参数，当前未使用）
     */
    renderSelection(ctx, sheet, vt, viewW, viewH) {
        const range = sheet.selection.getRange();
        const [focusRow, focusCol] = sheet.selection.getFocus();

        // 步骤 1：范围高亮
        this.#renderRangeHighlight(ctx, vt, range);
        // 步骤 2：行列头高亮
        this.#renderHeaderHighlight(ctx, vt, range);
        // 步骤 3：活动单元格高亮
        this.#renderActiveCell(ctx, vt, focusRow, focusCol, sheet);
        // 步骤 4：选区边框
        this.#renderRangeBorder(ctx, vt, range);
        // 步骤 5：填充手柄
        this.#renderFillHandle(ctx, vt, range);
    }

    /**
     * 渲染选区范围的高亮背景
     *
     * 使用极低透明度的浅蓝色填充整个选区矩形区域，
     * 让用户直观看到当前选区的覆盖范围。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {Object} range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderRangeHighlight(ctx, vt, range) {
        const rect = vt.mergeToViewRect(range);
        ctx.fillStyle = CONFIG.RANGE_HIGHLIGHT_FILL;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    /**
     * 渲染选区跨越的行列头高亮背景
     *
     * 在列表头区域绘制水平条带（选区起始列到结束列），
     * 在行号头区域绘制垂直条带（选区起始行到结束行），
     * 透明度比范围高亮更深，以便与单元格区域区分。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {Object} range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderHeaderHighlight(ctx, vt, range) {
        ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_FILL;

        // 列表头区域：水平条带，从选区起始列到结束列
        const colX1 = vt.colToViewX(range.topCol);
        const colX2 = vt.colRightToViewX(range.bottomCol);
        ctx.fillRect(colX1, 0, colX2 - colX1, vt.headerH);

        // 行号头区域：垂直条带，从选区起始行到结束行
        const rowY1 = vt.rowToViewY(range.topRow);
        const rowY2 = vt.rowBottomToViewY(range.bottomRow);
        ctx.fillRect(0, rowY1, vt.headerW, rowY2 - rowY1);
    }

    /**
     * 渲染活动单元格（焦点单元格）的高亮
     *
     * 如果焦点单元格属于某个合并单元格，则高亮整个合并区域；
     * 否则只高亮单个单元格。透明度介于范围高亮和行列头高亮之间。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} row - 焦点单元格行索引
     * @param {number} col - 焦点单元格列索引
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表实例
     */
    #renderActiveCell(ctx, vt, row, col, sheet) {
        // 检查焦点单元格是否属于合并单元格
        const merge = sheet.getMerge(row, col);

        let rect;
        if (merge) {
            // 合并单元格：高亮整个合并区域
            rect = vt.mergeToViewRect(merge);
        } else {
            // 普通单元格：高亮单个单元格
            rect = vt.cellToViewRect(row, col);
        }

        ctx.fillStyle = CONFIG.ACTIVE_CELL_HIGHLIGHT_FILL;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    /**
     * 渲染选区的边框
     *
     * 使用蓝色实线绘制选区外边框，绘制完成后恢复默认线宽，
     * 避免影响后续绘制操作。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {Object} range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderRangeBorder(ctx, vt, range) {
        const rect = vt.mergeToViewRect(range);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        // 恢复默认网格线宽，防止影响后续绘制
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
    }

    /**
     * 渲染选区右下角的填充手柄
     *
     * 一个小方块，位于选区右下角外侧。
     * 用户可拖拽此手柄进行自动填充操作（向下/向右拖拽复制数据）。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {Object} range - 选区范围 { topRow, topCol, bottomRow, bottomCol }
     */
    #renderFillHandle(ctx, vt, range) {
        // 选区右下角的视口坐标
        const x2 = vt.colRightToViewX(range.bottomCol);
        const y2 = vt.rowBottomToViewY(range.bottomRow);

        ctx.fillStyle = CONFIG.SELECTION_COLOR;
        const hs = CONFIG.FILL_HANDLE_SIZE;
        // 手柄位于右下角内侧，向左上方延伸 hs 像素
        ctx.fillRect(x2 - hs, y2 - hs, hs, hs);
    }
}
