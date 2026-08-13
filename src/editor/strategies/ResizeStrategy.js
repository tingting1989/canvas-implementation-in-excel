import { EventStrategy } from "./EventStrategy.js";
import { CONFIG } from "../../constants/config.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 尺寸调整策略 (Resize Strategy)
 *
 * 处理Canvas表格中行高和列宽的拖拽调整操作。
 * 拥有最高优先级（100），确保调整手柄的事件不被其他策略拦截。
 *
 * 优先级：100（STRATEGY_PRIORITY.RESIZE_LAYOUT）
 * - 最高优先级，确保调整操作始终优先响应
 * - 在 MouseStrategy (50) 和 AutoFillStrategy (90) 之前执行
 *
 * 核心功能：
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 悬停列边界         │ 光标变为 ↔（水平调整）                │
 * │ 悬停行边界         │ 光标变为 ↕（垂直调整）                  │
 * │ 拖拽列边界         │ 实时调整列宽，显示参考线               │
 * │ 拖拽行边界         │ 实时调整行高，显示参考线               │
 * │ 双击列/行边界      │ 自动适应内容宽度/高度                   │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 技术实现：
 * - 使用 headerHitTest() 检测是否点击在调整区域
 * - 通过 CSS cursor 属性提供视觉反馈
 * - 绘制临时参考线辅助用户对齐
 * - 支持像素级精确调整和网格吸附
 * - 最小尺寸限制防止过度压缩
 *
 * 状态机：
 * ```
 * idle → hover(悬停) → dragging(拖拽) → idle
 *                     ↓
 *              autoFit(双击自适应)
 * ```
 *
 * 与其他组件协作：
 * - RowColManager: 获取/设置实际的行列尺寸
 * - Viewport: 坐标转换和命中测试
 * - RenderEngine: 绘制参考线和更新光标
 *
 * @class ResizeStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see MouseStrategy - 低优先级的鼠标交互策略
 */
export class ResizeStrategy extends EventStrategy {
    priority = STRATEGY_PRIORITY.RESIZE_LAYOUT;

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

    /**
     * 光标悬停检测
     *
     * 光标所有权机制：
     * - 设置光标时 return false 阻止低优先级策略覆盖
     * - 仅在本策略曾设置光标时才清除，避免误清其他策略的光标
     */
    #handleHover(e) {
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

    #onMouseUp(e) {
        if (!this.#resizing) return;
        this.#resizing = false;
        this.#resizeType = null;
        this.#resizeIndex = -1;
        this.#clearResizeLine();
        this.handler.render();
    }

    #clearResizeLine() {
        if (this.handler.viewport) {
            this.handler.viewport.clearResizeLine();
        }
    }
}
