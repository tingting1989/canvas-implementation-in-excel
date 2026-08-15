/**
 * @fileoverview 图表渲染策略基类
 * @description 所有图表类型（柱状图、折线图、饼图等）的渲染策略均继承自此类。
 *              提供渲染、命中测试、Tooltip 格式化等核心方法的默认实现，
 *              子类按需覆写以实现特定图表类型的绘制逻辑。
 * @module render/chart/BaseChartStrategy
 */

import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "./types";

/** 默认命中检测半径（像素），用于折线图/散点图等点状元素的点击判定 */
const HIT_RADIUS = 12;
export { HIT_RADIUS };

/**
 * 图表渲染策略基类
 *
 * 定义所有图表类型的公共接口和默认行为。
 * 子类需覆写 render() 实现具体绘制逻辑，可选覆写 hitTest()、isAxisFree()、
 * formatTooltip()、formatDetail() 等方法以定制交互行为。
 *
 * @class BaseChartStrategy
 */
export class BaseChartStrategy {
    /** 图表类型标识，如 "bar"、"line"、"pie" */
    type: string;

    /** 图表显示名称，如 "柱状图"、"折线图" */
    name: string;

    /**
     * @private 受保护字段 - 当前像素比
     *
     * 由 renderWithPixelRatio 设置，用于高清导出场景。
     * 渲染完成后应通过 clearPixelRatio() 清除。
     */
    protected _pixelRatio?: number;

    /**
     * 构造渲染策略基类
     *
     * @param type - 图表类型标识，如 "bar"、"line"
     * @param name - 图表显示名称，如 "柱状图"
     */
    constructor(type: string, name: string) {
        this.type = type;
        this.name = name;
    }

    /**
     * 渲染图表
     *
     * 子类必须覆写此方法以实现特定图表类型的绘制逻辑。
     * 默认实现为空操作。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，headers 为列标题，data 为数据行
     * @param area - 绘图区域矩形（已扣除坐标轴/图例/内边距）
     * @param style - 图表样式配置
     * @param yScale - Y 轴刻度信息，为 null 时由策略自行计算
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {}

    /**
     * 获取当前渲染的像素比
     *
     * 优先使用外部设置的 pixelRatio（高清导出场景），
     * 否则根据 Canvas 物理宽度与逻辑宽度自动推算。
     * 推算公式：canvas.width / (area.x + area.w + 56)，其中 56 为右侧预留边距。
     * 计算结果 > 1.5 时四舍五入取整，否则返回 1。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param area - 绘图区域矩形
     * @returns 像素比，通常为 1（标准）或 2/3（高清）
     */
    protected getPixelRatio(ctx: CanvasRenderingContext2D, area: PlotArea): number {
        if (this._pixelRatio && this._pixelRatio > 1) {
            return this._pixelRatio;
        }

        try {
            const logicalWidth = area.x + area.w + 56;
            const calculated = ctx.canvas.width / logicalWidth;

            if (calculated > 1.5) {
                return Math.round(calculated);
            }

            return 1;
        } catch {
            return 1;
        }
    }

    /**
     * 设置像素比
     *
     * 由 NativeChartRenderer.renderWithPixelRatio 调用，
     * 确保策略内部渲染也使用正确的高清缩放比。
     *
     * @param ratio - 像素比，如 2 表示 Retina 屏幕
     */
    setPixelRatio(ratio: number): void {
        this._pixelRatio = ratio;
    }

    /**
     * 清除像素比
     *
     * 渲染完成后恢复默认，避免影响后续非高清渲染。
     */
    clearPixelRatio(): void {
        this._pixelRatio = undefined;
    }

    /**
     * 命中测试
     *
     * 判断坐标 (px, py) 是否落在图表元素上。
     * 默认返回 null（未命中），子类按需覆写。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param seriesCount - 系列数量
     * @param catCount - 分类数量
     * @param yScale - Y 轴刻度信息
     * @returns 命中信息对象，未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        return null;
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * 饼图、仪表盘、漏斗图等不依赖 X/Y 坐标轴的图表返回 true，
     * NativeChartRenderer 将跳过网格线和坐标轴的绘制。
     * 默认返回 false。
     *
     * @returns 是否为无坐标轴图表
     */
    isAxisFree(): boolean {
        return false;
    }

    /**
     * 格式化 Tooltip 文本行
     *
     * 默认输出 [分类名, 系列名: 值] 格式。
     * 若 hoverInfo 包含 detail，则委托给 formatDetail() 处理。
     * 数值格式化：整数直接输出，浮点数保留 2 位小数。
     *
     * @param hoverInfo - 命中检测返回的信息对象
     * @returns 格式化后的文本行数组
     */
    formatTooltip(hoverInfo: HitInfo): string[] {
        const lines = [String(hoverInfo.category)];
        let displayValue: string;

        if (typeof hoverInfo.value === "number" && !isNaN(hoverInfo.value)) {
            displayValue = Number.isInteger(hoverInfo.value) ? String(hoverInfo.value) : hoverInfo.value.toFixed(2);
        } else {
            displayValue = String(hoverInfo.value ?? "");
        }

        if (hoverInfo.detail) {
            lines.push(...this.formatDetail(hoverInfo.detail));
        } else if (hoverInfo.seriesName && hoverInfo.seriesName !== "undefined") {
            lines.push(`${hoverInfo.seriesName}: ${displayValue}`);
        } else {
            lines.push(displayValue);
        }

        return lines;
    }

    /**
     * 格式化详细信息的文本行
     *
     * 供 K线、仪表盘、热力图等复杂数据使用。
     * 默认直接输出 detail.value，子类可覆写以自定义格式。
     *
     * @param detail - 命中检测返回的 detail 对象
     * @returns 格式化后的文本行数组
     */
    formatDetail(detail: Record<string, unknown>): string[] {
        return [String(detail.value ?? detail)];
    }

    /**
     * 获取数据中所有系列的最小值
     *
     * 遍历所有数据行，跳过首列分类标签（从第 2 列开始），
     * 返回所有数值中的最小值。无有效数据时返回 0。
     *
     * @param data - 图表数据
     * @returns 所有系列数值的最小值
     */
    protected getYMin(data: ChartData): number {
        let min = Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v < min) {
                    min = v;
                }
            }
        }
        return min === Infinity ? 0 : min;
    }

    /**
     * 获取数据中所有系列的最大值
     *
     * 遍历所有数据行，跳过首列分类标签（从第 2 列开始），
     * 返回所有数值中的最大值。无有效数据时返回 1。
     *
     * @param data - 图表数据
     * @returns 所有系列数值的最大值
     */
    protected getYMax(data: ChartData): number {
        let max = -Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v > max) {
                    max = v;
                }
            }
        }
        return max === -Infinity ? 1 : max;
    }

    /**
     * 计算点到线段的最短距离
     *
     * 使用向量投影法：先求垂足参数 t = dot / lenSq，
     * 再钳位到 [0, 1] 得到线段上最近点，最后计算欧几里得距离。
     * 用于折线图命中检测的线段吸附判定。
     *
     * @param px - 点的 X 坐标
     * @param py - 点的 Y 坐标
     * @param x1 - 线段起点 X
     * @param y1 - 线段起点 Y
     * @param x2 - 线段终点 X
     * @param y2 - 线段终点 Y
     * @returns 点到线段的最短距离（像素）
     */
    protected pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        // 投影参数 t：0 = 起点，1 = 终点
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx: number, yy: number;

        if (param < 0) {
            // 垂足在线段起点之前，最近点为起点
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            // 垂足在线段终点之后，最近点为终点
            xx = x2;
            yy = y2;
        } else {
            // 垂足在线段上，最近点为垂足
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }
}
