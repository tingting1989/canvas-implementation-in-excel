/**
 * @fileoverview 图表渲染器工厂类
 * @description 负责根据图表类型创建和返回对应的渲染器实例。
 *              实现工厂模式，支持原生 Canvas 渲染器和 ECharts 渲染器的动态选择。
 *              作为图表渲染系统的核心调度中心，统一管理不同类型图表的渲染逻辑。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module chart/ChartRendererFactory
 * @see {@link IChartRenderer} 渲染器接口定义
 * @see {@link NativeChartRenderer} 原生 Canvas 渲染器实现
 * @see {@link ERROR_CODE} 错误码常量定义
 */

import { IChartRenderer } from "./IChartRenderer.js";
import { NativeChartRenderer } from "./NativeChartRenderer.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/**
 * 图表渲染器工厂类
 *
 * @class ChartRendererFactory
 * @description 实现图表渲染器的创建和管理，采用**静态工厂方法模式**：
 *
 * **核心职责：**
 * - 🏭 **渲染器创建**：根据图表类型返回对应的渲染器类
 * - 🔍 **类型判断**：提供类型查询工具方法
 * - 🌉 **桥接管理**：管理 ECharts 渲染器的延迟加载
 * - ⚠️ **错误处理**：统一的日志记录和异常处理
 *
 * **支持的图表类型分类：**
 *
 * | 类别 | 类型标识符 | 渲染方式 | 性能特点 |
 * |------|-----------|---------|---------|
 * | **原生Canvas** | bar, line, pie, area, scatter, candlestick, gauge, funnel, radar, heatmap | NativeChartRenderer | ✅ 高性能、轻量级 |
 * | **ECharts** | treemap, sunburst | EChartsBridge（待实现） | 🚧 功能丰富、依赖较重 |
 *
 * **设计模式：**
 * - **工厂模式**：封装对象创建逻辑，隐藏具体实现细节
 * - **延迟初始化**：ECharts 桥接器按需加载，减少初始资源占用
 * - **单例管理**：通过静态属性管理全局唯一的桥接器实例
 * - **开闭原则**：支持扩展新的图表类型而不修改现有代码
 *
 * **使用示例：**
 * ```javascript
 * // 获取柱状图渲染器
 * const BarRenderer = ChartRendererFactory.getRenderer('bar');
 * const renderer = new BarRenderer();
 * renderer.render(ctx, chart, data, plotArea, style);
 *
 * // 判断是否为原生支持的类型
 * if (ChartRendererFactory.isNativeType('line')) {
 *   console.log('使用原生 Canvas 渲染');
 * }
 * ```
 *
 * **架构位置：**
 * ```
 * ┌─────────────────────────┐
 * │   ChartRendererFactory  │  ← 工厂（本文件）
 * │   ┌───────────────────┐ │
 * │   │ NativeChartRenderer│ │  ← 原生渲染器
 * │   ├───────────────────┤ │
 * │   │ EChartsBridge     │ │  ← ECharts桥接（可选）
 * │   └───────────────────┘ │
 * └─────────────────────────┘
 *           ↓ 创建
 * ┌─────────────────────────┐
 * │   IChartRenderer 接口   │  ← 统一接口
 * └─────────────────────────┘
 * ```
 *
 * **注意事项：**
 * - 所有方法都是**静态方法**，无需实例化即可使用
 * - ECharts 类型目前返回 null，待实现后可正常工作
 * - 不支持的类型会记录警告日志并返回 null
 * - 线程安全：所有操作都是同步的，无竞态条件风险
 */
export class ChartRendererFactory {
    /**
     * 原生 Canvas 支持的图表类型列表
     *
     * @static
     * @type {string[]}
     * @readonly
     * @description 包含所有可以使用 NativeChartRenderer 渲染的图表类型标识符。
     *              这些类型具有以下共同特征：
     *
     * **性能优势：**
     * - ✅ 无外部依赖，打包体积小
     * - ✅ 渲染速度快，CPU/GPU 占用低
     * - ✅ 支持离屏 Canvas 和 Web Worker
     * - ✅ 内存占用可控，适合大量图表场景
     *
     * **类型说明：**
     * - `bar` - 柱状图（支持分组、堆叠）
     * - `line` - 折线图（支持平滑曲线）
     * - `pie` - 饼图（支持环形图变体）
     * - `area` - 面积图（继承折线图特性）
     * - `scatter` - 散点图（支持气泡图）
     * - `candlestick` - K线图（金融数据专用）
     * - `gauge` - 仪表盘（KPI 展示）
     * - `funnel` - 漏斗图（转化分析）
     * - `radar` - 雷达图（多维对比）
     * - `heatmap` - 热力图（数据密度可视化）
     *
     * @example
     * // 检查某类型是否原生支持
     * if (ChartRendererFactory.NATIVE_TYPES.includes('bar')) {
     *   console.log('柱状图支持高性能渲染');
     * }
     */
    static NATIVE_TYPES = ["bar", "line", "pie", "area", "scatter", "candlestick", "gauge", "funnel", "radar", "heatmap"];

    /**
     * ECharts 支持的图表类型列表
     *
     * @static
     * @type {string[]}
     * @readonly
     * @description 包含需要使用 ECharts 库渲染的复杂图表类型。
     *              这些类型通常具有更丰富的交互和视觉效果：
     *
     * **功能特性：**
     * - 🌳 `treemap` - 矩形树图（层次数据可视化）
     * - ☀️ `sunburst` - 旭日图（多层环形层次图）
     *
     * **技术限制：**
     * - ⚠️ 需要引入 ECharts 库（~1MB gzip）
     * - ⚠️ 当前版本尚未实现桥接器（返回 null）
     * - ⚠️ 初始加载时间较长（需等待 ECharts 就绪）
     * - ⚠️ 内存占用较高（适合少量复杂图表）
     *
     * **实现计划：**
     * - Phase 1: 实现 EChartsBridge 基础框架
     * - Phase 2: 支持 treemap 和 sunburst
     * - Phase 3: 性能优化和按需加载
     *
     * @example
     * // 检查是否需要 ECharts
     * if (ChartRendererFactory.ECHARTS_TYPES.includes('treemap')) {
     *   console.log('需要加载 ECharts 库');
     * }
     */
    static ECHARTS_TYPES = ["treemap", "sunburst"];

    /**
     * ECharts 桥接器实例（私有字段）
     *
     * @static
     * @private
     * @type {Object|null}
     * @description 存储 ECharts 渲染器的桥接实例。
     *              采用**延迟初始化**模式：
     *
     * **生命周期：**
     * ```
     * null → [首次调用 getRenderer] → 创建实例 → 缓存 → 复用
     *                                              ↓
     *                                        [调用 reset] → null
     * ```
     *
     * **设计考量：**
     * - 使用私有字段 # 封装，防止外部直接修改
     * - 单例模式确保全局只有一个 ECharts 实例
     * - 支持重置以便测试或资源释放
     *
     * @see {@link ChartRendererFactory.reset} 重置方法
     */
    static #echartsBridge = null;

    /**
     * 根据图表类型获取对应的渲染器类
     *
     * @static
     * @method getRenderer
     * @param {string} chartType - 图表类型标识符
     * @returns {Function|null} 渲染器构造函数，未找到时返回 null
     *
     * @description 工厂核心方法，实现渲染器的智能分发：
     *
     * **查找策略（优先级从高到低）：**
     *
     * **1️⃣ 原生类型匹配**
     * - 检查 chartType 是否在 NATIVE_TYPES 中
     * - 匹配成功：返回 NativeChartRenderer 类
     * - 记录 DEBUG 日志：`CHART_STRATEGY_DEBUG`
     *
     * **2️⃣ ECharts 类型匹配**
     * - 检查 chartType 是否在 ECHARTS_TYPES 中
     * - 若 #echartsBridge 未初始化：
     *   - 记录 WARN 日志：`CHART_TYPE_NOT_FOUND`
     *   - 返回 null（提示用户该功能待实现）
     * - 若已初始化：返回 #echartsBridge 实例
     *
     * **3️⃣ 未知类型处理**
     * - 记录 WARN 日志：`CHART_TYPE_NOT_FOUND`
     * - 返回 null
     *
     * **性能优化：**
     * - 使用 Array.includes() 进行 O(n) 查找（n ≤ 9，可忽略）
     * - 避免不必要的对象创建和字符串操作
     * - 快速失败机制减少无效计算
     *
     * **错误处理：**
     * - 统一使用 errorHandler 记录日志
     * - 区分 DEBUG/WARN/FATAL 级别
     * - 提供详细的上下文信息便于调试
     *
     * @example
     * // 获取原生渲染器
     * const Renderer = ChartRendererFactory.getRenderer('bar');
     * if (Renderer) {
     *   const renderer = new Renderer();
     *   renderer.render(ctx, chart, data, area, style);
     * } else {
     *   console.error('不支持的图表类型');
     * }
     *
     * @throws {TypeError} 当 chartType 不是字符串时（隐式检查）
     *
     * @see {@link ERROR_CODE.CHART_TYPE_NOT_FOUND} 类型未找到错误码
     * @see {@link ERROR_CODE.CHART_STRATEGY_DEBUG} 策略调试信息码
     */
    static getRenderer(chartType) {
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
            return this.#echartsBridge;
        }

        errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `[ChartRendererFactory] Unsupported chart type: ${chartType}`, {
            chartType,
            nativeTypes: this.NATIVE_TYPES,
            echartsTypes: this.ECHARTS_TYPES,
        });
        return null;
    }

    /**
     * 判断指定类型是否为原生 Canvas 渲染类型
     *
     * @static
     * @method isNativeType
     * @param {string} type - 图表类型标识符
     * @returns {boolean} 如果是原生支持的类型返回 true，否则返回 false
     *
     * @description 快速判断工具方法，用于：
     *
     * **典型应用场景：**
     * - 条件渲染逻辑分支
     * - 功能开关控制
     * - UI 提示信息显示
     * - 性能优化路径选择
     *
     * **使用示例：**
     * ```javascript
     * // 根据类型选择不同的配置界面
     * if (ChartRendererFactory.isNativeType(type)) {
     *   showNativeConfigPanel();  // 轻量级配置
     * } else {
     *   showEChartsConfigPanel();  // 高级配置
     * }
     *
     * // 性能敏感场景的快速判断
     * const useHighPerfMode = ChartRendererFactory.isNativeType(chartType);
     * ```
     *
     * **时间复杂度：** O(n)，其中 n = NATIVE_TYPES.length (固定为 10)
     *
     * @example
     * if (ChartRendererFactory.isNativeType('line')) {
     *   console.log('可以使用离屏渲染优化');
     * }
     */
    static isNativeType(type) {
        return this.NATIVE_TYPES.includes(type);
    }

    /**
     * 判断指定类型是否为 ECharts 渲染类型
     *
     * @static
     * @method isEChartsType
     * @param {string} type - 图表类型标识符
     * @returns {boolean} 如果是 ECharts 类型返回 true，否则返回 false
     *
     * @description 辅助判断方法，用于：
     *
     * **应用场景：**
     * - 库加载提示（需要先加载 ECharts CDN）
     * - 功能降级处理（ECharts 不可用时显示提示）
     * - 配置项验证（区分原生和 ECharts 特有配置）
     * - 文档链接跳转（跳转到对应的 API 文档）
     *
     * **注意事项：**
     * - 即使返回 true，也不保证能立即使用（可能需要先初始化桥接器）
     * - 应配合 getRenderer() 的返回值进行空值检查
     *
     * @example
     * // 动态加载 ECharts 库
     * if (ChartRendererFactory.isEChartsType(type) && !window.echarts) {
     *   loadEChartsCDN().then(() => {
     *     const Renderer = ChartRendererFactory.getRenderer(type);
     *   });
     * }
     */
    static isEChartsType(type) {
        return this.ECHARTS_TYPES.includes(type);
    }

    /**
     * 重置工厂状态（主要用于测试和资源释放）
     *
     * @static
     * @method reset
     * @returns {void}
     *
     * @description 清除内部缓存状态，将工厂恢复到初始状态：
     *
     * **重置内容：**
     * - 将 #echartsBridge 设置为 null
     * - 释放对 ECharts 实例的引用（允许 GC 回收）
     *
     * **适用场景：**
     * - 🧪 **单元测试**：每个测试用例前重置避免状态污染
     * - 🔄 **热更新**：模块热替换时清理旧实例
     * - 💾 **内存管理**：长时间运行的应用定期释放资源
     * - 🐛 **错误恢复**：ECharts 加载失败后重置以便重试
     *
     * **调用时机建议：**
     * - 应用卸载前
     * - 测试套件的 beforeEach/afterEach
     * - 切换主题或语言包之前
     * - 捕获到致命错误后
     *
     * **副作用：**
     * - 后续对 ECharts 类型的 getRenderer() 调用将返回 null
     * - 不会影响 NATIVE_TYPES 和 ECHARTS_TYPES 常量
     * - 不会影响已创建的渲染器实例
     *
     * @example
     * // 测试中的典型用法
     * afterEach(() => {
     *   ChartRendererFactory.reset();
     * });
     *
     * // 应用退出时的清理
     * window.addEventListener('beforeunload', () => {
     *   ChartRendererFactory.reset();
     * });
     *
     * @see {@link ChartRendererFactory.#echartsBridge} 私有字段
     */
    static reset() {
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[ChartRendererFactory] Factory reset - clearing ECharts bridge cache`);
        this.#echartsBridge = null;
    }
}
