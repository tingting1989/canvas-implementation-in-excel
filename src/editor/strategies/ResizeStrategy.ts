import { EventStrategy } from "./EventStrategy.js";
import { CONFIG } from "../../constants/config.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 尺寸调整策略 (Resize Strategy)
 *
 * 处理Canvas表格中行高和列宽的拖拽调整操作。
 * 拥有最高优先级（STRATEGY_PRIORITY.RESIZE_LAYOUT），确保调整手柄的事件不被其他策略拦截。
 *
 * 核心功能：
 * 1. **列宽拖拽调整**：拖拽列标头右边缘调整列宽
 * 2. **行高拖拽调整**：拖拽行标头下边缘调整行高
 * 3. **调整线预览**：拖拽时显示实时调整参考线
 * 4. **悬停光标**：悬停在调整手柄上显示 col-resize/row-resize 光标
 * 5. **最小尺寸约束**：确保行高/列宽不小于配置的最小值
 *
 * 交互流程：
 * ┌──────────┐    ┌──────────────┐    ┌──────────────┐
 * │ 悬停手柄  │ →  │ 显示调整光标  │ →  │ 拖拽调整尺寸  │
 * └──────────┘    └──────────────┘    └──────────────┘
 * ┌──────────┐    ┌──────────────┐
 * │ mouseup  │ →  │ 清除调整线    │
 * └──────────┘    └──────────────┘
 *
 * @class ResizeStrategy
 * @extends EventStrategy
 */
export class ResizeStrategy extends EventStrategy {
    /** 策略优先级：布局调整（高优先级，优先捕获事件） */
    priority: number = STRATEGY_PRIORITY.RESIZE_LAYOUT;

    /** 是否正在拖拽调整尺寸 */
    #resizing: boolean = false;
    /** 调整类型：COL_RESIZE 或 ROW_RESIZE */
    #resizeType: string | null = null;
    /** 正在调整的行/列索引 */
    #resizeIndex: number = -1;
    /** 拖拽起始位置（像素） */
    #startPos: number = 0;
    /** 拖拽起始尺寸（像素） */
    #startSize: number = 0;

    /** 当前悬停的调整手柄类型 */
    #hoverType: string | null = null;

    constructor(handler: any) {
        super(handler);
    }

    /** 初始化策略（本策略无需额外初始化） */
    init(): void {}

    /** 销毁策略，清除调整参考线 */
    destroy(): void {
        this.#clearResizeLine();
    }

    /**
     * 声明监听的DOM事件
     * @returns 事件映射：canvas的mousedown + document的mousemove/mouseup
     */
    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e: Event) => this.#onMouseDown(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e: Event) => this.#onMouseMove(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e: Event) => this.#onMouseUp(e as MouseEvent),
        };
    }

    /**
     * 处理鼠标按下：检测是否点击了调整手柄，进入调整状态
     * @param e - 鼠标事件
     * @returns false 表示消费此事件，阻止其他策略处理
     */
    #onMouseDown(e: MouseEvent): false | void {
        if (!this.enabled || !this.handler.sheet) return;

        const hit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
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

    /**
     * 处理鼠标移动：拖拽调整或悬停光标切换
     * @param e - 鼠标事件
     */
    #onMouseMove(e: MouseEvent): false | void {
        if (this.#resizing) {
            this.#handleDrag(e);
            return false;
        }

        return this.#handleHover(e);
    }

    /** 拖拽调整尺寸：计算新尺寸并更新，显示调整参考线 */
    #handleDrag(e: MouseEvent): void {
        const sheet = this.handler.sheet;
        const rc = sheet.rowColManager;
        const viewport = this.handler.viewport;

        if (this.#resizeType === HIT_TYPE.COL_RESIZE) {
            const delta = e.clientX - this.#startPos;
            const newWidth = Math.max(CONFIG.MIN_COL_WIDTH, this.#startSize + delta);
            rc.setColWidth(this.#resizeIndex, newWidth);

            const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
            const lineX = e.clientX - rect.left;
            viewport.setResizeLine(HIT_TYPE.COL_RESIZE, this.#resizeIndex, lineX);
        } else {
            const delta = e.clientY - this.#startPos;
            const newHeight = Math.max(CONFIG.MIN_ROW_HEIGHT, this.#startSize + delta);
            rc.setRowHeight(this.#resizeIndex, newHeight);

            const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
            const lineY = e.clientY - rect.top;
            viewport.setResizeLine(HIT_TYPE.ROW_RESIZE, this.#resizeIndex, lineY);
        }

        viewport.invalidateAll();
        this.handler.render();

        if (this.handler.editor?.updateActiveEditorPosition) {
            this.handler.editor.updateActiveEditorPosition();
        }
    }

    /** 悬停检测：在调整手柄上显示对应光标 */
    #handleHover(e: MouseEvent): false | void {
        const hit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);

        if (hit) {
            this.handler.canvasContext.canvas.style.cursor = hit.type === HIT_TYPE.COL_RESIZE ? "col-resize" : "row-resize";
            this.#hoverType = hit.type;
            return false;
        }

        if (this.#hoverType) {
            this.handler.canvasContext.canvas.style.cursor = "";
            this.#hoverType = null;
        }
    }

    /** 处理鼠标松开：结束调整状态，清除参考线 */
    #onMouseUp(_e: MouseEvent): void {
        if (!this.#resizing) return;
        this.#resizing = false;
        this.#resizeType = null;
        this.#resizeIndex = -1;
        this.#clearResizeLine();
        this.handler.render();
    }

    /** 清除视口中的调整参考线 */
    #clearResizeLine(): void {
        if (this.handler.viewport) {
            this.handler.viewport.clearResizeLine();
        }
    }
}
