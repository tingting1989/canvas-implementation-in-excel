import { CONFIG } from "../constants/config.js";
import { calcCenteredTextY } from "../utils/canvasUtils.js";
import { HeaderLayoutBuilder } from "./header/HeaderLayoutBuilder.js";
import { HeaderPainter } from "./header/HeaderPainter.js";
import { FrozenBoundaryInfo } from "./header/models/FrozenBoundaryInfo.js";
import { FONT_STYLE } from "../constants/enums/FontStyle.js";
import type { Sheet } from "../workbook/Sheet.js";
import type { ViewportTransform } from "./ViewportTransform.js";

/** 默认字体回退值 */
const DEFAULT_FONT = `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.DEFAULT_FONT_FAMILY}`;

/** 列头渲染器函数签名 */
type ColumnHeaderRendererFn = (ctx: CanvasRenderingContext2D, colIndex: number, x: number, y: number, width: number, height: number) => void;

/** 选区范围 */
interface SelectionRange {
    topRow: number;
    bottomRow: number;
    topCol: number;
    bottomCol: number;
}

/** 拖拽指示器接口 */
interface DragIndicator {
    isColumnSource(col: number): boolean;
    isRowSource(row: number): boolean;
    hasColumnMove(): boolean;
    hasRowMove(): boolean;
}

/** 行列管理器接口 */
interface RowColManager {
    colAt(x: number): number;
    rowAt(y: number): number;
    colCount: number;
    rowCount: number;
    getRowHeight(row: number): number;
    getColWidth(col: number): number;
}

/** 单元格样式 */
interface CellStyle {
    fontStyle?: string;
    fontWeight?: string;
    fontSize?: string | number;
    fontFamily?: string;
    color?: string;
    backgroundColor?: string;
    [key: string]: unknown;
}

/** 列头渲染区域配置 */
interface HeaderRegionOpts {
    vt: ViewportTransform;
    rc: RowColManager;
    clipX: number;
    clipY: number;
    clipW: number;
    clipH: number;
    rowH: number;
    defaultStyle: CellStyle | null;
    headerFont: string;
    nestedCount: number;
    range: SelectionRange;
    fixedCols: number;
    isFrozen: boolean;
}

/** 嵌套表头渲染配置 */
interface NestedHeaderConfig {
    layerCount: number;
    rowH: number;
    sc: number;
    ec: number;
    vt: ViewportTransform;
    sheet: Sheet;
    defaultStyle: CellStyle | null;
    headerFont: string;
    fixedCols: number;
    range: SelectionRange;
    paintOptions: Record<string, unknown>;
}

/** 简单表头渲染配置 */
interface SimpleHeaderConfig {
    sc: number;
    ec: number;
    rowH: number;
    vt: ViewportTransform;
    sheet: Sheet;
    defaultStyle: CellStyle | null;
    headerFont: string;
    range: SelectionRange;
    paintOptions: Record<string, unknown>;
}

/** 行头渲染区域配置 */
interface RowHeaderRegionOpts {
    vt: ViewportTransform;
    rc: RowColManager;
    clipY: number;
    clipH: number;
    headerW: number;
    headerH: number;
    defaultStyle: CellStyle | null;
    headerFont: string;
    range: SelectionRange;
    fixedRows: number;
    isFrozen: boolean;
    sheet: Sheet;
}

/** 单行行头渲染配置 */
interface SingleRowHeaderConfig {
    r: number;
    vt: ViewportTransform;
    rc: RowColManager;
    headerW: number;
    headerH: number;
    defaultStyle: CellStyle | null;
    headerFont: string;
    range: SelectionRange;
    startRow: number;
    lastRowY: number;
    leftBorderDrawn: boolean;
}

/** 行头边框参数 */
interface RowBorderParams {
    x: number;
    y: number;
    w: number;
    h: number;
    isFirstRow: boolean;
    lastRowY: number;
}

/**
 * 表头渲染器
 *
 * 负责渲染工作表的三个表头区域：
 * - 列头（Column Headers）：顶部的列标识（A, B, C...），支持嵌套多层表头
 * - 行头（Row Headers）：左侧的行号（1, 2, 3...），支持自定义样式
 * - 左上角（Corner）：全选按钮区域
 *
 * 渲染管线：
 * 1. 列头 → 走 Fragment 管线（HeaderLayoutBuilder 构建 → HeaderPainter 绘制）
 * 2. 行头 → 直接逐行渲染（支持自定义行头样式和行高）
 * 3. 左上角 → 简单矩形填充 + 边框
 *
 * 冻结处理：
 * - 列头和行头都分为冻结区域和非冻结区域分别渲染
 * - 冻结区域不受滚动影响，始终固定显示
 * - 选区高亮线需要处理冻结边界的分割
 *
 * @module render/HeaderRenderer
 */
export class HeaderRenderer {
    /** @private 私有字段 - 列头扩展渲染器列表（插件注册的自定义绘制函数） */
    #columnHeaderRenderers: ColumnHeaderRendererFn[];

    /** @private 私有字段 - 布局构建器，负责将表头数据转换为 Fragment 列表 */
    #layoutBuilder: HeaderLayoutBuilder;

    /** @private 私有字段 - 绘制器，负责将 Fragment 绘制到 Canvas */
    #painter: HeaderPainter;

    /**
     * 当前拖拽指示器
     * 用于在拖拽移动列/行时标记源列/行并显示视觉反馈
     */
    _dragIndicator: DragIndicator | undefined;

    constructor() {
        this.#columnHeaderRenderers = [];
        this.#layoutBuilder = new HeaderLayoutBuilder();
        this.#painter = new HeaderPainter();
        this._dragIndicator = undefined;
    }

    // ─── 公共 API ──────────────────────────────────────────

    /**
     * 注册列头扩展渲染器（用于插件绘制自定义 UI）
     *
     * 扩展渲染器会在列头单元格绘制完成后被调用，
     * 可用于在列头上叠加自定义图标、筛选按钮等。
     *
     * @param renderer - 渲染函数 (ctx, colIndex, x, y, width, height) => void
     */
    registerColumnHeaderRenderer(renderer: ColumnHeaderRendererFn): void {
        if (typeof renderer === "function") {
            this.#columnHeaderRenderers.push(renderer);
        }
    }

    /**
     * 移除列头扩展渲染器
     *
     * @param renderer - 要移除的渲染函数引用
     */
    unregisterColumnHeaderRenderer(renderer: ColumnHeaderRendererFn): void {
        const index = this.#columnHeaderRenderers.indexOf(renderer);
        if (index > -1) {
            this.#columnHeaderRenderers.splice(index, 1);
        }
    }

    /**
     * 主渲染入口
     *
     * 按顺序渲染列头、行头、左上角三个区域。
     * 渲染顺序确保行头和左上角覆盖在列头之上。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 当前工作表
     * @param vt - 视口坐标转换器
     * @param viewW - 可视区域宽度
     * @param viewH - 可视区域高度
     * @param dragIndicator - 拖拽指示器（列/行移动时的视觉反馈）
     */
    render(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        vt: ViewportTransform,
        viewW: number,
        viewH: number,
        dragIndicator: DragIndicator | null = null,
    ): void {
        this._dragIndicator = dragIndicator ?? undefined;
        const range = (sheet as any).selection.getRange();

        this.#renderColumnHeaders(ctx, sheet, vt, viewW, range);
        this.#renderRowHeaders(ctx, sheet, vt, viewH, range);
        this.#renderCorner(ctx, vt, range);
    }

    // ════════════════════════════════════════════════════════
    //  列头渲染（走 Fragment 管线）
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 渲染列头区域（包括冻结和非冻结部分）
     *
     * 流程：
     * 1. 填充列头背景
     * 2. 渲染非冻结区域的列头（受滚动影响）
     * 3. 渲染冻结区域的列头（固定不动）
     * 4. 绘制列选区高亮线（处理冻结边界分割）
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 当前工作表
     * @param vt - 视口坐标转换器
     * @param viewW - 视口宽度
     * @param range - 当前选区范围
     */
    #renderColumnHeaders(ctx: CanvasRenderingContext2D, sheet: Sheet, vt: ViewportTransform, viewW: number, range: SelectionRange): void {
        const rc = (sheet as any).rowColManager;
        const headerW = vt.headerW;
        const rowH = (sheet as any).headerHeight || CONFIG.HEADER_HEIGHT;
        const defaultStyle = (sheet as any).getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);

        const nestedCount = (sheet as any).getNestedHeaderRowCount();
        const totalHeaderH = vt.headerH;
        const frozenColsW = vt.frozenColsW;
        const fixedCols = vt.fixedCols;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(headerW, 0, viewW - headerW, totalHeaderH);

        const baseConfig = {
            vt,
            rc,
            rowH,
            defaultStyle,
            headerFont,
            nestedCount,
            range,
            fixedCols,
        };

        this.#renderHeaderRegion(ctx, sheet, {
            ...baseConfig,
            clipX: headerW + frozenColsW,
            clipY: 0,
            clipW: viewW - headerW - frozenColsW,
            clipH: totalHeaderH,
            isFrozen: false,
        });

        if (frozenColsW > 0) {
            this.#renderHeaderRegion(ctx, sheet, {
                ...baseConfig,
                clipX: headerW,
                clipY: 0,
                clipW: frozenColsW,
                clipH: totalHeaderH,
                isFrozen: true,
            });
        }

        if (!this._dragIndicator?.hasColumnMove()) {
            this.#drawColSelectionLines(ctx, vt, totalHeaderH, viewW, range, frozenColsW, fixedCols);
        }
    }

    /**
     * @private 私有方法 - 在指定裁剪区域内渲染列头（统一走 Fragment 管线）
     *
     * Fragment 管线流程：
     * 1. 设置裁剪区域
     * 2. 计算可见列范围
     * 3. 由 HeaderLayoutBuilder 构建 Fragment 列表
     * 4. 为 Fragment 注入选区/拖拽状态
     * 5. 由 HeaderPainter 绘制所有 Fragment
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 当前工作表
     * @param opts - 渲染配置
     */
    #renderHeaderRegion(ctx: CanvasRenderingContext2D, sheet: Sheet, opts: HeaderRegionOpts): void {
        const { vt, rc, clipX, clipY, clipW, clipH, rowH, defaultStyle, headerFont, nestedCount, range, fixedCols, isFrozen } = opts;

        ctx.save();
        this.#setClipRect(ctx, clipX, clipY, clipW, clipH);

        const sc = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
        const ec = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);

        const paintOptions = {
            vt,
            rc,
            columnHeaderRenderers: this.#columnHeaderRenderers,
        };

        if (nestedCount > 0) {
            this.#renderNestedHeaders(ctx, sheet, {
                layerCount: nestedCount,
                rowH,
                sc,
                ec,
                vt,
                sheet,
                defaultStyle,
                headerFont,
                fixedCols,
                range,
                paintOptions,
            });
        } else {
            this.#renderSimpleHeader(ctx, { sc, ec, rowH, vt, sheet, defaultStyle, headerFont, range, paintOptions });
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 渲染嵌套表头（多层）
     *
     * 每层表头独立构建 Fragment 列表并绘制。
     * 层级从上到下（layerIdx 从 0 开始），第 0 层为最顶层。
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 当前工作表
     * @param config - 嵌套表头渲染配置
     */
    #renderNestedHeaders(ctx: CanvasRenderingContext2D, sheet: Sheet, config: NestedHeaderConfig): void {
        const { layerCount, rowH, sc, ec, vt, sheet: sh, defaultStyle, headerFont, fixedCols, range, paintOptions } = config;
        const frozenBoundary = new FrozenBoundaryInfo({ fixedCols, fixedRows: 0 });

        for (let layerIdx = 0; layerIdx < layerCount; layerIdx++) {
            const layerY = layerIdx * rowH;
            const layerData = (sh as any).nestedHeaders[layerIdx];
            if (!Array.isArray(layerData)) continue;

            const fragments = this.#layoutBuilder.buildLayerFragments({
                layerData,
                layerIndex: layerIdx,
                layerY,
                rowH,
                sc,
                ec,
                frozenBoundary,
                vt,
                sheet: sh,
                defaultStyle: defaultStyle as any,
                headerFont,
            });

            this.#enrichFragmentsWithState(fragments, range);

            this.#painter.paintAll(ctx, fragments, {
                ...paintOptions,
                isTopLayer: layerIdx === 0,
            });
        }
    }

    /**
     * @private 私有方法 - 渲染简单表头（单层）
     *
     * @param ctx - Canvas 2D 上下文
     * @param config - 简单表头渲染配置
     */
    #renderSimpleHeader(ctx: CanvasRenderingContext2D, config: SimpleHeaderConfig): void {
        const { sc, ec, rowH, vt, sheet, defaultStyle, headerFont, range, paintOptions } = config;

        const fragments = this.#layoutBuilder.buildSimpleLayerFragments({
            sc,
            ec,
            layerY: 0,
            rowH,
            vt,
            sheet,
            defaultStyle: defaultStyle as any,
            headerFont,
        });

        this.#enrichFragmentsWithState(fragments, range);
        this.#painter.paintAll(ctx, fragments, paintOptions);
    }

    /**
     * @private 私有方法 - 为 Fragment 列表注入选区/拖拽状态
     *
     * 遍历每个 Fragment，设置：
     * - isSource：是否为列移动拖拽的源列
     * - isHighlighted：是否在当前选区范围内（嵌套表头不参与高亮）
     *
     * @param fragments - Fragment 列表
     * @param range - 当前选区范围
     */
    #enrichFragmentsWithState(fragments: any[], range: SelectionRange): void {
        for (const frag of fragments) {
            if (!frag) continue;

            const col = frag.visStartCol;
            frag.isSource = this._dragIndicator?.isColumnSource(col) ?? false;

            const isNested = !!frag.sourceCell;
            frag.isHighlighted = !isNested && col >= range.topCol && col <= range.bottomCol;
        }
    }

    // ════════════════════════════════════════════════════════
    //  行头渲染（直接逐行绘制）
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 渲染行头区域（包括冻结和非冻结部分）
     *
     * 流程：
     * 1. 填充行头背景
     * 2. 渲染非冻结区域的行头（受滚动影响）
     * 3. 渲染冻结区域的行头（固定不动）
     * 4. 绘制行选区高亮线
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 当前工作表
     * @param vt - 视口坐标转换器
     * @param viewH - 视口高度
     * @param range - 当前选区范围
     */
    #renderRowHeaders(ctx: CanvasRenderingContext2D, sheet: Sheet, vt: ViewportTransform, viewH: number, range: SelectionRange): void {
        const rc = (sheet as any).rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const defaultStyle = (sheet as any).getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);
        const frozenRowsH = vt.frozenRowsH;
        const fixedRows = vt.fixedRows;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, headerH, headerW, viewH - headerH);

        const baseConfig = {
            vt,
            rc,
            headerW,
            headerH,
            defaultStyle,
            headerFont,
            range,
            fixedRows,
            sheet,
        };

        this.#renderRowHeaderRegion(ctx, {
            ...baseConfig,
            clipY: headerH + frozenRowsH,
            clipH: viewH - headerH - frozenRowsH,
            isFrozen: false,
        });

        if (frozenRowsH > 0) {
            this.#renderRowHeaderRegion(ctx, {
                ...baseConfig,
                clipY: headerH,
                clipH: frozenRowsH,
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
     * @private 私有方法 - 在指定裁剪区域内渲染行头
     *
     * 逐行遍历可见行，对每行调用 #drawSingleRowHeader 绘制。
     * 左侧边框只在第一行绘制一次，避免重复。
     *
     * @param ctx - Canvas 2D 上下文
     * @param opts - 渲染配置
     */
    #renderRowHeaderRegion(ctx: CanvasRenderingContext2D, opts: RowHeaderRegionOpts): void {
        const { vt, rc, clipY, clipH, headerW, headerH, defaultStyle, headerFont, range, fixedRows, isFrozen, sheet } = opts;
        const scrollY = isFrozen ? 0 : vt.scrollY;

        ctx.save();
        this.#setClipRect(ctx, 0, clipY, headerW, clipH);

        const startRow = isFrozen ? 0 : Math.max(fixedRows, rc.rowAt(scrollY));
        const dataViewH = vt.frozenRowsH > 0 ? clipH + vt.frozenRowsH : clipH;
        const endRow = isFrozen ? fixedRows : Math.min(rc.rowAt(scrollY + dataViewH) + 1, rc.rowCount);

        const lastRowY = vt.rowToViewY(endRow - 1) + rc.getRowHeight(endRow - 1);
        let leftBorderDrawn = false;

        for (let r = startRow; r < endRow; r++) {
            this.#drawSingleRowHeader(ctx, sheet, {
                r,
                vt,
                rc,
                headerW,
                headerH,
                defaultStyle,
                headerFont,
                range,
                startRow,
                lastRowY,
                leftBorderDrawn,
            });

            if (r === startRow) {
                leftBorderDrawn = true;
            }
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 绘制单个行头单元格
     *
     * 包含：背景填充 → 行号文字 → 边框（右侧 + 底部 + 左侧）
     *
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 当前工作表
     * @param config - 行头渲染配置
     */
    #drawSingleRowHeader(ctx: CanvasRenderingContext2D, sheet: Sheet, config: SingleRowHeaderConfig): void {
        const { r, vt, rc, headerW, defaultStyle, headerFont, range, startRow, lastRowY, leftBorderDrawn } = config;

        const y = vt.rowToViewY(r);
        const h = rc.getRowHeight(r);
        if (h <= 0) return;

        const isSource = this._dragIndicator?.isRowSource(r) ?? false;
        const highlighted = r >= range.topRow && r <= range.bottomRow;
        const rowStyle = (sheet as any).getRowHeaderStyle(r);
        const mergedStyle = this.#mergeHeaderStyle(defaultStyle, rowStyle);

        this.#drawHeaderCell(ctx, 0, y, headerW, h, isSource, highlighted, mergedStyle);

        const textFont = this.#buildNestedHeaderFont(headerFont, rowStyle);
        this.#drawHeaderText(
            ctx,
            (sheet as any).getRowHeader(r),
            headerW / 2,
            calcCenteredTextY(y, h, textFont),
            mergedStyle?.color,
            textFont,
            null,
            "center",
        );

        this.#drawRowBorders(ctx, { x: 0, y, w: headerW, h, isFirstRow: r === startRow, lastRowY });
    }

    /**
     * @private 私有方法 - 绘制行头边框
     *
     * 三条边框：
     * - 右侧：每行都画，使用 HEADER_BORDER_COLOR（分隔行头和数据区域）
     * - 底部：每行都画，使用 GRID_COLOR（行间分隔线）
     * - 左侧：只在第一行画一次，使用 HEADER_BORDER_COLOR（整个行头区域的左边界）
     *
     * @param ctx - Canvas 2D 上下文
     * @param params - 边框参数
     */
    #drawRowBorders(ctx: CanvasRenderingContext2D, { x, y, w, h, isFirstRow, lastRowY }: RowBorderParams): void {
        this.#drawSeparator(ctx, x + w, y, x + w, y + h);

        this.#drawGridLine(ctx, x, y + h, x + w, y + h);

        if (isFirstRow) {
            this.#drawSeparator(ctx, x, y, x, lastRowY);
        }
    }

    // ════════════════════════════════════════════════════════
    //  左上角渲染
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 渲染左上角区域（全选按钮位置）
     *
     * 当整张表被全选时（topRow=0 且 topCol=0），背景色加深。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param range - 当前选区范围
     */
    #renderCorner(ctx: CanvasRenderingContext2D, vt: ViewportTransform, range: SelectionRange): void {
        const { headerW, headerH } = vt;
        const allSelected = range.topRow === 0 && range.topCol === 0;

        ctx.fillStyle = allSelected ? CONFIG.HEADER_HIGHLIGHT_BG : CONFIG.HEADER_BG;
        ctx.fillRect(0, 0, headerW, headerH);

        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.strokeRect(0, 0, headerW, headerH);
    }

    // ════════════════════════════════════════════════════════
    //  Canvas 工具方法
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 设置矩形裁剪区域
     *
     * @param ctx - Canvas 2D 上下文
     * @param x - 裁剪区域 X 起点
     * @param y - 裁剪区域 Y 起点
     * @param w - 裁剪区域宽度
     * @param h - 裁剪区域高度
     */
    #setClipRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
    }

    /**
     * @private 私有方法 - 绘制分隔线（使用 HEADER_BORDER_COLOR）
     *
     * 用于绘制行头/列头与数据区域之间的边界线。
     *
     * @param ctx - Canvas 2D 上下文
     * @param x1 - 起点 X
     * @param y1 - 起点 Y
     * @param x2 - 终点 X
     * @param y2 - 终点 Y
     */
    #drawSeparator(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /**
     * @private 私有方法 - 绘制网格线（使用 GRID_COLOR，与数据区域一致）
     *
     * 自动保存/恢复 Canvas 样式，避免影响后续绘制。
     *
     * @param ctx - Canvas 2D 上下文
     * @param x1 - 起点 X
     * @param y1 - 起点 Y
     * @param x2 - 终点 X
     * @param y2 - 终点 Y
     */
    #drawGridLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
        this.#withStrokeStyle(ctx, CONFIG.GRID_COLOR, () => {
            this.#withLineWidth(ctx, CONFIG.GRID_LINE_WIDTH, () => {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            });
        });
    }

    /**
     * @private 私有方法 - 绘制选区高亮线
     *
     * 使用 SELECTION_COLOR 和 SELECTION_LINE_WIDTH 绘制，
     * 支持水平和垂直两个方向。
     *
     * @param ctx - Canvas 2D 上下文
     * @param origin - 主轴起点坐标
     * @param origin2 - 副轴起点坐标
     * @param length - 线段长度
     * @param horizontal - true 为水平线，false 为垂直线
     */
    #drawSelectionLine(ctx: CanvasRenderingContext2D, origin: number, origin2: number, length: number, horizontal: boolean): void {
        this.#withStrokeStyle(ctx, CONFIG.SELECTION_COLOR, () => {
            this.#withLineWidth(ctx, CONFIG.SELECTION_LINE_WIDTH, () => {
                ctx.beginPath();
                if (horizontal) {
                    ctx.moveTo(origin, origin2);
                    ctx.lineTo(origin + length, origin2);
                } else {
                    ctx.moveTo(origin, origin2);
                    ctx.lineTo(origin, origin2 + length);
                }
                ctx.stroke();
            });
        });
    }

    // ════════════════════════════════════════════════════════
    //  样式管理辅助方法
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 临时修改 strokeStyle，执行回调后恢复
     *
     * @param ctx - Canvas 2D 上下文
     * @param style - 新的 strokeStyle
     * @param fn - 回调函数
     */
    #withStrokeStyle(ctx: CanvasRenderingContext2D, style: string, fn: () => void): void {
        const original = ctx.strokeStyle;
        ctx.strokeStyle = style;
        try {
            fn();
        } finally {
            ctx.strokeStyle = original;
        }
    }

    /**
     * @private 私有方法 - 临时修改 lineWidth，执行回调后恢复
     *
     * @param ctx - Canvas 2D 上下文
     * @param width - 新的 lineWidth
     * @param fn - 回调函数
     */
    #withLineWidth(ctx: CanvasRenderingContext2D, width: number, fn: () => void): void {
        const original = ctx.lineWidth;
        ctx.lineWidth = width;
        try {
            fn();
        } finally {
            ctx.lineWidth = original;
        }
    }

    // ════════════════════════════════════════════════════════
    //  字体构建方法
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 从默认样式构建表头字体字符串
     *
     * 将 fontStyle / fontWeight / fontSize / fontFamily 组合为 CSS font 字符串。
     * 例如："italic bold 13px Arial"
     *
     * @param defaultStyle - 单元格默认样式
     * @returns CSS font 字符串
     */
    #buildHeaderFont(defaultStyle: CellStyle | null): string {
        if (!defaultStyle) return DEFAULT_FONT;

        const fontStyle = defaultStyle.fontStyle === FONT_STYLE.ITALIC ? FONT_STYLE.ITALIC : "";
        const fontWeight = defaultStyle.fontWeight === FONT_STYLE.BOLD ? FONT_STYLE.BOLD : "";
        const fontSize = defaultStyle.fontSize || CONFIG.DEFAULT_FONT_SIZE;
        const fontFamily = defaultStyle.fontFamily || CONFIG.DEFAULT_FONT_FAMILY;

        return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].filter(Boolean).join(" ");
    }

    /**
     * @private 私有方法 - 构建嵌套表头/行头的覆盖字体
     *
     * 在基础字体上应用自定义样式的覆盖：
     * - fontStyle / fontWeight：直接覆盖
     * - fontSize：优先使用自定义值，否则从 baseFont 中提取
     * - fontFamily：从 baseFont 中提取（自定义样式不覆盖字体系列）
     *
     * @param baseFont - 基础字体字符串
     * @param style - 自定义样式（可选）
     * @returns CSS font 字符串
     */
    #buildNestedHeaderFont(baseFont: string, style: CellStyle | null): string {
        if (!style) return baseFont;

        const parts: string[] = [];

        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);

        if (style.fontSize) {
            parts.push(`${style.fontSize}`);
        } else {
            const sizeMatch = baseFont.match(/^[\d.]+px/);
            parts.push(sizeMatch ? sizeMatch[0] : `${CONFIG.DEFAULT_FONT_SIZE}px`);
        }

        const familyMatch = baseFont.match(/\s+(.+)$/);
        parts.push(familyMatch ? familyMatch[1] : CONFIG.DEFAULT_FONT_FAMILY);

        return parts.join(" ");
    }

    // ════════════════════════════════════════════════════════
    //  样式合并方法
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 合并基础样式和自定义样式
     *
     * 自定义样式覆盖基础样式，color 和 backgroundColor 独立处理
     * （优先使用自定义值，其次使用基础值）。
     *
     * @param baseStyle - 基础样式（来自 defaultStyle）
     * @param customStyle - 自定义样式（来自 rowStyle 等）
     * @returns 合并后的样式对象
     */
    #mergeHeaderStyle(baseStyle: CellStyle | null, customStyle: CellStyle | null): CellStyle {
        if (!customStyle || !baseStyle) return baseStyle || {};

        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle.color || undefined,
            backgroundColor: customStyle.backgroundColor || baseStyle.backgroundColor || undefined,
        };
    }

    // ════════════════════════════════════════════════════════
    //  绘图原语方法
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 绘制表头单元格背景
     *
     * 根据不同状态选择不同的填充色，优先级从高到低：
     * 1. 拖拽源（isSource）→ MOVE_SOURCE_FILL 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 2. 选区高亮（highlighted）→ HEADER_HIGHLIGHT_BG 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 3. 自定义背景色 → style.backgroundColor 背景 + style.color 文字
     * 4. 默认 → 仅设置文字颜色
     *
     * 注意：此方法会设置 ctx.fillStyle 为文字颜色，供后续 #drawHeaderText 使用。
     *
     * @param ctx - Canvas 2D 上下文
     * @param x - X 坐标
     * @param y - Y 坐标
     * @param w - 宽度
     * @param h - 高度
     * @param isSource - 是否为拖拽源
     * @param highlighted - 是否被选中高亮
     * @param style - 单元格样式
     */
    #drawHeaderCell(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        isSource: boolean,
        highlighted: boolean,
        style: CellStyle | null,
    ): void {
        if (isSource) {
            ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (highlighted) {
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (style?.backgroundColor) {
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = style.color || CONFIG.HEADER_TEXT_COLOR;
        } else {
            ctx.fillStyle = style?.color || CONFIG.HEADER_TEXT_COLOR;
        }
    }

    /**
     * @private 私有方法 - 绘制表头文字（支持自动省略）
     *
     * 当文字宽度超过 maxWidth 时，逐字符截断并添加 "..." 省略号。
     *
     * @param ctx - Canvas 2D 上下文
     * @param text - 文字内容
     * @param x - X 坐标（基线位置）
     * @param y - Y 坐标（基线位置）
     * @param color - 文字颜色（null 时使用当前 fillStyle）
     * @param font - CSS font 字符串
     * @param maxWidth - 最大宽度（超出则省略），null 时不限制
     * @param textAlign - 对齐方式
     */
    #drawHeaderText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        color: string | null | undefined,
        font: string,
        maxWidth: number | null,
        textAlign: CanvasTextAlign = "left",
    ): void {
        ctx.font = font || DEFAULT_FONT;
        ctx.textAlign = textAlign;
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

    // ════════════════════════════════════════════════════════
    //  坐标计算方法
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 计算起始列索引（考虑滚动和冻结）
     *
     * 冻结区域从第 0 列开始；非冻结区域从滚动偏移对应的列开始，
     * 且不小于 fixedCols（跳过冻结列）。
     *
     * @param vt - 视口坐标转换器
     * @param rc - 行列管理器
     * @param fixedCols - 冻结列数
     * @param isFrozen - 是否为冻结区域
     * @param clipW - 裁剪区域宽度
     * @returns 起始列索引
     */
    #calcStartCol(vt: ViewportTransform, rc: RowColManager, fixedCols: number, isFrozen: boolean, clipW: number): number {
        if (isFrozen) return 0;

        const scrollX = vt.scrollX;
        const dataOffset = vt.frozenColsW + scrollX;
        return Math.max(fixedCols, rc.colAt(dataOffset));
    }

    /**
     * @private 私有方法 - 计算结束列索引（考虑滚动和冻结）
     *
     * 冻结区域到 fixedCols 为止；非冻结区域到裁剪区域右边界对应的列。
     *
     * @param vt - 视口坐标转换器
     * @param rc - 行列管理器
     * @param fixedCols - 冻结列数
     * @param isFrozen - 是否为冻结区域
     * @param clipW - 裁剪区域宽度
     * @returns 结束列索引（不含）
     */
    #calcEndCol(vt: ViewportTransform, rc: RowColManager, fixedCols: number, isFrozen: boolean, clipW: number): number {
        if (isFrozen) return fixedCols;

        const scrollX = vt.scrollX;
        const dataEnd = vt.frozenColsW + scrollX + clipW;
        return Math.min(rc.colAt(dataEnd) + 1, rc.colCount);
    }

    // ════════════════════════════════════════════════════════
    //  选区线条绘制
    // ════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 绘制列选区高亮线（处理冻结边界分割）
     *
     * 选区可能跨越冻结区域和滚动区域，需要分别绘制。
     * 冻结区域内的选区线在冻结范围内裁剪，
     * 滚动区域内的选区线在滚动范围内裁剪。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param y - 选区线的 Y 坐标（列头底部）
     * @param viewW - 视口宽度
     * @param range - 选区范围
     * @param frozenColsW - 冻结列总宽度
     * @param fixedCols - 冻结列数
     */
    #drawColSelectionLines(
        ctx: CanvasRenderingContext2D,
        vt: ViewportTransform,
        y: number,
        viewW: number,
        range: SelectionRange,
        frozenColsW: number,
        fixedCols: number,
    ): void {
        const headerW = vt.headerW;

        if (fixedCols > 0) {
            this.#drawFrozenColSelection(ctx, vt, y, range, frozenColsW, fixedCols, headerW);
        }

        if (range.bottomCol >= fixedCols) {
            this.#drawScrollColSelection(ctx, vt, y, viewW, range, frozenColsW, fixedCols, headerW);
        }
    }

    /**
     * @private 私有方法 - 绘制冻结区域的列选区线
     *
     * 选区范围限制在冻结列范围内（0 到 fixedCols-1），
     * 绘制位置限制在 headerW 到 headerW + frozenColsW 之间。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param y - 选区线 Y 坐标
     * @param range - 选区范围
     * @param frozenColsW - 冻结列总宽度
     * @param fixedCols - 冻结列数
     * @param headerW - 行头宽度
     */
    #drawFrozenColSelection(
        ctx: CanvasRenderingContext2D,
        vt: ViewportTransform,
        y: number,
        range: SelectionRange,
        frozenColsW: number,
        fixedCols: number,
        headerW: number,
    ): void {
        const frozenStart = range.topCol;
        const frozenEnd = Math.min(range.bottomCol, fixedCols - 1);

        if (frozenStart > frozenEnd || frozenEnd < 0) return;

        const startX = vt.colToViewX(Math.max(frozenStart, 0));
        const endX = vt.colRightToViewX(frozenEnd);

        if (endX <= startX || endX <= headerW) return;

        this.#drawSelectionLine(ctx, Math.max(startX, headerW), y, Math.min(endX, headerW + frozenColsW) - Math.max(startX, headerW), true);
    }

    /**
     * @private 私有方法 - 绘制滚动区域的列选区线
     *
     * 选区范围从 fixedCols 开始，绘制位置限制在
     * headerW + frozenColsW 到 viewW 之间。
     *
     * @param ctx - Canvas 2D 上下文
     * @param vt - 视口坐标转换器
     * @param y - 选区线 Y 坐标
     * @param viewW - 视口宽度
     * @param range - 选区范围
     * @param frozenColsW - 冻结列总宽度
     * @param fixedCols - 冻结列数
     * @param headerW - 行头宽度
     */
    #drawScrollColSelection(
        ctx: CanvasRenderingContext2D,
        vt: ViewportTransform,
        y: number,
        viewW: number,
        range: SelectionRange,
        frozenColsW: number,
        fixedCols: number,
        headerW: number,
    ): void {
        const scrollStart = Math.max(range.topCol, fixedCols);
        const scrollEnd = range.bottomCol;

        const startX = vt.colToViewX(scrollStart);
        const endX = vt.colRightToViewX(scrollEnd);

        const clipLeft = headerW + frozenColsW;
        const clipRight = viewW;

        const visibleStart = Math.max(startX, clipLeft);
        const visibleEnd = Math.min(endX, clipRight);

        if (visibleEnd <= visibleStart) return;

        this.#drawSelectionLine(ctx, visibleStart, y, visibleEnd - visibleStart, true);
    }
}
