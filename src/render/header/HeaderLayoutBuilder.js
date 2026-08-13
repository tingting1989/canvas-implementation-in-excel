import { CONFIG } from "../../constants/config.js";
import { isObject, isString } from "../../utils/helper.js";
import { calcCenteredTextY } from "../../utils/canvasUtils.js";
import { LogicalCell } from "./models/LogicalCell.js";
import { Fragment } from "./models/Fragment.js";
import { BorderMask } from "./models/BorderMask.js";
import { PARTIAL_TYPE } from "./models/PartialType.js";

/**
 * 表头布局构建器（HeaderLayoutBuilder）
 *
 * 负责将嵌套表头配置数据转换为可视片段（Fragment）列表，
 * 是表头渲染管线的第一阶段。
 *
 * ## 渲染管线
 *
 * ```
 * nestedHeaders 配置 → HeaderLayoutBuilder → Fragment[] → HeaderPainter
 * ```
 *
 * ## 核心职责
 *
 * 1. 解析嵌套表头配置为 LogicalCell 列表
 * 2. 过滤出可视范围内的 LogicalCell
 * 3. 处理冻结边界切割：将跨越边界的 LogicalCell 拆分为冻结侧和滚动侧 Fragment
 * 4. 计算每个 Fragment 的位置、尺寸、边框掩码、文本坐标等
 * 5. 合并默认样式和自定义样式
 *
 * ## 冻结边界拆分
 *
 * 当 LogicalCell 跨越冻结列边界时，拆分为两个 Fragment：
 * - 冻结侧（FROZEN）：显示文本，边框掩码为 FROZEN_SIDE（不画右边框）
 * - 滚动侧（SCROLL）：不显示文本（避免重复），边框掩码为 SCROLL_SIDE（不画左边框）
 *
 * ## 非嵌套表头
 *
 * 非嵌套表头等价于"单层、colspan=1"的嵌套表头，
 * 每个 Fragment 的 borderMask = ALL，不存在跨冻结边界问题。
 *
 * @see LogicalCell 逻辑单元格，嵌套表头配置的解析结果
 * @see Fragment 可视片段，本类的输出
 * @see FrozenBoundaryInfo 冻结边界信息，用于判断是否需要拆分
 * @see HeaderPainter 表头绘制器，消费 Fragment 列表
 */
export class HeaderLayoutBuilder {
    /**
     * 构建指定层的可视片段列表（嵌套表头）
     *
     * 流程：
     * 1. 解析层配置数据为 LogicalCell 列表
     * 2. 过滤出可视范围内的 LogicalCell（endCol >= sc && startCol < ec）
     * 3. 将每个 LogicalCell 转换为 Fragment（可能拆分为冻结侧 + 滚动侧）
     * 4. 按 X 坐标排序，确保从左到右绘制
     *
     * @param {Object} opts - 构建参数
     * @param {Array} opts.layerData - 层配置数据（nestedHeaders[layerIndex]）
     * @param {number} opts.layerIndex - 层索引（0 = 最上层）
     * @param {number} opts.layerY - 层顶部 Y 坐标（视口像素）
     * @param {number} opts.rowH - 层高度（像素）
     * @param {number} opts.sc - 可视起始列号
     * @param {number} opts.ec - 可视结束列号（不含）
     * @param {import('./models/FrozenBoundaryInfo.js').FrozenBoundaryInfo} opts.frozenBoundary - 冻结边界信息
     * @param {import('../ViewportTransform.js').ViewportTransform} opts.vt - 视口坐标转换器
     * @param {import('../../workbook/Sheet.js').Sheet} opts.sheet - 当前工作表
     * @param {Object} opts.defaultStyle - 默认样式
     * @param {string} opts.headerFont - 默认字体字符串
     * @returns {Fragment[]} 可视片段列表，按 X 坐标排序
     */
    buildLayerFragments(opts) {
        const { layerData, layerIndex, layerY, rowH, sc, ec, frozenBoundary, vt, sheet, defaultStyle, headerFont } = opts;

        // 1. 解析层配置为 LogicalCell
        const logicalCells = this.#parseLayerCells(layerData, layerIndex);
        // 2. 过滤可视范围内的单元格
        const visibleCells = logicalCells.filter((c) => c.endCol >= sc && c.startCol < ec);

        // 3. 转换为 Fragment（可能拆分）
        const fragments = [];
        for (const cell of visibleCells) {
            const cellFragments = this.#cellToFragments(cell, {
                layerY,
                rowH,
                sc,
                ec,
                frozenBoundary,
                vt,
                sheet,
                defaultStyle,
                headerFont,
            });
            for (const frag of cellFragments) {
                if (frag) fragments.push(frag);
            }
        }

        // 4. 按 X 坐标排序
        fragments.sort((a, b) => a.x - b.x);
        return fragments;
    }

    /**
     * 构建非嵌套表头的 Fragment 列表
     *
     * 非嵌套表头等价于"单层、colspan=1"的嵌套表头。
     * 每个 Fragment 的 borderMask = ALL（四边全画），
     * 因为不存在跨列合并，不存在跨冻结边界问题。
     *
     * @param {Object} opts - 构建参数
     * @param {number} opts.sc - 可视起始列号
     * @param {number} opts.ec - 可视结束列号（不含）
     * @param {number} opts.layerY - 层顶部 Y 坐标（视口像素）
     * @param {number} opts.rowH - 层高度（像素）
     * @param {import('../ViewportTransform.js').ViewportTransform} opts.vt - 视口坐标转换器
     * @param {import('../../workbook/Sheet.js').Sheet} opts.sheet - 当前工作表
     * @param {Object} opts.defaultStyle - 默认样式
     * @param {string} opts.headerFont - 默认字体字符串
     * @returns {Fragment[]} 可视片段列表
     */
    buildSimpleLayerFragments(opts) {
        const { sc, ec, layerY, rowH, vt, sheet, defaultStyle, headerFont } = opts;
        const rc = sheet.rowColManager;
        const cp = sheet.cellPadding;
        const fragments = [];

        for (let c = sc; c < ec; c++) {
            const w = rc.getColWidth(c);
            if (w <= 0) continue;

            const x = vt.colToViewX(c);
            const colStyle = sheet.getColHeaderStyle(c);
            const mergedStyle = this.#mergeStyle(defaultStyle, colStyle);
            const textAlign = colStyle?.textAlign || "left";
            const font = this.#buildFont(headerFont, colStyle);

            fragments.push(
                new Fragment({
                    sourceCell: null,
                    visStartCol: c,
                    visEndCol: c,
                    x,
                    y: layerY,
                    w,
                    h: rowH,
                    borderMask: BorderMask.ALL,
                    mergedStyle,
                    text: sheet.getColHeader(c),
                    font,
                    textAlign,
                    textX: this.#calcTextX(x, w, textAlign, cp),
                    textY: calcCenteredTextY(layerY, rowH, headerFont),
                    maxTextWidth: w - cp * 2,
                    isPartial: false,
                    partialType: PARTIAL_TYPE.FULL,
                }),
            );
        }

        return fragments;
    }

    /**
     * 解析层配置数据为 LogicalCell 列表
     *
     * 遍历 layerData 数组，将每个元素（字符串或对象）转换为 LogicalCell。
     * 使用 consumed 计数器跟踪已消耗的列号，确保 startCol/endCol 连续。
     *
     * 支持的配置格式：
     * - 字符串："A" → { label: "A", colspan: 1 }
     * - 对象：{ label: "Group", colspan: 3, style: {...} }
     *
     * @param {Array} layerData - 层配置数据
     * @param {number} layerIndex - 层索引
     * @returns {LogicalCell[]} 逻辑单元格列表
     */
    #parseLayerCells(layerData, layerIndex) {
        const cells = [];
        let consumed = 0;

        for (let i = 0; i < layerData.length; i++) {
            const item = layerData[i];
            const label = isString(item) ? item : (item?.label ?? "");
            const colspan = item && isObject(item) && item.colspan ? item.colspan : 1;
            const style = item?.style || null;

            cells.push(
                new LogicalCell({
                    layerIndex,
                    startCol: consumed,
                    endCol: consumed + colspan - 1,
                    colspan,
                    label,
                    style,
                }),
            );

            consumed += colspan;
        }

        return cells;
    }

    /**
     * 将 LogicalCell 转换为 Fragment 列表
     *
     * 根据是否跨越冻结边界，分为两种处理路径：
     *
     * 1. **跨越冻结边界**：拆分为冻结侧 Fragment + 滚动侧 Fragment
     *    - 冻结侧：visStartCol ~ fixedCols-1，borderMask = FROZEN_SIDE
     *    - 滚动侧：fixedCols ~ visEndCol，borderMask = SCROLL_SIDE
     *
     * 2. **未跨越冻结边界**：生成单个 Fragment
     *    - 合并单元格使用 MERGED_DEFAULT（不画右边框）
     *    - 非合并单元格使用 ALL（四边全画）
     *    - 如果合并单元格延伸到可视区域右边界，补画右边框
     *
     * @param {LogicalCell} cell - 逻辑单元格
     * @param {Object} ctx - 上下文参数
     * @param {number} ctx.layerY - 层顶部 Y 坐标
     * @param {number} ctx.rowH - 层高度
     * @param {number} ctx.sc - 可视起始列号
     * @param {number} ctx.ec - 可视结束列号（不含）
     * @param {import('./models/FrozenBoundaryInfo.js').FrozenBoundaryInfo} ctx.frozenBoundary - 冻结边界信息
     * @param {import('../ViewportTransform.js').ViewportTransform} ctx.vt - 视口坐标转换器
     * @param {import('../../workbook/Sheet.js').Sheet} ctx.sheet - 当前工作表
     * @param {Object} ctx.defaultStyle - 默认样式
     * @param {string} ctx.headerFont - 默认字体字符串
     * @returns {(Fragment|null)[]} Fragment 列表（可能包含 null，由调用方过滤）
     */
    #cellToFragments(cell, ctx) {
        const { frozenBoundary, sc, ec, vt, ...rest } = ctx;

        // 跨越冻结边界：拆分为冻结侧 + 滚动侧
        if (frozenBoundary.splitsCellHorizontally(cell)) {
            const fragments = [];

            // 冻结侧 Fragment
            if (sc < frozenBoundary.fixedCols) {
                const frozenStart = Math.max(cell.startCol, sc);
                const frozenEnd = frozenBoundary.fixedCols - 1;
                if (frozenStart <= frozenEnd) {
                    const frag = this.#createFragment(cell, {
                        ...rest,
                        visStartCol: frozenStart,
                        visEndCol: frozenEnd,
                        vt,
                        borderOverride: BorderMask.FROZEN_SIDE,
                        partialType: PARTIAL_TYPE.FROZEN,
                    });
                    if (frag) fragments.push(frag);
                }
            }

            // 滚动侧 Fragment
            if (sc >= frozenBoundary.fixedCols || ec > frozenBoundary.fixedCols) {
                const scrollStart = Math.max(frozenBoundary.fixedCols, sc);
                const scrollEnd = Math.min(cell.endCol, ec - 1);
                if (scrollStart <= scrollEnd) {
                    const frag = this.#createFragment(cell, {
                        ...rest,
                        visStartCol: scrollStart,
                        visEndCol: scrollEnd,
                        vt,
                        borderOverride: BorderMask.SCROLL_SIDE,
                        partialType: PARTIAL_TYPE.SCROLL,
                    });
                    if (frag) fragments.push(frag);
                }
            }

            return fragments;
        }

        // 未跨越冻结边界：生成单个 Fragment
        const visEndCol = Math.min(cell.endCol, ec - 1);
        // 合并单元格默认不画右边框（由下一个单元格的左边框替代）
        const baseBorderMask = cell.isMerged ? BorderMask.MERGED_DEFAULT : BorderMask.ALL;

        // 如果合并单元格延伸到可视区域右边界，需要补画右边框
        const borderOverride = visEndCol >= ec - 1 && cell.isMerged ? baseBorderMask | BorderMask.RIGHT : baseBorderMask;

        return [
            this.#createFragment(cell, {
                ...rest,
                visStartCol: Math.max(cell.startCol, sc),
                visEndCol,
                vt,
                borderOverride,
                partialType: PARTIAL_TYPE.FULL,
            }),
        ];
    }

    /**
     * 创建单个 Fragment
     *
     * 根据可视列范围计算 Fragment 的位置、尺寸、文本坐标等。
     * 跳过宽度为 0 的隐藏列，如果所有列都隐藏则返回 null。
     *
     * 文本显示策略：
     * - FULL（完整）：显示文本，计算文本坐标和最大宽度
     * - FROZEN（冻结侧）：显示文本（文本在冻结侧可见）
     * - SCROLL（滚动侧）：不显示文本（text=null，避免与冻结侧重复）
     *
     * @param {LogicalCell} cell - 源逻辑单元格
     * @param {Object} opts - 创建参数
     * @param {number} opts.visStartCol - 可视起始列号
     * @param {number} opts.visEndCol - 可视结束列号
     * @param {number} opts.layerY - 层顶部 Y 坐标
     * @param {number} opts.rowH - 层高度
     * @param {import('../ViewportTransform.js').ViewportTransform} opts.vt - 视口坐标转换器
     * @param {import('../../workbook/Sheet.js').Sheet} opts.sheet - 当前工作表
     * @param {Object} opts.defaultStyle - 默认样式
     * @param {string} opts.headerFont - 默认字体字符串
     * @param {number} opts.borderOverride - 边框掩码覆盖值
     * @param {string} opts.partialType - 片段类型（FULL/FROZEN/SCROLL）
     * @returns {Fragment|null} Fragment 实例，所有列隐藏时返回 null
     */
    #createFragment(cell, opts) {
        const { visStartCol, visEndCol, layerY, rowH, vt, sheet, defaultStyle, headerFont, borderOverride, partialType } = opts;
        const rc = sheet.rowColManager;
        const cp = sheet.cellPadding;

        // 跳过隐藏列，找到第一个可见列作为起始
        let visibleStartCol = visStartCol;
        while (visibleStartCol <= visEndCol && rc.getColWidth(visibleStartCol) <= 0) {
            visibleStartCol++;
        }
        if (visibleStartCol > visEndCol) return null;

        // 计算 Fragment 的位置和尺寸
        const x = vt.colToViewX(visibleStartCol);
        const rightX = vt.colRightToViewX(visEndCol);
        const totalW = rightX - x;

        if (totalW <= 0) return null;

        // 合并样式和计算字体
        const mergedStyle = this.#mergeStyle(defaultStyle, cell.style);
        const textAlign = cell.style?.textAlign || "left";
        const font = this.#buildFont(headerFont, cell.style);

        // 根据片段类型决定文本显示策略
        let text, textX, maxTextWidth;
        if (partialType === PARTIAL_TYPE.FROZEN) {
            // 冻结侧：显示文本
            text = cell.label;
            textX = this.#calcTextX(x, totalW, textAlign, cp);
            maxTextWidth = totalW - cp * 2;
        } else if (partialType === PARTIAL_TYPE.SCROLL) {
            // 滚动侧：不显示文本（避免与冻结侧重复）
            text = null;
            textX = 0;
            maxTextWidth = 0;
        } else {
            // 完整片段：显示文本
            text = cell.label;
            textX = this.#calcTextX(x, totalW, textAlign, cp);
            maxTextWidth = totalW - cp * 2;
        }

        return new Fragment({
            sourceCell: cell,
            visStartCol,
            visEndCol,
            x,
            y: layerY,
            w: totalW,
            h: rowH,
            borderMask: borderOverride,
            mergedStyle,
            text,
            font,
            textAlign,
            textX,
            textY: calcCenteredTextY(layerY, rowH, headerFont),
            maxTextWidth,
            isPartial: partialType !== PARTIAL_TYPE.FULL,
            partialType,
        });
    }

    /**
     * 合并默认样式和自定义样式
     *
     * 自定义样式覆盖默认样式的同名属性。
     * color 和 backgroundColor 特殊处理：自定义值为空时回退到默认值。
     *
     * @param {Object|null} baseStyle - 默认样式
     * @param {Object|null} customStyle - 自定义样式
     * @returns {Object} 合并后的样式
     */
    #mergeStyle(baseStyle, customStyle) {
        if (!customStyle) return baseStyle;

        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle?.color || null,
            backgroundColor: customStyle.backgroundColor || baseStyle?.backgroundColor || null,
        };
    }

    /**
     * 根据样式构建字体字符串
     *
     * 如果自定义样式包含字体相关属性（fontStyle、fontWeight、fontSize），
     * 则覆盖默认字体的对应部分；否则使用默认字体。
     * 字体族始终从默认字体中提取。
     *
     * @param {string} baseFont - 默认字体字符串（如 "12px Segoe UI"）
     * @param {Object|null} style - 自定义样式
     * @returns {string} 构建后的字体字符串
     */
    #buildFont(baseFont, style) {
        if (!style) return baseFont;

        const parts = [];
        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);
        if (style.fontSize) parts.push(style.fontSize);
        else parts.push(baseFont.match(/^[\d.]+px/)?.[0] || `${CONFIG.DEFAULT_FONT_SIZE}px`);
        parts.push(baseFont.match(/\s+(.+)$/)?.[1] || CONFIG.DEFAULT_FONT_FAMILY);

        return parts.join(" ");
    }

    /**
     * 计算文本 X 坐标
     *
     * 根据对齐方式和内边距计算文本起始 X 坐标：
     * - left：cellX + padding
     * - center：cellX + cellWidth / 2
     * - right：cellX + cellWidth - padding
     *
     * @param {number} cellX - 单元格左边缘 X 坐标
     * @param {number} cellWidth - 单元格宽度
     * @param {string} textAlign - 对齐方式（left/center/right）
     * @param {number} [padding=CONFIG.CELL_PADDING] - 内边距
     * @returns {number} 文本 X 坐标
     */
    #calcTextX(cellX, cellWidth, textAlign, padding = CONFIG.CELL_PADDING) {
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
}
