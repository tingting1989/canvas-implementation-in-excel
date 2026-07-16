/**
 * 图表渲染缓存 - ChartCache
 *
 * 管理图表的离屏 Canvas 缓存，是 ChartLayer 性能优化的核心组件。
 * 通过缓存已渲染的图表图像，避免每帧重复执行昂贵的数据提取和绑图操作。
 *
 * ## 核心职责
 *
 * 1. **离屏 Canvas 管理**：为每个图表创建和维护独立的离屏画布
 * 2. **设备像素比适配**：自动处理高 DPI 屏幕（Retina）的清晰度问题
 * 3. **缓存生命周期**：提供创建、查询、失效、销毁的完整生命周期管理
 * 4. **内存优化**：通过尺寸检查避免不必要的 Canvas 重建
 *
 * ## 设计模式
 *
 * 采用 **对象池模式（Object Pool）** + **懒加载策略**：
 * - Canvas 按需创建（首次访问时）
 * - 尺寸变化时自动重建
 * - 显式销毁时释放资源
 *
 * ## 高 DPI 支持
 *
 * 自动检测 `window.devicePixelRatio` 并相应调整 Canvas 分辨率：
 * - **逻辑尺寸**：CSS 像素（用于布局和坐标计算）
 * - **物理尺寸**：实际像素数 = 逻辑尺寸 × DPR
 * - **缩放上下文**：自动应用 ctx.scale(dpr, dpr)
 *
 * ## 使用示例
 *
 * ```javascript
 * const cache = new ChartCache();
 *
 * // 获取或创建缓存条目（自动处理 DPR）
 * const entry = cache.getOrCreate('chart1', 400, 300);
 * // entry.canvas: HTMLCanvasElement (物理尺寸可能为 800x600 在 2x 屏幕上)
 * // entry.ctx: CanvasRenderingContext2D (已应用 scale(2,2))
 * // entry.width: 400 (逻辑宽度)
 * // entry.height: 300 (逻辑高度)
 *
 * // 绘制到离屏 Canvas（使用逻辑坐标）
 * entry.ctx.fillStyle = '#5470c6';
 * entry.ctx.fillRect(10, 10, 100, 50);
 *
 * // 后续帧直接获取（如果尺寸未变则复用同一 Canvas）
 * const cached = cache.get('chart1');
 * if (cached) {
 *     mainCtx.drawImage(cached.canvas, x, y, w, h);
 * }
 *
 * // 图表数据变更时使缓存失效（清空内容但保留 Canvas 对象）
 * cache.invalidate('chart1');
 *
 * // 图表删除时移除缓存（释放 Canvas 内存）
 * cache.remove('chart1');
 *
 * // 工作表切换或组件销毁时清理所有缓存
 * cache.destroy();
 * ```
 *
 * ## 内存管理策略
 *
 * | 操作 | Canvas 对象 | 内存占用 | 适用场景 |
 * |------|-----------|---------|---------|
 * | getOrCreate() | 创建或复用 | 按需分配 | 正常渲染流程 |
 * | invalidate() | 保留 | 不变 | 数据更新 |
 * | remove() | 释放 | 减少 | 单个图表删除 |
 * | destroy() | 全部释放 | 清零 | 组件销毁 |
 *
 * ## 性能特性
 *
 * - ✅ **零开销查询**：Map.get() 时间复杂度 O(1)
 * - ✅ **智能复用**：尺寸匹配时直接返回已有 Canvas
 * - ✅ **DPR 适配**：自动处理高分辨率屏幕
 * - ✅ **批量清理**：destroy() 一键释放所有资源
 *
 * @see ChartLayer 使用此缓存的图表层
 * @see ChartCacheManager 基于此缓存的脏标记管理器
 */

export class ChartCache {
    /** @type {Map<string, {canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number}>} 缓存存储 Map */
    #caches = new Map();

    /** @type {number} 设备像素比（Device Pixel Ratio），用于高 DPI 屏幕适配 */
    #dpr = 1;

    /**
     * 构造函数
     *
     * 初始化缓存容器并检测当前设备的像素比。
     * 在服务器端渲染（SSR）环境中安全降级为 DPR=1。
     *
     * ## 设备像素比检测
     *
     * ```javascript
     * // 普通 HD 屏幕: dpr = 1
     * // Retina MacBook: dpr = 2
     * // 部分 Android 设备: dpr = 3
     * // SSR / Node.js 环境: dpr = 1 (安全降级)
     * ```
     */
    constructor() {
        this.#dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    }

    /**
     * 获取或创建图表缓存条目
     *
     * 这是核心方法，实现以下逻辑：
     * 1. 查询是否已存在该 chartId 的缓存
     * 2. 如果存在且尺寸匹配 → 直接返回（高性能路径）
     * 3. 如果不存在或尺寸不匹配 → 创建新的离屏 Canvas
     *
     * ## 尺寸匹配算法
     *
     * ```javascript
     * 物理宽度 = Math.round(逻辑宽度 × DPR)
     * 物理高度 = Math.round(逻辑高度 × DPR)
     *
     * 匹配条件: cached.canvas.width === 物理宽度
     *           && cached.canvas.height === 物理高度
     * ```
     *
     * ## Canvas 初始化细节
     *
     * 创建新 Canvas 时会：
     * 1. 设置物理分辨率（canvas.width/height）
     * 2. 设置 CSS 显示尺寸（canvas.style.width/height）
     * 3. 获取 2D 渲染上下文
     * 4. 应用 DPR 缩放变换（ctx.scale(dpr, dpr)）
     *
     * 这样做的优势：
     * - 开发者使用**逻辑坐标**绘图（与 ChartModel 尺寸一致）
     * - Canvas 内部使用**物理像素**渲染（保证清晰度）
     * - 导出时获得**高分辨率图片**（无需额外处理）
     *
     * @param {string} chartId - 图表唯一标识符
     * @param {number} width - 逻辑宽度（像素），通常来自 chart.width
     * @param {number} height - 逻辑高度（像素），通常来自 chart.height
     * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number}} 缓存条目
     *
     * @example
     * ```javascript
     * // 首次调用：创建新 Canvas
     * const entry1 = cache.getOrCreate('chart1', 400, 300);
     * // 在 2x DPR 屏幕上：
     * // entry1.canvas.width === 800  (物理像素)
     * // entry1.canvas.height === 600 (物理像素)
     * // entry1.width === 400         (逻辑像素)
     * // entry1.ctx 已应用 scale(2, 2)
     *
     * // 相同参数再次调用：返回同一个 Canvas（性能优化）
     * const entry2 = cache.getOrCreate('chart1', 400, 300);
     * console.log(entry1.canvas === entry2.canvas); // true
     *
     * // 尺寸变化：创建新 Canvas（旧 Canvas 将被 GC 回收）
     * const entry3 = cache.getOrCreate('chart1', 500, 350);
     * console.log(entry1.canvas !== entry3.canvas); // true
     * ```
     */
    getOrCreate(chartId, width, height) {
        let entry = this.#caches.get(chartId);

        const pw = Math.round(width * this.#dpr);
        const ph = Math.round(height * this.#dpr);

        if (entry && entry.canvas.width === pw && entry.canvas.height === ph) {
            return entry;
        }

        const canvas = document.createElement("canvas");
        canvas.width = pw;
        canvas.height = ph;

        if (canvas.style) {
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        }

        const ctx = canvas.getContext("2d");
        ctx.scale(this.#dpr, this.#dpr);

        entry = { canvas, ctx, width, height };
        this.#caches.set(chartId, entry);

        return entry;
    }

    /**
     * 获取已缓存的条目（只读查询）
     *
     * 用于快速判断图表是否已被缓存，以及获取缓存的 Canvas 引用。
     * 不会创建新条目，如果不存在则返回 null。
     *
     * ## 典型使用场景
     *
     * ```javascript
     * // 场景1：在 ChartLayer.render() 中检查缓存
     * const cached = cache.get(chartId);
     * if (cached) {
     *     // 直接绘制缓存的图像（跳过昂贵的渲染过程）
     *     ctx.drawImage(cached.canvas, x, y, w, h);
     * } else {
     *     // 加入待渲染队列
     *     pendingCharts.add(chartId);
     * }
     *
     * // 场景2：导出功能中获取 Canvas
     * const entry = cache.get(chartId);
     * if (entry?.canvas) {
     *     const dataUrl = entry.canvas.toDataURL('image/png');
     * }
     * ```
     *
     * @param {string} chartId - 图表 ID
     * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number}|null}
     *   缓存条目，不存在时返回 null
     */
    get(chartId) {
        return this.#caches.get(chartId) || null;
    }

    /**
     * 使指定图表缓存失效（清空内容但保留 Canvas 对象）
     *
     * 当图表的数据源发生变化但尺寸不变时调用。
     * 只清除 Canvas 内容，保留 Canvas 对象本身以供后续复用。
     *
     * ## 与 remove() 的区别
     *
     * | 方法 | Canvas 对象 | 内存 | 使用场景 |
     * |------|-----------|------|---------|
     * | invalidate() | ✅ 保留 | 不变 | 数据更新、样式修改 |
     * | remove() | ❌ 释放 | 减少 | 图表删除、工作表切换 |
     *
     * ## 实现原理
     *
     * ```javascript
     * // 使用 clearRect 清空整个画布区域
     * entry.ctx.clearRect(0, 0, entry.width, entry.height);
     * // 注意：使用的是逻辑尺寸（entry.width/height），因为 ctx 已 scale(dpr, dpr)
     * ```
     *
     * ## 调用时机示例
     *
     * ```javascript
     * // 1. 单元格数据变更时
     * store.on('cellDataChanged', (row, col) => {
     *     const affectedCharts = getChartsInRange(row, col);
     *     affectedCharts.forEach(chart => cache.invalidate(chart.id));
     * });
     *
     * // 2. 图表样式修改时
     * chart.updateStyle({ colors: newColors });
     * cache.invalidate(chart.id);  // 触发重绘
     * ```
     *
     * @param {string} chartId - 要失效的图表 ID
     * @returns {void}
     */
    invalidate(chartId) {
        const entry = this.#caches.get(chartId);
        if (entry) {
            entry.ctx.clearRect(0, 0, entry.width, entry.height);
        }
    }

    /**
     * 移除指定图表的缓存（完全释放 Canvas 内存）
     *
     * 当图表被永久删除时调用，彻底释放相关资源。
     * 不仅从 Map 中删除引用，还会将 Canvas 的宽高设为 0 以加速垃圾回收。
     *
     * ## 内存释放机制
     *
     * ```javascript
     * // 步骤1：将 Canvas 尺寸归零（立即释放显存）
     * entry.canvas.width = 0;
     * entry.canvas.height = 0;
     *
     * // 步骤2：从 Map 中移除引用（允许 GC 回收 Canvas 对象）
     * this.#caches.delete(chartId);
     * ```
     *
     * **为什么需要设置 width=0？**
     * - 浏览器的 Canvas 实现会在内部分配 GPU/系统内存
     * - 仅删除 JavaScript 引用不会立即释放这部分内存
     * - 显式设置尺寸为 0 会触发浏览器的内存回收机制
     *
     * ## 典型使用场景
     *
     * ```javascript
     * // 1. 用户删除图表时
     * chartManager.remove(chartId);
     * chartLayer.removeChartCache(chartId);  // 内部调用 cache.remove()
     *
     * // 2. 批量操作后清理
     * deletedCharts.forEach(id => cache.remove(id));
     *
     * // 3. 工作表销毁时（优先使用 destroy()）
     * // sheet.destroy() -> chartLayer.destroy() -> cache.destroy()
     * ```
     *
     * @param {string} chartId - 要移除的图表 ID
     * @returns {void}
     */
    remove(chartId) {
        const entry = this.#caches.get(chartId);
        if (entry) {
            entry.canvas.width = 0;
            entry.canvas.height = 0;
            this.#caches.delete(chartId);
        }
    }

    /**
     * 销毁所有缓存（释放全部资源）
     *
     * 在组件生命周期结束或工作表切换时调用。
     * 遍历所有缓存条目并逐一释放内存，最后清空 Map 容器。
     *
     * ## 与 remove() 的关系
     *
     * ```javascript
     * // remove(): 删除单个图表的缓存
     * cache.remove('chart1');
     *
     * // destroy(): 删除所有缓存（等同于对每个 chartId 调用 remove()）
     * cache.destroy();  // 更高效，一次性清理
     * ```
     *
     * ## 调用链示例
     *
     * ```
     * 用户关闭工作表
     *   ↓
     * Sheet.destroy()
     *   ↓
     * ChartLayer.destroy()
     *   ↓
     * ChartCache.destroy()  ← 当前方法
     *   ↓
     * 所有 Canvas 内存被释放 ✓
     * ```
     *
     * ## 安全性保证
     *
     * - ✅ 幂等性：多次调用不会报错或产生副作用
     * - ✅ 容错性：即使某些 Canvas 已被外部释放也不会异常
     * - ✅ 完整性：确保无内存泄漏
     *
     * @returns {void}
     *
     * @example
     * ```javascript
     * // 组件卸载时的标准用法
     * componentWillUnmount() {
     *     this.chartCache.destroy();
     * }
     *
     * // 切换工作表时
     * function switchSheet(newSheet) {
     *     oldChartLayer.destroy();  // 内部会调用 cache.destroy()
     *     newChartLayer.bindSheet(newSheet);
     * }
     * ```
     */
    destroy() {
        this.#caches.forEach((entry) => {
            entry.canvas.width = 0;
            entry.canvas.height = 0;
        });
        this.#caches.clear();
    }
}
