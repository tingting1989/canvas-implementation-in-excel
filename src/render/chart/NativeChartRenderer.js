import { BaseChartStrategy, HIT_RADIUS } from "./BaseChartStrategy.js";
import { getAllStrategies } from "./strategies/index.js";
import { CONFIG } from "../../constants/config.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/**
 * 原生图表渲染器（NativeChartRenderer）
 *
 * 基于 Canvas 2D API 的图表渲染器，采用策略模式管理不同图表类型的渲染逻辑。
 * 本类负责：
 * 1. 策略注册表：管理图表类型 → 渲染策略的映射
 * 2. 通用渲染管线：网格线 → 坐标轴 → 数据图形 → 标题 → 图例
 * 3. 交互支持：数据点命中测试、工具提示渲染
 * 4. Y 轴刻度计算：自动计算美观的刻度值
 * 5. 几何工具：点到线段距离计算
 *
 * ## 策略模式
 *
 * 每种图表类型（bar、line、pie、candlestick 等）对应一个 BaseChartStrategy 子类，
 * 通过 register() 注册到 #registry 中。渲染时根据 chart.type 查找对应策略，
 * 委托其绘制数据图形部分，通用部分（网格、坐标轴、标题、图例）由本类统一处理。
 *
 * ## 渲染管线
 *
 * ```
 * render() / renderWithPixelRatio()
 *   ├─ 1. 网格线（renderGrid，仅非 axisFree 类型）
 *   ├─ 2. Y 轴刻度计算（buildYScale）
 *   ├─ 3. 坐标轴（renderAxes，仅非 axisFree 类型）
 *   ├─ 4. 数据图形（strategy.render，委托给具体策略）
 *   ├─ 5. 标题（renderTitle）
 *   └─ 6. 图例（renderLegend）
 * ```
 *
 * ## 像素比处理
 *
 * - render()：从 Canvas 物理宽度与逻辑宽度之比推算 pixelRatio
 * - renderWithPixelRatio()：直接接收 pixelRatio 参数，用于高清导出场景
 * - 策略通过 setPixelRatio / clearPixelRatio 在渲染期间临时设置像素比
 *
 * @see BaseChartStrategy 图表渲染策略基类
 * @see IChartRenderer 图表渲染器接口（面向 ChartLayer 的契约）
 */
export class NativeChartRenderer {
    /** @type {Map<string, BaseChartStrategy>} 图表类型 → 渲染策略的注册表 */
    static #registry = new Map();

    /**
     * 注册图表渲染策略
     *
     * 将策略实例绑定到其 type 属性，后续可通过 get(type) 查找。
     * 非法策略（非 BaseChartStrategy 实例）会被拒绝并记录错误。
     *
     * @static
     * @param {BaseChartStrategy} strategy - 图表渲染策略实例
     */
    static register(strategy) {
        if (!(strategy instanceof BaseChartStrategy)) {
            errorHandler.error(ERROR_CODE.CHART_INVALID_STRATEGY, `Invalid strategy:`, strategy);
            return;
        }

        this.#registry.set(strategy.type, strategy);
        errorHandler.info(ERROR_CODE.CHART_STRATEGY_REGISTERED, `Registered chart strategy: ${strategy.type} (${strategy.name})`);
    }

    /**
     * 根据图表类型获取已注册的渲染策略
     *
     * @static
     * @param {string} type - 图表类型标识（如 "bar"、"line"、"pie"）
     * @returns {BaseChartStrategy|undefined} 渲染策略实例，未注册时返回 undefined
     */
    static get(type) {
        return this.#registry.get(type);
    }

    /**
     * 获取所有已注册的图表类型标识
     *
     * @static
     * @returns {string[]} 图表类型标识数组
     */
    static getTypes() {
        return Array.from(this.#registry.keys());
    }

    /**
     * 获取所有已注册策略的显示名称
     *
     * @static
     * @returns {string[]} 策略名称数组
     */
    static getNames() {
        return Array.from(this.#registry.values()).map((s) => s.name);
    }

    /**
     * 初始化所有内置图表策略
     *
     * 从 strategies/index.js 获取所有策略实例并逐一注册。
     * 在模块加载时自动调用（文件末尾的 NativeChartRenderer.init()）。
     *
     * @static
     */
    static init() {
        const strategies = getAllStrategies();
        strategies.forEach((strategy) => this.register(strategy));
    }

    /**
     * 设置日志级别
     *
     * @static
     * @param {string} level - 日志级别（如 "info"、"warn"、"error"）
     */
    static setLogLevel(level) {
        errorHandler.configure({ level });
    }

    /**
     * 使用指定的像素比渲染图表（用于高清导出）
     *
     * 与 render() 不同，此方法直接接收 pixelRatio 参数，
     * 而不是通过 Canvas 尺寸计算，确保在高分辨率 Canvas 上正确渲染。
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {import("../../model/chart/ChartModel.js").ChartModel} chart - 图表模型
     * @param {Object} data - 图表数据对象
     * @param {Object} plotArea - 绘制区域坐标（已按 pixelRatio 放大）
     * @param {Object} style - 样式配置
     * @param {number} pixelRatio - 像素比（如 2、3、4）
     */
    static renderWithPixelRatio(ctx, chart, data, plotArea, style, pixelRatio) {
        ctx.save();

        let yScale = null;
        const strategy = this.get(chart.type);

        // 在渲染期间临时设置策略的像素比
        if (strategy) {
            strategy.setPixelRatio(pixelRatio);
        }

        try {
            // 非 axisFree 类型（如柱状图、折线图）需要网格和坐标轴
            if (strategy && !strategy.isAxisFree()) {
                if (style.showGrid !== false) {
                    this.renderGridWithPixelRatio(ctx, plotArea, pixelRatio);
                }

                yScale = this.buildYScale(data, chart.type);
                this.renderAxes(ctx, data, plotArea, yScale, style, pixelRatio);
            }

            // 委托策略绘制数据图形
            if (strategy) {
                strategy.render(ctx, data, plotArea, style, yScale);
            } else {
                errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `No strategy found for chart type: ${chart.type}`);
            }

            // 标题和图例
            if (style.title) {
                this.renderTitle(ctx, style.title, plotArea, pixelRatio);
            }

            if (style.showLegend !== false) {
                this.renderLegend(ctx, data, plotArea, style, pixelRatio);
            }
        } finally {
            // 确保策略的像素比被清除，避免影响后续渲染
            if (strategy) {
                strategy.clearPixelRatio();
            }
        }

        ctx.restore();
    }

    /**
     * 渲染图表（自动推算像素比）
     *
     * 从 Canvas 物理宽度与逻辑宽度之比推算 pixelRatio，
     * 适用于常规的 Canvas 渲染场景。
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {import("../../model/chart/ChartModel.js").ChartModel} chart - 图表模型
     * @param {Object} data - 图表数据对象
     * @param {Object} plotArea - 绘制区域坐标（逻辑像素）
     * @param {Object} style - 样式配置
     */
    static render(ctx, chart, data, plotArea, style) {
        ctx.save();

        // 从 Canvas 物理尺寸推算像素比
        const pixelRatio = ctx.canvas.width / (plotArea.x + plotArea.w + 56);

        let yScale = null;
        const strategy = this.get(chart.type);

        // 非 axisFree 类型需要网格和坐标轴
        if (strategy && !strategy.isAxisFree()) {
            if (style.showGrid !== false) {
                this.renderGrid(ctx, plotArea);
            }

            yScale = this.buildYScale(data, chart.type);
            this.renderAxes(ctx, data, plotArea, yScale, style, pixelRatio);
        }

        // 委托策略绘制数据图形
        if (strategy) {
            strategy.render(ctx, data, plotArea, style, yScale);
        } else {
            errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `No strategy found for chart type: ${chart.type}`);
        }

        // 标题和图例
        if (style.title) {
            this.renderTitle(ctx, style.title, plotArea, pixelRatio);
        }

        if (style.showLegend !== false) {
            this.renderLegend(ctx, data, plotArea, style, pixelRatio);
        }

        ctx.restore();
    }

    /**
     * 数据点命中测试
     *
     * 检测像素坐标是否命中某个数据点，委托给对应策略的 hitTest 方法。
     * 返回命中的数据点信息（类别、系列、值等），用于工具提示显示。
     *
     * @static
     * @param {number} px - 像素 X 坐标
     * @param {number} py - 像素 Y 坐标
     * @param {string} chartType - 图表类型标识
     * @param {Object} data - 图表数据
     * @param {Object} plotArea - 绘制区域
     * @param {Object} yScale - Y 轴刻度 { min, max, ticks }
     * @returns {Object|null} 命中信息，未命中返回 null
     */
    static hitTestDataPoint(px, py, chartType, data, plotArea, yScale) {
        const strategy = this.get(chartType);
        if (!strategy) return null;

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return null;

        return strategy.hitTest(px, py, data, plotArea, seriesCount, catCount, yScale);
    }

    /**
     * 渲染工具提示
     *
     * 在命中数据点附近绘制深色圆角矩形背景 + 白色文字的工具提示。
     * 自动处理边界碰撞，确保提示框不超出 bounds 区域。
     * 文本内容委托给策略的 formatTooltip 方法格式化。
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {Object} hoverInfo - 悬停信息 { category, seriesName, value, pointX, pointY, chartType }
     * @param {Object} bounds - 边界区域 { x, y, w, h }，提示框不得超出此区域
     * @param {Object} style - 样式配置
     */
    static renderTooltip(ctx, hoverInfo, bounds, style) {
        if (!hoverInfo || !bounds) return;

        const { category, seriesName, value, pointX, pointY } = hoverInfo;
        const padding = { x: 8, y: 6 };
        const lineHeight = 16;

        // 委托策略格式化提示文本
        const strategy = this.get(hoverInfo.chartType);
        const lines = strategy ? strategy.formatTooltip(hoverInfo) : [String(category)];

        ctx.save();
        ctx.font = `${CONFIG.CHART_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;

        // 计算提示框尺寸
        let maxW = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxW) maxW = w;
        }

        const boxW = maxW + padding.x * 2;
        const boxH = lines.length * lineHeight + padding.y * 2;

        // 默认位置：数据点右上方
        let tipX = pointX + 12;
        let tipY = pointY - boxH - 10;

        // 边界碰撞检测：右侧溢出时移到左侧
        if (tipX + boxW > bounds.x + bounds.w) {
            tipX = pointX - boxW - 12;
        }
        // 顶部溢出时移到下方
        if (tipY < bounds.y) {
            tipY = pointY + 14;
        }

        // 最终钳位，确保不超出边界
        tipX = Math.max(bounds.x, Math.min(tipX, bounds.x + bounds.w - boxW));
        tipY = Math.max(bounds.y, Math.min(tipY, bounds.y + bounds.h - boxH));

        // 绘制深色圆角矩形背景
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, boxW, boxH, 4);
        ctx.fill();

        // 绘制白色文本
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], tipX + padding.x, tipY + padding.y + i * lineHeight);
        }

        ctx.restore();
    }

    /**
     * 渲染网格线（自动推算像素比）
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {Object} area - 绘制区域 { x, y, w, h }
     */
    static renderGrid(ctx, area) {
        const pixelRatio = ctx.canvas.width / (area.x + area.w + 56);

        this.renderGridWithPixelRatio(ctx, area, pixelRatio);
    }

    /**
     * 使用指定像素比渲染网格线
     *
     * 绘制水平网格线（5 条），线宽按像素比缩放以确保高清显示清晰。
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 渲染上下文
     * @param {Object} area - 绘制区域 { x, y, w, h }
     * @param {number} pixelRatio - 像素比
     */
    static renderGridWithPixelRatio(ctx, area, pixelRatio) {
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
     * 渲染坐标轴（X 轴类别标签 + Y 轴刻度标签 + 轴线 + 轴标题）
     *
     * 绘制内容：
     * 1. L 形轴线（左侧 + 底部）
     * 2. X 轴类别标签（居中对齐，位于底部轴线下方）
     * 3. Y 轴刻度标签（右对齐，位于左侧轴线左方）
     * 4. X 轴标题（可选，位于类别标签下方）
     * 5. Y 轴标题（可选，位于绘图区域左上方）
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {Object} data - 图表数据（data.data 第一列为类别）
     * @param {Object} area - 绘制区域 { x, y, w, h }
     * @param {Object} yScale - Y 轴刻度 { min, max, ticks }
     * @param {Object} style - 样式配置（含 xAxisLabel、yAxisLabel）
     * @param {number} [pixelRatio=1] - 像素比
     */
    static renderAxes(ctx, data, area, yScale, style, pixelRatio = 1) {
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_AXIS_COLOR;
        ctx.lineWidth = CONFIG.CHART_AXIS_LINE_WIDTH * pixelRatio;

        // L 形轴线
        ctx.beginPath();
        ctx.moveTo(area.x, area.y);
        ctx.lineTo(area.x, area.y + area.h);
        ctx.lineTo(area.x + area.w, area.y + area.h);
        ctx.stroke();

        // X 轴类别标签
        const categories = data.data.map((row) => String(row[0]));
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const step = area.w / categories.length;
        for (let i = 0; i < categories.length; i++) {
            ctx.fillText(String(categories[i]), area.x + step * i + step / 2, area.y + area.h + 6 * pixelRatio);
        }

        // Y 轴刻度标签
        const yTicks = yScale.ticks;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        for (const val of yTicks) {
            const y = area.y + area.h - ((val - yScale.min) / (yScale.max - yScale.min)) * area.h;
            ctx.fillText(this.formatNumber(val), area.x - 6 * pixelRatio, y);
        }

        // X 轴标题（可选）
        if (style?.xAxisLabel) {
            ctx.textAlign = "end";
            ctx.textBaseline = "top";
            ctx.fillText(style.xAxisLabel, area.x + area.w, area.y + area.h + 22 * pixelRatio);
        }

        // Y 轴标题（可选）
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
     * 渲染图表标题
     *
     * 居中显示在绘图区域上方，使用粗体字。
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {string} title - 标题文本
     * @param {Object} area - 绘制区域 { x, y, w, h }
     * @param {number} [pixelRatio=1] - 像素比
     */
    static renderTitle(ctx, title, area, pixelRatio = 1) {
        ctx.save();
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `bold ${CONFIG.CHART_TITLE_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(title, area.x + area.w / 2, 10 * pixelRatio);
        ctx.restore();
    }

    /**
     * 渲染图例
     *
     * 居中显示在绘图区域下方，每个系列一个色块 + 名称。
     * 系列名称取自 data.headers 的第二项起（第一列为类别列）。
     *
     * @static
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {Object} data - 图表数据
     * @param {Object} area - 绘制区域 { x, y, w, h }
     * @param {Object} style - 样式配置（含 colors 数组）
     * @param {number} [pixelRatio=1] - 像素比
     */
    static renderLegend(ctx, data, area, style, pixelRatio = 1) {
        const seriesNames = data.headers.slice(1);
        ctx.save();
        ctx.font = `${CONFIG.CHART_LEGEND_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;

        const itemWidth = CONFIG.CHART_LEGEND_ITEM_WIDTH * pixelRatio;
        const totalWidth = seriesNames.length * itemWidth;
        let startX = area.x + (area.w - totalWidth) / 2;
        const y = area.y + area.h + CONFIG.CHART_LEGEND_OFFSET_Y * pixelRatio;

        for (let i = 0; i < seriesNames.length; i++) {
            // 色块
            ctx.fillStyle = style.colors[i % style.colors.length];
            ctx.fillRect(startX, y - 5 * pixelRatio, CONFIG.CHART_LEGEND_ITEM_SIZE * pixelRatio, CONFIG.CHART_LEGEND_ITEM_SIZE * pixelRatio);

            // 系列名称
            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(String(seriesNames[i]), startX + 16 * pixelRatio, y + 1);

            startX += itemWidth;
        }

        ctx.restore();
    }

    /**
     * 获取数据中所有数值列的最小值
     *
     * 遍历 data.data 的第 1 列起（第 0 列为类别），
     * 忽略非数值单元格。
     *
     * @static
     * @param {Object} data - 图表数据
     * @returns {number} 最小值，无有效数据时返回 0
     */
    static getYMin(data) {
        let min = Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v < min) min = v;
            }
        }
        return min === Infinity ? 0 : min;
    }

    /**
     * 获取数据中所有数值列的最大值
     *
     * @static
     * @param {Object} data - 图表数据
     * @returns {number} 最大值，无有效数据时返回 1
     */
    static getYMax(data) {
        let max = -Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v > max) max = v;
            }
        }
        return max === -Infinity ? 1 : max;
    }

    /**
     * 构建 Y 轴刻度
     *
     * 根据数据范围和图表类型计算 Y 轴的 min、max 和刻度值。
     * 柱状图和非负数据的 Y 轴最小值固定为 0，
     * 其他类型（如折线图）允许负值作为最小值。
     *
     * @static
     * @param {Object} data - 图表数据
     * @param {string} chartType - 图表类型标识
     * @returns {{ min: number, max: number, ticks: number[] }} Y 轴刻度信息
     */
    static buildYScale(data, chartType) {
        const dataMin = this.getYMin(data);

        let minValue;
        if (dataMin >= 0) {
            // 非负数据：Y 轴从 0 开始
            minValue = 0;
        } else if (chartType === "bar") {
            // 柱状图：即使有负值也从 0 开始
            minValue = 0;
        } else {
            // 其他类型：允许负值
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
     * 计算美观的 Y 轴刻度值
     *
     * 使用 "1-2-5" 规范化算法，确保刻度值为整数倍（1×、2×、5× 乘以 10 的幂次），
     * 使得刻度标签简洁易读。
     *
     * 算法步骤：
     * 1. 计算原始步长 rawStep = range / count
     * 2. 规范化：normStep = rawStep / 10^⌊log10(rawStep)⌋
     * 3. 映射到 1-2-5 序列：1.5→1, 3→2, 7→5, else→10
     * 4. 从 ⌊yMin/step⌋×step 到 ⌈yMax/step⌉×step 生成刻度序列
     *
     * @static
     * @param {Object} data - 图表数据
     * @param {number} count - 期望的刻度数量
     * @param {number} [minValue] - Y 轴最小值（可选，默认使用数据最小值）
     * @returns {number[]} 刻度值数组
     */
    static calcYTicks(data, count, minValue) {
        const yMin = minValue !== undefined ? minValue : this.getYMin(data);
        const yMax = this.getYMax(data);
        const range = yMax - yMin || 1;
        const rawStep = range / count;

        // 计算步长的数量级
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normStep = rawStep / mag;

        // 1-2-5 规范化
        let step;
        if (normStep <= 1.5) step = mag;
        else if (normStep <= 3) step = 2 * mag;
        else if (normStep <= 7) step = 5 * mag;
        else step = 10 * mag;

        // 生成刻度序列
        const start = Math.floor(yMin / step) * step;
        const end = Math.ceil(yMax / step) * step;
        const ticks = [];
        for (let v = start; v <= end + step * 0.01; v += step) {
            // 四舍五入消除浮点误差
            ticks.push(Math.round(v * 1e10) / 1e10);
        }

        return ticks;
    }

    /**
     * 格式化数值标签
     *
     * 大数使用缩写：≥1M 显示为 "x.xM"，≥1K 显示为 "x.xK"，
     * 其他直接显示原值。
     *
     * @static
     * @param {number} val - 数值
     * @returns {string} 格式化后的字符串
     */
    static formatNumber(val) {
        if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + "M";
        if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + "K";
        return String(val);
    }

    /**
     * 计算点到线段的最短距离
     *
     * 使用向量投影算法：
     * 1. 将点投影到线段所在的直线上
     * 2. 如果投影参数 param < 0，最近点为线段起点
     * 3. 如果投影参数 param > 1，最近点为线段终点
     * 4. 否则最近点为投影点
     * 5. 计算点到最近点的欧几里得距离
     *
     * 用于折线图的命中测试（检测鼠标是否靠近某条线段）。
     *
     * @static
     * @param {number} px - 点 X 坐标
     * @param {number} py - 点 Y 坐标
     * @param {number} x1 - 线段起点 X
     * @param {number} y1 - 线段起点 Y
     * @param {number} x2 - 线段终点 X
     * @param {number} y2 - 线段终点 Y
     * @returns {number} 点到线段的最短距离
     */
    static pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        // 点向量在线段方向上的投影参数
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        // 计算线段上最近点的坐标
        let xx, yy;

        if (param < 0) {
            // 投影在线段起点之前，最近点为起点
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            // 投影在线段终点之后，最近点为终点
            xx = x2;
            yy = y2;
        } else {
            // 投影在线段上，最近点为投影点
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }
}

// 模块加载时自动注册所有内置图表策略
NativeChartRenderer.init();
