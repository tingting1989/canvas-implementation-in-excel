import { errorHandler } from "../core/ErrorHandler.js";
import { BaseLayer } from "./BaseLayer.js";
import { CONFIG } from "../constants/config.js";
import { ERROR_CODE } from "../constants/errorCodes.js";
import type { Sheet } from "../workbook/Sheet.js";
import type { ReactiveStore } from "../state/ReactiveStore.js";
import type { ViewportTransform } from "./ViewportTransform.js";

/** 渲染统计信息 */
interface ComposeStats {
    totalLayers: number;
    dirtyLayers: number;
    cachedLayers: number;
    frameTime: number;
}

/** 累计性能统计 */
interface PerformanceStats {
    totalRenders: number;
    dirtyRenders: number;
    cacheHits: number;
    lastFrameTime: number;
    avgFrameTime: number;
}

/**
 * 图层合成器 (LayerCompositor)
 *
 * 渲染管线的核心调度中心，负责：
 * 1. 管理所有图层的生命周期（注册、排序、销毁）
 * 2. 按Z-index顺序协调各图层的离屏渲染
 * 3. 将各层合成到主Canvas
 * 4. 提供脏标记优化（只重绘变化的层）
 * 5. 性能监控与调试支持
 */
export class LayerCompositor {
    /** 已注册的图层映射表（按名称索引） */
    layers: Map<string, BaseLayer>;

    /** @private 私有字段 - 按 zIndex 排序后的图层列表缓存 */
    _sortedLayers: BaseLayer[];

    /** @private 私有字段 - 是否需要重新排序 */
    _needsSort: boolean;

    /** 累计性能统计数据 */
    stats: PerformanceStats;

    constructor() {
        this.layers = new Map();
        this._sortedLayers = [];
        this._needsSort = true;

        this.stats = {
            totalRenders: 0,
            dirtyRenders: 0,
            cacheHits: 0,
            lastFrameTime: 0,
            avgFrameTime: 0,
        };
    }

    /**
     * 注册新图层
     *
     * @param layer - 图层实例
     */
    register(layer: BaseLayer): void {
        if (!(layer instanceof BaseLayer)) {
            errorHandler.throw(ERROR_CODE.LAYER_INVALID_INSTANCE, `[LayerCompositor] layer must be an instance of BaseLayer`);
        }
        if (this.layers.has(layer.name)) {
            errorHandler.throw(ERROR_CODE.LAYER_ALREADY_REGISTERED, `[LayerCompositor] layer "${layer.name}" already registered`);
        }

        this.layers.set(layer.name, layer);
        this._needsSort = true;
    }

    /**
     * 注销图层并销毁其资源
     *
     * @param name - 图层名称
     * @returns 是否成功注销
     */
    unregister(name: string): boolean {
        const layer = this.layers.get(name);
        if (!layer) return false;

        layer.destroy();
        this.layers.delete(name);
        this._needsSort = true;
        return true;
    }

    /**
     * 获取已注册的图层
     *
     * @param name - 图层名称
     * @returns 图层实例或 undefined
     */
    getLayer(name: string): BaseLayer | undefined {
        return this.layers.get(name);
    }

    /**
     * 获取按zIndex排序的图层列表
     *
     * @returns 排序后的图层数组
     */
    getSortedLayers(): BaseLayer[] {
        if (this._needsSort) {
            this._sortedLayers = Array.from(this.layers.values())
                .filter((layer) => layer.enabled)
                .sort((a, b) => a.zIndex - b.zIndex);
            this._needsSort = false;
        }
        return this._sortedLayers;
    }

    /**
     * 批量将所有图层绑定到ReactiveStore
     *
     * @param store - 响应式存储实例
     */
    bindAllLayers(store: ReactiveStore): void {
        for (const [, layer] of this.layers) {
            if (typeof (layer as any).bindStore === "function") {
                (layer as any).bindStore(store);
            }
        }
    }

    /**
     * 标记所有图层为脏
     */
    markAllDirty(): void {
        for (const [, layer] of this.layers) {
            layer.markDirty();
        }
    }

    /**
     * 核心方法：合成所有图层到主Canvas
     *
     * @param mainCtx - 主Canvas的2D上下文
     * @param sheet - 当前工作表
     * @param viewport - 视口坐标转换器
     * @param viewW - 主视口宽度
     * @param viewH - 主视口高度
     * @param options - 额外选项
     * @returns 渲染统计信息
     */
    compose(
        mainCtx: CanvasRenderingContext2D,
        sheet: Sheet,
        viewport: ViewportTransform,
        viewW: number,
        viewH: number,
        options: Record<string, unknown> = {},
    ): ComposeStats {
        const startTime = performance.now();
        this._needsSort = true;
        const sortedLayers = this.getSortedLayers();
        let dirtyCount = 0;
        let cacheHitCount = 0;

        const renderOptions = {
            ...options,
            viewW,
            viewH,
            layers: sortedLayers,
        };

        for (const layer of sortedLayers) {
            try {
                if (layer.offscreen) {
                    layer.initCanvas(viewW, viewH);

                    if (layer.dirty) {
                        const dpr = CONFIG.DPR;
                        layer.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
                        layer.ctx!.clearRect(0, 0, viewW, viewH);

                        layer.render(layer.ctx!, sheet, viewport, renderOptions);
                        layer.clearDirty();
                        dirtyCount++;
                    } else {
                        cacheHitCount++;
                    }

                    if ((mainCtx as any).drawImage) {
                        const srcW = layer.canvas!.width;
                        const srcH = layer.canvas!.height;
                        mainCtx.drawImage(layer.canvas!, 0, 0, srcW, srcH, 0, 0, viewW, viewH);
                    }
                } else {
                    if (layer.dirty) {
                        mainCtx.save();
                        layer.render(mainCtx, sheet, viewport, renderOptions);
                        mainCtx.restore();
                        layer.clearDirty();
                        dirtyCount++;
                    }
                }
            } catch (error) {
                errorHandler.error(ERROR_CODE.LAYER_RENDER_ERROR, `[LayerCompositor] Error rendering layer "${layer.name}":`, error);
            }
        }

        const frameTime = performance.now() - startTime;
        this.stats.totalRenders++;
        this.stats.dirtyRenders += dirtyCount;
        this.stats.cacheHits += cacheHitCount;
        this.stats.lastFrameTime = frameTime;
        this.stats.avgFrameTime = (this.stats.avgFrameTime * (this.stats.totalRenders - 1) + frameTime) / this.stats.totalRenders;

        return {
            totalLayers: sortedLayers.length,
            dirtyLayers: dirtyCount,
            cachedLayers: cacheHitCount,
            frameTime: Math.round(frameTime * 100) / 100,
        };
    }

    /**
     * 获取所有图层的调试信息
     *
     * @returns 调试信息数组
     */
    getDebugInfo(): ReturnType<BaseLayer["getDebugInfo"]>[] {
        return this.getSortedLayers().map((layer) => layer.getDebugInfo());
    }

    /**
     * 销毁所有图层资源
     */
    destroyAll(): void {
        for (const [, layer] of this.layers) {
            layer.destroy();
        }
        this.layers.clear();
        this._sortedLayers = [];
        this._needsSort = true;
    }
}
