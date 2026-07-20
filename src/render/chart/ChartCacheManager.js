/**
 * 图表缓存脏标记管理器 - ChartCacheManager
 *
 * 追踪工作表数据变化，智能判断图表缓存是否需要更新。
 * 采用**版本号机制**实现高效的脏标记检测。
 *
 * ## 核心职责
 *
 * 1. **版本追踪**：维护全局版本号和每个图表的最后清洁版本
 * 2. **脏标记判断**：通过版本比较快速判断图表是否需要重绘
 * 3. **事件监听**：自动订阅工作表的数据变更事件
 *
 * ## 设计模式
 *
 * ### 版本号机制（Versioning）
 *
 * ```
 * 全局版本号 (globalVersion):
 *   初始值: 0
 *   单元格数据变化时: ++globalVersion
 *   手动调用 invalidateAll(): ++globalVersion
 *
 * 图表版本号 (chartVersions[chartId]):
 *   初始值: -1 (表示从未渲染)
 *   渲染完成后: chartVersions[id] = globalVersion
 *
 * 脏标记判断:
 *   isDirty(chartId) = chartVersions[chartId] < globalVersion
 * ```
 *
 * ### 性能优势
 *
 * - ✅ O(1) 时间复杂度的脏标记检查（只需数值比较）
 * - ✅ 批量操作优化：多个单元格变化只触发一次版本递增
 * - ✅ 内存高效：只存储整数，不存储具体变化内容
 *
 * ## 使用示例
 *
 * ```javascript
 * // 在 ChartLayer 中使用
 * const cacheManager = new ChartCacheManager(sheet);
 *
 * // 每帧渲染前检查
 * if (cacheManager.isDirty(chartId)) {
 *     // 数据已变化，需要重新渲染
 *     await renderToCache(chart, sheet);
 *     cacheManager.markClean(chartId);  // 标记为已清洁
 * }
 *
 * // 图表样式修改时手动失效
 * cacheManager.invalidateAll();
 * ```
 *
 * ## 事件监听机制
 *
 * 通过 Sheet 的 EventBus 订阅以下事件：
 * - **CELL_CHANGED**: 单元格值变化 → 设置 pendingInvalidation 标志
 * - **INVALIDATE_ALL**: 全局刷新 → 直接递增全局版本号
 *
 * 使用"延迟提交"策略避免频繁的版本更新：
 * ```
 * 单元格变化 × N 次 → pendingInvalidation = true
 *                    ↓ (下一帧或 flush 时)
 *              globalVersion++ (一次性)
 * ```
 *
 * @see ChartLayer 使用此管理器的图表层
 * @see ChartCache 底层的 Canvas 缓存
 */

import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";

export class ChartCacheManager {
    /** @type {number} 全局版本号，每次数据变化时递增 */
    #globalVersion = 0;

    /** @type {Map<string, number>} 每个图表的最后清洁版本号映射 */
    #chartVersions = new Map();

    /** @type {boolean} 是否有待处理的失效请求（延迟提交优化） */
    #pendingInvalidation = false;

    /** @type {import("../../workbook/Sheet.js").Sheet|null} 关联的工作表实例 */
    #sheet = null;

    /** @type {Function|null} CELL_CHANGED 事件的监听器引用（用于精确移除） */
    #onCellChangedHandler = null;

    /** @type {Function|null} INVALIDATE_ALL 事件的监听器引用（用于精确移除） */
    #onInvalidateAllHandler = null;

    /**
     * 构造函数
     *
     * 初始化管理器并绑定到指定的工作表，
     * 自动设置事件监听器以追踪数据变化。
     *
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     */
    constructor(sheet) {
        this.#sheet = sheet;
        this.#setupListeners();
    }

    /**
     * 设置事件监听器
     *
     * 订阅工作表的 EventBus 事件以追踪数据变化。
     * 采用防御性编程，确保在 sheet 或 bus 不存在时不报错。
     *
     * ## 监听的事件
     *
     * ### 1. CELL_CHANGED（单元格数据变化）
     * - **发射时机**：用户编辑、公式计算、批量导入等
     * - **处理逻辑**：设置 pendingInvalidation 标志（不立即更新版本号）
     * - **性能优化**：避免连续多次单元格修改导致频繁的版本递增
     *
     * ### 2. INVALIDATE_ALL（全局刷新）
     * - **发射时机**：窗口 resize、主题切换、强制刷新等
     * - **处理逻辑**：直接递增全局版本号（立即生效）
     *
     * ## 延迟提交策略
     *
     * ```javascript
     * // 场景：用户连续输入 10 个字符
     * cellStore.set(0, 0, 'A') → pendingInvalidation = true
     * cellStore.set(0, 0, 'AB') → pendingInvalidation = true (重复设置)
     * cellStore.set(0, 0, 'ABC') → ... (继续重复)
     * // ... (中间多次变化)
     * cellStore.set(0, 0, 'ABCDEFGHIJ') → pendingInvalidation = true
     *
     * // 最终效果：下一帧只执行一次 globalVersion++
     * // 而不是 10 次！
     * ```
     *
     * @private
     */
    #setupListeners() {
        const sheet = this.#sheet;

        if (!sheet?.bus) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_SHEET_UNAVAILABLE, "Sheet 或 EventBus 不可用，跳过事件监听");
            return;
        }

        try {
            this.#onCellChangedHandler = () => {
                this.#pendingInvalidation = true;
            };
            sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, this.#onCellChangedHandler);

            this.#onInvalidateAllHandler = () => {
                this.#globalVersion++;
                this.#pendingInvalidation = false;
            };
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, this.#onInvalidateAllHandler);
        } catch (e) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_LISTENER_SETUP_FAILED, "设置事件监听器失败", { message: e.message });
        }
    }

    /**
     * 判断指定图表的缓存是否为脏（需要重绘）
     *
     * ## 判断算法
     *
     * ```javascript
     * isDirty(chartId) = (chartVersions.get(chartId) ?? -1) < globalVersion
     * ```
     *
     * - 如果图表从未被渲染过（version = -1），始终返回 true
     * - 如果图表上次渲染后的版本号小于当前全局版本，说明数据已变化
     * - 如果两者相等，说明图表是"干净"的，可以使用缓存
     *
     * ## 典型使用场景
     *
     * ```javascript
     * // 在 ChartLayer.render() 中
     * for (const chart of visibleCharts) {
     *     const isDirty = cacheManager.isDirty(chart.id);
     *     const cached = cache.get(chart.id);
     *
     *     if (!isDirty && cached) {
     *         // ✅ 缓存有效，直接绘制
     *         ctx.drawImage(cached.canvas, x, y, w, h);
     *     } else {
     *         // ❌ 缓存失效，加入待渲染队列
     *         pendingCharts.add(chart.id);
     *     }
     * }
     * ```
     *
     * @param {string} chartId - 图表 ID
     * @returns {boolean} 如果缓存为脏（需要重绘）返回 true，否则返回 false
     */
    isDirty(chartId) {
        const lastVersion = this.#chartVersions.get(chartId) ?? -1;
        return lastVersion < this.#globalVersion;
    }

    /**
     * 获取关联的工作表实例
     * @returns {import("../../workbook/Sheet.js").Sheet|null}
     */
    get sheet() {
        return this.#sheet;
    }

    /**
     * 将指定图表标记为清洁（已同步最新数据）
     *
     * 在图表成功渲染并写入缓存后调用，
     * 将当前全局版本号记录为该图表的最后清洁版本。
     *
     * ## 调用时机
     *
     * ```javascript
     * async #renderToCache(chart, sheet) {
     *     // ... 执行渲染 ...
     *     renderer.render(ctx, chart, data, plotArea, style);
     *
     *     // 渲染成功后标记为清洁
     *     this.#cacheManager.markClean(chart.id);
     * }
     * ```
     *
     * ## 版本快照原理
     *
     * 调用 markClean 时会"拍摄"当前全局版本的快照：
     * ```
     * 时间线:
     * t0: globalVersion=5, 用户开始编辑
     * t1: globalVersion=6 (单元格变化), isDirty(chart1)=true
     * t2: 渲染完成, markClean('chart1')
     *     → chartVersions['chart1'] = 6
     * t3: isDirty('chart1') = (6 < 6) = false ✓ 干净
     * t4: globalVersion=7 (再次变化), isDirty(chart1)=true
     * ```
     *
     * @param {string} chartId - 图表 ID
     * @returns {void}
     */
    markClean(chartId) {
        this.#chartVersions.set(chartId, this.#globalVersion);
    }

    /**
     * 使所有图表缓存失效
     *
     * 强制将全局版本号递增，导致所有图表的 isDirty() 返回 true。
     * 用于非数据驱动的缓存失效场景（如图表样式修改、强制刷新等）。
     *
     * ## 与 CELL_CHANGED 的区别
     *
     * | 触发方式 | 调用方法 | 效果 |
     * |---------|---------|------|
     * | 单元格数据变化 | EventBus 自动触发 | 可能延迟提交（pendingInvalidation）|
     * | 样式/布局变化 | 手动调用此方法 | **立即生效** |
     *
     * ## 典型使用场景
     *
     * ```javascript
     * // 1. 图表样式修改时
     * chart.updateStyle({ colors: newColors });
     * cacheManager.invalidateAll();  // 强制所有图表重绘
     *
     * // 2. 工作表切换回来时
     * onSheetActivated(sheet) {
     *     sheet.chartLayer.invalidateChartData();  // 内部调用 invalidateAll()
     * }
     *
     * // 3. 主题切换时
     * onThemeChanged(newTheme) {
     *     cacheManager.invalidateAll();
     * }
     * ```
     *
     * @returns {void}
     */
    invalidateAll() {
        this.#globalVersion++;
        this.#pendingInvalidation = false;
    }

    /**
     * 获取当前全局版本号（主要用于调试和测试）
     *
     * @returns {number} 全局版本号
     */
    get globalVersion() {
        return this.#globalVersion;
    }

    /**
     * 销毁管理器
     *
     * 清理资源：
     * - 清空图表版本映射
     * - **精确移除**当前模块注册的事件监听器（不影响其他模块）
     *
     * ## 精确移除机制（重要）
     *
     * EventBus 的 `.off(event, listener)` 方法通过**函数引用匹配**来移除特定监听器：
     * ```javascript
     * // 只会移除 ChartCacheManager 注册的这一个监听器
     * this.#sheet.bus.off(SHEET_EVENTS.CELL_CHANGED, this.#onCellChangedHandler);
     *
     * // 其他模块注册的同一事件的监听器不受影响 ✓
     * // 例如：CellEditor、FormulaEngine 等的监听器仍然有效
     * ```
     *
     * ### 为什么需要保存回调函数引用？
     *
     * 如果使用匿名函数，无法在后续精确移除：
     * ```javascript
     * // ❌ 错误：匿名函数无法被移除
     * sheet.bus.on('event', () => { ... });
     * sheet.bus.off('event');  // listener 参数为 undefined，不会移除任何东西！
     *
     * // ✅ 正确：保存引用后可精确移除
     * this.#handler = () => { ... };
     * sheet.bus.on('event', this.#handler);
     * sheet.bus.off('event', this.#handler);  // 只移除这唯一的监听器
     * ```
     *
     * ## 内存安全保证
     *
     * - 移除监听器后将引用设为 `null`（允许 GC 回收）
     * - 防止重复调用 `destroy()` 时的异常
     * - try-catch 包裹确保即使 EventBus 异常也不会中断清理流程
     *
     * @returns {void}
     */
    destroy() {
        this.#chartVersions.clear();

        if (this.#sheet?.bus) {
            try {
                if (this.#onCellChangedHandler) {
                    this.#sheet.bus.off(SHEET_EVENTS.CELL_CHANGED, this.#onCellChangedHandler);
                    this.#onCellChangedHandler = null;
                }

                if (this.#onInvalidateAllHandler) {
                    this.#sheet.bus.off(SHEET_EVENTS.INVALIDATE_ALL, this.#onInvalidateAllHandler);
                    this.#onInvalidateAllHandler = null;
                }
            } catch (e) {
                errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_LISTENER_REMOVE_FAILED, "移除事件监听器失败", { message: e.message });
            }
        }
    }
}
