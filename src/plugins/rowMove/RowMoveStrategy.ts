import { HOOKS } from "../../constants/hookNames.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";

/** 拖拽启动阈值（像素），避免微小移动误触发拖拽 */
const DRAG_THRESHOLD = 3;

/**
 * 行移动策略 (Row Move Strategy)
 *
 * 处理Canvas表格中行的拖拽移动和重新排序。
 * 通过拖拽行标头将行移动到新位置。
 *
 * 优先级：STRATEGY_PRIORITY.ROW_COLUMN_MOVE
 *
 * 核心功能：
 * 1. **行拖拽移动**：拖拽行标头将行移动到目标位置
 * 2. **拖拽预览**：拖拽时显示行移动指示器
 * 3. **光标管理**：悬停显示grab光标，拖拽显示grabbing光标
 * 4. **Hook拦截**：通过 BEFORE_ROW_MOVE/AFTER_ROW_MOVE 钩子支持拦截
 * 5. **选区调整**：行移动后自动调整选区位置
 * 6. **调整手柄排除**：拖拽调整大小时不触发行移动
 *
 * @class RowMoveStrategy
 * @extends EventStrategy
 */
export class RowMoveStrategy extends EventStrategy {
    /** 策略优先级：行列移动 */
    priority: number = STRATEGY_PRIORITY.ROW_COLUMN_MOVE;

    /** 是否处于移动准备状态 */
    #moving: boolean = false;
    /** 是否已超过拖拽阈值开始实际拖拽 */
    #dragStarted: boolean = false;
    /** 源行索引 */
    #sourceRow: number = -1;
    /** 目标行索引 */
    #targetRow: number = -1;
    /** 拖拽起始Y坐标（相对Canvas） */
    #dragStartY: number = 0;
    /** mousedown时的客户端Y坐标 */
    #mouseDownY: number = 0;
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
        if (!hit || hit.type !== HIT_TYPE.ROW_HEADER) return;

        this.#moving = true;
        this.#dragStarted = false;
        this.#sourceRow = hit.index;
        this.#targetRow = hit.index;

        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        this.#mouseDownY = e.clientY;
        this.#dragStartY = e.clientY - rect.top;
    }

    #onHover(e: MouseEvent): boolean | void {
        if (!this.enabled || !this.handler.sheet) return;
        if (this.#moving) return;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && hit.type === HIT_TYPE.ROW_HEADER) {
            this.handler.canvasContext.canvas.style.cursor = "grab";
            this.#cursorOwned = true;
            return false;
        }

        if (this.#cursorOwned) {
            this.handler.canvasContext.canvas.style.cursor = "";
            this.#cursorOwned = false;
        }
    }

    #onMouseMove(e: MouseEvent): false | void {
        if (!this.#moving) return;

        if (!this.#dragStarted) {
            const dy = Math.abs(e.clientY - this.#mouseDownY);
            if (dy < DRAG_THRESHOLD) return;

            this.#dragStarted = true;
            this.handler.canvasContext.canvas.style.cursor = "grabbing";
        }

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && (hit.type === HIT_TYPE.ROW_HEADER || hit.type === HIT_TYPE.CELL)) {
            this.#targetRow = hit.type === HIT_TYPE.ROW_HEADER ? hit.index : hit.row;
        }

        const rc = this.handler.sheet.rowColManager;
        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const dragY = e.clientY - rect.top;

        this.handler.renderEngine.selectionLayer.setRowMoveState({
            sourceRow: this.#sourceRow,
            targetRow: this.#targetRow,
            dragY: dragY,
            dragStartY: this.#dragStartY,
            rowH: rc.getRowHeight(this.#sourceRow),
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

        if (this.#dragStarted && this.#sourceRow !== this.#targetRow && this.#targetRow >= 0) {
            const cancelled = this.handler.runHooksUntil(HOOKS.BEFORE_ROW_MOVE, this.#sourceRow, this.#targetRow);
            if (cancelled === false) {
                this.#sourceRow = -1;
                this.#targetRow = -1;
                this.#dragStarted = false;
                this.handler.viewport.invalidateAll();
                this.handler.render();
                return;
            }

            this.handler.sheet.moveRow(this.#sourceRow, this.#targetRow);

            const sheet = this.handler.sheet;
            const range = sheet.selection.getRange();
            const delta = this.#targetRow - this.#sourceRow;
            const newTopRow = Math.max(0, range.topRow + (delta > 0 ? 1 : 0));
            const newBottomRow = Math.max(0, range.bottomRow + (delta > 0 ? 1 : 0));
            sheet.selection.setRange(newTopRow, range.topCol, newBottomRow, range.bottomCol);

            this.handler.runHooks(HOOKS.AFTER_ROW_MOVE, this.#sourceRow, this.#targetRow);
        }

        this.#sourceRow = -1;
        this.#targetRow = -1;
        this.#dragStarted = false;

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #clearIndicator(): void {
        if (this.handler.renderEngine?.selectionLayer) {
            this.handler.renderEngine.selectionLayer.setRowMoveState(null);
        }
    }
}
