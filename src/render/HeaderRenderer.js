import { CONFIG } from "../constants/config";
import { HIT_TYPE } from "../constants/hitType";

/** 拖拽幽灵行/列的半透明填充色 */
const GHOST_FILL = "rgba(76, 139, 245, 0.15)";
/** 拖拽幽灵行/列的边框色（复用选区色） */
const GHOST_STROKE = CONFIG.SELECTION_COLOR;
/** 拖拽源行头/列头的半透明高亮色 */
const MOVE_SOURCE_FILL = "rgba(76, 139, 245, 0.3)";
/** 插入指示器宽度（像素） */
const INDICATOR_WIDTH = 3;
/** 插入指示器半偏移（使其居中于边界线） */
const INDICATOR_HALF = 1;
/** 普通表头文字颜色 */
const HEADER_TEXT_COLOR = "#555";
/** 幽灵行头/列头文字颜色 */
const GHOST_TEXT_COLOR = "#fff";
/** 列头文字水平内边距（px） */
const HEADER_COL_PADDING = 4;
/** 行头文字水平内边距（px） */
const HEADER_ROW_PADDING = 6;

/**
 * 表头渲染器
 *
 * 负责绘制：
 * - 列头区域（顶部横条）
 * - 行头区域（左侧竖条）
 * - 左上角交叉区域
 * - 列宽/行高调整线（虚线）
 * - 列拖拽移动指示器（幽灵列 + 插入线）
 * - 行拖拽移动指示器（幽灵行 + 插入线）
 *
 * 渲染层次（从底到顶）：
 * 1. 列头背景 + 文字
 * 2. 行头背景 + 文字
 * 3. 左上角
 * 4. 调整线
 * 5. 移动指示器（最顶层）
 */
export class HeaderRenderer {
    /** 行高/列宽调整线状态 { type, index, position } */
    #resizeLine = null;
    /** 列拖拽移动状态 */
    #columnMoveState = null;
    /** 行拖拽移动状态 */
    #rowMoveState = null;

    /**
     * 设置调整线状态
     * @param {string|null} type - HIT_TYPE.COL_RESIZE / HIT_TYPE.ROW_RESIZE / null(清除)
     * @param {number} index - 被调整的行/列索引
     * @param {number} position - 调整线在 canvas 上的像素位置
     */
    setResizeLine(type, index, position) {
        this.#resizeLine = type ? { type, index, position } : null;
    }

    /**
     * 设置列拖拽移动状态
     * @param {Object|null} state - 列移动状态对象，null 清除
     */
    setColumnMoveState(state) {
        this.#columnMoveState = state;
    }

    /**
     * 设置行拖拽移动状态
     * @param {Object|null} state - 行移动状态对象，null 清除
     */
    setRowMoveState(state) {
        this.#rowMoveState = state;
    }

    /**
     * 主渲染入口
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {Sheet} sheet - 当前工作表
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
        this.#renderResizeLine(ctx, viewW, viewH);
        this.#renderColumnMoveIndicator(ctx, sheet, scrollX, viewW, viewH);
        this.#renderRowMoveIndicator(ctx, sheet, scrollY, viewW, viewH);
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
            // 单层表头（原有逻辑）
            for (let c = sc; c < ec; c++) {
                const w = rc.getColWidth(c);
                if (w <= 0) continue;

                const x = headerW + rc.getColX(c) - scrollX;
                const isSource = this.#columnMoveState && c === this.#columnMoveState.sourceCol;
                const highlighted = c >= range.topCol && c <= range.bottomCol;

                this.#drawHeaderCell(ctx, x, 0, w, rowH, isSource, highlighted, defaultStyle);
                this.#drawHeaderText(ctx, sheet.getColHeader(c), x + HEADER_COL_PADDING, rowH - 8, null, headerFont);
                this.#drawSeparator(ctx, x + w, 0, x + w, rowH);
            }
        }

        // 最底层表头下方的选区高亮线
        if (!this.#columnMoveState) {
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
     *
     * 对于每一层：
     * 1. 遍历该层定义，处理 colspan 跨列合并
     * 2. 对于被 colspan 覆盖的列，该层不绘制分隔线（由上层跨列合并处理）
     * 3. 最底层（叶子层）使用 colHeaders 或默认 A/B/C 标签
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {RowColManager} rc
     * @param {number} sc - 起始列
     * @param {number} ec - 结束列
     * @param {number} headerW - 行头宽度
     * @param {number} rowH - 每层表头高度
     * @param {number} scrollX - 水平滚动偏移
     * @param {string} headerFont - 表头字体
     * @param {object} defaultStyle - 默认样式
     */
    #renderNestedColumnHeaders(ctx, sheet, rc, sc, ec, headerW, rowH, scrollX, headerFont, defaultStyle) {
        const nestedCount = sheet.getNestedHeaderRowCount();

        // 逐层渲染（从上到下）
        for (let layerIdx = 0; layerIdx < nestedCount; layerIdx++) {
            const layerY = layerIdx * rowH;

            // 处理该层所有定义，逐个渲染
            const row = sheet.nestedHeaders[layerIdx];
            if (!Array.isArray(row)) continue;

            let consumed = 0;
            for (let i = 0; i < row.length; i++) {
                const item = row[i];
                const label = typeof item === "string" ? item : (item?.label ?? "");
                const colspan = item && typeof item === "object" && item.colspan ? item.colspan : 1;

                // 计算该表头覆盖的列范围
                const startCol = consumed;
                const endCol = consumed + colspan - 1;
                consumed += colspan;

                // 检查是否在可视区域内
                if (endCol < sc || startCol > ec) continue;

                // 跳过隐藏列
                let visibleStartCol = startCol;
                while (visibleStartCol <= endCol && rc.getColWidth(visibleStartCol) <= 0) {
                    visibleStartCol++;
                }
                if (visibleStartCol > endCol) continue;

                // 计算该跨列表头在 canvas 上的位置和宽度
                const x = headerW + rc.getColX(Math.max(startCol, sc)) - scrollX;
                const totalW = rc.getColX(Math.min(endCol, ec)) + rc.getColWidth(Math.min(endCol, ec)) - rc.getColX(Math.max(startCol, sc));

                if (totalW <= 0) continue;

                const isSource = this.#columnMoveState && startCol <= this.#columnMoveState.sourceCol && this.#columnMoveState.sourceCol <= endCol;
                const highlighted = false; // 嵌套表头暂不处理选区高亮

                this.#drawHeaderCell(ctx, x, layerY, totalW, rowH, isSource, highlighted, defaultStyle);

                // 文字在跨列区域内居中
                if (label) {
                    this.#drawHeaderText(ctx, label, x + HEADER_COL_PADDING, layerY + rowH - 8, null, headerFont);
                }

                // 绘制该层表头右边界和底部分隔线
                const rightEdge = Math.min(x + totalW, headerW + rc.getColX(Math.min(endCol, ec)) + rc.getColWidth(Math.min(endCol, ec)) - scrollX);
                this.#drawSeparator(ctx, rightEdge, layerY, rightEdge, layerY + rowH);
            }

            // 该层底部横线（如果还有下一层）
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
            const isSource = this.#rowMoveState && r === this.#rowMoveState.sourceRow;
            const highlighted = r >= range.topRow && r <= range.bottomRow;

            this.#drawHeaderCell(ctx, 0, y, headerW, h, isSource, highlighted, defaultStyle);

            // 裁剪区域防止文字溢出
            const textMaxW = headerW - HEADER_ROW_PADDING * 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(HEADER_ROW_PADDING, y, textMaxW, h);
            ctx.clip();
            this.#drawHeaderText(ctx, sheet.getRowHeader(sheet.toRealRow(r)), HEADER_ROW_PADDING, y + h / 2 + 4, null, headerFont, textMaxW);
            ctx.restore();

            this.#drawSeparator(ctx, 0, y + h, headerW, y + h);
        }

        if (!this.#rowMoveState) {
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

    /**
     * 渲染列拖拽移动指示器
     *
     * 包含三个视觉元素：
     * 1. 幽灵列 — 半透明矩形跟随鼠标水平移动，覆盖整个数据区域高度
     * 2. 幽灵列头 — 在列头区域显示源列标签
     * 3. 插入指示线 — 竖线标记目标插入位置
     */
    #renderColumnMoveIndicator(ctx, sheet, scrollX, viewW, viewH) {
        const state = this.#columnMoveState;
        if (!state) return;

        const rc = sheet.rowColManager;
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const headerFont = this.#buildHeaderFont(sheet.getDefaultStyle());

        const colScreenX = headerW + state.colX - state.scrollX;
        const ghostLeft = state.dragX - (state.dragStartX - colScreenX);

        ctx.save();

        ctx.fillStyle = GHOST_FILL;
        ctx.fillRect(ghostLeft, headerH, state.colW, viewH - headerH);
        ctx.strokeStyle = GHOST_STROKE;
        ctx.lineWidth = 1;
        ctx.strokeRect(ghostLeft, headerH, state.colW, viewH - headerH);

        ctx.fillStyle = MOVE_SOURCE_FILL;
        ctx.fillRect(ghostLeft, 0, state.colW, headerH);
        this.#drawHeaderText(ctx, sheet.getColHeader(state.sourceCol), ghostLeft + HEADER_COL_PADDING, headerH - 8, GHOST_TEXT_COLOR, headerFont);

        if (state.targetCol >= 0 && state.targetCol !== state.sourceCol) {
            const indicatorX = this.#calcMoveIndicatorX(rc, state.sourceCol, state.targetCol, scrollX, headerW);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(indicatorX - INDICATOR_HALF, 0, INDICATOR_WIDTH, headerH);
            ctx.fillRect(indicatorX - INDICATOR_HALF, headerH, INDICATOR_WIDTH, viewH - headerH);
        }

        ctx.restore();
    }

    /**
     * 渲染行拖拽移动指示器
     *
     * 包含三个视觉元素：
     * 1. 幽灵行 — 半透明矩形跟随鼠标垂直移动，覆盖整个数据区域宽度
     * 2. 幽灵行头 — 在行头区域显示源行标签
     * 3. 插入指示线 — 横线标记目标插入位置
     */
    #renderRowMoveIndicator(ctx, sheet, scrollY, viewW, viewH) {
        const state = this.#rowMoveState;
        if (!state) return;

        const rc = sheet.rowColManager;
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const headerFont = this.#buildHeaderFont(sheet.getDefaultStyle());

        const rowScreenY = headerH + state.rowY - state.scrollY;
        const ghostTop = state.dragY - (state.dragStartY - rowScreenY);

        ctx.save();

        ctx.fillStyle = GHOST_FILL;
        ctx.fillRect(headerW, ghostTop, viewW - headerW, state.rowH);
        ctx.strokeStyle = GHOST_STROKE;
        ctx.lineWidth = 1;
        ctx.strokeRect(headerW, ghostTop, viewW - headerW, state.rowH);

        ctx.fillStyle = MOVE_SOURCE_FILL;
        ctx.fillRect(0, ghostTop, headerW, state.rowH);
        this.#drawHeaderText(
            ctx,
            sheet.getRowHeader(state.sourceRow),
            HEADER_ROW_PADDING,
            ghostTop + state.rowH / 2 + 4,
            GHOST_TEXT_COLOR,
            headerFont,
        );

        if (state.targetRow >= 0 && state.targetRow !== state.sourceRow) {
            const indicatorY = this.#calcMoveIndicatorY(rc, state.sourceRow, state.targetRow, scrollY, headerH);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(0, indicatorY - INDICATOR_HALF, headerW, INDICATOR_WIDTH);
            ctx.fillRect(headerW, indicatorY - INDICATOR_HALF, viewW - headerW, INDICATOR_WIDTH);
        }

        ctx.restore();
    }

    /**
     * 渲染行高/列宽调整线（虚线）
     */
    #renderResizeLine(ctx, viewW, viewH) {
        if (!this.#resizeLine) return;

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);

        if (this.#resizeLine.type === HIT_TYPE.COL_RESIZE) {
            const x = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        } else {
            const y = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    // ─── 通用绘制工具方法 ──────────────────────────────────

    /**
     * 绘制单个表头单元格背景
     * 优先级：拖拽源高亮 > 选区高亮 > 默认
     * 普通状态下文字颜色跟随 defaultStyle.color
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x - 左上角 x
     * @param {number} y - 左上角 y
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {boolean} isSource - 是否为拖拽源行/列
     * @param {boolean} highlighted - 是否在选区内
     * @param {object} [defaultStyle] - 工作表默认样式
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
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text - 文字内容
     * @param {number} x - 文字 x 坐标
     * @param {number} y - 文字 y 坐标（基线）
     * @param {string} [color] - 文字颜色，null 则使用当前 fillStyle
     * @param {string} [font] - 字体 CSS 字符串，默认 "12px sans-serif"
     * @param {number} [maxWidth] - 文字最大宽度（px），超出则截断加省略号
     */
    #drawHeaderText(ctx, text, x, y, color, font, maxWidth) {
        ctx.font = font || "12px sans-serif";
        ctx.textAlign = "left";
        if (color) ctx.fillStyle = color;

        if (maxWidth && ctx.measureText(text).width > maxWidth) {
            // 逐字截断，预留省略号宽度
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

    /**
     * 根据默认样式构建表头字体 CSS 字符串
     * @param {object} defaultStyle - 工作表默认样式对象
     * @returns {string} CSS font 字符串，如 "bold 14px Arial"
     */
    #buildHeaderFont(defaultStyle) {
        const fontStyle = defaultStyle?.fontStyle === "italic" ? "italic" : "";
        const fontWeight = defaultStyle?.fontWeight === "bold" ? "bold" : "";
        const fontSize = defaultStyle?.fontSize || 12;
        const fontFamily = defaultStyle?.fontFamily || "sans-serif";
        return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].filter(Boolean).join(" ");
    }

    /**
     * 绘制分隔线
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x1 - 起点 x
     * @param {number} y1 - 起点 y
     * @param {number} x2 - 终点 x
     * @param {number} y2 - 终点 y
     */
    #drawSeparator(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /**
     * 绘制选区高亮线
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} origin - 线起始坐标（列头为 x，行头为 y）
     * @param {number} origin2 - 线的第二个坐标（列头为 headerH，行头为 headerW）
     * @param {number} length - 线长度
     * @param {boolean} horizontal - true=水平线（列头底线），false=垂直线（行头右线）
     */
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
     * 计算列移动插入指示器的 x 坐标
     * @param {RowColManager} rc
     * @param {number} sourceCol - 源列号
     * @param {number} targetCol - 目标列号
     * @param {number} scrollX - 水平滚动偏移
     * @param {number} headerW - 行头宽度
     * @returns {number} 指示器在 canvas 上的 x 坐标
     */
    #calcMoveIndicatorX(rc, sourceCol, targetCol, scrollX, headerW) {
        if (targetCol > sourceCol) {
            return headerW + rc.getColX(targetCol) + rc.getColWidth(targetCol) - scrollX;
        }
        return headerW + rc.getColX(targetCol) - scrollX;
    }

    /**
     * 计算行移动插入指示器的 y 坐标
     * @param {RowColManager} rc
     * @param {number} sourceRow - 源行号
     * @param {number} targetRow - 目标行号
     * @param {number} scrollY - 垂直滚动偏移
     * @param {number} headerH - 表头总高度
     * @returns {number} 指示器在 canvas 上的 y 坐标
     */
    #calcMoveIndicatorY(rc, sourceRow, targetRow, scrollY, headerH) {
        if (targetRow > sourceRow) {
            return headerH + rc.getRowY(targetRow) + rc.getRowHeight(targetRow) - scrollY;
        }
        return headerH + rc.getRowY(targetRow) - scrollY;
    }
}
