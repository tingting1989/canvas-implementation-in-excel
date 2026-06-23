import { CONFIG } from "../constants/config";
import { HIT_TYPE } from "../constants/hitType";

/**
 * 调整手柄渲染器
 *
 * 负责列宽/行高拖拽调整时虚线参考线的状态管理与绘制。
 * 作为 HeaderRenderer 的子模块独立存在，遵循单一职责原则。
 */
export class ResizeHandleRenderer {
    /** @type {{type: string, index: number, position: number}|null} 调整线状态 */
    #resizeLine = null;

    /**
     * 设置调整线状态
     * @param {string|null} type - HIT_TYPE.COL_RESIZE / HIT_TYPE.ROW_RESIZE / null(清除)
     * @param {number} index - 被调整的行/列索引
     * @param {number} position - 调整线在 canvas 上的像素位置
     */
    setResizeLine(type, index, position) {
        this.#resizeLine = type ? { type, index, position } : null;
    }

    /** 清除调整线状态 */
    clearResizeLine() {
        this.#resizeLine = null;
    }

    /** 获取当前调整线状态 */
    getResizeLine() {
        return this.#resizeLine;
    }

    /**
     * 绘制调整线虚线
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     */
    render(ctx, viewW, viewH) {
        if (!this.#resizeLine) return;

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);

        if (this.#resizeLine.type === HIT_TYPE.COL_RESIZE) {
            const x = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        } else {
            const y = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }
}