import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../core/ErrorHandler.js";

import { BaseLayer } from "./BaseLayer.js";
import { CONFIG } from "../constants/config.js";

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
     * @param {BaseLayer} layer - 图层实例
     */
    register(layer) {
        if (!(layer instanceof BaseLayer)) {
            throw new Error("[LayerCompositor] layer must be an instance of BaseLayer");
        }
        if (this.layers.has(layer.name)) {
            throw new Error(`[LayerCompositor] layer "${layer.name}" already registered`);
        }

        this.layers.set(layer.name, layer);
        this._needsSort = true;
    }

    /**
     * 注销图层并销毁其资源
     *
     * @param {string} name - 图层名称
     * @returns {boolean} 是否成功注销
     */
    unregister(name) {
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
     * @param {string} name - 图层名称
     * @returns {BaseLayer|undefined}
     */
    getLayer(name) {
        return this.layers.get(name);
    }

    /**
     * 获取按zIndex排序的图层列表
     *
     * @returns {BaseLayer[]}
     */
    getSortedLayers() {
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
     * @param {import('../state/ReactiveStore.js').ReactiveStore} store - 响应式存储实例
     */
    bindAllLayers(store) {
        for (const [, layer] of this.layers) {
            if (typeof layer.bindStore === "function") {
                layer.bindStore(store);
            }
        }
    }

    /**
     * 标记所有图层为脏
     */
    markAllDirty() {
        for (const [, layer] of this.layers) {
            layer.markDirty();
        }
    }

    /**
     * 核心方法：合成所有图层到主Canvas
     *
     * @param {CanvasRenderingContext2D} mainCtx - 主Canvas的2D上下文
     * @param {object} sheet - 当前工作表
     * @param {object} viewport - 视口坐标转换器
     * @param {number} viewW - 主视口宽度
     * @param {number} viewH - 主视口高度
     * @param {object} [options] - 额外选项
     * @returns {object} 渲染统计信息
     */
    compose(mainCtx, sheet, viewport, viewW, viewH, options = {}) {
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
                        layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                        layer.ctx.clearRect(0, 0, viewW, viewH);

                        layer.render(layer.ctx, sheet, viewport, renderOptions);
                        layer.clearDirty();
                        dirtyCount++;
                    } else {
                        cacheHitCount++;
                    }

                    if (mainCtx.drawImage) {
                        const srcW = layer.canvas.width;
                        const srcH = layer.canvas.height;
                        mainCtx.drawImage(layer.canvas, 0, 0, srcW, srcH, 0, 0, viewW, viewH);
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
                errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `[LayerCompositor] Error rendering layer "${layer.name}":`, error);
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
     * @returns {object[]}
     */
    getDebugInfo() {
        return this.getSortedLayers().map((layer) => layer.getDebugInfo());
    }

    /**
     * 销毁所有图层资源
     */
    destroyAll() {
        for (const [, layer] of this.layers) {
            layer.destroy();
        }
        this.layers.clear();
        this._sortedLayers = [];
        this._needsSort = true;
    }
}