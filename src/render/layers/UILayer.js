/**
 * UI 层 (UILayer)
 *
 * 负责渲染 Excel 的辅助 UI 元素，
 * 包括冻结分割线和调试信息面板。
 *
 * ## 渲染内容
 *
 * ### 冻结分割线
 * 当工作表配置了冻结行列时，在冻结区域边界绘制绿色分割线：
 * - 垂直线：冻结列右边界（x = headerW + frozenColsW）
 * - 水平线：冻结行下边界（y = headerH + frozenRowsH）
 * - 颜色：#217346（Excel 经典绿）
 * - 线宽：2px
 *
 * ### 调试信息面板（debugMode）
 * 开启后在画布左上角红色文字显示各图层的运行状态：
 * - 图层数量
 * - 每层的名称、zIndex、脏状态、渲染次数
 *
 * ## 图层定位
 *
 * zIndex = 4，是所有图层中最顶层的。
 * 位于 HeaderLayer(3)、OverlayLayer(4) 之上。
 * 这保证了冻结线和调试信息始终在最上层可见。
 *
 * ## 设计原则
 *
 * UILayer 只渲染"装饰性"UI 元素，不涉及任何业务数据。
 * 其渲染内容不影响用户的交互判断（点击检测在其他层处理），
 * 因此放在最高层级不会遮挡关键信息的可访问性。
 *
 * @module render/layers/UILayer
 */

import { BaseLayer } from "../BaseLayer.js";

export class UILayer extends BaseLayer {
    constructor() {
        super("ui", 7);

        /** 是否开启调试模式，显示图层运行状态信息 */
        this.debugMode = false;
    }

    /**
     * 绑定响应式 Store，监听状态变化
     *
     * 监听的键：
     * - frozenOffset: 冻结偏移量变化 → 冻结分割线位置需要更新
     * - editor: 编辑器状态变化 → 可能需要更新调试信息
     *
     * @param {import("../../store/ReactiveStore").ReactiveStore} store - 响应式存储
     */
    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("frozenOffset");
        this.watchForDirty("editor");
    }

    /**
     * 渲染 UI 层
     *
     * 按优先级依次渲染：
     * 1. 冻结分割线（如果存在冻结区域）
     * 2. 调试信息面板（如果 debugMode 开启）
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("../ViewportTransform.js").ViewportTransform} viewport - 视口坐标转换器
     * @param {object} options - 渲染选项
     * @param {number} options.viewW - 视口宽度
     * @param {number} options.viewH - 视口高度
     * @param {Array} [options.layers] - 所有图层列表（debugMode 使用）
     */
    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const frozenColsW = sheet.frozenColsWidth;
        const frozenRowsH = sheet.frozenRowsHeight;
        const viewW = options.viewW;
        const viewH = options.viewH;

        if (frozenColsW > 0 || frozenRowsH > 0) {
            this.#renderFreezeLines(ctx, headerW, headerH, frozenColsW, frozenRowsH, viewW, viewH);
        }

        if (this.debugMode) {
            this.#renderDebugInfo(ctx, sheet, viewport, options);
        }

        this.renderCount++;
    }

    /**
     * 渲染冻结分割线
     *
     * 在冻结区域边界绘制 Excel 风格的绿色分割线：
     * - 垂直线：从表头底部延伸到画布底部
     * - 水平线：从表头右侧延伸到画布右侧
     * - 两线交叉形成 L 形（同时有冻结行和列时）
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} headerW - 行号头宽度
     * @param {number} headerH - 列标头高度
     * @param {number} frozenColsW - 冻结列总宽度
     * @param {number} frozenRowsH - 冻结行总高度
     * @param {number} viewW - 视口宽度
     * @param {number} viewH - 视口高度
     */
    #renderFreezeLines(ctx, headerW, headerH, frozenColsW, frozenRowsH, viewW, viewH) {
        ctx.save();
        ctx.strokeStyle = "#217346";
        ctx.lineWidth = 2;

        if (frozenColsW > 0) {
            const x = headerW + frozenColsW;
            ctx.beginPath();
            ctx.moveTo(x, headerH);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        }

        if (frozenRowsH > 0) {
            const y = headerH + frozenRowsH;
            ctx.beginPath();
            ctx.moveTo(headerW, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * 渲染调试信息面板
     *
     * 在画布左上角用红色等宽字体显示各图层的实时状态，
     * 用于开发阶段排查渲染问题。
     *
     * 显示内容包括：
     * - 图层总数
     * - 每层的名称、zIndex、脏/净状态、累计渲染次数
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("../ViewportTransform.js").ViewportTransform} viewport - 视口坐标转换器
     * @param {object} options - 渲染选项
     * @param {Array<BaseLayer>} [options.layers] - 所有图层实例列表
     */
    #renderDebugInfo(ctx, sheet, viewport, options) {
        const layers = options.layers || [];

        ctx.save();
        ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
        ctx.font = "12px monospace";

        let y = 20;
        ctx.fillText(`[UILayer Debug] Total Layers: ${layers.length}`, 10, y);

        for (const layer of layers) {
            y += 16;
            const info = layer.getDebugInfo();
            const status = layer.dirty ? "DIRTY" : "CLEAN";
            ctx.fillText(`  ${info.name} (z:${info.zIndex}) ${status} renders:${layer.renderCount}`, 10, y);
        }

        ctx.restore();
    }
}