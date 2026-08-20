import { BaseLayer } from "../BaseLayer.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import { CONFIG } from "../../constants/config.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { ChartRendererFactory } from "../chart/ChartRendererFactory.js";
import { DataExtractor } from "../chart/DataExtractor.js";
import { ChartCache } from "../chart/ChartCache.js";
import { ChartCacheManager } from "../chart/ChartCacheManager.js";
import { NativeChartRenderer } from "../chart/NativeChartRenderer.js";
import { ViewportTransform } from "../ViewportTransform.js";
import type { Sheet } from "../../workbook/Sheet.js";
import type { ReactiveStore as Store } from "../../state/ReactiveStore.js";
import type { ChartModel } from "../../plugins/chart/ChartModel.js";

/** 图表内边距配置 */
const PADDING = { top: 36, right: 20, bottom: 44, left: 56 };

/** 图表选择手柄大小（像素） */
const HANDLE_SIZE: number = CONFIG.CHART_SELECTION_HANDLE_SIZE || 8;

/** 悬停提示信息 */
interface HoverInfo {
    /** 类别名称（X轴值） */
    category: string;
    /** 系列名称（图例名） */
    seriesName: string;
    /** 数值（Y轴值） */
    value: number | string;
    /** 命中点在 Canvas 上的 X 坐标 */
    pointX: number;
    /** 命中点在 Canvas 上的 Y 坐标 */
    pointY: number;
    /** 图表类型标识 */
    chartType?: string;
    /** 详细信息 */
    detail?: Record<string, unknown>;
}

/** 图表导出选项 */
interface ChartExportOptions {
    /** 图片格式：'png' | 'jpeg' | 'webp' */
    format?: "png" | "jpeg" | "webp";
    /** 图片质量（0-1），仅对 JPEG/WebP 有效 */
    quality?: number;
    /** 缩放倍数，用于生成高分辨率图片 */
    scale?: number;
    /** 是否强制重建缓存 */
    rebuildHighQuality?: boolean;
}

/** 选区范围 */
interface SelectionRange {
    /** 起始行号 */
    startRow: number;
    /** 结束行号 */
    endRow: number;
    /** 起始列号 */
    startCol: number;
    /** 结束列号 */
    endCol: number;
}

/** 手柄位置映射 */
interface HandlePositions {
    [key: string]: { x: number; y: number };
}

/**
 * 图表渲染层（ChartLayer）
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
 * @see BaseLayer 图层基类
 * @see ChartModel 图表数据模型
 * @see DataExtractor 数据提取器
 * @see ChartCacheManager 缓存管理器
 */
export class ChartLayer extends BaseLayer {
    /** 图表内容就绪回调（由 RenderEngine 设置，触发重绘） */
    onContentReady: (() => void) | null = null;

    /** @private 私有字段 - 图表渲染缓存实例（离屏 Canvas 存储） */
    #cache = new ChartCache();

    /** @private 私有字段 - 脏标记管理器，用于追踪图表数据变化 */
    #cacheManager: ChartCacheManager | null = null;

    /** @private 私有字段 - 数据提取器，负责从工作表提取图表所需数据 */
    #dataExtractor = new DataExtractor();

    /** @private 私有字段 - 是否正在执行异步渲染任务（防止并发） */
    #isRendering = false;

    /** @private 私有字段 - 是否处于调整大小状态（启用低分辨率缓存模式） */
    #isResizing = false;

    /** @private 私有字段 - 待渲染的图表 ID 集合（异步渲染队列） */
    #pendingCharts = new Set<string>();

    /** @private 私有字段 - 当前选中的图表 ID */
    #selectedChartId: string | null = null;

    /** @private 私有字段 - 当前悬停提示信息 */
    #hoverInfo: HoverInfo | null = null;

    /** @private 私有字段 - 当前悬停的图表 ID */
    #hoverChartId: string | null = null;

    /**
     * 构造图表层
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
     * @param sheet - 工作表实例
     */
    bindSheet(sheet: Sheet): void {
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
     * @param store - 全局状态存储
     */
    bindStore(store: Store): void {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("viewport");
        this.watchForDirty("frozen");
        this.watchForDirty("frozenOffset");
    }

    /**
     * 获取关联的工作表实例
     */
    get sheet(): Sheet | null {
        return (this.#cacheManager as any)?.sheet || null;
    }

    /**
     * 获取当前选中的图表 ID
     */
    get selectedChartId(): string | null {
        return this.#selectedChartId;
    }

    /**
     * 设置当前选中的图表 ID
     *
     * 当选中状态发生变化时：
     * - 更新内部状态
     * - 标记层为脏（触发重绘以显示选择框）
     */
    set selectedChartId(id: string | null) {
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
     * @param ctx - Canvas 2D 渲染上下文
     * @param sheet - 当前工作表
     * @param viewport - 视口坐标转换器
     * @param options - 渲染选项
     * @param options.viewW - 视口宽度（像素）
     * @param options.viewH - 视口高度（像素）
     */
    render(ctx: CanvasRenderingContext2D, sheet: Sheet, viewport: ViewportTransform | null, options: { viewW?: number; viewH?: number } = {}): void {
        if (!sheet || !(sheet as any).chartManager) return;

        const charts: ChartModel[] = (sheet as any).chartManager.getAll();
        if (charts.length === 0) return;

        const vt = this.#resolveViewport(sheet, viewport);
        if (!vt) return;

        const viewW = options.viewW || 0;
        const viewH = options.viewH || 0;

        // 可视区域过滤
        const visibleCharts: ChartModel[] = [];
        for (const chart of charts) {
            const bounds = chart.getBounds(vt);
            if (bounds.x + bounds.w < 0 || bounds.y + bounds.h < 0) continue;
            if (bounds.x > viewW || bounds.y > viewH) continue;
            visibleCharts.push(chart);
        }

        for (const chart of visibleCharts) {
            const isDirty = this.#cacheManager ? this.#cacheManager.isDirty(chart.id) : true;
            const cached = this.#cache.get(chart.id);

            // 调整大小中且存在旧缓存：显示模糊版本
            if (isDirty && this.#isResizing && cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, 0, 0, cached.canvas.width, cached.canvas.height, bounds.x, bounds.y, bounds.w, bounds.h);
                this.#pendingCharts.add(chart.id);
                continue;
            }

            // 缓存有效且非脏：直接绘制
            if (!isDirty && cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, 0, 0, cached.canvas.width, cached.canvas.height, bounds.x, bounds.y, bounds.w, bounds.h);
                continue;
            }

            // 未缓存：加入待渲染队列
            this.#pendingCharts.add(chart.id);
        }

        // 启动异步渲染
        if (this.#pendingCharts.size > 0 && !this.#isRendering) {
            this.#renderPendingCharts(sheet);
        }

        // 最终绘制所有可见图表
        for (const chart of visibleCharts) {
            const cached = this.#cache.get(chart.id);
            if (cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, 0, 0, cached.canvas.width, cached.canvas.height, bounds.x, bounds.y, bounds.w, bounds.h);
            }
        }

        // 绘制选择叠加层
        if (this.#selectedChartId) {
            const selectedChart = (sheet as any).chartManager.get(this.#selectedChartId);
            if (selectedChart) {
                this.#renderSelectionOverlay(ctx, selectedChart, vt);
            }
        }

        // 绘制悬停提示
        if (this.#hoverInfo && this.#hoverChartId) {
            const chart = (sheet as any).chartManager.get(this.#hoverChartId);
            if (chart && (chart as any).style.showTooltip !== false) {
                const bounds = chart.getBounds(vt);
                NativeChartRenderer.renderTooltip(ctx, this.#hoverInfo, bounds, (chart as any).style);
            }
        }
    }

    /**
     * 设置悬停提示信息
     *
     * 当鼠标悬停在图表数据点上时调用，用于显示 tooltip。
     * 只在信息实际变化时才标记脏，避免不必要的重绘。
     *
     * @param chartId - 悬停的图表 ID
     * @param info - 提示信息对象
     */
    setHoverInfo(chartId: string | null, info: HoverInfo | null): void {
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
     * @param isResizing - 是否处于调整大小状态
     */
    setIsResizing(isResizing: boolean): void {
        this.#isResizing = isResizing;
    }

    /**
     * 获取图表的离屏 Canvas 对象
     *
     * 用于导出、打印等场景。如果图表尚未渲染，返回 null。
     *
     * @param chartId - 图表 ID
     * @returns 离屏 Canvas 元素
     */
    async getChartCanvas(chartId: string): Promise<HTMLCanvasElement | null> {
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
     * @param chartId - 图表 ID
     * @param options - 导出选项
     * @param options.format - 图片格式，默认 'png'
     * @param options.quality - 图片质量（0-1），默认 1.0
     * @param options.scale - 缩放倍数，默认 1
     * @param options.rebuildHighQuality - 是否强制重建缓存，默认 false
     * @returns Data URL 字符串，失败返回 null
     */
    async getChartAsDataURL(chartId: string, options: ChartExportOptions = {}): Promise<string | null> {
        const { format = "png", quality = 1.0, scale = 1 } = options;

        let cached = this.#cache.get(chartId);

        if (!cached || options.rebuildHighQuality) {
            const sheet = this.sheet;
            if (sheet && (sheet as any).chartManager) {
                const chart = (sheet as any).chartManager.get(chartId);
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
            const ctx = scaledCanvas.getContext("2d")!;
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
     * @param chartId - 图表 ID
     * @param options - 导出选项（同 getChartAsDataURL）
     * @returns Blob 对象，失败返回 null
     */
    async getChartAsBlob(chartId: string, options: ChartExportOptions = {}): Promise<Blob | null> {
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
     * @param chartId - 要重建的图表 ID
     * @param scale - 缩放比例（用于高清导出），默认 1
     * @returns 渲染后的 Canvas，失败返回 null
     */
    async rebuildChartCache(chartId: string, scale: number = 1): Promise<HTMLCanvasElement | null> {
        return this.rebuildChartCacheWithSheet(chartId, scale, this.sheet);
    }

    /**
     * 使用指定的 Sheet 实例重建图表缓存
     *
     * 与 `rebuildChartCache` 不同，此方法接受外部传入的 sheet 参数，
     * 解决 ExportFilePlugin 等外部模块调用时 ChartLayer 内部 sheet 引用可能为空的问题。
     *
     * @param chartId - 要重建的图表 ID
     * @param scale - 缩放比例（用于高清导出），默认 1
     * @param externalSheet - 外部提供的 Sheet 实例
     * @returns 渲染后的 Canvas，失败返回 null
     */
    async rebuildChartCacheWithSheet(chartId: string, scale: number = 1, externalSheet: Sheet | null = null): Promise<HTMLCanvasElement | null> {
        const sheet = externalSheet || this.sheet;

        if (!sheet || !(sheet as any).chartManager) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_REBUILD_FAILED, "sheet 或 chartManager 不存在");
            return null;
        }

        const chart = (sheet as any).chartManager.get(chartId);
        if (!chart) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_REBUILD_FAILED, "图表不存在", { chartId });
            return null;
        }

        try {
            if (scale > 1) {
                return await this.#renderToHighResCache(chart, sheet, scale);
            }

            await this.#renderToCache(chart, sheet);
            const entry = this.#cache.get(chart.id);
            return entry?.canvas || null;
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.CHART_CACHE_REBUILD_FAILED, `Failed to rebuild cache for chart ${chartId}`, {
                chartId,
                error: error.message,
            });
            return null;
        }
    }

    /**
     * @private 私有方法 - 将图表渲染到高分辨率离屏缓存
     *
     * 参考 ECharts 的高清导出方案：在物理像素级别直接渲染，
     * 不使用 ctx.scale() 避免拉伸模糊。
     *
     * 核心原理：
     * 1. 创建 width×scale × height×scale 物理像素的 Canvas
     * 2. 所有坐标、尺寸、字体都按 scale 放大后直接绘制
     * 3. 文字以实际物理像素渲染，确保清晰锐利
     *
     * @param chart - 图表模型
     * @param sheet - 工作表
     * @param scale - 像素比（如 2 表示双倍分辨率）
     * @returns 高分辨率 Canvas
     */
    async #renderToHighResCache(chart: ChartModel, sheet: Sheet, scale: number): Promise<HTMLCanvasElement | null> {
        try {
            const width = chart.width;
            const height = chart.height;

            const canvas = document.createElement("canvas");
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);

            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("无法创建 2D Context");

            const renderer = ChartRendererFactory.getRenderer(chart.type);
            if (!renderer) {
                errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, "渲染器不存在", { type: chart.type });
                return null;
            }

            const data = await this.#dataExtractor.extract(chart, sheet);
            if (!data || !(data as any).data || (data as any).data.length === 0) {
                errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, "数据无效");
                return null;
            }

            const plotArea = {
                x: PADDING.left * scale,
                y: PADDING.top * scale,
                w: (width - PADDING.left - PADDING.right) * scale,
                h: (height - PADDING.top - PADDING.bottom) * scale,
            };

            const highResStyle = this.#createHighResStyle((chart as any).style, scale);

            (renderer as any).renderWithPixelRatio(ctx, chart, data, plotArea, highResStyle, scale);

            return canvas;
        } catch (e: any) {
            errorHandler.error(ERROR_CODE.CHART_RENDER_ERROR, "高清图表渲染异常", { error: e.message || e });
            return null;
        }
    }

    /**
     * @private 私有方法 - 创建高分辨率样式配置
     *
     * 将原始样式中的数值型配置按 scale 放大，
     * 用于在高分辨率 Canvas 上正确渲染。
     *
     * @param style - 原始样式配置
     * @param scale - 像素比
     * @returns 高分辨率样式配置
     */
    #createHighResStyle(style: Record<string, unknown> | null, scale: number): Record<string, unknown> | null {
        if (!style) return style;
        return { ...style };
    }

    /**
     * 获取与选中区域相交的图表列表
     *
     * 用于复制/粘贴、删除等批量操作时的范围检测。
     * 通过估算图表占据的行列范围进行碰撞检测。
     *
     * @param selection - 选区对象
     * @returns 相交的图表数组
     */
    getChartsInSelection(selection: SelectionRange): ChartModel[] {
        if (!this.sheet || !(this.sheet as any).chartManager) return [];

        const charts: ChartModel[] = (this.sheet as any).chartManager.getAll();
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
     * @returns 图表数组
     */
    getAllCharts(): ChartModel[] {
        return (this.sheet as any)?.chartManager?.getAll() || [];
    }

    /**
     * @private 私有方法 - 深度比较两个 tooltip 信息对象是否相等
     *
     * 用于避免不必要的重绘：只有当 tooltip 内容真正改变时才更新。
     *
     * @param a - 第一个 tooltip 信息
     * @param b - 第二个 tooltip 信息
     * @returns 是否相等
     */
    #isEqual(a: HoverInfo | null, b: HoverInfo | null): boolean {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.category === b.category && a.seriesName === b.seriesName && a.value === b.value;
    }

    /**
     * @private 私有方法 - 解析视口转换器（智能降级策略）
     *
     * 正常情况下，viewport 参数由 LayerCompositor 传入。
     * 但在某些降级场景（如独立调用 render 方法）可能缺失，
     * 此时基于 sheet 的滚动状态创建临时 VT 实例。
     *
     * @param sheet - 工作表
     * @param viewport - 传入的视口
     * @returns 视口转换器实例，创建失败返回 null
     */
    #resolveViewport(sheet: Sheet, viewport: ViewportTransform | null): ViewportTransform | null {
        if (viewport) return viewport;

        const scrollX = (sheet as any).scrollX ?? 0;
        const scrollY = (sheet as any).scrollY ?? 0;

        try {
            return new ViewportTransform(sheet, scrollX, scrollY);
        } catch (e: any) {
            errorHandler.warn(ERROR_CODE.CHART_VIEWPORT_TRANSFORM_FAILED, "无法创建视口转换器", { message: e.message });
            return null;
        }
    }

    /**
     * @private 私有方法 - 绘制图表选择叠加层
     *
     * 在选中的图表周围绘制：
     * - 虚线边框（表示选中状态）
     * - 8个调整大小的手柄（四角+四边中点）
     *
     * @param ctx - Canvas 上下文
     * @param chart - 选中的图表
     * @param vt - 视口转换器
     */
    #renderSelectionOverlay(ctx: CanvasRenderingContext2D, chart: ChartModel, vt: ViewportTransform): void {
        const b = chart.getBounds(vt);
        if (!b) return;

        ctx.save();

        ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR || "#4472C4";
        ctx.lineWidth = CONFIG.CHART_SELECTION_BORDER_WIDTH || 1.5;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN || [5, 3]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);

        // 绘制 8 个调整手柄
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
     * @private 私有方法 - 计算8个调整手柄的位置
     *
     * 返回图表边界框的8个关键位置点：
     * - 四角：nw, ne, sw, se
     * - 四边中点：n, s, e, w
     *
     * @param b - 边界框 {x, y, w, h}
     * @returns 手柄位置映射
     */
    #getHandlePositions(b: { x: number; y: number; w: number; h: number }): HandlePositions {
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
     * @private 私有方法 - 异步渲染所有待处理的图表
     *
     * 执行机制：
     * 1. **防并发**：通过 #isRendering 标志确保同时只有一个渲染任务
     * 2. **快照队列**：取出当前的 pendingCharts 并清空，避免无限循环
     * 3. **逐个渲染**：按顺序渲染每个图表到离屏 Canvas
     * 4. **清理标记**：渲染完成后将图表标记为 clean
     * 5. **递归处理**：如果在渲染过程中有新图表加入队列，递归处理
     *
     * @param sheet - 工作表
     */
    async #renderPendingCharts(sheet: Sheet): Promise<void> {
        if (this.#isRendering) return;
        this.#isRendering = true;

        const pendingIds = Array.from(this.#pendingCharts);
        this.#pendingCharts.clear();

        for (const chartId of pendingIds) {
            if (this.#pendingCharts.has(chartId)) continue;

            const chart = (sheet as any).chartManager?.get(chartId);
            if (!chart) continue;

            await this.#renderToCache(chart, sheet);

            if (this.#cacheManager) {
                this.#cacheManager.markClean(chartId);
            }
        }

        this.#isRendering = false;
        this.#isResizing = false;
        this.markDirty();

        if (typeof (this as any).onContentReady === "function") {
            (this as any).onContentReady();
        }

        if (this.#pendingCharts.size > 0) {
            this.#renderPendingCharts(sheet);
        }
    }

    /**
     * @private 私有方法 - 将单个图表渲染到离屏缓存
     *
     * 渲染流程：
     * 1. 获取/创建缓存条目
     * 2. 清空画布
     * 3. 获取渲染器
     * 4. 提取数据
     * 5. 计算绘图区
     * 6. 执行渲染
     * 7. 缓存数据
     *
     * @param chart - 图表模型
     * @param sheet - 工作表
     */
    async #renderToCache(chart: ChartModel, sheet: Sheet): Promise<void> {
        try {
            const entry = this.#cache.getOrCreate(chart.id, chart.width, chart.height);
            entry.ctx.clearRect(0, 0, chart.width, chart.height);

            const renderer = ChartRendererFactory.getRenderer(chart.type);
            if (!renderer) return;

            const data = await this.#dataExtractor.extract(chart, sheet);
            if (!data || !(data as any).data || (data as any).data.length === 0) return;

            const plotArea = {
                x: PADDING.left,
                y: PADDING.top,
                w: chart.width - PADDING.left - PADDING.right,
                h: chart.height - PADDING.top - PADDING.bottom,
            };

            (renderer as any).render(entry.ctx, chart, data, plotArea, (chart as any).style);
            (chart as any)._cachedData = data;
        } catch (e: any) {
            errorHandler.error(ERROR_CODE.CHART_RENDER_ERROR, "图表渲染异常", { error: e });
        }
    }

    /**
     * 坐标点击测试（Hit Test）
     *
     * 检测给定的屏幕坐标是否落在某个图表上。
     * 从顶层图表开始向下遍历（后绘制的在上面）。
     *
     * @param px - 屏幕 X 坐标（像素）
     * @param py - 屏幕 Y 坐标（像素）
     * @param sheet - 工作表
     * @param vt - 视口转换器
     * @returns 命中信息，未命中返回 null
     */
    hitTest(
        px: number,
        py: number,
        sheet: Sheet,
        vt: ViewportTransform,
    ): { type: string; chartId: string; chart: ChartModel; bounds: { x: number; y: number; w: number; h: number }; vt: ViewportTransform } | null {
        if (!sheet || !(sheet as any).chartManager) return null;
        const charts: ChartModel[] = (sheet as any).chartManager.getAll();

        for (let i = charts.length - 1; i >= 0; i--) {
            const chart = charts[i];
            if ((chart as any).containsPoint(px, py, vt)) {
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
     * @param chartId - 图表 ID
     */
    invalidateChart(chartId: string): void {
        this.#cacheManager?.invalidateAll();
        this.#pendingCharts.add(chartId);
        this.markDirty();
    }

    /**
     * 使所有图表数据缓存失效
     *
     * 在工作表数据批量变更时调用（如导入数据、撤销操作等）。
     */
    invalidateChartData(): void {
        this.#cacheManager?.invalidateAll();
        this.markDirty();
    }

    /**
     * 移除指定图表的缓存
     *
     * 在图表删除时调用，释放内存资源。
     *
     * @param chartId - 要移除的图表 ID
     */
    removeChartCache(chartId: string): void {
        this.#cache.remove(chartId);
        this.#pendingCharts.delete(chartId);
        this.markDirty();
    }

    /**
     * 标记层为脏（需重绘）
     *
     * 重写基类方法，可在未来添加自定义逻辑（如节流、批处理等）。
     */
    markDirty(): void {
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
    destroy(): void {
        this.#cache.destroy();
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#dataExtractor.destroy();
        this.#pendingCharts.clear();
        super.destroy();
    }
}
