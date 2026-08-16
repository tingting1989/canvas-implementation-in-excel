import { CONFIG } from "../../constants/config.js";
import { isObject, isString } from "../../utils/helper.js";
import { calcCenteredTextY } from "../../utils/canvasUtils.js";
import { LogicalCell } from "./models/LogicalCell.js";
import type { LogicalCellStyle } from "./models/LogicalCell.js";
import { Fragment } from "./models/Fragment.js";
import type { FragmentOpts } from "./models/Fragment.js";
import { BorderMask } from "./models/BorderMask.js";
import type { BorderMaskValue } from "./models/BorderMask.js";
import { PARTIAL_TYPE } from "./models/PartialType.js";
import type { PartialType } from "./models/PartialType.js";
import type { FrozenBoundaryInfo } from "./models/FrozenBoundaryInfo.js";

type ViewportTransform = import("../ViewportTransform.js").ViewportTransform;
type Sheet = import("../../workbook/Sheet.js").Sheet;

/** buildLayerFragments 方法参数接口 */
interface LayerFragmentOpts {
    /** 嵌套表头层数据（字符串或配置对象数组） */
    layerData: (string | Record<string, unknown>)[];
    /** 层索引（0 = 最上层） */
    layerIndex: number;
    /** 层顶部 y 坐标 */
    layerY: number;
    /** 行高度 */
    rowH: number;
    /** 可视起始列号（含） */
    sc: number;
    /** 可视结束列号（不含） */
    ec: number;
    /** 冻结边界信息 */
    frozenBoundary: FrozenBoundaryInfo;
    /** 视口变换 */
    vt: ViewportTransform;
    /** 工作表实例 */
    sheet: Sheet;
    /** 基础默认样式 */
    defaultStyle: LogicalCellStyle;
    /** 表头基础字体字符串 */
    headerFont: string;
}

/** buildSimpleLayerFragments 方法参数接口 */
interface SimpleLayerFragmentOpts {
    /** 可视起始列号（含） */
    sc: number;
    /** 可视结束列号（不含） */
    ec: number;
    /** 层顶部 y 坐标 */
    layerY: number;
    /** 行高度 */
    rowH: number;
    /** 视口变换 */
    vt: ViewportTransform;
    /** 工作表实例 */
    sheet: Sheet;
    /** 基础默认样式 */
    defaultStyle: LogicalCellStyle;
    /** 表头基础字体字符串 */
    headerFont: string;
}

/** cellToFragments 私有方法的上下文参数 */
interface CellToFragmentCtx {
    /** 层顶部 y 坐标 */
    layerY: number;
    /** 行高度 */
    rowH: number;
    /** 可视起始列号（含） */
    sc: number;
    /** 可视结束列号（不含） */
    ec: number;
    /** 冻结边界信息 */
    frozenBoundary: FrozenBoundaryInfo;
    /** 视口变换 */
    vt: ViewportTransform;
    /** 工作表实例 */
    sheet: Sheet;
    /** 基础默认样式 */
    defaultStyle: LogicalCellStyle;
    /** 表头基础字体字符串 */
    headerFont: string;
}

/** createFragment 私有方法的参数接口 */
interface CreateFragmentOpts {
    /** 可视起始列号（含） */
    visStartCol: number;
    /** 可视结束列号（含） */
    visEndCol: number;
    /** 层顶部 y 坐标 */
    layerY: number;
    /** 行高度 */
    rowH: number;
    /** 视口变换 */
    vt: ViewportTransform;
    /** 工作表实例 */
    sheet: Sheet;
    /** 基础默认样式 */
    defaultStyle: LogicalCellStyle;
    /** 表头基础字体字符串 */
    headerFont: string;
    /** 边框掩码覆盖值 */
    borderOverride: BorderMaskValue;
    /** 片段类型 */
    partialType: PartialType;
}

/**
 * 表头布局构建器（HeaderLayoutBuilder）
 *
 * 负责将嵌套表头配置（nestedHeaders）转换为可视片段（Fragment[]），
 * 供 HeaderPainter 绘制到 Canvas。
 *
 * ## 渲染管线
 *
 * ```
 * nestedHeaders 配置
 *   → parseLayerCells() → LogicalCell[]
 *   → cellToFragments() → Fragment[]
 *   → HeaderPainter.paintAll()
 * ```
 *
 * ## 两种构建模式
 *
 * 1. **嵌套表头**（buildLayerFragments）：支持合并单元格、冻结拆分、样式合并
 * 2. **简单表头**（buildSimpleLayerFragments）：每列独立，无合并单元格，无冻结拆分
 *
 * @see Fragment 可视片段
 * @see LogicalCell 逻辑单元格
 * @see FrozenBoundaryInfo 冻结边界信息
 */
export class HeaderLayoutBuilder {
    /**
     * 构建嵌套表头层的可视片段
     *
     * 流程：
     * 1. 解析层配置为 LogicalCell[]
     * 2. 过滤出可视范围内的单元格
     * 3. 将每个 LogicalCell 转换为 Fragment（可能因冻结拆分为多个）
     * 4. 按 x 坐标排序
     *
     * @param opts - 构建参数
     * @param opts.layerData - 嵌套表头层数据
     * @param opts.layerIndex - 层索引
     * @param opts.layerY - 层顶部 y 坐标
     * @param opts.rowH - 行高度
     * @param opts.sc - 可视起始列号（含）
     * @param opts.ec - 可视结束列号（不含）
     * @param opts.frozenBoundary - 冻结边界信息
     * @param opts.vt - 视口变换
     * @param opts.sheet - 工作表实例
     * @param opts.defaultStyle - 基础默认样式
     * @param opts.headerFont - 表头基础字体
     * @returns 排序后的 Fragment 数组
     */
    buildLayerFragments(opts: LayerFragmentOpts): Fragment[] {
        const { layerData, layerIndex, layerY, rowH, sc, ec, frozenBoundary, vt, sheet, defaultStyle, headerFont } = opts;

        const logicalCells = this.#parseLayerCells(layerData, layerIndex);
        const visibleCells = logicalCells.filter((c) => c.endCol >= sc && c.startCol < ec);

        const fragments: Fragment[] = [];
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

        fragments.sort((a, b) => a.x - b.x);
        return fragments;
    }

    /**
     * 构建简单表头层的可视片段（无合并单元格、无冻结拆分）
     *
     * 每列独立生成一个 Fragment，直接读取列头文本和列样式，
     * 不涉及 LogicalCell 解析和冻结边界拆分。
     *
     * @param opts - 构建参数
     * @param opts.sc - 可视起始列号（含）
     * @param opts.ec - 可视结束列号（不含）
     * @param opts.layerY - 层顶部 y 坐标
     * @param opts.rowH - 行高度
     * @param opts.vt - 视口变换
     * @param opts.sheet - 工作表实例
     * @param opts.defaultStyle - 基础默认样式
     * @param opts.headerFont - 表头基础字体
     * @returns Fragment 数组
     */
    buildSimpleLayerFragments(opts: SimpleLayerFragmentOpts): Fragment[] {
        const { sc, ec, layerY, rowH, vt, sheet, defaultStyle, headerFont } = opts;
        const rc = sheet.rowColManager;
        const cp = sheet.cellPadding;
        const fragments: Fragment[] = [];

        for (let c = sc; c < ec; c++) {
            const w = rc.getColWidth(c);
            if (w <= 0) continue;

            const x = vt.colToViewX(c);
            const colStyle = sheet.getColHeaderStyle(c) as LogicalCellStyle | null;
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
     * @private 私有方法 - 解析嵌套表头层数据为 LogicalCell 数组
     *
     * 将 nestedHeaders[layer] 配置数组解析为 LogicalCell 对象数组。
     * 每个元素可以是：
     * - 字符串：纯文本标签，colspan = 1
     * - 对象：可包含 label、colspan、style 等属性
     *
     * 解析过程中维护 consumed 计数器，自动计算每个单元格的 startCol 和 endCol。
     *
     * @param layerData - 嵌套表头层数据
     * @param layerIndex - 层索引
     * @returns LogicalCell 数组
     */
    #parseLayerCells(layerData: (string | Record<string, unknown>)[], layerIndex: number): LogicalCell[] {
        const cells: LogicalCell[] = [];
        let consumed = 0;

        for (let i = 0; i < layerData.length; i++) {
            const item = layerData[i];
            const label = isString(item) ? item : ((item?.label ?? "") as string);
            const colspan =
                item && isObject(item) && (item as Record<string, unknown>).colspan ? ((item as Record<string, unknown>).colspan as number) : 1;
            const style = ((item as Record<string, unknown>)?.style as LogicalCellStyle | null) || null;

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
     * @private 私有方法 - 将 LogicalCell 转换为 Fragment 数组
     *
     * 核心拆分逻辑：
     * - 若单元格被冻结边界水平切割 → 拆分为冻结侧 + 滚动侧两个 Fragment
     * - 否则 → 生成一个完整 Fragment
     *
     * 合并单元格到达可视右边界时，补画右边框。
     *
     * @param cell - 逻辑单元格
     * @param ctx - 上下文参数（含视口、冻结、样式等信息）
     * @returns Fragment 数组（可能包含 null，由调用方过滤）
     */
    #cellToFragments(cell: LogicalCell, ctx: CellToFragmentCtx): (Fragment | null)[] {
        const { frozenBoundary, sc, ec, vt, ...rest } = ctx;

        if (frozenBoundary.splitsCellHorizontally(cell)) {
            const fragments: (Fragment | null)[] = [];

            // 冻结侧片段：从 max(startCol, sc) 到 fixedCols - 1
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

            // 滚动侧片段：从 max(fixedCols, sc) 到 min(endCol, ec - 1)
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

        // 未被冻结切割：生成一个完整 Fragment
        const visEndCol = Math.min(cell.endCol, ec - 1);
        const baseBorderMask = cell.isMerged ? BorderMask.MERGED_DEFAULT : BorderMask.ALL;
        // 合并单元格到达可视右边界时，补画右边框
        const borderOverride = visEndCol >= ec - 1 && cell.isMerged ? ((baseBorderMask | BorderMask.RIGHT) as BorderMaskValue) : baseBorderMask;

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
     * @private 私有方法 - 创建单个 Fragment
     *
     * 根据可视列范围计算几何信息，合并样式，确定文本策略：
     * - FROZEN：显示文本（冻结侧需要显示标签）
     * - SCROLL：不显示文本（滚动侧不重复显示标签，避免与冻结侧重叠）
     * - FULL：显示文本
     *
     * 跳过宽度为 0 的隐藏列。若所有列均隐藏或总宽度 ≤ 0，返回 null。
     *
     * @param cell - 来源逻辑单元格
     * @param opts - 创建参数
     * @returns Fragment 实例，若无可视内容则返回 null
     */
    #createFragment(cell: LogicalCell, opts: CreateFragmentOpts): Fragment | null {
        const { visStartCol, visEndCol, layerY, rowH, vt, sheet, defaultStyle, headerFont, borderOverride, partialType } = opts;
        const rc = sheet.rowColManager;
        const cp = sheet.cellPadding;

        // 跳过隐藏列（宽度 ≤ 0），找到第一个可见列
        let visibleStartCol = visStartCol;
        while (visibleStartCol <= visEndCol && rc.getColWidth(visibleStartCol) <= 0) {
            visibleStartCol++;
        }
        if (visibleStartCol > visEndCol) return null;

        const x = vt.colToViewX(visibleStartCol);
        const rightX = vt.colRightToViewX(visEndCol);
        const totalW = rightX - x;

        if (totalW <= 0) return null;

        const mergedStyle = this.#mergeStyle(defaultStyle, cell.style);
        const textAlign = cell.style?.textAlign || "left";
        const font = this.#buildFont(headerFont, cell.style);

        // 根据片段类型决定文本策略
        let text: string | null;
        let textX: number;
        let maxTextWidth: number;
        if (partialType === PARTIAL_TYPE.FROZEN) {
            // 冻结侧：显示文本
            text = cell.label;
            textX = this.#calcTextX(x, totalW, textAlign, cp);
            maxTextWidth = totalW - cp * 2;
        } else if (partialType === PARTIAL_TYPE.SCROLL) {
            // 滚动侧：不显示文本，避免与冻结侧重叠
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
     * @private 私有方法 - 合并基础样式与自定义样式
     *
     * 合并策略：
     * - 无自定义样式 → 直接返回基础样式
     * - 有自定义样式 → 浅合并，自定义样式覆盖基础样式
     * - color/backgroundColor 特殊处理：自定义值为空时回退到基础值
     *
     * @param baseStyle - 基础样式（如层默认样式）
     * @param customStyle - 自定义样式（如单元格/列样式）
     * @returns 合并后的样式，若两者均为空则返回 null
     */
    #mergeStyle(baseStyle: LogicalCellStyle | null, customStyle: LogicalCellStyle | null): LogicalCellStyle | null {
        if (!customStyle) return baseStyle;

        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle?.color || null,
            backgroundColor: customStyle.backgroundColor || baseStyle?.backgroundColor || null,
        };
    }

    /**
     * @private 私有方法 - 根据样式构建字体字符串
     *
     * 从基础字体中提取字号和字体族，结合样式中的 fontStyle、fontWeight、fontSize
     * 组合为完整的 CSS 字体字符串。
     *
     * 格式：[fontStyle] [fontWeight] [fontSize] [fontFamily]
     * 例如："italic bold 14px Arial"
     *
     * @param baseFont - 基础字体字符串（如 "14px Arial"）
     * @param style - 自定义样式（可能包含 fontStyle/fontWeight/fontSize）
     * @returns 完整的 CSS 字体字符串
     */
    #buildFont(baseFont: string, style: LogicalCellStyle | null): string {
        if (!style) return baseFont;

        const parts: string[] = [];
        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);
        if (style.fontSize) parts.push(style.fontSize);
        else parts.push(baseFont.match(/^[\d.]+px/)?.[0] || `${CONFIG.DEFAULT_FONT_SIZE}px`);
        parts.push(baseFont.match(/\s+(.+)$/)?.[1] || CONFIG.DEFAULT_FONT_FAMILY);

        return parts.join(" ");
    }

    /**
     * @private 私有方法 - 计算文本绘制 x 坐标
     *
     * 根据 textAlign 决定文本起始 x 坐标：
     * - left：单元格左边缘 + padding
     * - center：单元格水平中心
     * - right：单元格右边缘 - padding
     *
     * @param cellX - 单元格左上角 x 坐标
     * @param cellWidth - 单元格宽度
     * @param textAlign - 文本对齐方式（left/center/right）
     * @param padding - 单元格内边距，默认 CONFIG.CELL_PADDING
     * @returns 文本绘制 x 坐标
     */
    #calcTextX(cellX: number, cellWidth: number, textAlign: string, padding: number = CONFIG.CELL_PADDING): number {
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
