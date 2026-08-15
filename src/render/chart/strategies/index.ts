/**
 * @fileoverview 图表渲染策略注册表
 * @description 集中创建并导出所有图表渲染策略实例，
 *              供 NativeChartRenderer 按类型查找对应策略。
 * @module render/chart/strategies
 */

import { BarStrategy } from "./BarStrategy";
import { LineStrategy } from "./LineStrategy";
import { PieStrategy } from "./PieStrategy";
import { AreaStrategy } from "./AreaStrategy";
import { ScatterStrategy } from "./ScatterStrategy";
import { CandlestickStrategy } from "./CandlestickStrategy";
import { GaugeStrategy } from "./GaugeStrategy";
import { FunnelStrategy } from "./FunnelStrategy";
import { RadarStrategy } from "./RadarStrategy";
import { HeatmapStrategy } from "./HeatmapStrategy";
import type { BaseChartStrategy } from "../BaseChartStrategy";

/**
 * 所有图表渲染策略实例数组
 *
 * 按注册顺序排列，NativeChartRenderer 遍历此数组
 * 通过 strategy.type 匹配对应的渲染策略。
 */
const strategies: BaseChartStrategy[] = [
    new BarStrategy(),
    new LineStrategy(),
    new PieStrategy(),
    new AreaStrategy(),
    new ScatterStrategy(),
    new CandlestickStrategy(),
    new GaugeStrategy(),
    new FunnelStrategy(),
    new RadarStrategy(),
    new HeatmapStrategy(),
];

/**
 * 获取所有已注册的图表渲染策略实例
 *
 * @returns 策略实例数组的副本引用
 */
export function getAllStrategies(): BaseChartStrategy[] {
    return strategies;
}

export default strategies;
