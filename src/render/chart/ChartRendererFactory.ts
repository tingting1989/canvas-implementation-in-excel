import { IChartRenderer } from "./IChartRenderer";
import { NativeChartRenderer } from "./NativeChartRenderer";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";

export class ChartRendererFactory {
    static NATIVE_TYPES: string[] = ["bar", "line", "pie", "area", "scatter", "candlestick", "gauge", "funnel", "radar", "heatmap"];
    static ECHARTS_TYPES: string[] = ["treemap", "sunburst"];
    static #echartsBridge: unknown = null;

    static getRenderer(chartType: string): typeof NativeChartRenderer | typeof IChartRenderer | null {
        if (this.NATIVE_TYPES.includes(chartType)) {
            errorHandler.debug(ERROR_CODE.CHART_STRATEGY_DEBUG, `[ChartRendererFactory] Matched native renderer for type: ${chartType}`, {
                chartType,
                rendererType: "NativeChartRenderer",
            });
            return NativeChartRenderer;
        } else if (this.ECHARTS_TYPES.includes(chartType)) {
            if (!this.#echartsBridge) {
                errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `[ChartRendererFactory] ECharts bridge not yet implemented`, {
                    chartType,
                    supportedTypes: this.ECHARTS_TYPES,
                });
                return null;
            }
            return this.#echartsBridge as typeof IChartRenderer;
        }

        errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `[ChartRendererFactory] Unsupported chart type: ${chartType}`, {
            chartType,
            nativeTypes: this.NATIVE_TYPES,
            echartsTypes: this.ECHARTS_TYPES,
        });
        return null;
    }

    static isNativeType(type: string): boolean {
        return this.NATIVE_TYPES.includes(type);
    }

    static isEChartsType(type: string): boolean {
        return this.ECHARTS_TYPES.includes(type);
    }

    static reset(): void {
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[ChartRendererFactory] Factory reset - clearing ECharts bridge cache`);
        this.#echartsBridge = null;
    }
}
