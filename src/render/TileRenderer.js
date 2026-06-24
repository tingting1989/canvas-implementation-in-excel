import { CONFIG } from "../constants/config";

/**
 * 瓦片渲染器（TileRenderer）—— 负责将单元格数据绘制到瓦片上
 *
 * 核心职责：
 * 1. 计算可视区域需要哪些瓦片
 * 2. 只重绘脏（dirty）瓦片，复用未脏瓦片的缓存
 * 3. 将瓦片内容绘制到主 Canvas 上
 * 4. 管理脏标记（单个单元格/全部）
 *
 * 渲染流程：
 * 1. render() 根据滚动位置计算可视区域覆盖的瓦片范围
 * 2. 遍历每个瓦片，如果是脏的则调用 #paintTile 重新绘制
 * 3. #paintTile 遍历瓦片内的所有单元格，依次绘制背景、边框、文字
 * 4. 将瓦片的离屏 Canvas 通过 drawImage 绘制到主 Canvas
 *
 * 绘制层次（从底到顶）：
 * 1. 斑马纹背景（奇偶行交替色）
 * 2. 单元格自定义背景色
 * 3. 条件样式背景色
 * 4. 数据绑定样式背景色
 * 5. 禁用单元格灰色背景
 * 6. 网格线（边框）
 * 7. 单元格文字
 * 8. 下划线装饰
 *
 * 合并单元格处理：
 * - 合并区域只绘制一次（在左上角单元格位置绘制整个合并区域）
 * - 被合并的单元格（非左上角）通过 isMergedCell 跳过绘制
 * - 合并区域的宽高跨越多个原始单元格
 *
 * 性能优化：
 * - 跳过不可见行/列
 * - 跳过宽度为 0 的列（隐藏列）
 * - 跳过被合并的单元格
 * - 只重绘脏瓦片
 */
export class TileRenderer {
    /**
     * 字体字符串缓存：仅在 ctx.font 值与上一次不同时才赋值，
     * 避免连续相同字体单元格的重复 font parsing 开销
     * @type {string|null}
     */
    #lastFont = null;

    /**
     * 创建瓦片渲染器
     *
     * @param {TileCache} tileCache - 瓦片缓存实例
     */
    constructor(tileCache) {
        /** @type {TileCache} 瓦片缓存，用于获取/创建瓦片 */
        this.tileCache = tileCache;

        /**
         * 图片异步加载完成时的回调
         * 由 RenderEngine 设置，用于在图片就绪后触发重绘
         * @type {Function|null}
         */
        this.onContentReady = null;
    }

    /**
     * 渲染可视区域
     * 根据滚动位置计算需要显示的瓦片，重绘脏瓦片，绘制到主 Canvas
     *
     * @param {CanvasRenderingContext2D} ctx - 主 Canvas 的 2D 上下文
     * @param {Sheet} sheet - 当前工作表
     * @param {number} scrollX - 水平滚动偏移（像素）
     * @param {number} scrollY - 垂直滚动偏移（像素）
     * @param {number} viewW - 可视区域宽度（含行头）
     * @param {number} viewH - 可视区域高度（含列头）
     */
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {number} scrollX
     * @param {number} scrollY
     * @param {number} viewW
     * @param {number} viewH
     * @param {object} [options]
     * @param {boolean} [options.useRealRows] - 分页模式下使用实际行号渲染（用于冻结行区域）
     */
    render(ctx, sheet, scrollX, scrollY, viewW, viewH, options) {
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const cellViewW = viewW - headerW;
        const cellViewH = viewH - headerH;

        if (cellViewW <= 0 || cellViewH <= 0) return;

        const tileSize = CONFIG.TILE_SIZE;
        const startTileCol = Math.floor(scrollX / tileSize);
        const startTileRow = Math.floor(scrollY / tileSize);
        const endTileCol = Math.ceil((scrollX + cellViewW) / tileSize);
        const endTileRow = Math.ceil((scrollY + cellViewH) / tileSize);

        for (let tr = startTileRow; tr <= endTileRow; tr++) {
            for (let tc = startTileCol; tc <= endTileCol; tc++) {
                const tile = this.tileCache.getOrCreate(tr, tc);
                if (tile.dirty) {
                    this.#paintTile(tile, sheet, tr, tc, options);
                    tile.dirty = false;
                }
                const drawX = headerW + tc * tileSize - scrollX;
                const drawY = headerH + tr * tileSize - scrollY;

                // drawImage 的源区域参数 (sx,sy,sw,sh) 使用的是源 Canvas 的**物理像素坐标**
                // 不受源 Canvas ctx.scale() 影响
                // 瓦片 canvas 物理尺寸 = TILE_SIZE * DPR，内容绘制在完整的物理区域内
                // 主 ctx 已 setTransform(DPR,DPR)，目标坐标用逻辑像素即可
                const srcSize = CONFIG.TILE_SIZE * CONFIG.DPR;
                ctx.drawImage(tile.canvas, 0, 0, srcSize, srcSize, drawX, drawY, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
            }
        }
    }

    /**
     * 绘制单个瓦片
     * 遍历瓦片覆盖的所有单元格，依次绘制背景、边框、文字
     *
     * 坐标转换：
     * - pixelY0/pixelX0: 瓦片左上角在表格全局像素坐标系中的位置
     * - localY/localX: 单元格在瓦片局部坐标系中的位置
     * - localY = rowY - pixelY0（全局像素 -> 瓦片局部像素）
     *
     * @param {Tile} tile - 目标瓦片
     * @param {Sheet} sheet - 当前工作表
     * @param {number} tileRow - 瓦片行号
     * @param {number} tileCol - 瓦片列号
     */
    #paintTile(tile, sheet, tileRow, tileCol, options) {
        const rc = sheet.rowColManager;
        const tileSize = CONFIG.TILE_SIZE;
        const tileCtx = tile.ctx;
        const useRealRows = options?.useRealRows === true;

        tileCtx.clearRect(0, 0, tileSize, tileSize);
        this.#lastFont = null; // 每个瓦片单独重置字体缓存

        const pixelY0 = tileRow * tileSize;
        const pixelX0 = tileCol * tileSize;
        const pixelY1 = pixelY0 + tileSize;
        const pixelX1 = pixelX0 + tileSize;

        const sr = useRealRows ? rc.rawRowAt(pixelY0) : rc.rowAt(pixelY0);
        const sc = rc.colAt(pixelX0);
        const er = Math.min((useRealRows ? rc.rawRowAt(pixelY1) : rc.rowAt(pixelY1)) + 1, rc.rowCount);
        const ec = Math.min(rc.colAt(pixelX1) + 1, rc.colCount);

        // 记录已绘制的合并区域左上角坐标，避免重复绘制
        const renderedMerges = new Set();

        for (let r = sr; r < er; r++) {
            const rowY = useRealRows ? rc.getRealRowY(r) : rc.getRowY(r);
            const rowH = useRealRows ? rc.getRealRowHeight(r) : rc.getRowHeight(r);
            if (rowH <= 0) continue;

            const localY = rowY - pixelY0;

            if (localY + rowH <= 0 || localY >= tileSize) continue;

            const realR = useRealRows ? r : sheet.toRealRow(r);

            for (let c = sc; c < ec; c++) {
                const colW = rc.getColWidth(c);
                if (colW <= 0) continue;

                // 检查是否属于某个合并区域
                const merge = sheet.getMerge(r, c);

                // 如果是合并区域内非左上角的格子
                if (sheet.isMergedCell(realR, c)) {
                    // 如果合并区域的左上角在本瓦片范围内且尚未渲染过，则由左上角统一绘制
                    // 如果左上角不在本瓦片范围（合并区域从外部延伸进来），需要在此处补绘
                    if (merge) {
                        const mergeKey = `${merge.topRow},${merge.topCol}`;
                        if (!renderedMerges.has(mergeKey)) {
                            // 合并左上角不在当前瓦片的遍历范围内，需要在此补全绘制
                            this.#drawMergeRegion(tileCtx, sheet, merge, rc, pixelX0, pixelY0, tileSize);
                            renderedMerges.add(mergeKey);
                        }
                    }
                    continue;
                }

                const colX = rc.getColX(c);
                const localX = colX - pixelX0;

                if (localX + colW <= 0 || localX >= tileSize) continue;

                const cell = sheet.cellStore.get(realR, c);
                let w = colW;
                let h = rowH;
                let drawX = localX;
                let drawY = localY;

                if (merge) {
                    w = rc.getColX(merge.bottomCol) + rc.getColWidth(merge.bottomCol) - rc.getColX(merge.topCol);
                    h = rc.getRowY(merge.bottomRow) + rc.getRowHeight(merge.bottomRow) - rc.getRowY(merge.topRow);
                    drawX = rc.getColX(merge.topCol) - pixelX0;
                    drawY = rc.getRowY(merge.topRow) - pixelY0;
                    renderedMerges.add(`${merge.topRow},${merge.topCol}`);
                }

                this.#drawCellBackground(tileCtx, sheet, realR, c, cell, drawX, drawY, w, h, merge);

                // 富内容单元格（图片等）：绘制富内容而非文本
                const hasContent = this.#drawCellContent(tileCtx, sheet, realR, c, drawX, drawY, w, h);
                if (!hasContent) {
                    this.#drawCellBorder(tileCtx, merge, drawX, drawY, w, h);
                    this.#drawCellText(tileCtx, sheet, realR, c, cell, drawX, drawY, w, h, merge);
                }
            }
        }
    }

    /**
     * 绘制合并区域（用于合并左上角在当前瓦片之外的补全绘制）
     * 使用合并区域的左上角坐标解析样式和值，确保格式一致
     */
    #drawMergeRegion(ctx, sheet, merge, rc, pixelX0, pixelY0, tileSize) {
        const { topRow, topCol, bottomRow, bottomCol } = merge;
        const realTopR = sheet.toRealRow(topRow);

        // 计算合并区域与当前瓦片的交集
        const mergeLeft = rc.getColX(topCol);
        const mergeTop = rc.getRowY(topRow);
        const mergeRight = rc.getColX(bottomCol) + rc.getColWidth(bottomCol);
        const mergeBottom = rc.getRowY(bottomRow) + rc.getRowHeight(bottomRow);

        // 瓦片内可见部分
        const drawX = Math.max(0, mergeLeft - pixelX0);
        const drawY = Math.max(0, mergeTop - pixelY0);
        const drawW = Math.min(tileSize, mergeRight - pixelX0) - drawX;
        const drawH = Math.min(tileSize, mergeBottom - pixelY0) - drawY;

        if (drawW <= 0 || drawH <= 0) return;

        const cell = sheet.cellStore.get(realTopR, topCol);
        this.#drawCellBackground(ctx, sheet, realTopR, topCol, cell, drawX, drawY, drawW, drawH, merge);

        const hasContent = this.#drawCellContent(ctx, sheet, realTopR, topCol, drawX, drawY, drawW, drawH);
        if (!hasContent) {
            this.#drawCellBorder(ctx, merge, drawX, drawY, drawW, drawH);
            this.#drawCellText(ctx, sheet, realTopR, topCol, cell, drawX, drawY, drawW, drawH, merge);
        }
    }

    /**
     * 绘制单元格背景
     * 按优先级从低到高计算最终背景色，只执行一次 fillRect
     *
     * 优先级（从低到高）：
     * 1. 斑马纹（奇偶行交替色）
     * 2. resolveStyle 返回的完整样式（已含条件格式、数据绑定背景色）
     * 3. 禁用单元格灰色背景（最高优先级）
     *
     * 合并单元格处理：
     * - 合并区域使用统一的左上角样式，确保跨列时无视觉分割
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
     * 只绘制右边框和下边框，避免重复绘制
     * 合并单元格不绘制内部网格线
     * 使用 0.5 像素偏移确保 1px 线条清晰（Canvas 像素对齐技巧）
     */
    #drawCellBorder(ctx, merge, drawX, drawY, w, h) {
        if (merge) return;
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drawX + w - 0.5, drawY);
        ctx.lineTo(drawX + w - 0.5, drawY + h);
        ctx.moveTo(drawX, drawY + h - 0.5);
        ctx.lineTo(drawX + w, drawY + h - 0.5);
        ctx.stroke();
    }

    /**
     * 绘制单元格文字
     *
     * 处理逻辑：
     * 1. 空单元格（value === undefined）跳过绘制
     * 2. 解析最终样式（字体、颜色、对齐方式）
     * 3. 禁用单元格使用灰色文字
     * 4. 通过 formatCellValue 格式化显示值
     * 5. 根据 textAlign 计算文字 X 坐标
     * 6. 文字垂直居中（drawY + h/2 + 4，+4 为基线微调）
     * 7. 如果有下划线装饰，在文字下方绘制横线
     *
     * 合并单元格处理：
     * - 使用左上角坐标解析样式和格式化，确保跨列时格式一致
     */
    #drawCellText(ctx, sheet, r, c, cell, drawX, drawY, w, h, merge) {
        if (cell?.value === undefined) return;

        const finalStyle = sheet.resolveStyle(r, c);
        const fontStyle = finalStyle.fontStyle === "italic" ? "italic" : "";
        const fontWeight = finalStyle.fontWeight || "normal";
        const fontSize = finalStyle.fontSize || 12;
        const fontFamily = finalStyle.fontFamily || "Segoe UI";
        const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`.trim().replace(/\s+/g, " ");
        if (this.#lastFont !== fontString) {
            ctx.font = fontString;
            this.#lastFont = fontString;
        }

        ctx.textBaseline = "middle";
        ctx.fillStyle = cell.disabled ? CONFIG.DISABLED_COLOR : finalStyle.color || "#222";

        const textAlign = finalStyle.textAlign || "left";
        ctx.textAlign = textAlign;

        const displayValue = sheet.formatCellValue(r, c, cell.value);

        let textX = Math.round(drawX + sheet.cellPadding);
        if (textAlign === "center") {
            textX = Math.round(drawX + w / 2);
        } else if (textAlign === "right") {
            textX = Math.round(drawX + w - sheet.cellPadding);
        }

        const textY = Math.round(drawY + h / 2);

        // 文本超出时截断，确保左右两侧留有内边距
        // 使用二分查找定位截断点：O(log n) vs 逐字符 O(n)
        const maxTextWidth = w - sheet.cellPadding * 2;
        let renderedText = displayValue;
        if (maxTextWidth > 0) {
            const fullWidth = ctx.measureText(displayValue).width;
            if (fullWidth > maxTextWidth) {
                const suffix = sheet.textOverflowEllipsis ? "..." : "";
                let lo = 0,
                    hi = displayValue.length;
                while (lo < hi) {
                    const mid = Math.ceil((lo + hi) / 2);
                    if (ctx.measureText(displayValue.slice(0, mid) + suffix).width > maxTextWidth) {
                        hi = mid - 1;
                    } else {
                        lo = mid;
                    }
                }
                renderedText = displayValue.slice(0, lo) + suffix;
            }
        }

        // 仅在文本溢出时裁剪，避免每个单元格的 save/clip/restore 开销
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

        /**
         * 绘制下划线
         * textDecoration: underline 时在文字下方绘制一条线
         */
        if (finalStyle.textDecoration === "underline") {
            const textWidth = ctx.measureText(renderedText).width;
            let lineX = textX;
            if (textAlign === "center") {
                lineX = textX - textWidth / 2;
            } else if (textAlign === "right") {
                lineX = textX - textWidth;
            }
            const lineY = textY + Math.round(fontSize * 0.6);
            ctx.beginPath();
            ctx.moveTo(lineX, lineY);
            ctx.lineTo(lineX + textWidth, lineY);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    /**
     * 绘制单元格富内容（图片等）
     *
     * 通过 ClipboardManager.getCellContent() 查询单元格是否有富内容，
     * 与 Cell 模型完全解耦。当前仅支持图片，未来可扩展图表、附件等。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {number} realR - 实际行号
     * @param {number} col - 列号
     * @param {number} drawX
     * @param {number} drawY
     * @param {number} w
     * @param {number} h
     * @returns {boolean} 是否绘制了富内容（用于决定是否跳过文本/边框绘制）
     */
    #drawCellContent(ctx, sheet, realR, col, drawX, drawY, w, h) {
        const clipboard = sheet.workbook?.clipboard;
        if (!clipboard) return false;

        const content = clipboard.getCellContent(sheet, realR, col);
        if (!content) return false;

        if (content.type === "image") {
            return this.#drawCellImage(ctx, content.objectUrl, drawX, drawY, w, h);
        }

        // 未来可扩展其他类型：chart, attachment, video 等
        return false;
    }

    /**
     * 绘制图片到单元格区域（保持宽高比，居中显示）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} imageUrl - Object URL
     * @param {number} drawX
     * @param {number} drawY
     * @param {number} w
     * @param {number} h
     * @returns {boolean} 是否成功绘制
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
            drawW = w;
            drawH = w / imgRatio;
            offsetX = 0;
            offsetY = (h - drawH) / 2;
        } else {
            drawH = h;
            drawW = h * imgRatio;
            offsetX = (w - drawW) / 2;
            offsetY = 0;
        }

        ctx.drawImage(img, drawX + offsetX, drawY + offsetY, drawW, drawH);
        return true;
    }

    /**
     * 图片元素缓存，避免重复创建 Image 对象
     * @type {Map<string, HTMLImageElement>}
     */
    #imageElementCache = new Map();

    /**
     * 获取或加载图片元素
     *
     * 首次加载时创建 Image 对象并注册 onload 回调，
     * 图片加载完成后自动标记所有瓦片为脏并通过 onContentReady 触发重绘。
     *
     * 注意：Object URL 加载通常很快（本地 Blob），但仍是异步的。
     * 如果图片在设置 onload 前已完成加载（极少数情况），通过检查 complete 兜底。
     *
     * @param {string} url - Object URL
     * @returns {HTMLImageElement|null}
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
        // 此时 complete 为 true，手动触发重绘
        if (img.complete) {
            this.tileCache.markAllDirty();
            if (this.onContentReady) {
                this.onContentReady();
            }
        }

        return img;
    }

    /**
     * 将指定单元格对应的瓦片标记为脏
     * 通过单元格的像素坐标计算其所属的瓦片行列号
     *
     * @param {number} row - 单元格行号
     * @param {number} col - 单元格列号
     * @param {RowColManager} rc - 行列管理器（提供像素坐标查询）
     */
    invalidateCell(row, col, rc) {
        if (!rc) return;
        const tileSize = CONFIG.TILE_SIZE;
        const tileRow = Math.floor(rc.getRowY(row) / tileSize);
        const tileCol = Math.floor(rc.getColX(col) / tileSize);
        this.tileCache.markDirty(tileRow, tileCol);
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
