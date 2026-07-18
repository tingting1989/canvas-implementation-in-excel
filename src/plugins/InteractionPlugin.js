import { BasePlugin } from "./BasePlugin.js";
import { errorHandler, ERROR_CODE, ERROR_LEVEL } from "../core/ErrorHandler.js";

/**
 * 单元格交互插件
 *
 * 功能：
 * - 自动为支持交互的单元格类型注册鼠标事件
 * - 智能分发 mousemove/click/mouseleave 事件到对应的渲染器实例
 * - 统一管理悬停状态，避免手动编写重复的事件处理代码
 * - 支持调试模式和性能优化选项
 *
 * 支持的渲染器接口：
 * - handleHover(context, event) → boolean (是否需要重绘)
 * - handleClick(context, event) → any (返回值)
 * - handleMouseLeave(context) → void
 *
 * 使用方式：
 * ```js
 * // 方式 1：全局注册后加载
 * import { InteractionPlugin } from '@/plugins/InteractionPlugin.js';
 * PluginManager.register('interaction', InteractionPlugin);
 * workbook.loadPlugin('interaction', {
 *   debugMode: true,
 *   throttleMs: 16  // 限制重绘频率 (~60fps)
 * });
 *
 * // 方式 2：直接加载插件类
 * workbook.loadPluginClass(InteractionPlugin);
 *
 * // 之后只需定义支持交互的渲染器即可自动获得完整交互！
 * sheet.setColumnType(2, new StarRatingType({ maxStars: 5 }));
 * // 自动拥有：悬停预览、点击设置、移出清除等全部功能 ✨
 * ```
 */
export class InteractionPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "interaction";
    }

    /** 上次悬停的单元格位置 "row,col" */
    #lastHoveredCell = null;

    /** 节流定时器 ID */
    #throttleTimer = null;

    /** requestAnimationFrame ID */
    #rafId = null;

    /** 是否有待执行的渲染任务（用于合并重复请求） */
    #pendingRender = null;

    /** 上次触发重绘的时间戳（高精度） */
    #lastRenderTime = 0;

    /**
     * 初始化交互插件
     * 注册 Canvas 鼠标事件监听器，智能分发到单元格类型
     *
     * @param {object} options - 插件配置
     * @param {boolean} [options.debugMode=false] - 调试模式（输出详细日志）
     * @param {number} [options.throttleMs=0] - 重绘节流时间（毫秒），0 表示不限制
     * @param {boolean} [options.autoRender=true] - 是否在需要时自动调用 render()
     * @param {string[]} [options.supportedTypes=[]] - 仅处理指定类型的渲染器（空数组表示全部）
     */
    init(options = {}) {
        super.init(options);

        const canvas = this.renderEngine?.canvas;
        if (!canvas) {
            errorHandler.warn(ERROR_CODE.PLUGIN_INIT_FAILED, "InteractionPlugin: 无法获取 Canvas 元素");
            return;
        }

        this.#registerDOMEvents(canvas);
    }

    /**
     * 注册 DOM 事件监听器
     * @param {HTMLCanvasElement} canvas - Canvas 元素
     */
    #registerDOMEvents(canvas) {
        this.addDOMEvent(canvas, "mousemove", (event) => this.#handleMouseMove(event));
        this.addDOMEvent(canvas, "click", (event) => this.#handleClick(event));
        this.addDOMEvent(canvas, "mouseleave", () => this.#handleMouseLeave());
    }

    /**
     * 处理鼠标移动事件
     * 分发到对应单元格类型的 handleHover 方法
     *
     * ✅ 关键改进：当鼠标移动到新单元格时，主动清理旧单元格的悬停状态，
     * 解决快速移动时多个单元格同时显示悬停效果的问题。
     *
     * @param {MouseEvent} event - 鼠标事件对象
     */
    #handleMouseMove(event) {
        try {
            if (!this.enabled) return;

            const hitInfo = this.#hitTest(event);
            if (!hitInfo) {
                // ✅ 鼠标移出所有单元格区域，清理悬停状态
                this.#clearAllHoverStates();
                return;
            }

            const { row, col } = hitInfo;
            const currentCellKey = `${row},${col}`;
            const cellType = this.#getCellType(row, col);

            if (!cellType) {
                // ✅ 当前单元格无交互类型，清理悬停状态
                this.#clearAllHoverStates();
                return;
            }

            // ✅ 关键：检查是否移动到了新的单元格
            if (this.#lastHoveredCell && this.#lastHoveredCell !== currentCellKey) {
                // 鼠标从旧单元格移到了新单元格，先清理旧状态
                this.#clearPreviousHoverState(this.#lastHoveredCell);
            }

            const context = this.#createContext(row, col);

            if (typeof cellType.handleHover === "function") {
                const needsRedraw = cellType.handleHover(context, event);

                if (needsRedraw || !this.#lastHoveredCell) {
                    this.#lastHoveredCell = currentCellKey;

                    if (needsRedraw) {
                        this.#scheduleRender();
                    }
                }
            }
        } catch (error) {
            errorHandler.handle(ERROR_CODE.PLUGIN_RUNTIME_ERROR, `InteractionPlugin#handleMouseMove 错误: ${error.message}`, { error });
        }
    }

    /**
     * 清理上一个单元格的悬停状态
     *
     * ✅ 关键改进：直接通过渲染器的静态方法清理状态，
     * 不依赖实例的 #currentCellKey 属性（因为获取到的可能是新实例）。
     *
     * @param {string} prevCellKey - 上一个单元格的位置 "row,col"
     */
    #clearPreviousHoverState(prevCellKey) {
        if (!prevCellKey) return;

        try {
            const [prevRow, prevCol] = prevCellKey.split(",").map(Number);
            const prevCellType = this.#getCellType(prevRow, prevCol);

            // ✅ 方式1：优先使用静态方法清理（最可靠，不依赖实例状态）
            if (prevCellType?.constructor?.clearHoverState) {
                prevCellType.constructor.clearHoverState(prevCellKey);
            }

            // ✅ 方式2：同时调用实例方法（清理实例属性如 #hoverRating）
            if (prevCellType?.handleMouseLeave) {
                prevCellType.handleMouseLeave();
            }

            // ✅ 触发重绘以清除旧的高亮效果
            this.#scheduleRender();
        } catch (error) {
            errorHandler.warn(ERROR_CODE.PLUGIN_RUNTIME_WARNING, `InteractionPlugin#clearPreviousHoverState 警告: ${error.message}`);
        }
    }

    /**
     * 清理所有悬停状态（彻底清理）
     */
    #clearAllHoverStates() {
        if (this.#lastHoveredCell) {
            this.#clearPreviousHoverState(this.#lastHoveredCell);
        }

        this.#lastHoveredCell = null;
    }

    /**
     * 处理点击事件
     * 分发到对应单元格类型的 handleClick 方法
     *
     * @param {MouseEvent} event - 鼠标事件对象
     */
    #handleClick(event) {
        try {
            if (!this.enabled) return;

            const hitInfo = this.#hitTest(event);
            if (!hitInfo || hitInfo.type !== "cell") return;

            const { row, col } = hitInfo;
            const cellType = this.#getCellType(row, col);
            if (!cellType) return;

            const context = this.#createContext(row, col);

            if (typeof cellType.handleClick === "function") {
                const result = cellType.handleClick(context, event);

                if (result !== undefined && result !== null) {
                    // ✅ 保存数据到单元格（关键！）
                    const sheet = this.sheet;
                    if (sheet?.setCell) {
                        sheet.setCell(row, col, result);
                    }

                    // ✅ 触发重绘以显示更新后的值
                    this.#scheduleRender();
                }
            }
        } catch (error) {
            errorHandler.handle(ERROR_CODE.PLUGIN_RUNTIME_ERROR, `InteractionPlugin#handleClick 错误: ${error.message}`, { error });
        }
    }

    /**
     * 处理鼠标离开事件
     * 清除所有悬停状态并通知渲染器
     */
    #handleMouseLeave() {
        try {
            if (!this.enabled) return;

            // ✅ 使用统一的方法清理所有悬停状态
            this.#clearAllHoverStates();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.PLUGIN_RUNTIME_ERROR, `InteractionPlugin#handleMouseLeave 错误: ${error.message}`, { error });
        }
    }

    /**
     * 执行命中测试
     *
     * @param {MouseEvent} event - 鼠标事件
     * @returns {object|null} 命中信息或 null
     */
    #hitTest(event) {
        if (!this.renderEngine?.hitTest) return null;

        const hitInfo = this.renderEngine.hitTest(event.clientX, event.clientY);

        if (hitInfo && hitInfo.type !== "cell") {
            this.#clearHoverState();
            return null;
        }

        return hitInfo;
    }

    /**
     * 获取单元格类型实例
     * 支持类型过滤和空值检查
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object|null} 单元格类型实例或 null
     */
    #getCellType(row, col) {
        const sheet = this.sheet;
        if (!sheet?.getCellTypeInstance) return null;

        const cellType = sheet.getCellTypeInstance(row, col);
        if (!cellType) return null;

        const supportedTypes = this.options.supportedTypes;
        if (supportedTypes?.length > 0 && !supportedTypes.includes(cellType.name)) {
            return null;
        }

        return cellType;
    }

    /**
     * 创建渲染上下文对象
     *
     * ✅ 关键改进：优先使用 renderEngine.getCellRect() 获取单元格位置信息，
     * 确保返回完整的 context 对象（包含 x, y, width, height）。
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object} 渲染上下文（必须包含 x, y, width, height）
     */
    #createContext(row, col) {
        // ✅ 方式1：优先使用 renderEngine.getCellRect()（推荐）
        if (this.renderEngine?.getCellRect) {
            try {
                const cellRect = this.renderEngine.getCellRect(row, col);

                // ✅ 验证返回值有效性
                if (cellRect && typeof cellRect.x === "number" && typeof cellRect.y === "number") {
                    const sheet = this.sheet;
                    const cellData = sheet?.cellDataAccessor?.get(row, col);

                    return {
                        x: cellRect.x,
                        y: cellRect.y,
                        width: cellRect.w || 0,
                        height: cellRect.h || 0,
                        value: cellData?.value ?? null,
                        isEditing: false,
                        row: row,
                        col: col,
                    };
                }
            } catch (error) {
                // 继续尝试其他方式
            }
        }

        // ✅ 方式2：尝试使用 sheet.getCellRect()
        const sheet = this.sheet;
        if (sheet?.getCellRect) {
            try {
                const cellRect = sheet.getCellRect(row, col);
                const cellData = sheet.cellDataAccessor?.get(row, col);

                if (cellRect && typeof cellRect.x === "number" && typeof cellRect.y === "number") {
                    return {
                        x: cellRect.x,
                        y: cellRect.y,
                        width: cellRect.w || 0,
                        height: cellRect.h || 0,
                        value: cellData?.value ?? null,
                        isEditing: false,
                        row: row,
                        col: col,
                    };
                }
            } catch (error) {
                // 继续尝试回退方案
            }
        }

        return {
            x: 0,
            y: 0,
            width: 100, // 默认宽度
            height: 28, // 默认高度
            value: null,
            isEditing: false,
            row: row,
            col: col,
        };
    }

    /**
     * 清除当前悬停状态（兼容性方法）
     *
     * ✅ 委托给 #clearAllHoverStates() 以确保彻底清理
     */
    #clearHoverState() {
        this.#clearAllHoverStates();
    }

    /**
     * 调度重绘操作（智能节流控制）
     *
     * ✅ 性能优化策略：
     * - 使用 requestAnimationFrame 对齐浏览器刷新周期（~16.67ms for 60Hz）
     * - 合并同一帧内的多次请求，避免重复渲染
     * - 支持自定义最小间隔时间
     * - 自动降级到 setTimeout（兼容性保障）
     */
    #scheduleRender() {
        if (this.options.autoRender === false) return;

        // ✅ 如果已有待执行的渲染任务，直接返回（合并重复请求）
        if (this.#pendingRender) return;

        const throttleMs = this.options.throttleMs || 0;

        // ✅ 无节流限制时立即渲染
        if (throttleMs <= 0) {
            this.#doRender();
            return;
        }

        // ✅ 计算距离上次渲染的时间
        const now = performance.now(); // 使用高精度时间戳
        const elapsed = now - this.#lastRenderTime;

        if (elapsed >= throttleMs) {
            // ✅ 已超过节流间隔，立即渲染
            this.#doRender();
        } else {
            // ✅ 未达到节流间隔，延迟执行
            const delay = throttleMs - elapsed;

            this.#pendingRender = true; // 标记有待处理的渲染

            // ✅ 优先使用 requestAnimationFrame（对齐屏幕刷新）
            if (typeof requestAnimationFrame !== "undefined" && throttleMs <= 20) {
                this.#rafId = requestAnimationFrame(() => {
                    this.#rafId = null;
                    this.#pendingRender = null;
                    this.#doRender();
                });
            } else {
                // ✅ 降级到 setTimeout（长间隔或旧浏览器）
                this.#throttleTimer = setTimeout(() => {
                    this.#throttleTimer = null;
                    this.#pendingRender = null;
                    this.#doRender();
                }, delay);
            }
        }
    }

    /**
     * 执行实际的渲染操作
     *
     * @private
     */
    #doRender() {
        try {
            this.#lastRenderTime = performance.now();
            this.render();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.PLUGIN_RUNTIME_ERROR, `InteractionPlugin#doRender 错误: ${error.message}`, { error });
        }
    }

    /**
     * 销毁插件
     * 清理所有资源（基类会自动清理 DOM 事件）
     */
    destroy() {
        // ✅ 清理定时器
        if (this.#throttleTimer) {
            clearTimeout(this.#throttleTimer);
            this.#throttleTimer = null;
        }

        // ✅ 清理 RAF
        if (this.#rafId !== null) {
            cancelAnimationFrame(this.#rafId);
            this.#rafId = null;
        }

        // ✅ 重置状态
        this.#pendingRender = null;

        this.#clearHoverState();
        super.destroy();
    }

    /**
     * 禁用插件
     * 禁用时清除悬停状态
     */
    disable() {
        super.disable();
        this.#clearHoverState();
        if (this.#throttleTimer) {
            clearTimeout(this.#throttleTimer);
            this.#throttleTimer = null;
        }
    }

    /**
     * 手动清除悬停状态并重绘
     * 可供外部代码调用
     */
    clearHoverAndRender() {
        this.#clearHoverState();
        this.#scheduleRender();
    }

    /**
     * 获取当前悬停的单元格位置
     * @returns {string|null} "row,col" 格式的位置或 null
     */
    get lastHoveredCell() {
        return this.#lastHoveredCell;
    }
}
