import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 图层基类 (BaseLayer)
 * 所有渲染图层的抽象基类。采用离屏渲染策略：
 *   - 每个 Layer 自行创建和管理离屏 Canvas（initCanvas）
 *  - Layer 在 render(ctx) 中只负责往传入的 ctx 上绘制内容
 *  - LayerCompositor 调用各层 initCanvas 确保尺寸一致，
 *     并按 z-index 顺序将各层离屏 Canvas 合成到主画布
 * 所有渲染图层的抽象基类，提供统一的接口和生命周期管理。
 * 采用 Canvas 离屏渲染策略：每个 Layer 拥有独立的离屏 canvas，
 * 最终由 LayerCompositor 合成到主画布。
 *
 * ## 设计原则
 * 1. 单一职责：每个 Layer 只负责一类视觉元素的渲染
 * 2. 脏标记机制：只在需要时重绘，避免不必要的性能开销
 * 3. Z-index 排序：通过 zIndex 控制图层叠加顺序
 * 4. 可独立测试：每个 Layer 可以脱离 RenderEngine 单独测试
 * 5. 响应式集成：支持 ReactiveStore 自动触发脏标记
 */
export class BaseLayer {
    #watchers = new Map();
    #store = null;

    constructor(name, zIndex, options = {}) {
        if (!name || typeof name !== "string") {
            throw new Error(`[BaseLayer] name must be a non-empty string`);
        }
        if (typeof zIndex !== "number") {
            throw new Error(`[BaseLayer] zIndex must be a number`);
        }

        this.name = name;
        this.zIndex = zIndex;
        this.dirty = true;
        this.canvas = null;
        this.ctx = null;
        this.enabled = true;
        this.renderCount = 0;
        this.offscreen = options.offscreen ?? true;
    }

    /**
     * 绑定到ReactiveStore（启用自动依赖追踪）
     *
     * @param {import('../state/ReactiveStore.js').ReactiveStore} store - 响应式存储实例
     */
    bindStore(store) {
        this.#store = store;
    }

    getStore() {
        return this.#store;
    }

    /**
     * 手动注册状态监听器
     *
     * @param {string} path - 状态路径（如 'scroll.x' 或 'selections[0].row'）
     * @param {Function} callback - 变化时的回调函数
     * @returns {Function} 取消监听的函数
     */
    watch(path, callback) {
        if (!this.#store) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[${this.name}] Cannot watch: no store bound. Call bindStore() first.`);
            return () => {};
        }

        const unwatch = this.#store.watch(path, (newVal, oldVal) => {
            this.markDirty();
            callback(newVal, oldVal);
        });

        if (!this.#watchers.has(path)) {
            this.#watchers.set(path, []);
        }
        this.#watchers.get(path).push({ callback, unwatch });

        return unwatch;
    }

    /**
     * 注册仅触发脏标记的状态监听器
     *
     * 当状态路径的值发生变化时，仅将图层标记为脏（markDirty），
     * 不执行任何额外回调。适用于大多数图层只需在状态变化时
     * 触发重绘而无需处理变化值的场景。
     *
     * @param {string} path - 状态路径（如 'scroll' 或 'frozenOffset'）
     * @returns {Function} 取消监听的函数
     */
    watchForDirty(path) {
        return this.watch(path, () => {});
    }

    /**
     * 清除所有手动注册的watcher
     */
    clearWatchers() {
        for (const [, watchers] of this.#watchers) {
            for (const { unwatch } of watchers) {
                unwatch();
            }
        }
        this.#watchers.clear();
    }

    /**
     * 初始化离屏Canvas
     *
     * @param {number} width - Canvas宽度（CSS像素）
     * @param {number} height - Canvas高度（CSS像素）
     */
    initCanvas(width, height) {
        if (!this.offscreen) return;

        if (!this.canvas) {
            this.canvas = document.createElement("canvas");
            this.ctx = this.canvas.getContext("2d");
        }

        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const physicalWidth = Math.round(width * dpr);
        const physicalHeight = Math.round(height * dpr);

        if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
            this.canvas.width = physicalWidth;
            this.canvas.height = physicalHeight;
            if (this.canvas.style) {
                this.canvas.style.width = `${width}px`;
                this.canvas.style.height = `${height}px`;
            }
            this.markDirty();
        }
    }

    /**
     * 渲染方法（子类必须实现）
     *
     * @abstract
     * @param {CanvasRenderingContext2D} ctx - 离屏Canvas的2D上下文
     * @param {object} sheet - 当前工作表
     * @param {object} viewport - 视口坐标转换器
     * @param {object} options - 渲染选项
     */
    render(ctx, sheet, viewport, options = {}) {
        throw new Error(`[BaseLayer] ${this.name}: render() must be implemented by subclass`);
    }

    markDirty() {
        this.dirty = true;
    }

    clearDirty() {
        this.dirty = false;
    }

    enable() {
        this.enabled = true;
        this.markDirty();
    }

    disable() {
        this.enabled = false;
    }

    destroy() {
        this.clearWatchers();

        if (this.canvas) {
            this.canvas.width = 0;
            this.canvas.height = 0;
            this.canvas = null;
            this.ctx = null;
        }

        this.#store = null;
        this.dirty = true;
        this.renderCount = 0;
    }

    getDebugInfo() {
        return {
            name: this.name,
            zIndex: this.zIndex,
            enabled: this.enabled,
            dirty: this.dirty,
            renderCount: this.renderCount,
            hasCanvas: !!this.canvas,
            canvasSize: this.canvas ? { w: this.canvas.width, h: this.canvas.height } : null,
            watcherCount: Array.from(this.#watchers.values()).reduce((sum, arr) => sum + arr.length, 0),
            hasStore: !!this.#store,
        };
    }
}