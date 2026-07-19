/**
 * 单元格类型交互策略
 *
 * 将 InteractionPlugin 从 BasePlugin 重构为 EventStrategy，
 * 集成到 EventHandler 的委托系统中，解决与 ChartSelectionStrategy 等策略的事件冲突。
 *
 * 核心功能：
 * - 处理交互式单元格的鼠标事件（悬停、点击）
 * - 智能管理合并单元格的状态同步
 * - 高效的重绘节流控制
 *
 * 优先级：400 (CELL_TYPE_INTERACTION)
 * - 高于 MOUSE_DEFAULT(300)：需要拦截交互式单元格的鼠标事件
 * - 低于 POPUP_UI(500)：筛选器等弹出式 UI 优先级更高
 * - 与图表策略(CHART_INTERACTION: 800)无冲突：处理不同区域
 *
 * @module plugins/InteractionStrategy
 */

import { EventStrategy } from "@/editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler.js";
import { isFunction } from "@/utils/index.js";

export class InteractionStrategy extends EventStrategy {
    /**
     * 策略优先级
     * @type {number}
     */
    priority = STRATEGY_PRIORITY.CELL_TYPE_INTERACTION;

    /** 上次悬停的单元格位置 "row,col" */
    #lastHoveredCell = null;

    /** 是否有待执行的渲染任务（用于合并重复请求） */
    #pendingRender = null;

    /** requestAnimationFrame ID */
    #rafId = null;

    /** setTimeout ID（降级方案） */
    #throttleTimer = null;

    /** 上一次渲染的时间戳（用于节流） */
    #lastRenderTime = 0;

    /** 重绘节流时间（毫秒） */
    #throttleMs = 100;

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (event) => this.#handleMouseMove(event),
            [DELEGATE_KEYS.CANVAS_CLICK]: (event) => this.#handleClick(event),
            [DELEGATE_KEYS.CANVAS_MOUSELEAVE]: () => this.#handleMouseLeave(),
        };
    }

    // ─── 公共事件处理方法 ──────────────────────────────

    /**
     * 处理鼠标移动事件
     *
     * 检测鼠标是否进入/离开交互式单元格，并触发相应的悬停状态切换。
     * 使用智能节流控制渲染频率。
     *
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {boolean} false=已处理并阻止后续策略，true=交给其他策略处理
     */
    #handleMouseMove(event) {
        try {
            const hitInfo = this.#getHitInfo(event);
            if (!hitInfo) return true;

            const { hit, cellType, cellKey } = hitInfo;

            if (!cellType) {
                this.#clearAllHoverStates();
                return true;
            }

            this.#manageHoverTransition(cellKey);

            const context = this.#buildContext(hit);

            return this.#dispatchHoverEvent(cellType, context, event, cellKey);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleMouseMove 错误: ${error.message}`, { error });
            return true;
        }
    }

    /**
     * 处理鼠标点击事件
     *
     * 将点击事件分发给对应的单元格类型渲染器处理，
     * 并自动保存结果到单元格数据中。
     *
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {boolean} false=已处理并阻止后续策略，true=交给其他策略处理
     */
    #handleClick(event) {
        try {
            const hitInfo = this.#getHitInfo(event);
            if (!hitInfo || !hitInfo.cellType) return true;

            const { hit, cellType } = hitInfo;
            const context = this.#buildFullContext(hit);

            return this.#dispatchClickEvent(cellType, context, event);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleClick 错误: ${error.message}`, { error });
            return true;
        }
    }

    /**
     * 处理鼠标离开 Canvas 事件
     *
     * 清理所有悬停状态，确保没有残留的高亮效果。
     */
    #handleMouseLeave() {
        try {
            if (!this.enabled || !this.handler.sheet) return;
            this.#clearAllHoverStates();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleMouseLeave 错误: ${error.message}`, { error });
        }
    }

    // ─── 命中检测与上下文构建 ──────────────────────────

    /**
     * 执行命中检测并获取完整的命中信息
     *
     * 统一的入口点，用于获取：
     * - 命中的单元格位置（考虑合并区域）
     * - 单元格类型实例
     * - 单元格键标识
     *
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {{hit: object, cellType: object|null, cellKey: string}|null} 命中信息或null
     */
    #getHitInfo(event) {
        if (!this.enabled || !this.handler.sheet) return null;

        const { viewport, sheet } = this.handler;
        const hit = viewport.hitTest(event.clientX, event.clientY);

        if (!hit || hit.type !== "cell") {
            this.#clearAllHoverStates();
            return null;
        }

        const cellKey = `${hit.row},${hit.col}`;
        const cellType = this.#getCellType(hit.row, hit.col);

        return { hit, cellType, cellKey };
    }

    /**
     * 构建基础交互上下文（用于悬停等轻量操作）
     *
     * ✅ 关键：正确处理合并单元格，使用合并区域的左上角作为实际行列号。
     *
     * @param {object} hit - 命中信息对象 {row, col}
     * @returns {object} 包含几何信息和位置的上下文对象
     */
    #buildContext(hit) {
        const { viewport, sheet } = this.handler;
        const merge = sheet.getMerge(hit.row, hit.col);
        const cellRect = viewport.getCellRect(hit.row, hit.col, merge);

        const actualRow = merge?.topRow ?? hit.row;
        const actualCol = merge?.topCol ?? hit.col;

        return {
            x: cellRect.x,
            y: cellRect.y,
            width: cellRect.w,
            height: cellRect.h,
            sheet,
            row: actualRow,
            col: actualCol,
        };
    }

    /**
     * 构建完整交互上下文（用于点击等需要数据的操作）
     *
     * 在基础上下文上增加单元格数据信息。
     *
     * @param {object} hit - 命中信息对象 {row, col}
     * @returns {object} 完整的上下文对象（包含value、displayValue等）
     */
    #buildFullContext(hit) {
        const baseContext = this.#buildContext(hit);
        const { sheet, row, col } = baseContext;
        const cell = sheet.cellDataAccessor?.get(row, col);

        return {
            ...baseContext,
            value: cell?.value,
            displayValue: cell?.displayValue || cell?.value,
        };
    }

    // ─── 事件分发与状态管理 ──────────────────────────

    /**
     * 分发悬停事件给单元格类型处理器
     *
     * @param {object} cellType - 单元格类型实例
     * @param {object} context - 交互上下文
     * @param {MouseEvent} event - 鼠标事件
     * @param {string} cellKey - 单元格标识
     * @returns {boolean} false=已处理，true=未处理或出错
     */
    #dispatchHoverEvent(cellType, context, event, cellKey) {
        if (!isFunction(cellType.handleHover)) return true;

        const needsRedraw = cellType.handleHover(context, event);

        if (needsRedraw || !this.#lastHoveredCell) {
            this.#lastHoveredCell = cellKey;

            if (needsRedraw) {
                this.#scheduleRender();
            }
        }

        return false; // 已处理，阻止后续策略
    }

    /**
     * 分发点击事件给单元格类型处理器
     *
     * 自动将处理结果保存回单元格数据，并触发重绘。
     *
     * @param {object} cellType - 单元格类型实例
     * @param {object} context - 交互上下文
     * @param {MouseEvent} event - 鼠标事件
     * @returns {boolean} false=已处理，true=未处理或无有效结果
     */
    #dispatchClickEvent(cellType, context, event) {
        if (!isFunction(cellType.handleClick)) return true;

        const result = cellType.handleClick(context, event);

        if (result === undefined || result === null) return true;

        const { sheet, row, col } = context;
        if (sheet?.setCell) {
            sheet.setCell(row, col, result);
        }

        this.#scheduleRender();

        return false; // 已处理，阻止后续策略
    }

    /**
     * 管理悬停状态的切换过渡
     *
     * 当鼠标从一个单元格移动到另一个单元格时，
     * 先清理旧状态再准备新状态。
     *
     * @param {string} newCellKey - 新的单元格位置 "row,col"
     */
    #manageHoverTransition(newCellKey) {
        if (this.#lastHoveredCell && this.#lastHoveredCell !== newCellKey) {
            this.#clearPreviousHoverState(this.#lastHoveredCell);
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
     * 清理指定单元格的悬停状态
     *
     * 采用双重清理策略确保彻底性：
     * 1. 通过静态方法清理（不依赖实例状态）
     * 2. 通过实例方法清理（清除实例内部缓存）
     *
     * @param {string} cellKey - 单元格位置 "row,col"
     */
    #clearPreviousHoverState(cellKey) {
        if (!cellKey) return;

        try {
            const [row, col] = cellKey.split(",").map(Number);
            const cellType = this.#getCellType(row, col);

            if (cellType?.constructor?.clearHoverState) {
                cellType.constructor.clearHoverState(cellKey);
            }

            if (cellType?.handleMouseLeave) {
                cellType.handleMouseLeave();
            }

            this.#scheduleRender();
        } catch (error) {
            errorHandler.warn(ERROR_CODE.PLUGIN_RUNTIME_WARNING, `InteractionStrategy#clearPreviousHoverState 警告: ${error.message}`);
        }
    }

    // ─── 工具方法 ──────────────────────────────────────

    /**
     * 获取指定位置的单元格类型实例
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object|null} 单元格类型实例或 null
     */
    #getCellType(row, col) {
        try {
            return this.handler.sheet.getCellTypeInstance(row, col);
        } catch (error) {
            return null;
        }
    }

    // ─── 渲染控制（智能节流）───────────────────────────

    /**
     * 调度重绘操作（智能节流控制）
     *
     * 性能优化策略：
     * - 使用 requestAnimationFrame 对齐浏览器刷新周期（~16.67ms for 60Hz）
     * - 合并同一帧内的多次请求，避免重复渲染
     * - 支持自定义最小间隔时间
     * - 自动降级到 setTimeout（兼容性保障）
     */
    #scheduleRender() {
        if (this.#pendingRender) return; // 合并重复请求

        const throttleMs = this.#throttleMs || 0;

        if (throttleMs <= 0) {
            this.#doRender();
            return;
        }

        const now = performance.now();
        const elapsed = now - this.#lastRenderTime;

        if (elapsed >= throttleMs) {
            this.#doRender();
        } else {
            const delay = throttleMs - elapsed;
            this.#pendingRender = true;

            if (typeof requestAnimationFrame !== "undefined" && throttleMs <= 20) {
                this.#rafId = requestAnimationFrame(() => {
                    this.#rafId = null;
                    this.#pendingRender = null;
                    this.#doRender();
                });
            } else {
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
     */
    #doRender() {
        try {
            this.#lastRenderTime = performance.now();
            this.handler.render();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#doRender 错误: ${error.message}`, { error });
        }
    }
}
