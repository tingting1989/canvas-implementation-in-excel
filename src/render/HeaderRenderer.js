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

import { CONFIG } from "../constants/config.js";
import { calcCenteredTextY } from "../utils/canvasUtils.js";
import { HeaderLayoutBuilder } from "./header/HeaderLayoutBuilder.js";
import { HeaderPainter } from "./header/HeaderPainter.js";
import { FrozenBoundaryInfo } from "./header/models/FrozenBoundaryInfo.js";
import { FONT_STYLE } from "../constants/enums/FontStyle.js";

/** 默认字体回退值 */
const DEFAULT_FONT = `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.DEFAULT_FONT_FAMILY}`;

/**
 * 表头渲染器
 *
 * 纯渲染工具类，无状态、无生命周期。
 * 由 HeaderLayer 调用，负责将表头数据绘制到 Canvas 上。
 */
export class HeaderRenderer {
    /** @type {Array<Function>} 列头扩展渲染器列表（插件注册的自定义绘制函数） */
    #columnHeaderRenderers;

    /** @type {HeaderLayoutBuilder} 布局构建器，负责将表头数据转换为 Fragment 列表 */
    #layoutBuilder;

    /** @type {HeaderPainter} 绘制器，负责将 Fragment 绘制到 Canvas */
    #painter;

    /**
     * @type {object|undefined} 当前拖拽指示器
     * 用于在拖拽移动列/行时标记源列/行并显示视觉反馈
     */
    _dragIndicator = undefined;

    constructor() {
        this.#columnHeaderRenderers = [];
        this.#layoutBuilder = new HeaderLayoutBuilder();
        this.#painter = new HeaderPainter();
    }

    // ─── 公共 API ──────────────────────────────────────────

    /**
     * 注册列头扩展渲染器（用于插件绘制自定义 UI）
     *
     * 扩展渲染器会在列头单元格绘制完成后被调用，
     * 可用于在列头上叠加自定义图标、筛选按钮等。
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
     *
     * 按顺序渲染列头、行头、左上角三个区域。
     * 渲染顺序确保行头和左上角覆盖在列头之上。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     * @param {object|null} dragIndicator - 拖拽指示器（列/行移动时的视觉反馈）
     */
    render(ctx, sheet, vt, viewW, viewH, dragIndicator = null) {
        this._dragIndicator = dragIndicator;
        const range = sheet.selection.getRange();

        this.#renderColumnHeaders(ctx, sheet, vt, viewW, range);
        this.#renderRowHeaders(ctx, sheet, vt, viewH, range);
        this.#renderCorner(ctx, vt, range);
    }

    // ════════════════════════════════════════════════════════
    //  列头渲染（走 Fragment 管线）
    // ════════════════════════════════════════════════════════

    /**
     * 渲染列头区域（包括冻结和非冻结部分）
     *
     * 流程：
     * 1. 填充列头背景
     * 2. 渲染非冻结区域的列头（受滚动影响）
     * 3. 渲染冻结区域的列头（固定不动）
     * 4. 绘制列选区高亮线（处理冻结边界分割）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {number} viewW
     * @param {Object} range - 当前选区范围
     */
    #renderColumnHeaders(ctx, sheet, vt, viewW, range) {
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const rowH = sheet.headerHeight || CONFIG.HEADER_HEIGHT;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);

        const nestedCount = sheet.getNestedHeaderRowCount();
        const totalHeaderH = vt.headerH;
        const frozenColsW = vt.frozenColsW;
        const fixedCols = vt.fixedCols;

        // 填充列头背景
        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(headerW, 0, viewW - headerW, totalHeaderH);

        // 构建共享配置，供冻结/非冻结区域共用
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

        // 渲染非冻结区域（滚动区域）
        this.#renderHeaderRegion(ctx, sheet, {
            ...baseConfig,
            clipX: headerW + frozenColsW,
            clipY: 0,
            clipW: viewW - headerW - frozenColsW,
            clipH: totalHeaderH,
            isFrozen: false,
        });

        // 渲染冻结区域（如果有冻结列）
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

        // 绘制选区高亮线（列移动拖拽时不绘制）
        if (!this._dragIndicator?.hasColumnMove()) {
            this.#drawColSelectionLines(ctx, vt, totalHeaderH, viewW, range, frozenColsW, fixedCols);
        }
    }

    /**
     * 在指定裁剪区域内渲染列头（统一走 Fragment 管线）
     *
     * Fragment 管线流程：
     * 1. 设置裁剪区域
     * 2. 计算可见列范围
     * 3. 由 HeaderLayoutBuilder 构建 Fragment 列表
     * 4. 为 Fragment 注入选区/拖拽状态
     * 5. 由 HeaderPainter 绘制所有 Fragment
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {Object} opts - 渲染配置
     * @param {import("./ViewportTransform.js").ViewportTransform} opts.vt
     * @param {Object} opts.rc - 行列管理器
     * @param {number} opts.clipX - 裁剪区域 X 起点
     * @param {number} opts.clipY - 裁剪区域 Y 起点
     * @param {number} opts.clipW - 裁剪区域宽度
     * @param {number} opts.clipH - 裁剪区域高度
     * @param {number} opts.rowH - 单层表头高度
     * @param {Object} opts.defaultStyle - 默认样式
     * @param {string} opts.headerFont - 表头字体
     * @param {number} opts.nestedCount - 嵌套表头层数
     * @param {Object} opts.range - 选区范围
     * @param {number} opts.fixedCols - 冻结列数
     * @param {boolean} opts.isFrozen - 是否为冻结区域
     */
    #renderHeaderRegion(ctx, sheet, opts) {
        const { vt, rc, clipX, clipY, clipW, clipH, rowH, defaultStyle, headerFont, nestedCount, range, fixedCols, isFrozen } = opts;

        // 设置裁剪区域，防止绘制溢出到其他区域
        ctx.save();
        this.#setClipRect(ctx, clipX, clipY, clipW, clipH);

        // 根据是否冻结计算可见列范围
        const sc = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
        const ec = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);

        // 构建绘制选项，传递给 Painter
        const paintOptions = {
            vt,
            rc,
            columnHeaderRenderers: this.#columnHeaderRenderers,
        };

        // 根据是否有嵌套表头选择不同的渲染路径
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
     * 渲染嵌套表头（多层）
     *
     * 每层表头独立构建 Fragment 列表并绘制。
     * 层级从上到下（layerIdx 从 0 开始），第 0 层为最顶层。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {Object} config
     * @param {number} config.layerCount - 嵌套层数
     * @param {number} config.rowH - 单层高度
     * @param {number} config.sc - 起始列
     * @param {number} config.ec - 结束列
     * @param {import("./ViewportTransform.js").ViewportTransform} config.vt
     * @param {import("../workbook/Sheet.js").Sheet} config.sheet
     * @param {Object} config.defaultStyle
     * @param {string} config.headerFont
     * @param {number} config.fixedCols
     * @param {Object} config.range
     * @param {Object} config.paintOptions
     */
    #renderNestedHeaders(ctx, sheet, config) {
        const { layerCount, rowH, sc, ec, vt, sheet: sh, defaultStyle, headerFont, fixedCols, range, paintOptions } = config;
        const frozenBoundary = new FrozenBoundaryInfo({ fixedCols, fixedRows: 0 });

        for (let layerIdx = 0; layerIdx < layerCount; layerIdx++) {
            const layerY = layerIdx * rowH;
            const layerData = sh.nestedHeaders[layerIdx];
            if (!Array.isArray(layerData)) continue;

            // 由 LayoutBuilder 将嵌套表头数据转换为 Fragment 列表
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
                defaultStyle,
                headerFont,
            });

            // 为 Fragment 注入选区高亮和拖拽源状态
            this.#enrichFragmentsWithState(fragments, range);

            // 由 Painter 绘制所有 Fragment
            this.#painter.paintAll(ctx, fragments, {
                ...paintOptions,
                isTopLayer: layerIdx === 0,
            });
        }
    }

    /**
     * 渲染简单表头（单层）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} config
     * @param {number} config.sc - 起始列
     * @param {number} config.ec - 结束列
     * @param {number} config.rowH - 表头高度
     * @param {import("./ViewportTransform.js").ViewportTransform} config.vt
     * @param {import("../workbook/Sheet.js").Sheet} config.sheet
     * @param {Object} config.defaultStyle
     * @param {string} config.headerFont
     * @param {Object} config.range
     * @param {Object} config.paintOptions
     */
    #renderSimpleHeader(ctx, config) {
        const { sc, ec, rowH, vt, sheet, defaultStyle, headerFont, range, paintOptions } = config;

        const fragments = this.#layoutBuilder.buildSimpleLayerFragments({
            sc,
            ec,
            layerY: 0,
            rowH,
            vt,
            sheet,
            defaultStyle,
            headerFont,
        });

        this.#enrichFragmentsWithState(fragments, range);
        this.#painter.paintAll(ctx, fragments, paintOptions);
    }

    /**
     * 为 Fragment 列表注入选区/拖拽状态
     *
     * 遍历每个 Fragment，设置：
     * - isSource：是否为列移动拖拽的源列
     * - isHighlighted：是否在当前选区范围内（嵌套表头不参与高亮）
     *
     * @param {Array<Object>} fragments - Fragment 列表
     * @param {Object} range - 当前选区范围 { topCol, bottomCol, ... }
     */
    #enrichFragmentsWithState(fragments, range) {
        for (const frag of fragments) {
            if (!frag) continue;

            const col = frag.visStartCol;
            // 标记是否为拖拽源列
            frag.isSource = this._dragIndicator?.isColumnSource(col) ?? false;

            // 嵌套表头的 Fragment 有 sourceCell 属性，不参与选区高亮
            const isNested = !!frag.sourceCell;
            frag.isHighlighted = !isNested && col >= range.topCol && col <= range.bottomCol;
        }
    }

    // ════════════════════════════════════════════════════════
    //  行头渲染（直接逐行绘制）
    // ════════════════════════════════════════════════════════

    /**
     * 渲染行头区域（包括冻结和非冻结部分）
     *
     * 流程：
     * 1. 填充行头背景
     * 2. 渲染非冻结区域的行头（受滚动影响）
     * 3. 渲染冻结区域的行头（固定不动）
     * 4. 绘制行选区高亮线
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {number} viewH
     * @param {Object} range - 当前选区范围
     */
    #renderRowHeaders(ctx, sheet, vt, viewH, range) {
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);
        const frozenRowsH = vt.frozenRowsH;
        const fixedRows = vt.fixedRows;

        // 填充行头背景
        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, headerH, headerW, viewH - headerH);

        // 共享配置
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

        // 渲染非冻结行头（滚动区域）
        this.#renderRowHeaderRegion(ctx, {
            ...baseConfig,
            clipY: headerH + frozenRowsH,
            clipH: viewH - headerH - frozenRowsH,
            isFrozen: false,
        });

        // 渲染冻结行头（如果有冻结行）
        if (frozenRowsH > 0) {
            this.#renderRowHeaderRegion(ctx, {
                ...baseConfig,
                clipY: headerH,
                clipH: frozenRowsH,
                isFrozen: true,
            });
        }

        // 绘制行选区高亮线（行移动拖拽时不绘制）
        if (!this._dragIndicator?.hasRowMove()) {
            const topRowY = vt.rowToViewY(range.topRow);
            const bottomRowBottom = vt.rowBottomToViewY(range.bottomRow);
            this.#drawSelectionLine(ctx, headerW, topRowY, bottomRowBottom - topRowY, false);
        }
    }

    /**
     * 在指定裁剪区域内渲染行头
     *
     * 逐行遍历可见行，对每行调用 #drawSingleRowHeader 绘制。
     * 左侧边框只在第一行绘制一次，避免重复。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} opts - 渲染配置
     * @param {import("./ViewportTransform.js").ViewportTransform} opts.vt
     * @param {Object} opts.rc - 行列管理器
     * @param {number} opts.clipY - 裁剪区域 Y 起点
     * @param {number} opts.clipH - 裁剪区域高度
     * @param {number} opts.headerW - 行头宽度
     * @param {number} opts.headerH - 列头高度
     * @param {Object} opts.defaultStyle - 默认样式
     * @param {string} opts.headerFont - 表头字体
     * @param {Object} opts.range - 选区范围
     * @param {number} opts.fixedRows - 冻结行数
     * @param {boolean} opts.isFrozen - 是否为冻结区域
     * @param {import("../workbook/Sheet.js").Sheet} opts.sheet
     */
    #renderRowHeaderRegion(ctx, opts) {
        const { vt, rc, clipY, clipH, headerW, headerH, defaultStyle, headerFont, range, fixedRows, isFrozen, sheet } = opts;
        const scrollY = isFrozen ? 0 : vt.scrollY;

        // 设置裁剪区域
        ctx.save();
        this.#setClipRect(ctx, 0, clipY, headerW, clipH);

        // 计算可见行范围
        const startRow = isFrozen ? 0 : Math.max(fixedRows, rc.rowAt(scrollY));
        const dataViewH = vt.frozenRowsH > 0 ? clipH + vt.frozenRowsH : clipH;
        const endRow = isFrozen ? fixedRows : Math.min(rc.rowAt(scrollY + dataViewH) + 1, rc.rowCount);

        // 预计算左侧边框终点（只画一次）
        const lastRowY = vt.rowToViewY(endRow - 1) + rc.getRowHeight(endRow - 1);
        let leftBorderDrawn = false;

        // 逐行渲染
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

            // 第一行绘制后标记左侧边框已绘制
            if (r === startRow) {
                leftBorderDrawn = true;
            }
        }

        ctx.restore();
    }

    /**
     * 绘制单个行头单元格
     *
     * 包含：背景填充 → 行号文字 → 边框（右侧 + 底部 + 左侧）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {Object} config
     * @param {number} config.r - 当前行索引
     * @param {import("./ViewportTransform.js").ViewportTransform} config.vt
     * @param {Object} config.rc - 行列管理器
     * @param {number} config.headerW - 行头宽度
     * @param {number} config.headerH - 列头高度
     * @param {Object} config.defaultStyle - 默认样式
     * @param {string} config.headerFont - 表头字体
     * @param {Object} config.range - 选区范围
     * @param {number} config.startRow - 可见区域起始行
     * @param {number} config.lastRowY - 最后一行的底部 Y 坐标
     * @param {boolean} config.leftBorderDrawn - 左侧边框是否已绘制
     */
    #drawSingleRowHeader(ctx, sheet, config) {
        const { r, vt, rc, headerW, defaultStyle, headerFont, range, startRow, lastRowY, leftBorderDrawn } = config;

        const y = vt.rowToViewY(r);
        const h = rc.getRowHeight(r);
        // 跳过高度为 0 的隐藏行
        if (h <= 0) return;

        // 计算行头状态
        const isSource = this._dragIndicator?.isRowSource(r) ?? false;
        const highlighted = r >= range.topRow && r <= range.bottomRow;
        // 获取行级自定义样式并合并默认样式
        const rowStyle = sheet.getRowHeaderStyle(r);
        const mergedStyle = this.#mergeHeaderStyle(defaultStyle, rowStyle);

        // 绘制单元格背景（根据状态选择不同填充色）
        this.#drawHeaderCell(ctx, 0, y, headerW, h, isSource, highlighted, mergedStyle);

        // 绘制行号文字（居中对齐）
        const textFont = this.#buildNestedHeaderFont(headerFont, rowStyle);
        this.#drawHeaderText(
            ctx,
            sheet.getRowHeader(r),
            headerW / 2,
            calcCenteredTextY(y, h, textFont),
            mergedStyle?.color,
            textFont,
            null,
            "center",
        );

        // 绘制边框（右侧分隔线 + 底部网格线 + 左侧边界线）
        this.#drawRowBorders(ctx, { x: 0, y, w: headerW, h, isFirstRow: r === startRow, lastRowY });
    }

    /**
     * 绘制行头边框
     *
     * 三条边框：
     * - 右侧：每行都画，使用 HEADER_BORDER_COLOR（分隔行头和数据区域）
     * - 底部：每行都画，使用 GRID_COLOR（行间分隔线）
     * - 左侧：只在第一行画一次，使用 HEADER_BORDER_COLOR（整个行头区域的左边界）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} params
     * @param {number} params.x - X 坐标
     * @param {number} params.y - Y 坐标
     * @param {number} params.w - 宽度
     * @param {number} params.h - 高度
     * @param {boolean} params.isFirstRow - 是否为可见区域的第一行
     * @param {number} params.lastRowY - 最后一行底部的 Y 坐标（左侧边框终点）
     */
    #drawRowBorders(ctx, { x, y, w, h, isFirstRow, lastRowY }) {
        // 右侧边框（分隔行头和数据区域）- 每行都画
        this.#drawSeparator(ctx, x + w, y, x + w, y + h);

        // 底部分隔线（行与行之间的分割线）- 使用网格线样式
        this.#drawGridLine(ctx, x, y + h, x + w, y + h);

        // 左侧边框（整个区域的左边界）- 只在第一行画一次
        if (isFirstRow) {
            this.#drawSeparator(ctx, x, y, x, lastRowY);
        }
    }

    // ════════════════════════════════════════════════════════
    //  左上角渲染
    // ════════════════════════════════════════════════════════

    /**
     * 渲染左上角区域（全选按钮位置）
     *
     * 当整张表被全选时（topRow=0 且 topCol=0），背景色加深。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {Object} range - 当前选区范围
     */
    #renderCorner(ctx, vt, range) {
        const { headerW, headerH } = vt;
        // 判断是否全选（选区从第 0 行第 0 列开始）
        const allSelected = range.topRow === 0 && range.topCol === 0;

        // 填充背景（全选时使用高亮背景色）
        ctx.fillStyle = allSelected ? CONFIG.HEADER_HIGHLIGHT_BG : CONFIG.HEADER_BG;
        ctx.fillRect(0, 0, headerW, headerH);

        // 绘制边框
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.strokeRect(0, 0, headerW, headerH);
    }

    // ════════════════════════════════════════════════════════
    //  Canvas 工具方法
    // ════════════════════════════════════════════════════════

    /**
     * 设置矩形裁剪区域
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x - 裁剪区域 X 起点
     * @param {number} y - 裁剪区域 Y 起点
     * @param {number} w - 裁剪区域宽度
     * @param {number} h - 裁剪区域高度
     */
    #setClipRect(ctx, x, y, w, h) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
    }

    /**
     * 绘制分隔线（使用 HEADER_BORDER_COLOR）
     *
     * 用于绘制行头/列头与数据区域之间的边界线。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x1 - 起点 X
     * @param {number} y1 - 起点 Y
     * @param {number} x2 - 终点 X
     * @param {number} y2 - 终点 Y
     */
    #drawSeparator(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /**
     * 绘制网格线（使用 GRID_COLOR，与数据区域一致）
     *
     * 自动保存/恢复 Canvas 样式，避免影响后续绘制。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x1 - 起点 X
     * @param {number} y1 - 起点 Y
     * @param {number} x2 - 终点 X
     * @param {number} y2 - 终点 Y
     */
    #drawGridLine(ctx, x1, y1, x2, y2) {
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
     * 绘制选区高亮线
     *
     * 使用 SELECTION_COLOR 和 SELECTION_LINE_WIDTH 绘制，
     * 支持水平和垂直两个方向。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} origin - 主轴起点坐标
     * @param {number} origin2 - 副轴起点坐标
     * @param {number} length - 线段长度
     * @param {boolean} horizontal - true 为水平线，false 为垂直线
     */
    #drawSelectionLine(ctx, origin, origin2, length, horizontal) {
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
     * 临时修改 strokeStyle，执行回调后恢复
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} style - 新的 strokeStyle
     * @param {Function} fn - 回调函数
     */
    #withStrokeStyle(ctx, style, fn) {
        const original = ctx.strokeStyle;
        ctx.strokeStyle = style;
        try {
            fn();
        } finally {
            ctx.strokeStyle = original;
        }
    }

    /**
     * 临时修改 lineWidth，执行回调后恢复
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width - 新的 lineWidth
     * @param {Function} fn - 回调函数
     */
    #withLineWidth(ctx, width, fn) {
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
     * 从默认样式构建表头字体字符串
     *
     * 将 fontStyle / fontWeight / fontSize / fontFamily 组合为 CSS font 字符串。
     * 例如："italic bold 13px Arial"
     *
     * @param {Object|null} defaultStyle - 单元格默认样式
     * @returns {string} CSS font 字符串
     */
    #buildHeaderFont(defaultStyle) {
        if (!defaultStyle) return DEFAULT_FONT;

        const fontStyle = defaultStyle.fontStyle === FONT_STYLE.ITALIC ? FONT_STYLE.ITALIC : "";
        const fontWeight = defaultStyle.fontWeight === FONT_STYLE.BOLD ? FONT_STYLE.BOLD : "";
        const fontSize = defaultStyle.fontSize || CONFIG.DEFAULT_FONT_SIZE;
        const fontFamily = defaultStyle.fontFamily || CONFIG.DEFAULT_FONT_FAMILY;

        // 过滤空值后用空格连接
        return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].filter(Boolean).join(" ");
    }

    /**
     * 构建嵌套表头/行头的覆盖字体
     *
     * 在基础字体上应用自定义样式的覆盖：
     * - fontStyle / fontWeight：直接覆盖
     * - fontSize：优先使用自定义值，否则从 baseFont 中提取
     * - fontFamily：从 baseFont 中提取（自定义样式不覆盖字体系列）
     *
     * @param {string} baseFont - 基础字体字符串
     * @param {Object|null} style - 自定义样式（可选）
     * @returns {string} CSS font 字符串
     */
    #buildNestedHeaderFont(baseFont, style) {
        if (!style) return baseFont;

        const parts = [];

        // 自定义样式属性
        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);

        // 字体大小：优先使用自定义，否则从 baseFont 提取
        if (style.fontSize) {
            parts.push(style.fontSize);
        } else {
            const sizeMatch = baseFont.match(/^[\d.]+px/);
            parts.push(sizeMatch ? sizeMatch[0] : `${CONFIG.DEFAULT_FONT_SIZE}px`);
        }

        // 字体系列：从 baseFont 提取（保持与基础字体一致）
        const familyMatch = baseFont.match(/\s+(.+)$/);
        parts.push(familyMatch ? familyMatch[1] : CONFIG.DEFAULT_FONT_FAMILY);

        return parts.join(" ");
    }

    // ════════════════════════════════════════════════════════
    //  样式合并方法
    // ════════════════════════════════════════════════════════

    /**
     * 合并基础样式和自定义样式
     *
     * 自定义样式覆盖基础样式，color 和 backgroundColor 独立处理
     * （优先使用自定义值，其次使用基础值）。
     *
     * @param {Object} baseStyle - 基础样式（来自 defaultStyle）
     * @param {Object|null} customStyle - 自定义样式（来自 rowStyle 等）
     * @returns {Object} 合并后的样式对象
     */
    #mergeHeaderStyle(baseStyle, customStyle) {
        if (!customStyle || !baseStyle) return baseStyle || {};

        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle.color || null,
            backgroundColor: customStyle.backgroundColor || baseStyle.backgroundColor || null,
        };
    }

    // ════════════════════════════════════════════════════════
    //  绘图原语方法
    // ════════════════════════════════════════════════════════

    /**
     * 绘制表头单元格背景
     *
     * 根据不同状态选择不同的填充色，优先级从高到低：
     * 1. 拖拽源（isSource）→ MOVE_SOURCE_FILL 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 2. 选区高亮（highlighted）→ HEADER_HIGHLIGHT_BG 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 3. 自定义背景色 → style.backgroundColor 背景 + style.color 文字
     * 4. 默认 → 仅设置文字颜色
     *
     * 注意：此方法会设置 ctx.fillStyle 为文字颜色，供后续 #drawHeaderText 使用。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {boolean} isSource - 是否为拖拽源
     * @param {boolean} highlighted - 是否被选中高亮
     * @param {Object} style - 单元格样式
     */
    #drawHeaderCell(ctx, x, y, w, h, isSource, highlighted, style) {
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
     * 绘制表头文字（支持自动省略）
     *
     * 当文字宽度超过 maxWidth 时，逐字符截断并添加 "..." 省略号。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text - 文字内容
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标（基线位置）
     * @param {string|null} color - 文字颜色（null 时使用当前 fillStyle）
     * @param {string} font - CSS font 字符串
     * @param {number|null} maxWidth - 最大宽度（超出则省略），null 时不限制
     * @param {string} [textAlign="left"] - 对齐方式
     */
    #drawHeaderText(ctx, text, x, y, color, font, maxWidth, textAlign = "left") {
        ctx.font = font || DEFAULT_FONT;
        ctx.textAlign = textAlign;
        if (color) ctx.fillStyle = color;

        if (maxWidth && ctx.measureText(text).width > maxWidth) {
            // 文字超出宽度，逐字符截断并添加省略号
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
     * 计算起始列索引（考虑滚动和冻结）
     *
     * 冻结区域从第 0 列开始；非冻结区域从滚动偏移对应的列开始，
     * 且不小于 fixedCols（跳过冻结列）。
     *
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {Object} rc - 行列管理器
     * @param {number} fixedCols - 冻结列数
     * @param {boolean} isFrozen - 是否为冻结区域
     * @param {number} clipW - 裁剪区域宽度
     * @returns {number} 起始列索引
     */
    #calcStartCol(vt, rc, fixedCols, isFrozen, clipW) {
        if (isFrozen) return 0;

        const scrollX = vt.scrollX;
        const dataOffset = vt.frozenColsW + scrollX;
        return Math.max(fixedCols, rc.colAt(dataOffset));
    }

    /**
     * 计算结束列索引（考虑滚动和冻结）
     *
     * 冻结区域到 fixedCols 为止；非冻结区域到裁剪区域右边界对应的列。
     *
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {Object} rc - 行列管理器
     * @param {number} fixedCols - 冻结列数
     * @param {boolean} isFrozen - 是否为冻结区域
     * @param {number} clipW - 裁剪区域宽度
     * @returns {number} 结束列索引（不含）
     */
    #calcEndCol(vt, rc, fixedCols, isFrozen, clipW) {
        if (isFrozen) return fixedCols;

        const scrollX = vt.scrollX;
        const dataEnd = vt.frozenColsW + scrollX + clipW;
        return Math.min(rc.colAt(dataEnd) + 1, rc.colCount);
    }

    // ════════════════════════════════════════════════════════
    //  选区线条绘制
    // ════════════════════════════════════════════════════════

    /**
     * 绘制列选区高亮线（处理冻结边界分割）
     *
     * 选区可能跨越冻结区域和滚动区域，需要分别绘制。
     * 冻结区域内的选区线在冻结范围内裁剪，
     * 滚动区域内的选区线在滚动范围内裁剪。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {number} y - 选区线的 Y 坐标（列头底部）
     * @param {number} viewW - 视口宽度
     * @param {Object} range - 选区范围
     * @param {number} frozenColsW - 冻结列总宽度
     * @param {number} fixedCols - 冻结列数
     */
    #drawColSelectionLines(ctx, vt, y, viewW, range, frozenColsW, fixedCols) {
        const headerW = vt.headerW;

        // 冻结区域内的选区线
        if (fixedCols > 0) {
            this.#drawFrozenColSelection(ctx, vt, y, range, frozenColsW, fixedCols, headerW);
        }

        // 滚动区域内的选区线
        if (range.bottomCol >= fixedCols) {
            this.#drawScrollColSelection(ctx, vt, y, viewW, range, frozenColsW, fixedCols, headerW);
        }
    }

    /**
     * 绘制冻结区域的列选区线
     *
     * 选区范围限制在冻结列范围内（0 到 fixedCols-1），
     * 绘制位置限制在 headerW 到 headerW + frozenColsW 之间。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {number} y - 选区线 Y 坐标
     * @param {Object} range - 选区范围
     * @param {number} frozenColsW - 冻结列总宽度
     * @param {number} fixedCols - 冻结列数
     * @param {number} headerW - 行头宽度
     */
    #drawFrozenColSelection(ctx, vt, y, range, frozenColsW, fixedCols, headerW) {
        const frozenStart = range.topCol;
        const frozenEnd = Math.min(range.bottomCol, fixedCols - 1);

        // 选区不在冻结范围内，跳过
        if (frozenStart > frozenEnd || frozenEnd < 0) return;

        const startX = vt.colToViewX(Math.max(frozenStart, 0));
        const endX = vt.colRightToViewX(frozenEnd);

        // 起点在行头区域内或终点在行头左侧，不可见
        if (endX <= startX || endX <= headerW) return;

        // 绘制冻结区域内的选区线，限制在冻结范围内
        this.#drawSelectionLine(ctx, Math.max(startX, headerW), y, Math.min(endX, headerW + frozenColsW) - Math.max(startX, headerW), true);
    }

    /**
     * 绘制滚动区域的列选区线
     *
     * 选区范围从 fixedCols 开始，绘制位置限制在
     * headerW + frozenColsW 到 viewW 之间。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("./ViewportTransform.js").ViewportTransform} vt
     * @param {number} y - 选区线 Y 坐标
     * @param {number} viewW - 视口宽度
     * @param {Object} range - 选区范围
     * @param {number} frozenColsW - 冻结列总宽度
     * @param {number} fixedCols - 冻结列数
     * @param {number} headerW - 行头宽度
     */
    #drawScrollColSelection(ctx, vt, y, viewW, range, frozenColsW, fixedCols, headerW) {
        const scrollStart = Math.max(range.topCol, fixedCols);
        const scrollEnd = range.bottomCol;

        const startX = vt.colToViewX(scrollStart);
        const endX = vt.colRightToViewX(scrollEnd);

        // 计算可视范围（滚动区域的左右边界）
        const clipLeft = headerW + frozenColsW;
        const clipRight = viewW;

        // 裁剪到可视范围
        const visibleStart = Math.max(startX, clipLeft);
        const visibleEnd = Math.min(endX, clipRight);

        if (visibleEnd <= visibleStart) return;

        this.#drawSelectionLine(ctx, visibleStart, y, visibleEnd - visibleStart, true);
    }
}
