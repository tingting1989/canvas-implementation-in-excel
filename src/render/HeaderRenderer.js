/**
 * 表头渲染器
 *
 * 负责渲染工作表的三个表头区域：
 * - 列头（Column Headers）：顶部的列标识（A, B, C...）
 * - 行头（Row Headers）：左侧的行号（1, 2, 3...）
 * - 左上角（Corner）：全选按钮区域
 *
 * 渲染管线：
 * 1. 列头 → 走 Fragment 管线（支持嵌套表头）
 * 2. 行头 → 直接逐行渲染（支持自定义样式）
 * 3. 左上角 → 简单矩形填充 + 边框
 *
 * @module render/HeaderRenderer
 */

import { CONFIG } from "@/constants/config";
import { calcCenteredTextY } from "@/utils/canvasUtils";
import { HeaderLayoutBuilder } from "./header/HeaderLayoutBuilder.js";
import { HeaderPainter } from "./header/HeaderPainter.js";
import { FrozenBoundaryInfo } from "./header/models/FrozenBoundaryInfo.js";
import { FONT_STYLE } from "@/constants/enums/FontStyle.js";

/** 默认字体回退值 */
const DEFAULT_FONT = `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.DEFAULT_FONT_FAMILY}`;

export class HeaderRenderer {
    constructor() {
        /** @type {Array<Function>} 列头扩展渲染器列表 */
        this.#columnHeaderRenderers = [];

        /** @type {HeaderLayoutBuilder} 布局构建器 */
        this.#layoutBuilder = new HeaderLayoutBuilder();

        /** @type {HeaderPainter} 绘制器 */
        this.#painter = new HeaderPainter();

        /** @type {object|undefined} 当前拖拽指示器 */
        this._dragIndicator = undefined;
    }

    #columnHeaderRenderers;
    #layoutBuilder;
    #painter;

    // ─── 公共 API ──────────────────────────────────────────

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
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     * @param {object|null} dragIndicator - 拖拽指示器
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

        // 填充背景
        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(headerW, 0, viewW - headerW, totalHeaderH);

        // 构建共享配置
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

        // 渲染非冻结区域
        this.#renderHeaderRegion(ctx, sheet, {
            ...baseConfig,
            clipX: headerW + frozenColsW,
            clipY: 0,
            clipW: viewW - headerW - frozenColsW,
            clipH: totalHeaderH,
            isFrozen: false,
        });

        // 渲染冻结区域（如果有）
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

        // 绘制选区高亮线
        if (!this._dragIndicator?.hasColumnMove()) {
            this.#drawColSelectionLines(ctx, vt, totalHeaderH, viewW, range, frozenColsW, fixedCols);
        }
    }

    /**
     * 在指定裁剪区域内渲染列头（统一走 Fragment 管线）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {object} opts - 渲染配置
     */
    #renderHeaderRegion(ctx, sheet, opts) {
        const { vt, rc, clipX, clipY, clipW, clipH, rowH, defaultStyle, headerFont, nestedCount, range, fixedCols, isFrozen } = opts;

        // 设置裁剪区域
        ctx.save();
        this.#setClipRect(ctx, clipX, clipY, clipW, clipH);

        // 计算可见列范围
        const sc = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
        const ec = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);

        // 构建和绘制 Fragments
        const paintOptions = {
            vt,
            rc,
            columnHeaderRenderers: this.#columnHeaderRenderers,
        };

        if (nestedCount > 0) {
            this.#renderNestedHeaders(ctx, sheet, { layerCount: nestedCount, rowH, sc, ec, vt, sheet, defaultStyle, headerFont, fixedCols, range, paintOptions });
        } else {
            this.#renderSimpleHeader(ctx, { sc, ec, rowH, vt, sheet, defaultStyle, headerFont, range, paintOptions });
        }

        ctx.restore();
    }

    /**
     * 渲染嵌套表头（多层）
     */
    #renderNestedHeaders(ctx, sheet, config) {
        const { layerCount, rowH, sc, ec, vt, sheet: sh, defaultStyle, headerFont, fixedCols, range, paintOptions } = config;
        const frozenBoundary = new FrozenBoundaryInfo({ fixedCols, fixedRows: 0 });

        for (let layerIdx = 0; layerIdx < layerCount; layerIdx++) {
            const layerY = layerIdx * rowH;
            const layerData = sh.nestedHeaders[layerIdx];
            if (!Array.isArray(layerData)) continue;

            // 构建 Fragments
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

            // 注入状态
            this.#enrichFragmentsWithState(fragments, range);

            // 绘制
            this.#painter.paintAll(ctx, fragments, {
                ...paintOptions,
                isTopLayer: layerIdx === 0,
            });
        }
    }

    /**
     * 渲染简单表头（单层）
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
     * @param {Fragment[]} fragments
     * @param {object} range
     */
    #enrichFragmentsWithState(fragments, range) {
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
     * 渲染行头区域（包括冻结和非冻结部分）
     */
    #renderRowHeaders(ctx, sheet, vt, viewH, range) {
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);
        const frozenRowsH = vt.frozenRowsH;
        const fixedRows = vt.fixedRows;

        // 填充背景
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

        // 渲染非冻结行头
        this.#renderRowHeaderRegion(ctx, {
            ...baseConfig,
            clipY: headerH + frozenRowsH,
            clipH: viewH - headerH - frozenRowsH,
            isFrozen: false,
        });

        // 渲染冻结行头（如果有）
        if (frozenRowsH > 0) {
            this.#renderRowHeaderRegion(ctx, {
                ...baseConfig,
                clipY: headerH,
                clipH: frozenRowsH,
                isFrozen: true,
            });
        }

        // 绘制行选区高亮线
        if (!this._dragIndicator?.hasRowMove()) {
            const topRowY = vt.rowToViewY(range.topRow);
            const bottomRowBottom = vt.rowBottomToViewY(range.bottomRow);
            this.#drawSelectionLine(ctx, headerW, topRowY, bottomRowBottom - topRowY, false);
        }
    }

    /**
     * 在指定区域内渲染行头
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} opts - 渲染配置
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
            this.#drawSingleRowHeader(ctx, sheet, { r, vt, rc, headerW, headerH, defaultStyle, headerFont, range, startRow, lastRowY, leftBorderDrawn });
            
            // 标记左侧边框已绘制（第一行之后）
            if (r === startRow) {
                leftBorderDrawn = true;
            }
        }

        ctx.restore();
    }

    /**
     * 绘制单个行头单元格
     */
    #drawSingleRowHeader(ctx, sheet, config) {
        const { r, vt, rc, headerW, defaultStyle, headerFont, range, startRow, lastRowY, leftBorderDrawn } = config;

        const y = vt.rowToViewY(r);
        const h = rc.getRowHeight(r);
        if (h <= 0) return;

        // 计算状态
        const isSource = this._dragIndicator?.isRowSource(r) ?? false;
        const highlighted = r >= range.topRow && r <= range.bottomRow;
        const rowStyle = sheet.getRowHeaderStyle(r);
        const mergedStyle = this.#mergeHeaderStyle(defaultStyle, rowStyle);

        // 绘制单元格背景
        this.#drawHeaderCell(ctx, 0, y, headerW, h, isSource, highlighted, mergedStyle);

        // 绘制行号文字
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

        // 绘制边框
        this.#drawRowBorders(ctx, { x: 0, y, w: headerW, h, isFirstRow: r === startRow, lastRowY });
    }

    /**
     * 绘制行头边框（右侧 + 底部 + 左侧）
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
     */
    #renderCorner(ctx, vt, range) {
        const { headerW, headerH } = vt;
        const allSelected = range.topRow === 0 && range.topCol === 0;

        // 填充背景
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
     */
    #setClipRect(ctx, x, y, w, h) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
    }

    /**
     * 绘制分隔线（使用 HEADER_BORDER_COLOR）
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
     * @param {object|null} defaultStyle - 单元格默认样式
     * @returns {string} CSS font 字符串
     */
    #buildHeaderFont(defaultStyle) {
        if (!defaultStyle) return DEFAULT_FONT;

        const fontStyle = defaultStyle.fontStyle === FONT_STYLE.ITALIC ? FONT_STYLE.ITALIC : "";
        const fontWeight = defaultStyle.fontWeight === FONT_STYLE.BOLD ? FONT_STYLE.BOLD : "";
        const fontSize = defaultStyle.fontSize || CONFIG.DEFAULT_FONT_SIZE;
        const fontFamily = defaultStyle.fontFamily || CONFIG.DEFAULT_FONT_FAMILY;

        return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].filter(Boolean).join(" ");
    }

    /**
     * 构建嵌套表头的覆盖字体
     *
     * @param {string} baseFont - 基础字体字符串
     * @param {object|null} style - 自定义样式（可选）
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
        
        // 字体系列：从 baseFont 提取
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
     * @param {object} baseStyle - 基础样式（来自 defaultStyle）
     * @param {object|null} customStyle - 自定义样式（来自 rowStyle 等）
     * @returns {object} 合并后的样式对象
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
     * 根据不同状态（拖拽源、高亮、自定义背景）选择不同的填充色。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {boolean} isSource - 是否为拖拽源
     * @param {boolean} highlighted - 是否被选中高亮
     * @param {object} style - 单元格样式
     */
    #drawHeaderCell(ctx, x, y, w, h, isSource, highlighted, style) {
        // 优先级：拖拽源 > 高亮 > 自定义背景 > 默认
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
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text - 文字内容
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标（基线位置）
     * @param {string|null} color - 文字颜色
     * @param {string} font - CSS font 字符串
     * @param {number|null} maxWidth - 最大宽度（超出则省略）
     * @param {string} [textAlign="left"] - 对齐方式
     */
    #drawHeaderText(ctx, text, x, y, color, font, maxWidth, textAlign = "left") {
        ctx.font = font || DEFAULT_FONT;
        ctx.textAlign = textAlign;
        if (color) ctx.fillStyle = color;

        if (maxWidth && ctx.measureText(text).width > maxWidth) {
            // 文字超出宽度，添加省略号
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
     */
    #calcStartCol(vt, rc, fixedCols, isFrozen, clipW) {
        if (isFrozen) return 0;

        const scrollX = vt.scrollX;
        const dataOffset = vt.frozenColsW + scrollX;
        return Math.max(fixedCols, rc.colAt(dataOffset));
    }

    /**
     * 计算结束列索引（考虑滚动和冻结）
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
     */
    #drawColSelectionLines(ctx, vt, y, viewW, range, frozenColsW, fixedCols) {
        const headerW = vt.headerW;

        // 冻结区域内的选区
        if (fixedCols > 0) {
            this.#drawFrozenColSelection(ctx, vt, y, range, frozenColsW, fixedCols, headerW);
        }

        // 滚动区域内的选区
        if (range.bottomCol >= fixedCols) {
            this.#drawScrollColSelection(ctx, vt, y, viewW, range, frozenColsW, fixedCols, headerW);
        }
    }

    /**
     * 绘制冻结区域的列选区线
     */
    #drawFrozenColSelection(ctx, vt, y, range, frozenColsW, fixedCols, headerW) {
        const frozenStart = range.topCol;
        const frozenEnd = Math.min(range.bottomCol, fixedCols - 1);

        if (frozenStart > frozenEnd || frozenEnd < 0) return;

        const startX = vt.colToViewX(Math.max(frozenStart, 0));
        const endX = vt.colRightToViewX(frozenEnd);

        if (endX <= startX || endX <= headerW) return;

        this.#drawSelectionLine(
            ctx,
            Math.max(startX, headerW),
            y,
            Math.min(endX, headerW + frozenColsW) - Math.max(startX, headerW),
            true,
        );
    }

    /**
     * 绘制滚动区域的列选区线
     */
    #drawScrollColSelection(ctx, vt, y, viewW, range, frozenColsW, fixedCols, headerW) {
        const scrollStart = Math.max(range.topCol, fixedCols);
        const scrollEnd = range.bottomCol;

        const startX = vt.colToViewX(scrollStart);
        const endX = vt.colRightToViewX(scrollEnd);

        // 计算可视范围
        const clipLeft = headerW + frozenColsW;
        const clipRight = viewW;

        const visibleStart = Math.max(startX, clipLeft);
        const visibleEnd = Math.min(endX, clipRight);

        if (visibleEnd <= visibleStart) return;

        this.#drawSelectionLine(ctx, visibleStart, y, visibleEnd - visibleStart, true);
    }
}