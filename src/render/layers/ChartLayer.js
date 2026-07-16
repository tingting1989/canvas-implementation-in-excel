/**
 * 图表渲染层 - ChartLayer
 *
 * 负责工作表中所有图表的渲染、交互和缓存管理。
 * 作为独立的图层集成到 LayerCompositor 的合成管线中。
 *
 * ## 核心职责
 *
 * 1. **图表渲染**：将 ChartModel 数据绘制到 Canvas 画布上
 * 2. **缓存管理**：使用离屏 Canvas 缓存已渲染的图表，避免重复计算
 * 3. **交互处理**：支持图表的选择、悬停、调整大小等操作
 * 4. **数据提取**：通过 DataExtractor 从工作表中提取图表数据
 * 5. **脏标记追踪**：监听工作表变化，智能判断是否需要重绘
 *
 * ## 渲染策略
 *
 * 采用**异步分批渲染 + 离屏缓存**的策略：
 * - 首次渲染或数据变化时：异步渲染到离屏 Canvas 并缓存
 * - 后续帧直接从缓存 drawImage，性能极高
 * - 调整大小时：先显示模糊缓存，后台重绘高清版本
 *
 * ## 使用示例
 *
 * ```javascript
 * // 在 LayerCompositor 中使用
 * const chartLayer = new ChartLayer();
 * chartLayer.bindSheet(sheet);
 * chartLayer.bindStore(store);
 *
 * // 每帧渲染调用
 * chartLayer.render(ctx, sheet, viewport, { viewW, viewH });
 *
 * // 交互处理
 * const hit = chartLayer.hitTest(clientX, clientY, sheet, vt);
 * if (hit) {
 *     chartLayer.selectedChartId = hit.chartId;
 * }
 * ```
 *
 * ## 性能特性
 *
 * - ✅ 离屏 Canvas 缓存：避免重复的数据提取和渲染计算
 * - ✅ 异步渲染队列：不阻塞主线程
 * - ✅ 可视区域裁剪：只渲染视口内的图表
 * - ✅ 脏标记优化：只在数据变化时重绘
 * - ✅ 调整大小优化：拖拽时显示低分辨率缓存
 *
 * @extends BaseLayer
 * @see BaseLayer 图层基类
 * @see ChartModel 图表数据模型
 * @see DataExtractor 数据提取器
 * @see ChartCacheManager 缓存管理器
 */

import { BaseLayer } from "../BaseLayer.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import { CONFIG } from "../../constants/config.js";
import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { ChartRendererFactory } from "../chart/ChartRendererFactory.js";
import { DataExtractor } from "../chart/DataExtractor.js";
import { ChartCache } from "../chart/ChartCache.js";
import { ChartCacheManager } from "../chart/ChartCacheManager.js";
import { NativeChartRenderer } from "../chart/NativeChartRenderer.js";
import { ViewportTransform } from "../ViewportTransform.js";

/** @type {{top: number, right: number, bottom: number, left: number}} 图表内边距配置 */
const PADDING = { top: 36, right: 20, bottom: 44, left: 56 };

/** @type {number} 图表选择手柄大小（像素） */
const HANDLE_SIZE = CONFIG.CHART_SELECTION_HANDLE_SIZE || 8;

export class ChartLayer extends BaseLayer {
    /** @type {ChartCache} 图表渲染缓存实例（离屏 Canvas 存储） */
    #cache = new ChartCache();

    /** @type {ChartCacheManager|null} 脏标记管理器，用于追踪图表数据变化 */
    #cacheManager = null;

    /** @type {DataExtractor} 数据提取器，负责从工作表提取图表所需数据 */
    #dataExtractor = new DataExtractor();

    /** @type {boolean} 是否正在执行异步渲染任务（防止并发） */
    #isRendering = false;

    /** @type {boolean} 是否处于调整大小状态（启用低分辨率缓存模式） */
    #isResizing = false;

    /** @type {Set<string>} 待渲染的图表 ID 集合（异步渲染队列） */
    #pendingCharts = new Set();

    /** @type {string|null} 当前选中的图表 ID */
    #selectedChartId = null;

    /** @type {Object|null} 当前悬停提示信息（tooltip 数据） */
    #hoverInfo = null;

    /** @type {string|null} 当前悬停的图表 ID */
    #hoverChartId = null;

    /**
     * 构造函数
     *
     * 初始化图表层，设置：
     * - 层名称："chart"
     * - Z-Index：从 LAYER_Z_INDEX.CHART 获取（通常在 Cell 层之上）
     * - 启用离屏渲染（offscreen: true）
     */
    constructor() {
        super("chart", LAYER_Z_INDEX.CHART, { offscreen: true });
    }

    /**
     * 绑定工作表
     *
     * 当切换工作表时调用，用于：
     * - 销毁旧的缓存管理器
     * - 创建新的缓存管理器（关联新的工作表）
     * - 标记层为脏（触发重新渲染）
     *
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     */
    bindSheet(sheet) {
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#cacheManager = new ChartCacheManager(sheet);
        this.markDirty();
    }

    /**
     * 绑定 Store（事件总线）
     *
     * 订阅以下变化事件以实现脏标记自动追踪：
     * - **scroll**: 滚动位置变化 → 需要更新可视区域裁剪
     * - **viewport**: 视口尺寸变化 → 需要重新计算布局
     * - **frozen**: 冻结行列变化 → 影响坐标转换
     * - **frozenOffset**: 冻结偏移量变化 → 影响坐标转换
     *
     * @param {import("../../store/Store.js").Store} store - 全局状态存储
     */
    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("viewport");
        this.watchForDirty("frozen");
        this.watchForDirty("frozenOffset");
    }

    /**
     * 获取当前选中的图表 ID
     *
     * @returns {string|null} 图表 ID，无选中时返回 null
     */
    get selectedChartId() {
        return this.#selectedChartId;
    }

    /**
     * 设置当前选中的图表 ID
     *
     * 当选中状态发生变化时：
     * - 更新内部状态
     * - 标记层为脏（触发重绘以显示选择框）
     *
     * @param {string|null} id - 要选中的图表 ID，传 null 取消选中
     */
    set selectedChartId(id) {
        if (this.#selectedChartId !== id) {
            this.#selectedChartId = id;
            this.markDirty();
        }
    }

    /**
     * 主渲染方法 - 每帧调用
     *
     * ## 渲染流程
     *
     * 1. **前置检查**：验证 sheet 和 chartManager 是否存在
     * 2. **获取图表列表**：从 chartManager 获取所有图表
     * 3. **解析视口**：使用智能降级策略获取 ViewportTransform
     * 4. **可视区域过滤**：只处理在视口内的图表（性能优化）
     * 5. **缓存命中检查**：
     *    - 如果缓存有效且非脏 → 直接 drawImage（快速路径）
     *    - 如果正在调整大小且存在旧缓存 → 显示模糊版本（响应式体验）
     *    - 否则加入待渲染队列
     * 6. **异步渲染**：启动后台任务渲染未缓存的图表
     * 7. **最终绘制**：将所有可见图表绘制到主画布
     * 8. **叠加层**：绘制选择框和悬停提示
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {import("../ViewportTransform.js").ViewportTransform|null} viewport - 视口坐标转换器
     * @param {Object} [options={}] - 渲染选项
     * @param {number} [options.viewW=0] - 视口宽度（像素）
     * @param {number} [options.viewH=0] - 视口高度（像素）
     */
    render(ctx, sheet, viewport, options = {}) {
        if (!sheet || !sheet.chartManager) return;

        const charts = sheet.chartManager.getAll();
        if (charts.length === 0) return;

        const vt = this.#resolveViewport(sheet, viewport);
        if (!vt) return;

        const viewW = options.viewW || 0;
        const viewH = options.viewH || 0;

        const visibleCharts = [];

        for (const chart of charts) {
            const bounds = chart.getBounds(vt);

            if (bounds.x + bounds.w < 0 || bounds.y + bounds.h < 0) continue;
            if (bounds.x > viewW || bounds.y > viewH) continue;

            visibleCharts.push(chart);
        }

        for (const chart of visibleCharts) {
            const isDirty = this.#cacheManager ? this.#cacheManager.isDirty(chart.id) : true;

            const cached = this.#cache.get(chart.id);

            if (isDirty && this.#isResizing && cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
                this.#pendingCharts.add(chart.id);
                continue;
            }

            if (!isDirty && cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
                continue;
            }

            this.#pendingCharts.add(chart.id);
        }

        if (this.#pendingCharts.size > 0 && !this.#isRendering) {
            this.#renderPendingCharts(sheet);
        }

        for (const chart of visibleCharts) {
            const cached = this.#cache.get(chart.id);
            if (cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
            }
        }

        if (this.#selectedChartId) {
            const selectedChart = sheet.chartManager.get(this.#selectedChartId);
            if (selectedChart) {
                this.#renderSelectionOverlay(ctx, selectedChart, vt);
            }
        }

        if (this.#hoverInfo && this.#hoverChartId) {
            const chart = sheet.chartManager.get(this.#hoverChartId);
            if (chart && chart.style.showTooltip !== false) {
                const bounds = chart.getBounds(vt);
                NativeChartRenderer.renderTooltip(ctx, this.#hoverInfo, bounds, chart.style);
            }
        }
    }

    /**
     * 设置悬停提示信息
     *
     * 当鼠标悬停在图表数据点上时调用，用于显示 tooltip。
     * 只在信息实际变化时才标记脏，避免不必要的重绘。
     *
     * @param {string|null} chartId - 悬停的图表 ID
     * @param {Object|null} info - 提示信息对象
     * @param {string} info.category - 类别名称（X轴值）
     * @param {string} info.seriesName - 系列名称（图例名）
     * @param {number} info.value - 数值（Y轴值）
     */
    setHoverInfo(chartId, info) {
        if (this.#hoverChartId !== chartId || !this.#isEqual(this.#hoverInfo, info)) {
            this.#hoverChartId = chartId;
            this.#hoverInfo = info;
            this.markDirty();
        }
    }

    /**
     * 设置调整大小状态
     *
     * 当用户拖拽图表边缘调整大小时设置为 true，
     * 启用"模糊缓存"模式以保持流畅的交互体验。
     *
     * @param {boolean} isResizing - 是否处于调整大小状态
     */
    setIsResizing(isResizing) {
        this.#isResizing = isResizing;
    }

    /**
     * 获取图表的离屏 Canvas 对象
     *
     * 用于导出、打印等场景。如果图表尚未渲染，返回 null。
     *
     * @async
     * @param {string} chartId - 图表 ID
     * @returns {Promise<HTMLCanvasElement|null>} 离屏 Canvas 元素
     */
    async getChartCanvas(chartId) {
        const cached = this.#cache.get(chartId);
        if (cached) {
            return cached.canvas;
        }
        return null;
    }

    /**
     * 将图表导出为 Data URL（base64 编码的图片）
     *
     * 支持多种图片格式和质量参数，可用于：
     * - 下载图片文件
     * - 在 img 标签中显示
     * - 上传到服务器
     *
     * ## 使用示例
     *
     * ```javascript
     * // 导出为 PNG（默认）
     * const dataUrl = await chartLayer.getChartAsDataURL('chart1');
     *
     * // 导出为高质量 JPEG
     * const jpegUrl = await chartLayer.getChartAsDataURL('chart1', {
     *     format: 'jpeg',
     *     quality: 0.9,
     *     scale: 2  // 2倍分辨率（Retina 屏幕）
     * });
     *
     * // 强制重建高清缓存
     * const hdUrl = await chartLayer.getChartAsDataURL('chart1', {
     *     rebuildHighQuality: true,
     *     scale: 3
     * });
     * ```
     *
     * @async
     * @param {string} chartId - 图表 ID
     * @param {Object} [options={}] - 导出选项
     * @param {string} [options.format='png'] - 图片格式：'png' | 'jpeg' | 'webp'
     * @param {number} [options.quality=1.0] - 图片质量（0-1），仅对 JPEG/WebP 有效
     * @param {number} [options.scale=1] - 缩放倍数，用于生成高分辨率图片
     * @param {boolean} [options.rebuildHighQuality=false] - 是否强制重建缓存
     * @returns {Promise<string|null>} Data URL 字符串，失败返回 null
     */
    async getChartAsDataURL(chartId, options = {}) {
        const { format = "png", quality = 1.0, scale = 1 } = options;

        let cached = this.#cache.get(chartId);

        if (!cached || options.rebuildHighQuality) {
            const sheet = this.sheet;
            if (sheet && sheet.chartManager) {
                const chart = sheet.chartManager.get(chartId);
                if (chart) {
                    await this.#renderToCache(chart, sheet);
                    cached = this.#cache.get(chartId);
                }
            }
        }

        if (!cached || !cached.canvas) return null;

        const canvas = cached.canvas;

        if (scale > 1) {
            const scaledCanvas = document.createElement("canvas");
            scaledCanvas.width = canvas.width * scale;
            scaledCanvas.height = canvas.height * scale;
            const ctx = scaledCanvas.getContext("2d");
            ctx.scale(scale, scale);
            ctx.drawImage(canvas, 0, 0);

            const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
            return scaledCanvas.toDataURL(mimeType, quality);
        }
        const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
        return canvas.toDataURL(mimeType, quality);
    }

    /**
     * 将图表导出为 Blob 对象
     *
     * 用于 FormData 上传、File API 操作等场景。
     * 内部调用 getChartAsDataURL 后转换为 Blob。
     *
     * @async
     * @param {string} chartId - 图表 ID
     * @param {Object} [options={}] - 导出选项（同 getChartAsDataURL）
     * @returns {Promise<Blob|null>} Blob 对象，失败返回 null
     */
    async getChartAsBlob(chartId, options = {}) {
        const dataUrl = await this.getChartAsDataURL(chartId, options);
        if (!dataUrl) return null;

        const response = await fetch(dataUrl);
        return await response.blob();
    }

    /**
     * 重建指定图表的缓存
     *
     * 当图表样式或数据源发生重大变化时调用，
     * 强制清除旧缓存并重新渲染。
     *
     * @async
     * @param {string} chartId - 要重建的图表 ID
     * @returns {Promise<boolean>} 是否成功重建
     */
    async rebuildChartCache(chartId) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return false;

        const chart = sheet.chartManager.get(chartId);
        if (!chart) return false;

        try {
            await this.#renderToCache(chart, sheet);
            return true;
        } catch (error) {
            errorHandler.handle(ERROR_CODE.CHART_CACHE_REBUILD_FAILED, `Failed to rebuild cache for chart ${chartId}`, { chartId, error });
            return false;
        }
    }

    /**
     * 获取与选中区域相交的图表列表
     *
     * 用于复制/粘贴、删除等批量操作时的范围检测。
     * 通过估算图表占据的行列范围进行碰撞检测。
     *
     * ## 算法说明
     *
     * 假设：
     * - 默认行高 ≈ 20px
     * - 默认列宽 ≈ 80px
     *
     * 计算图表覆盖的行列范围，然后与 selection 进行矩形相交测试。
     *
     * @param {Object} selection - 选区对象
     * @param {number} selection.startRow - 起始行号
     * @param {number} selection.endRow - 结束行号
     * @param {number} selection.startCol - 起始列号
     * @param {number} selection.endCol - 结束列号
     * @returns {Array<import("../../model/chart/ChartModel.js").ChartModel>} 相交的图表数组
     */
    getChartsInSelection(selection) {
        if (!this.sheet || !this.sheet.chartManager) return [];

        const charts = this.sheet.chartManager.getAll();
        if (!selection || !selection.startRow || !selection.endRow) return charts;

        return charts.filter((chart) => {
            const chartEndRow = chart.anchorRow + Math.ceil(chart.height / 20);
            const chartEndCol = chart.anchorCol + Math.ceil(chart.width / 80);

            return !(
                chart.anchorRow > selection.endRow ||
                chartEndRow < selection.startRow ||
                chart.anchorCol > selection.endCol ||
                chartEndCol < selection.startCol
            );
        });
    }

    /**
     * 获取所有图表
     *
     * @returns {Array<import("../../model/chart/ChartModel.js").ChartModel>} 图表数组
     */
    getAllCharts() {
        return this.sheet?.chartManager?.getAll() || [];
    }

    /**
     * 深度比较两个 tooltip 信息对象是否相等
     *
     * 用于避免不必要的重绘：只有当 tooltip 内容真正改变时才更新。
     *
     * @private
     * @param {Object|null} a - 第一个 tooltip 信息
     * @param {Object|null} b - 第二个 tooltip 信息
     * @returns {boolean} 是否相等
     */
    #isEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.category === b.category && a.seriesName === b.seriesName && a.value === b.value;
    }

    /**
     * 解析视口转换器（智能降级策略）
     *
     * ## 设计思路
     *
     * 正常情况下，viewport 参数由 LayerCompositor 传入。
     * 但在某些降级场景（如独立调用 render 方法）可能缺失，
     * 此时基于 sheet 的滚动状态创建临时 VT 实例。
     *
     * ## 优先级
     *
     * 1. ✅ 使用传入的 viewport 参数（正常渲染流程，零开销）
     * 2. 🔄 基于 sheet 当前状态创建临时实例（降级场景，微小开销）
     * 3. ⛔ 创建失败时返回 null（防御性编程，安全退出）
     *
     * @private
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表
     * @param {import("../ViewportTransform.js").ViewportTransform|null} viewport - 传入的视口
     * @returns {import("../ViewportTransform.js").ViewportTransform|null}
     */
    #resolveViewport(sheet, viewport) {
        if (viewport) return viewport;

        const scrollX = sheet.scrollX ?? 0;
        const scrollY = sheet.scrollY ?? 0;

        try {
            return new ViewportTransform(sheet, scrollX, scrollY);
        } catch (e) {
            errorHandler.warn(ERROR_CODE.CHART_VIEWPORT_TRANSFORM_FAILED, "无法创建视口转换器", { message: e.message });
            return null;
        }
    }

    /**
     * 绘制图表选择叠加层
     *
     * 在选中的图表周围绘制：
     * - 虚线边框（表示选中状态）
     * - 8个调整大小的手柄（四角+四边中点）
     *
     * ## 手柄布局
     *
     * ```
     *  nw ─── n ─── ne
     *   │           │
     *   w           e
     *   │           │
     *  sw ─── s ─── se
     * ```
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {import("../../model/chart/ChartModel.js").ChartModel} chart - 选中的图表
     * @param {import("../ViewportTransform.js").ViewportTransform} vt - 视口转换器
     */
    #renderSelectionOverlay(ctx, chart, vt) {
        const b = chart.getBounds(vt);
        if (!b) return;

        ctx.save();

        ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR || "#4472C4";
        ctx.lineWidth = CONFIG.CHART_SELECTION_BORDER_WIDTH || 1.5;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN || [5, 3]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);

        const handles = this.#getHandlePositions(b);
        const half = HANDLE_SIZE / 2;

        for (const pos of Object.values(handles)) {
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR || "#4472C4";
            ctx.lineWidth = 1;
            ctx.fillRect(pos.x - half, pos.y - half, HANDLE_SIZE, HANDLE_SIZE);
            ctx.strokeRect(pos.x - half, pos.y - half, HANDLE_SIZE, HANDLE_SIZE);
        }

        ctx.restore();
    }

    /**
     * 计算8个调整手柄的位置
     *
     * 返回图表边界框的8个关键位置点：
     * - 四角：nw, ne, sw, se
     * - 四边中点：n, s, e, w
     *
     * @private
     * @param {Object} b - 边界框 {x, y, w, h}
     * @returns {Object.<string, {x: number, y: number}>} 手柄位置映射
     */
    #getHandlePositions(b) {
        const mx = b.x + b.w / 2;
        const my = b.y + b.h / 2;
        return {
            nw: { x: b.x, y: b.y },
            n: { x: mx, y: b.y },
            ne: { x: b.x + b.w, y: b.y },
            e: { x: b.x + b.w, y: my },
            se: { x: b.x + b.w, y: b.y + b.h },
            s: { x: mx, y: b.y + b.h },
            sw: { x: b.x, y: b.y + b.h },
            w: { x: b.x, y: my },
        };
    }

    /**
     * 异步渲染所有待处理的图表
     *
     * ## 执行机制
     *
     * 1. **防并发**：通过 #isRendering 标志确保同时只有一个渲染任务
     * 2. **快照队列**：取出当前的 pendingCharts 并清空，避免无限循环
     * 3. **逐个渲染**：按顺序渲染每个图表到离屏 Canvas
     * 4. **清理标记**：渲染完成后将图表标记为 clean
     * 5. **递归处理**：如果在渲染过程中有新图表加入队列，递归处理
     *
     * ## 性能考虑
     *
     * - 使用 async/await 让出主线程控制权
     * - 每个 chart 的渲染是独立任务，可被中断
     * - 最终调用 markDirty() 触发下一帧重绘
     *
     * @private
     * @async
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表
     */
    async #renderPendingCharts(sheet) {
        if (this.#isRendering) return;
        this.#isRendering = true;

        const pendingIds = Array.from(this.#pendingCharts);
        this.#pendingCharts.clear();

        for (const chartId of pendingIds) {
            if (this.#pendingCharts.has(chartId)) continue;

            const chart = sheet.chartManager?.get(chartId);
            if (!chart) continue;

            await this.#renderToCache(chart, sheet);

            if (this.#cacheManager) {
                this.#cacheManager.markClean(chartId);
            }
        }

        this.#isRendering = false;
        this.#isResizing = false;
        this.markDirty();

        if (typeof this.onContentReady === "function") {
            this.onContentReady();
        }

        if (this.#pendingCharts.size > 0) {
            this.#renderPendingCharts(sheet);
        }
    }

    /**
     * 将单个图表渲染到离屏缓存
     *
     * ## 渲染流程
     *
     * 1. **获取/创建缓存条目**：从 ChartCache 获取或创建离屏 Canvas
     * 2. **清空画布**：清除旧内容
     * 3. **获取渲染器**：根据图表类型从工厂获取对应的渲染器
     * 4. **提取数据**：通过 DataExtractor 从工作表提取图表数据
     * 5. **计算绘图区**：扣除 padding 后的实际绑图区域
     * 6. **执行渲染**：调用渲染器的 render 方法
     * 7. **缓存数据**：将提取的数据保存到 chart._cachedData（供后续对比）
     *
     * ## 错误处理
     *
     * 整个过程包裹在 try-catch 中，单个图表渲染失败不会影响其他图表。
     *
     * @private
     * @async
     * @param {import("../../model/chart/ChartModel.js").ChartModel} chart - 图表模型
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表
     */
    async #renderToCache(chart, sheet) {
        try {
            const entry = this.#cache.getOrCreate(chart.id, chart.width, chart.height);
            entry.ctx.clearRect(0, 0, chart.width, chart.height);

            const renderer = ChartRendererFactory.getRenderer(chart.type);
            if (!renderer) return;

            const data = await this.#dataExtractor.extract(chart, sheet);
            if (!data || !data.data || data.data.length === 0) return;

            const plotArea = {
                x: PADDING.left,
                y: PADDING.top,
                w: chart.width - PADDING.left - PADDING.right,
                h: chart.height - PADDING.top - PADDING.bottom,
            };

            renderer.render(entry.ctx, chart, data, plotArea, chart.style);
            chart._cachedData = data;
        } catch (e) {
            errorHandler.handle(ERROR_CODE.CHART_RENDER_ERROR, "图表渲染异常", { error: e });
        }
    }

    /**
     * 坐标点击测试（Hit Test）
     *
     * 检测给定的屏幕坐标是否落在某个图表上。
     * 从顶层图表开始向下遍历（后绘制的在上面）。
     *
     * ## 返回值结构
     *
     * ```javascript
     * {
     *   type: "chart",       // 命中类型
     *   chartId: "xxx",      // 图表 ID
     *   chart: ChartModel,   // 图表模型引用
     *   bounds: {x,y,w,h},   // 图表屏幕坐标边界
     *   vt: ViewportTransform  // 视口转换器引用
     * }
     * ```
     *
     * @param {number} px - 屏幕 X 坐标（像素）
     * @param {number} py - 屏幕 Y 坐标（像素）
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表
     * @param {import("../ViewportTransform.js").ViewportTransform} vt - 视口转换器
     * @returns {Object|null} 命中信息，未命中返回 null
     */
    hitTest(px, py, sheet, vt) {
        if (!sheet || !sheet.chartManager) return null;
        const charts = sheet.chartManager.getAll();

        for (let i = charts.length - 1; i >= 0; i--) {
            const chart = charts[i];
            if (chart.containsPoint(px, py, vt)) {
                return { type: "chart", chartId: chart.id, chart, bounds: chart.getBounds(vt), vt };
            }
        }
        return null;
    }

    /**
     * 使指定图表缓存失效
     *
     * 在图表属性修改后调用，强制下一帧重新渲染该图表。
     *
     * @param {string} chartId - 图表 ID
     */
    invalidateChart(chartId) {
        this.#cacheManager?.invalidateAll();
        this.#pendingCharts.add(chartId);
        this.markDirty();
    }

    /**
     * 使所有图表数据缓存失效
     *
     * 在工作表数据批量变更时调用（如导入数据、撤销操作等）。
     */
    invalidateChartData() {
        this.#cacheManager?.invalidateAll();
        this.markDirty();
    }

    /**
     * 移除指定图表的缓存
     *
     * 在图表删除时调用，释放内存资源。
     *
     * @param {string} chartId - 要移除的图表 ID
     */
    removeChartCache(chartId) {
        this.#cache.remove(chartId);
        this.#pendingCharts.delete(chartId);
        this.markDirty();
    }

    /**
     * 标记层为脏（需重绘）
     *
     * 重写基类方法，可在未来添加自定义逻辑（如节流、批处理等）。
     */
    markDirty() {
        super.markDirty();
    }

    /**
     * 销毁图表层
     *
     * 释放所有资源：
     * - 销毁图表缓存（释放离屏 Canvas）
     * - 销毁缓存管理器
     * - 销毁数据提取器（终止 Worker）
     * - 清空待渲染队列
     * - 调用基类销毁方法
     */
    destroy() {
        this.#cache.destroy();
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#dataExtractor.destroy();
        this.#pendingCharts.clear();
        super.destroy();
    }
}
