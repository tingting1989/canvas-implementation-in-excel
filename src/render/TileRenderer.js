import { CONFIG } from "../constants/config.js";
import { SHEET_EVENTS } from "../constants/sheetEvents.js";
import { CellRenderContext } from "../types/CellRenderContext.js";
import { FONT_STYLE } from "../constants/enums/FontStyle.js";
import { BORDER_STYLE } from "../constants/enums/BorderStyle.js";
import { TEXT_ALIGN } from "../constants/enums/TextAlign.js";
import { VERTICAL_ALIGN } from "../constants/enums/VerticalAlign.js";
import { CONTENT_TYPE } from "../constants/enums/ContentType.js";
import { isUrl } from "../utils/UrlDetector.js";

/**
 * 瓦片渲染器（TileRenderer）—— 负责将单元格数据绘制到瓦片上
 *
 * 核心职责：
 * 1. 计算可视区域需要哪些瓦片
 * 2. 只重绘脏（dirty）瓦片，复用未脏瓦片的缓存
 * 3. 将瓦片内容绘制到主 Canvas 上
 * 4. 管理脏标记（单个单元格/区域/全部）
 *
 * ## 渲染流程
 *
 * 1. render() 根据滚动位置计算可视区域覆盖的瓦片范围
 * 2. 遍历每个瓦片，如果是脏的则调用 #paintTile 重新绘制
 * 3. #paintTile 遍历瓦片内的所有单元格，依次绘制背景、边框、文字
 * 4. 将瓦片的离屏 Canvas 通过 drawImage 绘制到主 Canvas
 *
 * ## 绘制层次（从底到顶）
 *
 * 1. 斑马纹背景（奇偶行交替色）
 * 2. 单元格自定义背景色
 * 3. 条件样式背景色
 * 4. 数据绑定样式背景色
 * 5. 禁用单元格灰色背景
 * 6. 网格线（边框）
 * 7. 单元格文字
 * 8. 下划线装饰
 *
 * ## 合并单元格处理
 *
 * - 合并区域只绘制一次（在左上角单元格位置绘制整个合并区域）
 * - 被合并的单元格（非左上角）通过 isMergedCell 跳过绘制
 * - 合并区域的宽高跨越多个原始单元格
 * - 跨瓦片的合并区域通过 #drawMergeRegion 补全绘制
 *
 * ## 性能优化
 *
 * - 跳过不可见行/列（高度/宽度 ≤ 0）
 * - 跳过被合并的单元格
 * - 只重绘脏瓦片，复用未脏瓦片的缓存
 * - 字体字符串缓存（#lastFont），避免重复 font parsing
 * - 文本截断使用二分查找 O(log n)
 *
 * @see TileCache 瓦片缓存，管理瓦片生命周期和 LRU 淘汰
 * @see Tile 瓦片实例，包含离屏 Canvas 和脏标记
 */
export class TileRenderer {
    /**
     * 字体字符串缓存：仅在 ctx.font 值与上一次不同时才赋值，
     * 避免连续相同字体单元格的重复 font parsing 开销。
     * 每个瓦片绘制开始时重置为 null。
     *
     * @type {string|null}
     */
    #lastFont = null;

    /**
     * 图片元素缓存，避免重复创建 Image 对象。
     * 键为 Object URL，值为 HTMLImageElement。
     *
     * @type {Map<string, HTMLImageElement>}
     */
    #imageElementCache = new Map();

    /**
     * 创建瓦片渲染器
     *
     * @param {import("./TileCache.js").TileCache} tileCache - 瓦片缓存实例
     */
    constructor(tileCache) {
        /** @type {import("./TileCache.js").TileCache} 瓦片缓存，用于获取/创建瓦片 */
        this.tileCache = tileCache;

        /**
         * 图片异步加载完成时的回调
         * 由 RenderEngine 设置，用于在图片就绪后触发重绘。
         * @type {Function|null}
         */
        this.onContentReady = null;
    }

    /**
     * 渲染可视区域
     *
     * 根据滚动位置计算需要显示的瓦片范围，重绘脏瓦片，
     * 然后将所有瓦片通过 drawImage 合成到主 Canvas。
     *
     * drawImage 的源区域参数使用瓦片 Canvas 的物理像素坐标，
     * 不受源 Canvas ctx.scale() 影响；目标坐标使用逻辑像素
     * （主 ctx 已通过 setTransform 设置 DPR 缩放）。
     *
     * @param {CanvasRenderingContext2D} ctx - 主 Canvas 的 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} scrollX - 水平滚动偏移（数据坐标，像素）
     * @param {number} scrollY - 垂直滚动偏移（数据坐标，像素）
     * @param {number} viewW - 可视区域宽度（含行头，CSS 像素）
     * @param {number} viewH - 可视区域高度（含列头，CSS 像素）
     */
    render(ctx, sheet, scrollX, scrollY, viewW, viewH) {
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        // 扣除表头后的纯数据区域尺寸
        const cellViewW = viewW - headerW;
        const cellViewH = viewH - headerH;

        if (cellViewW <= 0 || cellViewH <= 0) return;

        const tileSize = CONFIG.TILE_SIZE;
        // 计算可视区域覆盖的瓦片行列范围
        const startTileCol = Math.floor(scrollX / tileSize);
        const startTileRow = Math.floor(scrollY / tileSize);
        const endTileCol = Math.ceil((scrollX + cellViewW) / tileSize);
        const endTileRow = Math.ceil((scrollY + cellViewH) / tileSize);

        for (let tr = startTileRow; tr <= endTileRow; tr++) {
            for (let tc = startTileCol; tc <= endTileCol; tc++) {
                const tile = this.tileCache.getOrCreate(tr, tc);
                // 只重绘脏瓦片，复用未脏瓦片的缓存
                if (tile.dirty) {
                    this.#paintTile(tile, sheet, tr, tc);
                    tile.dirty = false;
                }
                // 计算瓦片在主 Canvas 上的绘制位置（逻辑像素）
                const drawX = headerW + tc * tileSize - scrollX;
                const drawY = headerH + tr * tileSize - scrollY;

                // drawImage 源区域使用物理像素坐标，目标使用逻辑像素
                const srcSize = CONFIG.TILE_SIZE * CONFIG.DPR;
                ctx.drawImage(tile.canvas, 0, 0, srcSize, srcSize, drawX, drawY, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
            }
        }
    }

    /**
     * 绘制单个瓦片
     *
     * 遍历瓦片覆盖的所有单元格，依次绘制背景、边框、文字。
     * 合并单元格只绘制一次，跨瓦片的合并区域通过 #drawMergeRegion 补全。
     *
     * ## 坐标转换
     *
     * - pixelY0/pixelX0: 瓦片左上角在表格全局像素坐标系中的位置
     * - localY/localX: 单元格在瓦片局部坐标系中的位置
     * - localY = rowY - pixelY0（全局像素 → 瓦片局部像素）
     *
     * @param {import("./Tile.js").Tile} tile - 目标瓦片
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} tileRow - 瓦片行号
     * @param {number} tileCol - 瓦片列号
     */
    #paintTile(tile, sheet, tileRow, tileCol) {
        const rc = sheet.rowColManager;
        const tileSize = CONFIG.TILE_SIZE;
        const tileCtx = tile.ctx;

        // 清空瓦片画布
        tileCtx.clearRect(0, 0, tileSize, tileSize);
        // 每个瓦片单独重置字体缓存
        this.#lastFont = null;

        // 瓦片在全局像素坐标系中的范围
        const pixelY0 = tileRow * tileSize;
        const pixelX0 = tileCol * tileSize;
        const pixelY1 = pixelY0 + tileSize;
        const pixelX1 = pixelX0 + tileSize;

        // 计算瓦片覆盖的单元格行列范围
        const sr = rc.rowAt(pixelY0);
        const sc = rc.colAt(pixelX0);
        const er = Math.min(rc.rowAt(pixelY1) + 1, rc.rowCount);
        const ec = Math.min(rc.colAt(pixelX1) + 1, rc.colCount);

        // 记录已绘制的合并区域左上角坐标，避免重复绘制
        const renderedMerges = new Set();

        for (let r = sr; r < er; r++) {
            const rowY = rc.getRowY(r);
            const rowH = rc.getRowHeight(r);
            // 跳过隐藏行
            if (rowH <= 0) continue;

            const localY = rowY - pixelY0;

            // 跳过不在瓦片可见范围内的行
            if (localY + rowH <= 0 || localY >= tileSize) continue;

            for (let c = sc; c < ec; c++) {
                const colW = rc.getColWidth(c);
                // 跳过隐藏列
                if (colW <= 0) continue;

                const merge = sheet.getMerge(r, c);
                const isMerged = sheet.isMergedCell(r, c);

                // 被合并的单元格（非左上角）：通过 #drawMergeRegion 补全绘制
                if (isMerged) {
                    if (merge) {
                        const mergeKey = `${merge.topRow},${merge.topCol}`;
                        if (!renderedMerges.has(mergeKey)) {
                            this.#drawMergeRegion(tileCtx, sheet, merge, rc, pixelX0, pixelY0, tileSize);
                            renderedMerges.add(mergeKey);
                        }
                    }
                    continue;
                }

                const colX = rc.getColX(c);
                const localX = colX - pixelX0;

                // 跳过不在瓦片可见范围内的列
                if (localX + colW <= 0 || localX >= tileSize) continue;

                const cell = sheet.cellStore.get(r, c);
                let w = colW;
                let h = rowH;
                let drawX = localX;
                let drawY = localY;

                // 合并单元格：计算整个合并区域的宽高和起始位置
                if (merge) {
                    w = rc.getColX(merge.bottomCol) + rc.getColWidth(merge.bottomCol) - rc.getColX(merge.topCol);
                    h = rc.getRowY(merge.bottomRow) + rc.getRowHeight(merge.bottomRow) - rc.getRowY(merge.topRow);
                    drawX = rc.getColX(merge.topCol) - pixelX0;
                    drawY = rc.getRowY(merge.topRow) - pixelY0;
                    renderedMerges.add(`${merge.topRow},${merge.topCol}`);
                }

                // 绘制背景
                this.#drawCellBackground(tileCtx, sheet, r, c, cell, drawX, drawY, w, h, merge);

                // 绘制富内容（图片等），如果绘制了富内容则跳过文本/边框
                const hasContent = this.#drawCellContent(tileCtx, sheet, r, c, drawX, drawY, w, h);
                if (!hasContent) {
                    // 绘制边框
                    this.#drawCellBorder(tileCtx, sheet, r, c, merge, drawX, drawY, w, h);

                    // 合并区域可能跨越瓦片边界，需要裁剪后绘制文本
                    if (merge && (drawX < 0 || drawY < 0 || drawX + w > tileSize || drawY + h > tileSize)) {
                        tileCtx.save();
                        tileCtx.beginPath();
                        tileCtx.rect(
                            Math.max(0, drawX),
                            Math.max(0, drawY),
                            Math.min(tileSize, drawX + w) - Math.max(0, drawX),
                            Math.min(tileSize, drawY + h) - Math.max(0, drawY),
                        );
                        tileCtx.clip();
                        this.#drawCellContentOrText(tileCtx, sheet, r, c, cell, drawX, drawY, w, h, merge);
                        tileCtx.restore();
                    } else {
                        this.#drawCellContentOrText(tileCtx, sheet, r, c, cell, drawX, drawY, w, h, merge);
                    }
                }
            }
        }
    }

    /**
     * 绘制合并区域（用于合并左上角在当前瓦片之外的补全绘制）
     *
     * 当合并区域的左上角不在当前瓦片内时，被合并的单元格仍需绘制
     * 合并区域的可见部分。此方法计算合并区域与当前瓦片的交集，
     * 使用左上角坐标解析样式和值，确保格式一致。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {Object} merge - 合并信息 { topRow, topCol, bottomRow, bottomCol }
     * @param {import("../core/RowColManager.js").RowColManager} rc - 行列管理器
     * @param {number} pixelX0 - 瓦片左上角全局像素 X 坐标
     * @param {number} pixelY0 - 瓦片左上角全局像素 Y 坐标
     * @param {number} tileSize - 瓦片尺寸
     */
    #drawMergeRegion(ctx, sheet, merge, rc, pixelX0, pixelY0, tileSize) {
        const { topRow, topCol, bottomRow, bottomCol } = merge;

        // 合并区域在全局像素坐标系中的范围
        const mergeLeft = rc.getColX(topCol);
        const mergeTop = rc.getRowY(topRow);
        const mergeRight = rc.getColX(bottomCol) + rc.getColWidth(bottomCol);
        const mergeBottom = rc.getRowY(bottomRow) + rc.getRowHeight(bottomRow);

        // 计算合并区域与当前瓦片的交集（局部坐标）
        const drawX = Math.max(0, mergeLeft - pixelX0);
        const drawY = Math.max(0, mergeTop - pixelY0);
        const drawW = Math.min(tileSize, mergeRight - pixelX0) - drawX;
        const drawH = Math.min(tileSize, mergeBottom - pixelY0) - drawY;

        if (drawW <= 0 || drawH <= 0) return;

        // 使用左上角单元格的样式和值
        const cell = sheet.cellStore.get(topRow, topCol);
        this.#drawCellBackground(ctx, sheet, topRow, topCol, cell, drawX, drawY, drawW, drawH, merge);

        const hasContent = this.#drawCellContent(ctx, sheet, topRow, topCol, drawX, drawY, drawW, drawH);
        if (!hasContent) {
            this.#drawCellBorder(ctx, sheet, topRow, topCol, merge, drawX, drawY, drawW, drawH);

            // 文本绘制使用合并区域的完整坐标（裁剪到瓦片可见部分）
            const fullDrawX = mergeLeft - pixelX0;
            const fullDrawY = mergeTop - pixelY0;
            const fullW = mergeRight - mergeLeft;
            const fullH = mergeBottom - mergeTop;

            ctx.save();
            ctx.beginPath();
            ctx.rect(drawX, drawY, drawW, drawH);
            ctx.clip();
            this.#drawCellContentOrText(ctx, sheet, topRow, topCol, cell, fullDrawX, fullDrawY, fullW, fullH, merge);
            ctx.restore();
        }
    }

    /**
     * 绘制单元格背景
     *
     * 按优先级从低到高计算最终背景色，只执行一次 fillRect：
     *
     * 1. 斑马纹（奇偶行交替色）—— 最低优先级，作为默认背景
     * 2. resolveStyle 返回的完整样式（已含条件格式、数据绑定背景色）
     * 3. 禁用单元格灰色背景 —— 最高优先级
     *
     * 合并单元格使用统一的左上角样式，确保跨列时无视觉分割。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Object|null} cell - 单元格数据
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     * @param {Object|null} merge - 合并信息
     */
    #drawCellBackground(ctx, sheet, r, c, cell, drawX, drawY, w, h, merge) {
        // 按优先级从低到高逐层覆盖，最终只绘制一次
        const resolvedStyle = sheet.resolveStyle(r, c);
        let bgColor = resolvedStyle.backgroundColor || (r % 2 === 0 ? CONFIG.ZEBRA_LIGHT : CONFIG.ZEBRA_DARK);

        if (cell?.disabled) {
            bgColor = CONFIG.DISABLED_BG;
        }

        ctx.fillStyle = bgColor;
        ctx.fillRect(drawX, drawY, w, h);
    }

    /**
     * 绘制单元格边框（网格线）
     *
     * 合并单元格不绘制内部网格线（直接 return）。
     * 有自定义边框样式时绘制四条边，否则绘制默认网格线（仅右边框和下边框）。
     * 使用 0.5 像素偏移确保 1px 线条清晰（Canvas 像素对齐技巧）。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Object|null} merge - 合并信息
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     */
    #drawCellBorder(ctx, sheet, r, c, merge, drawX, drawY, w, h) {
        if (merge) return;
        const style = sheet.resolveStyle(r, c);
        if (style.border) {
            const { top, right, bottom, left } = this.#normalizeBorder(style.border);
            ctx.save();
            if (top) this.#drawBorderEdge(ctx, drawX, drawY, drawX + w, drawY, top);
            if (right) this.#drawBorderEdge(ctx, drawX + w, drawY, drawX + w, drawY + h, right);
            if (bottom) this.#drawBorderEdge(ctx, drawX, drawY + h, drawX + w, drawY + h, bottom);
            if (left) this.#drawBorderEdge(ctx, drawX, drawY, drawX, drawY + h, left);
            ctx.restore();
        } else {
            // 默认网格线：仅绘制右边框和下边框，避免重复绘制
            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
            ctx.beginPath();
            ctx.moveTo(drawX + w - 0.5, drawY);
            ctx.lineTo(drawX + w - 0.5, drawY + h);
            ctx.moveTo(drawX, drawY + h - 0.5);
            ctx.lineTo(drawX + w, drawY + h - 0.5);
            ctx.stroke();
        }
    }

    /**
     * 绘制单条边框线
     *
     * 支持实线、虚线、点线三种样式，通过 setLineDash 控制。
     * 使用 0.5 像素偏移确保 1px 线条清晰。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {number} x1 - 起点 X 坐标
     * @param {number} y1 - 起点 Y 坐标
     * @param {number} x2 - 终点 X 坐标
     * @param {number} y2 - 终点 Y 坐标
     * @param {Object} borderDef - 边框定义 { color?, width?, style? }
     * @param {string} [borderDef.color] - 边框颜色
     * @param {number} [borderDef.width] - 边框宽度
     * @param {string} [borderDef.style] - 边框样式（solid/dashed/dotted）
     */
    #drawBorderEdge(ctx, x1, y1, x2, y2, borderDef) {
        ctx.strokeStyle = borderDef.color || CONFIG.CELL_BORDER_COLOR;
        ctx.lineWidth = borderDef.width || 1;
        if (borderDef.style === BORDER_STYLE.DASHED) {
            ctx.setLineDash(CONFIG.BORDER_DASH_SOLID);
        } else if (borderDef.style === BORDER_STYLE.DOTTED) {
            ctx.setLineDash(CONFIG.BORDER_DASH_DOTTED);
        } else {
            ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(x1 + 0.5, y1 + 0.5);
        ctx.lineTo(x2 + 0.5, y2 + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /**
     * 规范化边框定义
     *
     * 将简写形式（四边相同）转换为完整的 { top, right, bottom, left } 结构。
     * 如果已经是完整结构则原样返回。
     *
     * @param {Object} border - 边框定义（简写或完整形式）
     * @returns {Object} 规范化后的边框定义 { top?, right?, bottom?, left? }
     */
    #normalizeBorder(border) {
        if (!border) return {};
        if (border.top || border.right || border.bottom || border.left) {
            return border;
        }
        // 简写形式：四边使用相同的边框定义
        return { top: border, right: border, bottom: border, left: border };
    }

    /**
     * 绘制单元格内容：自定义渲染器或默认文本
     *
     * 检查单元格类型是否有自定义渲染器（hasCustomRenderer）：
     * - 有：构建 CellRenderContext 并调用 cellType.render(context)
     * - 无：回退到默认 #drawCellText()
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} r - 行号
     * @param {number} col - 列号
     * @param {Object|null} cell - 单元格数据
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     * @param {Object|null} merge - 合并信息
     */
    #drawCellContentOrText(ctx, sheet, r, col, cell, drawX, drawY, w, h, merge) {
        const cellType = sheet.getCellTypeInstance(r, col);
        if (cellType.hasCustomRenderer) {
            const context = this.#createRenderContext(ctx, sheet, r, col, cell, drawX, drawY, w, h, merge);
            cellType.render(context);
        } else {
            this.#drawCellText(ctx, sheet, r, col, cell, drawX, drawY, w, h, merge);
        }
    }

    /**
     * 创建单元格渲染上下文
     *
     * 为自定义渲染器构建 CellRenderContext，包含绘制所需的全部信息：
     * Canvas 上下文、位置尺寸、单元格值、样式、选中和禁用状态等。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {Object|null} cell - 单元格数据
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     * @param {Object|null} merge - 合并信息
     * @returns {CellRenderContext} 渲染上下文
     */
    #createRenderContext(ctx, sheet, row, col, cell, drawX, drawY, w, h, merge) {
        const displayValue = sheet.formatCellValue(row, col, cell?.value);
        const style = sheet.resolveStyle(row, col);

        return new CellRenderContext({
            ctx,
            x: drawX,
            y: drawY,
            width: w,
            height: h,
            value: cell?.value,
            displayValue,
            style,
            sheet,
            row,
            col,
            isSelected: sheet.selection?.contains(row, col) ?? false,
            isDisabled: cell?.disabled === true,
            isMerged: !!merge,
            mergeInfo: merge,
        });
    }

    /**
     * 绘制单元格文字（编排方法）
     *
     * 将字体构建、样式应用、坐标计算、文本截断、下划线绘制等
     * 子逻辑委托给各自的私有方法，保持主流程清晰可读。
     *
     * 合并单元格使用左上角坐标解析样式和格式化，确保跨列时格式一致。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Object|null} cell - 单元格数据
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     * @param {Object|null} merge - 合并信息
     */
    #drawCellText(ctx, sheet, r, c, cell, drawX, drawY, w, h, merge) {
        if (cell?.value === undefined) return;

        const finalStyle = sheet.resolveStyle(r, c);
        const fontSize = finalStyle.fontSize || 12;
        const textAlign = finalStyle.textAlign || TEXT_ALIGN.LEFT;
        const verticalAlign = finalStyle.verticalAlign || VERTICAL_ALIGN.MIDDLE;

        this.#applyFont(ctx, finalStyle);

        const displayValue = sheet.formatCellValue(r, c, cell.value);
        const urlValue = isUrl(displayValue) ? displayValue : null;

        this.#applyTextStyle(ctx, finalStyle, cell, urlValue);

        const { textX, textY, effectiveW } = this.#calcTextPosition(ctx, sheet, drawX, drawY, w, h, fontSize, textAlign, verticalAlign, merge);

        const renderedText = this.#truncateText(ctx, displayValue, effectiveW, sheet.cellPadding, sheet.textOverflowEllipsis);

        // 截断后的文本需要裁剪绘制，防止溢出单元格边界
        if (renderedText !== displayValue) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(drawX, drawY, w, h);
            ctx.clip();
            ctx.fillText(renderedText, textX, textY);
            ctx.restore();
        } else {
            ctx.fillText(renderedText, textX, textY);
        }

        // textDecoration 下划线
        if (finalStyle.textDecoration === FONT_STYLE.UNDERLINE) {
            this.#drawUnderline(ctx, renderedText, textX, textY, fontSize, textAlign, ctx.fillStyle, CONFIG.GRID_LINE_WIDTH, 0);
        }

        // URL 自动链接下划线（蓝色，偏移量不同）
        if (urlValue) {
            this.#drawUnderline(
                ctx,
                renderedText,
                textX,
                textY,
                fontSize,
                textAlign,
                CONFIG.AUTO_LINK_COLOR,
                CONFIG.AUTO_LINK_UNDERLINE_WIDTH,
                CONFIG.AUTO_LINK_UNDERLINE_OFFSET,
            );
        }
    }

    /**
     * 构建字体字符串并应用到 ctx
     *
     * 利用 #lastFont 缓存避免重复解析相同的字体字符串。
     * 仅在字体字符串与上次不同时才赋值 ctx.font。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {Object} style - 解析后的单元格样式
     * @param {string} [style.fontStyle] - 字体样式（italic 等）
     * @param {string} [style.fontWeight] - 字体粗细
     * @param {number} [style.fontSize=12] - 字号
     * @param {string} [style.fontFamily="Segoe UI"] - 字体族
     */
    #applyFont(ctx, style) {
        const fontStyle = style.fontStyle === FONT_STYLE.ITALIC ? FONT_STYLE.ITALIC : "";
        const fontWeight = style.fontWeight || "normal";
        const fontSize = style.fontSize || 12;
        const fontFamily = style.fontFamily || "Segoe UI";
        const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`.trim().replace(/\s+/g, " ");
        if (this.#lastFont !== fontString) {
            ctx.font = fontString;
            this.#lastFont = fontString;
        }
    }

    /**
     * 应用文本样式：基线、颜色、对齐方式
     *
     * - URL 文本使用蓝色（CONFIG.AUTO_LINK_COLOR）
     * - 禁用单元格使用灰色（CONFIG.DISABLED_COLOR）
     * - 其他使用样式指定的颜色或默认文本颜色
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {Object} style - 解析后的单元格样式
     * @param {Object|null} cell - 单元格数据
     * @param {string|null} urlValue - URL 值（非 null 表示当前文本是 URL）
     */
    #applyTextStyle(ctx, style, cell, urlValue) {
        const verticalAlign = style.verticalAlign || VERTICAL_ALIGN.MIDDLE;
        const baselineMap = { [VERTICAL_ALIGN.TOP]: "top", [VERTICAL_ALIGN.MIDDLE]: "middle", [VERTICAL_ALIGN.BOTTOM]: "bottom" };
        ctx.textBaseline = baselineMap[verticalAlign] || "middle";
        ctx.fillStyle = urlValue ? CONFIG.AUTO_LINK_COLOR : cell.disabled ? CONFIG.DISABLED_COLOR : style.color || CONFIG.CELL_TEXT_COLOR;
        ctx.textAlign = style.textAlign || TEXT_ALIGN.LEFT;
    }

    /**
     * 计算文本绘制坐标（textX, textY）和有效宽度 effectiveW
     *
     * 合并单元格的居中/右对齐需要基于整个合并区域计算，
     * 普通单元格则基于单个单元格边界计算。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     * @param {number} fontSize - 字号
     * @param {string} textAlign - 水平对齐方式
     * @param {string} verticalAlign - 垂直对齐方式
     * @param {Object|null} merge - 合并信息
     * @returns {{ textX: number, textY: number, effectiveW: number }} 文本坐标和有效宽度
     */
    #calcTextPosition(ctx, sheet, drawX, drawY, w, h, fontSize, textAlign, verticalAlign, merge) {
        const rc = sheet.rowColManager;
        let textX = Math.round(drawX + sheet.cellPadding);
        let effectiveW = w;

        if (merge && (textAlign === TEXT_ALIGN.CENTER || textAlign === TEXT_ALIGN.RIGHT)) {
            // 合并单元格：基于整个合并区域计算对齐位置
            const mergeStartX = rc.getColX(merge.topCol);
            const mergeEndX = rc.getColX(merge.bottomCol) + rc.getColWidth(merge.bottomCol);
            effectiveW = mergeEndX - mergeStartX;

            if (textAlign === TEXT_ALIGN.CENTER) {
                textX = Math.round(mergeStartX + effectiveW / 2);
            } else if (textAlign === TEXT_ALIGN.RIGHT) {
                textX = Math.round(mergeEndX - sheet.cellPadding);
            }
        } else if (textAlign === TEXT_ALIGN.CENTER) {
            textX = Math.round(drawX + w / 2);
        } else if (textAlign === TEXT_ALIGN.RIGHT) {
            textX = Math.round(drawX + w - sheet.cellPadding);
        }

        let textY;
        if (verticalAlign === VERTICAL_ALIGN.TOP) {
            textY = Math.round(drawY + fontSize / 2 + 2);
        } else if (verticalAlign === VERTICAL_ALIGN.BOTTOM) {
            textY = Math.round(drawY + h - fontSize / 2 - 2);
        } else {
            // VERTICAL_ALIGN.MIDDLE
            textY = Math.round(drawY + h / 2);
        }

        return { textX, textY, effectiveW };
    }

    /**
     * 文本截断：使用二分查找定位截断点
     *
     * 当文本宽度超过 maxTextWidth 时，截断并追加省略号（如启用）。
     * 时间复杂度 O(log n)，优于逐字符截断的 O(n)。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {string} text - 原始文本
     * @param {number} effectiveW - 有效宽度
     * @param {number} cellPadding - 单元格内边距
     * @param {boolean} textOverflowEllipsis - 是否追加省略号
     * @returns {string} 截断后的文本（未超出时原样返回）
     */
    #truncateText(ctx, text, effectiveW, cellPadding, textOverflowEllipsis) {
        const maxTextWidth = effectiveW - cellPadding * 2;
        if (maxTextWidth <= 0) return text;

        const fullWidth = ctx.measureText(text).width;
        if (fullWidth <= maxTextWidth) return text;

        const suffix = textOverflowEllipsis ? "..." : "";
        // 二分查找最大可显示字符数
        let lo = 0;
        let hi = text.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (ctx.measureText(text.slice(0, mid) + suffix).width > maxTextWidth) {
                hi = mid - 1;
            } else {
                lo = mid;
            }
        }
        return text.slice(0, lo) + suffix;
    }

    /**
     * 绘制下划线
     *
     * 统一处理 textDecoration 下划线和 URL 自动链接下划线。
     * 根据 textAlign 计算线条起始 X 坐标，通过 offsetY 参数
     * 区分两种下划线的垂直偏移。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {string} renderedText - 已渲染的文本（可能被截断）
     * @param {number} textX - 文本 X 坐标
     * @param {number} textY - 文本 Y 坐标
     * @param {number} fontSize - 字号
     * @param {string} textAlign - 水平对齐方式
     * @param {string} color - 下划线颜色
     * @param {number} lineWidth - 下划线宽度
     * @param {number} offsetY - 垂直偏移量（URL 下划线与 textDecoration 下划线的偏移不同）
     */
    #drawUnderline(ctx, renderedText, textX, textY, fontSize, textAlign, color, lineWidth, offsetY) {
        const textWidth = ctx.measureText(renderedText).width;
        let lineX = textX;
        if (textAlign === TEXT_ALIGN.CENTER) {
            lineX = textX - textWidth / 2;
        } else if (textAlign === TEXT_ALIGN.RIGHT) {
            lineX = textX - textWidth;
        }
        const lineY = textY + Math.round(fontSize * 0.6) + offsetY;
        ctx.beginPath();
        ctx.moveTo(lineX, lineY);
        ctx.lineTo(lineX + textWidth, lineY);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    /**
     * 绘制单元格富内容（图片等）
     *
     * 通过 ClipboardManager.getCellContent() 查询单元格是否有富内容，
     * 与 Cell 模型完全解耦。当前仅支持图片，未来可扩展图表、附件等。
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     * @returns {boolean} 是否绘制了富内容（true 时跳过文本/边框绘制）
     */
    #drawCellContent(ctx, sheet, row, col, drawX, drawY, w, h) {
        const clipboard = sheet.bus.emit(SHEET_EVENTS.GET_CLIPBOARD, undefined, { source: "TileRenderer" });
        if (!clipboard) return false;

        const content = clipboard.getCellContent(sheet, row, col);
        if (!content) return false;

        if (content.type === CONTENT_TYPE.IMAGE) {
            return this.#drawCellImage(ctx, content.objectUrl, drawX, drawY, w, h);
        }

        // 未来可扩展其他类型：chart, attachment, video 等
        return false;
    }

    /**
     * 绘制图片到单元格区域（保持宽高比，居中显示）
     *
     * @param {CanvasRenderingContext2D} ctx - 瓦片 Canvas 2D 上下文
     * @param {string} imageUrl - 图片 Object URL
     * @param {number} drawX - 绘制 X 坐标（瓦片局部）
     * @param {number} drawY - 绘制 Y 坐标（瓦片局部）
     * @param {number} w - 绘制宽度
     * @param {number} h - 绘制高度
     * @returns {boolean} 是否成功绘制（图片未加载完成时返回 true 以阻止文本绘制）
     */
    #drawCellImage(ctx, imageUrl, drawX, drawY, w, h) {
        const img = this.#getOrLoadImage(imageUrl);
        if (!img || !img.complete) {
            // 图片尚未加载完成，本次渲染跳过，等待下次脏标记重绘
            return true; // 有内容但未就绪，阻止文本/边框绘制
        }

        // 保持宽高比，在单元格内居中绘制
        const cellRatio = w / h;
        const imgRatio = img.naturalWidth / img.naturalHeight;
        let drawW, drawH, offsetX, offsetY;

        if (imgRatio > cellRatio) {
            // 图片更宽，以宽度为基准
            drawW = w;
            drawH = w / imgRatio;
            offsetX = 0;
            offsetY = (h - drawH) / 2;
        } else {
            // 图片更高，以高度为基准
            drawH = h;
            drawW = h * imgRatio;
            offsetX = (w - drawW) / 2;
            offsetY = 0;
        }

        ctx.drawImage(img, drawX + offsetX, drawY + offsetY, drawW, drawH);
        return true;
    }

    /**
     * 获取或加载图片元素
     *
     * 首次加载时创建 Image 对象并注册 onload 回调，
     * 图片加载完成后自动标记所有瓦片为脏并通过 onContentReady 触发重绘。
     *
     * 注意：Object URL 加载通常很快（本地 Blob），但仍是异步的。
     * 如果图片在设置 onload 前已完成加载（极少数情况），通过检查 complete 兜底。
     *
     * @param {string} url - 图片 Object URL
     * @returns {HTMLImageElement|null} 图片元素（可能尚未加载完成）
     */
    #getOrLoadImage(url) {
        if (this.#imageElementCache.has(url)) {
            return this.#imageElementCache.get(url);
        }
        const img = new Image();

        // 先设置 onload，再设置 src（确保不会漏掉事件）
        img.onload = () => {
            this.tileCache.markAllDirty();
            if (this.onContentReady) {
                this.onContentReady();
            }
        };
        img.onerror = () => {
            // 加载失败时从缓存中移除，避免无限缓存失败的 URL
            this.#imageElementCache.delete(url);
        };

        img.src = url;
        this.#imageElementCache.set(url, img);

        // 极少数情况：图片在设置 onload 之前就已完成加载
        if (img.complete) {
            this.tileCache.markAllDirty();
            if (this.onContentReady) {
                this.onContentReady();
            }
        }

        return img;
    }

    /**
     * 将指定单元格覆盖的所有瓦片标记为脏
     *
     * 单元格的宽度/高度可能跨越多个瓦片（例如列宽 200px、列起点 120px，
     * 会同时落在瓦片 0 与瓦片 1 中）。旧实现只根据左上角坐标标记一个瓦片，
     * 导致宽单元格被部分重绘，出现"内容被瓦片边界截断"的现象。
     *
     * 修正后计算单元格矩形覆盖的瓦片行列范围，并逐个标记为脏。
     *
     * @param {number} row - 单元格行号
     * @param {number} col - 单元格列号
     * @param {import("../core/RowColManager.js").RowColManager} rc - 行列管理器（提供像素坐标查询）
     */
    invalidateCell(row, col, rc) {
        if (!rc) return;

        const tileSize = CONFIG.TILE_SIZE;
        const rowY = rc.getRowY(row);
        const rowH = rc.getRowHeight(row);
        const colX = rc.getColX(col);
        const colW = rc.getColWidth(col);

        // 跳过隐藏行/列
        if (rowH <= 0 || colW <= 0) return;

        // 计算单元格覆盖的瓦片范围
        const startTileRow = Math.floor(rowY / tileSize);
        const endTileRow = Math.floor((rowY + rowH) / tileSize);
        const startTileCol = Math.floor(colX / tileSize);
        const endTileCol = Math.floor((colX + colW) / tileSize);

        for (let tr = startTileRow; tr <= endTileRow; tr++) {
            for (let tc = startTileCol; tc <= endTileCol; tc++) {
                this.tileCache.markDirty(tr, tc);
            }
        }
    }

    /**
     * 将所有瓦片标记为脏（用于全量重绘场景）
     */
    invalidateAll() {
        this.tileCache.markAllDirty();
    }

    /**
     * 销毁渲染器，清空瓦片缓存和图片元素缓存
     */
    destroy() {
        this.tileCache.clear();
        this.#imageElementCache.clear();
    }
}
