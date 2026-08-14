import { describe, it, expect, vi, beforeEach } from "vitest";
import { NativeChartRenderer } from "@/render/chart/NativeChartRenderer";
import { BaseChartStrategy } from "@/render/chart/BaseChartStrategy";
import type { ChartData, PlotArea, ChartStyle, YScale } from "@/render/chart/types";

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
        clip: vi.fn(),
        setLineDash: vi.fn(),
        roundRect: vi.fn(),
        fillStyle: "#000",
        strokeStyle: "#000",
        lineWidth: 1,
        font: "12px sans-serif",
        textAlign: "left" as CanvasTextAlign,
        textBaseline: "alphabetic" as CanvasTextBaseline,
        globalAlpha: 1,
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
    headers: ["Category", "Series1"],
    data: [
        ["A", 10],
        ["B", 30],
        ["C", 50],
    ],
};

describe("NativeChartRenderer", () => {
    it("get returns strategy for registered type", () => {
        const strategy = NativeChartRenderer.get("bar");
        expect(strategy).not.toBeUndefined();
        expect(strategy!.type).toBe("bar");
    });

    it("get returns undefined for unknown type", () => {
        const strategy = NativeChartRenderer.get("unknown");
        expect(strategy).toBeUndefined();
    });

    it("render delegates to the correct strategy", () => {
        const ctx = createMockCtx();
        const chart = { type: "bar" };
        NativeChartRenderer.render(ctx, chart, sampleData, defaultArea, defaultStyle);
        expect(ctx.fillRect).toHaveBeenCalled();
    });

    it("render does nothing for unknown type", () => {
        const ctx = createMockCtx();
        const chart = { type: "unknown" };
        expect(() => {
            NativeChartRenderer.render(ctx, chart, sampleData, defaultArea, defaultStyle);
        }).not.toThrow();
    });

    it("renderWithPixelRatio renders with pixel ratio support", () => {
        const ctx = createMockCtx();
        const chart = { type: "bar" };
        expect(() => {
            NativeChartRenderer.renderWithPixelRatio(ctx, chart, sampleData, defaultArea, defaultStyle, 2);
        }).not.toThrow();
    });

    it("hitTest delegates to the correct strategy", () => {
        const chart = { type: "bar" };
        const result = NativeChartRenderer.hitTest(0, 0, chart, sampleData, defaultArea, 1, 3, defaultYScale);
        expect(result).toBeNull();
    });

    it("hitTest returns null for unknown type", () => {
        const chart = { type: "unknown" };
        const result = NativeChartRenderer.hitTest(100, 100, chart, sampleData, defaultArea, 1, 3, defaultYScale);
        expect(result).toBeNull();
    });

    it("register adds custom strategy", () => {
        class CustomStrategy extends BaseChartStrategy {
            constructor() {
                super("custom", "自定义");
            }
        }
        NativeChartRenderer.register(new CustomStrategy());
        const strategy = NativeChartRenderer.get("custom");
        expect(strategy).not.toBeUndefined();
        expect(strategy!.type).toBe("custom");
    });

    it("all standard types are registered", () => {
        const types = ["bar", "line", "pie", "area", "scatter", "candlestick", "gauge", "funnel", "radar", "heatmap"];
        for (const type of types) {
            const strategy = NativeChartRenderer.get(type);
            expect(strategy).not.toBeUndefined();
            expect(strategy!.type).toBe(type);
        }
    });

    it("getTypes returns all registered type keys", () => {
        const types = NativeChartRenderer.getTypes();
        expect(types).toContain("bar");
        expect(types).toContain("line");
        expect(types).toContain("pie");
    });

    it("getNames returns all strategy display names", () => {
        const names = NativeChartRenderer.getNames();
        expect(names.length).toBeGreaterThan(0);
    });

    it("getYMin returns minimum value from data", () => {
        expect(NativeChartRenderer.getYMin(sampleData)).toBe(10);
    });

    it("getYMax returns maximum value from data", () => {
        expect(NativeChartRenderer.getYMax(sampleData)).toBe(50);
    });

    it("buildYScale returns valid scale", () => {
        const scale = NativeChartRenderer.buildYScale(sampleData, "line");
        expect(scale.min).toBeLessThanOrEqual(10);
        expect(scale.max).toBeGreaterThanOrEqual(50);
        expect(scale.ticks.length).toBeGreaterThan(0);
    });

    it("calcYTicks returns evenly spaced ticks", () => {
        const ticks = NativeChartRenderer.calcYTicks(sampleData, 5);
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks[0]).toBeLessThanOrEqual(10);
        expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(50);
    });

    it("formatNumber formats large numbers with K/M suffixes", () => {
        expect(NativeChartRenderer.formatNumber(1500)).toBe("1.5K");
        expect(NativeChartRenderer.formatNumber(2500000)).toBe("2.5M");
        expect(NativeChartRenderer.formatNumber(42)).toBe("42");
    });

    it("pointToSegmentDistance computes correct distance", () => {
        const dist = NativeChartRenderer.pointToSegmentDistance(5, 5, 0, 0, 10, 0);
        expect(dist).toBeCloseTo(5, 1);
    });

    it("renderGrid draws grid lines", () => {
        const ctx = createMockCtx();
        NativeChartRenderer.renderGrid(ctx, defaultArea);
        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.moveTo).toHaveBeenCalled();
        expect(ctx.lineTo).toHaveBeenCalled();
        expect(ctx.stroke).toHaveBeenCalled();
    });

    it("renderGridWithPixelRatio draws grid lines with pixel ratio", () => {
        const ctx = createMockCtx();
        NativeChartRenderer.renderGridWithPixelRatio(ctx, defaultArea, 2);
        expect(ctx.beginPath).toHaveBeenCalled();
    });

    it("renderAxes draws axis lines and labels", () => {
        const ctx = createMockCtx();
        NativeChartRenderer.renderAxes(ctx, sampleData, defaultArea, defaultYScale, defaultStyle, 1);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalled();
    });

    it("renderTitle draws title text", () => {
        const ctx = createMockCtx();
        NativeChartRenderer.renderTitle(ctx, "Test Title", defaultArea, 1);
        expect(ctx.fillText).toHaveBeenCalledWith("Test Title", expect.any(Number), expect.any(Number));
    });

    it("renderLegend draws legend items", () => {
        const ctx = createMockCtx();
        NativeChartRenderer.renderLegend(ctx, sampleData, defaultArea, defaultStyle, 1);
        expect(ctx.fillRect).toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalled();
    });
});