import { ERROR_CODE, errorHandler } from "@/core/ErrorHandler";
import { CONFIG } from "@/constants/config";
import { isObject, isString } from "@/utils/utils";

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
                const colStyle = sheet.getColHeaderStyle(c);
                const mergedStyle = this.#mergeHeaderStyle(defaultStyle, colStyle);
                this.#drawHeaderCell(ctx, x, clipY, w, rowH, isSource, highlighted, mergedStyle);

                const textFont = this.#buildNestedHeaderFont(headerFont, colStyle);
                const textAlign = colStyle?.textAlign || "left";
                const cp = sheet.cellPadding;
                const textX = this.#calculateTextX(x, w, textAlign, cp);
                this.#drawHeaderText(ctx, sheet.getColHeader(c), textX, clipY + rowH - 8, mergedStyle?.color, textFont, w - cp * 2, textAlign);

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
        const dataEnd = frozenColsW + scrollX + clipW;
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
        const cp = sheet.cellPadding;

        for (let layerIdx = 0; layerIdx < nestedCount; layerIdx++) {
            const layerY = layerIdx * rowH;
            const row = sheet.nestedHeaders[layerIdx];
            if (!Array.isArray(row)) continue;

            let consumed = 0;
            for (let i = 0; i < row.length; i++) {
                const item = row[i];
                const label = isString(item) ? item : (item?.label ?? "");
                const colspan = item && isObject(item) && item.colspan ? item.colspan : 1;
                const style = item?.style || null;

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

                const x = vt.colToViewX(visibleStartCol);
                const rightX = vt.colRightToViewX(visEnd);
                const totalW = rightX - x;

                if (totalW <= 0) continue;

                const isSource = this._dragIndicator?.isColumnSource(startCol) ?? false;
                const mergedStyle = this.#mergeHeaderStyle(defaultStyle, style);

                // 判断单元格是否跨越冻结/非冻结边界
                const crossesFrozenBoundary = vt.fixedCols > 0 && startCol < vt.fixedCols && endCol >= vt.fixedCols;

                this.#drawStyledHeaderCell(ctx, x, layerY, totalW, rowH, isSource, false, mergedStyle);

                if (label) {
                    let textX, maxTextWidth;

                    if (crossesFrozenBoundary) {
                        // 跨边界单元格：文本基于冻结列宽度对齐
                        const frozenColX = vt.colToViewX(startCol);
                        const frozenColW = rc.getColWidth(startCol);
                        const textAlign = style?.textAlign || "left";
                        textX = this.#calculateTextX(frozenColX, frozenColW, textAlign, cp);
                        maxTextWidth = frozenColW - cp * 2;
                        this.#drawHeaderText(
                            ctx,
                            label,
                            textX,
                            layerY + rowH - 8,
                            mergedStyle?.color,
                            this.#buildNestedHeaderFont(headerFont, style),
                            maxTextWidth,
                            textAlign,
                        );
                    } else {
                        // 普通单元格
                        const textAlign = style?.textAlign || "left";
                        textX = this.#calculateTextX(x, totalW, textAlign, cp);
                        maxTextWidth = totalW - cp * 2;
                        this.#drawHeaderText(
                            ctx,
                            label,
                            textX,
                            layerY + rowH - 8,
                            mergedStyle?.color,
                            this.#buildNestedHeaderFont(headerFont, style),
                            maxTextWidth,
                            textAlign,
                        );
                    }
                }

                this.#drawSeparator(ctx, rightX, layerY, rightX, layerY + rowH);
            }

            if (layerIdx < nestedCount - 1) {
                this.#drawNestedLayerSeparator(ctx, vt, rc, sc, ec, layerY + rowH);
            }
        }
    }

    /**
     * 合并默认样式和自定义样式
     * 自定义样式优先级高于默认样式
     *
     * @param {object} baseStyle - 基础默认样式
     * @param {object|null} customStyle - 自定义样式（可选）
     * @returns {object} 合并后的样式对象
     */
    #mergeHeaderStyle(baseStyle, customStyle) {
        if (!customStyle) return baseStyle;

        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle?.color || null,
            backgroundColor: customStyle.backgroundColor || baseStyle?.backgroundColor || null,
        };
    }

    /**
     * 根据嵌套表头样式配置构建字体字符串
     *
     * @param {string} baseFont - 基础字体（如 "12px sans-serif"）
     * @param {object|null} style - 样式配置
     * @returns {string} 完整的字体字符串
     */
    #buildNestedHeaderFont(baseFont, style) {
        if (!style) return baseFont;

        const parts = [];
        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);
        if (style.fontSize) parts.push(style.fontSize);
        else parts.push(baseFont.match(/^[\d.]+px/)?.[0] || "12px");
        parts.push(baseFont.match(/\s+(.+)$/)?.[1] || "sans-serif");

        return parts.join(" ");
    }

    /**
     * 根据对齐方式计算文本 X 坐标
     *
     * @param {number} cellX - 单元格左边界 X 坐标
     * @param {number} cellWidth - 单元格宽度
     * @param {string} textAlign - 对齐方式（left/center/right）
     * @returns {number} 文本 X 坐标
     */
    /**
     * 根据对齐方式计算表头文字 X 坐标
     * @param {number} cellX - 单元格左边缘 X
     * @param {number} cellWidth - 单元格宽度
     * @param {string} textAlign - 对齐方式
     * @param {number} padding - 内边距（默认 CONFIG.CELL_PADDING）
     */
    #calculateTextX(cellX, cellWidth, textAlign, padding = CONFIG.CELL_PADDING) {
        switch (textAlign) {
            case "center":
                return cellX + cellWidth / 2;
            case "right":
                return cellX + cellWidth - padding;
            case "left":
            default:
                return cellX + padding;
        }
    }

    /**
     * 绘制支持完整样式的表头单元格
     * 支持背景色、文字颜色、边框等样式属性
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {boolean} isSource - 是否为拖拽源
     * @param {boolean} highlighted - 是否高亮
     * @param {object} style - 样式配置对象
     */
    #drawStyledHeaderCell(ctx, x, y, w, h, isSource, highlighted, style) {
        ctx.save();

        if (isSource) {
            ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (highlighted) {
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else {
            if (style?.backgroundColor) {
                ctx.fillStyle = style.backgroundColor;
                ctx.fillRect(x, y, w, h);
            }
            ctx.fillStyle = style?.color || CONFIG.HEADER_TEXT_COLOR;
        }

        ctx.restore();
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
            const realRow = sheet.toRealRow(r);
            const rowStyle = sheet.getRowHeaderStyle(realRow);
            const mergedStyle = this.#mergeHeaderStyle(defaultStyle, rowStyle);

            this.#drawHeaderCell(ctx, 0, y, headerW, h, isSource, highlighted, mergedStyle);

            const textFont = this.#buildNestedHeaderFont(headerFont, rowStyle);
            const textAlign = rowStyle?.textAlign || "left";
            const cp = sheet.cellPadding;
            let textX;
            if (textAlign === "center") {
                textX = headerW / 2;
            } else if (textAlign === "right") {
                textX = headerW - cp;
            } else {
                textX = cp;
            }
            const textMaxW = headerW - cp * 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(cp, y, textMaxW, h);
            ctx.clip();
            this.#drawHeaderText(ctx, sheet.getRowHeader(realRow), textX, y + h / 2 + 4, mergedStyle?.color, textFont, textMaxW, textAlign);
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
            ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (highlighted) {
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else {
            ctx.fillStyle = defaultStyle?.color || CONFIG.HEADER_TEXT_COLOR;
        }
    }

    /**
     * 绘制表头文字，支持溢出截断和对齐方式
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {string} text - 要绘制的文本
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标
     * @param {string|null} color - 文字颜色（可选）
     * @param {string|null} font - 字体字符串（可选）
     * @param {number|null} maxWidth - 最大宽度（可选，用于截断）
     * @param {string|null} textAlign - 文字对齐方式（可选，默认 "left"）
     */
    #drawHeaderText(ctx, text, x, y, color, font, maxWidth, textAlign = "left") {
        ctx.font = font || "12px sans-serif";
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
