import { CONFIG } from "../core/constants.js";

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
     * @param {string} type - "col-resize" 或 "row-resize"
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
     * @param {number} scrollX - 水平滚动偏移
     * @param {number} scrollY - 垂直滚动偏移
     */
    renderMerges(ctx, sheet, scrollX, scrollY) {
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;

        for (const merge of sheet.getAllMerges()) {
            const { topRow, topCol, bottomRow, bottomCol } = merge;
            const rc = sheet.rowColManager;
            const headerW = CONFIG.HEADER_WIDTH;
            const headerH = CONFIG.HEADER_HEIGHT;

            const x1 = rc.getColX(topCol);
            const y1 = rc.getRowY(topRow);
            const x2 = rc.getColX(bottomCol) + rc.getColWidth(bottomCol);
            const y2 = rc.getRowY(bottomRow) + rc.getRowHeight(bottomRow);

            const drawX = headerW + x1 - scrollX;
            const drawY = headerH + y1 - scrollY;
            const drawW = x2 - x1;
            const drawH = y2 - y1;

            ctx.strokeRect(drawX, drawY, drawW, drawH);
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
     * @param {number} scrollX - 水平滚动偏移
     * @param {number} scrollY - 垂直滚动偏移
     * @param {number} viewW - 视口宽度
     * @param {number} viewH - 视口高度
     */
    renderSelection(ctx, sheet, scrollX, scrollY, viewW, viewH) {
        const rc = sheet.rowColManager;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const range = sheet.selection.getRange();
        const [focusRow, focusCol] = sheet.selection.getFocus();

        this.#renderRangeHighlight(ctx, rc, range, scrollX, scrollY, headerW, headerH);
        this.#renderHeaderHighlight(ctx, rc, range, scrollX, scrollY, headerW, headerH, viewW, viewH);
        this.#renderActiveCell(ctx, rc, focusRow, focusCol, scrollX, scrollY, headerW, headerH, sheet);
        this.#renderRangeBorder(ctx, rc, range, scrollX, scrollY, headerW, headerH);
        this.#renderFillHandle(ctx, rc, range, scrollX, scrollY, headerW, headerH);

        if (this.#resizeLine) {
            this.#renderResizeLine(ctx, this.#resizeLine, headerW, headerH, viewW, viewH);
        }
    }

    /**
     * 渲染选区范围高亮（浅蓝色半透明背景）
     */
    #renderRangeHighlight(ctx, rc, range, scrollX, scrollY, headerW, headerH) {
        const x1 = rc.getColX(range.topCol);
        const y1 = rc.getRowY(range.topRow);
        const x2 = rc.getColX(range.bottomCol) + rc.getColWidth(range.bottomCol);
        const y2 = rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow);

        const drawX = headerW + x1 - scrollX;
        const drawY = headerH + y1 - scrollY;
        const drawW = x2 - x1;
        const drawH = y2 - y1;

        ctx.fillStyle = "rgba(76, 139, 245, 0.08)";
        ctx.fillRect(drawX, drawY, drawW, drawH);
    }

    /**
     * 渲染行列头高亮
     * 选区对应的列头和行头区域显示蓝色高亮
     */
    #renderHeaderHighlight(ctx, rc, range, scrollX, scrollY, headerW, headerH, viewW, viewH) {
        ctx.fillStyle = "rgba(76, 139, 245, 0.18)";

        /* 列头高亮 */
        const colX1 = rc.getColX(range.topCol) - scrollX;
        const colX2 = rc.getColX(range.bottomCol) + rc.getColWidth(range.bottomCol) - scrollX;
        ctx.fillRect(headerW + colX1, 0, colX2 - colX1, headerH);

        /* 行头高亮 */
        const rowY1 = rc.getRowY(range.topRow) - scrollY;
        const rowY2 = rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow) - scrollY;
        ctx.fillRect(0, headerH + rowY1, headerW, rowY2 - rowY1);
    }

    /**
     * 渲染活动单元格（焦点单元格）高亮
     * 活动单元格比选区背景色稍深，便于区分
     */
    #renderActiveCell(ctx, rc, row, col, scrollX, scrollY, headerW, headerH, sheet) {
        const merge = sheet.getMerge(row, col);
        const actualRow = merge ? merge.topRow : row;
        const actualCol = merge ? merge.topCol : col;

        let x, y, w, h;
        if (merge) {
            x = rc.getColX(merge.topCol);
            y = rc.getRowY(merge.topRow);
            w = rc.getColX(merge.bottomCol) + rc.getColWidth(merge.bottomCol) - x;
            h = rc.getRowY(merge.bottomRow) + rc.getRowHeight(merge.bottomRow) - y;
        } else {
            x = rc.getColX(actualCol);
            y = rc.getRowY(actualRow);
            w = rc.getColWidth(actualCol);
            h = rc.getRowHeight(actualRow);
        }

        const drawX = headerW + x - scrollX;
        const drawY = headerH + y - scrollY;

        ctx.fillStyle = "rgba(76, 139, 245, 0.12)";
        ctx.fillRect(drawX, drawY, w, h);
    }

    /**
     * 渲染选区边框（蓝色粗线）
     */
    #renderRangeBorder(ctx, rc, range, scrollX, scrollY, headerW, headerH) {
        const x1 = rc.getColX(range.topCol);
        const y1 = rc.getRowY(range.topRow);
        const x2 = rc.getColX(range.bottomCol) + rc.getColWidth(range.bottomCol);
        const y2 = rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow);

        const drawX = headerW + x1 - scrollX;
        const drawY = headerH + y1 - scrollY;
        const drawW = x2 - x1;
        const drawH = y2 - y1;

        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, drawW, drawH);
        ctx.lineWidth = 1;
    }

    /**
     * 渲染填充手柄（Fill Handle）
     * 选区右下角的绿色小方块，拖拽可触发自动填充
     */
    #renderFillHandle(ctx, rc, range, scrollX, scrollY, headerW, headerH) {
        const x2 = rc.getColX(range.bottomCol) + rc.getColWidth(range.bottomCol);
        const y2 = rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow);

        const drawX = headerW + x2 - scrollX;
        const drawY = headerH + y2 - scrollY;

        ctx.fillStyle = CONFIG.SELECTION_COLOR;
        ctx.fillRect(drawX - 5, drawY - 5, 5, 5);
    }

    /**
     * 渲染拖拽调整行高/列宽时的参考线（蓝色虚线）
     */
    #renderResizeLine(ctx, line, headerW, headerH, viewW, viewH) {
        ctx.save();
        ctx.strokeStyle = "#4c8bf5";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);

        if (line.type === "col-resize") {
            const x = headerW + line.position;
            ctx.beginPath();
            ctx.moveTo(x, headerH);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        } else if (line.type === "row-resize") {
            const y = headerH + line.position;
            ctx.beginPath();
            ctx.moveTo(headerW, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }
}