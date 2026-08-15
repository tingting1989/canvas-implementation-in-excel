/**
 * @fileoverview 原生 Canvas 图表渲染器
 * @description 图表渲染的核心调度器，采用策略模式管理所有图表类型。
 *              负责完整的渲染管线：网格线 → 坐标轴 → 图表主体 → 标题 → 图例 → Tooltip。
 *              同时提供 Y 轴刻度计算、数值格式化、命中测试等静态工具方法。
 * @module render/chart/NativeChartRenderer
 */

import { BaseChartStrategy } from "./BaseChartStrategy";
import { getAllStrategies } from "./strategies/index";
import { CONFIG } from "../../constants/config";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, YScale, HitInfo } from "./types";
import type { Rect } from "../../model/types";

/**
 * 原生 Canvas 图表渲染器
 *
 * 采用策略模式，将不同图表类型的渲染逻辑委托给对应的 BaseChartStrategy 子类。
 * 本类负责渲染管线的编排（网格线 → 坐标轴 → 图表主体 → 标题 → 图例）
 * 以及 Y 轴刻度计算、数值格式化、命中测试等通用功能。
 * 所有方法均为静态方法，无需实例化。
 *
 * @class NativeChartRenderer
 */
export class NativeChartRenderer {
    /**
     * @static @private 静态私有字段 - 策略注册表
     *
     * type → strategy 实例的映射，如 "bar" → BarStrategy 实例。
     * 通过 register() 注册，init() 时批量注册所有内置策略。
     */
    static #registry: Map<string, BaseChartStrategy> = new Map();

    /**
     * @static 静态公共方法 - 注册渲染策略
     *
     * 将策略实例注册到注册表，后续可通过 get(type) 获取。
     * 非法策略（非 BaseChartStrategy 实例）会通过 errorHandler 记录错误日志。
     *
     * @param strategy - 渲染策略实例，必须继承 BaseChartStrategy
     */
    static register(strategy: BaseChartStrategy): void {
        if (!(strategy instanceof BaseChartStrategy)) {
            errorHandler.error(ERROR_CODE.CHART_INVALID_STRATEGY, `Invalid strategy:`, strategy);
            return;
        }

        this.#registry.set(strategy.type, strategy);
        errorHandler.info(ERROR_CODE.CHART_STRATEGY_REGISTERED, `Registered chart strategy: ${strategy.type} (${strategy.name})`);
    }

    /**
     * @static 静态公共方法 - 获取已注册的策略实例
     *
     * @param type - 图表类型标识，如 "bar"、"line"
     * @returns 策略实例，未注册返回 undefined
     */
    static get(type: string): BaseChartStrategy | undefined {
        return this.#registry.get(type);
    }

    /**
     * @static 静态公共方法 - 获取所有已注册的图表类型标识
     *
     * @returns 类型标识字符串数组
     */
    static getTypes(): string[] {
        return Array.from(this.#registry.keys());
    }

    /**
     * @static 静态公共方法 - 获取所有已注册策略的显示名称
     *
     * @returns 显示名称字符串数组
     */
    static getNames(): string[] {
        return Array.from(this.#registry.values()).map((s) => s.name);
    }

    /**
     * @static 静态公共方法 - 初始化渲染器
     *
     * 从策略注册表（getAllStrategies）批量注册所有内置策略。
     * 应在应用启动时调用一次。
     */
    static init(): void {
        const strategies = getAllStrategies();
        strategies.forEach((strategy) => this.register(strategy));
    }

    /**
     * @static 静态公共方法 - 设置全局日志级别
     *
     * @param level - 日志级别数值
     */
    static setLogLevel(level: number): void {
        errorHandler.configure({ level });
    }

    /**
     * @static 静态公共方法 - 高清导出渲染入口
     *
     * 与 render() 不同的是，pixelRatio 由外部显式传入，
     * 并在渲染前后通过 setPixelRatio/clearPixelRatio 确保策略内部也使用正确的缩放比。
     * 使用 try/finally 保证 pixelRatio 一定会被清除。
     *
     * 渲染管线：网格线 → 坐标轴 → 图表主体 → 标题 → 图例
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param chart - 图表配置对象，至少包含 type 字段
     * @param data - 图表数据
     * @param plotArea - 绘图区域矩形
     * @param style - 图表样式配置
     * @param pixelRatio - 显式指定的像素比
     */
    static renderWithPixelRatio(
        ctx: CanvasRenderingContext2D,
        chart: { type: string },
        data: ChartData,
        plotArea: PlotArea,
        style: ChartStyle,
        pixelRatio: number,
    ): void {
        ctx.save();

        let yScale: YScale | null = null;
        const strategy = this.get(chart.type);

        // 设置策略的像素比，确保内部渲染使用正确的缩放
        if (strategy) {
            strategy.setPixelRatio(pixelRatio);
        }

        try {
            // 非无坐标轴图表：绘制网格线和坐标轴
            if (strategy && !strategy.isAxisFree()) {
                if (style.showGrid !== false) {
                    this.renderGridWithPixelRatio(ctx, plotArea, pixelRatio);
                }

                yScale = this.buildYScale(data, chart.type);
                this.renderAxes(ctx, data, plotArea, yScale, style, pixelRatio);
            }

            // 委托策略渲染图表主体
            if (strategy) {
                strategy.render(ctx, data, plotArea, style, yScale);
            } else {
                errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `No strategy found for chart type: ${chart.type}`);
            }

            // 渲染标题
            if (style.title) {
                this.renderTitle(ctx, style.title, plotArea, pixelRatio);
            }

            // 渲染图例
            if (style.showLegend !== false) {
                this.renderLegend(ctx, data, plotArea, style, pixelRatio);
            }
        } finally {
            // 确保像素比一定被清除
            if (strategy) {
                strategy.clearPixelRatio();
            }
        }

        ctx.restore();
    }

    /**
     * @static 静态公共方法 - 标准渲染入口
     *
     * 执行完整渲染管线：网格线 → 坐标轴 → 图表主体 → 标题 → 图例。
     * pixelRatio 根据 Canvas 物理宽度自动推算。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param chart - 图表配置对象，至少包含 type 字段
     * @param data - 图表数据
     * @param plotArea - 绘图区域矩形
     * @param style - 图表样式配置
     */
    static render(ctx: CanvasRenderingContext2D, chart: { type: string }, data: ChartData, plotArea: PlotArea, style: ChartStyle): void {
        ctx.save();

        // 自动推算像素比
        const pixelRatio = ctx.canvas.width / (plotArea.x + plotArea.w + 56);

        let yScale: YScale | null = null;
        const strategy = this.get(chart.type);

        // 非无坐标轴图表：绘制网格线和坐标轴
        if (strategy && !strategy.isAxisFree()) {
            if (style.showGrid !== false) {
                this.renderGrid(ctx, plotArea);
            }

            yScale = this.buildYScale(data, chart.type);
            this.renderAxes(ctx, data, plotArea, yScale, style, pixelRatio);
        }

        // 委托策略渲染图表主体
        if (strategy) {
            strategy.render(ctx, data, plotArea, style, yScale);
        } else {
            errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `No strategy found for chart type: ${chart.type}`);
        }

        // 渲染标题
        if (style.title) {
            this.renderTitle(ctx, style.title, plotArea, pixelRatio);
        }

        // 渲染图例
        if (style.showLegend !== false) {
            this.renderLegend(ctx, data, plotArea, style, pixelRatio);
        }

        ctx.restore();
    }

    /**
     * @static 静态公共方法 - 命中测试
     *
     * 委托给对应策略的 hitTest 方法，判断坐标是否落在图表元素上。
     *
     * @param px - 点击位置的 X 坐标
     * @param py - 点击位置的 Y 坐标
     * @param chart - 图表配置对象
     * @param data - 图表数据
     * @param plotArea - 绘图区域矩形
     * @param seriesCount - 系列数量
     * @param catCount - 分类数量
     * @param yScale - Y 轴刻度信息
     * @returns 命中信息对象，未命中返回 null
     */
    static hitTest(
        px: number,
        py: number,
        chart: { type: string },
        data: ChartData,
        plotArea: PlotArea,
        seriesCount: number,
        catCount: number,
        yScale?: YScale | null,
    ): HitInfo | null {
        const strategy = this.get(chart.type);
        if (strategy) {
            return strategy.hitTest(px, py, data, plotArea, seriesCount, catCount, yScale);
        }
        return null;
    }

    /**
     * @static 静态公共方法 - 命中测试便捷方法
     *
     * 自动从 data 中推导 seriesCount 和 catCount，
     * 简化调用方代码。
     *
     * @param px - 点击位置的 X 坐标
     * @param py - 点击位置的 Y 坐标
     * @param chartType - 图表类型标识
     * @param data - 图表数据
     * @param plotArea - 绘图区域矩形
     * @param yScale - Y 轴刻度信息
     * @returns 命中信息对象，未命中返回 null
     */
    static hitTestDataPoint(px: number, py: number, chartType: string, data: ChartData, plotArea: PlotArea, yScale: YScale): HitInfo | null {
        const strategy = this.get(chartType);
        if (!strategy) {
            return null;
        }

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) {
            return null;
        }

        return strategy.hitTest(px, py, data, plotArea, seriesCount, catCount, yScale);
    }

    /**
     * @static 静态公共方法 - 渲染 Tooltip 浮层
     *
     * 绘制深色半透明背景 + 白色文字 + 圆角矩形的 Tooltip。
     * 自动进行边界钳位，确保 Tooltip 不超出 bounds 范围。
     * 优先显示在命中点右上方，空间不足时自动调整位置。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param hoverInfo - 命中检测返回的信息对象
     * @param bounds - 边界矩形，Tooltip 不得超出此范围
     * @param style - 图表样式配置
     */
    static renderTooltip(ctx: CanvasRenderingContext2D, hoverInfo: HitInfo, bounds: Rect, style: ChartStyle): void {
        if (!hoverInfo || !bounds) {
            return;
        }

        const { category, seriesName, value, pointX, pointY } = hoverInfo;
        const padding = { x: 8, y: 6 };
        const lineHeight = 16;

        // 通过策略格式化 Tooltip 文本行
        const strategy = this.get(hoverInfo.chartType || "");
        const lines = strategy ? strategy.formatTooltip(hoverInfo) : [String(category)];

        ctx.save();
        ctx.font = `${CONFIG.CHART_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;

        // 计算最大文本宽度
        let maxW = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxW) {
                maxW = w;
            }
        }

        const boxW = maxW + padding.x * 2;
        const boxH = lines.length * lineHeight + padding.y * 2;

        // 默认位置：命中点右上方
        let tipX = pointX + 12;
        let tipY = pointY - boxH - 10;

        // 右侧越界：移到左侧
        if (tipX + boxW > bounds.x + bounds.w) {
            tipX = pointX - boxW - 12;
        }
        // 上方越界：移到下方
        if (tipY < bounds.y) {
            tipY = pointY + 14;
        }

        // 边界钳位：确保不超出 bounds
        tipX = Math.max(bounds.x, Math.min(tipX, bounds.x + bounds.w - boxW));
        tipY = Math.max(bounds.y, Math.min(tipY, bounds.y + bounds.h - boxH));

        // 绘制深色半透明背景圆角矩形
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, boxW, boxH, 4);
        ctx.fill();

        // 绘制白色文本行
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], tipX + padding.x, tipY + padding.y + i * lineHeight);
        }

        ctx.restore();
    }

    /**
     * @static 静态公共方法 - 渲染网格线（自动推算 pixelRatio）
     *
     * 委托给 renderGridWithPixelRatio，自动从 Canvas 尺寸推算像素比。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param area - 绘图区域矩形
     */
    static renderGrid(ctx: CanvasRenderingContext2D, area: PlotArea): void {
        const pixelRatio = ctx.canvas.width / (area.x + area.w + 56);

        this.renderGridWithPixelRatio(ctx, area, pixelRatio);
    }

    /**
     * @static 静态公共方法 - 渲染网格线（指定 pixelRatio）
     *
     * 绘制 5 条水平等距网格线，从绘图区顶部到底部均匀分布。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param area - 绘图区域矩形
     * @param pixelRatio - 像素比
     */
    static renderGridWithPixelRatio(ctx: CanvasRenderingContext2D, area: PlotArea, pixelRatio: number): void {
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_GRID_COLOR;
        ctx.lineWidth = CONFIG.CHART_GRID_LINE_WIDTH * pixelRatio;

        const yTicks = 5;
        const stepY = area.h / yTicks;
        for (let i = 0; i <= yTicks; i++) {
            const y = area.y + stepY * i;
            ctx.beginPath();
            ctx.moveTo(area.x, y);
            ctx.lineTo(area.x + area.w, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * @static 静态公共方法 - 渲染坐标轴
     *
     * 绘制 X 轴和 Y 轴，包括：
     * - 坐标轴线（L 形：左边界 + 底边界）
     * - X 轴分类标签（居中对齐，底部偏移 6px）
     * - Y 轴刻度标签（右对齐，左侧偏移 6px）
     * - 可选的 X/Y 轴标签文本
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param yScale - Y 轴刻度信息
     * @param style - 图表样式配置
     * @param pixelRatio - 像素比，默认 1
     */
    static renderAxes(
        ctx: CanvasRenderingContext2D,
        data: ChartData,
        area: PlotArea,
        yScale: YScale,
        style: ChartStyle,
        pixelRatio: number = 1,
    ): void {
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_AXIS_COLOR;
        ctx.lineWidth = CONFIG.CHART_AXIS_LINE_WIDTH * pixelRatio;

        // 绘制 L 形坐标轴线
        ctx.beginPath();
        ctx.moveTo(area.x, area.y);
        ctx.lineTo(area.x, area.y + area.h);
        ctx.lineTo(area.x + area.w, area.y + area.h);
        ctx.stroke();

        // 绘制 X 轴分类标签
        const categories = data.data.map((row) => String(row[0]));
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const step = area.w / categories.length;
        for (let i = 0; i < categories.length; i++) {
            ctx.fillText(String(categories[i]), area.x + step * i + step / 2, area.y + area.h + 6 * pixelRatio);
        }

        // 绘制 Y 轴刻度标签
        const yTicks = yScale.ticks;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        for (const val of yTicks) {
            const y = area.y + area.h - ((val - yScale.min) / (yScale.max - yScale.min)) * area.h;
            ctx.fillText(this.formatNumber(val), area.x - 6 * pixelRatio, y);
        }

        // 可选：X 轴标签
        if (style?.xAxisLabel) {
            ctx.textAlign = "end";
            ctx.textBaseline = "top";
            ctx.fillText(style.xAxisLabel, area.x + area.w, area.y + area.h + 22 * pixelRatio);
        }

        // 可选：Y 轴标签
        if (style?.yAxisLabel) {
            ctx.save();
            ctx.textAlign = "left";
            ctx.textBaseline = "bottom";
            ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
            ctx.fillText(style.yAxisLabel, area.x + 8 * pixelRatio, area.y - 6 * pixelRatio);
            ctx.restore();
        }

        ctx.restore();
    }

    /**
     * @static 静态公共方法 - 渲染图表标题
     *
     * 在绘图区顶部居中绘制粗体标题文本。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param title - 标题文本
     * @param area - 绘图区域矩形
     * @param pixelRatio - 像素比，默认 1
     */
    static renderTitle(ctx: CanvasRenderingContext2D, title: string, area: PlotArea, pixelRatio: number = 1): void {
        ctx.save();
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `bold ${CONFIG.CHART_TITLE_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(title, area.x + area.w / 2, 10 * pixelRatio);
        ctx.restore();
    }

    /**
     * @static 静态公共方法 - 渲染图例
     *
     * 在绘图区底部居中绘制图例项，每项包含色块 + 系列名称。
     * 图例项等宽排列，整体居中对齐。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置
     * @param pixelRatio - 像素比，默认 1
     */
    static renderLegend(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, pixelRatio: number = 1): void {
        const seriesNames = data.headers.slice(1);
        ctx.save();
        ctx.font = `${CONFIG.CHART_LEGEND_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;

        const itemWidth = CONFIG.CHART_LEGEND_ITEM_WIDTH * pixelRatio;
        const totalWidth = seriesNames.length * itemWidth;
        let startX = area.x + (area.w - totalWidth) / 2;
        const y = area.y + area.h + CONFIG.CHART_LEGEND_OFFSET_Y * pixelRatio;

        for (let i = 0; i < seriesNames.length; i++) {
            // 绘制色块
            ctx.fillStyle = style.colors![i % style.colors!.length];
            ctx.fillRect(startX, y - 5 * pixelRatio, CONFIG.CHART_LEGEND_ITEM_SIZE * pixelRatio, CONFIG.CHART_LEGEND_ITEM_SIZE * pixelRatio);

            // 绘制系列名称
            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(String(seriesNames[i]), startX + 16 * pixelRatio, y + 1);

            startX += itemWidth;
        }

        ctx.restore();
    }

    /**
     * @static 静态公共方法 - 获取数据中所有系列的最小值
     *
     * 遍历所有数据行，跳过首列分类标签（从第 2 列开始），
     * 返回所有数值中的最小值。无有效数据时返回 0。
     *
     * @param data - 图表数据
     * @returns 所有系列数值的最小值
     */
    static getYMin(data: ChartData): number {
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
     * @static 静态公共方法 - 获取数据中所有系列的最大值
     *
     * 遍历所有数据行，跳过首列分类标签（从第 2 列开始），
     * 返回所有数值中的最大值。无有效数据时返回 1。
     *
     * @param data - 图表数据
     * @returns 所有系列数值的最大值
     */
    static getYMax(data: ChartData): number {
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
     * @static 静态公共方法 - 构建 Y 轴刻度信息
     *
     * 根据数据范围和图表类型计算 Y 轴的最小值、最大值和刻度值。
     * 柱状图和全正数据的图表，Y 轴最小值强制为 0；
     * 含负值的非柱状图，Y 轴最小值取实际数据最小值。
     *
     * @param data - 图表数据
     * @param chartType - 图表类型标识
     * @returns Y 轴刻度信息，包含 min、max 和 ticks
     */
    static buildYScale(data: ChartData, chartType: string): YScale {
        const dataMin = this.getYMin(data);

        let minValue: number;
        if (dataMin >= 0) {
            // 全正数据：Y 轴从 0 开始
            minValue = 0;
        } else if (chartType === "bar") {
            // 柱状图：即使有负值也从 0 开始
            minValue = 0;
        } else {
            // 其他图表：包含负值时 Y 轴从实际最小值开始
            minValue = dataMin;
        }

        const ticks = this.calcYTicks(data, 5, minValue);
        return {
            min: ticks[0],
            max: ticks[ticks.length - 1],
            ticks,
        };
    }

    /**
     * @static 静态公共方法 - 计算 Y 轴刻度值
     *
     * 使用"美观刻度"算法：
     * 1. 计算原始步长 rawStep = range / count
     * 2. 将 rawStep 归一化到 1~10 范围（normStep）
     * 3. 根据 normStep 选择美观步长（1, 2, 5, 10 的倍数）
     * 4. 从 floor(yMin/step) 到 ceil(yMax/step) 生成刻度序列
     *
     * @param data - 图表数据
     * @param count - 期望的刻度数量
     * @param minValue - 可选的强制最小值
     * @returns 刻度值数组，首元素为最小值，末元素为最大值
     */
    static calcYTicks(data: ChartData, count: number, minValue?: number): number[] {
        const yMin = minValue !== undefined ? minValue : this.getYMin(data);
        const yMax = this.getYMax(data);
        const range = yMax - yMin || 1;
        const rawStep = range / count;

        // 将 rawStep 归一化到 1~10 范围
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normStep = rawStep / mag;

        // 选择美观步长：1, 2, 5, 10 的倍数
        let step: number;
        if (normStep <= 1.5) {
            step = mag;
        } else if (normStep <= 3) {
            step = 2 * mag;
        } else if (normStep <= 7) {
            step = 5 * mag;
        } else {
            step = 10 * mag;
        }

        // 生成刻度序列，浮点精度修正到 10 位小数
        const start = Math.floor(yMin / step) * step;
        const end = Math.ceil(yMax / step) * step;
        const ticks: number[] = [];
        for (let v = start; v <= end + step * 0.01; v += step) {
            ticks.push(Math.round(v * 1e10) / 1e10);
        }

        return ticks;
    }

    /**
     * @static 静态公共方法 - 格式化数值显示
     *
     * 大数缩写：≥ 1M 显示为 "x.xM"，≥ 1K 显示为 "x.xK"，
     * 其余直接输出字符串。
     *
     * @param val - 数值
     * @returns 格式化后的字符串
     */
    static formatNumber(val: number): string {
        if (Math.abs(val) >= 1e6) {
            return (val / 1e6).toFixed(1) + "M";
        }
        if (Math.abs(val) >= 1e3) {
            return (val / 1e3).toFixed(1) + "K";
        }
        return String(val);
    }

    /**
     * @static 静态公共方法 - 计算点到线段的最短距离
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
    static pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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

NativeChartRenderer.init();
