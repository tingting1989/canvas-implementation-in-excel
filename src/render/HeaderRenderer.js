import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../core/ErrorHandler.js";

import { CONFIG } from "../constants/config";
import { isObject, isString } from "../utils/utils.js";

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
 * 调整手柄和拖拽指示器已分离为独立 Layer：
 * - {@link InteractionLayer} — 列宽/行高调整虚线
 * - {@link SelectionLayer} — 拖拽幽灵和插入指示线
 *
 * 渲染层次（从底到顶）：
 * 1. 列头背景 + 文字
 * 2. 行头背景 + 文字
 * 3. 左上角
 */
export class HeaderRenderer {
    constructor() {
        this.#columnHeaderRenderers = [];
    }

    /** @type {Array<Function>} 列头扩展渲染器列表 */
    #columnHeaderRenderers;

    /**
     * 注册列头扩展渲染器（用于插件绘制自定义UI）
     *
     * @param {Function} renderer - 渲染函数 (ctx, colIndex, x, y, width, height) => void
     */
    registerColumnHeaderRenderer(renderer) {
        if (typeof renderer === "function") {
            this.#columnHeaderRenderers.push(renderer);
        }
    }

    /**
     * 移除列头扩展渲染器
     *
     * @param {Function} renderer - 要移除的渲染函数引用
     */
    unregisterColumnHeaderRenderer(renderer) {
        const index = this.#columnHeaderRenderers.indexOf(renderer);
        if (index > -1) {
            this.#columnHeaderRenderers.splice(index, 1);
        }
    }

    /**
     * 主渲染入口
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     */
    render(ctx, sheet, vt, viewW, viewH, dragIndicator = null) {
        this._dragIndicator = dragIndicator;
        const range = sheet.selection.getRange();

        this.#renderColumnHeaders(ctx, sheet, vt, viewW, range);
        this.#renderRowHeaders(ctx, sheet, vt, viewH, range);
        this.#renderCorner(ctx, vt, range);
    }

    /**
     * 渲染列头区域
     * - 支持嵌套表头：多层渲染，每层有独立的 Y 偏移
     * - 嵌套表头中跨列单元格使用 colspan 合并绘制
     * - 背景填充 → 逐列绘制（跳过隐藏列）→ 选区高亮底线
     * - 拖拽中时源列显示蓝色半透明高亮，隐藏选区底线
     */
    #renderColumnHeaders(ctx, sheet, vt, viewW, range) {
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const rowH = CONFIG.HEADER_HEIGHT;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);

        const nestedCount = sheet.getNestedHeaderRowCount();
        const totalHeaderH = vt.headerH;
        const frozenColsW = vt.frozenColsW;
        const fixedCols = vt.fixedCols;
        const scrollX = vt.scrollX;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(headerW, 0, viewW - headerW, totalHeaderH);

        this.#renderHeaderRegion(ctx, sheet, {
            vt,
            rc,
            clipX: headerW + frozenColsW,
            clipY: 0,
            clipW: viewW - headerW - frozenColsW,
            clipH: totalHeaderH,
            rowH,
            defaultStyle,
            headerFont,
            nestedCount,
            range,
            fixedCols,
            isFrozen: false,
        });

        if (frozenColsW > 0) {
            this.#renderHeaderRegion(ctx, sheet, {
                vt,
                rc,
                clipX: headerW,
                clipY: 0,
                clipW: frozenColsW,
                clipH: totalHeaderH,
                rowH,
                defaultStyle,
                headerFont,
                nestedCount,
                range,
                fixedCols,
                isFrozen: true,
            });
        }

        if (!this._dragIndicator?.hasColumnMove()) {
            this.#drawColSelectionLines(ctx, sheet, vt, totalHeaderH, viewW, range, frozenColsW, fixedCols);
        }
    }

    /**
     * 在指定裁剪区域内渲染一组表头（消除冻结/非冻结区域的重复 clip 逻辑）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {object} opts - 渲染选项
     * @private
     */
    #renderHeaderRegion(ctx, sheet, opts) {
        const { vt, rc, clipX, clipY, clipW, clipH, rowH, defaultStyle, headerFont, nestedCount, range, fixedCols, isFrozen } = opts;

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();

        if (nestedCount > 0) {
            const sc = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
            const ec = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);
            this.#renderNestedColumnHeaders(ctx, sheet, vt, rc, sc, ec, rowH, headerFont, defaultStyle);
        } else {
            const startCol = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
            const endCol = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);

            for (let c = startCol; c < endCol; c++) {
                const w = rc.getColWidth(c);
                if (w <= 0) continue;
                const x = vt.colToViewX(c);
                const isSource = this._dragIndicator?.isColumnSource(c) ?? false;
                const highlighted = c >= range.topCol && c <= range.bottomCol;
                this.#drawHeaderCell(ctx, x, clipY, w, rowH, isSource, highlighted, defaultStyle);
                this.#drawHeaderText(ctx, sheet.getColHeader(c), x + HEADER_COL_PADDING, clipY + rowH - 8, null, headerFont);

                for (const renderer of this.#columnHeaderRenderers) {
                    try {
                        renderer(ctx, c, x, clipY, w, rowH);
                    } catch (e) {
                        errorHandler.warn(ERROR_CODE.GENERIC_WARN, "[HeaderRenderer] columnHeaderRenderer error:", e);
                    }
                }

                this.#drawSeparator(ctx, x + w, clipY, x + w, clipY + rowH);
            }
        }

        ctx.restore();
    }

    /**
     * 计算可见起始列号
     *
     * 冻结区域：从第0列开始到 fixedCols
     * 非冻结区域：根据 scrollX 偏移计算第一个可见的非冻结列
     *
     * 坐标推导：
     * - 非冻结列 c 在视口中的位置: viewX = headerW + colX(c) - scrollX
     * - 非冻结区域起点: headerW + frozenColsW
     * - 要求 viewX >= headerW + frozenColsW
     * - 即 colX(c) >= frozenColsW + scrollX
     */
    #calcStartCol(vt, rc, fixedCols, isFrozen, clipW) {
        if (isFrozen) return 0;

        const scrollX = vt.scrollX;
        const frozenColsW = vt.frozenColsW;
        const dataOffset = frozenColsW + scrollX;
        return Math.max(fixedCols, rc.colAt(dataOffset));
    }

    /**
     * 计算可见结束列号（不包含）
     *
     * 冻结区域：到 fixedCols 为止
     * 非冻结区域：根据 scrollX + frozenColsW + clipW 计算最后一个可见列+1
     *
     * dataViewW = clipW（非冻结区域的视口宽度 = 数据坐标系的宽度）
     */
    #calcEndCol(vt, rc, fixedCols, isFrozen, clipW) {
        if (isFrozen) return fixedCols;

        const scrollX = vt.scrollX;
        const frozenColsW = vt.frozenColsW;
        const dataViewW = clipW;
        const dataEnd = frozenColsW + scrollX + dataViewW;
        return Math.min(rc.colAt(dataEnd) + 1, rc.colCount);
    }

    /**
     * 渲染嵌套多层列头
     *
     * 核心原则：每个嵌套单元格的坐标必须通过 ViewportTransform 统一转换，
     * 不能手动计算偏移。冻结/非冻结区域的区别由 VT 内部处理。
     *
     * 关键修复点：
     * 1. colspan 项的可见部分裁剪：只绘制 [visStart, visEnd] 范围内的部分
     * 2. 坐标统一使用 vt.colToViewX() / vt.colRightToViewX()
     * 3. 层分隔线使用实际可见范围而非 sc/ec 边界
     */
    #renderNestedColumnHeaders(ctx, sheet, vt, rc, sc, ec, rowH, headerFont, defaultStyle) {
        const nestedCount = sheet.getNestedHeaderRowCount();
        const isFrozenRegion = sc === 0;

        for (let layerIdx = 0; layerIdx < nestedCount; layerIdx++) {
            const layerY = layerIdx * rowH;
            const row = sheet.nestedHeaders[layerIdx];
            if (!Array.isArray(row)) continue;

            let consumed = 0;
            for (let i = 0; i < row.length; i++) {
                const item = row[i];
                const label = isString(item) ? item : (item?.label ?? "");
                const colspan = item && isObject(item) && item.colspan ? item.colspan : 1;

                const startCol = consumed;
                const endCol = consumed + colspan - 1;
                consumed += colspan;

                if (endCol < sc || startCol >= ec) continue;

                const visStart = Math.max(startCol, sc);
                const visEnd = Math.min(endCol, ec);

                let visibleStartCol = visStart;
                while (visibleStartCol <= visEnd && rc.getColWidth(visibleStartCol) <= 0) {
                    visibleStartCol++;
                }
                if (visibleStartCol > visEnd) continue;

                const x = vt.colToViewX(visStart);
                const rightX = vt.colRightToViewX(visEnd);
                const totalW = rightX - x;

                if (totalW <= 0) continue;

                const isSource = this._dragIndicator?.isColumnSource(startCol) ?? false;
                this.#drawHeaderCell(ctx, x, layerY, totalW, rowH, isSource, false, defaultStyle);

                if (label && !(colspan > 1 && !isFrozenRegion && startCol < sc)) {
                    this.#drawHeaderText(ctx, label, x + HEADER_COL_PADDING, layerY + rowH - 8, null, headerFont);
                }

                this.#drawSeparator(ctx, rightX, layerY, rightX, layerY + rowH);
            }

            if (layerIdx < nestedCount - 1) {
                this.#drawNestedLayerSeparator(ctx, vt, rc, sc, ec, layerY + rowH);
            }
        }
    }

    /**
     * 绘制嵌套层之间的水平分隔线
     * 只在实际有可见内容的范围内绘制
     */
    #drawNestedLayerSeparator(ctx, vt, rc, sc, ec, y) {
        let leftmostVisible = Infinity;
        let rightmostVisible = -Infinity;

        for (let c = sc; c <= ec; c++) {
            if (rc.getColWidth(c) > 0) {
                leftmostVisible = Math.min(leftmostVisible, c);
                rightmostVisible = Math.max(rightmostVisible, c);
            }
        }

        if (leftmostVisible <= rightmostVisible) {
            const leftX = vt.colToViewX(leftmostVisible);
            const rightX = vt.colRightToViewX(rightmostVisible);
            if (rightX > leftX) {
                this.#drawSeparator(ctx, leftX, y, rightX, y);
            }
        }
    }

    /**
     * 渲染行头区域
     * - 背景填充 → 逐行绘制 → 选区高亮右线
     * - 拖拽中时源行显示蓝色半透明高亮，隐藏选区右线
     */
    #renderRowHeaders(ctx, sheet, vt, viewH, range) {
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);
        const frozenRowsH = vt.frozenRowsH;
        const fixedRows = vt.fixedRows;
        const scrollY = vt.scrollY;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, headerH, headerW, viewH - headerH);

        this.#renderRowHeaderRegion(ctx, sheet, {
            vt,
            rc,
            clipY: headerH + frozenRowsH,
            clipH: viewH - headerH - frozenRowsH,
            headerW,
            headerH,
            defaultStyle,
            headerFont,
            range,
            fixedRows,
            isFrozen: false,
        });

        if (frozenRowsH > 0) {
            this.#renderRowHeaderRegion(ctx, sheet, {
                vt,
                rc,
                clipY: headerH,
                clipH: frozenRowsH,
                headerW,
                headerH,
                defaultStyle,
                headerFont,
                range,
                fixedRows,
                isFrozen: true,
            });
        }

        if (!this._dragIndicator?.hasRowMove()) {
            const topRowY = vt.rowToViewY(range.topRow);
            const bottomRowBottom = vt.rowBottomToViewY(range.bottomRow);
            this.#drawSelectionLine(ctx, headerW, topRowY, bottomRowBottom - topRowY, false);
        }
    }

    /**
     * 在指定裁剪区域内渲染行头（消除冻结/非冻结区域的重复 clip 逻辑）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {object} opts
     * @private
     */
    #renderRowHeaderRegion(ctx, sheet, opts) {
        const { vt, rc, clipY, clipH, headerW, headerH, defaultStyle, headerFont, range, fixedRows, isFrozen } = opts;
        const scrollY = isFrozen ? 0 : vt.scrollY;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, clipY, headerW, clipH);
        ctx.clip();

        const startRow = isFrozen ? 0 : Math.max(fixedRows, rc.rowAt(scrollY));
        const dataViewH = vt.frozenRowsH > 0 ? clipH + vt.frozenRowsH : clipH;
        const endRow = isFrozen ? fixedRows : Math.min(rc.rowAt(scrollY + dataViewH) + 1, rc.rowCount);
        for (let r = startRow; r < endRow; r++) {
            const y = vt.rowToViewY(r);
            const h = rc.getRowHeight(r);
            if (h <= 0) continue;

            const isSource = this._dragIndicator?.isRowSource(r) ?? false;
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

        ctx.restore();
    }

    /**
     * 渲染左上角交叉区域
     * 全选时高亮，高度跟随表头总高度（支持嵌套表头）
     */
    #renderCorner(ctx, vt, range) {
        const headerW = vt.headerW;
        const headerH = vt.headerH;
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

    /**
     * 分段绘制列头选区高亮线，防止穿透冻结区域
     *
     * 核心问题：
     * 当选中列跨越冻结/非冻结边界时（如选中第1列，第0列冻结），
     * 水平滚动会导致高亮线错误地延伸到冻结列区域。
     *
     * 解决方案：
     * 将选区分割为冻结段和非冻结段，分别只在对应区域内绘制：
     * - 冻结段：[max(topCol, 0), min(bottomCol, fixedCols-1)]
     * - 非冻结段：[max(topCol, fixedCols), bottomCol]
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {ViewportTransform} vt
     * @param {number} y - 高亮线的 Y 坐标（header 底部）
     * @param {number} viewW - 视口宽度
     * @param {object} range - 选区范围 {topCol, bottomCol}
     * @param {number} frozenColsW - 冻结列宽度
     * @param {number} fixedCols - 冻结列数
     */
    #drawColSelectionLines(ctx, sheet, vt, y, viewW, range, frozenColsW, fixedCols) {
        const headerW = vt.headerW;

        if (fixedCols > 0) {
            const frozenStart = range.topCol;
            const frozenEnd = Math.min(range.bottomCol, fixedCols - 1);

            if (frozenStart <= frozenEnd && frozenEnd >= 0) {
                const startX = vt.colToViewX(Math.max(frozenStart, 0));
                const endX = vt.colRightToViewX(frozenEnd);

                if (endX > startX && endX > headerW) {
                    this.#drawSelectionLine(
                        ctx,
                        Math.max(startX, headerW),
                        y,
                        Math.min(endX, headerW + frozenColsW) - Math.max(startX, headerW),
                        true,
                    );
                }
            }
        }

        if (range.bottomCol >= fixedCols) {
            const scrollStart = Math.max(range.topCol, fixedCols);
            const scrollEnd = range.bottomCol;

            const startX = vt.colToViewX(scrollStart);
            const endX = vt.colRightToViewX(scrollEnd);

            const clipLeft = headerW + frozenColsW;
            const clipRight = viewW;

            const visibleStart = Math.max(startX, clipLeft);
            const visibleEnd = Math.min(endX, clipRight);

            if (visibleEnd > visibleStart) {
                this.#drawSelectionLine(ctx, visibleStart, y, visibleEnd - visibleStart, true);
            }
        }
    }
}
