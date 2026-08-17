/**
 * @fileoverview 图表渲染器工厂
 * @description 根据图表类型标识返回对应的渲染器类（NativeChartRenderer 或 ECharts 桥接），
 *              集中管理原生图表类型和 ECharts 图表类型的映射关系。
 * @module render/chart/ChartRendererFactory
 */

import { IChartRenderer } from "./IChartRenderer";
import { NativeChartRenderer } from "./NativeChartRenderer";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";

/**
 * 图表渲染器工厂
 *
 * 根据图表类型标识分发对应的渲染器类。
 * 原生图表类型（bar、line、pie 等）返回 NativeChartRenderer；
 * ECharts 图表类型（treemap、sunburst）返回 ECharts 桥接渲染器。
 * 使用静态方法，无需实例化。
 *
 * @class ChartRendererFactory
 */
export class ChartRendererFactory {
    /**
     * @static 静态公共字段 - 原生 Canvas 图表类型列表
     *
     * 这些类型由 NativeChartRenderer + 策略模式渲染，
     * 不依赖 ECharts 库。
     */
    static NATIVE_TYPES: string[] = ["bar", "line", "pie", "area", "scatter", "candlestick", "gauge", "funnel", "radar", "heatmap"];

    /**
     * @static 静态公共字段 - ECharts 图表类型列表
     *
     * 这些类型需要 ECharts 库支持，通过桥接渲染器渲染。
     * 当前桥接渲染器尚未实现。
     */
    static ECHARTS_TYPES: string[] = ["treemap", "sunburst"];

    /**
     * @static @private 静态私有字段 - ECharts 桥接渲染器实例
     *
     * 延迟加载的 ECharts 桥接渲染器引用，当前尚未实现。
     */
    static #echartsBridge: unknown = null;

    /**
     * @static 静态公共方法 - 获取图表类型对应的渲染器类
     *
     * 根据图表类型标识返回渲染器构造函数：
     * - 原生类型 → NativeChartRenderer
     * - ECharts 类型 → ECharts 桥接渲染器（尚未实现，返回 null）
     * - 未知类型 → null 并记录警告日志
     *
     * @param chartType - 图表类型标识，如 "bar"、"treemap"
     * @returns 渲染器构造函数，未匹配返回 null
     */
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

        if (NativeChartRenderer.get(chartType)) {
            errorHandler.debug(ERROR_CODE.CHART_STRATEGY_DEBUG, `[ChartRendererFactory] Matched custom registered strategy for type: ${chartType}`, {
                chartType,
                rendererType: "NativeChartRenderer",
            });
            return NativeChartRenderer;
        }

        errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `[ChartRendererFactory] Unsupported chart type: ${chartType}`, {
            chartType,
            nativeTypes: this.NATIVE_TYPES,
            echartsTypes: this.ECHARTS_TYPES,
        });
        return null;
    }

    /**
     * @static 静态公共方法 - 判断是否为原生图表类型
     *
     * @param type - 图表类型标识
     * @returns 是否为原生 Canvas 渲染类型
     */
    static isNativeType(type: string): boolean {
        return this.NATIVE_TYPES.includes(type);
    }

    /**
     * @static 静态公共方法 - 判断是否为 ECharts 图表类型
     *
     * @param type - 图表类型标识
     * @returns 是否为 ECharts 渲染类型
     */
    static isEChartsType(type: string): boolean {
        return this.ECHARTS_TYPES.includes(type);
    }

    /**
     * @static 静态公共方法 - 重置工厂状态
     *
     * 清除 ECharts 桥接渲染器缓存，通常在测试或热重载时使用。
     */
    static reset(): void {
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[ChartRendererFactory] Factory reset - clearing ECharts bridge cache`);
        this.#echartsBridge = null;
    }
}