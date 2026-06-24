import { EventStrategy } from "./EventStrategy.js";
import { HIT_TYPE } from "../../constants/hitType";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { HOOKS } from "../../constants/hookNames.js";

const DRAG_THRESHOLD = 3;

export class ColumnMoveStrategy extends EventStrategy {
    priority = 80;

    #moving = false;
    #dragStarted = false;
    #sourceCol = -1;
    #targetCol = -1;
    #dragStartX = 0;
    #mouseDownX = 0;

    /** 是否由本策略设置了光标（用于光标所有权管理） */
    #cursorOwned = false;

    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {
        this.#clearIndicator();
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onHover(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
        };
    }

    #onMouseDown(e) {
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

    /**
     * 鼠标悬停：在列头区域显示 grab 光标
     * 拖拽进行中时不处理
     *
     * 光标所有权机制：
     * - 设置光标时 return false 阻止低优先级策略覆盖
     * - 仅在本策略曾设置光标时才清除，避免误清其他策略的光标
     */
    #onHover(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (this.#moving) return;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

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
    }

    #onMouseMove(e) {
        if (!this.#moving) return;

        if (!this.#dragStarted) {
            const dx = Math.abs(e.clientX - this.#mouseDownX);
            if (dx < DRAG_THRESHOLD) return;

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

        this.handler.renderEngine.dragIndicatorLayer.setColumnMoveState({
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

    #onMouseUp(e) {
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

    #clearIndicator() {
        if (this.handler.renderEngine?.dragIndicatorLayer) {
            this.handler.renderEngine.dragIndicatorLayer.setColumnMoveState(null);
        }
    }
}
