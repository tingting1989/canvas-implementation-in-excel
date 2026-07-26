import { CanvasContext } from "./CanvasContext.js";

/**
 * 基于 RenderEngine 的 CanvasContext 实现
 *
 * 将 Canvas DOM 访问和渲染触发委托给 RenderEngine，
 * 是 CanvasContext 抽象接口的具体实现之一。
 *
 * ## 设计动机
 *
 * 策略（Strategy）和编辑器（Editor）需要访问 Canvas 宿主和触发渲染，
 * 但不应直接依赖 RenderEngine（避免与渲染引擎耦合）。
 * 通过 CanvasContext 接口解耦：
 * - 策略通过 canvasContext.canvas 设置鼠标光标样式
 * - 编辑器通过 canvasContext.canvasParent 挂载 DOM 元素
 * - 编辑器通过 canvasContext.render(sheet) 触发重绘
 *
 * @see CanvasContext 基类定义了 canvas / canvasParent / render 三个抽象接口
 * @see RenderEngine 实际的渲染引擎，提供 Canvas 元素和渲染能力
 */
export class RenderEngineCanvasContext extends CanvasContext {
    /** @type {import("./RenderEngine.js").RenderEngine} 被委托的渲染引擎实例 */
    #renderEngine;

    /**
     * @param {import("./RenderEngine.js").RenderEngine} renderEngine - 渲染引擎实例
     */
    constructor(renderEngine) {
        super();
        this.#renderEngine = renderEngine;
    }

    /**
     * 获取 Canvas 元素引用
     *
     * 策略通过此属性设置鼠标光标样式（如 canvas.style.cursor = "grab"）。
     *
     * @returns {HTMLCanvasElement | null}
     * @override
     */
    get canvas() {
        return this.#renderEngine.canvas;
    }

    /**
     * 获取 Canvas 的父元素
     *
     * 编辑器通过此属性将 DOM 元素挂载到 Canvas 容器中
     * （如 canvasParent.appendChild(editorEl)）。
     *
     * @returns {HTMLElement | null}
     * @override
     */
    get canvasParent() {
        return this.#renderEngine.canvas?.parentElement ?? null;
    }

    /**
     * 触发渲染
     *
     * 编辑器在提交值后调用此方法触发重绘，
     * 使单元格内容更新立即反映到画布上。
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 要渲染的工作表
     * @override
     */
    render(sheet) {
        this.#renderEngine.render(sheet);
    }
}
