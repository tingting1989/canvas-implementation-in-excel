import { CONFIG } from "../constants/config";
import { ResizeHandleRenderer } from "./ResizeHandleRenderer.js";
import { DragIndicatorRenderer } from "./DragIndicatorRenderer.js";

/** 拖拽源行头/列头的半透明高亮色 */
const MOVE_SOURCE_FILL = "rgba(76, 139, 245, 0.3)";
/** 普通表头文字颜色 */
const HEADER_TEXT_COLOR = "#555";
/** 列头文字水平内边距（px） */
const HEADER_COL_PADDING = 4;
/** 行头文字水平内边距（px） */
const HEADER_ROW_PADDING = 6;

/**
 * 表头渲染器（纯绘制）
 *
 * 负责绘制：
 * - 列头区域（顶部横条，含嵌套多层表头支持）
 * - 行头区域（左侧竖条）
 * - 左上角交叉区域
 *
 * 调整手柄和拖拽指示器已分离为独立子渲染器：
 * - {@link ResizeHandleRenderer} — 列宽/行高调整虚线
 * - {@link DragIndicatorRenderer} — 拖拽幽灵和插入指示线
 *
 * 渲染层次（从底到顶）：
 * 1. 列头背景 + 文字
 * 2. 行头背景 + 文字
 * 3. 左上角
 * 4. 调整线（委托 ResizeHandleRenderer）
 * 5. 移动指示器（委托 DragIndicatorRenderer）
 */
export class HeaderRenderer {
    constructor() {
        /** 调整手柄渲染器 */
        this.resizeRenderer = new ResizeHandleRenderer();
        /** 拖拽指示器渲染器 */
        this.dragRenderer = new DragIndicatorRenderer();
    }

    /**
     * 主渲染入口
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} scrollX - 水平滚动偏移
     * @param {number} scrollY - 垂直滚动偏移
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     */
    render(ctx, sheet, scrollX, scrollY, viewW, viewH) {
        const range = sheet.selection.getRange();

        this.#renderColumnHeaders(ctx, sheet, scrollX, viewW, range);
        this.#renderRowHeaders(ctx, sheet, scrollY, viewH, range);
        this.#renderCorner(ctx, sheet, range);
        this.resizeRenderer.render(ctx, viewW, viewH);
        this.dragRenderer.renderColumnMoveIndicator(ctx, sheet, scrollX, viewW, viewH);
        this.dragRenderer.renderRowMoveIndicator(ctx, sheet, scrollY, viewW, viewH);
    }

    /**
     * 渲染列头区域
     * - 支持嵌套表头：多层渲染，每层有独立的 Y 偏移
     * - 嵌套表头中跨列单元格使用 colspan 合并绘制
     * - 背景填充 → 逐列绘制（跳过隐藏列）→ 选区高亮底线
     * - 拖拽中时源列显示蓝色半透明高亮，隐藏选区底线
     */
    #renderColumnHeaders(ctx, sheet, scrollX, viewW, range) {
        const rc = sheet.rowColManager;
        const headerW = sheet.getHeaderWidth();
        const rowH = CONFIG.HEADER_HEIGHT;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);

        const nestedCount = sheet.getNestedHeaderRowCount();
        const totalHeaderH = sheet.getHeaderHeight();

        // 填充整个列头区域背景
        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(headerW, 0, viewW - headerW, totalHeaderH);

        const sc = rc.colAt(scrollX);
        const ec = rc.colAt(scrollX + viewW - headerW) + 1;

        if (nestedCount > 0) {
            this.#renderNestedColumnHeaders(ctx, sheet, rc, sc, ec, headerW, rowH, scrollX, headerFont, defaultStyle);
        } else {
            for (let c = sc; c < ec; c++) {
                const w = rc.getColWidth(c);
                if (w <= 0) continue;

                const x = headerW + rc.getColX(c) - scrollX;
                const isSource = this.dragRenderer.isColumnSource(c);
                const highlighted = c >= range.topCol && c <= range.bottomCol;

                this.#drawHeaderCell(ctx, x, 0, w, rowH, isSource, highlighted, defaultStyle);
                this.#drawHeaderText(ctx, sheet.getColHeader(c), x + HEADER_COL_PADDING, rowH - 8, null, headerFont);
                this.#drawSeparator(ctx, x + w, 0, x + w, rowH);
            }
        }

        // 最底层表头下方的选区高亮线
        if (!this.dragRenderer.hasColumnMove()) {
            this.#drawSelectionLine(
                ctx,
                headerW + rc.getColX(range.topCol) - scrollX,
                totalHeaderH,
                rc.getColX(range.bottomCol) + rc.getColWidth(range.bottomCol) - rc.getColX(range.topCol),
                true,
            );
        }
    }

    /**
     * 渲染嵌套多层列头
     */
    #renderNestedColumnHeaders(ctx, sheet, rc, sc, ec, headerW, rowH, scrollX, headerFont, defaultStyle) {
        const nestedCount = sheet.getNestedHeaderRowCount();

        for (let layerIdx = 0; layerIdx < nestedCount; layerIdx++) {
            const layerY = layerIdx * rowH;

            const row = sheet.nestedHeaders[layerIdx];
            if (!Array.isArray(row)) continue;

            let consumed = 0;
            for (let i = 0; i < row.length; i++) {
                const item = row[i];
                const label = typeof item === "string" ? item : (item?.label ?? "");
                const colspan = item && typeof item === "object" && item.colspan ? item.colspan : 1;

                const startCol = consumed;
                const endCol = consumed + colspan - 1;
                consumed += colspan;

                if (endCol < sc || startCol > ec) continue;

                let visibleStartCol = startCol;
                while (visibleStartCol <= endCol && rc.getColWidth(visibleStartCol) <= 0) {
                    visibleStartCol++;
                }
                if (visibleStartCol > endCol) continue;

                const x = headerW + rc.getColX(Math.max(startCol, sc)) - scrollX;
                const totalW = rc.getColX(Math.min(endCol, ec)) + rc.getColWidth(Math.min(endCol, ec)) - rc.getColX(Math.max(startCol, sc));

                if (totalW <= 0) continue;

                const isSource = this.dragRenderer.isColumnSource(startCol);
                const highlighted = false;

                this.#drawHeaderCell(ctx, x, layerY, totalW, rowH, isSource, highlighted, defaultStyle);

                if (label) {
                    this.#drawHeaderText(ctx, label, x + HEADER_COL_PADDING, layerY + rowH - 8, null, headerFont);
                }

                const rightEdge = Math.min(x + totalW, headerW + rc.getColX(Math.min(endCol, ec)) + rc.getColWidth(Math.min(endCol, ec)) - scrollX);
                this.#drawSeparator(ctx, rightEdge, layerY, rightEdge, layerY + rowH);
            }

            if (layerIdx < nestedCount - 1) {
                this.#drawSeparator(
                    ctx,
                    headerW + rc.getColX(sc) - scrollX,
                    layerY + rowH,
                    headerW + rc.getColX(ec - 1) + rc.getColWidth(ec - 1) - scrollX,
                    layerY + rowH,
                );
            }
        }
    }

    /**
     * 渲染行头区域
     * - 背景填充 → 逐行绘制 → 选区高亮右线
     * - 拖拽中时源行显示蓝色半透明高亮，隐藏选区右线
     */
    #renderRowHeaders(ctx, sheet, scrollY, viewH, range) {
        const rc = sheet.rowColManager;
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, headerH, headerW, viewH - headerH);

        const sr = rc.rowAt(scrollY);
        const er = rc.rowAt(scrollY + viewH - headerH) + 1;

        for (let r = sr; r < er; r++) {
            const y = headerH + rc.getRowY(r) - scrollY;
            const h = rc.getRowHeight(r);
            if (h <= 0) continue;

            const isSource = this.dragRenderer.isRowSource(r);
            const highlighted = r >= range.topRow && r <= range.bottomRow;

            this.#drawHeaderCell(ctx, 0, y, headerW, h, isSource, highlighted, defaultStyle);

            const textMaxW = headerW - HEADER_ROW_PADDING * 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(HEADER_ROW_PADDING, y, textMaxW, h);
            ctx.clip();
            this.#drawHeaderText(ctx, sheet.getRowHeader(sheet.toRealRow(r)), HEADER_ROW_PADDING, y + h / 2 + 4, null, headerFont, textMaxW);
            ctx.restore();

            this.#drawSeparator(ctx, 0, y + h, headerW, y + h);
        }

        if (!this.dragRenderer.hasRowMove()) {
            this.#drawSelectionLine(
                ctx,
                headerW,
                headerH + rc.getRowY(range.topRow) - scrollY,
                rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow) - rc.getRowY(range.topRow),
                false,
            );
        }
    }

    /**
     * 渲染左上角交叉区域
     * 全选时高亮，高度跟随表头总高度（支持嵌套表头）
     */
    #renderCorner(ctx, sheet, range) {
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const allSelected = range.topRow === 0 && range.topCol === 0;

        ctx.fillStyle = allSelected ? CONFIG.HEADER_HIGHLIGHT_BG : CONFIG.HEADER_BG;
        ctx.fillRect(0, 0, headerW, headerH);

        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.strokeRect(0, 0, headerW, headerH);
    }

    // ─── 通用绘制工具方法 ──────────────────────────────────

    /**
     * 绘制单个表头单元格背景
     * 优先级：拖拽源高亮 > 选区高亮 > 默认
     */
    #drawHeaderCell(ctx, x, y, w, h, isSource, highlighted, defaultStyle) {
        if (isSource) {
            ctx.fillStyle = MOVE_SOURCE_FILL;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (highlighted) {
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else {
            ctx.fillStyle = defaultStyle?.color || HEADER_TEXT_COLOR;
        }
    }

    /**
     * 绘制表头文字，支持溢出截断
     */
    #drawHeaderText(ctx, text, x, y, color, font, maxWidth) {
        ctx.font = font || "12px sans-serif";
        ctx.textAlign = "left";
        if (color) ctx.fillStyle = color;

        if (maxWidth && ctx.measureText(text).width > maxWidth) {
            const ellipsis = "...";
            let truncated = text;
            while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
                truncated = truncated.slice(0, -1);
            }
            ctx.fillText(truncated + ellipsis, x, y);
        } else {
            ctx.fillText(text, x, y);
        }
    }

    /** 根据默认样式构建表头字体 CSS 字符串 */
    #buildHeaderFont(defaultStyle) {
        const fontStyle = defaultStyle?.fontStyle === "italic" ? "italic" : "";
        const fontWeight = defaultStyle?.fontWeight === "bold" ? "bold" : "";
        const fontSize = defaultStyle?.fontSize || 12;
        const fontFamily = defaultStyle?.fontFamily || "sans-serif";
        return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].filter(Boolean).join(" ");
    }

    /** 绘制分隔线 */
    #drawSeparator(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /** 绘制选区高亮线 */
    #drawSelectionLine(ctx, origin, origin2, length, horizontal) {
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (horizontal) {
            ctx.moveTo(origin, origin2);
            ctx.lineTo(origin + length, origin2);
        } else {
            ctx.moveTo(origin, origin2);
            ctx.lineTo(origin, origin2 + length);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
    }
}