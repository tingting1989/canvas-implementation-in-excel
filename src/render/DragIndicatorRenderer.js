import { CONFIG } from "../constants/config";

/** 拖拽幽灵列/行的半透明填充色 */
const GHOST_FILL = "rgba(76, 139, 245, 0.15)";
/** 拖拽源行头/列头的半透明高亮色 */
const MOVE_SOURCE_FILL = "rgba(76, 139, 245, 0.3)";
/** 幽灵行头/列头文字颜色 */
const GHOST_TEXT_COLOR = "#fff";
/** 插入指示器宽度（像素） */
const INDICATOR_WIDTH = 3;
/** 插入指示器半偏移（使其居中于边界线） */
const INDICATOR_HALF = 1;
/** 列头文字水平内边距（px） */
const HEADER_COL_PADDING = 4;
/** 行头文字水平内边距（px） */
const HEADER_ROW_PADDING = 6;

/**
 * 拖拽指示器渲染器
 *
 * 负责列/行拖拽移动时的视觉反馈渲染，包含：
 * - 幽灵列/行（半透明跟随矩形）
 * - 幽灵列头/行头（源位置标签）
 * - 插入指示线（目标位置标记）
 */
export class DragIndicatorRenderer {
    /** @type {Object|null} 列拖拽移动状态 */
    #columnMoveState = null;
    /** @type {Object|null} 行拖拽移动状态 */
    #rowMoveState = null;

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

    /** 当前是否有列拖拽进行中 */
    hasColumnMove() {
        return this.#columnMoveState !== null;
    }

    /** 当前是否有行拖拽进行中 */
    hasRowMove() {
        return this.#rowMoveState !== null;
    }

    /** 指定列是否为当前拖拽源列 */
    isColumnSource(col) {
        return this.#columnMoveState !== null && this.#columnMoveState.sourceCol === col;
    }

    /** 指定行是否为当前拖拽源行 */
    isRowSource(row) {
        return this.#rowMoveState !== null && this.#rowMoveState.sourceRow === row;
    }

    /**
     * 渲染列拖拽移动指示器
     *
     * 三个视觉层级：
     * 1. 幽灵列 — 半透明矩形跟随鼠标水平移动
     * 2. 幽灵列头 — 在列头区域显示源列标签
     * 3. 插入指示线 — 竖线标记目标位置
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     */
    renderColumnMoveIndicator(ctx, sheet, vt, viewW, viewH) {
        const state = this.#columnMoveState;
        if (!state) return;

        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const headerFont = this.#buildHeaderFont(sheet.getDefaultStyle());

        const colScreenX = vt.colToViewX(state.sourceCol);
        const ghostLeft = state.dragX - (state.dragStartX - colScreenX);

        ctx.save();

        ctx.fillStyle = GHOST_FILL;
        ctx.fillRect(ghostLeft, headerH, state.colW, viewH - headerH);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(ghostLeft, headerH, state.colW, viewH - headerH);

        ctx.fillStyle = MOVE_SOURCE_FILL;
        ctx.fillRect(ghostLeft, 0, state.colW, headerH);
        this.#drawHeaderText(ctx, sheet.getColHeader(state.sourceCol), ghostLeft + HEADER_COL_PADDING, headerH - 8, GHOST_TEXT_COLOR, headerFont);

        if (state.targetCol >= 0 && state.targetCol !== state.sourceCol) {
            const indicatorX = this.#calcMoveIndicatorX(vt, state.sourceCol, state.targetCol);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(indicatorX - INDICATOR_HALF, 0, INDICATOR_WIDTH, headerH);
            ctx.fillRect(indicatorX - INDICATOR_HALF, headerH, INDICATOR_WIDTH, viewH - headerH);
        }

        ctx.restore();
    }

    /**
     * 渲染行拖拽移动指示器
     *
     * 三个视觉层级：
     * 1. 幽灵行 — 半透明矩形跟随鼠标垂直移动
     * 2. 幽灵行头 — 在行头区域显示源行标签
     * 3. 插入指示线 — 横线标记目标位置
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     */
    renderRowMoveIndicator(ctx, sheet, vt, viewW, viewH) {
        const state = this.#rowMoveState;
        if (!state) return;

        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const headerFont = this.#buildHeaderFont(sheet.getDefaultStyle());

        const rowScreenY = vt.rowToViewY(state.sourceRow);
        const ghostTop = state.dragY - (state.dragStartY - rowScreenY);

        ctx.save();

        ctx.fillStyle = GHOST_FILL;
        ctx.fillRect(headerW, ghostTop, viewW - headerW, state.rowH);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
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
            const indicatorY = this.#calcMoveIndicatorY(vt, state.sourceRow, state.targetRow);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(0, indicatorY - INDICATOR_HALF, headerW, INDICATOR_WIDTH);
            ctx.fillRect(headerW, indicatorY - INDICATOR_HALF, viewW - headerW, INDICATOR_WIDTH);
        }

        ctx.restore();
    }

    // ─── 内部工具方法 ──────────────────────────────────

    /** 绘制幽灵行头/列头的文字 */
    #drawHeaderText(ctx, text, x, y, color, font) {
        ctx.font = font || "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
    }

    /** 根据默认样式构建 CSS 字体字符串 */
    #buildHeaderFont(defaultStyle) {
        const fontStyle = defaultStyle?.fontStyle === "italic" ? "italic" : "";
        const fontWeight = defaultStyle?.fontWeight === "bold" ? "bold" : "";
        const fontSize = defaultStyle?.fontSize || 12;
        const fontFamily = defaultStyle?.fontFamily || "sans-serif";
        return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].filter(Boolean).join(" ");
    }

    /**
     * 计算列移动插入指示器的 x 坐标
     * 使用 ViewportTransform 自动处理冻结列偏移
     */
    #calcMoveIndicatorX(vt, sourceCol, targetCol) {
        if (targetCol > sourceCol) {
            return vt.colRightToViewX(targetCol);
        }
        return vt.colToViewX(targetCol);
    }

    /**
     * 计算行移动插入指示器的 y 坐标
     * 使用 ViewportTransform 自动处理冻结行偏移
     */
    #calcMoveIndicatorY(vt, sourceRow, targetRow) {
        if (targetRow > sourceRow) {
            return vt.rowBottomToViewY(targetRow);
        }
        return vt.rowToViewY(targetRow);
    }
}