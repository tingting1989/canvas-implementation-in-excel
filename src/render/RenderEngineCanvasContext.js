import { CanvasContext } from "./CanvasContext.js";

/**
 * 基于 RenderEngine 的 CanvasContext 实现
 *
 * 将 Canvas DOM 访问和渲染触发委托给 RenderEngine。
 * 策略和编辑器通过此服务访问 Canvas 宿主和渲染控制，而非直接引用 RenderEngine。
 */
export class RenderEngineCanvasContext extends CanvasContext {
    /** @type {import("./RenderEngine.js").RenderEngine} */
    #renderEngine;

    /**
     * @param {import("./RenderEngine.js").RenderEngine} renderEngine
     */
    constructor(renderEngine) {
        super();
        this.#renderEngine = renderEngine;
    }

    get canvas() {
        return this.#renderEngine.canvas;
    }

    get canvasParent() {
        return this.#renderEngine.canvas?.parentElement ?? null;
    }

    render(sheet) {
        this.#renderEngine.render(sheet);
    }
}
