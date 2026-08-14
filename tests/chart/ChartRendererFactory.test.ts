import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChartRendererFactory } from "@/render/chart/ChartRendererFactory";
import { NativeChartRenderer } from "@/render/chart/NativeChartRenderer";

describe("ChartRendererFactory", () => {
    afterEach(() => {
        ChartRendererFactory.reset();
    });

    it("NATIVE_TYPES contains expected types", () => {
        expect(ChartRendererFactory.NATIVE_TYPES).toContain("bar");
        expect(ChartRendererFactory.NATIVE_TYPES).toContain("line");
        expect(ChartRendererFactory.NATIVE_TYPES).toContain("pie");
        expect(ChartRendererFactory.NATIVE_TYPES).toContain("heatmap");
    });

    it("ECHARTS_TYPES contains expected types", () => {
        expect(ChartRendererFactory.ECHARTS_TYPES).toContain("treemap");
        expect(ChartRendererFactory.ECHARTS_TYPES).toContain("sunburst");
    });

    it("getRenderer returns NativeChartRenderer for native types", () => {
        const renderer = ChartRendererFactory.getRenderer("bar");
        expect(renderer).toBe(NativeChartRenderer);
    });

    it("getRenderer returns null for ECharts types (not yet implemented)", () => {
        const renderer = ChartRendererFactory.getRenderer("treemap");
        expect(renderer).toBeNull();
    });

    it("getRenderer returns null for unknown types", () => {
        const renderer = ChartRendererFactory.getRenderer("unknown");
        expect(renderer).toBeNull();
    });

    it("isNativeType returns true for native types", () => {
        expect(ChartRendererFactory.isNativeType("bar")).toBe(true);
        expect(ChartRendererFactory.isNativeType("line")).toBe(true);
    });

    it("isNativeType returns false for non-native types", () => {
        expect(ChartRendererFactory.isNativeType("treemap")).toBe(false);
        expect(ChartRendererFactory.isNativeType("unknown")).toBe(false);
    });

    it("isEChartsType returns true for ECharts types", () => {
        expect(ChartRendererFactory.isEChartsType("treemap")).toBe(true);
        expect(ChartRendererFactory.isEChartsType("sunburst")).toBe(true);
    });

    it("isEChartsType returns false for non-ECharts types", () => {
        expect(ChartRendererFactory.isEChartsType("bar")).toBe(false);
        expect(ChartRendererFactory.isEChartsType("unknown")).toBe(false);
    });

    it("reset clears ECharts bridge", () => {
        ChartRendererFactory.reset();
        expect(ChartRendererFactory.getRenderer("treemap")).toBeNull();
    });
});