import { BarStrategy } from "./BarStrategy.js";
import { LineStrategy } from "./LineStrategy.js";
import { PieStrategy } from "./PieStrategy.js";
import { AreaStrategy } from "./AreaStrategy.js";
import { ScatterStrategy } from "./ScatterStrategy.js";
import { CandlestickStrategy } from "./CandlestickStrategy.js";
import { GaugeStrategy } from "./GaugeStrategy.js";
import { FunnelStrategy } from "./FunnelStrategy.js";
import { RadarStrategy } from "./RadarStrategy.js";

const strategies = [
    new BarStrategy(),
    new LineStrategy(),
    new PieStrategy(),
    new AreaStrategy(),
    new ScatterStrategy(),
    new CandlestickStrategy(),
    new GaugeStrategy(),
    new FunnelStrategy(),
    new RadarStrategy(),
];

export function getAllStrategies() {
    return strategies;
}

export default strategies;
