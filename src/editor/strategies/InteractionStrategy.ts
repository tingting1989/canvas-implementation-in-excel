import { errorHandler } from "../../core/ErrorHandler.js";
import { debounce, isFunction } from "../../utils/helper.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/**
 * 交互类型单元格策略 (Interaction Strategy)
 *
 * 处理Canvas表格中具有交互类型的单元格（如按钮、链接、复选框等）。
 * 将鼠标事件委托给对应的CellType实例处理。
 *
 * 优先级：STRATEGY_PRIORITY.CELL_TYPE_INTERACTION
 *
 * 核心功能：
 * 1. **悬停处理**：将mousemove事件委托给CellType.handleHover
 * 2. **点击处理**：将click/dblclick事件委托给CellType.handleClick
 * 3. **悬停状态管理**：跟踪当前悬停单元格，进出时清理/设置悬停状态
 * 4. **双击防抖**：使用debounce避免双击时触发两次单击
 * 5. **渲染节流**：使用requestAnimationFrame/setTimeout节流渲染
 * 6. **错误容错**：所有操作包裹在try-catch中，错误通过ErrorHandler上报
 *
 * CellType接口约定：
 * - isInteractive: boolean - 是否为交互类型
 * - handleHover(context, event): boolean - 处理悬停，返回是否需要重绘
 * - handleClick(context, event): any - 处理点击，返回新值或null/undefined
 * - handleMouseLeave(): boolean - 处理鼠标离开，返回是否需要重绘
 * - handleKeydown(event, value): any - 处理键盘事件
 * - constructor.clearHoverState(cellKey): static - 清除悬停状态
 *
 * @class InteractionStrategy
 * @extends EventStrategy
 */
export class InteractionStrategy extends EventStrategy {
    /** 策略优先级：单元格类型交互 */
    priority: number = STRATEGY_PRIORITY.CELL_TYPE_INTERACTION;

    /** 上次悬停的单元格键（"row,col"格式） */
    #lastHoveredCell: string | null = null;
    /** 防抖的单击处理器，避免双击时触发两次单击 */
    #debouncedHandleClick: ReturnType<typeof debounce> = debounce(
        ((hitInfo: any, event: MouseEvent) => {
            this.#doHandleClick(hitInfo, event);
        }) as (...args: unknown[]) => void,
        200,
    );
    /** 是否正在处理双击（抑制防抖单击） */
    #inDoubleClick: boolean = false;
    /** 是否有待执行的渲染 */
    #pendingRender: boolean | null = null;
    /** requestAnimationFrame ID */
    #rafId: number | null = null;
    /** setTimeout定时器ID */
    #throttleTimer: ReturnType<typeof setTimeout> | null = null;
    /** 上次渲染时间戳 */
    #lastRenderTime: number = 0;
    /** 渲染节流间隔（毫秒） */
    #throttleMs: number = 100;

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (event: Event) => this.#handleMouseMove(event as MouseEvent),
            [DELEGATE_KEYS.CANVAS_CLICK]: (event: Event) => this.#handleClick(event as MouseEvent),
            [DELEGATE_KEYS.CANVAS_DBLCLICK]: (event: Event) => this.#handleDoubleClick(event as MouseEvent),
            [DELEGATE_KEYS.CANVAS_MOUSELEAVE]: () => this.#handleMouseLeave(),
        };
    }

    #handleMouseMove(event: MouseEvent): boolean {
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
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleMouseMove 错误: ${error.message}`, { error });
            return true;
        }
    }

    #handleClick(event: MouseEvent): boolean {
        try {
            const hitInfo = this.#getHitInfo(event);
            if (!hitInfo || !hitInfo.cellType) return true;

            if (!hitInfo.cellType.isInteractive) {
                this.#debouncedHandleClick(hitInfo, event);
                return true;
            }

            const { hit, cellType } = hitInfo;
            const context = this.#buildFullContext(hit);
            return this.#dispatchClickEvent(cellType, context, event);
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleClick 错误: ${error.message}`, { error });
            return true;
        }
    }

    #doHandleClick(hitInfo: any, event: MouseEvent): void {
        if (this.#inDoubleClick) return;

        const { hit, cellType } = hitInfo;
        const context = this.#buildFullContext(hit);
        this.#dispatchClickEvent(cellType, context, event);
    }

    #handleDoubleClick(event: MouseEvent): boolean {
        this.#inDoubleClick = true;
        this.#debouncedHandleClick.cancel();

        setTimeout(() => {
            this.#inDoubleClick = false;
        }, 300);

        try {
            const hitInfo = this.#getHitInfo(event);
            if (hitInfo?.cellType?.isInteractive) {
                const { hit, cellType } = hitInfo;
                const context = this.#buildFullContext(hit);
                return this.#dispatchClickEvent(cellType, context, event);
            }
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleDoubleClick 错误: ${error.message}`, { error });
        }

        return true;
    }

    #handleMouseLeave(): void {
        try {
            if (!this.enabled || !this.handler.sheet) return;
            this.#clearAllHoverStates();
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleMouseLeave 错误: ${error.message}`, { error });
        }
    }

    #getHitInfo(event: MouseEvent): { hit: any; cellType: any | null; cellKey: string } | null {
        if (!this.enabled || !this.handler.sheet) return null;

        const { viewport } = this.handler;
        const hit = viewport.hitTest(event.clientX, event.clientY);

        if (!hit || hit.type !== "cell") {
            this.#clearAllHoverStates();
            return null;
        }

        const cellKey = `${hit.row},${hit.col}`;
        const cellType = this.#getCellType(hit.row, hit.col);

        return { hit, cellType, cellKey };
    }

    #buildContext(hit: any): { x: number; y: number; width: number; height: number; sheet: any; row: number; col: number } {
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

    #buildFullContext(hit: any): Record<string, any> {
        const baseContext = this.#buildContext(hit);
        const { sheet, row, col } = baseContext;

        const cell = sheet.cellDataAccessor?.get(row, col);

        return {
            ...baseContext,
            value: cell?.value,
            displayValue: cell?.displayValue || cell?.value,
        };
    }

    #dispatchHoverEvent(cellType: any, context: any, event: MouseEvent, cellKey: string): boolean {
        if (!isFunction(cellType.handleHover)) return true;

        const needsRedraw = cellType.handleHover(context, event);

        if (needsRedraw || !this.#lastHoveredCell) {
            this.#lastHoveredCell = cellKey;

            if (needsRedraw) {
                this.#scheduleRender();
            }
        }

        return false;
    }

    #dispatchClickEvent(cellType: any, context: any, event: MouseEvent): boolean {
        if (!isFunction(cellType.handleClick)) return true;

        const result = cellType.handleClick(context, event);

        if (result === undefined) return true;

        if (result !== null) {
            const { sheet, row, col } = context;
            if (sheet?.setCell) {
                sheet.setCell(row, col, result);
            }
            this.#scheduleRender();
        }

        return false;
    }

    #manageHoverTransition(newCellKey: string): void {
        if (this.#lastHoveredCell && this.#lastHoveredCell !== newCellKey) {
            this.#clearPreviousHoverState(this.#lastHoveredCell);
        }
    }

    #clearAllHoverStates(): void {
        if (this.#lastHoveredCell) {
            this.#clearPreviousHoverState(this.#lastHoveredCell);
        }
        this.#lastHoveredCell = null;
    }

    #clearPreviousHoverState(cellKey: string): void {
        if (!cellKey) return;

        try {
            const [row, col] = cellKey.split(",").map(Number);
            const cellType = this.#getCellType(row, col);

            if (cellType?.constructor?.clearHoverState) {
                cellType.constructor.clearHoverState(cellKey);
            }

            if (cellType?.handleMouseLeave) {
                const needsRedraw = cellType.handleMouseLeave();
                if (needsRedraw) {
                    this.#scheduleRender();
                }
            }
        } catch (error: any) {
            errorHandler.warn(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#clearPreviousHoverState 警告: ${error.message}`);
        }
    }

    #getCellType(row: number, col: number): any | null {
        try {
            return this.handler.sheet.getCellTypeInstance(row, col);
        } catch (error) {
            return null;
        }
    }

    #scheduleRender(): void {
        if (this.#pendingRender) return;

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

    #doRender(): void {
        try {
            this.#lastRenderTime = performance.now();
            this.handler.render();
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#doRender 错误: ${error.message}`, { error });
        }
    }
}
