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

export function getAllStrategies(): BaseChartStrategy[] {
    return strategies;
}

export default strategies;