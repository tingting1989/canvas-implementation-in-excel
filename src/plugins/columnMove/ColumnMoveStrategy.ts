import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { HOOKS } from "../../constants/hookNames.js";

/** 拖拽启动阈值（像素），避免微小移动误触发拖拽 */
const DRAG_THRESHOLD = 3;

/**
 * 列移动策略 (Column Move Strategy)
 *
 * 处理Canvas表格中列的拖拽移动和重新排序。
 * 通过拖拽列标头将列移动到新位置。
 *
 * 优先级：STRATEGY_PRIORITY.ROW_COLUMN_MOVE
 *
 * 核心功能：
 * 1. **列拖拽移动**：拖拽列标头将列移动到目标位置
 * 2. **拖拽预览**：拖拽时显示列移动指示器
 * 3. **光标管理**：悬停显示grab光标，拖拽显示grabbing光标
 * 4. **Hook拦截**：通过 BEFORE_COLUMN_MOVE/AFTER_COLUMN_MOVE 钩子支持拦截
 * 5. **选区调整**：列移动后自动调整选区位置
 * 6. **调整手柄排除**：拖拽调整大小时不触发列移动
 *
 * 交互流程：
 * ┌──────────┐    ┌──────────────┐    ┌──────────────┐
 * │ 悬停列头  │ →  │ 显示grab光标  │ →  │ mousedown准备 │
 * └──────────┘    └──────────────┘    └──────────────┘
 * ┌──────────┐    ┌──────────────┐    ┌──────────────┐
 * │ 拖拽移动  │ →  │ 显示移动指示  │ →  │ mouseup执行   │
 * └──────────┘    └──────────────┘    └──────────────┘
 *
 * @class ColumnMoveStrategy
 * @extends EventStrategy
 */
export class ColumnMoveStrategy extends EventStrategy {
    /** 策略优先级：行列移动 */
    priority: number = STRATEGY_PRIORITY.ROW_COLUMN_MOVE;

    /** 是否处于移动准备状态 */
    #moving: boolean = false;
    /** 是否已超过拖拽阈值开始实际拖拽 */
    #dragStarted: boolean = false;
    /** 源列索引 */
    #sourceCol: number = -1;
    /** 目标列索引 */
    #targetCol: number = -1;
    /** 拖拽起始X坐标（相对Canvas） */
    #dragStartX: number = 0;
    /** mousedown时的客户端X坐标 */
    #mouseDownX: number = 0;
    /** 是否占用了光标样式 */
    #cursorOwned: boolean = false;

    constructor(handler: any) {
        super(handler);
    }

    init(): void {}

    destroy(): void {
        this.#clearIndicator();
    }

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e: Event) => this.#onMouseDown(e as MouseEvent),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e: Event) => this.#onHover(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e: Event) => this.#onMouseMove(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e: Event) => this.#onMouseUp(e as MouseEvent),
        };
    }

    #onMouseDown(e: MouseEvent): void {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit || hit.type !== HIT_TYPE.COL_HEADER) return;

        this.#moving = true;
        this.#dragStarted = false;
        this.#sourceCol = hit.index;
        this.#targetCol = hit.index;

        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        this.#mouseDownX = e.clientX;
        this.#dragStartX = e.clientX - rect.left;
    }

    #onHover(e: MouseEvent): boolean | void {
        if (!this.enabled || !this.handler.sheet) return undefined;
        if (this.#moving) return undefined;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return undefined;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && hit.type === HIT_TYPE.COL_HEADER) {
            this.handler.canvasContext.canvas.style.cursor = "grab";
            this.#cursorOwned = true;
            return false;
        }

        if (this.#cursorOwned) {
            this.handler.canvasContext.canvas.style.cursor = "";
            this.#cursorOwned = false;
        }
        return undefined;
    }

    #onMouseMove(e: MouseEvent): boolean | void {
        if (!this.#moving) return undefined;

        if (!this.#dragStarted) {
            const dx = Math.abs(e.clientX - this.#mouseDownX);
            if (dx < DRAG_THRESHOLD) return undefined;

            this.#dragStarted = true;
            this.handler.canvasContext.canvas.style.cursor = "grabbing";
        }

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && (hit.type === HIT_TYPE.COL_HEADER || hit.type === HIT_TYPE.CELL)) {
            this.#targetCol = hit.type === HIT_TYPE.COL_HEADER ? hit.index : hit.col;
        }

        const rc = this.handler.sheet.rowColManager;
        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const dragX = e.clientX - rect.left;

        this.handler.renderEngine.selectionLayer.setColumnMoveState({
            sourceCol: this.#sourceCol,
            targetCol: this.#targetCol,
            dragX: dragX,
            dragStartX: this.#dragStartX,
            colW: rc.getColWidth(this.#sourceCol),
        });

        this.handler.viewport.invalidateAll();
        this.handler.render();

        return false;
    }

    #onMouseUp(_e: MouseEvent): void {
        if (!this.#moving) return;
        this.#moving = false;
        this.handler.canvasContext.canvas.style.cursor = "";

        this.#clearIndicator();

        if (this.#dragStarted && this.#sourceCol !== this.#targetCol && this.#targetCol >= 0) {
            const cancelled = this.handler.runHooksUntil(HOOKS.BEFORE_COLUMN_MOVE, this.#sourceCol, this.#targetCol);
            if (cancelled === false) {
                this.#sourceCol = -1;
                this.#targetCol = -1;
                this.#dragStarted = false;
                this.handler.viewport.invalidateAll();
                this.handler.render();
                return;
            }

            this.handler.sheet.moveCol(this.#sourceCol, this.#targetCol);

            const sheet = this.handler.sheet;
            const range = sheet.selection.getRange();
            const delta = this.#targetCol - this.#sourceCol;
            const newTopCol = Math.max(0, range.topCol + (delta > 0 ? 1 : 0));
            const newBottomCol = Math.max(0, range.bottomCol + (delta > 0 ? 1 : 0));
            sheet.selection.setRange(range.topRow, newTopCol, range.bottomRow, newBottomCol);

            this.handler.runHooks(HOOKS.AFTER_COLUMN_MOVE, this.#sourceCol, this.#targetCol);
        }

        this.#sourceCol = -1;
        this.#targetCol = -1;
        this.#dragStarted = false;

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #clearIndicator(): void {
        if (this.handler.renderEngine?.selectionLayer) {
            this.handler.renderEngine.selectionLayer.setColumnMoveState(null);
        }
    }
}
