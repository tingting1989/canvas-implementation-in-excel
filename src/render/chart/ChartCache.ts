/**
 * @fileoverview 图表离屏 Canvas 缓存
 * @description 为每个图表实例维护一个离屏 Canvas 缓存条目，
 *              避免每帧重新创建 Canvas，提升渲染性能。
 *              支持按 chartId 创建/获取/失效/移除缓存。
 * @module render/chart/ChartCache
 */

import type { CacheEntry } from "./types";

/**
 * 图表离屏 Canvas 缓存
 *
 * 以 chartId 为键管理离屏 Canvas 缓存条目。
 * 当图表尺寸或设备像素比变化时，自动重建缓存 Canvas。
 * 离屏 Canvas 按 devicePixelRatio 缩放，确保高清渲染。
 *
 * @class ChartCache
 */
export class ChartCache {
    /**
     * @private 私有字段 - 缓存注册表
     *
     * chartId → CacheEntry 的映射，每个图表实例对应一个离屏 Canvas。
     */
    #caches: Map<string, CacheEntry> = new Map();

    /**
     * @private 私有字段 - 设备像素比
     *
     * 从 window.devicePixelRatio 获取，用于离屏 Canvas 的物理像素缩放。
     */
    #dpr: number = 1;

    /**
     * 构造缓存管理器
     *
     * 初始化设备像素比，非浏览器环境默认为 1。
     */
    constructor() {
        this.#dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    }

    /**
     * 获取或创建缓存条目
     *
     * 若缓存命中且物理尺寸匹配（width × dpr, height × dpr），直接返回现有条目。
     * 否则创建新的离屏 Canvas，设置物理尺寸和逻辑尺寸，并按 dpr 缩放上下文。
     *
     * @param chartId - 图表实例唯一标识
     * @param width - 逻辑宽度（CSS 像素）
     * @param height - 逻辑高度（CSS 像素）
     * @returns 缓存条目，包含 canvas、ctx、width、height
     */
    getOrCreate(chartId: string, width: number, height: number): CacheEntry {
        let entry = this.#caches.get(chartId);

        // 物理像素尺寸（考虑设备像素比）
        const pw = Math.round(width * this.#dpr);
        const ph = Math.round(height * this.#dpr);

        // 缓存命中：物理尺寸匹配则复用
        if (entry && entry.canvas.width === pw && entry.canvas.height === ph) {
            return entry;
        }

        // 缓存未命中：创建新的离屏 Canvas
        const canvas = document.createElement("canvas");
        canvas.width = pw;
        canvas.height = ph;

        // 设置逻辑尺寸（CSS 像素），确保绘制坐标正确
        if (canvas.style) {
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        }

        const ctx = canvas.getContext("2d")!;
        // 按 dpr 缩放上下文，使绘制坐标保持逻辑像素单位
        ctx.scale(this.#dpr, this.#dpr);

        entry = { canvas, ctx, width, height };
        this.#caches.set(chartId, entry);

        return entry;
    }

    /**
     * 获取指定图表的缓存条目
     *
     * @param chartId - 图表实例唯一标识
     * @returns 缓存条目，不存在返回 null
     */
    get(chartId: string): CacheEntry | null {
        return this.#caches.get(chartId) || null;
    }

    /**
     * 使指定图表的缓存失效
     *
     * 清除 Canvas 内容，但保留缓存条目（不删除 Canvas 对象），
     * 下次渲染时可直接复用同一 Canvas。
     *
     * @param chartId - 图表实例唯一标识
     */
    invalidate(chartId: string): void {
        const entry = this.#caches.get(chartId);
        if (entry) {
            entry.ctx.clearRect(0, 0, entry.width, entry.height);
        }
    }

    /**
     * 移除指定图表的缓存条目
     *
     * 将 Canvas 尺寸归零以释放内存，并从注册表中删除条目。
     *
     * @param chartId - 图表实例唯一标识
     */
    remove(chartId: string): void {
        const entry = this.#caches.get(chartId);
        if (entry) {
            // 将 Canvas 尺寸归零以释放 GPU 内存
            entry.canvas.width = 0;
            entry.canvas.height = 0;
            this.#caches.delete(chartId);
        }
    }

    /**
     * 销毁所有缓存
     *
     * 将所有 Canvas 尺寸归零并清空注册表。
     * 通常在组件卸载或工作簿关闭时调用。
     */
    destroy(): void {
        this.#caches.forEach((entry) => {
            entry.canvas.width = 0;
            entry.canvas.height = 0;
        });
        this.#caches.clear();
    }
}
