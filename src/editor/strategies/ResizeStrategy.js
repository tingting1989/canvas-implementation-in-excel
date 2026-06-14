import { EventStrategy } from "./EventStrategy.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import {CONFIG} from "../../constants/config";
import {HIT_TYPE} from "../../constants/hitType";

export class ResizeStrategy extends EventStrategy {
    #mouseDownHandler = null;
    #mouseMoveHandler = null;
    #mouseUpHandler = null;

    #resizing = false;
    #resizeType = null;
    #resizeIndex = -1;
    #startPos = 0;
    #startSize = 0;

    #hoverType = null;

    constructor(handler) {
        super(handler);
    }

    init() {
        this.#bindEvents();
    }

    destroy() {
        this.handler.canvas.removeEventListener(EVENT_NAMES.MOUSEDOWN, this.#mouseDownHandler);
        document.removeEventListener(EVENT_NAMES.MOUSEMOVE, this.#mouseMoveHandler);
        document.removeEventListener(EVENT_NAMES.MOUSEUP, this.#mouseUpHandler);
        this.#clearResizeLine();
    }

    #bindEvents() {
        this.#mouseDownHandler = (e) => this.#onMouseDown(e);
        this.#mouseMoveHandler = (e) => this.#onMouseMove(e);
        this.#mouseUpHandler = (e) => this.#onMouseUp(e);

        this.handler.canvas.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#mouseDownHandler);
        document.addEventListener(EVENT_NAMES.MOUSEMOVE, this.#mouseMoveHandler);
        document.addEventListener(EVENT_NAMES.MOUSEUP, this.#mouseUpHandler);
    }

    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;

        const hit = this.handler.renderEngine.headerHitTest(e.clientX, e.clientY);
        if (!hit) return;

        e.preventDefault();
        this.#resizing = true;
        this.#resizeType = hit.type;
        this.#resizeIndex = hit.index;

        const rc = this.handler.sheet.rowColManager;
        if (hit.type === HIT_TYPE.COL_RESIZE) {
            this.#startPos = e.clientX;
            this.#startSize = rc.getColWidth(hit.index);
        } else {
            this.#startPos = e.clientY;
            this.#startSize = rc.getRowHeight(hit.index);
        }
    }

    #onMouseMove(e) {
        if (this.#resizing) {
            this.#handleDrag(e);
            return;
        }

        this.#handleHover(e);
    }

    #handleDrag(e) {
        const rc = this.handler.sheet.rowColManager;
        const headerRenderer = this.handler.renderEngine.headerRenderer;

        if (this.#resizeType === HIT_TYPE.COL_RESIZE) {
            const delta = e.clientX - this.#startPos;
            const newWidth = Math.max(CONFIG.MIN_COL_WIDTH, this.#startSize + delta);
            rc.setColWidth(this.#resizeIndex, newWidth);

            const rect = this.handler.canvas.getBoundingClientRect();
            const lineX = e.clientX - rect.left;
            headerRenderer.setResizeLine(HIT_TYPE.COL_RESIZE, this.#resizeIndex, lineX);
        } else {
            const delta = e.clientY - this.#startPos;
            const newHeight = Math.max(CONFIG.MIN_ROW_HEIGHT, this.#startSize + delta);
            rc.setRowHeight(this.#resizeIndex, newHeight);

            const rect = this.handler.canvas.getBoundingClientRect();
            const lineY = e.clientY - rect.top;
            headerRenderer.setResizeLine(HIT_TYPE.ROW_RESIZE, this.#resizeIndex, lineY);
        }

        this.handler.renderEngine.invalidateAll();
        this.handler.render();
    }

    #handleHover(e) {
        const hit = this.handler.renderEngine.headerHitTest(e.clientX, e.clientY);

        if (hit) {
            this.handler.canvas.style.cursor =
                hit.type === HIT_TYPE.COL_RESIZE ? "col-resize" : "row-resize";
            this.#hoverType = hit.type;
        } else if (this.#hoverType) {
            this.handler.canvas.style.cursor = "";
            this.#hoverType = null;
        }
    }

    #onMouseUp(e) {
        if (!this.#resizing) return;
        this.#resizing = false;
        this.#resizeType = null;
        this.#resizeIndex = -1;
        this.#clearResizeLine();
        this.handler.render();
    }

    #clearResizeLine() {
        if (this.handler.renderEngine?.headerRenderer) {
            this.handler.renderEngine.headerRenderer.setResizeLine(null);
        }
    }
}