import { IChartRenderer } from "./IChartRenderer.js";
import { NativeChartRenderer } from "./NativeChartRenderer.js";

export class ChartRendererFactory {
    static NATIVE_TYPES = ["bar", "line", "pie", "area", "scatter"];
    static ECHARTS_TYPES = ["radar", "candlestick", "funnel", "gauge", "treemap", "sunburst", "heatmap"];

    static #echartsBridge = null;

    static getRenderer(chartType) {
        if (this.NATIVE_TYPES.includes(chartType)) {
            return NativeChartRenderer;
        } else if (this.ECHARTS_TYPES.includes(chartType)) {
            if (!this.#echartsBridge) {
                console.warn("[ChartRendererFactory] ECharts bridge not yet implemented. Type:", chartType);
                return null;
            }
            return this.#echartsBridge;
        }
        console.warn("[ChartRendererFactory] Unsupported chart type:", chartType);
        return null;
    }

    static isNativeType(type) {
        return this.NATIVE_TYPES.includes(type);
    }

    static isEChartsType(type) {
        return this.ECHARTS_TYPES.includes(type);
    }

    static reset() {
        this.#echartsBridge = null;
    }
}