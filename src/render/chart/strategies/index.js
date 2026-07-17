/**
 * @fileoverview 图表策略注册中心
 * @description 集中管理所有图表渲染策略的注册和导出。
 *              作为策略模式的入口点，提供统一的策略访问接口，
 *              供 NativeChartRenderer 等上层模块使用。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/index
 * @see {@link BaseChartStrategy} 基类定义
 * @see {@link BarStrategy} 柱状图策略
 * @see {@link LineStrategy} 折线图策略
 * @see {@link PieStrategy} 饼图策略
 * @see {@link AreaStrategy} 面积图策略
 * @see {@link ScatterStrategy} 散点图策略
 * @see {@link CandlestickStrategy} K线图策略
 * @see {@link GaugeStrategy} 仪表盘策略
 * @see {@link FunnelStrategy} 漏斗图策略
 * @see {@link RadarStrategy} 雷达图策略
 */

import { BarStrategy } from "./BarStrategy.js";
import { LineStrategy } from "./LineStrategy.js";
import { PieStrategy } from "./PieStrategy.js";
import { AreaStrategy } from "./AreaStrategy.js";
import { ScatterStrategy } from "./ScatterStrategy.js";
import { CandlestickStrategy } from "./CandlestickStrategy.js";
import { GaugeStrategy } from "./GaugeStrategy.js";
import { FunnelStrategy } from "./FunnelStrategy.js";
import { RadarStrategy } from "./RadarStrategy.js";

/**
 * 已注册的策略实例列表（单例模式）
 *
 * @constant {BaseChartStrategy[]}
 * @type {Array<BaseChartStrategy>}
 * @description 包含所有可用的图表渲染策略实例，按以下顺序排列：
 *
 * | 序号 | 策略类 | 类型标识符 | 中文名称 | 是否需要坐标轴 |
 * |------|--------|-----------|---------|---------------|
 * | 1    | BarStrategy | "bar" | 柱状图 | ✅ 需要 |
 * | 2    | LineStrategy | "line" | 折线图 | ✅ 需要 |
 * | 3    | PieStrategy | "pie" | 饼图 | ❌ 不需要 |
 * | 4    | AreaStrategy | "area" | 面积图 | ✅ 需要 |
 * | 5    | ScatterStrategy | "scatter" | 散点图 | ✅ 需要 |
 * | 6    | CandlestickStrategy | "candlestick" | K线图 | ✅ 需要 |
 * | 7    | GaugeStrategy | "gauge" | 仪表盘 | ❌ 不需要 |
 * | 8    | FunnelStrategy | "funnel" | 漏斗图 | ❌ 不需要 |
 * | 9    | RadarStrategy | "radar" | 雷达图 | ❌ 不需要 |
 *
 * **设计说明：**
 * - 使用**单例模式**：每个策略只创建一次实例，避免重复初始化开销
 * - **懒加载优化**：虽然当前是立即创建，但架构上支持改为按需创建
 * - **顺序敏感**：列表顺序影响策略查找优先级（虽然通常通过 type 匹配）
 * - **类型安全**：所有元素都继承自 BaseChartStrategy，保证接口一致性
 *
 * **使用方式：**
 * ```javascript
 * import { getAllStrategies } from './strategies/index.js';
 * const strategies = getAllStrategies();
 *
 * // 通过 type 属性查找特定策略
 * const barStrategy = strategies.find(s => s.type === 'bar');
 *
 * // 遍历所有策略
 * strategies.forEach(strategy => {
 *   console.log(`${strategy.name}: ${strategy.type}`);
 * });
 * ```
 */
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

/**
 * 获取所有已注册的图表策略
 *
 * @function getAllStrategies
 * @returns {Array<BaseChartStrategy>} 策略实例数组的副本引用
 *
 * @description 返回包含所有图表渲染策略的数组。
 *              每个策略都实现了 BaseChartStrategy 接口，
 *              提供 render()、hitTest()、formatDetail() 等方法。
 *
 * **返回值结构：**
 * ```javascript
 * [
 *   BarStrategy,      // type: "bar", name: "柱状图"
 *   LineStrategy,     // type: "line", name: "折线图"
 *   PieStrategy,      // type: "pie", name: "饼图"
 *   AreaStrategy,     // type: "area", name: "面积图"
 *   ScatterStrategy,  // type: "scatter", name: "散点图"
 *   CandlestickStrategy, // type: "candlestick", name: "K线图"
 *   GaugeStrategy,    // type: "gauge", name: "仪表盘"
 *   FunnelStrategy,   // type: "funnel", name: "漏斗图"
 *   RadarStrategy,    // type: "radar", name: "雷达图"
 * ]
 * ```
 *
 * **典型使用场景：**
 * - NativeChartRenderer 初始化时获取可用策略
 * - 动态添加新图表类型时检查已有策略
 * - 单元测试中验证策略注册完整性
 * - 策略工厂模式中的策略查找
 *
 * @example
 * // 基本用法
 * import { getAllStrategies } from './strategies/index.js';
 *
 * const allStrategies = getAllStrategies();
 * console.log(`已注册 ${allStrategies.length} 种图表策略`);
 *
 * // 查找特定策略
 * const lineStrategy = allStrategies.find(s => s.type === 'line');
 * if (lineStrategy) {
 *   lineStrategy.render(ctx, data, area, style);
 * }
 *
 * // 获取无坐标轴图表
 * const axisFreeCharts = allStrategies.filter(s => s.isAxisFree());
 */
export function getAllStrategies() {
    return strategies;
}

/**
 * 默认导出：策略实例数组
 *
 * @default
 * @type {Array<BaseChartStrategy>}
 * @description 提供默认导出以便简化导入语法：
 * ```javascript
 * import strategies from './strategies/index.js';
 * // 等价于：
 * import { getAllStrategies } from './strategies/index.js';
 * const strategies = getAllStrategies();
 * ```
 */
export default strategies;
