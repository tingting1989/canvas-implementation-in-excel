import { describe, it, expect, vi, beforeEach } from "vitest";
import { BarStrategy } from "@/render/chart/strategies/BarStrategy";
import { LineStrategy } from "@/render/chart/strategies/LineStrategy";
import { PieStrategy } from "@/render/chart/strategies/PieStrategy";
import { AreaStrategy } from "@/render/chart/strategies/AreaStrategy";
import { ScatterStrategy } from "@/render/chart/strategies/ScatterStrategy";
import { CandlestickStrategy } from "@/render/chart/strategies/CandlestickStrategy";
import { GaugeStrategy } from "@/render/chart/strategies/GaugeStrategy";
import { FunnelStrategy } from "@/render/chart/strategies/FunnelStrategy";
import { RadarStrategy } from "@/render/chart/strategies/RadarStrategy";
import { HeatmapStrategy } from "@/render/chart/strategies/HeatmapStrategy";
import { BaseChartStrategy, HIT_RADIUS } from "@/render/chart/BaseChartStrategy";
import { getAllStrategies } from "@/render/chart/strategies/index";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "@/render/chart/types";

function createMockCtx(): CanvasRenderingContext2D {
    return {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn(() => ({ width: 50 })),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        arcTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        clip: vi.fn(),
        setLineDash: vi.fn(),
        rect: vi.fn(),
        roundRect: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        transform: vi.fn(),
        setTransform: vi.fn(),
        resetTransform: vi.fn(),
        createLinearGradient: vi.fn(() => ({
            addColorStop: vi.fn(),
        })),
        createRadialGradient: vi.fn(() => ({
            addColorStop: vi.fn(),
        })),
        fillStyle: "#000",
        strokeStyle: "#000",
        lineWidth: 1,
        font: "12px sans-serif",
        textAlign: "left" as CanvasTextAlign,
        textBaseline: "alphabetic" as CanvasTextBaseline,
        globalAlpha: 1,
        lineCap: "butt" as CanvasLineCap,
        canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
    } as unknown as CanvasRenderingContext2D;
}

const defaultArea: PlotArea = { x: 50, y: 50, w: 300, h: 200 };
const defaultYScale: YScale = { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };
const defaultStyle: ChartStyle = {
    colors: ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de"],
    showLegend: true,
    showGrid: true,
    showTooltip: true,
};

const sampleData: ChartData = {
    headers: ["Category", "Series1", "Series2"],
    data: [
        ["A", 10, 20],
        ["B", 30, 40],
        ["C", 50, 60],
    ],
};

describe("BaseChartStrategy", () => {
    it("should have HIT_RADIUS exported", () => {
        expect(HIT_RADIUS).toBe(12);
    });

    it("constructor sets type and name", () => {
        const strategy = new BaseChartStrategy("test", "测试");
        expect(strategy.type).toBe("test");
        expect(strategy.name).toBe("测试");
    });

    it("isAxisFree returns false by default", () => {
        const strategy = new BaseChartStrategy("test", "测试");
        expect(strategy.isAxisFree()).toBe(false);
    });

    it("hitTest returns null by default", () => {
        const strategy = new BaseChartStrategy("test", "测试");
        const result = strategy.hitTest(100, 100, sampleData, defaultArea, 2, 3, defaultYScale);
        expect(result).toBeNull();
    });

    it("formatTooltip returns formatted lines", () => {
        const strategy = new BaseChartStrategy("test", "测试");
        const info: HitInfo = { category: "A", seriesName: "S1", value: 42, pointX: 0, pointY: 0 };
        const lines = strategy.formatTooltip(info);
        expect(lines[0]).toBe("A");
        expect(lines).toContain("S1: 42");
    });

    it("formatTooltip handles non-integer values", () => {
        const strategy = new BaseChartStrategy("test", "测试");
        const info: HitInfo = { category: "A", seriesName: "S1", value: 3.14159, pointX: 0, pointY: 0 };
        const lines = strategy.formatTooltip(info);
        expect(lines).toContain("S1: 3.14");
    });

    it("pointToSegmentDistance calculates correctly", () => {
        const strategy = new BaseChartStrategy("test", "测试");
        const dist = (strategy as any).pointToSegmentDistance(5, 5, 0, 0, 10, 0);
        expect(dist).toBeCloseTo(5, 1);
    });
});

describe("BarStrategy", () => {
    let strategy: BarStrategy;

    beforeEach(() => {
        strategy = new BarStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("bar");
        expect(strategy.name).toBe("柱状图");
    });

    it("isAxisFree returns false", () => {
        expect(strategy.isAxisFree()).toBe(false);
    });

    it("render calls fillRect and strokeRect", () => {
        const ctx = createMockCtx();
        strategy.render(ctx, sampleData, defaultArea, defaultStyle, defaultYScale);
        expect(ctx.fillRect).toHaveBeenCalled();
        expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it("hitTest returns null when point is outside", () => {
        const result = strategy.hitTest(0, 0, sampleData, defaultArea, 2, 3, defaultYScale);
        expect(result).toBeNull();
    });

    it("hitTest returns hit info when point is inside a bar", () => {
        const ctx = createMockCtx();
        strategy.render(ctx, sampleData, defaultArea, defaultStyle, defaultYScale);

        const groupWidth = defaultArea.w / 3;
        const barWidth = (groupWidth * 0.7) / 2;
        const barGap = (groupWidth * 0.3) / 3;
        const barH = (50 / 100) * defaultArea.h;
        const bx = defaultArea.x + 2 * groupWidth + barGap;
        const by = defaultArea.y + defaultArea.h - barH;
        const px = bx + barWidth / 2;
        const py = by + barH / 2;

        const result = strategy.hitTest(px, py, sampleData, defaultArea, 2, 3, defaultYScale);
        expect(result).not.toBeNull();
        expect(result!.category).toBe("C");
    });
});

describe("LineStrategy", () => {
    let strategy: LineStrategy;

    beforeEach(() => {
        strategy = new LineStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("line");
        expect(strategy.name).toBe("折线图");
    });

    it("render calls stroke for line drawing", () => {
        const ctx = createMockCtx();
        strategy.render(ctx, sampleData, defaultArea, defaultStyle, defaultYScale);
        expect(ctx.stroke).toHaveBeenCalled();
    });

    it("render with smooth style calls bezierCurveTo", () => {
        const ctx = createMockCtx();
        const smoothStyle = { ...defaultStyle, smooth: true };
        strategy.render(ctx, sampleData, defaultArea, smoothStyle, defaultYScale);
        expect(ctx.bezierCurveTo).toHaveBeenCalled();
    });
});

describe("PieStrategy", () => {
    let strategy: PieStrategy;

    beforeEach(() => {
        strategy = new PieStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("pie");
        expect(strategy.name).toBe("饼图");
    });

    it("isAxisFree returns true", () => {
        expect(strategy.isAxisFree()).toBe(true);
    });

    it("render calls arc for pie slices", () => {
        const ctx = createMockCtx();
        strategy.render(ctx, sampleData, defaultArea, defaultStyle);
        expect(ctx.arc).toHaveBeenCalled();
    });
});

describe("AreaStrategy", () => {
    let strategy: AreaStrategy;

    beforeEach(() => {
        strategy = new AreaStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("area");
        expect(strategy.name).toBe("面积图");
    });

    it("render calls fill for area fill", () => {
        const ctx = createMockCtx();
        strategy.render(ctx, sampleData, defaultArea, defaultStyle, defaultYScale);
        expect(ctx.fill).toHaveBeenCalled();
    });
});

describe("ScatterStrategy", () => {
    let strategy: ScatterStrategy;

    beforeEach(() => {
        strategy = new ScatterStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("scatter");
        expect(strategy.name).toBe("散点图");
    });

    it("render calls arc for scatter dots", () => {
        const ctx = createMockCtx();
        strategy.render(ctx, sampleData, defaultArea, defaultStyle, defaultYScale);
        expect(ctx.arc).toHaveBeenCalled();
    });
});

describe("CandlestickStrategy", () => {
    let strategy: CandlestickStrategy;

    beforeEach(() => {
        strategy = new CandlestickStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("candlestick");
        expect(strategy.name).toBe("K线图");
    });

    it("render handles OHLC data", () => {
        const ctx = createMockCtx();
        const ohlcData: ChartData = {
            headers: ["Date", "Open", "High", "Low", "Close"],
            data: [
                [100, 120, 90, 110],
                [110, 130, 100, 125],
            ],
        };
        strategy.render(ctx, ohlcData, defaultArea, defaultStyle, defaultYScale);
        expect(ctx.fillRect).toHaveBeenCalled();
    });

    it("formatDetail returns formatted OHLC info", () => {
        const detail = {
            type: "K线",
            open: 100,
            high: 120,
            low: 90,
            close: 110,
            change: "10.00",
            changePercent: "10.00%",
            direction: "上涨 📈",
        };
        const lines = strategy.formatDetail(detail);
        expect(lines.length).toBeGreaterThan(0);
    });
});

describe("GaugeStrategy", () => {
    let strategy: GaugeStrategy;

    beforeEach(() => {
        strategy = new GaugeStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("gauge");
        expect(strategy.name).toBe("仪表盘");
    });

    it("isAxisFree returns true", () => {
        expect(strategy.isAxisFree()).toBe(true);
    });

    it("render draws gauge arc", () => {
        const ctx = createMockCtx();
        const gaugeData: ChartData = {
            headers: ["Metric", "Value"],
            data: [["Speed", 75]],
        };
        strategy.render(ctx, gaugeData, defaultArea, defaultStyle);
        expect(ctx.arc).toHaveBeenCalled();
    });
});

describe("FunnelStrategy", () => {
    let strategy: FunnelStrategy;

    beforeEach(() => {
        strategy = new FunnelStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("funnel");
        expect(strategy.name).toBe("漏斗图");
    });

    it("isAxisFree returns true", () => {
        expect(strategy.isAxisFree()).toBe(true);
    });

    it("render draws funnel shape", () => {
        const ctx = createMockCtx();
        const funnelData: ChartData = {
            headers: ["Stage", "Count"],
            data: [
                ["Visit", 1000],
                ["Signup", 500],
                ["Purchase", 200],
            ],
        };
        strategy.render(ctx, funnelData, defaultArea, defaultStyle);
        expect(ctx.fill).toHaveBeenCalled();
    });
});

describe("RadarStrategy", () => {
    let strategy: RadarStrategy;

    beforeEach(() => {
        strategy = new RadarStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("radar");
        expect(strategy.name).toBe("雷达图");
    });

    it("isAxisFree returns true", () => {
        expect(strategy.isAxisFree()).toBe(true);
    });

    it("render draws radar web", () => {
        const ctx = createMockCtx();
        const radarData: ChartData = {
            headers: ["Dim", "S1", "S2"],
            data: [
                ["A", 80, 60],
                ["B", 70, 90],
                ["C", 90, 50],
                ["D", 60, 80],
            ],
        };
        strategy.render(ctx, radarData, defaultArea, defaultStyle);
        expect(ctx.stroke).toHaveBeenCalled();
    });
});

describe("HeatmapStrategy", () => {
    let strategy: HeatmapStrategy;

    beforeEach(() => {
        strategy = new HeatmapStrategy();
    });

    it("has correct type and name", () => {
        expect(strategy.type).toBe("heatmap");
        expect(strategy.name).toBe("热力图");
    });

    it("render draws heatmap cells", () => {
        const ctx = createMockCtx();
        const heatmapData: ChartData = {
            headers: ["Row", "C1", "C2", "C3"],
            data: [
                ["R1", 10, 20, 30],
                ["R2", 40, 50, 60],
            ],
        };
        strategy.render(ctx, heatmapData, defaultArea, defaultStyle);
        expect(ctx.fillRect).toHaveBeenCalled();
    });

    it("hitTest returns null for insufficient data", () => {
        const singleRowData: ChartData = {
            headers: ["Row", "C1"],
            data: [["R1", 10]],
        };
        const result = strategy.hitTest(100, 100, singleRowData, defaultArea, 1, 1);
        expect(result).toBeNull();
    });
});

describe("Strategy Registry", () => {
    it("getAllStrategies returns all 10 strategies", () => {
        const strategies = getAllStrategies();
        expect(strategies.length).toBe(10);
    });

    it("all strategies have unique types", () => {
        const strategies = getAllStrategies();
        const types = strategies.map((s) => s.type);
        const uniqueTypes = new Set(types);
        expect(uniqueTypes.size).toBe(types.length);
    });

    it("all strategies are BaseChartStrategy instances", () => {
        const strategies = getAllStrategies();
        for (const strategy of strategies) {
            expect(strategy).toBeInstanceOf(BaseChartStrategy);
        }
    });

    it("contains expected chart types", () => {
        const strategies = getAllStrategies();
        const types = strategies.map((s) => s.type);
        expect(types).toContain("bar");
        expect(types).toContain("line");
        expect(types).toContain("pie");
        expect(types).toContain("area");
        expect(types).toContain("scatter");
        expect(types).toContain("candlestick");
        expect(types).toContain("gauge");
        expect(types).toContain("funnel");
        expect(types).toContain("radar");
        expect(types).toContain("heatmap");
    });
});