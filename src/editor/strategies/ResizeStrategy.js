import { EventStrategy } from "./EventStrategy.js";
import { CONFIG } from "../../constants/config";
import { HIT_TYPE } from "../../constants/hitType";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";

/**
 * 列宽/行高拖拽调整策略
 * 优先级最高（100），确保调整手柄事件不被其他策略消费
 *
 * 处理以下操作：
 * - 悬停在列/行边界时切换光标样式
 * - 拖拽调整列宽/行高
 * - 实时显示调整参考线
 */
export class ResizeStrategy extends EventStrategy {
    priority = 100;

    #resizing = false;
    #resizeType = null;
    #resizeIndex = -1;
    #startPos = 0;
    #startSize = 0;

    #hoverType = null;

    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {
        this.#clearResizeLine();
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
        };
    }

    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;

        const hit = this.handler.renderEngine.headerHitTest(e.clientX, e.clientY);
        if (!hit) return;

        e.preventDefault();
        this.#resizing = true;
        this.#resizeType = hit.type;
        this.#resizeIndex = hit.index;

        const sheet = this.handler.sheet;
        const rc = sheet.rowColManager;
        if (hit.type === HIT_TYPE.COL_RESIZE) {
            this.#startPos = e.clientX;
            this.#startSize = rc.getColWidth(hit.index);
        } else {
            this.#startPos = e.clientY;
            this.#startSize = rc.getRowHeight(hit.index);
        }

        return false;
    }

    #onMouseMove(e) {
        if (this.#resizing) {
            this.#handleDrag(e);
            return false;
        }

        return this.#handleHover(e);
    }

    #handleDrag(e) {
        const sheet = this.handler.sheet;
        const rc = sheet.rowColManager;
        const headerRenderer = this.handler.renderEngine.headerRenderer;

        if (this.#resizeType === HIT_TYPE.COL_RESIZE) {
            const delta = e.clientX - this.#startPos;
            const newWidth = Math.max(CONFIG.MIN_COL_WIDTH, this.#startSize + delta);
            rc.setColWidth(this.#resizeIndex, newWidth);

            const rect = this.handler.canvas.getBoundingClientRect();
            const lineX = e.clientX - rect.left;
            headerRenderer.resizeRenderer.setResizeLine(HIT_TYPE.COL_RESIZE, this.#resizeIndex, lineX);
        } else {
            const delta = e.clientY - this.#startPos;
            const newHeight = Math.max(CONFIG.MIN_ROW_HEIGHT, this.#startSize + delta);
            rc.setRowHeight(this.#resizeIndex, newHeight);

            const rect = this.handler.canvas.getBoundingClientRect();
            const lineY = e.clientY - rect.top;
            headerRenderer.resizeRenderer.setResizeLine(HIT_TYPE.ROW_RESIZE, this.#resizeIndex, lineY);
        }

        this.handler.renderEngine.invalidateAll();
        this.handler.render();
    }

    /**
     * 光标悬停检测
     *
     * 光标所有权机制：
     * - 设置光标时 return false 阻止低优先级策略覆盖
     * - 仅在本策略曾设置光标时才清除，避免误清其他策略的光标
     */
    #handleHover(e) {
        const hit = this.handler.renderEngine.headerHitTest(e.clientX, e.clientY);

        if (hit) {
            this.handler.canvas.style.cursor = hit.type === HIT_TYPE.COL_RESIZE ? "col-resize" : "row-resize";
            this.#hoverType = hit.type;
            return false;
        }

        if (this.#hoverType) {
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
            this.handler.renderEngine.headerRenderer.resizeRenderer.setResizeLine(null);
        }
    }
}