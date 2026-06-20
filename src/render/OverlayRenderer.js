import { CONFIG } from "../constants/config";
import { HIT_TYPE } from "../constants/hitType";

/**
 * 叠加层渲染器
 * 负责绘制选区高亮、合并单元格边框、填充手柄、拖拽参考线等叠加效果
 * 这些内容绘制在 Tile 数据层之上、表头之下
 */
export class OverlayRenderer {
    /** 拖拽调整行高/列宽时的参考线状态 */
    #resizeLine = null;

    /**
     * 设置拖拽参考线
     *
     * @param {string} type - HIT_TYPE.COL_RESIZE 或 HIT_TYPE.ROW_RESIZE
     * @param {number} position - 参考线在视口中的像素位置
     */
    setResizeLine(type, position) {
        this.#resizeLine = { type, position };
    }

    /** 清除拖拽参考线 */
    clearResizeLine() {
        this.#resizeLine = null;
    }

    /**
     * 渲染所有合并单元格的边框
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     */
    renderMerges(ctx, sheet, vt) {
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;

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

        ctx.lineWidth = 1;
    }

    /**
     * 渲染选区叠加层（完整流程）
     * 1. 范围高亮（浅蓝色背景）
     * 2. 行列头高亮
     * 3. 活动单元格高亮
     * 4. 选区边框
     * 5. 填充手柄
     * 6. 拖拽参考线（如有）
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} viewW - 视口宽度
     * @param {number} viewH - 视口高度
     */
    renderSelection(ctx, sheet, vt, viewW, viewH) {
        const range = sheet.selection.getRange();
        const [focusRow, focusCol] = sheet.selection.getFocus();

        this.#renderRangeHighlight(ctx, vt, range);
        this.#renderHeaderHighlight(ctx, vt, range);
        this.#renderActiveCell(ctx, vt, focusRow, focusCol, sheet);
        this.#renderRangeBorder(ctx, vt, range);
        this.#renderFillHandle(ctx, vt, range);

        if (this.#resizeLine) {
            this.#renderResizeLine(ctx, this.#resizeLine, vt, viewW, viewH);
        }
    }

    #renderRangeHighlight(ctx, vt, range) {
        const rect = vt.mergeToViewRect(range);
        ctx.fillStyle = "rgba(76, 139, 245, 0.08)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    #renderHeaderHighlight(ctx, vt, range) {
        ctx.fillStyle = "rgba(76, 139, 245, 0.18)";

        const colX1 = vt.colToViewX(range.topCol);
        const colX2 = vt.colRightToViewX(range.bottomCol);
        ctx.fillRect(colX1, 0, colX2 - colX1, vt.headerH);

        const rowY1 = vt.rowToViewY(range.topRow);
        const rowY2 = vt.rowBottomToViewY(range.bottomRow);
        ctx.fillRect(0, rowY1, vt.headerW, rowY2 - rowY1);
    }

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

    #renderRangeBorder(ctx, vt, range) {
        const rect = vt.mergeToViewRect(range);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.lineWidth = 1;
    }

    #renderFillHandle(ctx, vt, range) {
        const x2 = vt.colRightToViewX(range.bottomCol);
        const y2 = vt.rowBottomToViewY(range.bottomRow);

        ctx.fillStyle = CONFIG.SELECTION_COLOR;
        ctx.fillRect(x2 - 5, y2 - 5, 5, 5);
    }

    /**
     * 渲染拖拽调整行高/列宽时的参考线（蓝色虚线）
     */
    #renderResizeLine(ctx, line, vt, viewW, viewH) {
        ctx.save();
        ctx.strokeStyle = "#4c8bf5";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);

        if (line.type === HIT_TYPE.COL_RESIZE) {
            const x = vt.headerW + line.position;
            ctx.beginPath();
            ctx.moveTo(x, vt.headerH);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        } else if (line.type === HIT_TYPE.ROW_RESIZE) {
            const y = vt.headerH + line.position;
            ctx.beginPath();
            ctx.moveTo(vt.headerW, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }
}