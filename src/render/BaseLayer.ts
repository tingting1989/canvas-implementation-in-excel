import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";
import type { ReactiveStore } from "../state/ReactiveStore.js";
import type { Sheet } from "../workbook/Sheet.js";
import type { ViewportTransform } from "./ViewportTransform.js";

/**
 * 图层基类 (BaseLayer)
 *
 * 所有渲染图层的抽象基类，提供统一的接口和生命周期管理。
 * 支持两种渲染模式，由 offscreen 属性控制：
 *
 * ## 离屏渲染模式 (offscreen = true)
 * - Layer 拥有独立的离屏 Canvas（initCanvas 创建）
 * - Layer 在 render(ctx) 中绘制到离屏 Canvas
 * - LayerCompositor 通过 drawImage 将离屏 Canvas 合成到主画布
 * - 适用于重渲染层（如 TileLayer、FrozenLayer），可利用瓦片缓存减少重绘
 *
 * ## 直接渲染模式 (offscreen = false)
 * - Layer 不创建离屏 Canvas
 * - LayerCompositor 在 compose() 中直接传入主 Canvas 的 ctx
 * - Layer 在 render(ctx) 中直接绘制到主画布
 * - 适用于轻量级层（如 SelectionLayer、InteractionLayer、HeaderLayer），
 *   避免离屏 Canvas 的内存开销和合成开销
 *
 * ## 生命周期
 * 1. 构造 → bindStore() → watch/watchForDirty() 注册依赖
 * 2. 每帧：markDirty() → render() → clearDirty()
 * 3. 销毁 → destroy() 清理所有资源
 *
 * ## 设计原则
 * 1. 单一职责：每个 Layer 只负责一类视觉元素的渲染
 * 2. 脏标记机制：只在需要时重绘，避免不必要的性能开销
 * 3. Z-index 排序：通过 zIndex 控制图层叠加顺序
 * 4. 可独立测试：每个 Layer 可以脱离 RenderEngine 单独测试
 * 5. 响应式集成：支持 ReactiveStore 自动触发脏标记
 * 6. 渲染模式选择：重层用离屏缓存，轻层直接渲染，平衡性能与内存
 */
export class BaseLayer {
    /** @private 私有字段 - 已注册的 watcher 列表，按路径分组 */
    #watchers: Map<string, Array<{ callback: (...args: unknown[]) => void; unwatch: () => void }>> = new Map();

    /** @private 私有字段 - 绑定的响应式存储实例 */
    #store: ReactiveStore | null = null;

    /** 图层名称（用于调试和日志，必须非空） */
    name: string;

    /** 图层叠加顺序 */
    zIndex: number;

    /** 脏标记，为 true 时表示需要重新渲染 */
    dirty: boolean;

    /** 离屏 Canvas（仅 offscreen 模式） */
    canvas: HTMLCanvasElement | null;

    /** 离屏 Canvas 2D 上下文 */
    ctx: CanvasRenderingContext2D | null;

    /** 图层是否启用 */
    enabled: boolean;

    /** 累计渲染次数（调试用） */
    renderCount: number;

    /** 是否使用离屏 Canvas 渲染模式 */
    offscreen: boolean;

    /**
     * @param name - 图层名称（用于调试和日志，必须非空）
     * @param zIndex - 图层叠加顺序（值越大越靠上）
     * @param options - 配置选项
     * @param options.offscreen - 是否使用离屏 Canvas 渲染模式
     */
    constructor(name: string, zIndex: number, options: { offscreen?: boolean } = {}) {
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
     * 绑定到 ReactiveStore（启用自动依赖追踪）
     *
     * 绑定后，图层可通过 watch() / watchForDirty() 注册状态监听，
     * 当状态变化时自动触发脏标记和重绘。
     *
     * @param store - 响应式存储实例
     */
    bindStore(store: ReactiveStore): void {
        this.#store = store;
    }

    /**
     * 获取绑定的 ReactiveStore 实例
     *
     * @returns 响应式存储实例或 null
     */
    getStore(): ReactiveStore | null {
        return this.#store;
    }

    /**
     * 手动注册状态监听器
     *
     * 当指定路径的值变化时，自动将图层标记为脏，并执行回调函数。
     * 返回取消监听函数，调用后停止监听该路径。
     *
     * 注意：必须在 bindStore() 之后调用，否则会输出警告并返回空操作函数。
     *
     * @param path - 状态路径（如 'scroll.x' 或 'selection.activeRange'）
     * @param callback - 变化时的回调函数 (newVal, oldValue) => void
     * @returns 取消监听的函数
     */
    watch(path: string, callback: (newVal: unknown, oldVal: unknown) => void): () => void {
        if (!this.#store) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[${this.name}] Cannot watch: no store bound. Call bindStore() first.`);
            return () => {};
        }

        const unwatch = (this.#store as any).watch(path, (newVal: unknown, oldVal: unknown) => {
            this.markDirty();
            callback(newVal, oldVal);
        });

        if (!this.#watchers.has(path)) {
            this.#watchers.set(path, []);
        }
        this.#watchers.get(path)!.push({ callback, unwatch });

        return unwatch;
    }

    /**
     * 注册仅触发脏标记的状态监听器
     *
     * 当状态路径的值发生变化时，仅将图层标记为脏（markDirty），
     * 不执行任何额外回调。适用于大多数图层只需在状态变化时
     * 触发重绘而无需处理变化值的场景。
     *
     * @param path - 状态路径（如 'scroll' 或 'frozenOffset'）
     * @returns 取消监听的函数
     */
    watchForDirty(path: string): () => void {
        return this.watch(path, () => {});
    }

    /**
     * @private 私有方法 - 清除所有手动注册的 watcher
     *
     * 遍历所有已注册的 watcher 并逐一调用 unwatch() 取消监听，
     * 然后清空 #watchers 映射表。通常在 destroy() 中调用。
     */
    clearWatchers(): void {
        for (const [, watchers] of this.#watchers) {
            for (const { unwatch } of watchers) {
                unwatch();
            }
        }
        this.#watchers.clear();
    }

    /**
     * 初始化离屏 Canvas
     *
     * 仅在 offscreen 模式下生效。创建或复用离屏 Canvas，
     * 根据 DPR 设置物理像素尺寸，确保高清渲染。
     * 当尺寸发生变化时自动标记脏。
     *
     * @param width - Canvas 宽度（CSS 像素）
     * @param height - Canvas 高度（CSS 像素）
     */
    initCanvas(width: number, height: number): void {
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
     * 离屏模式下 ctx 为离屏 Canvas 的上下文，直接模式下 ctx 为主画布的上下文。
     * 子类在此方法中完成所有绘制操作。
     *
     * @abstract
     * @param ctx - Canvas 2D 上下文
     * @param sheet - 当前工作表
     * @param viewport - 视口坐标转换器
     * @param options - 渲染选项（如 scrollX, scrollY 等）
     * @throws 子类未实现时抛出错误
     */
    render(ctx: CanvasRenderingContext2D, sheet: Sheet, viewport: ViewportTransform, options: Record<string, unknown> = {}): void {
        throw new Error(`[BaseLayer] ${this.name}: render() must be implemented by subclass`);
    }

    /**
     * 将图层标记为脏
     *
     * 标记后，下一次 compose 时会重新调用 render()。
     * 通常在状态变化、尺寸变化、数据更新时调用。
     */
    markDirty(): void {
        this.dirty = true;
    }

    /**
     * 清除脏标记
     *
     * 通常在 render() 执行完毕后由 LayerCompositor 调用。
     */
    clearDirty(): void {
        this.dirty = false;
    }

    /**
     * 启用图层
     *
     * 启用后图层会参与渲染，并立即标记为脏以触发重绘。
     */
    enable(): void {
        this.enabled = true;
        this.markDirty();
    }

    /**
     * 禁用图层
     *
     * 禁用后图层不会参与渲染，但 watcher 仍然保留。
     * 如需完全释放资源，请调用 destroy()。
     */
    disable(): void {
        this.enabled = false;
    }

    /**
     * 销毁图层
     *
     * 清理所有 watcher、释放离屏 Canvas 资源、断开 Store 引用。
     * 销毁后的图层不可复用。
     */
    destroy(): void {
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

    /**
     * 获取图层调试信息
     *
     * 返回包含图层状态、渲染统计和资源使用情况的对象，
     * 用于开发调试和性能分析。
     *
     * @returns 调试信息对象
     */
    getDebugInfo(): {
        name: string;
        zIndex: number;
        enabled: boolean;
        dirty: boolean;
        renderCount: number;
        hasCanvas: boolean;
        canvasSize: { w: number; h: number } | null;
        watcherCount: number;
        hasStore: boolean;
    } {
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
